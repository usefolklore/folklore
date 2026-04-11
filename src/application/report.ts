/**
 * Report generation use case.
 *
 * Produces a structured `ReportData` value from the current graph and
 * vector index for a given room (or globally). The data includes:
 *
 *   - room stats (node count, edge count, source count)
 *   - new nodes since a cutoff date (or all if no cutoff)
 *   - top nodes by degree ("god nodes")
 *   - tunnel candidates (cross-room pairs)
 *
 * A separate `renderReport` function turns ReportData into markdown.
 * The CLI command calls both and persists the result.
 *
 * Pure composition over existing domain + infra ports — no new deps.
 */

import { ResultAsync, okAsync } from 'neverthrow';
import type { AppError } from '../domain/errors.js';
import type { Graph, GraphNode, Room } from '../domain/graph.js';
import { nodesInRoom, size } from '../domain/graph.js';
import type { Tunnel, VectorRecord } from '../domain/vectors.js';
import { findTunnels as findTunnelsPure } from '../domain/vectors.js';
import type { GraphRepository } from '../infrastructure/graph-repository.js';
import type { VectorIndex } from '../infrastructure/vector-index.js';
import type { SourcesConfig } from '../infrastructure/sources-config.js';
import { forRoom } from '../domain/sources.js';

// ─────────────── types ──────────────────

export interface ReportOptions {
  readonly room?: Room;
  /** ISO-8601 cutoff — nodes with fetched_at after this are "new". */
  readonly since?: string;
  /** Max tunnel candidates to include. Default 10. */
  readonly maxTunnels?: number;
  /** Max god nodes to include. Default 10. */
  readonly maxGodNodes?: number;
}

export interface GodNode {
  readonly id: string;
  readonly label: string;
  readonly degree: number;
  readonly room?: string;
}

export interface ReportData {
  readonly room: Room | 'global';
  readonly generated_at: string;
  readonly since?: string;
  readonly stats: {
    readonly total_nodes: number;
    readonly total_edges: number;
    readonly room_nodes: number;
    readonly sources: number;
  };
  readonly new_nodes: readonly GraphNode[];
  readonly god_nodes: readonly GodNode[];
  readonly tunnels: readonly Tunnel[];
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
          .andThen((allSources) =>
            deps.vectors
              .all()
              .mapErr((e): AppError => e)
              .map((records): ReportData => {
                const room = opts.room;
                const roomLabel = room ?? 'global';
                const nodes = room ? nodesInRoom(graph, room) : graph.json.nodes;
                const s = size(graph);
                const sourcesForRoom = room ? forRoom(allSources, room) : allSources;

                const newNodes = filterNew(nodes, opts.since);
                const godNodes = topByDegree(graph, nodes, opts.maxGodNodes ?? 10);
                const tunnels = computeTunnels(records, opts.maxTunnels ?? 10, room);

                return {
                  room: roomLabel,
                  generated_at: new Date().toISOString(),
                  since: opts.since,
                  stats: {
                    total_nodes: s.nodes,
                    total_edges: s.edges,
                    room_nodes: nodes.length,
                    sources: sourcesForRoom.length,
                  },
                  new_nodes: newNodes,
                  god_nodes: godNodes,
                  tunnels,
                };
              }),
          ),
      );

// ─────────────── markdown renderer ──────

export const renderReport = (data: ReportData): string => {
  const lines: string[] = [];
  lines.push(`# wellinformed report — ${data.room}`);
  lines.push(`generated: ${data.generated_at}`);
  if (data.since) lines.push(`since: ${data.since}`);
  lines.push('');

  lines.push('## Stats');
  lines.push(`- total nodes: ${data.stats.total_nodes}`);
  lines.push(`- total edges: ${data.stats.total_edges}`);
  lines.push(`- room nodes: ${data.stats.room_nodes}`);
  lines.push(`- sources: ${data.stats.sources}`);
  lines.push('');

  if (data.new_nodes.length > 0) {
    lines.push(`## New nodes (${data.new_nodes.length})`);
    for (const n of data.new_nodes) {
      lines.push(`- **${n.label}** — ${n.source_uri ?? n.source_file}`);
      if (n.published_at) lines.push(`  published: ${n.published_at}`);
    }
    lines.push('');
  }

  if (data.god_nodes.length > 0) {
    lines.push(`## Top nodes by degree`);
    for (const g of data.god_nodes) {
      lines.push(`- **${g.label}** (${g.degree} edges)${g.room ? ` [${g.room}]` : ''}`);
    }
    lines.push('');
  }

  if (data.tunnels.length > 0) {
    lines.push(`## Tunnel candidates (cross-room)`);
    for (const t of data.tunnels) {
      lines.push(`- ${t.a} ↔ ${t.b} (rooms: ${t.room_a} / ${t.room_b}, distance: ${t.distance.toFixed(3)})`);
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
  const degrees: { id: string; label: string; degree: number; room?: string }[] = [];
  for (const n of nodes) {
    const adj = graph.adjacency.get(n.id);
    const degree = adj ? [...adj].filter((a) => nodeIds.has(a)).length : 0;
    degrees.push({ id: n.id, label: n.label, degree, room: n.room });
  }
  return degrees.sort((a, b) => b.degree - a.degree).slice(0, max);
};

const computeTunnels = (
  records: readonly VectorRecord[],
  max: number,
  room?: Room,
): readonly Tunnel[] => findTunnelsPure(records, 0.8, room).slice(0, max);

// keep okAsync referenced
void okAsync;
