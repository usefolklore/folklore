/**
 * `wellinformed eval <queries.jsonl> [--room R] [--k 10] [--json]`
 *
 * Retrieval-quality eval harness. Reads a JSONL file of labelled
 * queries, runs the application's `ask` use case, and computes the
 * three standard IR metrics:
 *
 *   - Recall@k      = |relevant ∩ retrieved_top_k| / |relevant|
 *   - NDCG@k        = DCG@k / IDCG@k under binary relevance
 *   - MRR (Mean Reciprocal Rank) = mean(1 / rank_of_first_relevant)
 *
 * Why this is the highest-leverage piece of infra to add:
 *   Without measurable evals, every retrieval change is anecdote.
 *   With evals, the PPR rerank, HyDE, BGE-M3 upgrade, community
 *   summaries — every future change becomes a measurable PR.
 *
 * Input shape (JSONL — one record per line):
 *
 *   {"query": "lemlist", "expected_node_ids": ["chunk-a", "chunk-b"], "room": "research"}
 *
 * Fields:
 *   - `query`              required string
 *   - `expected_node_ids`  required string[] — gold-standard relevant nodes
 *   - `room`               optional — passes through to ask({ room })
 *
 * Default output: human-readable summary on stdout. `--json` emits
 * one JSON object with per-query results + aggregates so a CI
 * pipeline can diff-track NDCG between commits.
 */

import { readFileSync, existsSync } from 'node:fs';
import { formatError } from '../../domain/errors.js';
import { recallAtK, ndcgAtK, reciprocalRank } from '../../domain/eval-metrics.js';
import { ask as askUseCase } from '../../application/ask.js';
import { defaultRuntime } from '../runtime.js';

// ─────────────── argv parsing ─────────────

interface ParsedArgs {
  readonly file: string;
  readonly room?: string;
  readonly k: number;
  readonly json: boolean;
  readonly limit?: number;
}

const parseArgs = (args: readonly string[]): ParsedArgs | string => {
  let file = '';
  let room: string | undefined;
  let k = 10;
  let json = false;
  let limit: number | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = (): string => args[++i] ?? '';
    if (a === '--room') room = next();
    else if (a.startsWith('--room=')) room = a.slice('--room='.length);
    else if (a === '--k' || a === '-k') k = parseInt(next(), 10) || 10;
    else if (a.startsWith('--k=')) k = parseInt(a.slice('--k='.length), 10) || 10;
    else if (a === '--limit') limit = parseInt(next(), 10);
    else if (a.startsWith('--limit=')) limit = parseInt(a.slice('--limit='.length), 10);
    else if (a === '--json') json = true;
    else if (!a.startsWith('-')) file = a;
  }
  if (!file) {
    return 'missing queries file — usage: wellinformed eval <queries.jsonl> [--room R] [--k 10] [--limit N] [--json]';
  }
  if (!existsSync(file)) return `eval: queries file not found: ${file}`;
  if (k < 1 || k > 100) return `eval: --k must be in [1, 100], got ${k}`;
  return { file, room, k, json, limit };
};

// ─────────────── eval record shape ────────

interface EvalQuery {
  readonly query: string;
  readonly expected_node_ids: readonly string[];
  readonly room?: string;
}

const parseLine = (raw: string, lineNo: number): EvalQuery | string => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return '';
  let obj: unknown;
  try {
    obj = JSON.parse(trimmed);
  } catch (e) {
    return `line ${lineNo}: invalid JSON (${(e as Error).message})`;
  }
  if (typeof obj !== 'object' || obj === null) {
    return `line ${lineNo}: expected object, got ${typeof obj}`;
  }
  const o = obj as Record<string, unknown>;
  if (typeof o.query !== 'string' || o.query.length === 0) {
    return `line ${lineNo}: 'query' must be a non-empty string`;
  }
  if (!Array.isArray(o.expected_node_ids) || o.expected_node_ids.length === 0) {
    return `line ${lineNo}: 'expected_node_ids' must be a non-empty array`;
  }
  for (const id of o.expected_node_ids) {
    if (typeof id !== 'string' || id.length === 0) {
      return `line ${lineNo}: 'expected_node_ids' must contain non-empty strings`;
    }
  }
  const room =
    typeof o.room === 'string' && o.room.length > 0 ? o.room : undefined;
  return {
    query: o.query,
    expected_node_ids: o.expected_node_ids as readonly string[],
    room,
  };
};

// ─────────────── per-query result ─────────

interface QueryResult {
  readonly query: string;
  readonly room?: string;
  readonly retrieved: readonly string[];
  readonly expected: readonly string[];
  readonly recall_at_k: number;
  readonly ndcg_at_k: number;
  readonly reciprocal_rank: number;
  readonly latency_ms: number;
  readonly satisfaction: number;
  readonly decision: string;
}

interface Aggregate {
  readonly n: number;
  readonly mean_recall_at_k: number;
  readonly mean_ndcg_at_k: number;
  readonly mrr: number;
  readonly mean_latency_ms: number;
  readonly p50_latency_ms: number;
  readonly p95_latency_ms: number;
}

const aggregate = (rs: readonly QueryResult[]): Aggregate => {
  const n = rs.length;
  if (n === 0) {
    return {
      n: 0,
      mean_recall_at_k: 0,
      mean_ndcg_at_k: 0,
      mrr: 0,
      mean_latency_ms: 0,
      p50_latency_ms: 0,
      p95_latency_ms: 0,
    };
  }
  const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
  const recalls = rs.map((r) => r.recall_at_k);
  const ndcgs = rs.map((r) => r.ndcg_at_k);
  const rrs = rs.map((r) => r.reciprocal_rank);
  const lats = rs.map((r) => r.latency_ms).slice().sort((a, b) => a - b);
  const pct = (p: number): number => lats[Math.min(lats.length - 1, Math.floor(p * lats.length))];
  return {
    n,
    mean_recall_at_k: sum(recalls) / n,
    mean_ndcg_at_k: sum(ndcgs) / n,
    mrr: sum(rrs) / n,
    mean_latency_ms: sum(lats) / n,
    p50_latency_ms: pct(0.5),
    p95_latency_ms: pct(0.95),
  };
};

// ─────────────── command entry ────────────

export const evalCmd = async (args: readonly string[]): Promise<number> => {
  const parsed = parseArgs(args);
  if (typeof parsed === 'string') {
    console.error(`eval: ${parsed}`);
    return 1;
  }

  // Read + parse the queries file.
  const content = readFileSync(parsed.file, 'utf-8');
  const lines = content.split(/\r?\n/);
  const queries: EvalQuery[] = [];
  for (let i = 0; i < lines.length; i++) {
    const r = parseLine(lines[i], i + 1);
    if (typeof r === 'string') {
      if (r.length === 0) continue; // blank line — skip
      console.error(`eval: ${r}`);
      return 1;
    }
    queries.push(r);
  }
  if (queries.length === 0) {
    console.error('eval: queries file is empty');
    return 1;
  }
  const limited = parsed.limit ? queries.slice(0, parsed.limit) : queries;

  const rt = await defaultRuntime();
  if (rt.isErr()) {
    console.error(`eval: ${formatError(rt.error)}`);
    return 1;
  }
  const runtime = rt.value;

  try {
    const askFn = askUseCase({
      graphs: runtime.graphs,
      vectors: runtime.vectors,
      embedder: runtime.embedder,
      entityRegistry: runtime.entityRegistry,
    });

    const results: QueryResult[] = [];
    for (const q of limited) {
      const t0 = performance.now();
      const r = await askFn({
        query: q.query,
        room: q.room ?? parsed.room,
        k: parsed.k,
      });
      const t1 = performance.now();
      if (r.isErr()) {
        console.error(`eval: query "${q.query}" failed: ${formatError(r.error)}`);
        continue;
      }
      const retrieved = r.value.search_hits.map((h) => h.node_id);
      const relevant = new Set(q.expected_node_ids);
      results.push({
        query: q.query,
        room: q.room ?? parsed.room,
        retrieved,
        expected: q.expected_node_ids,
        recall_at_k: recallAtK(retrieved, relevant, parsed.k),
        ndcg_at_k: ndcgAtK(retrieved, relevant, parsed.k),
        reciprocal_rank: reciprocalRank(retrieved, relevant),
        latency_ms: t1 - t0,
        satisfaction: r.value.satisfaction.score,
        decision: r.value.decision,
      });
    }

    const agg = aggregate(results);

    if (parsed.json) {
      console.log(
        JSON.stringify({ k: parsed.k, aggregate: agg, queries: results }, null, 2),
      );
    } else {
      renderHuman(agg, results, parsed.k);
    }
    return 0;
  } finally {
    runtime.close();
  }
};

// ─────────────── human renderer ───────────

const renderHuman = (
  agg: Aggregate,
  results: readonly QueryResult[],
  k: number,
): void => {
  console.log(`── retrieval eval — ${results.length} queries, k=${k} ──────`);
  console.log(`recall@${k}    ${agg.mean_recall_at_k.toFixed(3)}`);
  console.log(`ndcg@${k}      ${agg.mean_ndcg_at_k.toFixed(3)}`);
  console.log(`mrr           ${agg.mrr.toFixed(3)}`);
  console.log(
    `latency       p50=${agg.p50_latency_ms.toFixed(0)}ms  p95=${agg.p95_latency_ms.toFixed(0)}ms  mean=${agg.mean_latency_ms.toFixed(0)}ms`,
  );
  console.log('────────────────────────────────────────────');
  // Worst-performing queries first — actionable debugging signal.
  const sorted = results.slice().sort((a, b) => a.ndcg_at_k - b.ndcg_at_k);
  const showN = Math.min(5, sorted.length);
  console.log(`worst ${showN} queries by ndcg@${k}:`);
  for (const r of sorted.slice(0, showN)) {
    const truncQ = r.query.length > 50 ? r.query.slice(0, 47) + '…' : r.query;
    console.log(
      `  ${r.ndcg_at_k.toFixed(2)}  recall=${r.recall_at_k.toFixed(2)}  rr=${r.reciprocal_rank.toFixed(2)}  ${truncQ}`,
    );
  }
};
