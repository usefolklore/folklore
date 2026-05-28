/**
 * Auto-forget — pure planning for the long-term memory lifecycle
 * (Phase 21/22).
 *
 * Walks a graph snapshot, classifies every tiered node via
 * `tierForUri` + `retentionScore`, and emits an `AutoForgetPlan`
 * describing which actions should fire:
 *
 *   - `delete`: TTL has passed. Hard-remove from the graph.
 *   - `demote`: retention band is `frozen` AND no `isLatest: false`
 *     marker yet. Mark `isLatest = false` so retrieval drops it but
 *     audit can still inspect.
 *   - `flag_contradiction`: two tier nodes share Jaccard ≥ 0.9 on
 *     their summaries AND disagree on at least one concept tag. The
 *     older one is demoted; the newer one survives.
 *
 * No I/O — the orchestrator at the application layer applies the plan.
 * No clock — pass `nowMs` explicitly so the function is reproducible.
 *
 * What NOT to put here:
 *   - Graph mutation (the orchestrator calls `removeNode` / `replaceNode`)
 *   - LLM scoring of contradiction severity (Phase 22 work)
 *   - Cross-peer delete propagation (intentionally NEVER happens —
 *     auto-forget is strictly local)
 */

import type { GraphNode, NodeId } from './graph.js';
import type { MemoryTier } from './long-term-memory.js';
import { tierForUri, retentionScore, retentionBand } from './long-term-memory.js';
import { tokenSet, jaccardSimilarity } from './write-time-gate.js';

// ─────────────── config ─────────────

export interface AutoForgetConfig {
  /** Retention-band threshold for demote. Default 'frozen' (< 0.15). */
  readonly demoteBand?: 'frozen' | 'cold';
  /** Jaccard threshold to flag contradiction. Default 0.9. */
  readonly contradictionThreshold?: number;
  /** Only demote when retention is below this AND age beyond this many days. Default 30. */
  readonly demoteMinAgeDays?: number;
  /** Decay rate λ for retention score. Default 0.01. */
  readonly lambda?: number;
  /** Reinforcement weight σ for retention score. Default 0.3. */
  readonly sigma?: number;
  /** Skip the contradiction pass entirely (O(N²) cost guard). Default false. */
  readonly skipContradictions?: boolean;
}

const DEFAULTS: Required<AutoForgetConfig> = {
  demoteBand: 'frozen',
  contradictionThreshold: 0.9,
  demoteMinAgeDays: 30,
  lambda: 0.01,
  sigma: 0.3,
  skipContradictions: false,
};

// ─────────────── plan shapes ─────────────

export type AutoForgetAction = 'delete' | 'demote' | 'flag_contradiction';

export interface DeletePlanItem {
  readonly action: 'delete';
  readonly nodeId: NodeId;
  readonly tier: MemoryTier;
  readonly reason: 'ttl_expired';
  readonly forgetAfter: string;
}

export interface DemotePlanItem {
  readonly action: 'demote';
  readonly nodeId: NodeId;
  readonly tier: MemoryTier;
  readonly reason: 'retention_frozen' | 'contradiction';
  readonly retentionScore: number;
  readonly contradictsId?: NodeId;
  readonly contradictionScore?: number;
}

export type AutoForgetPlanItem = DeletePlanItem | DemotePlanItem;

export interface AutoForgetPlan {
  readonly items: readonly AutoForgetPlanItem[];
  readonly stats: {
    readonly nodesInspected: number;
    readonly tieredNodes: number;
    readonly deletes: number;
    readonly demotes: number;
    readonly contradictions: number;
  };
}

// ─────────────── planning ─────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const isLatest = (node: GraphNode): boolean => {
  const v = (node as { isLatest?: unknown }).isLatest;
  return v !== false;
};

const accessCountOf = (node: GraphNode): number => {
  const c = (node as { accessCount?: unknown }).accessCount;
  return typeof c === 'number' && Number.isFinite(c) ? Math.max(0, c) : 0;
};

const createdAtMsOf = (node: GraphNode, fallbackMs: number): number => {
  const candidates: unknown[] = [
    (node as { lastAccessedAt?: unknown }).lastAccessedAt,
    (node as { fetched_at?: unknown }).fetched_at,
    (node as { consolidated_at?: unknown }).consolidated_at,
  ];
  for (const c of candidates) {
    if (typeof c === 'string') {
      const t = Date.parse(c);
      if (Number.isFinite(t)) return t;
    }
  }
  return fallbackMs;
};

const forgetAfterMsOf = (node: GraphNode): number | null => {
  const f = (node as { forgetAfter?: unknown }).forgetAfter;
  if (typeof f !== 'string') return null;
  const t = Date.parse(f);
  return Number.isFinite(t) ? t : null;
};

const summaryOf = (node: GraphNode): string => {
  const s = (node as { summary?: unknown; label?: unknown }).summary;
  if (typeof s === 'string' && s.length > 0) return s;
  const l = (node as { label?: unknown }).label;
  return typeof l === 'string' ? l : '';
};

const conceptsOf = (node: GraphNode): readonly string[] => {
  const c = (node as { concepts?: unknown }).concepts;
  if (Array.isArray(c)) return c.filter((x): x is string => typeof x === 'string');
  return [];
};

/**
 * Plan one auto-forget pass.
 *
 * Algorithm:
 *   1. Walk every node. Skip when `tierForUri` returns `observation`
 *      (raw nodes are governed by source-adapter retention, not this
 *      pass).
 *   2. For each tiered + isLatest node:
 *        a. If `forgetAfter` is past, emit a DELETE plan item.
 *        b. Otherwise compute retention. If the band matches the
 *           configured `demoteBand` AND age ≥ `demoteMinAgeDays`,
 *           emit a DEMOTE item.
 *   3. Contradiction pass (skippable). For each pair of tiered +
 *      isLatest nodes that share at least one concept tag:
 *        a. Compute Jaccard over their summary token sets.
 *        b. If ≥ `contradictionThreshold` AND the concept tags
 *           disagree, emit a DEMOTE on the older node with
 *           reason='contradiction'.
 *
 * Total cost: O(N) for the retention pass + O(N²) for the
 * contradiction pass (bounded by `concept` co-occurrence). At ~10k
 * tier nodes the contradiction pass is ~50 ms; set `skipContradictions`
 * if your tier grows larger.
 */
export const planAutoForget = (
  nodes: readonly GraphNode[],
  nowMs: number,
  cfg: AutoForgetConfig = {},
): AutoForgetPlan => {
  const opts = { ...DEFAULTS, ...cfg };
  const items: AutoForgetPlanItem[] = [];
  let tieredNodes = 0;
  let deletes = 0;
  let demotes = 0;
  let contradictions = 0;

  const tiered: Array<{ node: GraphNode; tier: MemoryTier; createdMs: number }> = [];

  for (const node of nodes) {
    const uri = (node as { source_uri?: unknown }).source_uri;
    const id = node.id;
    const tier = tierForUri(typeof uri === 'string' ? uri : id);
    if (tier === 'observation') continue;
    if (!isLatest(node)) continue;
    tieredNodes++;

    const forgetMs = forgetAfterMsOf(node);
    if (forgetMs !== null && forgetMs <= nowMs) {
      items.push({
        action: 'delete',
        nodeId: id,
        tier,
        reason: 'ttl_expired',
        forgetAfter: String((node as Record<string, unknown>).forgetAfter ?? ''),
      });
      deletes++;
      continue;
    }

    const createdMs = createdAtMsOf(node, nowMs);
    const score = retentionScore(
      {
        tier,
        createdAtMs: createdMs,
        nowMs,
        accessCount: accessCountOf(node),
        recentAccessMs: [],
      },
      { lambda: opts.lambda, sigma: opts.sigma },
    );
    const band = retentionBand(score);
    const ageDays = (nowMs - createdMs) / MS_PER_DAY;
    const eligibleDemote =
      ageDays >= opts.demoteMinAgeDays &&
      (band === 'frozen' || (opts.demoteBand === 'cold' && band === 'cold'));

    if (eligibleDemote) {
      items.push({
        action: 'demote',
        nodeId: id,
        tier,
        reason: 'retention_frozen',
        retentionScore: score,
      });
      demotes++;
      continue;
    }

    tiered.push({ node, tier, createdMs });
  }

  if (!opts.skipContradictions && tiered.length > 1) {
    const summaryTokens = tiered.map((t) => tokenSet(summaryOf(t.node)));
    const conceptSets = tiered.map((t) => new Set(conceptsOf(t.node)));

    for (let i = 0; i < tiered.length; i++) {
      for (let j = i + 1; j < tiered.length; j++) {
        const ti = tiered[i], tj = tiered[j];
        // Cheap pre-filter: must share at least one concept tag.
        let sharesConcept = false;
        for (const c of conceptSets[i]) {
          if (conceptSets[j].has(c)) { sharesConcept = true; break; }
        }
        if (!sharesConcept) continue;

        const sim = jaccardSimilarity(summaryTokens[i], summaryTokens[j]);
        if (sim < opts.contradictionThreshold) continue;

        // Concept disagreement: must exist concepts in one set not in
        // the other AND vice versa (asymmetric difference both ways).
        let onlyI = false, onlyJ = false;
        for (const c of conceptSets[i]) if (!conceptSets[j].has(c)) { onlyI = true; break; }
        for (const c of conceptSets[j]) if (!conceptSets[i].has(c)) { onlyJ = true; break; }
        if (!(onlyI && onlyJ)) continue;

        const older = ti.createdMs <= tj.createdMs ? ti : tj;
        const newer = older === ti ? tj : ti;
        items.push({
          action: 'demote',
          nodeId: older.node.id,
          tier: older.tier,
          reason: 'contradiction',
          retentionScore: 0,
          contradictsId: newer.node.id,
          contradictionScore: sim,
        });
        demotes++;
        contradictions++;
      }
    }
  }

  return {
    items,
    stats: {
      nodesInspected: nodes.length,
      tieredNodes,
      deletes,
      demotes,
      contradictions,
    },
  };
};
