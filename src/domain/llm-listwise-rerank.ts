/**
 * Phase 23.12 — LLM-listwise reranker, domain layer.
 *
 * Pairwise cross-encoder reranking (the existing `cross-rerank.ts`
 * path) came up null on LongMemEval-S — bi-encoder cosine and the
 * cross-encoder relevance score correlate too strongly for the top
 * of the head, so reranking doesn't move gold from positions 6-20
 * into top-5.
 *
 * Listwise reranking sees the WHOLE candidate set jointly: the
 * model attends to all 50 candidates at once and can:
 *   - rank them comparatively ("d_3 is better than d_5 because…")
 *   - detect redundancy ("d_2 ≈ d_7, prefer the more specific one")
 *   - reason about temporal / negation / contradiction
 *     ("the question asks 'before X' so the dated-earlier candidates
 *      win, not the most cosine-similar ones")
 *
 * The model is LLM-as-judge style (RankGPT, RankLlama). Pure-domain
 * algorithm composes (query, candidates) → permutation; the actual
 * LLM call is a port (`ListwiseScorer`) so infrastructure adapters
 * (Ollama, OpenAI-compatible, fixture) can slot in.
 *
 * Fail-open: when the scorer errors out OR returns malformed output,
 * we return the input matches unchanged. The application layer logs
 * the error but never blocks the user's query.
 */

import { ResultAsync, okAsync } from 'neverthrow';
import type { Match } from './vectors.js';
import type { RerankError } from './errors.js';

// ─────────────── port ─────────────

export interface ListwiseScorerInput {
  readonly query: string;
  readonly candidates: ReadonlyArray<{
    readonly id: string;
    /** Display text passed to the LLM — typically a truncated session summary. */
    readonly text: string;
  }>;
  /** How many top results the LLM should return. */
  readonly topK: number;
}

/**
 * The listwise-scoring port. Takes (query, candidates, topK) →
 * an ordered list of candidate IDs (best first), capped at topK.
 *
 * Implementations:
 *   - `ollamaListwiseScorer` (infrastructure/) — Ollama-backed
 *   - `fixtureListwiseScorer` — deterministic, for tests
 *
 * The returned IDs MUST be a subset of the input candidate IDs.
 * Implementations should sanitise (drop hallucinated IDs, dedupe,
 * stop at the first invalid token) — this domain layer trusts
 * what it gets and folds the order into the final result.
 */
export interface ListwiseScorer {
  /** Model identifier — `qwen2.5:1.5b`, `gpt-oss:20b`, etc. For audit/telemetry. */
  readonly model: string;
  /** Score the candidate list. Returns the LLM's preferred ID order, top-first. */
  score(input: ListwiseScorerInput): ResultAsync<readonly string[], RerankError>;
}

// ─────────────── options ─────────────

export interface ListwiseRerankOptions {
  /**
   * Number of head candidates to send to the LLM. Default 30 — small
   * enough to fit a small-LLM context budget (~4k tokens with truncated
   * candidate text), large enough to cover the LongMemEval R@30 ≈ 0.998
   * head where ~all gold lives.
   */
  readonly headSize?: number;
  /**
   * Maximum chars per candidate's text before truncation. Default
   * 500 — ~125 tokens, keeps the listwise prompt under ~7k tokens
   * for a 30-candidate head.
   */
  readonly maxCharsPerCandidate?: number;
  /**
   * Shuffle candidates before showing them to the LLM. Default `true`.
   *
   * Listwise rerankers have a well-known *input-order bias* — when
   * candidates arrive sorted (e.g. by bi-encoder cosine, as they do
   * from our retriever) the LLM tends to passively confirm that
   * order rather than independently rank by content. RankGPT et al.
   * report this and address it via sliding-window scans or input
   * permutation; we use deterministic-per-query shuffling.
   *
   * Empirically validated 2026-05-25: on real LoCoMo questions both
   * qwen2.5:1.5b and the bench-time gpt-oss:20b path produced
   * IDENTICAL top-3 sets to the bi-encoder when candidates were
   * presented in cosine order. Shuffling breaks the bias and lets
   * the model rank on its own merits.
   *
   * Set to `false` for ablation studies or when the upstream retriever
   * does not return a sorted list.
   */
  readonly shuffleInput?: boolean;
}

// ─────────────── algorithm ─────────────

/**
 * Listwise-rerank a Match list. Takes the top-`headSize` candidates,
 * asks the LLM to reorder them, returns:
 *   [llm-reranked head] + [matches that had no text] + [tail past head]
 *
 * The tail past `headSize` is untouched — listwise reranking only
 * affects the head we sent to the model. Tail items at rank > headSize
 * remain in bi-encoder order.
 *
 * The `docTextOf` callback resolves Match → display text. Matches
 * whose doc text is empty/unresolvable bypass the LLM entirely
 * (passed through in original order, after reranked head).
 */
export const rerankMatchesListwise = (
  query: string,
  matches: readonly Match[],
  docTextOf: (m: Match) => string | undefined,
  scorer: ListwiseScorer,
  opts: ListwiseRerankOptions = {},
): ResultAsync<readonly Match[], RerankError> => {
  const headSize = opts.headSize ?? 30;
  const maxChars = opts.maxCharsPerCandidate ?? 500;
  const shuffleInput = opts.shuffleInput !== false;

  if (matches.length === 0) return okAsync(matches);

  const head = matches.slice(0, Math.min(headSize, matches.length));
  const tail = matches.slice(head.length);

  // Partition into (with-text) and (without-text). The LLM only sees
  // the with-text set; the without-text set passes through unchanged.
  const candidates: { id: string; text: string }[] = [];
  const matchById = new Map<string, Match>();
  const withoutText: Match[] = [];
  for (const m of head) {
    const id = String(m.node_id);
    const t = docTextOf(m);
    if (t && t.length > 0) {
      candidates.push({ id, text: truncate(t, maxChars) });
      matchById.set(id, m);
    } else {
      withoutText.push(m);
    }
  }

  if (candidates.length === 0) return okAsync(matches);

  // Break input-order bias — shuffle deterministically per query.
  // See `ListwiseRerankOptions.shuffleInput` for rationale.
  const presented = shuffleInput ? shuffleSeeded(candidates, hashString(query)) : candidates;

  return scorer
    .score({ query, candidates: presented, topK: candidates.length })
    .map((orderedIds) => {
      const reranked: Match[] = [];
      const placed = new Set<string>();
      // Place ids in LLM order, dropping unknown/duplicate ones.
      for (const id of orderedIds) {
        if (placed.has(id)) continue;
        const m = matchById.get(id);
        if (!m) continue;
        reranked.push(m);
        placed.add(id);
      }
      // Append any head-with-text items the LLM skipped, in original
      // bi-encoder order (preserves fail-soft behaviour when the LLM
      // returns a partial list).
      for (const id of matchById.keys()) {
        if (!placed.has(id)) reranked.push(matchById.get(id) as Match);
      }
      return [...reranked, ...withoutText, ...tail];
    })
    .orElse((): ResultAsync<readonly Match[], RerankError> => okAsync(matches));
};

// ─────────────── helpers ─────────────

const truncate = (s: string, maxChars: number): string =>
  s.length > maxChars ? `${s.slice(0, maxChars)}…` : s;

/**
 * Deterministic-per-query shuffle. Uses Fisher-Yates with a seeded
 * xorshift32 PRNG so the same (query, candidates) always produces
 * the same presentation order — bench runs reproduce, debug-replay
 * works, peer comparisons are valid.
 */
const shuffleSeeded = <T>(arr: readonly T[], seed: number): T[] => {
  const out = [...arr];
  let s = seed === 0 ? 1 : seed;
  for (let i = out.length - 1; i > 0; i--) {
    // xorshift32 step
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    const j = ((s >>> 0) % (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/** djb2 hash → 32-bit seed for the shuffle PRNG. Deterministic. */
const hashString = (s: string): number => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return h >>> 0;
};

// ─────────────── prompt builder (shared between adapters) ─────────────

/**
 * Canonical listwise-rerank prompt. Mirrors the RankGPT / RankZephyr
 * structure: numbered candidates + a strict "output IDs in order"
 * directive. Output format is intentionally machine-parseable.
 *
 * The prompt is exposed as a domain function so adapters share the
 * same shape — caps the model's freedom to drift across implementations.
 */
export const buildListwisePrompt = (input: ListwiseScorerInput): string => {
  const lines: string[] = [];
  lines.push('You are an expert at ranking documents by relevance to a query.');
  lines.push('Read the query and the numbered candidates, then return the IDs of the candidates');
  lines.push('in order from MOST to LEAST relevant. Use ONLY the IDs shown.');
  lines.push('');
  lines.push(`Query: ${input.query}`);
  lines.push('');
  lines.push('Candidates:');
  for (let i = 0; i < input.candidates.length; i++) {
    const c = input.candidates[i];
    lines.push(`[${i + 1}] id=${c.id}`);
    lines.push(c.text);
    lines.push('');
  }
  lines.push(`Return the top ${input.topK} candidate IDs in order, comma-separated, in this format:`);
  lines.push('RANKING: id_first, id_second, id_third, ...');
  lines.push('Do not include explanations. Use the id values exactly as shown above.');
  return lines.join('\n');
};

// ─────────────── output parser (shared) ─────────────

/**
 * Parse the LLM's response into an ordered list of IDs. Robust to
 * common LLM drift (extra prose, missing prefix, IDs in brackets).
 * Returns `[]` when nothing parseable was found — the algorithm
 * treats that as a no-op rerank.
 */
export const parseListwiseResponse = (raw: string, validIds: ReadonlySet<string>): string[] => {
  if (typeof raw !== 'string' || raw.length === 0) return [];

  // 1. Look for the canonical `RANKING:` prefix first. Match greedily
  //    through any number of newlines so multi-line outputs like
  //    `RANKING:\n1. id_a\n2. id_b` get captured in full.
  const rankingMatch = raw.match(/RANKING\s*[:=]\s*([\s\S]+)$/i);
  const segment = rankingMatch?.[1] ?? raw;

  // 2. Split on common separators (comma, arrow, semicolon, newline,
  //    "then", numbered prefixes like "1."). Tolerate brackets, quotes.
  const tokens = segment
    .replace(/^[\s\-*]+/, '')
    .split(/[,\n;]|\s>\s|\s+then\s+|->/i)
    .map((t) => t.trim().replace(/^["'\[\(]+|["'\]\)]+$/g, '').replace(/^\d+\.\s*/, '').trim())
    .filter((t) => t.length > 0);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const tok of tokens) {
    if (validIds.has(tok) && !seen.has(tok)) {
      seen.add(tok);
      out.push(tok);
      continue;
    }
    // Sometimes the LLM emits "id=foo" instead of bare "foo".
    const eq = tok.match(/^id\s*=\s*(.+)$/i);
    if (eq && validIds.has(eq[1]) && !seen.has(eq[1])) {
      seen.add(eq[1]);
      out.push(eq[1]);
    }
  }
  return out;
};
