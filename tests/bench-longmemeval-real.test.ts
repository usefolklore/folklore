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
import { rerankMatches } from '../src/domain/cross-rerank.js';
import { crossEncoderFromEnv } from '../src/infrastructure/cross-encoder.js';
import { enrichText, isContextualEnrichEnabled } from '../src/domain/contextual-enrich.js';
import type { BenchSuiteReport } from '../src/domain/bench-types.js';
import type { Room } from '../src/domain/graph.js';
import type { Match } from '../src/domain/vectors.js';

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

test('bench: real LongMemEval-S oracle Recall@5', { timeout: 24 * 60 * 60 * 1000 }, async (t) => {
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

  // E1' (Phase 23.9): opt-in cross-encoder rerank in the bench path.
  // Set `WELLINFORMED_RERANK=1` to activate; `WELLINFORMED_RERANK_MODEL`
  // chooses the reranker (default `Xenova/ms-marco-MiniLM-L-6-v2`; swap
  // to `Xenova/bge-reranker-base` for NLI-trained domain match).
  // When active, we over-retrieve K*4 candidates from the hybrid stage
  // and let the cross-encoder rerank the top-20 head down to the
  // reported top-K. Off path is unchanged.
  const reranker = crossEncoderFromEnv();
  const RERANK_HEAD = 20;
  // T1 diagnostic (Phase 23.10): always fetch deep enough to compute
  // R@5 / R@10 / R@20 / R@50 from a single retrieval pass. Lets us
  // diagnose head saturation — if R@20 ≈ R@5 ≈ baseline 0.92, the
  // gold is concentrated in the head and rerank cannot lift recall.
  // If R@50 jumps materially over R@20, the candidate pool has more
  // gold and a wider rerank window (or write-path lift) could
  // surface it. Pure observability — adds ~30 ms per query of
  // additional sqlite-vec depth, no model cost.
  const RECALL_KS = [5, 10, 20, 50] as const;
  const KMAX = Number(process.env.WELLINFORMED_BENCH_LME_KMAX ?? 50);
  const overRetrieveK = Math.max(KMAX, reranker ? RERANK_HEAD : 5);
  if (reranker) {
    console.log(`  cross-encoder rerank ON · model=${process.env.WELLINFORMED_RERANK_MODEL ?? 'Xenova/ms-marco-MiniLM-L-6-v2'} · over-retrieve k=${overRetrieveK} → rerank top-${RERANK_HEAD} → final K=${K}`);
  }

  // E11 (Phase 23.9): rule-based contextual enrichment — write-path.
  // When `WELLINFORMED_BENCH_CONTEXTUAL_ENRICH=1`, prepend
  // `[date: ...] [session: ...]` to every session's text BEFORE
  // embedding so the bi-encoder vector latches onto date / session-id
  // signal — targets multi-session and temporal-reasoning headroom.
  // Participants on LME are always {user, assistant} so we skip that
  // field (no signal); date comes from `haystack_dates`.
  const enrichOn = isContextualEnrichEnabled();
  if (enrichOn) {
    console.log(`  contextual enrichment ON · prepending [date] [session] [participants] to each haystack session before embedding`);
  }

  let sumR5 = 0;
  let sumMrr = 0;
  // T1 diagnostic accumulators — recall at multiple K values from the
  // same retrieval pass, plus per-type breakdown at R@5 / R@50 (the
  // two head-saturation diagnostic anchors).
  const sumRK: Record<number, number> = Object.fromEntries(RECALL_KS.map((k) => [k, 0]));
  const perTypeRK: Record<string, { hits: Record<number, number>; total: number }> = {};
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

      // Map node-id → full session text, used by the optional cross-
      // encoder rerank's docTextOf callback. Built during indexing so
      // we don't re-render turn lists on every query.
      const sessionTextByNode = new Map<string, string>();

      // Index every haystack session as one node.
      for (let s = 0; s < q.haystack_session_ids.length; s++) {
        const sid = q.haystack_session_ids[s];
        const turns = q.haystack_sessions[s];
        if (!sid || !Array.isArray(turns) || turns.length === 0) continue;
        const rawText = sessionToText(turns);
        if (rawText.length === 0) continue;
        const date = q.haystack_dates?.[s];
        // Collect unique speaker roles (LME has 'user' / 'assistant');
        // when enrichment is off, this is unused.
        const participants = enrichOn
          ? Array.from(new Set(turns.map((t) => String(t.role ?? '').toLowerCase()).filter((r) => r.length > 0)))
          : undefined;
        const indexedText = enrichOn
          ? enrichText(rawText, { date, sessionId: sid, participants })
          : rawText;
        sessionTextByNode.set(sid, indexedText);
        const r = await indexNode({ graphs, vectors, embedder })({
          node: {
            id: sid,
            label: rawText.slice(0, 120),
            file_type: 'document',
            source_file: sid,
            source_uri: `session://${sid}`,
            room: ROOM,
            summary: rawText.slice(0, 400),
            fetched_at: date ?? '2026-05-19T00:00:00Z',
          },
          text: indexedText,
          room: ROOM,
        });
        if (r.isErr()) throw new Error(`index ${sid}: ${JSON.stringify(r.error)}`);
      }

      const r0 = await searchByRoom({ graphs, vectors, embedder })({
        room: ROOM,
        text: q.question,
        k: overRetrieveK,
      });
      if (r0.isErr()) throw new Error(`search ${q.question_id}: ${JSON.stringify(r0.error)}`);
      let head: readonly Match[] = r0.value;
      if (reranker) {
        const docTextOf = (m: Match): string | undefined =>
          sessionTextByNode.get(m.node_id as string);
        const rerankRes = await rerankMatches(q.question, head, docTextOf, reranker, { headSize: RERANK_HEAD });
        head = rerankRes.isOk() ? rerankRes.value : head;
      }
      // Full retrieved list (KMAX-deep) for the T1 multi-K diagnostic.
      // The reranker (when ON) only reshuffles the top-RERANK_HEAD; the
      // tail past 20 stays in bi-encoder order, which is exactly what
      // we want for the R@50 diagnostic — measure the bi-encoder's
      // candidate-pool quality without rerank influence on positions
      // 21-50.
      const retrievedFull = head.map((m) => m.node_id as string);
      const retrieved = retrievedFull.slice(0, K);
      const relevant = new Set(q.answer_session_ids);

      const r5 = recallAtK(retrieved, relevant, K);
      const rr = reciprocalRank(retrieved, relevant);
      sumR5 += r5;
      sumMrr += rr;
      perQuery.push({ id: q.question_id, metric: 'R@5', value: r5 });

      // T1 diagnostic — recall at the full ladder from one retrieval call.
      const rkPerQ: Record<number, number> = {};
      for (const k of RECALL_KS) {
        const rk = recallAtK(retrievedFull, relevant, k);
        sumRK[k] += rk;
        rkPerQ[k] = rk;
      }

      const bucket = perType[q.question_type] ?? { hits: 0, total: 0 };
      bucket.hits += r5;
      bucket.total += 1;
      perType[q.question_type] = bucket;

      // Per-type ladder so we can see whether head saturation is
      // type-specific (e.g. temporal queries may have a flat ladder
      // — gold simply isn't in the candidate pool at all — while
      // single-session-assistant may saturate at K=5).
      const tbucket = perTypeRK[q.question_type] ?? { hits: Object.fromEntries(RECALL_KS.map((k) => [k, 0])), total: 0 };
      for (const k of RECALL_KS) tbucket.hits[k] += rkPerQ[k];
      tbucket.total += 1;
      perTypeRK[q.question_type] = tbucket;

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
  // T1 diagnostic ladder averaged across all questions.
  const rkAvg: Record<number, number> = Object.fromEntries(
    RECALL_KS.map((k) => [k, sumRK[k] / dataset.length]),
  );
  const elapsedMs = performance.now() - t0;

  const report: BenchSuiteReport = {
    suite: 'longmemeval-real',
    metrics: {
      longmemevalRecall5: r5,
      recall5: r5,
      mrr,
      scoredQuestions: dataset.length,
      // T1 ladder — recall at multiple K values from one retrieval pass.
      // Head-saturation diagnostic: if r20 ≈ r5, the head is full and
      // reranking it can't help; the lever is changing what enters
      // the candidate pool, not what's reranked inside it.
      recall10: rkAvg[10],
      recall20: rkAvg[20],
      recall50: rkAvg[50],
      ...Object.fromEntries(Object.entries(perType).map(([k, v]) => [
        `r5_${k}`, v.total > 0 ? v.hits / v.total : 0,
      ])),
      // Per-type R@50 — flat ladder by type (e.g. r5≈r50 on temporal
      // means gold isn't in the candidate pool at all for that type;
      // a steep ladder means it's in the tail and a wider rerank
      // window would help).
      ...Object.fromEntries(Object.entries(perTypeRK).map(([k, v]) => [
        `r50_${k}`, v.total > 0 ? v.hits[50] / v.total : 0,
      ])),
    },
    perQuery,
    elapsedMs,
    notes: `Real LongMemEval-S split=${splitName} — ${dataset.length} questions × per-question haystacks via Xenova all-MiniLM-L6-v2 (fp32, mean-pooled, 512 max_len). Source: ${datasetPath}. Rerank=${reranker ? (process.env.WELLINFORMED_RERANK_MODEL ?? 'Xenova/ms-marco-MiniLM-L-6-v2') : 'off'} (over-retrieve k=${overRetrieveK}, head=${RERANK_HEAD}, final K=${K}). Enrich=${enrichOn ? 'on (date+session+participants prefix)' : 'off'}. T1 diagnostic: R@5/10/20/50 from a single KMAX=${KMAX} retrieval pass. Replaces the 20-session synthetic proxy.`,
  };

  if (process.env.WELLINFORMED_BENCH_OUT) {
    appendFileSync(process.env.WELLINFORMED_BENCH_OUT, JSON.stringify(report) + '\n');
  }

  console.log(`bench longmemeval-real: R@5=${r5.toFixed(4)} R@10=${rkAvg[10].toFixed(4)} R@20=${rkAvg[20].toFixed(4)} R@50=${rkAvg[50].toFixed(4)} MRR=${mrr.toFixed(4)} (n=${dataset.length}) in ${(elapsedMs / 1000).toFixed(1)}s`);
  for (const [tname, v] of Object.entries(perType)) {
    const ladder = perTypeRK[tname];
    const r50t = ladder ? (ladder.hits[50] / ladder.total).toFixed(3) : '-';
    const r20t = ladder ? (ladder.hits[20] / ladder.total).toFixed(3) : '-';
    const r10t = ladder ? (ladder.hits[10] / ladder.total).toFixed(3) : '-';
    console.log(`  ${tname.padEnd(28)} R@5=${(v.hits / v.total).toFixed(3)}  R@10=${r10t}  R@20=${r20t}  R@50=${r50t}  (n=${v.total})`);
  }

  // agentmemory claims ~95% Recall@5 on the public benchmark with
  // their full pipeline + reranker. wellinformed retrieves with
  // hybrid lex+vec + PPR but no LLM reranker on this path, so we
  // expect 0.55-0.75 here. Floor set conservatively; tighten in 23.8.
  assert.ok(r5 >= 0.40, `LongMemEval-real R@5 regressed below 0.40 floor: ${r5.toFixed(4)}`);
});
