/**
 * Write-time gate — pure filter that decides which observations are
 * worth promoting into the long-term memory tiers.
 *
 * Inspired by arxiv 2603.15994 ("Selective Memory for AI: Write-Time
 * Gating with Hierarchical Archiving"). The paper reports +25 to +65
 * percentage points over read-time curation by filtering at write
 * time — once a noisy memory lands in the store, downstream ranking
 * has to work around it forever.
 *
 * Three deterministic checks, no LLM call required:
 *
 *   1. Importance floor: drop observations with importance ≤
 *      configurable threshold (default 2 on a 10-point scale).
 *   2. Schema check: reject observations that fail minimum structural
 *      requirements — no concepts, empty body, no source URI.
 *   3. Contradiction: drop observations that contradict an existing
 *      high-strength semantic node (Jaccard ≥ contradictionThreshold
 *      on token sets, opposite valence). Older established semantic
 *      memory wins — the user gets a `flag` decision instead of
 *      silent override.
 *
 * Pure: no I/O. The caller provides any "existing high-strength
 * semantic nodes" needed for the contradiction check.
 *
 * Returns a `WriteGateDecision` tagged union — drop reasons are
 * surfaced for audit so the user can inspect which observations
 * never made it past the gate.
 */

import { ok, type Result } from 'neverthrow';
import { ConsolidationError } from './errors.js';

// ─────────────── inputs ─────────────

/**
 * The shape we need from a candidate observation. Caller maps from
 * `GraphNode` to this — keeps the gate decoupled from graph internals.
 */
export interface WriteGateCandidate {
  readonly id: string;
  readonly body: string;
  readonly importance: number;
  readonly concepts: readonly string[];
  readonly sourceUri?: string;
}

/**
 * Existing semantic-tier nodes for contradiction checking. We only
 * need their token sets and strengths — the gate never inspects the
 * full node.
 */
export interface ExistingSemantic {
  readonly id: string;
  readonly tokens: ReadonlySet<string>;
  readonly strength: number;
}

// ─────────────── config ─────────────

export interface WriteGateConfig {
  /** Drop candidates with importance ≤ this. Default 2. */
  readonly minImportance?: number;
  /** Drop when Jaccard ≥ this against a strong semantic node. Default 0.9. */
  readonly contradictionThreshold?: number;
  /** Existing semantic-node strength above which contradiction triggers a drop. Default 0.8. */
  readonly contradictionMinStrength?: number;
  /** Require at least N concepts on the candidate. Default 1. */
  readonly minConcepts?: number;
  /** Require a body of at least N characters. Default 16. */
  readonly minBodyChars?: number;
}

const DEFAULTS: Required<WriteGateConfig> = {
  minImportance:            2,
  contradictionThreshold:   0.9,
  contradictionMinStrength: 0.8,
  minConcepts:              1,
  minBodyChars:             16,
};

// ─────────────── decision ─────────────

export type WriteGateAction = 'promote' | 'drop';

export type DropReason =
  | 'low_importance'
  | 'schema_no_concepts'
  | 'schema_short_body'
  | 'schema_no_source'
  | 'contradicts_strong_semantic';

export interface WriteGateDecision {
  readonly action: WriteGateAction;
  readonly candidateId: string;
  readonly reason?: DropReason;
  /** Populated only on contradiction drops — the semantic node that vetoed. */
  readonly contradictsId?: string;
  readonly contradictionScore?: number;
}

// ─────────────── tokenisation ─────────────

/**
 * Build a lowercase token set, filtering out tokens shorter than 3
 * characters (drops stopwords like "is", "or", "to"). Stems are
 * NOT applied here — keep this cheap, the BM25 index already does
 * the heavy lifting.
 */
export const tokenSet = (text: string): Set<string> => {
  const out = new Set<string>();
  for (const t of text.toLowerCase().split(/[^a-z0-9_]+/)) {
    if (t.length > 2) out.add(t);
  }
  return out;
};

/**
 * Standard Jaccard coefficient. Range [0, 1]. 1 = identical, 0 = disjoint.
 * Returns 0 when either set is empty (no useful signal).
 */
export const jaccardSimilarity = (a: ReadonlySet<string>, b: ReadonlySet<string>): number => {
  if (a.size === 0 || b.size === 0) return 0;
  let intersect = 0;
  for (const t of a) if (b.has(t)) intersect++;
  const union = a.size + b.size - intersect;
  return union > 0 ? intersect / union : 0;
};

// ─────────────── gate ─────────────

/**
 * Evaluate one candidate against the gate. Pure, total.
 *
 * Order of checks:
 *   1. Importance (cheapest)
 *   2. Schema (no I/O)
 *   3. Contradiction (O(|tokens| × |existing|), most expensive)
 *
 * Bails on the first failure to keep the cost path tight.
 */
export const writeGateDecision = (
  candidate: WriteGateCandidate,
  existing: readonly ExistingSemantic[],
  cfg: WriteGateConfig = {},
): Result<WriteGateDecision, ConsolidationError> => {
  if (!candidate.id || candidate.id.length === 0) {
    return ok({
      action: 'drop',
      candidateId: candidate.id ?? '<unknown>',
      reason: 'schema_no_source',
    });
  }
  const opts = { ...DEFAULTS, ...cfg };

  // 1. Importance
  if (candidate.importance <= opts.minImportance) {
    return ok({ action: 'drop', candidateId: candidate.id, reason: 'low_importance' });
  }

  // 2. Schema
  if (candidate.concepts.length < opts.minConcepts) {
    return ok({ action: 'drop', candidateId: candidate.id, reason: 'schema_no_concepts' });
  }
  if (candidate.body.length < opts.minBodyChars) {
    return ok({ action: 'drop', candidateId: candidate.id, reason: 'schema_short_body' });
  }
  if (!candidate.sourceUri || candidate.sourceUri.length === 0) {
    return ok({ action: 'drop', candidateId: candidate.id, reason: 'schema_no_source' });
  }

  // 3. Contradiction
  if (existing.length > 0) {
    const candTokens = tokenSet(candidate.body);
    for (const ex of existing) {
      if (ex.strength < opts.contradictionMinStrength) continue;
      const sim = jaccardSimilarity(candTokens, ex.tokens);
      if (sim >= opts.contradictionThreshold) {
        return ok({
          action: 'drop',
          candidateId: candidate.id,
          reason: 'contradicts_strong_semantic',
          contradictsId: ex.id,
          contradictionScore: sim,
        });
      }
    }
  }

  return ok({ action: 'promote', candidateId: candidate.id });
};

/**
 * Convenience: filter a batch and return the promote-able candidates
 * alongside a list of drop decisions for audit/telemetry.
 */
export const partitionByGate = (
  candidates: readonly WriteGateCandidate[],
  existing: readonly ExistingSemantic[],
  cfg: WriteGateConfig = {},
): { readonly promoted: readonly WriteGateCandidate[]; readonly dropped: readonly WriteGateDecision[] } => {
  const promoted: WriteGateCandidate[] = [];
  const dropped: WriteGateDecision[] = [];
  for (const c of candidates) {
    const r = writeGateDecision(c, existing, cfg);
    if (r.isErr()) {
      // ConsolidationError variant — preserve as a drop with the
      // generic schema-no-source reason so the caller never blocks
      // on infra errors at this layer (the gate is total).
      dropped.push({ action: 'drop', candidateId: c.id, reason: 'schema_no_source' });
      continue;
    }
    const decision = r.value;
    if (decision.action === 'promote') promoted.push(c);
    else dropped.push(decision);
  }
  return { promoted, dropped };
};
