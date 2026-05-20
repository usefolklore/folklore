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
 * strings. We collapse to the set of source SESSIONS — wellinformed
 * indexes one node per session, not per turn, so session-level
 * evidence is the right granularity.
 *
 * Optional LLM extractor (env-gated, off by default):
 *   WELLINFORMED_BENCH_LLM_EXTRACTOR=1 swaps the containment metric
 *   for a real Ollama Phi-4-mini extracted answer scored via
 *   SQuAD-style F1. Wired here as a stub — the extractor itself is a
 *   Phase 23.8 follow-up. With the flag off (default) we report the
 *   pure-compute harmonic-mean dimension.
 *
 * Environment contract:
 *
 *   WELLINFORMED_BENCH_PUBLIC_REAL=1
 *     Master gate; off by default.
 *
 *   LOCOMO_DIR=/path/to/locomo
 *     Directory containing:
 *         locomo10.json    (10 conversations, ~200 factual QA pairs)
 *     Get it via:
 *         git clone https://github.com/snap-research/locomo $LOCOMO_DIR/repo
 *         cp $LOCOMO_DIR/repo/data/locomo10.json $LOCOMO_DIR/
 *
 *   WELLINFORMED_BENCH_OUT=/path/to/report.jsonl   (optional)
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
import { indexNode, searchByRoom } from '../src/application/use-cases.js';
import { llmExtractorFromEnv } from '../src/infrastructure/llm-extractor.js';
import { squadF1, squadExactMatch } from '../src/domain/llm-extractor.js';
import type { BenchSuiteReport } from '../src/domain/bench-types.js';
import type { Room } from '../src/domain/graph.js';

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
    for (const turn of turns) {
      if (typeof turn !== 'object' || turn === null) continue;
      const t = turn as LocomoTurn;
      const speaker = (t.speaker ?? '').toString().trim();
      const content = ((t.text ?? t.dia ?? '') as string).replace(/\s+/g, ' ').trim();
      if (content.length === 0) continue;
      parts.push(speaker.length > 0 ? `${speaker}: ${content.slice(0, 1000)}` : content.slice(0, 1000));
    }
    const summary = parts.join('\n');
    if (summary.length === 0) continue;

    out.push({
      nodeId: `${sampleTag}/${key}`,
      sessionTag,
      summary,
      fetchedAt,
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

test('bench: real LoCoMo factual harmonic-mean F1', { timeout: 60 * 60 * 1000 }, async (t) => {
  if (process.env.WELLINFORMED_BENCH_PUBLIC_REAL !== '1') {
    t.skip('WELLINFORMED_BENCH_PUBLIC_REAL not set — skipping real-corpus suite');
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
  const useLlmExtractor = process.env.WELLINFORMED_BENCH_LLM_EXTRACTOR === '1';
  const extractor = useLlmExtractor ? llmExtractorFromEnv() : null;
  if (useLlmExtractor && extractor === null) {
    t.skip('WELLINFORMED_BENCH_LLM_EXTRACTOR=1 but no extractor resolvable from env (set WELLINFORMED_OLLAMA_URL or WELLINFORMED_BENCH_LLM_EXTRACTOR_FIXTURE=1)');
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

  let totalContainment = 0;
  let totalEvidenceHits = 0;
  let totalSquadF1 = 0;
  let totalSquadEm = 0;
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
        const r = await indexNode({ graphs, vectors, embedder })({
          node: {
            id: s.nodeId,
            label: s.summary.slice(0, 120),
            file_type: 'document',
            source_file: s.nodeId,
            source_uri: `session://${s.nodeId}`,
            room: ROOM,
            summary: s.summary.slice(0, 400),
            fetched_at: s.fetchedAt,
          },
          text: s.summary,
          room: ROOM,
        });
        if (r.isErr()) throw new Error(`index ${s.nodeId}: ${JSON.stringify(r.error)}`);
      }

      const sessionTextByNode = new Map(sessions.map((s) => [s.nodeId, s.summary]));

      for (let qIdx = 0; qIdx < factualQa.length; qIdx++) {
        const q = factualQa[qIdx];
        const r = await searchByRoom({ graphs, vectors, embedder })({
          room: ROOM,
          text: q.question,
          k: K,
        });
        if (r.isErr()) throw new Error(`search ${sIdx}.${qIdx}: ${JSON.stringify(r.error)}`);

        const retrievedNodeIds = r.value.map((m) => m.node_id as string);
        const retrievedTags = new Set(
          retrievedNodeIds.map((id) => nodeIdToTag.get(id) ?? '').filter((t) => t.length > 0),
        );
        const retrievedText = retrievedNodeIds
          .map((id) => sessionTextByNode.get(id) ?? '')
          .filter((x) => x.length > 0)
          .join(' ');

        const goldTags = evidenceToSessionTags(q.evidence);
        const evidenceFound = goldTags.size > 0 && [...goldTags].every((tag) => retrievedTags.has(tag));
        const goldAnswer = toAnswerString(q.answer);
        const containment = answerTokenContainment(retrievedText, goldAnswer);

        totalContainment += containment;
        if (evidenceFound) totalEvidenceHits++;
        totalQ++;

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
  // when the extractor was wired in (`WELLINFORMED_BENCH_LLM_EXTRACTOR=1`).
  const extractorMetrics: Record<string, number> = extractor
    ? {
        squadF1: meanSquadF1,
        squadExactMatch: meanSquadEm,
      }
    : {};

  const report: BenchSuiteReport = {
    suite: 'locomo-real',
    metrics: {
      locomoFactualF1: dimensionScore,
      evidenceRecall,
      answerTokenContainment: meanContainment,
      scoredQuestions: totalQ,
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
    notes: `Real LoCoMo factual subset (categories 1/2/3) — ${dataset.length} conversations × ${totalQ} questions via Xenova all-MiniLM-L6-v2 (fp32, mean-pooled, 512 max_len). Harmonic mean of evidence-session recall and answer-token containment in top-${K} retrieved sessions. Replaces the 4-persona synthetic proxy.${extractor ? ` LLM extractor: ${extractor.model} (SQuAD-F1 / EM reported alongside).` : ''}`,
  };

  if (process.env.WELLINFORMED_BENCH_OUT) {
    appendFileSync(process.env.WELLINFORMED_BENCH_OUT, JSON.stringify(report) + '\n');
  }

  console.log(`bench locomo-real: dimension=${dimensionScore.toFixed(4)} (evidence-recall=${evidenceRecall.toFixed(3)}, containment=${meanContainment.toFixed(3)}) over ${totalQ} questions in ${(elapsedMs / 1000).toFixed(1)}s`);
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
  // WELLINFORMED_BENCH_LLM_EXTRACTOR=1 path (squadF1 metric, reported
  // alongside but NOT used as the floor here).
  // Floor set 7pp below measured baseline; tighten if pipeline
  // improvements push it higher.
  assert.ok(
    dimensionScore >= 0.28,
    `LoCoMo-real dimension regressed below 0.28 floor: ${dimensionScore.toFixed(4)} (evidence-recall=${evidenceRecall.toFixed(3)}, containment=${meanContainment.toFixed(3)})`,
  );
});
