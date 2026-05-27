/**
 * Report generation use case.
 *
 * Produces a structured `ReportData` value from the current graph and
 * vector index. V5 (Phase 24): workspace-agnostic — reports the global
 * graph; CLI may apply a workspace pre-filter on returned nodes if
 * desired. The old cross-room "tunnels" section is dropped (no rooms
 * to tunnel between).
 *
 * Pure composition over existing domain + infra ports.
 */

import { ResultAsync, okAsync } from 'neverthrow';
import type { AppError } from '../domain/errors.js';
import type { Graph, GraphNode } from '../domain/graph.js';
import { size } from '../domain/graph.js';
import type { GraphRepository } from '../infrastructure/graph-repository.js';
import type { VectorIndex } from '../infrastructure/vector-index.js';
import type { SourcesConfig } from '../infrastructure/sources-config.js';

// ─────────────── types ──────────────────

export interface ReportOptions {
  /** ISO-8601 cutoff — nodes with fetched_at after this are "new". */
  readonly since?: string;
  /** Max god nodes to include. Default 10. */
  readonly maxGodNodes?: number;
}

export interface GodNode {
  readonly id: string;
  readonly label: string;
  readonly degree: number;
  readonly workspace?: string;
}

export interface ReportData {
  readonly generated_at: string;
  readonly since?: string;
  readonly stats: {
    readonly total_nodes: number;
    readonly total_edges: number;
    readonly sources: number;
  };
  readonly new_nodes: readonly GraphNode[];
  readonly god_nodes: readonly GodNode[];
}

// ─────────────── deps ───────────────────

export interface ReportDeps {
  readonly graphs: GraphRepository;
  readonly vectors: VectorIndex;
  readonly sources: SourcesConfig;
}

// ─────────────── use case ───────────────

export const generateReport =
  (deps: ReportDeps) =>
  (opts: ReportOptions = {}): ResultAsync<ReportData, AppError> =>
    deps.graphs
      .load()
      .mapErr((e): AppError => e)
      .andThen((graph) =>
        deps.sources
          .list()
          .mapErr((e): AppError => e)
          .map((allSources): ReportData => {
            const nodes = graph.json.nodes;
            const s = size(graph);

            const newNodes = filterNew(nodes, opts.since);
            const godNodes = topByDegree(graph, nodes, opts.maxGodNodes ?? 10);

            return {
              generated_at: new Date().toISOString(),
              since: opts.since,
              stats: {
                total_nodes: s.nodes,
                total_edges: s.edges,
                sources: allSources.length,
              },
              new_nodes: newNodes,
              god_nodes: godNodes,
            };
          }),
      );

// ─────────────── markdown renderer ──────

export const renderReport = (data: ReportData): string => {
  const lines: string[] = [];
  lines.push(`# wellinformed report`);
  lines.push(`generated: ${data.generated_at}`);
  if (data.since) lines.push(`since: ${data.since}`);
  lines.push('');

  lines.push('## Stats');
  lines.push(`- total nodes: ${data.stats.total_nodes}`);
  lines.push(`- total edges: ${data.stats.total_edges}`);
  lines.push(`- sources: ${data.stats.sources}`);
  lines.push('');

  if (data.new_nodes.length > 0) {
    lines.push(`## New nodes (${data.new_nodes.length})`);
    for (const n of data.new_nodes) {
      const sourceUri = typeof n.source_uri === 'string' ? n.source_uri : (typeof n.source_file === 'string' ? n.source_file : '');
      lines.push(`- **${n.label}** — ${sourceUri}`);
      const published = typeof n.published_at === 'string' ? n.published_at : undefined;
      if (published) lines.push(`  published: ${published}`);
    }
    lines.push('');
  }

  if (data.god_nodes.length > 0) {
    lines.push(`## Top nodes by degree`);
    for (const g of data.god_nodes) {
      lines.push(`- **${g.label}** (${g.degree} edges)${g.workspace ? ` [${g.workspace}]` : ''}`);
    }
    lines.push('');
  }

  return lines.join('\n');
};

// ─────────────── internals ──────────────

const filterNew = (
  nodes: readonly GraphNode[],
  since?: string,
): readonly GraphNode[] => {
  if (!since) return nodes;
  const cutoff = new Date(since).getTime();
  if (Number.isNaN(cutoff)) return nodes;
  return nodes.filter((n) => {
    const fetched = n.fetched_at as string | undefined;
    if (!fetched) return false;
    return new Date(fetched).getTime() >= cutoff;
  });
};

const topByDegree = (
  graph: Graph,
  nodes: readonly GraphNode[],
  max: number,
): readonly GodNode[] => {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const degrees: { id: string; label: string; degree: number; workspace?: string }[] = [];
  for (const n of nodes) {
    const adj = graph.adjacency.get(n.id);
    const degree = adj ? [...adj].filter((a) => nodeIds.has(a)).length : 0;
    degrees.push({
      id: n.id,
      label: n.label,
      degree,
      workspace: typeof n.workspace === 'string' ? n.workspace : undefined,
    });
  }
  return degrees.sort((a, b) => b.degree - a.degree).slice(0, max);
};

// keep okAsync referenced
void okAsync;
