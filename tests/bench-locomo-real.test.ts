/**
 * Benchmark — real LoCoMo factual subset, harmonic-mean F1 (Phase 23.7).
 *
 * Replaces the 4-persona / 40-session synthetic fixture in
 * `bench-locomo-synth.test.ts` with the actual snap-research/locomo
 * dataset (EMNLP 2024). Same scorer: harmonic mean of evidence-recall
 * + answer-token-containment in top-3 retrieved evidence. The token-
 * F1-on-full-summary metric is intentionally NOT used — see the synth
 * suite header for the length-mismatch precision bug history.
 *
 * Factual subset: questions where `category ∈ {1, 2, 3}` —
 *   1 = single-hop, 2 = multi-hop, 3 = temporal reasoning.
 * Categories 4 (open-domain) and 5 (adversarial) are excluded; both
 * require an LLM judge to score fairly and don't belong in the
 * retrieval-only dimension.
 *
 * Per LoCoMo convention, `evidence` is a list of `"D<session>:<turn>"`
 * strings. We collapse to the set of source SESSIONS — akashik
 * indexes one node per session, not per turn, so session-level
 * evidence is the right granularity.
 *
 * Optional LLM extractor (env-gated, off by default):
 *   AKASHIK_BENCH_LLM_EXTRACTOR=1 swaps the containment metric
 *   for a real Ollama Phi-4-mini extracted answer scored via
 *   SQuAD-style F1. Wired here as a stub — the extractor itself is a
 *   Phase 23.8 follow-up. With the flag off (default) we report the
 *   pure-compute harmonic-mean dimension.
 *
 * Environment contract:
 *
 *   AKASHIK_BENCH_PUBLIC_REAL=1
 *     Master gate; off by default.
 *
 *   LOCOMO_DIR=/path/to/locomo
 *     Directory containing:
 *         locomo10.json    (10 conversations, ~200 factual QA pairs)
 *     Get it via:
 *         git clone https://github.com/snap-research/locomo $LOCOMO_DIR/repo
 *         cp $LOCOMO_DIR/repo/data/locomo10.json $LOCOMO_DIR/
 *
 *   AKASHIK_BENCH_OUT=/path/to/report.jsonl   (optional)
 *     Composite-runner sink.
 *
 * Embedder: real Xenova all-MiniLM-L6-v2 (no fixture).
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { fileGraphRepository } from '../src/infrastructure/graph-repository.js';
import { openSqliteVectorIndex } from '../src/infrastructure/vector-index.js';
import { xenovaEmbedder, batchingEmbedder } from '../src/infrastructure/embedders.js';
import { indexNode, searchGlobal } from '../src/application/use-cases.js';
import { llmExtractorFromEnv } from '../src/infrastructure/llm-extractor.js';
import { squadF1, squadExactMatch } from '../src/domain/llm-extractor.js';
import { rerankMatches } from '../src/domain/cross-rerank.js';
import { crossEncoderFromEnv } from '../src/infrastructure/cross-encoder.js';
import { rerankMatchesListwise } from '../src/domain/llm-listwise-rerank.js';
import { listwiseScorerFromEnv } from '../src/infrastructure/llm-listwise-rerank.js';
import { ndcgAtK, reciprocalRank } from '../src/domain/eval-metrics.js';
import { enrichText, isContextualEnrichEnabled } from '../src/domain/contextual-enrich.js';
import type { BenchSuiteReport } from '../src/domain/bench-types.js';
import type { Room } from '../src/domain/graph.js';
import type { Match } from '../src/domain/vectors.js';

const ROOM = 'locomo' as Room;
const DIM = 384;
const K = 3;
const FACTUAL_CATEGORIES = new Set([1, 2, 3]);

interface LocomoTurn {
  readonly speaker?: string;
  readonly text?: string;
  readonly dia?: string;
}

interface LocomoQa {
  readonly question: string;
  /** Real LoCoMo answers can be string | number | date — coerce via `toAnswerString` at the call site. */
  readonly answer: unknown;
  readonly evidence?: readonly string[];
  readonly category?: number;
  readonly adversarial_answer?: unknown;
}

interface LocomoSample {
  readonly sample_id?: string;
  readonly conversation: Readonly<Record<string, unknown>>;
  readonly qa: readonly LocomoQa[];
}

// ─────────────── conversation parsing ─────────────

interface ParsedSession {
  readonly nodeId: string;        // e.g. `${sample_id}/session_1`
  readonly sessionTag: string;    // e.g. `D1` — what evidence refs use
  readonly summary: string;
  readonly fetchedAt: string;
  /** Distinct speaker names in this session — fed into E11 contextual enrichment. */
  readonly participants: readonly string[];
}

/**
 * Pull the ordered list of `session_N` keys out of a conversation
 * object, returning each as a flat text blob plus the LoCoMo tag (`D1`,
 * `D2`, …) that evidence strings reference.
 */
const parseSessions = (sample: LocomoSample): ParsedSession[] => {
  const conv = sample.conversation;
  const sampleTag = sample.sample_id ?? 'sample';
  // session keys follow `session_N`; date keys `session_N_date_time`.
  const sessionKeys = Object.keys(conv)
    .filter((k) => /^session_\d+$/.test(k))
    .sort((a, b) => Number(a.slice('session_'.length)) - Number(b.slice('session_'.length)));

  const out: ParsedSession[] = [];
  for (const key of sessionKeys) {
    const idx = Number(key.slice('session_'.length));
    const sessionTag = `D${idx}`;
    const turns = conv[key];
    const dateRaw = conv[`${key}_date_time`];
    const fetchedAt = typeof dateRaw === 'string' && dateRaw.length > 0
      ? dateRaw
      : '2026-05-19T00:00:00Z';
    if (!Array.isArray(turns)) continue;

    const parts: string[] = [];
    const speakerSet = new Set<string>();
    for (const turn of turns) {
      if (typeof turn !== 'object' || turn === null) continue;
      const t = turn as LocomoTurn;
      const speaker = (t.speaker ?? '').toString().trim();
      const content = ((t.text ?? t.dia ?? '') as string).replace(/\s+/g, ' ').trim();
      if (content.length === 0) continue;
      if (speaker.length > 0) speakerSet.add(speaker);
      parts.push(speaker.length > 0 ? `${speaker}: ${content.slice(0, 1000)}` : content.slice(0, 1000));
    }
    const summary = parts.join('\n');
    if (summary.length === 0) continue;

    out.push({
      nodeId: `${sampleTag}/${key}`,
      sessionTag,
      summary,
      fetchedAt,
      participants: Array.from(speakerSet),
    });
  }
  return out;
};

/**
 * `D1:5` → `D1`. We score evidence at session granularity (one node
 * per session). Empty / malformed entries are dropped.
 */
const evidenceToSessionTags = (evidence: readonly string[] | undefined): Set<string> => {
  const out = new Set<string>();
  if (!evidence) return out;
  for (const ev of evidence) {
    if (typeof ev !== 'string') continue;
    const colon = ev.indexOf(':');
    const tag = (colon >= 0 ? ev.slice(0, colon) : ev).trim();
    if (tag.length > 0) out.add(tag);
  }
  return out;
};

// ─────────────── token containment scorer (same as synth suite) ─────────────

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'was', 'were',
  'have', 'has', 'had', 'are', 'her', 'his', 'him', 'she', 'they',
  'their', 'them', 'into', 'than', 'who', 'what', 'when', 'where',
  'how', 'why', 'which', 'will', 'all', 'any', 'one', 'two', 'three',
  'but', 'not', 'out', 'over', 'about', 'also', 'some', 'more',
]);

/**
 * Coerce arbitrary input to a string for token extraction. Real LoCoMo
 * answers occasionally arrive as numbers, dates, or short arrays in
 * the JSON; the synthetic adapter declared `answer: string` but the
 * upstream dataset is loosely typed, so we defensively stringify
 * rather than crash. `null` / `undefined` map to `""`; arrays are
 * joined with spaces; everything else gets `String(...)`.
 */
const toAnswerString = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map((x) => toAnswerString(x)).join(' ');
  return String(v);
};

const keyTokens = (s: unknown): Set<string> => {
  const out = new Set<string>();
  const str = toAnswerString(s);
  for (const t of str.toLowerCase().split(/[^a-z0-9]+/)) {
    if (t.length > 2 && !STOPWORDS.has(t)) out.add(t);
  }
  return out;
};

const answerTokenContainment = (retrievedText: unknown, goldAnswer: unknown): number => {
  const gold = keyTokens(goldAnswer);
  if (gold.size === 0) return 0;
  const retrieved = keyTokens(retrievedText);
  let hits = 0;
  for (const t of gold) if (retrieved.has(t)) hits++;
  return hits / gold.size;
};

const harmonicMean = (a: number, b: number): number => {
  if (a <= 0 || b <= 0) return 0;
  return (2 * a * b) / (a + b);
};

// ─────────────── runner ─────────────

test('bench: real LoCoMo factual harmonic-mean F1', { timeout: 24 * 60 * 60 * 1000 }, async (t) => {
  if (process.env.AKASHIK_BENCH_PUBLIC_REAL !== '1') {
    t.skip('AKASHIK_BENCH_PUBLIC_REAL not set — skipping real-corpus suite');
    return;
  }
  const dir = process.env.LOCOMO_DIR;
  if (!dir) {
    t.skip('LOCOMO_DIR not set — see suite header for layout');
    return;
  }
  const filePath = join(dir, 'locomo10.json');
  if (!existsSync(filePath)) {
    t.skip(`missing ${filePath} — see suite header for download instructions`);
    return;
  }
  const useLlmExtractor = process.env.AKASHIK_BENCH_LLM_EXTRACTOR === '1';
  const extractor = useLlmExtractor ? llmExtractorFromEnv() : null;
  if (useLlmExtractor && extractor === null) {
    t.skip('AKASHIK_BENCH_LLM_EXTRACTOR=1 but no extractor resolvable from env (set AKASHIK_OLLAMA_URL or AKASHIK_BENCH_LLM_EXTRACTOR_FIXTURE=1)');
    return;
  }
  if (extractor) {
    console.log(`  LLM extractor enabled: ${extractor.model} — scoring with SQuAD-F1 alongside the harmonic-mean dimension.`);
  }

  const t0 = performance.now();
  const dataset = JSON.parse(readFileSync(filePath, 'utf8')) as readonly LocomoSample[];
  assert.ok(Array.isArray(dataset) && dataset.length > 0, `expected non-empty array in ${filePath}`);

  const embedder = batchingEmbedder(
    xenovaEmbedder({ model: 'Xenova/all-MiniLM-L6-v2', dim: DIM, maxLength: 512, pooling: 'mean', quantized: false }),
    { maxBatch: 32 },
  );

  // E1' (Phase 23.9): opt-in cross-encoder rerank in the bench path.
  // For LoCoMo evidence-recall (K=3) we still over-retrieve a wider
  // candidate window so the cross-encoder can reshape the top-3.
  const reranker = crossEncoderFromEnv();
  const listwiseScorer = listwiseScorerFromEnv();
  const RERANK_HEAD = Number(process.env.AKASHIK_RERANK_HEAD ?? (listwiseScorer ? 30 : 20));
  // Phase 23.13 — LoCoMo recall ladder. Always over-retrieve to KMAX
  // so we can compute evidence-recall at K=3 / 10 / 30 / 50 from one
  // pass, mirroring the LME-S T1 diagnostic. If R@30 ≈ R@3 the rerank
  // ceiling is structurally low (gold not in pool); if R@30 jumps
  // materially above R@3, there's recall headroom worth chasing.
  const RECALL_KS = [3, 10, 30, 50] as const;
  const KMAX = Number(process.env.AKASHIK_BENCH_LOCOMO_KMAX ?? 50);
  const overRetrieveK = Math.max(KMAX, (reranker || listwiseScorer) ? RERANK_HEAD : K);
  if (listwiseScorer) {
    console.log(`  LLM-listwise rerank ON · model=${listwiseScorer.model} · over-retrieve k=${overRetrieveK} → listwise head=${RERANK_HEAD} → final K=${K}`);
  } else if (reranker) {
    console.log(`  cross-encoder rerank ON · model=${process.env.AKASHIK_RERANK_MODEL ?? 'Xenova/ms-marco-MiniLM-L-6-v2'} · over-retrieve k=${overRetrieveK} → rerank top-${RERANK_HEAD} → final K=${K}`);
  }

  // E11 (Phase 23.9): rule-based contextual enrichment — write-path.
  // For LoCoMo we have rich metadata: per-session date_time, the LoCoMo
  // tag (D1/D2/...), and actual speaker names. All three signals get
  // folded into the index-time vector. The containment scorer below
  // operates on RAW session text (not enriched) so date / participant
  // tokens don't inflate token-overlap scores.
  const enrichOn = isContextualEnrichEnabled();
  if (enrichOn) {
    console.log(`  contextual enrichment ON · prepending [date] [session] [participants] to each session before embedding`);
  }

  let totalContainment = 0;
  let totalEvidenceHits = 0;
  let totalSquadF1 = 0;
  let totalSquadEm = 0;
  // Phase 23.13 — recall ladder accumulators (binary all-gold-in-top-K
  // per question, averaged across all factual QA pairs).
  const sumEvHitsK: Record<number, number> = Object.fromEntries(RECALL_KS.map((k) => [k, 0]));
  // Phase 23.15 — order-sensitive metric accumulators. Per the
  // octopus-discover synthesis (probe-synthesis-1779784750.md):
  // strict-all-gold R@K masks intra-list reordering — a rerank that
  // promotes gold from rank 29 to rank 4 scores 0 on R@3 but shows
  // up clearly in NDCG@K and MRR. We compute both alongside the
  // existing set-based metric so the bench can detect lift the
  // set-based path hides.
  const sumNdcgK: Record<number, number> = Object.fromEntries(RECALL_KS.map((k) => [k, 0]));
  let sumMrr = 0;
  let totalQ = 0;
  const perQuery: { id: string; metric: string; value: number }[] = [];
  const perCategory: Record<string, { sumContain: number; sumEv: number; sumF1: number; sumEm: number; n: number }> = {};

  for (let sIdx = 0; sIdx < dataset.length; sIdx++) {
    const sample = dataset[sIdx];
    const sessions = parseSessions(sample);
    if (sessions.length === 0) continue;
    const factualQa = sample.qa.filter((q) =>
      q.category !== undefined && FACTUAL_CATEGORIES.has(q.category),
    );
    if (factualQa.length === 0) continue;

    const home = mkdtempSync(join(tmpdir(), `wi-bench-locomo-${sIdx}-`));
    try {
      const graphs = fileGraphRepository(join(home, 'graph.json'));
      const vecRes = await openSqliteVectorIndex({ path: join(home, 'vectors.db'), dim: DIM });
      if (vecRes.isErr()) throw new Error(JSON.stringify(vecRes.error));
      const vectors = vecRes.value;

      // Map node-id back to session-tag so we can score evidence
      // recall after retrieval.
      const nodeIdToTag = new Map<string, string>();
      for (const s of sessions) {
        nodeIdToTag.set(s.nodeId, s.sessionTag);
        const indexedText = enrichOn
          ? enrichText(s.summary, {
              date: s.fetchedAt,
              sessionId: s.sessionTag,
              participants: s.participants,
            })
          : s.summary;
        const r = await indexNode({ graphs, vectors, embedder })({
          node: {
            id: s.nodeId,
            label: s.summary.slice(0, 120),
            file_type: 'document',
            source_file: s.nodeId,
            source_uri: `session://${s.nodeId}`,
            summary: s.summary.slice(0, 400),
            fetched_at: s.fetchedAt,
          },
          text: indexedText,
        });
        if (r.isErr()) throw new Error(`index ${s.nodeId}: ${JSON.stringify(r.error)}`);
      }

      const sessionTextByNode = new Map(sessions.map((s) => [s.nodeId, s.summary]));

      for (let qIdx = 0; qIdx < factualQa.length; qIdx++) {
        const q = factualQa[qIdx];
        const r0 = await searchGlobal({ graphs, vectors, embedder })({
          text: q.question,
          k: overRetrieveK,
        });
        if (r0.isErr()) throw new Error(`search ${sIdx}.${qIdx}: ${JSON.stringify(r0.error)}`);
        let head: readonly Match[] = r0.value;
        const docTextOf = (m: Match): string | undefined =>
          sessionTextByNode.get(m.node_id as string);
        if (listwiseScorer) {
          const rerankRes = await rerankMatchesListwise(q.question, head, docTextOf, listwiseScorer, { headSize: RERANK_HEAD });
          head = rerankRes.isOk() ? rerankRes.value : head;
        } else if (reranker) {
          const rerankRes = await rerankMatches(q.question, head, docTextOf, reranker, { headSize: RERANK_HEAD });
          head = rerankRes.isOk() ? rerankRes.value : head;
        }
        const topK: readonly Match[] = head.slice(0, K);
        const retrievedNodeIds = topK.map((m) => m.node_id as string);
        const retrievedTags = new Set(
          retrievedNodeIds.map((id) => nodeIdToTag.get(id) ?? '').filter((t) => t.length > 0),
        );
        const retrievedText = retrievedNodeIds
          .map((id) => sessionTextByNode.get(id) ?? '')
          .filter((x) => x.length > 0)
          .join(' ');

        const goldTags = evidenceToSessionTags(q.evidence);
        const evidenceFound = goldTags.size > 0 && [...goldTags].every((tag) => retrievedTags.has(tag));

        // Phase 23.13 recall ladder — strict-all-gold evidence-recall at
        // K=3 / 10 / 30 / 50 from the same (post-rerank-if-any) head.
        // When rerank is OFF, head = bi-encoder top-overRetrieveK, so
        // this measures the bi-encoder's raw candidate-pool recall.
        //
        // Phase 23.15 — order-sensitive metrics on the SAME head. The
        // retrieved tag sequence preserves rerank ordering, so NDCG@K
        // and MRR capture intra-list reordering that strict R@K can't.
        if (goldTags.size > 0) {
          const orderedTags = head
            .map((m) => nodeIdToTag.get(m.node_id as string) ?? '')
            .filter((t) => t.length > 0);
          for (const k of RECALL_KS) {
            const tagsK = new Set(orderedTags.slice(0, k));
            if ([...goldTags].every((tag) => tagsK.has(tag))) sumEvHitsK[k] += 1;
            sumNdcgK[k] += ndcgAtK(orderedTags, goldTags, k);
          }
          sumMrr += reciprocalRank(orderedTags, goldTags);
        }
        const goldAnswer = toAnswerString(q.answer);
        const containment = answerTokenContainment(retrievedText, goldAnswer);

        totalContainment += containment;
        if (evidenceFound) totalEvidenceHits++;
        totalQ++;

        // Phase 23.16 — fine-grained progress log for long-running
        // (LLM-listwise / cross-encoder) bench runs. Per-sample logs
        // arrive every ~70 questions which is too coarse when each
        // question costs 5-30 s; this logs every N questions so live
        // tailing on Hetzner / Mac shows the bench breathing.
        // Tunable via `AKASHIK_BENCH_PROGRESS_EVERY_N` (default 25).
        const PROGRESS_EVERY_N = Number(process.env.AKASHIK_BENCH_PROGRESS_EVERY_N ?? 25);
        if (totalQ % PROGRESS_EVERY_N === 0) {
          const r3 = sumEvHitsK[3] / totalQ;
          const ndcg3 = sumNdcgK[3] / totalQ;
          const mrrSoFar = sumMrr / totalQ;
          const qps = totalQ / ((performance.now() - t0) / 1000);
          console.log(`  progress n=${totalQ} R@3=${r3.toFixed(3)} NDCG@3=${ndcg3.toFixed(3)} MRR=${mrrSoFar.toFixed(3)} ev=${(totalEvidenceHits / totalQ).toFixed(3)} (${qps.toFixed(2)} q/s)`);
        }

        const qid = `${sample.sample_id ?? `s${sIdx}`}#q${qIdx}`;
        perQuery.push({ id: qid, metric: 'answer-token-containment', value: containment });

        // ─── opt-in LLM extractor + SQuAD-F1 scoring ───
        let qF1 = 0;
        let qEm = 0;
        if (extractor) {
          const exRes = await extractor.extract({ question: q.question, evidence: retrievedText });
          if (exRes.isErr()) {
            console.log(`  extract ${qid}: ${JSON.stringify(exRes.error)}`);
          } else {
            const predicted = exRes.value;
            qF1 = squadF1(predicted, goldAnswer);
            qEm = squadExactMatch(predicted, goldAnswer);
            totalSquadF1 += qF1;
            totalSquadEm += qEm;
            perQuery.push({ id: qid, metric: 'squad-f1', value: qF1 });
          }
        }

        const catKey = `cat${q.category ?? '?'}`;
        const bucket = perCategory[catKey] ?? { sumContain: 0, sumEv: 0, sumF1: 0, sumEm: 0, n: 0 };
        bucket.sumContain += containment;
        bucket.sumEv += evidenceFound ? 1 : 0;
        bucket.sumF1 += qF1;
        bucket.sumEm += qEm;
        bucket.n += 1;
        perCategory[catKey] = bucket;
      }

      vectors.close();
    } finally {
      rmSync(home, { recursive: true, force: true });
    }

    console.log(`  sample ${sIdx + 1}/${dataset.length} done — running n=${totalQ}, evidence=${(totalEvidenceHits / Math.max(1, totalQ)).toFixed(3)}, contain=${(totalContainment / Math.max(1, totalQ)).toFixed(3)}`);
  }

  const meanContainment = totalQ > 0 ? totalContainment / totalQ : 0;
  const evidenceRecall = totalQ > 0 ? totalEvidenceHits / totalQ : 0;
  const dimensionScore = harmonicMean(meanContainment, evidenceRecall);
  const meanSquadF1 = totalQ > 0 ? totalSquadF1 / totalQ : 0;
  const meanSquadEm = totalQ > 0 ? totalSquadEm / totalQ : 0;
  const elapsedMs = performance.now() - t0;

  // The composite-feeding metric (`locomoFactualF1`) stays the pure-
  // compute harmonic-mean dimension — that's the contract for the
  // composite runner across machines without an LLM available. The
  // SQuAD-F1 / EM are reported alongside for mem0-comparable numbers
  // when the extractor was wired in (`AKASHIK_BENCH_LLM_EXTRACTOR=1`).
  const extractorMetrics: Record<string, number> = extractor
    ? {
        squadF1: meanSquadF1,
        squadExactMatch: meanSquadEm,
      }
    : {};

  // Phase 23.13 recall ladder — strict-all-gold evidence-recall at
  // K=3 / 10 / 30 / 50. Set-based metric; rerank within the head
  // affects at-K ordering but NOT membership in the larger pool.
  const evrecallK: Record<number, number> = Object.fromEntries(
    RECALL_KS.map((k) => [k, totalQ > 0 ? sumEvHitsK[k] / totalQ : 0]),
  );
  // Phase 23.15 — order-sensitive aggregates. Both numerators are
  // summed over the same `totalQ` denominator as the set metrics, so
  // ladders are directly comparable across the two metric families.
  const ndcgK: Record<number, number> = Object.fromEntries(
    RECALL_KS.map((k) => [k, totalQ > 0 ? sumNdcgK[k] / totalQ : 0]),
  );
  const mrr = totalQ > 0 ? sumMrr / totalQ : 0;

  const report: BenchSuiteReport = {
    suite: 'locomo-real',
    metrics: {
      locomoFactualF1: dimensionScore,
      evidenceRecall,
      answerTokenContainment: meanContainment,
      scoredQuestions: totalQ,
      // Phase 23.13 recall ladder (set-based, strict-all-gold).
      evrecall3: evrecallK[3],
      evrecall10: evrecallK[10],
      evrecall30: evrecallK[30],
      evrecall50: evrecallK[50],
      // Phase 23.15 order-sensitive ladder + MRR. Catches intra-list
      // reordering improvements that the set-based ladder misses.
      ndcg3: ndcgK[3],
      ndcg10: ndcgK[10],
      ndcg30: ndcgK[30],
      ndcg50: ndcgK[50],
      mrr,
      ...extractorMetrics,
      ...Object.fromEntries(
        Object.entries(perCategory).map(([k, v]) => [
          `contain_${k}`, v.n > 0 ? v.sumContain / v.n : 0,
        ]),
      ),
      ...Object.fromEntries(
        Object.entries(perCategory).map(([k, v]) => [
          `evrecall_${k}`, v.n > 0 ? v.sumEv / v.n : 0,
        ]),
      ),
      ...(extractor
        ? Object.fromEntries(
            Object.entries(perCategory).map(([k, v]) => [
              `squadF1_${k}`, v.n > 0 ? v.sumF1 / v.n : 0,
            ]),
          )
        : {}),
    },
    perQuery,
    elapsedMs,
    notes: `Real LoCoMo factual subset (categories 1/2/3) — ${dataset.length} conversations × ${totalQ} questions via Xenova all-MiniLM-L6-v2 (fp32, mean-pooled, 512 max_len). Harmonic mean of evidence-session recall and answer-token containment in top-${K} retrieved sessions. Rerank=${listwiseScorer ? `llm-listwise:${listwiseScorer.model}` : (reranker ? (process.env.AKASHIK_RERANK_MODEL ?? 'Xenova/ms-marco-MiniLM-L-6-v2') : 'off')} (over-retrieve k=${overRetrieveK}, head=${RERANK_HEAD}, final K=${K}). Enrich=${enrichOn ? 'on (date+session+participants prefix, scoring on raw text)' : 'off'}. Replaces the 4-persona synthetic proxy.${extractor ? ` LLM extractor: ${extractor.model} (SQuAD-F1 / EM reported alongside).` : ''}`,
  };

  if (process.env.AKASHIK_BENCH_OUT) {
    appendFileSync(process.env.AKASHIK_BENCH_OUT, JSON.stringify(report) + '\n');
  }

  console.log(`bench locomo-real: dimension=${dimensionScore.toFixed(4)} (evidence-recall=${evidenceRecall.toFixed(3)}, containment=${meanContainment.toFixed(3)}) over ${totalQ} questions in ${(elapsedMs / 1000).toFixed(1)}s`);
  console.log(`  evidence-recall ladder (strict all-gold): R@3=${evrecallK[3].toFixed(3)} R@10=${evrecallK[10].toFixed(3)} R@30=${evrecallK[30].toFixed(3)} R@50=${evrecallK[50].toFixed(3)}`);
  console.log(`  order-sensitive ladder: NDCG@3=${ndcgK[3].toFixed(3)} NDCG@10=${ndcgK[10].toFixed(3)} NDCG@30=${ndcgK[30].toFixed(3)} NDCG@50=${ndcgK[50].toFixed(3)}  MRR=${mrr.toFixed(4)}`);
  if (extractor) {
    console.log(`  LLM extractor (${extractor.model}): SQuAD-F1=${meanSquadF1.toFixed(4)} EM=${meanSquadEm.toFixed(4)}`);
  }
  for (const [c, b] of Object.entries(perCategory)) {
    const f1Part = extractor ? `  f1=${(b.sumF1 / b.n).toFixed(3)}` : '';
    console.log(`  ${c.padEnd(8)} contain=${(b.sumContain / b.n).toFixed(3)}  ev=${(b.sumEv / b.n).toFixed(3)}${f1Part}  (n=${b.n})`);
  }

  // Floor calibrated against the first real-corpus run on the Hetzner
  // box (2026-05-20). Baseline measured:
  //   dimension          = 0.354
  //   evidence-recall    = 0.392  (strict — ALL gold sessions in top-3)
  //   answer-containment = 0.322  (proxy for downstream extraction)
  //   n                  = 699 factual QA pairs across 10 conversations
  // Real LoCoMo is far harder than the synthetic 4-persona corpus
  // (synth dim was 0.864) — gold evidence often spans 3+ sessions
  // and our K=3 retrieval can't fit them all. mem0's 92.5 composite
  // uses an LLM judge over LoCoMo's accuracy split, NOT this
  // retrieval-only dimension — direct comparison waits for the
  // AKASHIK_BENCH_LLM_EXTRACTOR=1 path (squadF1 metric, reported
  // alongside but NOT used as the floor here).
  // Floor set 7pp below measured baseline; tighten if pipeline
  // improvements push it higher.
  assert.ok(
    dimensionScore >= 0.28,
    `LoCoMo-real dimension regressed below 0.28 floor: ${dimensionScore.toFixed(4)} (evidence-recall=${evidenceRecall.toFixed(3)}, containment=${meanContainment.toFixed(3)})`,
  );
});
