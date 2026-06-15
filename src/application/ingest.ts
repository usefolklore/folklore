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
 *      (a new folklore extra field — not in graphify's patch but
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
import type { ContentItem } from '../domain/content.js';
import type { Graph } from '../domain/graph.js';
import { getNode } from '../domain/graph.js';
import type { Source, SourceDescriptor, SourceRun, RoomRun } from '../domain/sources.js';
import { emptyRun, isEnabled } from '../domain/sources.js';
import type { GraphRepository } from '../infrastructure/graph-repository.js';
import type { VectorIndex } from '../infrastructure/vector-index.js';
import type { Embedder } from '../infrastructure/embedders.js';
import type { SourcesConfig } from '../infrastructure/sources-config.js';
import type { SourceRegistry } from '../infrastructure/sources/registry.js';
import type { AsyncMutex } from '../infrastructure/async-mutex.js';
import { hashContent } from '../infrastructure/http/fetcher.js';
// indexNode use-case is no longer the per-chunk path (we batch
// embed + upsert in indexChunksFor for an order-of-magnitude speedup);
// kept exported in use-cases.ts for any single-node callers.

// ─────────────────────── deps ─────────────────────────────

/**
 * Mentions extractor port — supplied by the daemon runtime to wire
 * the entity layer into the ingest pipeline. The domain layer
 * (entity-extract.ts) doesn't know about persistent registries; the
 * concrete adapter (in src/infrastructure or wired in cli/runtime)
 * binds the registry-backed extract + touchMany functions to this
 * port.
 *
 * Standalone-CLI paths (no daemon, no entity layer) leave this
 * undefined — ingest still works, just without entity extraction.
 */
export interface MentionsExtractorPort {
  /** Extract entity mentions from one chunk's text. Pure. */
  readonly extract: (text: string) => readonly {
    readonly entity_id: string;
    readonly surface: string;
    readonly start: number;
    readonly end: number;
  }[];
  /**
   * Bulk-touch — ONE persisted update for the whole batch's
   * mentions. The map carries true mention counts (entity_id →
   * times-mentioned-in-batch); the registry adds those increments
   * exactly. Previously this took a `string[]` which the registry
   * collapsed into a Set, undercounting repeated mentions
   * (gemini synthesis HIGH on entity-registry.ts:153).
   */
  readonly touchMany: (counts: ReadonlyMap<string, number>) => void;
}

export interface IngestDeps {
  readonly graphs: GraphRepository;
  readonly vectors: VectorIndex;
  readonly embedder: Embedder;
  readonly sources: SourcesConfig;
  readonly registry: SourceRegistry;
  /**
   * Optional in-process graph-mutex. When supplied (daemon path),
   * the load→upsert-all→save block inside indexChunksFor takes the
   * lock so the tick loop and the job worker can't lose updates.
   * Undefined paths (CLI standalone) rely on the cross-process file
   * lock alone — single mutator at a time.
   *
   * Crucially this is at the inner block level, NOT at the job
   * dispatch level — skipped items and embedding work happen
   * outside the lock so the mutex window stays tiny.
   */
  readonly graphMutex?: AsyncMutex;
  /**
   * Optional entity extractor + registry touchMany. When supplied,
   * the batch ingest pipeline runs extraction over each chunk's
   * text and adds `mentions` edges to detected entities. When
   * undefined, the pipeline skips the entity layer entirely.
   */
  readonly mentionsExtractor?: MentionsExtractorPort;
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

// ─────────────────────── triggerAllSources ─────────────────

/**
 * V5 (Phase 24): load every enabled source and run it. Returns a
 * RoomRun aggregate (the shape is retained for back-compat with the
 * daemon's tick reporting); the `room` field on the aggregate is
 * omitted because the room dimension no longer exists.
 *
 * Per-source errors are captured on SourceRun.error so the CLI can
 * report them without aborting the whole batch.
 */
export const triggerAllSources =
  (deps: IngestDeps) =>
  (): ResultAsync<RoomRun, AppError> => {
    const started_at = new Date().toISOString();
    return deps.sources
      .list()
      .mapErr((e): AppError => e)
      .andThen((all) => {
        const descriptors = all.filter(isEnabled);
        const { sources: live, errors } = deps.registry.buildAll(descriptors);

        const hydrationRuns: SourceRun[] = errors.map((e) => ({
          source_id: '<unknown>',
          kind: 'generic_rss',
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
          runs: [...hydrationRuns, ...runs],
          started_at,
          finished_at: new Date().toISOString(),
        }));
      });
  };

/**
 * @deprecated V5 — preserved alias of `triggerAllSources`. The `room`
 * argument is ignored. Will be removed in a follow-up wave.
 */
export const triggerRoom =
  (deps: IngestDeps) =>
  (_room: string): ResultAsync<RoomRun, AppError> =>
    triggerAllSources(deps)();

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
      // Look up the existing node — try the source_uri first
      // (single-chunk case where node.id === source_uri), then fall
      // back to chunk-0 (multi-chunk case where the file's content
      // hash lives on every chunk node). Without this fallback,
      // every multi-chunk re-ingest looked like a brand-new item
      // and re-embedded everything, breaking dedupe completely —
      // one large markdown file would take ~30s on every save.
      const existing =
        getNode(graph, item.source_uri) ??
        getNode(graph, `${item.source_uri}#chunk-0`);
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
 * Index every chunk of one item — fast path. Was N graph load+save
 * round-trips per item, now ONE per item:
 *
 *   1. Parallel `embedder.embed()` for all chunks at once. The
 *      batchingEmbedder coalesces these into a single ONNX forward
 *      pass (or a few, when chunk count > maxBatch). Sequential
 *      dispatch via the old sequenceLazy path would have triggered
 *      one ONNX call per chunk because each await resolves before
 *      the next dispatch.
 *
 *   2. Vector upsert per chunk (sqlite-vec, ~5ms each — kept serial
 *      because the underlying connection serializes anyway).
 *
 *   3. Single `graph.load()` → upsert all GraphNodes + next-chunk
 *      edges in memory → single `graph.save()`. Was 2N load+save
 *      cycles; now exactly 1. On a 16 MB graph.json, this alone
 *      saves ~130 ms × (N − 1) per item.
 *
 * Body-text cap on GraphNode.summary preserved (so `ask` / MCP /
 * smart-hook still render readable context). Edge-creation pass
 * preserved (next_chunk traversal still works).
 */
const indexChunksFor = (
  deps: IngestDeps,
  descriptor: SourceDescriptor,
  item: ContentItem,
  contentHash: string,
): ResultAsync<void, AppError> => {
  // Single-item path delegates to the canonical batch use case in
  // batch-ingest.ts. Was a near-duplicate of that function before
  // the architectural review (BODY_MAX, dedupe trick, next-chunk
  // edges all in two places). Now the batch path is the single
  // implementation; this wrapper lets `processItems` call it with
  // one item without a code-path fork.
  void contentHash;
  // Lazy import keeps ingest.ts ↔ batch-ingest.ts non-circular.
  return ResultAsync.fromPromise(
    import('./batch-ingest.js').then(async ({ ingestBatch }) => {
      const r = await ingestBatch(deps)({ descriptor, items: [item] });
      if (r.isErr()) throw r.error;
      return undefined;
    }),
    (e): AppError =>
      e && typeof e === 'object' && 'type' in (e as object)
        ? (e as AppError)
        : { type: 'GraphWriteError', path: '<batch>', message: String(e) },
  );
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
