/**
 * Pure domain model for the folklore knowledge graph.
 *
 * This module owns the vocabulary (Node, Edge, Graph, Wing) and
 * the pure transformations over it. No I/O, no mutation, no throws —
 * every operation that can fail returns a `Result<Graph, GraphError>`.
 *
 * The on-wire format is NetworkX node-link JSON with `edges="links"`,
 * which is what graphify writes and reads. See `fromJson` / `toJson`
 * for the round-trip.
 *
 * Design notes
 * ------------
 * - Graphs are immutable values. Every transformation returns a NEW
 *   Graph. Internal state uses plain Maps/Sets for O(1) lookups; we
 *   rebuild them lazily when the graph is reconstructed from JSON.
 * - Node and edge collections are stored as arrays in the JSON payload
 *   (for round-trip fidelity with graphify) and as indexes for
 *   traversal.
 * - BFS/DFS/shortestPath are expressed as pure functions that take a
 *   Graph + options and return a sub-graph.
 */

import { Result, err, ok } from 'neverthrow';
import { GraphError } from './errors.js';

// ─────────────────────── types ────────────────────────────

export type NodeId = string;
export type Wing = string;

/** graphify-required node fields. */
export interface GraphifyNodeCore {
  readonly id: NodeId;
  readonly label: string;
  readonly file_type: 'code' | 'document' | 'paper' | 'image' | 'rationale';
  readonly source_file: string;
}

/** folklore-added optional fields. Declared in graphify.validate.OPTIONAL_NODE_FIELDS. */
export interface FolkloreNodeFields {
  readonly wing?: Wing;
  readonly source_uri?: string;
  readonly fetched_at?: string;
  readonly embedding_id?: string;
  /** Optional workspace tag — populated from cwd's git toplevel basename at write time.
   *  LOCAL-ONLY. Never enters federation wire envelope. */
  readonly workspace?: string;
  /**
   * Sharing gate. True = never federates. Defaults to false at write time.
   *
   * V5 (Phase 24): optional at the type level so existing source
   * adapters (claude_sessions, generic_rss, codebase, …) can be
   * surgically edited in later waves without forcing a synchronous
   * sweep of every node-construction site. The persistence layer
   * (graph repository → indexNode) stamps `private: false` whenever
   * the field is absent, preserving the "explicit at the boundary"
   * intent of the original schema.
   */
  readonly private?: boolean;
  /**
   * GitHub identity of the author at write time. Optional pending
   * Phase 26 (GitHub-as-primary identity); the field is reserved so
   * future write sites and federation envelopes can key on a single
   * canonical user identity without re-bumping the schema. Reads the
   * `accounts.github.handle` from ~/.folklore/linked-accounts.json
   * at write time when `folklore login` has been run.
   *
   * IMPORTANT: Phase 26 will:
   *   1. Stamp this field at every write site (save, source adapters,
   *      consolidation, etc.)
   *   2. Add a write-time gate that refuses unsigned nodes
   *   3. Migrate existing nodes via `migrate v5 --stamp-github`
   * Until then, the field is unset on existing nodes and treated as
   * "unknown author" by readers.
   */
  readonly github_user?: string;
}

/** A single graph node. Arbitrary extra keys are preserved through round-trip. */
export type GraphNode = GraphifyNodeCore & FolkloreNodeFields & Readonly<Record<string, unknown>>;

/** A single graph edge. Undirected. */
export interface GraphEdge {
  readonly source: NodeId;
  readonly target: NodeId;
  readonly relation: string;
  readonly confidence: 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS';
  readonly source_file: string;
  readonly confidence_score?: number;
  readonly [extra: string]: unknown;
}

/** NetworkX node-link JSON envelope. */
export interface GraphJson {
  readonly directed: boolean;
  readonly multigraph: boolean;
  readonly graph: Readonly<Record<string, unknown>> & { readonly hyperedges?: readonly unknown[] };
  readonly nodes: readonly GraphNode[];
  readonly links: readonly GraphEdge[];
}

/**
 * Opaque immutable graph value. The `nodes` / `links` arrays and the
 * `nodeById` / `adjacency` indexes are all frozen on construction, so
 * no accidental mutation can slip through.
 *
 * Callers should treat Graph as a value type: produce new graphs via
 * the functions in this module rather than reaching into the fields.
 */
export interface Graph {
  readonly json: GraphJson;
  readonly nodeById: ReadonlyMap<NodeId, GraphNode>;
  readonly adjacency: ReadonlyMap<NodeId, ReadonlySet<NodeId>>;
  /**
   * Inbound edge index keyed by `relationtarget` — answers
   * "which edges of relation R point at target T". Built once at
   * graph load; O(1) lookup per recall.
   *
   * Necessary because a linear scan over `json.links` is O(all
   * edges) per query. With chunk graphs already at 14k+ edges and
   * `next_chunk` accounting for ~90% of those, recall.ts's
   * `relation === 'mentions' && target === entityId` filter scaled
   * with TOTAL edges, not mention edges — the wrong cost gradient.
   */
  readonly edgesByRelTarget: ReadonlyMap<string, readonly GraphEdge[]>;
  /**
   * Outbound edge index keyed by `relationsource` — answers
   * "which edges of relation R leave source S". Used by federated
   * recall responders to filter mentions per chunk during the
   * shared-rooms gate, and by future "what entities does this
   * chunk reference" lookups.
   */
  readonly edgesByRelSource: ReadonlyMap<string, readonly GraphEdge[]>;
}

const relEdgeKey = (relation: string, id: NodeId): string => `${relation}${id}`;

/** Public accessor for the inbound edge index. Hides the key shape. */
export const edgesByRelationAndTarget = (
  g: Graph,
  relation: string,
  target: NodeId,
): readonly GraphEdge[] => g.edgesByRelTarget.get(relEdgeKey(relation, target)) ?? [];

/** Public accessor for the outbound edge index. */
export const edgesByRelationAndSource = (
  g: Graph,
  relation: string,
  source: NodeId,
): readonly GraphEdge[] => g.edgesByRelSource.get(relEdgeKey(relation, source)) ?? [];

/** Search result for traversal queries. */
export interface Subgraph {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

/** Options for traversal queries. */
export interface TraversalOptions {
  readonly depth?: number;
}

// ─────────────────────── constants ────────────────────────

const REQUIRED_NODE_FIELDS = ['id', 'label', 'file_type', 'source_file'] as const;
const REQUIRED_EDGE_FIELDS = ['source', 'target', 'relation', 'confidence', 'source_file'] as const;

const EMPTY_JSON: GraphJson = {
  directed: false,
  multigraph: false,
  graph: { hyperedges: [] },
  nodes: [],
  links: [],
};

// ─────────────────────── construction ─────────────────────

/** An empty graph. */
export const empty = (): Graph => fromJsonUnchecked(EMPTY_JSON);

/**
 * Parse raw JSON into a validated Graph. Rejects malformed input at
 * the boundary. Accepts both `links` (graphify's canonical) and
 * `edges` (for compatibility with older NetworkX JSON dumps).
 */
export const fromJson = (raw: unknown, path = '<memory>'): Result<Graph, GraphError> => {
  if (!raw || typeof raw !== 'object') {
    return err(GraphError.parseError(path, 'graph root must be an object'));
  }
  const obj = raw as Record<string, unknown>;
  const nodes = Array.isArray(obj.nodes) ? (obj.nodes as GraphNode[]) : [];
  const links: readonly GraphEdge[] = Array.isArray(obj.links)
    ? (obj.links as GraphEdge[])
    : Array.isArray(obj.edges)
      ? (obj.edges as GraphEdge[])
      : [];
  const graph = (typeof obj.graph === 'object' && obj.graph !== null
    ? (obj.graph as GraphJson['graph'])
    : { hyperedges: [] }) as GraphJson['graph'];

  // Validate every node. We're strict at the boundary so downstream
  // domain ops can assume every node has the required fields.
  for (const n of nodes) {
    for (const f of REQUIRED_NODE_FIELDS) {
      if (!n[f]) return err(GraphError.invalidNode(f, n.id));
    }
  }
  for (const e of links) {
    for (const f of REQUIRED_EDGE_FIELDS) {
      if (!e[f]) return err(GraphError.invalidEdge(f));
    }
  }

  const json: GraphJson = {
    directed: Boolean(obj.directed),
    multigraph: Boolean(obj.multigraph),
    graph,
    nodes,
    links,
  };
  return ok(fromJsonUnchecked(json));
};

/** Serialize a Graph to the NetworkX node-link JSON shape. */
export const toJson = (g: Graph): GraphJson => g.json;

// ─────────────────────── queries ──────────────────────────

export const size = (g: Graph): { nodes: number; edges: number } => ({
  nodes: g.json.nodes.length,
  edges: g.json.links.length,
});

export const getNode = (g: Graph, id: NodeId): GraphNode | undefined => g.nodeById.get(id);

export const hasNode = (g: Graph, id: NodeId): boolean => g.nodeById.has(id);

export const neighbors = (g: Graph, id: NodeId): readonly GraphNode[] => {
  const adj = g.adjacency.get(id);
  if (!adj) return [];
  const out: GraphNode[] = [];
  for (const nid of adj) {
    const n = g.nodeById.get(nid);
    if (n) out.push(n);
  }
  return out;
};

// ─────────────────────── traversal ────────────────────────

/** Breadth-first traversal from a set of starting nodes. */
export const bfs = (g: Graph, start: readonly NodeId[], opts: TraversalOptions = {}): Subgraph => {
  const depth = opts.depth ?? 3;
  const visited = new Set<NodeId>();
  const frontier: NodeId[] = [];
  for (const s of start) {
    if (g.nodeById.has(s)) {
      visited.add(s);
      frontier.push(s);
    }
  }
  let current = frontier;
  for (let d = 0; d < depth; d++) {
    const next: NodeId[] = [];
    for (const nid of current) {
      const adj = g.adjacency.get(nid);
      if (!adj) continue;
      for (const m of adj) {
        if (visited.has(m)) continue;
        visited.add(m);
        next.push(m);
      }
    }
    if (next.length === 0) break;
    current = next;
  }
  return subgraph(g, visited);
};

/** Depth-first traversal from a set of starting nodes. */
export const dfs = (g: Graph, start: readonly NodeId[], opts: TraversalOptions = {}): Subgraph => {
  const depth = opts.depth ?? 3;
  const visited = new Set<NodeId>();
  const stack: Array<[NodeId, number]> = [];
  for (let i = start.length - 1; i >= 0; i--) {
    const s = start[i];
    if (g.nodeById.has(s)) stack.push([s, 0]);
  }
  while (stack.length > 0) {
    const [nid, d] = stack.pop()!;
    if (visited.has(nid) || d > depth) continue;
    visited.add(nid);
    const adj = g.adjacency.get(nid);
    if (!adj) continue;
    for (const m of adj) {
      if (visited.has(m)) continue;
      stack.push([m, d + 1]);
    }
  }
  return subgraph(g, visited);
};

/** Unweighted shortest path (BFS). Returns an empty array if no path. */
export const shortestPath = (
  g: Graph,
  source: NodeId,
  target: NodeId,
  maxHops = 8,
): readonly NodeId[] => {
  if (!g.nodeById.has(source) || !g.nodeById.has(target)) return [];
  if (source === target) return [source];
  const prev = new Map<NodeId, NodeId>();
  const visited = new Set<NodeId>([source]);
  const queue: NodeId[] = [source];
  let hops = 0;
  while (queue.length > 0 && hops <= maxHops) {
    const layerSize = queue.length;
    for (let i = 0; i < layerSize; i++) {
      const nid = queue.shift()!;
      const adj = g.adjacency.get(nid);
      if (!adj) continue;
      for (const m of adj) {
        if (visited.has(m)) continue;
        visited.add(m);
        prev.set(m, nid);
        if (m === target) return reconstruct(prev, source, target);
        queue.push(m);
      }
    }
    hops++;
  }
  return [];
};

// ─────────────────────── mutators (pure) ──────────────────

/**
 * Insert or update a node. Returns a new graph with the node applied.
 * Existing attributes are merged shallowly — pass only the fields you
 * want to change.
 */
export const upsertNode = (g: Graph, node: GraphNode): Result<Graph, GraphError> => {
  for (const f of REQUIRED_NODE_FIELDS) {
    if (!node[f]) return err(GraphError.invalidNode(f, node.id));
  }
  const existing = g.nodeById.get(node.id);
  const merged: GraphNode = existing ? { ...existing, ...node } : { ...node };
  const nodes = existing
    ? g.json.nodes.map((n) => (n.id === node.id ? merged : n))
    : [...g.json.nodes, merged];
  return ok(fromJsonUnchecked({ ...g.json, nodes }));
};

/**
 * Wholesale replace a node — discard ALL existing attributes, write
 * exactly the provided shape.
 *
 * Use this for entity stubs (codex review M5 on batch-ingest.ts:267):
 * canonical entity fields (`aliases`, `mention_count`, `note`) live
 * in `entities.json`, not the graph. A previous schema (or a third-
 * party tool that wrote the graph file) might have left those fields
 * on a stub node — `upsertNode`'s shallow merge would preserve them
 * forever even after entities.json moved on. `replaceNode` enforces
 * "graph stub IS the canonical projection, nothing else."
 */
export const replaceNode = (g: Graph, node: GraphNode): Result<Graph, GraphError> => {
  for (const f of REQUIRED_NODE_FIELDS) {
    if (!node[f]) return err(GraphError.invalidNode(f, node.id));
  }
  const existed = g.nodeById.has(node.id);
  const replacement: GraphNode = { ...node };
  const nodes = existed
    ? g.json.nodes.map((n) => (n.id === node.id ? replacement : n))
    : [...g.json.nodes, replacement];
  return ok(fromJsonUnchecked({ ...g.json, nodes }));
};

/**
 * Insert or update an edge. Both endpoints must already exist. Edges
 * are undirected — the same pair (a,b) and (b,a) refer to the same
 * edge, keyed by the sorted pair.
 */
export const upsertEdge = (g: Graph, edge: GraphEdge): Result<Graph, GraphError> => {
  for (const f of REQUIRED_EDGE_FIELDS) {
    if (!edge[f]) return err(GraphError.invalidEdge(f));
  }
  if (!g.nodeById.has(edge.source)) return err(GraphError.danglingEdge(edge.source, edge.target));
  if (!g.nodeById.has(edge.target)) return err(GraphError.danglingEdge(edge.source, edge.target));

  const key = edgeKey(edge.source, edge.target);
  const existingIdx = g.json.links.findIndex((e) => edgeKey(e.source, e.target) === key);
  if (existingIdx >= 0) {
    const merged: GraphEdge = { ...g.json.links[existingIdx], ...edge };
    const links = g.json.links.map((e, i) => (i === existingIdx ? merged : e));
    return ok(fromJsonUnchecked({ ...g.json, links }));
  }
  return ok(fromJsonUnchecked({ ...g.json, links: [...g.json.links, edge] }));
};

/** Remove a node and all edges incident to it. */
export const removeNode = (g: Graph, id: NodeId): Result<Graph, GraphError> => {
  if (!g.nodeById.has(id)) return err(GraphError.nodeNotFound(id));
  const nodes = g.json.nodes.filter((n) => n.id !== id);
  const links = g.json.links.filter((e) => e.source !== id && e.target !== id);
  return ok(fromJsonUnchecked({ ...g.json, nodes, links }));
};

// ─────────────────────── internals ────────────────────────

/** Build the indexed Graph view from a JSON envelope. Private. */
const fromJsonUnchecked = (json: GraphJson): Graph => {
  const nodeById = new Map<NodeId, GraphNode>();
  const adjacency = new Map<NodeId, Set<NodeId>>();
  for (const n of json.nodes) {
    nodeById.set(n.id, n);
    if (!adjacency.has(n.id)) adjacency.set(n.id, new Set());
  }
  // Inbound + outbound edge indices keyed by `${relation}${id}`.
  // Built in the same loop that updates adjacency to keep load
  // cost O(edges). Memory: ~50 bytes per edge × edge count.
  const edgesByRelTarget = new Map<string, GraphEdge[]>();
  const edgesByRelSource = new Map<string, GraphEdge[]>();
  for (const e of json.links) {
    const a = adjacency.get(e.source) ?? new Set<NodeId>();
    const b = adjacency.get(e.target) ?? new Set<NodeId>();
    a.add(e.target);
    b.add(e.source);
    adjacency.set(e.source, a);
    adjacency.set(e.target, b);

    const tk = relEdgeKey(e.relation, e.target);
    const sk = relEdgeKey(e.relation, e.source);
    const tArr = edgesByRelTarget.get(tk);
    if (tArr) tArr.push(e);
    else edgesByRelTarget.set(tk, [e]);
    const sArr = edgesByRelSource.get(sk);
    if (sArr) sArr.push(e);
    else edgesByRelSource.set(sk, [e]);
  }
  // Freeze to make mutation-via-cast impossible.
  return Object.freeze({
    json,
    nodeById,
    adjacency,
    edgesByRelTarget,
    edgesByRelSource,
  });
};

const subgraph = (g: Graph, nodeIds: ReadonlySet<NodeId>): Subgraph => {
  const nodes: GraphNode[] = [];
  for (const id of nodeIds) {
    const n = g.nodeById.get(id);
    if (n) nodes.push(n);
  }
  const edges = g.json.links.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
  return { nodes, edges };
};

const edgeKey = (a: NodeId, b: NodeId): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

const reconstruct = (
  prev: Map<NodeId, NodeId>,
  source: NodeId,
  target: NodeId,
): readonly NodeId[] => {
  const path: NodeId[] = [target];
  let cur = target;
  while (cur !== source) {
    const p = prev.get(cur);
    if (!p) return [];
    path.push(p);
    cur = p;
  }
  return path.reverse();
};
