/**
 * Recall — entity-first lookup across the knowledge graph.
 *
 * Given a name like "lemlist", resolves it to the canonical entity
 * (registry is source-of-truth for entity metadata), traverses every
 * `mentions` edge into source chunks, ranks the results by
 * recency × frequency. Returns a unified timeline across every
 * room: research, sessions, toolshed, user-defined.
 *
 * Schema invariant: entity GraphNodes are stubs (id + kind + forward
 * pointer to entities.json). Canonical entity state — label,
 * aliases, mention_count, first_seen, last_seen — lives ONLY in
 * the registry. Recall joins the two on read, never on write.
 * This eliminates the dual-write drift class flagged in the
 * architectural review.
 *
 * Pure (no I/O of its own — calls into the registry + graph). All
 * the rendering work happens at the CLI / MCP boundary.
 */

import { type Result, ok, err } from 'neverthrow';
import { type Entity } from '../domain/entity.js';
import { type Graph, type GraphEdge, edgesByRelationAndTarget } from '../domain/graph.js';
import { type EntityRegistry } from '../infrastructure/entity-registry.js';

/**
 * One row in the recall result — the chunk that mentioned the
 * entity, plus enough metadata for the UI to render it.
 */
export interface RecallHit {
  readonly node_id: string;
  readonly room?: string;
  readonly label: string;
  readonly source_uri?: string;
  readonly fetched_at?: string;
  readonly age_days?: number;
  readonly summary?: string;
  readonly surface: string;        // the exact substring that matched
}

export interface RecallResult {
  readonly entity: Entity;
  readonly hits: readonly RecallHit[];
  readonly total: number;          // hits.length BEFORE the limit slice
}

export type RecallError =
  | { readonly type: 'EntityNotFound'; readonly query: string }
  | { readonly type: 'GraphLoadError'; readonly message: string };

// ─────────────── ranking ───────────────────

/**
 * Combined score = relevance × recency-decay.
 *   relevance = 1 (every mention is a direct hit by definition)
 *   decay     = 0.5 ^ (age_days / half_life_days)
 *
 * No half-life policy => stays at 1. Recall ordering then becomes
 * pure recency (newest first), which is the right default for a
 * "what do I know about X" query.
 */
const HALF_LIFE_BY_ROOM: ReadonlyMap<string, number> = new Map([
  ['sessions', 30],
  ['research', 14],
  ['toolshed', 60],
]);

const score = (h: RecallHit): number => {
  const halfLife = h.room ? HALF_LIFE_BY_ROOM.get(h.room) : undefined;
  if (halfLife === undefined || h.age_days === undefined) return 1;
  return Math.pow(0.5, h.age_days / halfLife);
};

// ─────────────── helpers ───────────────────

const resolve = (
  registry: EntityRegistry,
  query: string,
): Entity | undefined => {
  // Try canonical id first (already-resolved callers), then alias.
  return registry.getById(query) ?? registry.resolve(query);
};

/**
 * All edges with `relation === 'mentions'` whose target is the
 * entity. Uses the inbound edge index built during `fromJson`
 * (Graph.edgesByRelTarget). Constant-time lookup vs the linear
 * scan over `json.links` this used to do — at 50k edges with
 * 10k mentions, that scan was 14ns × 50k = 700µs per call AND
 * grew with TOTAL edges, not just mentions. The architectural
 * review flagged it as the wrong cost gradient since recall
 * fires on every PreToolUse that hits an entity surface.
 */
const mentionEdges = (graph: Graph, entityId: string): readonly GraphEdge[] =>
  edgesByRelationAndTarget(graph, 'mentions', entityId);

const enrichHit = (
  graph: Graph,
  edge: GraphEdge,
  now: number,
): RecallHit | null => {
  const node = graph.nodeById.get(edge.source);
  if (!node) return null;
  const fetchedAt =
    typeof node.fetched_at === 'string' ? node.fetched_at : undefined;
  const fetchedMs = fetchedAt ? Date.parse(fetchedAt) : NaN;
  const ageDays = Number.isFinite(fetchedMs)
    ? Number(((now - fetchedMs) / 86_400_000).toFixed(2))
    : undefined;
  const summary =
    typeof node.summary === 'string' ? (node.summary as string) : undefined;
  const surface =
    typeof edge.surface === 'string' ? (edge.surface as string) : node.label;
  return {
    node_id: node.id,
    room: node.room,
    label: node.label,
    source_uri: node.source_uri ?? node.source_file,
    fetched_at: fetchedAt,
    age_days: ageDays,
    summary,
    surface,
  };
};

// ─────────────── use case ──────────────────

export interface RecallParams {
  readonly query: string;
  readonly limit?: number;          // default 20
  readonly room?: string;           // optional room filter
}

export interface RecallDeps {
  readonly registry: EntityRegistry;
  readonly graph: Graph;
}

/**
 * The single entry point. Synchronous because everything's already
 * loaded — callers pull the Graph + Registry from the daemon
 * runtime and pass them in.
 */
export const recall = (
  deps: RecallDeps,
  params: RecallParams,
): Result<RecallResult, RecallError> => {
  const ent = resolve(deps.registry, params.query);
  if (!ent) return err({ type: 'EntityNotFound', query: params.query });

  const limit = params.limit ?? 20;
  const now = Date.now();
  const edges = mentionEdges(deps.graph, ent.id);

  const enriched: RecallHit[] = [];
  for (const e of edges) {
    const hit = enrichHit(deps.graph, e, now);
    if (!hit) continue;
    if (params.room && hit.room !== params.room) continue;
    enriched.push(hit);
  }

  // Rank: combined score (relevance × decay), then by fetched_at desc as tiebreak.
  enriched.sort((a, b) => {
    const ds = score(b) - score(a);
    if (ds !== 0) return ds;
    return (b.fetched_at ?? '').localeCompare(a.fetched_at ?? '');
  });

  return ok({
    entity: ent,
    hits: enriched.slice(0, limit),
    total: enriched.length,
  });
};
