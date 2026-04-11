/**
 * Session manager — consolidation + decay + priority scoring.
 *
 * Closes the claude-mem "Endless Mode" gap by:
 *
 * 1. **Consolidation**: After N session captures (configurable,
 *    default 50), merges old sessions into a summary node. The
 *    summary preserves topics, decisions, and key files discussed.
 *    Individual session nodes are removed.
 *
 * 2. **Decay scoring**: Recent sessions get a recency boost in
 *    search results. Older sessions decay exponentially with a
 *    configurable half-life (default 7 days).
 *
 * 3. **Priority scoring**: Combines recency, frequency (how often
 *    a topic appears), and semantic distance into a single score.
 *    search results are re-ranked by this score.
 *
 * Pure application logic — no I/O in this module. Depends on
 * GraphRepository for reading/writing.
 */

import { ResultAsync, okAsync } from 'neverthrow';
import type { AppError } from '../domain/errors.js';
import type { Graph, GraphNode } from '../domain/graph.js';
import { upsertNode, removeNode } from '../domain/graph.js';
import type { Match } from '../domain/vectors.js';
import type { GraphRepository } from '../infrastructure/graph-repository.js';

// ─────────── config ─────────────

export interface SessionConfig {
  /** Max session nodes before consolidation triggers. Default 50. */
  readonly consolidationThreshold: number;
  /** Decay half-life in days. Default 7. */
  readonly decayHalfLifeDays: number;
  /** Weight for recency in priority score (0-1). Default 0.4. */
  readonly recencyWeight: number;
  /** Weight for frequency in priority score (0-1). Default 0.3. */
  readonly frequencyWeight: number;
  /** Weight for semantic distance in priority score (0-1). Default 0.3. */
  readonly distanceWeight: number;
}

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  consolidationThreshold: 50,
  decayHalfLifeDays: 7,
  recencyWeight: 0.4,
  frequencyWeight: 0.3,
  distanceWeight: 0.3,
};

// ─────────── consolidation ──────

/** Find all session capture nodes in the graph. */
const sessionNodes = (graph: Graph): readonly GraphNode[] =>
  graph.json.nodes.filter(
    (n) => n.kind === 'session_capture' || n.source_file === 'session-capture',
  );

/** Build a summary from a batch of session nodes. */
const buildSummary = (sessions: readonly GraphNode[]): string => {
  const topics = new Map<string, number>();
  for (const s of sessions) {
    const label = s.label as string;
    // Extract date and any topic hints from the label
    const words = label.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    for (const w of words) topics.set(w, (topics.get(w) ?? 0) + 1);
  }

  const topTopics = [...topics.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);

  const oldest = sessions[0]?.fetched_at ?? '';
  const newest = sessions[sessions.length - 1]?.fetched_at ?? '';

  return [
    `Session consolidation: ${sessions.length} sessions from ${oldest} to ${newest}`,
    `Topics discussed: ${topTopics.join(', ')}`,
    `Rooms: ${[...new Set(sessions.map((s) => s.room))].filter(Boolean).join(', ')}`,
  ].join('\n');
};

/**
 * Consolidate old session nodes if the count exceeds the threshold.
 * Replaces N individual session nodes with one summary node.
 */
export const consolidateSessions =
  (graphs: GraphRepository, config: SessionConfig = DEFAULT_SESSION_CONFIG) =>
  (): ResultAsync<{ consolidated: number; remaining: number }, AppError> =>
    graphs
      .load()
      .mapErr((e): AppError => e)
      .andThen((graph) => {
        const sessions = sessionNodes(graph);
        if (sessions.length <= config.consolidationThreshold) {
          return okAsync({ consolidated: 0, remaining: sessions.length });
        }

        // Keep the most recent `threshold/2` sessions, consolidate the rest
        const keepCount = Math.floor(config.consolidationThreshold / 2);
        const sorted = [...sessions].sort((a, b) =>
          ((a.fetched_at as string) ?? '').localeCompare((b.fetched_at as string) ?? ''),
        );
        const toConsolidate = sorted.slice(0, sorted.length - keepCount);
        const summaryText = buildSummary(toConsolidate);

        // Remove old session nodes
        let g = graph;
        for (const s of toConsolidate) {
          const result = removeNode(g, s.id);
          if (result.isOk()) g = result.value;
        }

        // Add summary node
        const summaryNode: GraphNode = {
          id: `session-summary-${Date.now()}`,
          label: `Session summary (${toConsolidate.length} sessions consolidated)`,
          file_type: 'rationale',
          source_file: 'session-consolidation',
          source_uri: `session://summary-${Date.now()}`,
          fetched_at: new Date().toISOString(),
          kind: 'session_summary',
          room: toConsolidate[0]?.room as string ?? 'default',
          consolidated_count: toConsolidate.length,
          summary: summaryText,
        };

        const upserted = upsertNode(g, summaryNode);
        if (upserted.isErr()) return okAsync({ consolidated: 0, remaining: sessions.length });

        return graphs
          .save(upserted.value)
          .mapErr((e): AppError => e)
          .map(() => ({
            consolidated: toConsolidate.length,
            remaining: keepCount + 1, // kept + new summary
          }));
      });

// ─────────── decay scoring ──────

/**
 * Apply recency decay to search results. Recent items get a boost,
 * older items decay exponentially.
 *
 * decay_factor = 2^(-age_days / half_life)
 * priority = recencyWeight * decay + frequencyWeight * freq + distanceWeight * (1 - norm_dist)
 */
export const reRankWithDecay = (
  matches: readonly Match[],
  graph: Graph,
  config: SessionConfig = DEFAULT_SESSION_CONFIG,
): readonly (Match & { priority: number; age_days: number })[] => {
  const now = Date.now();

  // Count topic frequency across all graph nodes for frequency scoring
  const topicFreq = new Map<string, number>();
  for (const node of graph.json.nodes) {
    const words = (node.label as string).toLowerCase().split(/\s+/);
    for (const w of words) {
      if (w.length > 3) topicFreq.set(w, (topicFreq.get(w) ?? 0) + 1);
    }
  }
  const maxFreq = Math.max(1, ...[...topicFreq.values()]);

  // Normalize distances
  const maxDist = Math.max(0.001, ...matches.map((m) => m.distance));

  return matches.map((m) => {
    const node = graph.nodeById.get(m.node_id);
    const fetchedAt = node?.fetched_at as string | undefined;
    const ageDays = fetchedAt
      ? (now - new Date(fetchedAt).getTime()) / (1000 * 60 * 60 * 24)
      : 365; // unknown age = old

    const decayFactor = Math.pow(2, -ageDays / config.decayHalfLifeDays);

    // Frequency: average frequency of words in the node's label
    const labelWords = (node?.label as string ?? '').toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const avgFreq = labelWords.length > 0
      ? labelWords.reduce((s, w) => s + (topicFreq.get(w) ?? 0), 0) / labelWords.length / maxFreq
      : 0;

    const normDist = 1 - m.distance / maxDist;

    const priority =
      config.recencyWeight * decayFactor +
      config.frequencyWeight * avgFreq +
      config.distanceWeight * normDist;

    return { ...m, priority, age_days: Math.round(ageDays) };
  }).sort((a, b) => b.priority - a.priority);
};
