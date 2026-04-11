/**
 * Ingest use cases — orchestrate Source.fetch → chunk → indexNode.
 *
 * Two entrypoints:
 *
 *   ingestSource(deps)(source)
 *     — runs one source end to end, returns a SourceRun report
 *
 *   triggerRoom(deps)(room)
 *     — loads sources.json, filters to the room, hydrates via the
 *       registry, runs ingestSource for each, returns a RoomRun
 *
 * Dedup strategy
 * --------------
 * Each source_uri maps to at most one graph node. On re-run we:
 *
 *   1. load the current graph
 *   2. compute sha256(normalized text) of every fetched ContentItem
 *   3. compare against `content_sha256` stored on the existing node
 *      (a new wellinformed extra field — not in graphify's patch but
 *      graphify's validator passes extras through unchanged)
 *   4. equal → skipped, different → updated, not-seen → new
 *   5. only new + updated items chunk/embed/upsert
 *
 * Chunking
 * --------
 * Each item's text is split into chunks (paragraph-aware, 1200
 * chars default). Each chunk becomes a node with id
 * `<source_uri>#chunk-<index>`, so a single long article produces
 * multiple siblings that all share the same source_uri parent. Phase
 * 3 can introduce a parent "article" node + EXTRACTED edges.
 */

import { Result, ResultAsync, errAsync, okAsync } from 'neverthrow';
import type { AppError } from '../domain/errors.js';
import { chunk as chunkText } from '../domain/chunks.js';
import type { ContentItem } from '../domain/content.js';
import type { Graph, GraphEdge, GraphNode, Room } from '../domain/graph.js';
import { getNode, upsertEdge } from '../domain/graph.js';
import type { Source, SourceDescriptor, SourceRun, RoomRun } from '../domain/sources.js';
import { emptyRun, forRoom } from '../domain/sources.js';
import type { GraphRepository } from '../infrastructure/graph-repository.js';
import type { VectorIndex } from '../infrastructure/vector-index.js';
import type { Embedder } from '../infrastructure/embedders.js';
import type { SourcesConfig } from '../infrastructure/sources-config.js';
import type { SourceRegistry } from '../infrastructure/sources/registry.js';
import { hashContent } from '../infrastructure/http/fetcher.js';
import { indexNode } from './use-cases.js';

// ─────────────────────── deps ─────────────────────────────

export interface IngestDeps {
  readonly graphs: GraphRepository;
  readonly vectors: VectorIndex;
  readonly embedder: Embedder;
  readonly sources: SourcesConfig;
  readonly registry: SourceRegistry;
}

// ─────────────────────── ingestSource ─────────────────────

/**
 * Run a single source end to end. Returns a SourceRun report with
 * counts. Errors on the source itself become SourceRun.error; errors
 * on individual items are counted as `items_skipped` with the first
 * error retained for the report.
 */
export const ingestSource =
  (deps: IngestDeps) =>
  (source: Source): ResultAsync<SourceRun, AppError> =>
    source.fetch().andThen((items) => processItems(deps, source.descriptor, items));

// ─────────────────────── triggerRoom ──────────────────────

/**
 * Load enabled sources for a room and run each one. Returns a
 * RoomRun aggregate even if individual sources fail — per-source
 * errors are captured on SourceRun.error so the CLI can report them
 * without aborting the whole batch.
 */
export const triggerRoom =
  (deps: IngestDeps) =>
  (room: Room): ResultAsync<RoomRun, AppError> => {
    const started_at = new Date().toISOString();
    return deps.sources
      .list()
      .mapErr((e): AppError => e)
      .andThen((all) => {
        const descriptors = forRoom(all, room);
        const { sources: live, errors } = deps.registry.buildAll(descriptors);

        // For each hydration error, synthesise a failed SourceRun so
        // the report is truthful.
        const hydrationRuns: SourceRun[] = errors.map((e) => ({
          source_id: '<unknown>',
          kind: 'generic_rss',
          room,
          items_seen: 0,
          items_new: 0,
          items_updated: 0,
          items_skipped: 0,
          error: e,
        }));

        return sequenceLazy(
          live.map((s) => () =>
            ingestSource(deps)(s).orElse((e) =>
              okAsync<SourceRun, AppError>({
                ...emptyRun(s.descriptor),
                error: e,
              }),
            ),
          ),
        ).map((runs): RoomRun => ({
          room,
          runs: [...hydrationRuns, ...runs],
          started_at,
          finished_at: new Date().toISOString(),
        }));
      });
  };

// ─────────────────────── internals ────────────────────────

/**
 * Walk a fetched ContentItem list, dedup against the graph, chunk
 * the new / updated ones, and call indexNode for every chunk. Returns
 * a SourceRun with the aggregated counts.
 */
const processItems = (
  deps: IngestDeps,
  descriptor: SourceDescriptor,
  items: readonly ContentItem[],
): ResultAsync<SourceRun, AppError> => {
  if (items.length === 0) {
    return okAsync({
      ...emptyRun(descriptor),
      items_seen: 0,
    });
  }

  return deps.graphs
    .load()
    .mapErr((e): AppError => e)
    .andThen((graph) =>
      sequenceLazy(
        items.map((item) => () =>
          classifyItem(item, graph).andThen((decision) =>
            actOnDecision(deps, descriptor, item, decision),
          ),
        ),
      ).map((decisions) => aggregateRun(descriptor, items.length, decisions)),
    );
};

/**
 * Given an item, compare its content hash against the existing node
 * (if any) and decide what to do.
 */
type ItemDecision =
  | { readonly kind: 'new' }
  | { readonly kind: 'updated'; readonly old_hash: string }
  | { readonly kind: 'skipped' };

const classifyItem = (
  item: ContentItem,
  graph: Graph,
): ResultAsync<ItemDecision, AppError> =>
  hashContent(item.text)
    .mapErr((e): AppError => e)
    .map((newHash): ItemDecision => {
      const existing = getNode(graph, item.source_uri);
      if (!existing) return { kind: 'new' };
      const oldHash = existing.content_sha256 as string | undefined;
      if (!oldHash) return { kind: 'updated', old_hash: '<missing>' };
      if (oldHash === newHash) return { kind: 'skipped' };
      return { kind: 'updated', old_hash: oldHash };
    });

/**
 * Apply the decision: new/updated → chunk, embed, upsert; skipped → no-op.
 * The returned value is a simple discriminator the aggregator counts.
 */
const actOnDecision = (
  deps: IngestDeps,
  descriptor: SourceDescriptor,
  item: ContentItem,
  decision: ItemDecision,
): ResultAsync<ItemDecision['kind'], AppError> => {
  if (decision.kind === 'skipped') return okAsync('skipped' as const);
  return hashContent(item.text)
    .mapErr((e): AppError => e)
    .andThen((hash) => indexChunksFor(deps, descriptor, item, hash).map(() => decision.kind));
};

/**
 * Split the item into chunks and call `indexNode` for each chunk.
 * Chunks share the parent's source_uri via the `source_uri` field
 * but each gets a unique id (`<source_uri>#chunk-<index>`).
 */
const indexChunksFor = (
  deps: IngestDeps,
  descriptor: SourceDescriptor,
  item: ContentItem,
  contentHash: string,
): ResultAsync<void, AppError> => {
  const chunks = chunkText(item.text);
  if (chunks.length === 0) return okAsync(undefined);

  const useCase = indexNode({
    graphs: deps.graphs,
    vectors: deps.vectors,
    embedder: deps.embedder,
  });

  const toNode = (chunkIndex: number): GraphNode => ({
    id: chunks.length === 1 ? item.source_uri : `${item.source_uri}#chunk-${chunkIndex}`,
    label: chunks.length === 1 ? item.title : `${item.title} [chunk ${chunkIndex + 1}/${chunks.length}]`,
    file_type: 'document',
    source_file: item.source_uri,
    source_uri: item.source_uri,
    fetched_at: new Date().toISOString(),
    content_sha256: contentHash,
    published_at: item.published_at,
    author: item.author,
    chunk_index: chunkIndex,
    chunk_count: chunks.length,
    kind: descriptor.kind,
  });

  return sequenceLazy(
    chunks.map((c) => () =>
      useCase({
        node: toNode(c.index),
        text: c.text,
        room: descriptor.room,
        wing: descriptor.wing,
      }).map(() => undefined),
    ),
  ).andThen(() => {
    // Add sequential edges between chunks of multi-chunk articles so
    // graph traversal can follow the reading order.
    if (chunks.length <= 1) return okAsync<void, AppError>(undefined);
    return deps.graphs
      .load()
      .mapErr((e): AppError => e)
      .andThen((graph) => {
        let g = graph;
        for (let i = 0; i < chunks.length - 1; i++) {
          const srcId = `${item.source_uri}#chunk-${i}`;
          const tgtId = `${item.source_uri}#chunk-${i + 1}`;
          const edge: GraphEdge = {
            source: srcId,
            target: tgtId,
            relation: 'next_chunk',
            confidence: 'EXTRACTED',
            source_file: item.source_uri,
          };
          const result = upsertEdge(g, edge);
          if (result.isOk()) g = result.value;
        }
        return deps.graphs.save(g).mapErr((e): AppError => e);
      });
  });
};

/**
 * Build a SourceRun from a list of per-item decisions.
 */
const aggregateRun = (
  descriptor: SourceDescriptor,
  seen: number,
  decisions: readonly ItemDecision['kind'][],
): SourceRun => {
  let newCount = 0;
  let updated = 0;
  let skipped = 0;
  for (const d of decisions) {
    if (d === 'new') newCount++;
    else if (d === 'updated') updated++;
    else skipped++;
  }
  return {
    source_id: descriptor.id,
    kind: descriptor.kind,
    room: descriptor.room,
    items_seen: seen,
    items_new: newCount,
    items_updated: updated,
    items_skipped: skipped,
  };
};

/**
 * Sequential lazy helper — takes an array of **thunks** (() =>
 * ResultAsync) and executes them one-by-one, short-circuiting on
 * the first error.
 *
 * The lazy shape is critical: wrapping each step in a function
 * means the ResultAsync (and therefore its underlying Promise) is
 * not constructed until the previous step resolves. Using an eager
 * `xs.reduce((acc, current) => ...)` instead would start every
 * Promise in `xs` in parallel because `.map()` on `items` already
 * materialises them — which is the bug that ingest.ts originally
 * had (every indexNode call raced on graph.json and the last
 * writer won, giving us 1 node instead of N).
 */
const sequenceLazy = <T, E>(
  thunks: readonly (() => ResultAsync<T, E>)[],
): ResultAsync<readonly T[], E> =>
  thunks.reduce<ResultAsync<T[], E>>(
    (acc, thunk) => acc.andThen((prev) => thunk().map((value) => [...prev, value])),
    okAsync<T[], E>([]),
  );

// keep imports honest when strict linting is enabled
void Result;
void errAsync;
