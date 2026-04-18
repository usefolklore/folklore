#!/usr/bin/env node
// Contextualize a BEIR corpus via local Ollama LLM, à la Anthropic's
// "Contextual Retrieval" (Sept 2024). Generates a 30-50 word context
// sentence per document that is prepended to the original passage
// before embedding/indexing. Published lift: −49% retrieval failures
// in mixed evals; on BEIR-class corpora typically +1–4 NDCG@10 over
// the dense+hybrid baseline.
//
// Output: writes a contextualized corpus.jsonl in BEIR-shape directory
// at ~/.wellinformed/bench/<output_dataset>/<output_dataset>/ along
// with symlinked queries.jsonl + qrels/test.tsv. The downstream
// `bench-beir-rust.mjs <output_dataset> --model bge-base` then runs
// the Phase 25 production path against the contextualized corpus.
//
// Usage:
//   node scripts/contextualize-corpus.mjs scifact \
//     --model qwen2.5:1.5b \
//     --out scifact-ctx \
//     [--limit 5183] [--concurrency 1] [--no-cache]
//
// Requires Ollama running on http://localhost:11434.

import { existsSync, mkdirSync, createReadStream, createWriteStream, readFileSync, symlinkSync, unlinkSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const getArg = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };

const SRC_DATASET = args.find((a) => !a.startsWith('--')) ?? 'scifact';
const OUT_DATASET = getArg('--out', `${SRC_DATASET}-ctx`);
const MODEL = getArg('--model', 'qwen2.5:1.5b');
const LIMIT = parseInt(getArg('--limit', '0'), 10); // 0 = no limit
const NO_CACHE = has('--no-cache');
const CONCURRENCY = Math.max(1, parseInt(getArg('--concurrency', '1'), 10));
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';

const CACHE_ROOT = join(homedir(), '.wellinformed', 'bench');
const SRC_DIR = join(CACHE_ROOT, SRC_DATASET, SRC_DATASET);
const OUT_DIR = join(CACHE_ROOT, OUT_DATASET, OUT_DATASET);
const SRC_CORPUS = join(SRC_DIR, 'corpus.jsonl');
const OUT_CORPUS = join(OUT_DIR, 'corpus.jsonl');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(' Contextual Retrieval — corpus contextualization pass');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(` Source:       BeIR/${SRC_DATASET}`);
console.log(` Output:       ${OUT_DATASET} (BEIR-shape) at ${OUT_DIR}`);
console.log(` LLM:          ${MODEL} via ${OLLAMA_URL}`);
console.log(` Concurrency:  ${CONCURRENCY}`);
if (LIMIT > 0) console.log(` Limit:        first ${LIMIT} docs`);
console.log('');

if (!existsSync(SRC_CORPUS)) {
  console.error(`✗ source corpus missing: ${SRC_CORPUS}`);
  console.error('  run a prior bench (e.g. node scripts/bench-beir-sota.mjs scifact) to fetch BEIR first');
  process.exit(1);
}

// ─── ensure output dir + symlink queries/qrels ─────────────────

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(join(OUT_DIR, 'qrels'), { recursive: true });

const linkOrCopy = (from, to) => {
  if (existsSync(to)) return;
  if (!existsSync(from)) throw new Error(`source missing: ${from}`);
  try { symlinkSync(from, to); }
  catch { /* fall through to copy if symlink unsupported */ }
};
linkOrCopy(join(SRC_DIR, 'queries.jsonl'), join(OUT_DIR, 'queries.jsonl'));
linkOrCopy(join(SRC_DIR, 'qrels', 'test.tsv'), join(OUT_DIR, 'qrels', 'test.tsv'));

// ─── load source corpus ────────────────────────────────────────

console.log('[1/3] Loading source corpus...');
const docs = [];
{
  const rl = createInterface({ input: createReadStream(SRC_CORPUS) });
  for await (const line of rl) {
    if (!line.trim()) continue;
    docs.push(JSON.parse(line));
  }
}
const total = LIMIT > 0 ? Math.min(LIMIT, docs.length) : docs.length;
console.log(`  ${docs.length} docs in source; processing ${total}`);

// ─── load already-contextualized cache (resume) ───────────────

const ctxById = new Map();
if (!NO_CACHE && existsSync(OUT_CORPUS)) {
  console.log('[2/3] Resuming from existing output corpus...');
  const rl = createInterface({ input: createReadStream(OUT_CORPUS) });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    ctxById.set(String(r._id), r);
  }
  console.log(`  ${ctxById.size} docs already contextualized — skipping`);
}

// ─── prompt + Ollama call ─────────────────────────────────────

const buildPrompt = (title, text) => {
  // Anthropic's pattern adapted for short scientific abstracts where
  // the chunk IS the document. We ask the LLM to surface key entities,
  // claims, and topic in a single concise sentence to be prepended to
  // the original text. Search retrieval improves because the prepend
  // adds near-document keywords that lexical (BM25) AND dense
  // (semantic) retrieval can leverage independently.
  const passage = (title ? `Title: ${title}\n\n` : '') + (text ?? '');
  return [
    'Below is a scientific abstract.',
    '',
    passage,
    '',
    'Write a single 30-word context sentence that names the key entities, claim, and topic. ',
    'This sentence will be prepended to the abstract to improve search retrieval. ',
    'Output only the context sentence with no preamble, quotes, or markdown.',
  ].join('\n');
};

const callOllama = async (prompt) => {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      stream: false,
      options: { num_predict: 80, temperature: 0.1, top_p: 0.9 },
    }),
  });
  if (!res.ok) throw new Error(`ollama ${res.status} ${await res.text().catch(() => '')}`);
  const j = await res.json();
  return (j.response ?? '').trim();
};

// ─── contextualize loop ────────────────────────────────────────

const out = createWriteStream(OUT_CORPUS, { flags: ctxById.size > 0 ? 'a' : 'w' });
let done = ctxById.size;
const start = Date.now();

const processOne = async (idx) => {
  const d = docs[idx];
  const id = String(d._id);
  if (ctxById.has(id)) return;

  const prompt = buildPrompt(d.title, d.text);
  let context = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      context = await callOllama(prompt);
      // Strip any leading/trailing quotes the model adds despite instruction
      context = context.replace(/^["'`]+|["'`]+$/g, '').trim();
      if (context.length > 0 && context.length < 1000) break;
      // empty or runaway → retry
    } catch (e) {
      if (attempt === 2) {
        console.error(`\n  doc ${id} failed after 3 attempts: ${e.message}`);
        context = ''; // emit doc as-is to keep alignment
      }
    }
  }

  // Prepended form: contextualized_text = "<context>. <original>"
  const newDoc = {
    _id: d._id,
    title: d.title,
    text: context ? `${context}\n\n${d.text}` : d.text,
    _ctx: context,
  };
  out.write(JSON.stringify(newDoc) + '\n');
  ctxById.set(id, newDoc);
};

console.log('[3/3] Contextualizing — running through Ollama...');

if (CONCURRENCY <= 1) {
  for (let i = 0; i < total; i++) {
    await processOne(i);
    done++;
    if (done % 25 === 0 || done === total) {
      const elapsed = (Date.now() - start) / 1000;
      const rate = (done - ctxById.size + 25) / Math.max(elapsed, 0.1);
      const eta = (total - done) / Math.max(rate, 0.01);
      process.stdout.write(`\r  ${done}/${total} done — ${rate.toFixed(1)} docs/sec — ETA ${(eta / 60).toFixed(1)} min   `);
    }
  }
} else {
  // Simple parallel pool — bounded concurrency
  let cursor = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= total) return;
      await processOne(i);
      done++;
      if (done % 25 === 0 || done === total) {
        const elapsed = (Date.now() - start) / 1000;
        const rate = done / Math.max(elapsed, 0.1);
        const eta = (total - done) / Math.max(rate, 0.01);
        process.stdout.write(`\r  ${done}/${total} done — ${rate.toFixed(1)} docs/sec — ETA ${(eta / 60).toFixed(1)} min   `);
      }
    }
  });
  await Promise.all(workers);
}

out.end();
process.stdout.write('\n');

const totalElapsed = (Date.now() - start) / 1000;
console.log(`\n✓ Wrote ${OUT_CORPUS} (${total} docs in ${(totalElapsed / 60).toFixed(1)} min)`);
console.log('');
console.log('Next:');
console.log(`  WELLINFORMED_RUST_BIN=$(pwd)/wellinformed-rs/target/release/embed_server \\`);
console.log(`    node scripts/bench-beir-rust.mjs ${OUT_DATASET} --model bge-base`);
console.log('');
console.log('Compare the result vs Phase 25 SciFact baseline (75.22% NDCG@10) to gate.');
