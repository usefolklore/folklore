/**
 * Benchmark — real LongMemEval-S oracle split, Recall@5 (Phase 23.7).
 *
 * Replaces the 20-session synthetic fixture in
 * `bench-longmemeval-synth.test.ts` with the actual HuggingFace
 * dataset (`xiaowu0162/longmemeval`, ICLR 2025). The same scorer
 * (`recallAtK` from `src/domain/eval-metrics.ts`) is used so the
 * numbers are directly comparable to the synthetic floor.
 *
 * The oracle split bundles each question with its full haystack of
 * sessions — the easiest of the three splits, since irrelevant
 * sessions are already pruned to a small distractor set. We index
 * every haystack session per question, retrieve top-5 by the question
 * text, and score Recall@5 against `answer_session_ids` (gold
 * evidence). Aggregating over ~500 questions gives the metric.
 *
 * Why oracle (not S/M)? Oracle is small enough (~3 GB) to fit on the
 * Hetzner CAX11 (40 GB disk) without spilling tmpfs, and it stresses
 * retrieval quality without confounding with the haystack-scale
 * problem (S = 50 sessions/q, M = 500 sessions/q, oracle = ~10
 * sessions/q). The S/M splits become a follow-up once the oracle
 * baseline is locked.
 *
 * Environment contract:
 *
 *   WELLINFORMED_BENCH_PUBLIC_REAL=1
 *     Master gate; off by default.
 *
 *   LONGMEMEVAL_DIR=/path/to/longmemeval
 *     Directory containing:
 *         longmemeval_oracle.json    (the oracle split JSON)
 *     Get it via HuggingFace: `huggingface-cli download
 *     xiaowu0162/longmemeval longmemeval_oracle.json --local-dir $LONGMEMEVAL_DIR`.
 *
 *   WELLINFORMED_BENCH_OUT=/path/to/report.jsonl   (optional)
 *     Composite-runner sink — emits one BenchSuiteReport JSON line.
 *
 * Embedder: real Xenova all-MiniLM-L6-v2 (no fixture). Each question
 * gets a scratch graph + vector index since the haystack is
 * question-specific; we tear them down between questions to keep peak
 * disk bounded.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { fileGraphRepository } from '../src/infrastructure/graph-repository.js';
import { openSqliteVectorIndex } from '../src/infrastructure/vector-index.js';
import { xenovaEmbedder, batchingEmbedder } from '../src/infrastructure/embedders.js';
import { indexNode, searchByRoom } from '../src/application/use-cases.js';
import { recallAtK, reciprocalRank } from '../src/domain/eval-metrics.js';
import type { BenchSuiteReport } from '../src/domain/bench-types.js';
import type { Room } from '../src/domain/graph.js';

const ROOM = 'sessions' as Room;
const DIM = 384;
const K = 5;

interface LmeTurn {
  readonly role: string;
  readonly content: string;
}

interface LmeQuestion {
  readonly question_id: string;
  readonly question_type: string;
  readonly question: string;
  readonly answer?: string;
  readonly question_date?: string;
  readonly haystack_session_ids: readonly string[];
  readonly haystack_dates?: readonly string[];
  readonly haystack_sessions: readonly (readonly LmeTurn[])[];
  readonly answer_session_ids: readonly string[];
}

/**
 * Render a session (list of turns) into a single text blob for
 * embedding. Preserves role tags so question-style queries about who-
 * said-what still retrieve. Truncates each turn to keep the embedder
 * within its 512-token ceiling.
 */
const sessionToText = (turns: readonly LmeTurn[]): string => {
  const parts: string[] = [];
  for (const t of turns) {
    const role = (t.role ?? '').toLowerCase();
    const content = (t.content ?? '').replace(/\s+/g, ' ').trim();
    if (content.length === 0) continue;
    parts.push(`${role}: ${content.slice(0, 1000)}`);
  }
  return parts.join('\n');
};

test('bench: real LongMemEval-S oracle Recall@5', { timeout: 60 * 60 * 1000 }, async (t) => {
  if (process.env.WELLINFORMED_BENCH_PUBLIC_REAL !== '1') {
    t.skip('WELLINFORMED_BENCH_PUBLIC_REAL not set — skipping real-corpus suite');
    return;
  }
  // Two ways to point at a split:
  //   LONGMEMEVAL_FILE  — absolute path to any split's JSON (takes
  //                       precedence; lets the same adapter run
  //                       oracle / S / M without copy-renames)
  //   LONGMEMEVAL_DIR   — directory containing `longmemeval_oracle.json`
  //                       (default — oracle is the easiest split and
  //                       the original Phase 23.7 deliverable)
  const explicitFile = process.env.LONGMEMEVAL_FILE;
  const dir = process.env.LONGMEMEVAL_DIR;
  if (!explicitFile && !dir) {
    t.skip('LONGMEMEVAL_FILE or LONGMEMEVAL_DIR not set — see suite header for layout');
    return;
  }
  const datasetPath = explicitFile ?? join(dir as string, 'longmemeval_oracle.json');
  if (!existsSync(datasetPath)) {
    t.skip(`missing ${datasetPath} — see suite header for download instructions`);
    return;
  }
  // Split name derived from the filename — flows into the report
  // notes so any cross-split comparison stays honest.
  const splitName = datasetPath.match(/longmemeval_([a-z0-9]+)\.json$/)?.[1] ?? 'unknown';

  const t0 = performance.now();
  const dataset = JSON.parse(readFileSync(datasetPath, 'utf8')) as readonly LmeQuestion[];
  assert.ok(Array.isArray(dataset) && dataset.length > 0, `expected non-empty array in ${datasetPath}`);

  // One embedder reused across questions — the model loads once.
  const embedder = batchingEmbedder(
    xenovaEmbedder({ model: 'Xenova/all-MiniLM-L6-v2', dim: DIM, maxLength: 512, pooling: 'mean', quantized: false }),
    { maxBatch: 32 },
  );

  let sumR5 = 0;
  let sumMrr = 0;
  const perQuery: { id: string; metric: string; value: number }[] = [];
  const perType: Record<string, { hits: number; total: number }> = {};

  for (let i = 0; i < dataset.length; i++) {
    const q = dataset[i];
    const home = mkdtempSync(join(tmpdir(), `wi-bench-lme-${i}-`));
    try {
      const graphs = fileGraphRepository(join(home, 'graph.json'));
      const vecRes = await openSqliteVectorIndex({ path: join(home, 'vectors.db'), dim: DIM });
      if (vecRes.isErr()) throw new Error(JSON.stringify(vecRes.error));
      const vectors = vecRes.value;

      // Index every haystack session as one node.
      for (let s = 0; s < q.haystack_session_ids.length; s++) {
        const sid = q.haystack_session_ids[s];
        const turns = q.haystack_sessions[s];
        if (!sid || !Array.isArray(turns) || turns.length === 0) continue;
        const text = sessionToText(turns);
        if (text.length === 0) continue;
        const r = await indexNode({ graphs, vectors, embedder })({
          node: {
            id: sid,
            label: text.slice(0, 120),
            file_type: 'document',
            source_file: sid,
            source_uri: `session://${sid}`,
            room: ROOM,
            summary: text.slice(0, 400),
            fetched_at: q.haystack_dates?.[s] ?? '2026-05-19T00:00:00Z',
          },
          text,
          room: ROOM,
        });
        if (r.isErr()) throw new Error(`index ${sid}: ${JSON.stringify(r.error)}`);
      }

      const r = await searchByRoom({ graphs, vectors, embedder })({
        room: ROOM,
        text: q.question,
        k: K,
      });
      if (r.isErr()) throw new Error(`search ${q.question_id}: ${JSON.stringify(r.error)}`);
      const retrieved = r.value.map((m) => m.node_id as string);
      const relevant = new Set(q.answer_session_ids);

      const r5 = recallAtK(retrieved, relevant, K);
      const rr = reciprocalRank(retrieved, relevant);
      sumR5 += r5;
      sumMrr += rr;
      perQuery.push({ id: q.question_id, metric: 'R@5', value: r5 });

      const bucket = perType[q.question_type] ?? { hits: 0, total: 0 };
      bucket.hits += r5;
      bucket.total += 1;
      perType[q.question_type] = bucket;

      vectors.close();
    } finally {
      rmSync(home, { recursive: true, force: true });
    }

    if ((i + 1) % 25 === 0) {
      const r5avg = sumR5 / (i + 1);
      const eps = ((i + 1) / ((performance.now() - t0) / 1000)).toFixed(2);
      console.log(`  ${i + 1}/${dataset.length} done — running R@5=${r5avg.toFixed(4)} (${eps} q/s)`);
    }
  }

  const r5 = sumR5 / dataset.length;
  const mrr = sumMrr / dataset.length;
  const elapsedMs = performance.now() - t0;

  const report: BenchSuiteReport = {
    suite: 'longmemeval-real',
    metrics: {
      longmemevalRecall5: r5,
      recall5: r5,
      mrr,
      scoredQuestions: dataset.length,
      ...Object.fromEntries(Object.entries(perType).map(([k, v]) => [
        `r5_${k}`, v.total > 0 ? v.hits / v.total : 0,
      ])),
    },
    perQuery,
    elapsedMs,
    notes: `Real LongMemEval-S split=${splitName} — ${dataset.length} questions × per-question haystacks via Xenova all-MiniLM-L6-v2 (fp32, mean-pooled, 512 max_len). Source: ${datasetPath}. Replaces the 20-session synthetic proxy.`,
  };

  if (process.env.WELLINFORMED_BENCH_OUT) {
    appendFileSync(process.env.WELLINFORMED_BENCH_OUT, JSON.stringify(report) + '\n');
  }

  console.log(`bench longmemeval-real: R@5=${r5.toFixed(4)} MRR=${mrr.toFixed(4)} (n=${dataset.length}) in ${(elapsedMs / 1000).toFixed(1)}s`);
  for (const [tname, v] of Object.entries(perType)) {
    console.log(`  ${tname.padEnd(28)} R@5=${(v.hits / v.total).toFixed(3)} (n=${v.total})`);
  }

  // agentmemory claims ~95% Recall@5 on the public benchmark with
  // their full pipeline + reranker. wellinformed retrieves with
  // hybrid lex+vec + PPR but no LLM reranker on this path, so we
  // expect 0.55-0.75 here. Floor set conservatively; tighten in 23.8.
  assert.ok(r5 >= 0.40, `LongMemEval-real R@5 regressed below 0.40 floor: ${r5.toFixed(4)}`);
});
