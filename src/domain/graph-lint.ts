/**
 * Graph lint — pure rules that surface hygiene issues in the graph.
 *
 * Port of claude-obsidian's wiki-lint, adapted for our graph model
 * (node IDs + edges + rooms, not wiki pages + wikilinks). Also adds
 * P2P-specific checks that claude-obsidian doesn't need.
 *
 * Every rule is a pure function:  (Graph, opts?) -> Findings[]
 * Rules don't mutate, don't fix — fixes happen in the application
 * layer against the GraphRepository so the domain stays I/O-free.
 *
 * Categories:
 *   L1 orphan            — node with no incident edges
 *   L2 dead-edge         — edge whose source or target node is gone
 *   L3 missing-room      — node with no room assigned
 *   L4 missing-fetched-at — node without fetched_at (unknown age)
 *   L5 empty-label       — node with blank / whitespace-only label
 *   L6 duplicate-uri     — two or more nodes share source_uri (dedupe opportunity)
 *   L7 unshared-p2p      — node stamped peer:/p2p: that lives in a room NOT marked shared
 *   L8 stale-secret-match — node content matches a current secret pattern (drift audit)
 */

import type { Graph, GraphNode } from './graph.js';
import { size as graphSize, nodesInRoom } from './graph.js';
import type { buildPatterns } from './sharing.js';
import { redactNode } from './secret-gate.js';

export type LintCategory =
  | 'orphan'
  | 'dead-edge'
  | 'missing-room'
  | 'missing-fetched-at'
  | 'empty-label'
  | 'duplicate-uri'
  | 'unshared-p2p'
  | 'stale-secret-match';

export interface Finding {
  readonly category: LintCategory;
  readonly node_id?: string;
  readonly room?: string;
  readonly detail: string;
}

export interface LintReport {
  readonly total_nodes: number;
  readonly total_edges: number;
  readonly findings: readonly Finding[];
  readonly by_category: ReadonlyMap<LintCategory, number>;
}

export interface LintOptions {
  /** Restrict rules to nodes in a single room. Omit to lint everything. */
  readonly room?: string;
  /** Rooms the local peer has marked public via `share room`. Used by L7. */
  readonly shared_rooms?: ReadonlySet<string>;
  /** Pattern set for L8 drift check. Typically buildPatterns() result. */
  readonly secret_patterns?: ReturnType<typeof buildPatterns>;
}

// ─────────────────────── rules ─────────────────────────────

const ruleOrphans = (graph: Graph, scope: readonly GraphNode[]): readonly Finding[] =>
  scope
    .filter((n) => (graph.adjacency.get(n.id)?.size ?? 0) === 0)
    .map((n): Finding => ({
      category: 'orphan',
      node_id: n.id,
      room: typeof n.room === 'string' ? n.room : undefined,
      detail: 'node has no incident edges',
    }));

const ruleDeadEdges = (graph: Graph): readonly Finding[] =>
  graph.json.links
    .filter((e) => !graph.nodeById.has(e.source) || !graph.nodeById.has(e.target))
    .map((e): Finding => ({
      category: 'dead-edge',
      detail: `edge ${e.source} → ${e.target} references missing node`,
    }));

const ruleMissingRoom = (scope: readonly GraphNode[]): readonly Finding[] =>
  scope
    .filter((n) => typeof n.room !== 'string' || n.room.length === 0)
    .map((n): Finding => ({
      category: 'missing-room',
      node_id: n.id,
      detail: 'node has no room assignment',
    }));

const ruleMissingFetchedAt = (scope: readonly GraphNode[]): readonly Finding[] =>
  scope
    .filter((n) => typeof n.fetched_at !== 'string')
    .map((n): Finding => ({
      category: 'missing-fetched-at',
      node_id: n.id,
      room: typeof n.room === 'string' ? n.room : undefined,
      detail: 'node has no fetched_at — age unknown',
    }));

const ruleEmptyLabel = (scope: readonly GraphNode[]): readonly Finding[] =>
  scope
    .filter((n) => typeof n.label !== 'string' || n.label.trim().length === 0)
    .map((n): Finding => ({
      category: 'empty-label',
      node_id: n.id,
      room: typeof n.room === 'string' ? n.room : undefined,
      detail: 'node has empty or whitespace-only label',
    }));

const ruleDuplicateUri = (scope: readonly GraphNode[]): readonly Finding[] => {
  const byUri = new Map<string, GraphNode[]>();
  for (const n of scope) {
    if (typeof n.source_uri !== 'string') continue;
    const bucket = byUri.get(n.source_uri) ?? [];
    bucket.push(n);
    byUri.set(n.source_uri, bucket);
  }
  const findings: Finding[] = [];
  for (const [uri, list] of byUri) {
    if (list.length < 2) continue;
    findings.push({
      category: 'duplicate-uri',
      detail: `${list.length} nodes share source_uri ${uri}: ${list.map((n) => n.id).join(', ').slice(0, 300)}`,
    });
  }
  return findings;
};

const ruleUnsharedP2p = (
  scope: readonly GraphNode[],
  sharedRooms: ReadonlySet<string>,
): readonly Finding[] =>
  scope
    .filter((n) => {
      if (typeof n.source_file !== 'string') return false;
      if (!n.source_file.startsWith('peer:') && !n.source_file.startsWith('p2p:')) return false;
      const room = typeof n.room === 'string' ? n.room : '';
      return !sharedRooms.has(room);
    })
    .map((n): Finding => ({
      category: 'unshared-p2p',
      node_id: n.id,
      room: typeof n.room === 'string' ? n.room : undefined,
      detail: 'node arrived from a peer but local room is not marked public — may indicate stale share-sync state',
    }));

const ruleStaleSecretMatch = (
  scope: readonly GraphNode[],
  patterns: ReturnType<typeof buildPatterns>,
): readonly Finding[] =>
  scope.flatMap((n): readonly Finding[] => {
    const { redactions } = redactNode(n, patterns);
    if (redactions.length === 0) return [];
    const byName = redactions.map((r) => `${r.pattern_name}×${r.count}`).join(', ');
    return [{
      category: 'stale-secret-match',
      node_id: n.id,
      room: typeof n.room === 'string' ? n.room : undefined,
      detail: `node text matches current secret patterns: ${byName}`,
    }];
  });

// ─────────────────────── entry point ───────────────────────

export const lintGraph = (graph: Graph, opts: LintOptions = {}): LintReport => {
  const scope = opts.room
    ? nodesInRoom(graph, opts.room)
    : graph.json.nodes;

  const findings: Finding[] = [];
  findings.push(...ruleOrphans(graph, scope));
  findings.push(...ruleDeadEdges(graph));
  findings.push(...ruleMissingRoom(scope));
  findings.push(...ruleMissingFetchedAt(scope));
  findings.push(...ruleEmptyLabel(scope));
  findings.push(...ruleDuplicateUri(scope));
  if (opts.shared_rooms) findings.push(...ruleUnsharedP2p(scope, opts.shared_rooms));
  if (opts.secret_patterns) findings.push(...ruleStaleSecretMatch(scope, opts.secret_patterns));

  const byCategory = new Map<LintCategory, number>();
  for (const f of findings) {
    byCategory.set(f.category, (byCategory.get(f.category) ?? 0) + 1);
  }
  const totals = graphSize(graph);
  return {
    total_nodes: totals.nodes,
    total_edges: totals.edges,
    findings,
    by_category: byCategory,
  };
};
