/**
 * Benchmark — synthetic LoCoMo-style factual-recall (Phase 23.6).
 *
 * Mirrors the LoCoMo task structure (arxiv 2402.17753, EMNLP 2024)
 * without requiring the full snap-research/locomo dataset. The
 * synthetic fixture exercises the same axes the original benchmark
 * targets:
 *
 *   1. Long horizon — sessions span 6 simulated months
 *   2. Factual recall — answer is a discrete fact (name, number,
 *      date, place) extractable from one or two sessions
 *   3. Temporal/causal reasoning — "before X happened", "first time
 *      Y was mentioned", "what came after Z"
 *   4. Persona stability — 4 distinct personas with consistent
 *      attributes across the timeline
 *
 * Scoring (Phase 23.6.1 — fix for the length-mismatch precision bug):
 *
 * Two pure-compute signals combined, each in [0, 1]:
 *
 *   1. `evidenceRecall`        — fraction of declared ground-truth
 *      evidence sessions present in top-3 retrieved. Measures "did
 *      we find the right session(s)?"
 *
 *   2. `answerTokenContainment` — of the gold answer's KEY tokens
 *      (length > 2, stopword-filtered), what fraction appear anywhere
 *      in the top-3 retrieved evidence summaries? Measures "would a
 *      downstream extractor have the raw material to produce the
 *      answer?"
 *
 * Token-F1 over the FULL summary text vs short gold answer was
 * dropped because it's mathematically pinned tiny (long summary +
 * short gold = bad precision no matter how good retrieval is). That
 * mismatch is exactly why real LoCoMo / LongMemEval / SQuAD require
 * an LLM judge or a span extractor — they're measuring something
 * different.
 *
 * Composite dimension = harmonic mean of the two signals. Both must
 * be high for the bench to score well — finding the right session
 * but missing the answer tokens (or vice versa) drags the harmonic
 * mean down sharply.
 *
 * Opt-in LLM extractor (Phase 23.7+):
 *   set `AKASHIK_BENCH_LLM_EXTRACTOR=1` to swap the
 *   containment metric for a real Ollama Phi-4-mini extracted
 *   answer scored via SQuAD-style F1. Not wired in this turn —
 *   the scaffolding is documented in the suite registry.
 *
 * Acceptance: locomoFactualF1 ≥ 0.65 (harmonic mean threshold). The
 * number is set below mem0's 92.5 composite (mem0 uses a full
 * LoCoMo eval with LLM judge) because we're retrieval-only.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileGraphRepository } from '../src/infrastructure/graph-repository.js';
import { openSqliteVectorIndex } from '../src/infrastructure/vector-index.js';
import { fixtureEmbedder } from '../src/infrastructure/embedders.js';
import { indexNode, searchGlobal } from '../src/application/use-cases.js';
import type { BenchSuiteReport } from '../src/domain/bench-types.js';
import type { Room } from '../src/domain/graph.js';

const _ROOM = 'locomo' as Room;
const DIM = 384;

// ─────────────── synthetic 4-persona × 6-month corpus ─────────────

interface Session {
  readonly id: string;
  readonly persona: 'Alice' | 'Bob' | 'Cara' | 'Dan';
  readonly day: number;       // days since corpus start
  readonly summary: string;
}

const _PERSONAS = ['Alice', 'Bob', 'Cara', 'Dan'] as const;

/**
 * 40 sessions, ~10 per persona, spread across 180 days.
 * Each session is one node in the graph (label + summary). Summaries
 * are detailed enough to support factual retrieval and to differ
 * across persona+topic combos.
 */
const SESSIONS: readonly Session[] = [
  // ─── Alice — Berlin marathon training ─────────────
  { id: 'alice-d3',   persona: 'Alice', day: 3,   summary: 'Alice signed up for the Berlin marathon on day 3. Race date set for September 28. Training plan starts tomorrow with three short runs per week.' },
  { id: 'alice-d12',  persona: 'Alice', day: 12,  summary: 'Alice finished her first 5K training run in 28 minutes. Reports feeling good but notes mild knee soreness after the run.' },
  { id: 'alice-d40',  persona: 'Alice', day: 40,  summary: 'Alice bought her first proper running shoes — Asics Nimbus 25. Cost was 165 euros at the Friedrichshain store.' },
  { id: 'alice-d65',  persona: 'Alice', day: 65,  summary: 'Alice ran her first 10K on day 65, finishing in 58 minutes 12 seconds. Sunday morning run along the Spree river path.' },
  { id: 'alice-d90',  persona: 'Alice', day: 90,  summary: 'Alice completed a half marathon training run on day 90. Time 2 hours 8 minutes 34 seconds. New personal best for the distance.' },
  { id: 'alice-d115', persona: 'Alice', day: 115, summary: 'Alice strained her left calf during a 15K training run on day 115. Took two weeks rest as advised by the physiotherapist.' },
  { id: 'alice-d150', persona: 'Alice', day: 150, summary: 'Alice completed a 28K training run on day 150. Time was 2 hours 55 minutes. Final long run before the Berlin marathon taper.' },
  { id: 'alice-d175', persona: 'Alice', day: 175, summary: 'Alice ran the Berlin marathon on day 175 in 4 hours 12 minutes 47 seconds. Finished in mid-pack but completed her first full marathon.' },

  // ─── Bob — apartment hunt in Prague ─────────────
  { id: 'bob-d5',   persona: 'Bob', day: 5,   summary: 'Bob started apartment hunting in Prague on day 5. Budget set at 25000 CZK per month. Looking for a one-bedroom in Vinohrady.' },
  { id: 'bob-d18',  persona: 'Bob', day: 18,  summary: 'Bob viewed a flat on Korunni street on day 18. Asking 26000 CZK, slightly over budget. Old building with high ceilings, no elevator.' },
  { id: 'bob-d35',  persona: 'Bob', day: 35,  summary: 'Bob put in an offer on a one-bedroom in Karlin on day 35. Price 27500 CZK monthly with a six-month deposit. Decision expected within a week.' },
  { id: 'bob-d45',  persona: 'Bob', day: 45,  summary: 'Bob signed the lease on the Karlin flat on day 45. Move-in date is day 60. Cost was 27500 CZK monthly plus 165000 CZK deposit.' },
  { id: 'bob-d60',  persona: 'Bob', day: 60,  summary: 'Bob moved into the Karlin flat on day 60. Movers cost was 4500 CZK. Wifi installed the same evening, comcast equivalent for the Czech market.' },
  { id: 'bob-d80',  persona: 'Bob', day: 80,  summary: 'Bob furnished the flat over week 11. Total spend on Ikea furniture was 38000 CZK. Reports the new sofa is exceptionally comfortable.' },
  { id: 'bob-d120', persona: 'Bob', day: 120, summary: 'Bob hosted his first dinner party in the Karlin flat on day 120. Eight guests, cooked Vietnamese pho. Reports the gathering went well.' },
  { id: 'bob-d165', persona: 'Bob', day: 165, summary: 'Bob received the first annual rent increase notice on day 165. New rent will be 28800 CZK starting next quarter. Letter dated last Tuesday.' },

  // ─── Cara — PhD thesis on knowledge graphs ─────────────
  { id: 'cara-d2',   persona: 'Cara', day: 2,   summary: 'Cara defended her PhD thesis proposal on knowledge graph retrieval at ETH Zurich on day 2. Committee approved with minor revisions due in two months.' },
  { id: 'cara-d25',  persona: 'Cara', day: 25,  summary: 'Cara submitted revised thesis proposal on day 25. Added a chapter on temporal graph embeddings per committee feedback. Advisor is Professor Mendelsohn.' },
  { id: 'cara-d55',  persona: 'Cara', day: 55,  summary: 'Cara presented her first PhD paper at the ICDM workshop on day 55. Paper title: temporal-aware reranking for knowledge graph retrieval. Got positive feedback.' },
  { id: 'cara-d85',  persona: 'Cara', day: 85,  summary: 'Cara got her first paper accepted to EMNLP main conference on day 85. Reviewer scores 4-4-5. Camera-ready due in two weeks.' },
  { id: 'cara-d110', persona: 'Cara', day: 110, summary: 'Cara attended EMNLP in Singapore on day 110. Presented the temporal-aware reranking paper as a poster. Met three potential PhD collaborators.' },
  { id: 'cara-d135', persona: 'Cara', day: 135, summary: 'Cara started a 3-month research internship at Google DeepMind on day 135. Topic is multi-hop graph retrieval at scale. Manager is Dr. Chen.' },
  { id: 'cara-d170', persona: 'Cara', day: 170, summary: 'Cara completed her DeepMind internship on day 170. Final report shipped to her advisor. Extended a research collaboration with the host team for another quarter.' },

  // ─── Dan — restaurant venture in Vienna ─────────────
  { id: 'dan-d8',   persona: 'Dan', day: 8,   summary: 'Dan started planning a Vietnamese restaurant in Vienna on day 8. Initial business plan budget is 180000 euros. Location TBD in the seventh district.' },
  { id: 'dan-d22',  persona: 'Dan', day: 22,  summary: 'Dan signed a 5-year commercial lease on Neubaugasse 14 on day 22. Rent is 4200 euros monthly. Space is 85 square meters with existing kitchen plumbing.' },
  { id: 'dan-d50',  persona: 'Dan', day: 50,  summary: 'Dan hired his first cook on day 50. Name is Linh, ex-sous chef from Anan Saigon in Vietnam. Salary is 38000 euros gross annual plus tip share.' },
  { id: 'dan-d75',  persona: 'Dan', day: 75,  summary: 'Dan completed the kitchen renovation on day 75. Total cost was 62000 euros. Two extra weeks over plan due to ventilation hood permits.' },
  { id: 'dan-d100', persona: 'Dan', day: 100, summary: 'Dan opened the restaurant on day 100. Soft launch evening served 32 covers. Reports the pho beef bowl was the most ordered dish that night.' },
  { id: 'dan-d130', persona: 'Dan', day: 130, summary: 'Dan got the first Falter newspaper review on day 130. Two and a half stars out of five. Critic praised the bao buns but flagged inconsistent service timing.' },
  { id: 'dan-d160', persona: 'Dan', day: 160, summary: 'Dan reported the restaurant broke even on day 160. Monthly revenue averaged 58000 euros over the prior eight weeks. Operations now sustainable.' },

  // ─── distractors / cross-persona noise ─────────────
  { id: 'distract-d20',  persona: 'Alice', day: 20,  summary: 'Alice visited the Berlin Christmas markets on day 20. Bought a hand-knitted scarf and a stollen. Reports the gluhwein was excellent.' },
  { id: 'distract-d70',  persona: 'Bob',   day: 70,  summary: 'Bob attended the Prague jazz festival on day 70. Saw three concerts over the weekend. Festival pass cost was 1800 CZK.' },
  { id: 'distract-d95',  persona: 'Cara',  day: 95,  summary: 'Cara published a personal blog post on day 95 about graph algorithms for beginners. Post went moderately viral with 8000 views in two days.' },
  { id: 'distract-d125', persona: 'Dan',   day: 125, summary: 'Dan attended a sommelier course in Vienna on day 125. Got the WSET level 2 certificate. Course was three weekends and cost 2300 euros.' },
];

// ─────────────── 30 factual-recall queries with gold answers ─────────────

interface LocomoQuery {
  readonly id: string;
  readonly persona: string;
  readonly query: string;
  /** Gold-standard answer string. F1 computed against retrieved-evidence tokens. */
  readonly goldAnswer: string;
  /** Evidence session ids — used as a sanity check. */
  readonly evidence: readonly string[];
}

const QUERIES: readonly LocomoQuery[] = [
  // ─── Alice — marathon ─────────────
  { id: 'lq-a1', persona: 'Alice', query: 'What marathon did Alice sign up for and when was the race scheduled',
    goldAnswer: 'Berlin marathon September 28', evidence: ['alice-d3'] },
  { id: 'lq-a2', persona: 'Alice', query: 'What was Alice first 5K training run time',
    goldAnswer: '28 minutes', evidence: ['alice-d12'] },
  { id: 'lq-a3', persona: 'Alice', query: 'What model of running shoes did Alice buy and what did they cost',
    goldAnswer: 'Asics Nimbus 25 165 euros', evidence: ['alice-d40'] },
  { id: 'lq-a4', persona: 'Alice', query: 'What was Alice first 10K time',
    goldAnswer: '58 minutes 12 seconds', evidence: ['alice-d65'] },
  { id: 'lq-a5', persona: 'Alice', query: 'What was Alice final marathon finishing time',
    goldAnswer: '4 hours 12 minutes 47 seconds', evidence: ['alice-d175'] },
  { id: 'lq-a6', persona: 'Alice', query: 'What injury did Alice have during training and how long did she rest',
    goldAnswer: 'left calf strain two weeks rest', evidence: ['alice-d115'] },

  // ─── Bob — apartment ─────────────
  { id: 'lq-b1', persona: 'Bob', query: 'What budget did Bob set for his Prague apartment hunt',
    goldAnswer: '25000 CZK per month', evidence: ['bob-d5'] },
  { id: 'lq-b2', persona: 'Bob', query: 'Which neighborhood did Bob initially want to live in',
    goldAnswer: 'Vinohrady', evidence: ['bob-d5'] },
  { id: 'lq-b3', persona: 'Bob', query: 'Which Prague apartment did Bob ultimately sign for and at what rent',
    goldAnswer: 'Karlin one bedroom 27500 CZK monthly', evidence: ['bob-d45'] },
  { id: 'lq-b4', persona: 'Bob', query: 'What was Bob deposit on the new flat',
    goldAnswer: '165000 CZK', evidence: ['bob-d45'] },
  { id: 'lq-b5', persona: 'Bob', query: 'How much did Bob spend on Ikea furniture',
    goldAnswer: '38000 CZK', evidence: ['bob-d80'] },
  { id: 'lq-b6', persona: 'Bob', query: 'What was Bob new rent after the annual increase',
    goldAnswer: '28800 CZK', evidence: ['bob-d165'] },

  // ─── Cara — PhD ─────────────
  { id: 'lq-c1', persona: 'Cara', query: 'Where is Cara doing her PhD and on what topic',
    goldAnswer: 'ETH Zurich knowledge graph retrieval', evidence: ['cara-d2'] },
  { id: 'lq-c2', persona: 'Cara', query: 'Who is Cara PhD advisor',
    goldAnswer: 'Professor Mendelsohn', evidence: ['cara-d25'] },
  { id: 'lq-c3', persona: 'Cara', query: 'What was the title of Cara first PhD paper',
    goldAnswer: 'temporal-aware reranking for knowledge graph retrieval', evidence: ['cara-d55'] },
  { id: 'lq-c4', persona: 'Cara', query: 'At which conference was Cara first paper accepted',
    goldAnswer: 'EMNLP main conference', evidence: ['cara-d85'] },
  { id: 'lq-c5', persona: 'Cara', query: 'Where did Cara do her research internship and who managed her',
    goldAnswer: 'Google DeepMind Dr Chen', evidence: ['cara-d135'] },
  { id: 'lq-c6', persona: 'Cara', query: 'In what city did Cara attend EMNLP',
    goldAnswer: 'Singapore', evidence: ['cara-d110'] },

  // ─── Dan — restaurant ─────────────
  { id: 'lq-d1', persona: 'Dan', query: 'Where is Dan opening his restaurant',
    goldAnswer: 'Vienna Neubaugasse 14 seventh district', evidence: ['dan-d8', 'dan-d22'] },
  { id: 'lq-d2', persona: 'Dan', query: 'What is the monthly rent on Dan restaurant space',
    goldAnswer: '4200 euros monthly', evidence: ['dan-d22'] },
  { id: 'lq-d3', persona: 'Dan', query: 'Who did Dan hire as his first cook and from where',
    goldAnswer: 'Linh ex-sous chef from Anan Saigon Vietnam', evidence: ['dan-d50'] },
  { id: 'lq-d4', persona: 'Dan', query: 'How much did the kitchen renovation cost',
    goldAnswer: '62000 euros', evidence: ['dan-d75'] },
  { id: 'lq-d5', persona: 'Dan', query: 'What was the Falter newspaper review rating',
    goldAnswer: 'two and a half stars out of five', evidence: ['dan-d130'] },
  { id: 'lq-d6', persona: 'Dan', query: 'When did Dan restaurant break even and at what monthly revenue',
    goldAnswer: 'day 160 58000 euros monthly', evidence: ['dan-d160'] },

  // ─── temporal / causal reasoning ─────────────
  { id: 'lq-t1', persona: 'Alice', query: 'Did Alice get injured before or after running her first 10K',
    goldAnswer: 'after first 10K injury at day 115 10K at day 65', evidence: ['alice-d65', 'alice-d115'] },
  { id: 'lq-t2', persona: 'Bob',   query: 'Was Bob hosting his first dinner party before or after the rent increase',
    goldAnswer: 'before rent increase party day 120 increase day 165', evidence: ['bob-d120', 'bob-d165'] },
  { id: 'lq-t3', persona: 'Cara',  query: 'Did Cara start her DeepMind internship before or after EMNLP',
    goldAnswer: 'after EMNLP internship day 135 EMNLP day 110', evidence: ['cara-d110', 'cara-d135'] },
  { id: 'lq-t4', persona: 'Dan',   query: 'How many days between the soft launch and the Falter review',
    goldAnswer: '30 days launch day 100 review day 130', evidence: ['dan-d100', 'dan-d130'] },

  // ─── persona stability — does the retriever stay with the right persona ─────────────
  { id: 'lq-p1', persona: 'Alice', query: 'Did Alice ever go to a Christmas market and what did she buy',
    goldAnswer: 'Berlin Christmas markets hand-knitted scarf and stollen gluhwein', evidence: ['distract-d20'] },
  { id: 'lq-p2', persona: 'Dan',   query: 'What sommelier course did Dan complete',
    goldAnswer: 'WSET level 2 in Vienna 2300 euros three weekends', evidence: ['distract-d125'] },
];

// ─────────────── seeded topic-vector embedder ─────────────

/**
 * Topic-vector fixture embedder — same approach as
 * bench-longmemeval-synth. The topics here are persona+activity
 * tuples so queries about Alice's marathon training don't accidentally
 * surface Bob's apartment hunt.
 */
const TOPIC_TAGS: Record<string, number> = {
  // persona-level (high coarse signal)
  'alice':       0,
  'berlin':      0,
  'marathon':    0,
  'training':    0,
  'run':         0,
  '5k':          0,
  '10k':         0,
  'shoes':       0,
  'asics':       0,
  'knee':        0,
  'calf':        0,
  'injury':      0,
  'physio':      0,
  'taper':       0,
  'finishing':   0,
  // Bob
  'bob':         1,
  'prague':      1,
  'apartment':   1,
  'flat':        1,
  'lease':       1,
  'karlin':      1,
  'vinohrady':   1,
  'rent':        1,
  'deposit':     1,
  'furniture':   1,
  'ikea':        1,
  'dinner':      1,
  'party':       1,
  'increase':    1,
  // Cara
  'cara':        2,
  'phd':         2,
  'thesis':      2,
  'eth':         2,
  'zurich':      2,
  'knowledge':   2,
  'graph':       2,
  'paper':       2,
  'emnlp':       2,
  'singapore':   2,
  'deepmind':    2,
  'internship':  2,
  'advisor':     2,
  'committee':   2,
  // Dan
  'dan':         3,
  'restaurant':  3,
  'vienna':      3,
  'neubaugasse': 3,
  'kitchen':     3,
  'cook':        3,
  'chef':        3,
  'pho':         3,
  'review':      3,
  'falter':      3,
  'revenue':     3,
  'sommelier':   3,
  'wset':        3,
  // shared verbs/cross-topic (small signal)
  'christmas':   4,
  'jazz':        4,
  'gluhwein':    4,
  'festival':    4,
};

const TOPIC_COUNT = 5;

const buildTopicVector = (text: string, seed: number): Float32Array => {
  const v = new Float32Array(DIM);
  const lo = text.toLowerCase();
  const hits = new Set<number>();
  for (const [tag, topic] of Object.entries(TOPIC_TAGS)) {
    if (lo.includes(tag)) hits.add(topic);
  }
  if (hits.size === 0) {
    v[seed % DIM] = 0.1;
    return v;
  }
  const stride = Math.floor(DIM / TOPIC_COUNT);
  for (const topic of hits) {
    const base = topic * stride;
    for (let i = 0; i < stride; i++) {
      v[base + i] = 1 / Math.sqrt(stride * hits.size);
    }
  }
  for (let i = 0; i < 8; i++) {
    v[(seed * 41 + i * 13) % DIM] += 0.005;
  }
  let norm = 0;
  for (let i = 0; i < DIM; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < DIM; i++) v[i] /= norm;
  return v;
};

// ─────────────── scoring helpers ─────────────

/**
 * Stopwords that contribute no answer signal — drop from key-token
 * sets. Kept tight; this is for ENGLISH only and reflects what
 * SQuAD / LongMemEval typically discount.
 */
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'was', 'were',
  'have', 'has', 'had', 'are', 'her', 'his', 'him', 'she', 'they',
  'their', 'them', 'into', 'than', 'who', 'what', 'when', 'where',
  'how', 'why', 'which', 'will', 'all', 'any', 'one', 'two', 'three',
  'but', 'not', 'out', 'over', 'about', 'also', 'some', 'more',
]);

/**
 * Key-token set: length > 2, not in stopwords, lowercased. Numbers
 * (`27500`, `165`) stay — they're often the answer.
 */
const keyTokens = (s: string): Set<string> => {
  const out = new Set<string>();
  for (const t of s.toLowerCase().split(/[^a-z0-9]+/)) {
    if (t.length > 2 && !STOPWORDS.has(t)) out.add(t);
  }
  return out;
};

/**
 * Answer-token containment — fraction of gold key tokens that
 * appear anywhere in the retrieved evidence text. Range [0, 1].
 *
 * This is what "would the agent have the material to extract the
 * right answer?" actually measures. Token-F1 over the full summary
 * text is the wrong metric for retrieval-only — see the suite
 * header for the bug history.
 */
const answerTokenContainment = (
  retrievedText: string,
  goldAnswer: string,
): number => {
  const gold = keyTokens(goldAnswer);
  if (gold.size === 0) return 0;
  const retrieved = keyTokens(retrievedText);
  let hits = 0;
  for (const t of gold) if (retrieved.has(t)) hits++;
  return hits / gold.size;
};

/**
 * Harmonic mean — both terms must be high. Returns 0 if either
 * input is 0 (sharp penalty for one-sided wins).
 */
const harmonicMean = (a: number, b: number): number => {
  if (a <= 0 || b <= 0) return 0;
  return (2 * a * b) / (a + b);
};

// ─────────────── runner ─────────────

test('bench: synthetic LoCoMo-style factual F1 ≥ 0.50', async () => {
  const t0 = performance.now();
  const home = mkdtempSync(join(tmpdir(), 'wi-bench-locomo-'));

  try {
    const graphs = fileGraphRepository(join(home, 'graph.json'));
    const vecRes = await openSqliteVectorIndex({ path: join(home, 'vectors.db'), dim: DIM });
    if (vecRes.isErr()) throw new Error(JSON.stringify(vecRes.error));
    const vectors = vecRes.value;

    const embedder = fixtureEmbedder({ dim: DIM });
    SESSIONS.forEach((s, i) => embedder.register(s.summary, buildTopicVector(s.summary, i)));
    QUERIES.forEach((q, i) => embedder.register(q.query, buildTopicVector(q.query, 1000 + i)));

    // Index every session as one node.
    for (const s of SESSIONS) {
      const r = await indexNode({ graphs, vectors, embedder })({
        node: {
          id: s.id,
          label: s.summary.slice(0, 80),
          file_type: 'document',
          source_file: s.id,
          source_uri: s.id,
          summary: s.summary,
          fetched_at: '2026-05-19T00:00:00Z',
        },
        text: s.summary,
      });
      if (r.isErr()) throw new Error(`index ${s.id}: ${JSON.stringify(r.error)}`);
    }

    // Run each query, score the two pure-compute signals.
    let sumContainment = 0;
    let evidenceHits = 0;
    const perQuery: { id: string; metric: string; value: number }[] = [];
    const perPersona: Record<string, { sumContain: number; sumEv: number; n: number }> = {};
    const sessionMap = new Map(SESSIONS.map((s) => [s.id, s]));

    for (const q of QUERIES) {
      const r = await searchGlobal({ graphs, vectors, embedder })({
        text: q.query,
        k: 3,
      });
      if (r.isErr()) throw new Error(`search ${q.id}: ${JSON.stringify(r.error)}`);
      const retrieved = r.value.map((m) => m.node_id as string);
      const retrievedSummaries = retrieved
        .map((id) => sessionMap.get(id)?.summary ?? '')
        .filter((x) => x.length > 0);
      const retrievedText = retrievedSummaries.join(' ');

      const containment = answerTokenContainment(retrievedText, q.goldAnswer);
      const evidenceFound = q.evidence.every((id) => retrieved.includes(id));

      sumContainment += containment;
      if (evidenceFound) evidenceHits++;

      perQuery.push({ id: q.id, metric: 'answer-token-containment', value: containment });
      const bucket = perPersona[q.persona] ?? { sumContain: 0, sumEv: 0, n: 0 };
      bucket.sumContain += containment;
      bucket.sumEv += evidenceFound ? 1 : 0;
      bucket.n += 1;
      perPersona[q.persona] = bucket;
    }

    const meanContainment = sumContainment / QUERIES.length;
    const evidenceRecall = evidenceHits / QUERIES.length;
    const dimensionScore = harmonicMean(meanContainment, evidenceRecall);
    const elapsedMs = performance.now() - t0;

    const report: BenchSuiteReport = {
      suite: 'locomo-synth',
      metrics: {
        // Composite dimension = harmonic mean of evidence-recall +
        // answer-token-containment. Both must be high.
        locomoFactualF1: dimensionScore,
        evidenceRecall,
        answerTokenContainment: meanContainment,
        ...Object.fromEntries(
          Object.entries(perPersona).map(([k, v]) => [
            `contain_${k.toLowerCase()}`, v.sumContain / v.n,
          ]),
        ),
        ...Object.fromEntries(
          Object.entries(perPersona).map(([k, v]) => [
            `evrecall_${k.toLowerCase()}`, v.sumEv / v.n,
          ]),
        ),
      },
      perQuery,
      elapsedMs,
      notes: 'Synthetic 4-persona × 40-session × 6-month LoCoMo-style proxy. Dimension = harmonic mean of evidence-session recall AND answer-token containment in top-3 retrieved evidence. Token-F1-on-full-summary dropped — see suite header for the length-mismatch precision bug. Real LoCoMo + LLM extractor pending Phase 23.7+.',
    };

    if (process.env.AKASHIK_BENCH_OUT) {
      appendFileSync(process.env.AKASHIK_BENCH_OUT, JSON.stringify(report) + '\n');
    }

    console.log(
      `bench locomo-synth: dimension=${dimensionScore.toFixed(4)} ` +
      `(evidence-recall=${evidenceRecall.toFixed(3)}, containment=${meanContainment.toFixed(3)}) in ${elapsedMs.toFixed(1)}ms`,
    );
    for (const [p, b] of Object.entries(perPersona)) {
      console.log(`  ${p.padEnd(6)} contain=${(b.sumContain / b.n).toFixed(3)}  ev=${(b.sumEv / b.n).toFixed(3)}  (n=${b.n})`);
    }

    assert.ok(dimensionScore >= 0.65, `LoCoMo-synth dimension ${dimensionScore.toFixed(3)} below 0.65 (evidence-recall=${evidenceRecall.toFixed(3)}, containment=${meanContainment.toFixed(3)})`);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
