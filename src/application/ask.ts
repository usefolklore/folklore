/**
 * `ask` use case — composes vector search + entity recall +
 * recency rerank into one unified result envelope.
 *
 * The architectural decision (per the data + solution architects'
 * review): *the policy of when to combine semantic search with
 * entity recall belongs in the application layer*. CLI / IPC / MCP
 * each become thin renderers of this AskResult shape rather than
 * each making their own composition decisions.
 *
 * Composition policy (v1):
 *
 *   1. Always run vector search (existing path — searchByRoom or
 *      searchGlobal, with k * RERANK_OVERFETCH when the room has
 *      a recency policy).
 *   2. ALSO try to resolve the raw query as an entity alias.
 *      When it hits — single-word brand names like "lemlist" or
 *      multi-word aliases like "claude code" — run `recall()` in
 *      parallel.
 *   3. Enrich every search hit with the entities it mentions
 *      (outbound `mentions` edges via the inbound-edge index).
 *      The renderer can show "this chunk mentions: lemlist,
 *      bge-base, sqlite-vec" alongside each result.
 *
 * Pure composition: no I/O orchestration beyond what the underlying
 * use cases already do. The mutex on writes doesn't apply here
 * (read-only path).
 */

import { ResultAsync, errAsync, okAsync, type Result, ok } from 'neverthrow';
import type { AppError } from '../domain/errors.js';
import type { Embedder } from '../infrastructure/embedders.js';
import type { GraphRepository } from '../infrastructure/graph-repository.js';
import type { VectorIndex } from '../infrastructure/vector-index.js';
import type { EntityRegistry } from '../infrastructure/entity-registry.js';
import type { Entity } from '../domain/entity.js';
import {
  type Graph,
  getNode,
  edgesByRelationAndSource,
} from '../domain/graph.js';
import { type Match } from '../domain/vectors.js';
import { rerankByRecency, halfLifeForRoom } from '../domain/recency-rerank.js';
import { searchByRoom, searchGlobal } from './use-cases.js';
import { recall, type RecallResult } from './recall.js';
import {
  computeSatisfaction,
  type AgentDecision,
  type EnrichedMatch,
  type SatisfactionScore,
} from '../domain/peer-telemetry.js';
import { isSystemRoomName, TOOLSHED, RESEARCH, ORACLE } from '../domain/system-rooms.js';

// ─────────────── result shape ─────────────

/**
 * A single search hit, enriched. Keeps the chunk's own metadata
 * AND a list of entities the chunk references (so the renderer
 * can show "mentions: lemlist, bge-base" alongside each hit).
 */
export interface AskHit {
  readonly node_id: string;
  readonly room?: string;
  readonly label: string;
  readonly distance: number;
  readonly source_uri?: string;
  readonly summary?: string;
  readonly fetched_at?: string;
  readonly age_days?: number;
  /** Entities this chunk mentions, joined from the registry on
   * read. Empty when no entity layer is wired (mentionsExtractor
   * was undefined during ingest). */
  readonly mentioned_entities: readonly {
    readonly id: string;
    readonly label: string;
    readonly type: string;
  }[];
}

export interface AskResult {
  readonly query: string;
  readonly room?: string;
  readonly k: number;
  /**
   * Vector-search hits, recency-reranked when the room has a
   * half-life policy. Always populated (may be empty).
   */
  readonly search_hits: readonly AskHit[];
  /**
   * Resolved entity for the raw query, if one matched a registered
   * alias. When present, `recall_result` is populated too.
   */
  readonly resolved_entity?: Entity;
  /**
   * Entity recall — every chunk that mentions the resolved entity,
   * across every room, ranked by recency × decay. Independent of
   * `search_hits` (different ranking, different cardinality).
   */
  readonly recall_result?: RecallResult;
  /**
   * Whether recency rerank actually fired on the search side.
   * Renderers print "ranked by: relevance × recency-decay" when true.
   */
  readonly reranked: boolean;
  /**
   * Completeness score computed over the merged search + recall
   * evidence. The agent contract — Claude / Codex / etc. read this
   * to decide whether to fall through to WebSearch.
   *
   *   ≥ 0.85  →  use_memory
   *   ≥ 0.65  →  verify_one_source
   *   ≥ 0.40  →  search_required
   *   <  0.40 →  ask_user
   */
  readonly satisfaction: SatisfactionScore;
  /**
   * Recommended next action for the agent. Stable string set —
   * see AgentDecision in domain/peer-telemetry.ts. v2 will overlay
   * task-risk + coverage-map signals; v1 is pure threshold over
   * satisfaction.score.
   */
  readonly decision: AgentDecision;
}

// ─────────────── deps ─────────────────────

export interface AskDeps {
  readonly graphs: GraphRepository;
  readonly vectors: VectorIndex;
  readonly embedder: Embedder;
  readonly entityRegistry: EntityRegistry;
}

// ─────────────── inputs ───────────────────

export interface AskParams {
  readonly query: string;
  readonly room?: string;
  readonly k: number;
}

// ─────────────── helpers ──────────────────

/** Overfetch factor when the room has a recency-decay policy.
 * Search returns k * factor; rerank promotes age-favored hits;
 * we slice to k. Single source of truth (was duplicated in CLI
 * and IPC). */
const RERANK_OVERFETCH = 4;

/** Per-room stale-window in days — same windows the recency rerank
 * uses. Drives the `freshness` component of the satisfaction score
 * (a hit older than its window penalises freshness). */
const staleWindowFor = (room: string | undefined): number | undefined => {
  if (!room) return undefined;
  if (room === TOOLSHED.name) return TOOLSHED.staleAfterDays;
  if (room === RESEARCH.name) return RESEARCH.staleAfterDays;
  if (room === ORACLE.name) return ORACLE.staleAfterDays;
  if (isSystemRoomName(room)) return undefined;
  return undefined; // user rooms have no canonical window; scorer falls back to 14d
};

/**
 * Pick the agent action from satisfaction.score using v1 thresholds.
 * Stable surface — the same set used in peer-pull-telemetry's
 * federated path. Single source so future tuning lands in one place.
 */
const pickDecision = (s: SatisfactionScore): AgentDecision => {
  if (s.score >= 0.85) return 'use_memory';
  if (s.score >= 0.65) return 'verify_one_source';
  if (s.score >= 0.40) return 'search_required';
  return 'ask_user';
};

/**
 * Convert an AskHit into the EnrichedMatch shape the satisfaction
 * scorer expects. Source-peer is null (local-only path); also-from
 * is empty.
 */
const toEnriched = (h: AskHit, fetchedAt?: string): EnrichedMatch => ({
  node_id: h.node_id,
  room: h.room ?? '',
  distance: h.distance,
  source_peer: null,
  also_from_peers: [],
  source_uri: h.source_uri,
  fetched_at: fetchedAt ?? h.fetched_at,
  age_days: h.age_days,
  stale_after_days: staleWindowFor(h.room),
  has_signature: undefined,
});

/**
 * Convert a recall hit (no distance — every recall hit is exact-
 * match on the entity) to an EnrichedMatch. Synthesises distance=0
 * so `retrieval_quality` reflects the exact match, not a missing
 * field.
 */
const recallHitToEnriched = (
  h: RecallResult['hits'][number],
): EnrichedMatch => ({
  node_id: h.node_id,
  room: h.room ?? '',
  distance: 0,
  source_peer: null,
  also_from_peers: [],
  source_uri: h.source_uri,
  fetched_at: h.fetched_at,
  age_days: h.age_days,
  stale_after_days: staleWindowFor(h.room),
  has_signature: undefined,
});

/** Extract entity refs from a single chunk by walking outbound
 * `mentions` edges via the indexed accessor. Joins the registry
 * to get the canonical label + type. Empty when the chunk has no
 * mentions or the registry doesn't know the target. */
const enrichMentions = (
  graph: Graph,
  nodeId: string,
  registry: EntityRegistry,
): readonly { id: string; label: string; type: string }[] => {
  const edges = edgesByRelationAndSource(graph, 'mentions', nodeId);
  if (edges.length === 0) return [];
  const out: { id: string; label: string; type: string }[] = [];
  const seen = new Set<string>();
  for (const e of edges) {
    if (seen.has(e.target)) continue;
    seen.add(e.target);
    const ent = registry.getById(e.target);
    if (!ent) continue;
    out.push({ id: ent.id, label: ent.label, type: ent.type });
  }
  return out;
};

const buildHit = (
  m: Match,
  graph: Graph,
  registry: EntityRegistry,
  nowMs: number,
): AskHit => {
  const node = getNode(graph, m.node_id);
  const fetchedAt = typeof node?.fetched_at === 'string' ? node.fetched_at : undefined;
  const fetchedMs = fetchedAt ? Date.parse(fetchedAt) : NaN;
  const ageDays = Number.isFinite(fetchedMs)
    ? Number(((nowMs - fetchedMs) / 86_400_000).toFixed(2))
    : undefined;
  const summary = typeof node?.summary === 'string' ? (node.summary as string) : undefined;
  return {
    node_id: m.node_id,
    room: node?.room,
    label: node?.label ?? m.node_id,
    distance: m.distance,
    source_uri: node?.source_uri ?? node?.source_file,
    summary,
    fetched_at: fetchedAt,
    age_days: ageDays,
    mentioned_entities: enrichMentions(graph, m.node_id, registry),
  };
};

// ─────────────── the use case ─────────────

export const ask =
  (deps: AskDeps) =>
  (params: AskParams): ResultAsync<AskResult, AppError> => {
    const willRerank = params.room
      ? halfLifeForRoom(params.room) !== undefined
      : false;
    const fetchK = willRerank ? params.k * RERANK_OVERFETCH : params.k;

    const useDeps = {
      graphs: deps.graphs,
      vectors: deps.vectors,
      embedder: deps.embedder,
    };

    // 1. Vector search (overfetched when reranking)
    const searchRes = params.room
      ? searchByRoom(useDeps)({ room: params.room, text: params.query, k: fetchK })
      : searchGlobal(useDeps)({ text: params.query, k: fetchK });

    return searchRes.andThen((matches) =>
      // 2. Single graph load — used for hit enrichment AND the
      // recall path (entities live in the same Graph).
      deps.graphs
        .load()
        .mapErr((e): AppError => e)
        .andThen((graph) => {
          const nowMs = Date.now();

          // 3. Build search hits with mention enrichment
          const enriched = matches.map((m) => buildHit(m, graph, deps.entityRegistry, nowMs));

          // 4. Apply rerank when ANY hit's room has a policy
          const anyRerank = enriched.some(
            (h) => halfLifeForRoom(h.room) !== undefined,
          );
          // rerankByRecency takes RankableMatch — our AskHit has the
          // right shape (node_id, room, distance, age_days)
          const reranked = anyRerank ? rerankByRecession(enriched) : enriched;
          const search_hits = reranked.slice(0, params.k);

          // 5. Try to resolve the raw query as an entity alias.
          // Single-token queries like "lemlist" or compound aliases
          // like "claude code" → recall surfaces alongside search.
          const resolvedEntity = deps.entityRegistry.resolve(params.query.trim());

          // Helper — compute satisfaction over the merged evidence
          // (search hits + recall hits when present). Single scorer,
          // single decision, surfaced on every AskResult so the
          // smart-hook / CLI / IPC / MCP all expose the same agent
          // contract: should the agent fall through to WebSearch?
          const buildSatisfaction = (
            recallHits: readonly RecallResult['hits'][number][] = [],
          ): { satisfaction: SatisfactionScore; decision: AgentDecision } => {
            const enrichedAll: EnrichedMatch[] = [
              ...search_hits.map((h) => toEnriched(h)),
              ...recallHits.map(recallHitToEnriched),
            ];
            const satisfaction = computeSatisfaction(enrichedAll);
            return { satisfaction, decision: pickDecision(satisfaction) };
          };

          if (!resolvedEntity) {
            const { satisfaction, decision } = buildSatisfaction();
            return okAsync<AskResult, AppError>({
              query: params.query,
              room: params.room,
              k: params.k,
              search_hits,
              reranked: anyRerank,
              satisfaction,
              decision,
            });
          }

          // 6. Recall — runs against the same loaded graph; no
          // second I/O round-trip.
          const recallRes = recall(
            { registry: deps.entityRegistry, graph },
            { query: resolvedEntity.id, limit: params.k, room: params.room },
          );
          if (recallRes.isErr()) {
            const { satisfaction, decision } = buildSatisfaction();
            return okAsync<AskResult, AppError>({
              query: params.query,
              room: params.room,
              k: params.k,
              search_hits,
              resolved_entity: resolvedEntity,
              reranked: anyRerank,
              satisfaction,
              decision,
            });
          }
          const { satisfaction, decision } = buildSatisfaction(recallRes.value.hits);
          return okAsync<AskResult, AppError>({
            query: params.query,
            room: params.room,
            k: params.k,
            search_hits,
            resolved_entity: resolvedEntity,
            recall_result: recallRes.value,
            reranked: anyRerank,
            satisfaction,
            decision,
          });
        }),
    );
  };

// rerankByRecency adapter — the rerank type wants a slim
// RankableMatch shape; our AskHit has the same fields plus extras
// so it conforms structurally.
const rerankByRecession = (hits: readonly AskHit[]): readonly AskHit[] =>
  rerankByRecency(hits) as readonly AskHit[];

// Silence unused parity imports.
void errAsync;
void ok;
type _Result<A, B> = Result<A, B>;
void (null as unknown as _Result<unknown, unknown>);
