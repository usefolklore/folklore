/**
 * Benchmark — real BEIR SciFact, NDCG@10 (Phase 23.7).
 *
 * Replaces the 30-doc labeled corpus in `bench-real.test.ts` which
 * served as the SciFact proxy during Phases 21-23. This adapter reads
 * the actual SciFact release (5,183 documents × 300 test queries) and
 * scores NDCG@10 against the published qrels with the same scorer
 * the proxy used (`ndcgAtK` from `src/domain/eval-metrics.ts`).
 *
 * The metric key emitted (`beirSciFactNdcg10`) maps directly onto the
 * composite weights table — when this suite runs on the Hetzner box,
 * the composite runner replaces the proxy value with the real one.
 *
 * Environment contract (all required to run; otherwise the test is
 * skipped — keeps CI fast):
 *
 *   WELLINFORMED_BENCH_PUBLIC_REAL=1
 *     The master gate. Off by default.
 *
 *   BEIR_SCIFACT_DIR=/path/to/scifact
 *     Directory containing the standard BEIR SciFact layout:
 *         corpus.jsonl              (5,183 lines — {_id, title, text})
 *         queries.jsonl             (1,109 lines — {_id, text})
 *         qrels/test.tsv            (339 lines — header + 300 q-doc pairs)
 *     Get it via `wget -O - https://public.ukp.informatik.tu-darmstadt.de/thakur/BEIR/datasets/scifact.zip | bsdtar -xf-`.
 *
 *   WELLINFORMED_BENCH_OUT=/path/to/report.jsonl   (optional)
 *     If set, the suite appends one BenchSuiteReport JSON line so the
 *     composite runner can pick it up.
 *
 * Embedder: real Xenova all-MiniLM-L6-v2 (384-dim, mean-pooled, fp32).
 * No fixture, no topic vectors — this is the "real" adapter.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, appendFileSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { fileGraphRepository } from '../src/infrastructure/graph-repository.js';
import { openSqliteVectorIndex } from '../src/infrastructure/vector-index.js';
import { xenovaEmbedder, batchingEmbedder } from '../src/infrastructure/embedders.js';
import { indexNode, searchByRoom } from '../src/application/use-cases.js';
import { ndcgAtK, recallAtK, reciprocalRank } from '../src/domain/eval-metrics.js';
import type { BenchSuiteReport } from '../src/domain/bench-types.js';
import type { Room } from '../src/domain/graph.js';

const ROOM = 'scifact' as Room;
const DIM = 384;
const K = 10;

interface ScifactDoc {
  readonly _id: string;
  readonly title?: string;
  readonly text: string;
}

interface ScifactQuery {
  readonly _id: string;
  readonly text: string;
}

const readJsonlStream = async <T>(path: string): Promise<T[]> => {
  const out: T[] = [];
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    out.push(JSON.parse(trimmed) as T);
  }
  return out;
};

/**
 * Parse a BEIR qrels TSV: `query-id\tcorpus-id\tscore`. The header is
 * present in the official release — skip the first line. Score > 0
 * counts as relevant under binary relevance (BEIR SciFact qrels are
 * already binary; this is defensive).
 */
const readQrels = (path: string): Map<string, Set<string>> => {
  const text = readFileSync(path, 'utf8');
  const lines = text.split('\n');
  const out = new Map<string, Set<string>>();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0) continue;
    const [qid, did, scoreStr] = line.split('\t');
    if (qid === undefined || did === undefined) continue;
    const score = Number(scoreStr ?? '1');
    if (!Number.isFinite(score) || score <= 0) continue;
    let set = out.get(qid);
    if (!set) {
      set = new Set();
      out.set(qid, set);
    }
    set.add(did);
  }
  return out;
};

test('bench: real BEIR SciFact NDCG@10', { timeout: 24 * 60 * 60 * 1000 }, async (t) => {
  if (process.env.WELLINFORMED_BENCH_PUBLIC_REAL !== '1') {
    t.skip('WELLINFORMED_BENCH_PUBLIC_REAL not set — skipping real-corpus suite');
    return;
  }
  const dir = process.env.BEIR_SCIFACT_DIR;
  if (!dir) {
    t.skip('BEIR_SCIFACT_DIR not set — see suite header for layout');
    return;
  }
  const corpusPath = join(dir, 'corpus.jsonl');
  const queriesPath = join(dir, 'queries.jsonl');
  const qrelsPath = join(dir, 'qrels', 'test.tsv');
  for (const p of [corpusPath, queriesPath, qrelsPath]) {
    if (!existsSync(p)) {
      t.skip(`missing ${p} — see suite header for expected layout`);
      return;
    }
  }

  const t0 = performance.now();
  const home = mkdtempSync(join(tmpdir(), 'wi-bench-scifact-real-'));

  try {
    const [corpus, queriesAll] = await Promise.all([
      readJsonlStream<ScifactDoc>(corpusPath),
      readJsonlStream<ScifactQuery>(queriesPath),
    ]);
    const qrels = readQrels(qrelsPath);

    // Keep only test queries (those that appear in qrels).
    const queries = queriesAll.filter((q) => qrels.has(q._id));
    assert.ok(queries.length > 0, `no test queries matched qrels — got ${queriesAll.length} queries, ${qrels.size} qrels keys`);

    const graphs = fileGraphRepository(join(home, 'graph.json'));
    const vecRes = await openSqliteVectorIndex({ path: join(home, 'vectors.db'), dim: DIM });
    if (vecRes.isErr()) throw new Error(JSON.stringify(vecRes.error));
    const vectors = vecRes.value;

    // 384-dim all-MiniLM-L6-v2 with 512 max_length (model's true ceiling).
    const embedder = batchingEmbedder(
      xenovaEmbedder({ model: 'Xenova/all-MiniLM-L6-v2', dim: DIM, maxLength: 512, pooling: 'mean', quantized: false }),
      { maxBatch: 32 },
    );

    // ─── index corpus ───
    const tIndex0 = performance.now();
    let indexed = 0;
    for (const d of corpus) {
      const text = d.title ? `${d.title}. ${d.text}` : d.text;
      const r = await indexNode({ graphs, vectors, embedder })({
        node: {
          id: d._id,
          label: (d.title ?? d.text).slice(0, 120),
          file_type: 'document',
          source_file: `scifact/${d._id}`,
          source_uri: `scifact://${d._id}`,
          room: ROOM,
        },
        text,
        room: ROOM,
      });
      if (r.isErr()) throw new Error(`index ${d._id}: ${JSON.stringify(r.error)}`);
      indexed++;
      if (indexed % 500 === 0) {
        const ips = (indexed / ((performance.now() - tIndex0) / 1000)).toFixed(1);
        console.log(`  index ${indexed}/${corpus.length} (${ips} doc/s)`);
      }
    }
    const indexMs = performance.now() - tIndex0;

    // ─── score queries ───
    const tScore0 = performance.now();
    let sumNdcg10 = 0;
    let sumRecall10 = 0;
    let sumMrr = 0;
    const perQuery: { id: string; metric: string; value: number }[] = [];

    for (const q of queries) {
      const r = await searchByRoom({ graphs, vectors, embedder })({
        room: ROOM,
        text: q.text,
        k: K,
      });
      if (r.isErr()) throw new Error(`search ${q._id}: ${JSON.stringify(r.error)}`);
      const retrieved = r.value.map((m) => m.node_id as string);
      const relevant = qrels.get(q._id) ?? new Set<string>();

      const ndcg = ndcgAtK(retrieved, relevant, K);
      const r10 = recallAtK(retrieved, relevant, K);
      const rr = reciprocalRank(retrieved, relevant);

      sumNdcg10 += ndcg;
      sumRecall10 += r10;
      sumMrr += rr;

      perQuery.push({ id: q._id, metric: 'ndcg10', value: ndcg });
    }
    const scoreMs = performance.now() - tScore0;

    const ndcg10 = sumNdcg10 / queries.length;
    const recall10 = sumRecall10 / queries.length;
    const mrr = sumMrr / queries.length;
    const elapsedMs = performance.now() - t0;

    const report: BenchSuiteReport = {
      suite: 'beir-scifact-real',
      metrics: {
        beirSciFactNdcg10: ndcg10,
        ndcg10,
        recall10,
        mrr,
        indexedDocs: corpus.length,
        scoredQueries: queries.length,
        indexMs,
        scoreMs,
      },
      perQuery,
      elapsedMs,
      notes: `Real BEIR SciFact — ${corpus.length} docs × ${queries.length} test queries via Xenova all-MiniLM-L6-v2 (fp32, mean-pooled, 512 max_len). Replaces the 30-doc labeled proxy.`,
    };

    if (process.env.WELLINFORMED_BENCH_OUT) {
      appendFileSync(process.env.WELLINFORMED_BENCH_OUT, JSON.stringify(report) + '\n');
    }

    console.log(`bench scifact-real: NDCG@10=${ndcg10.toFixed(4)} R@10=${recall10.toFixed(4)} MRR=${mrr.toFixed(4)} (n=${queries.length}) in ${(elapsedMs / 1000).toFixed(1)}s`);
    console.log(`  index ${corpus.length} docs in ${(indexMs / 1000).toFixed(1)}s, score ${queries.length} queries in ${(scoreMs / 1000).toFixed(1)}s`);

    // BEIR SciFact SOTA via SPLADE/ColBERTv2 ≈ 0.75 NDCG@10. all-MiniLM-L6-v2
    // published baseline is ≈ 0.42 NDCG@10 (sentence-transformers v2 paper,
    // table 2). Our pipeline adds hybrid lexical+vector + PPR rerank, so
    // we expect to land in the 0.45-0.55 range. Floor set conservatively;
    // tightening is a Phase 23.8 follow-up after the first real run.
    assert.ok(
      ndcg10 >= 0.30,
      `SciFact NDCG@10 regressed below 0.30 floor: ${ndcg10.toFixed(4)}`,
    );

    vectors.close();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
