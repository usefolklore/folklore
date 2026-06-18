/**
 * `ask` use case — composes vector search + entity recall +
 * recency rerank into one unified result envelope.
 *
 * V5 (Phase 24): workspace-agnostic. The CLI layer applies workspace
 * pre-filter on the returned AskResult; this layer queries the whole
 * graph and returns workspace metadata on each hit so callers can
 * filter at the boundary.
 *
 * Composition policy:
 *   1. Always run global vector search (room-scoped search is gone).
 *   2. ALSO try to resolve the raw query as an entity alias; if it hits,
 *      run `recall()` to surface every chunk mentioning that entity.
 *   3. Enrich every search hit with the entities it mentions.
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
  empty as emptyGraph,
} from '../domain/graph.js';
import { type Match, multiRrfFuse } from '../domain/vectors.js';
import { rerankByRecency } from '../domain/recency-rerank.js';
import { pprRerank } from '../domain/graph-rerank.js';
import { rerankMatches, type CrossEncoderScorer } from '../domain/cross-rerank.js';
import { crossEncoderFromEnv } from '../infrastructure/cross-encoder.js';

// Module-scope reranker — resolved once at first import from env.
const crossReranker: CrossEncoderScorer | null = crossEncoderFromEnv();
import { metrics } from '../domain/metrics.js';
import { searchGlobal } from './use-cases.js';
import { recall, type RecallResult } from './recall.js';
import {
  computeSatisfaction,
  decideContract,
  classifyRisk,
  type AgentContract,
  type AgentDecision,
  type EnrichedMatch,
  type SatisfactionScore,
} from '../domain/peer-telemetry.js';
import { extractQueryTerms } from '../domain/coverage.js';

// ─────────────── result shape ─────────────

/**
 * A single search hit, enriched. Carries the chunk's workspace tag
 * (V5) so the CLI can apply a workspace pre-filter at the boundary.
 */
export interface AskHit {
  readonly node_id: string;
  readonly workspace?: string;
  readonly label: string;
  readonly distance: number;
  readonly source_uri?: string;
  readonly summary?: string;
  readonly fetched_at?: string;
  readonly age_days?: number;
  readonly mentioned_entities: readonly {
    readonly id: string;
    readonly label: string;
    readonly type: string;
  }[];
}

export interface AskResult {
  readonly query: string;
  readonly k: number;
  readonly search_hits: readonly AskHit[];
  readonly resolved_entity?: Entity;
  readonly recall_result?: RecallResult;
  readonly reranked: boolean;
  readonly satisfaction: SatisfactionScore;
  /** Back-compat alias for `contract.decision`. */
  readonly decision: AgentDecision;
  /** The full RFC-0003 agent contract (decision + risk + trace + summary). */
  readonly contract: AgentContract;
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
  readonly k: number;
}

// ─────────────── helpers ──────────────────

/** Overfetch factor when applying recency rerank — search returns
 * k * factor; rerank promotes age-favored hits; we slice to k. */
const RERANK_OVERFETCH = 4;

const toEnriched = (h: AskHit, fetchedAt?: string, vecDistance?: number): EnrichedMatch => ({
  node_id: h.node_id,
  distance: h.distance,
  // True cosine distance from the original vector search (before PPR/recency
  // rerank rewrote `distance`). The satisfaction relevance gate needs this;
  // h.distance is a centrality-blended ranking distance, not a relevance one.
  vec_distance: vecDistance,
  source_peer: null,
  also_from_peers: [],
  source_uri: h.source_uri,
  fetched_at: fetchedAt ?? h.fetched_at,
  age_days: h.age_days,
  stale_after_days: undefined,
  has_signature: undefined,
});

const recallHitToEnriched = (
  h: RecallResult['hits'][number],
): EnrichedMatch => ({
  node_id: h.node_id,
  distance: 0,
  source_peer: null,
  also_from_peers: [],
  source_uri: h.source_uri,
  fetched_at: h.fetched_at,
  age_days: h.age_days,
  stale_after_days: undefined,
  has_signature: undefined,
});

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
  const workspace = typeof node?.workspace === 'string' ? node.workspace : undefined;
  return {
    node_id: m.node_id,
    workspace,
    label: node?.label ?? m.node_id,
    distance: m.distance,
    source_uri: node?.source_uri ?? (typeof node?.source_file === 'string' ? node.source_file as string : undefined),
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
    const t0 = performance.now();
    metrics.counter('ask.calls').inc();

    // V5: always overfetch for the rerank stage. The recency rerank
    // is now uniform-half-life (14d global) — apply it for every query.
    const fetchK = params.k * RERANK_OVERFETCH;

    const useDeps = {
      graphs: deps.graphs,
      vectors: deps.vectors,
      embedder: deps.embedder,
    };

    // 0. Early entity resolution.
    let resolvedEntity: Entity | undefined;
    try {
      const trimmed = params.query.trim();
      resolvedEntity =
        deps.entityRegistry.getById(trimmed) ??
        deps.entityRegistry.resolve(trimmed);
    } catch {
      resolvedEntity = undefined;
    }

    // 0.5 ALIAS-BASED QUERY EXPANSION.
    const queryTexts: string[] = [params.query];
    if (resolvedEntity && resolvedEntity.aliases.length > 0) {
      const seen = new Set<string>([params.query.trim().toLowerCase()]);
      const ALIAS_QUERY_CAP = 3;
      for (const a of resolvedEntity.aliases) {
        if (queryTexts.length >= 1 + ALIAS_QUERY_CAP) break;
        const lo = a.trim().toLowerCase();
        if (lo.length === 0 || seen.has(lo)) continue;
        seen.add(lo);
        queryTexts.push(a);
      }
    }

    // 1. Vector search — global, no room scope (V5).
    const searchRes: ResultAsync<readonly Match[], AppError> =
      queryTexts.length === 1
        ? searchGlobal(useDeps)({ text: params.query, k: fetchK })
        : ResultAsync.combine(
            queryTexts.map((text) =>
              searchGlobal(useDeps)({ text, k: fetchK }),
            ),
          ).map((lists): readonly Match[] => multiRrfFuse(lists, 60));

    const result = searchRes.andThen((matches) =>
      deps.graphs
        .load()
        .orElse((): ResultAsync<Graph, AppError> => okAsync(emptyGraph()))
        .andThen((graph) => {
          const nowMs = Date.now();

          // Snapshot the TRUE cosine distance per node from the raw vector
          // search, BEFORE cross-encoder / PPR / recency rerank overwrite
          // `distance` with a ranking score. The satisfaction relevance gate
          // reads this (via EnrichedMatch.vec_distance) so off-topic but
          // high-centrality hits can't masquerade as relevant.
          const cosineByNode = new Map<string, number>(
            matches.map((m) => [m.node_id, m.distance]),
          );

          const docTextOf = (m: Match): string | undefined => {
            const n = getNode(graph, m.node_id);
            const label = typeof n?.label === 'string' ? n.label : '';
            const summary = typeof n?.summary === 'string' ? n.summary : '';
            const combined = summary ? `${label}\n${summary}` : label;
            return combined.length > 0 ? combined : undefined;
          };
          const xMatchesRes: ResultAsync<readonly Match[], AppError> =
            crossReranker !== null
              ? rerankMatches(params.query, matches, docTextOf, crossReranker)
                  .mapErr((e): AppError => e)
                  .orElse((): ResultAsync<readonly Match[], AppError> => okAsync(matches))
              : okAsync(matches);

          return xMatchesRes.andThen((xMatches) => {
          const pprRes = pprRerank(graph, xMatches);
          const ranked: readonly Match[] = pprRes.isOk() ? pprRes.value : xMatches;

          const enriched = ranked.map((m) => buildHit(m, graph, deps.entityRegistry, nowMs));

          // V5: uniform global half-life — always rerank.
          const reranked = rerankByRecencyAdapter(enriched);
          const search_hits = reranked.slice(0, params.k);

          const buildSatisfaction = (
            recallHits: readonly RecallResult['hits'][number][] = [],
          ): { satisfaction: SatisfactionScore; contract: AgentContract } => {
            const merged: EnrichedMatch[] = [
              ...recallHits.map(recallHitToEnriched),
              ...search_hits.map((h) => toEnriched(h, undefined, cosineByNode.get(h.node_id))),
            ];
            const seen = new Set<string>();
            const enrichedAll: EnrichedMatch[] = [];
            for (const m of merged) {
              if (seen.has(m.node_id)) continue;
              seen.add(m.node_id);
              enrichedAll.push(m);
            }
            // Lexical query-term coverage over the search hits' text — the
            // relevance signal that separates a topically-adjacent near-miss
            // (same domain, different terms) from a real answer. Fed into the
            // satisfaction relevance gate. Undefined when there are no search
            // hits (recall-only path) or the query has no extractable terms,
            // so the gate falls back to embedding proximity alone.
            const qTerms = extractQueryTerms(params.query);
            const hitText = search_hits
              .map((h) => `${h.label} ${h.summary ?? ''}`)
              .join('\n')
              .toLowerCase();
            const coverageRatio =
              qTerms.length === 0 || search_hits.length === 0
                ? undefined
                : qTerms.filter((t) => hitText.includes(t.toLowerCase())).length / qTerms.length;
            const satisfaction = computeSatisfaction(enrichedAll, { coverageRatio });
            const shallowEvidence = search_hits.length === 0 && recallHits.length > 0;
            const contract = decideContract(satisfaction, {
              shallowEvidence,
              risk: classifyRisk(params.query),
            });
            return { satisfaction, contract };
          };

          if (!resolvedEntity) {
            const { satisfaction, contract } = buildSatisfaction();
            return okAsync<AskResult, AppError>({
              query: params.query,
              k: params.k,
              search_hits,
              reranked: true,
              satisfaction,
              decision: contract.decision,
              contract,
            });
          }

          const recallRes = recall(
            { registry: deps.entityRegistry, graph },
            { query: resolvedEntity.id, limit: params.k },
          );
          if (recallRes.isErr()) {
            const { satisfaction, contract } = buildSatisfaction();
            return okAsync<AskResult, AppError>({
              query: params.query,
              k: params.k,
              search_hits,
              resolved_entity: resolvedEntity,
              reranked: true,
              satisfaction,
              decision: contract.decision,
              contract,
            });
          }
          const { satisfaction, contract } = buildSatisfaction(recallRes.value.hits);
          return okAsync<AskResult, AppError>({
            query: params.query,
            k: params.k,
            search_hits,
            resolved_entity: resolvedEntity,
            recall_result: recallRes.value,
            reranked: true,
            satisfaction,
            decision: contract.decision,
            contract,
          });
          });
        }),
    );

    return result
      .map((r) => {
        metrics.histogram('ask.latency.ms').observe(performance.now() - t0);
        metrics.counter('ask.ok').inc();
        return r;
      })
      .mapErr((e) => {
        metrics.histogram('ask.latency.ms').observe(performance.now() - t0);
        metrics.counter('ask.errors').inc();
        return e;
      });
  };

const rerankByRecencyAdapter = (hits: readonly AskHit[]): readonly AskHit[] =>
  rerankByRecency(hits) as readonly AskHit[];

// Silence unused parity imports.
void errAsync;
void ok;
type _Result<A, B> = Result<A, B>;
void (null as unknown as _Result<unknown, unknown>);
