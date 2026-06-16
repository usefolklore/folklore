#!/usr/bin/env node
// Offline SciFact-style retrieval-quality harness.
//
// Runs NDCG@10 + Recall@10 over a SMALL, COMMITTED, synthetic SciFact-style
// fixture (eval/fixtures/scifact-mini/) against the PRODUCTION Wave-2 hybrid
// pipeline (dense + SQLite FTS5 BM25, RRF-fused) — with ZERO network.
//
// Why this exists: every other bench-beir* runner needs (a) a BEIR .zip
// download and (b) a live HuggingFace embedding-model pull. Both are blocked
// in a sealed sandbox. This harness makes retrieval-quality changes MEASURABLE
// in-sandbox so a future model swap has a lever to pull, even when nothing can
// be fetched. It exercises the real production code path:
//   openSqliteVectorIndex(...).upsert({ vector, raw_text })  → vec0 + fts5
//   index.searchHybrid(rawQuery, queryVec, k)                → dense + BM25 RRF
//
// Embedder selection (printed explicitly in output):
//   1. If a Xenova sentence-embedding model is already cached locally, use it.
//   2. Otherwise fall back to a DETERMINISTIC in-repo hashed bag-of-words
//      embedder (no download). It is intentionally simple — it proves the
//      pipeline end-to-end and gives the dense arm lexical-overlap signal —
//      but it is NOT a real neural encoder, so absolute numbers are a floor,
//      not a ceiling. BM25/FTS5 is identical regardless of embedder, so the
//      hybrid fusion path is always exercised.
//
// Usage:
//   node bench/bench-scifact-offline.mjs            # human-readable
//   node bench/bench-scifact-offline.mjs --json     # machine-readable
//
// Requires a build first (imports compiled ../dist): npm run build

import { existsSync, readdirSync, readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { xenovaEmbedder } from '../dist/infrastructure/embedders.js';
import { openSqliteVectorIndex } from '../dist/infrastructure/vector-index.js';
import { normalize, DEFAULT_DIM } from '../dist/domain/vectors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FIXTURE_DIR = join(ROOT, 'eval', 'fixtures', 'scifact-mini');

const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const K = 10;
const DIM = DEFAULT_DIM; // 384 — matches both MiniLM and the hashed fallback

// ─────────────────────── fixture loading ───────────────────────
// BEIR JSONL/TSV loaders — same shape as bench-beir.mjs, but synchronous over
// the tiny committed fixture (no streaming needed at 40 docs).
const loadJsonl = (path) =>
  readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));

const corpusRaw = loadJsonl(join(FIXTURE_DIR, 'corpus.jsonl'));
const corpus = corpusRaw.map((r) => ({
  id: String(r._id),
  // Canonical BEIR doc text = title + ". " + text.
  text: (r.title ? r.title + '. ' : '') + (r.text ?? ''),
}));

const queriesRaw = loadJsonl(join(FIXTURE_DIR, 'queries.jsonl'));

const qrelsText = readFileSync(join(FIXTURE_DIR, 'qrels.tsv'), 'utf8');
const qrels = new Map();
for (const line of qrelsText.split('\n').slice(1)) {
  const parts = line.split('\t');
  if (parts.length < 3) continue;
  const [qid, docId, scoreStr] = parts;
  const score = parseInt(scoreStr, 10);
  if (score > 0) {
    if (!qrels.has(qid)) qrels.set(qid, new Map());
    qrels.get(qid).set(docId, score);
  }
}
const testQids = new Set(qrels.keys());
const queries = queriesRaw
  .filter((q) => testQids.has(String(q._id)))
  .map((q) => ({ id: String(q._id), text: q.text }));

// ─────────────────────── embedder selection ───────────────────────
// Probe for a locally cached Xenova sentence-embedding model. We only use the
// neural path if the ONNX weights are physically present on disk — otherwise
// xenovaEmbedder would try to fetch from the network (blocked) and fail.
const CANDIDATE_MODELS = [
  'Xenova/all-MiniLM-L6-v2', // 384-dim, matches DIM
];

const findCachedXenovaModel = () => {
  // transformers.js resolves models under <cacheDir>/<org>/<name>/onnx/*.onnx,
  // defaulting cacheDir to ~/.cache/huggingface (env.cacheDir) on this stack.
  const roots = [
    join(homedir(), '.cache', 'huggingface'),
    join(homedir(), '.cache', 'huggingface', 'hub'),
    process.env.TRANSFORMERS_CACHE,
    process.env.HF_HOME,
  ].filter(Boolean);

  for (const model of CANDIDATE_MODELS) {
    const [org, name] = model.split('/');
    for (const root of roots) {
      const dir = join(root, org, name);
      try {
        if (existsSync(join(dir, 'onnx')) && readdirSync(join(dir, 'onnx')).some((f) => f.endsWith('.onnx'))) {
          return model;
        }
      } catch {
        /* unreadable dir — skip */
      }
    }
  }
  return null;
};

// Deterministic hashed bag-of-words embedder. NOT a neural encoder. Tokens are
// hashed into DIM buckets with TF weighting; the vector is L2-normalized via the
// production `normalize` helper so it lands on the same unit sphere the dense
// index expects. Shared tokens → shared dims → cosine overlap, which gives the
// dense arm a real (if shallow) lexical-semantic signal — enough to make the
// fixture a meaningful retrieval task without any download.
const fnv1a = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};
const STOP = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'in', 'is', 'it',
  'of', 'on', 'or', 'that', 'the', 'to', 'with',
]);
const hashedEmbed = (text) => {
  const v = new Float32Array(DIM);
  const tokens = (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (t) => t.length > 2 && !STOP.has(t),
  );
  for (const t of tokens) {
    // Unigram + a light suffix bigram so morphological variants share a bucket.
    v[fnv1a(t) % DIM] += 1;
    if (t.length > 4) v[fnv1a(t.slice(0, t.length - 1)) % DIM] += 0.5;
  }
  return normalize(v); // unit-norm; zero-vector stays zero (normalize guards /0)
};

const hashedEmbedder = {
  dim: DIM,
  embed: (text) => Promise.resolve(hashedEmbed(text)),
  embedBatch: (texts) => Promise.resolve(texts.map(hashedEmbed)),
};

const cachedModel = findCachedXenovaModel();
let embedderName;
let embed; // (text) => Promise<Float32Array>
if (cachedModel) {
  const xv = xenovaEmbedder({ model: cachedModel, dim: DIM, maxLength: 512, pooling: 'mean' });
  embedderName = `${cachedModel} (cached ONNX, ${DIM}d)`;
  embed = async (text) => {
    const r = await xv.embed(text);
    if (r.isErr()) throw new Error(`embed failed: ${r.error}`);
    return r.value;
  };
} else {
  embedderName = `hashed-bow-fallback (deterministic, ${DIM}d, no model)`;
  embed = (text) => hashedEmbedder.embed(text);
}

// ─────────────────────── index + query (production path) ───────────────────────
const run = async () => {
  const dbDir = mkdtempSync(join(tmpdir(), 'scifact-offline-'));
  const dbPath = join(dbDir, 'vectors.db');

  const idxRes = await openSqliteVectorIndex({ path: dbPath, dim: DIM });
  if (idxRes.isErr()) throw new Error(`index open failed: ${idxRes.error}`);
  const index = idxRes.value;

  // Index: dense vector + raw_text (raw_text populates FTS5 so searchHybrid's
  // BM25 arm has content to match against).
  for (const doc of corpus) {
    const vec = await embed(doc.text);
    const up = await index.upsert({ node_id: doc.id, vector: vec, raw_text: doc.text });
    if (up.isErr()) throw new Error(`upsert ${doc.id} failed: ${up.error}`);
  }

  // Query via the PRODUCTION hybrid retriever — dense + BM25 RRF.
  const queryResults = new Map();
  for (const q of queries) {
    const qvec = await embed(q.text);
    const sRes = await index.searchHybrid(q.text, qvec, K);
    if (sRes.isErr()) throw new Error(`searchHybrid ${q.id} failed: ${sRes.error}`);
    queryResults.set(
      q.id,
      sRes.value.map((m) => ({ docId: m.node_id })),
    );
  }
  index.close();
  rmSync(dbDir, { recursive: true, force: true });

  // ─────────────────────── metrics ───────────────────────
  // Ported verbatim from bench-beir.mjs (binary-qrel NDCG/Recall) so the
  // numbers are computed identically to the canonical runners.
  const log2 = (x) => Math.log(x) / Math.LN2;
  const ndcgK = (ranked, rel, k) => {
    let dcg = 0;
    const topK = ranked.slice(0, k);
    for (let i = 0; i < topK.length; i++) {
      const r = rel.has(topK[i].docId) ? 1 : 0;
      dcg += r / log2(i + 2);
    }
    const numRel = Math.min(rel.size, k);
    let idcg = 0;
    for (let i = 0; i < numRel; i++) idcg += 1 / log2(i + 2);
    return idcg > 0 ? dcg / idcg : 0;
  };
  const recallK = (ranked, rel, k) => {
    const topK = ranked.slice(0, k);
    let hits = 0;
    for (const r of topK) if (rel.has(r.docId)) hits++;
    return rel.size > 0 ? hits / rel.size : 0;
  };
  const mrrOne = (ranked, rel) => {
    for (let i = 0; i < ranked.length; i++) if (rel.has(ranked[i].docId)) return 1 / (i + 1);
    return 0;
  };

  const acc = { ndcg10: [], r10: [], mrr: [] };
  for (const q of queries) {
    const ranked = queryResults.get(q.id) ?? [];
    const rel = qrels.get(q.id) ?? new Map();
    acc.ndcg10.push(ndcgK(ranked, rel, 10));
    acc.r10.push(recallK(ranked, rel, 10));
    acc.mrr.push(mrrOne(ranked, rel));
  }
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  return {
    fixture: 'eval/fixtures/scifact-mini (synthetic SciFact-style, NOT official BEIR)',
    pipeline: 'production hybrid (dense + FTS5 BM25, RRF k=60)',
    embedder: embedderName,
    corpus_size: corpus.length,
    query_count: queries.length,
    metrics: {
      ndcg_at_10: mean(acc.ndcg10),
      recall_at_10: mean(acc.r10),
      mrr: mean(acc.mrr),
    },
    network: 'none',
    timestamp: new Date().toISOString(),
  };
};

const result = await run();
const pct = (x) => (x * 100).toFixed(2) + '%';
const CAVEAT =
  'Synthetic 40-doc fixture, NOT official BEIR SciFact — numbers track relative change only, not comparable to the 72.30% leaderboard figure.';

if (JSON_OUT) {
  console.log(JSON.stringify({ ...result, caveat: CAVEAT }, null, 2));
} else {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' folklore — SciFact OFFLINE retrieval harness');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(` Fixture:  ${result.fixture}`);
  console.log(` Corpus:   ${result.corpus_size} passages`);
  console.log(` Queries:  ${result.query_count}`);
  console.log(` Pipeline: ${result.pipeline}`);
  console.log(` Embedder: ${result.embedder}`);
  console.log(` Network:  none`);
  console.log('');
  console.log(' Retrieval:');
  console.log(`   NDCG@10:   ${pct(result.metrics.ndcg_at_10)}`);
  console.log(`   Recall@10: ${pct(result.metrics.recall_at_10)}`);
  console.log(`   MRR:       ${result.metrics.mrr.toFixed(4)}`);
  console.log('');
  console.log(` Caveat: ${CAVEAT}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}
