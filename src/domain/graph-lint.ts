/**
 * Graph lint — pure rules that surface hygiene issues in the graph.
 *
 * Port of claude-obsidian's wiki-lint, adapted for our graph model
 * (node IDs + edges, not wiki pages + wikilinks). Also adds
 * P2P-specific checks that claude-obsidian doesn't need.
 *
 * Every rule is a pure function:  (Graph, opts?) -> Findings[]
 * Rules don't mutate, don't fix — fixes happen in the application
 * layer against the GraphRepository so the domain stays I/O-free.
 *
 * Categories:
 *   L1 orphan            — node with no incident edges
 *   L2 dead-edge         — edge whose source or target node is gone
 *   L4 missing-fetched-at — node without fetched_at (unknown age)
 *   L5 empty-label       — node with blank / whitespace-only label
 *   L6 duplicate-uri     — two or more nodes share source_uri (dedupe opportunity)
 *   L8 stale-secret-match — node content matches a current secret pattern (drift audit)
 */

import type { Graph, GraphNode } from './graph.js';
import { size as graphSize } from './graph.js';
import type { buildPatterns } from './sharing.js';
import { redactNode } from './secret-gate.js';

export type LintCategory =
  | 'orphan'
  | 'dead-edge'
  | 'missing-fetched-at'
  | 'empty-label'
  | 'duplicate-uri'
  | 'stale-secret-match';

export interface Finding {
  readonly category: LintCategory;
  readonly node_id?: string;
  readonly detail: string;
}

export interface LintReport {
  readonly total_nodes: number;
  readonly total_edges: number;
  readonly findings: readonly Finding[];
  readonly by_category: ReadonlyMap<LintCategory, number>;
}

export interface LintOptions {
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
      detail: 'node has no incident edges',
    }));

const ruleDeadEdges = (graph: Graph): readonly Finding[] =>
  graph.json.links
    .filter((e) => !graph.nodeById.has(e.source) || !graph.nodeById.has(e.target))
    .map((e): Finding => ({
      category: 'dead-edge',
      detail: `edge ${e.source} → ${e.target} references missing node`,
    }));

const ruleMissingFetchedAt = (scope: readonly GraphNode[]): readonly Finding[] =>
  scope
    .filter((n) => typeof n.fetched_at !== 'string')
    .map((n): Finding => ({
      category: 'missing-fetched-at',
      node_id: n.id,
      detail: 'node has no fetched_at — age unknown',
    }));

const ruleEmptyLabel = (scope: readonly GraphNode[]): readonly Finding[] =>
  scope
    .filter((n) => typeof n.label !== 'string' || n.label.trim().length === 0)
    .map((n): Finding => ({
      category: 'empty-label',
      node_id: n.id,
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
      detail: `node text matches current secret patterns: ${byName}`,
    }];
  });

// ─────────────────────── entry point ───────────────────────

export const lintGraph = (graph: Graph, opts: LintOptions = {}): LintReport => {
  const scope = graph.json.nodes;

  const findings: Finding[] = [];
  findings.push(...ruleOrphans(graph, scope));
  findings.push(...ruleDeadEdges(graph));
  findings.push(...ruleMissingFetchedAt(scope));
  findings.push(...ruleEmptyLabel(scope));
  findings.push(...ruleDuplicateUri(scope));
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
