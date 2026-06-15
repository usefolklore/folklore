/**
 * Batch ingest use case — N items, ONE graph load + ONE graph save.
 *
 * The application-layer canonical implementation of the chunk
 * pipeline. Was duplicated between
 *   - src/application/ingest.ts indexChunksFor (single item)
 *   - src/daemon/job-runner.ts runIngestBatch (N items, inlined)
 * which the architectural review flagged as the highest-value
 * cleanup target. BODY_MAX, the next-chunk edge construction, the
 * multi-chunk dedupe lookup all lived in two places — a recipe for
 * silent drift the moment one side gets touched.
 *
 * Now: this module is the single implementation. The single-item
 * path delegates to the batch path with one item; the daemon's
 * batch worker calls this directly.
 *
 * The mentions extractor is INJECTED via IngestDeps.mentionsExtractor.
 * The application layer doesn't know about EntityRegistry; the
 * daemon-runtime supplies the registry-backed implementation, the
 * standalone-CLI supplies undefined → no entity work.
 */

import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import type { AppError } from '../domain/errors.js';
import type { ContentItem } from '../domain/content.js';
import type { Graph, GraphEdge, GraphNode } from '../domain/graph.js';
import { getNode, replaceNode, upsertEdge, upsertNode as upsertNodePure } from '../domain/graph.js';
import { chunk as chunkText, NODE_BODY_MAX } from '../domain/chunks.js';
import { hashContent } from '../infrastructure/http/fetcher.js';
import type { SourceDescriptor, SourceRun } from '../domain/sources.js';
import type { IngestDeps } from './ingest.js';

// ─────────────── inputs ───────────────────

export interface BatchIngestParams {
  readonly descriptor: SourceDescriptor;
  readonly items: readonly ContentItem[];
}

interface HashedItem {
  readonly source_uri: string;
  readonly title: string;
  readonly text: string;
  readonly content_sha256: string;
  readonly published_at?: string;
  readonly author?: string;
}

interface KeptItem extends HashedItem {
  readonly chunks: readonly { readonly index: number; readonly text: string }[];
  readonly status: 'new' | 'updated';
}

// ─────────────── helpers ──────────────────

/** Look up an existing node — try the source_uri first (single-chunk
 *  case), then fall back to chunk-0 (multi-chunk case). The dedupe
 *  trick that was previously duplicated in two places. */
const findExisting = (graph: Graph, sourceUri: string): GraphNode | undefined =>
  getNode(graph, sourceUri) ?? getNode(graph, `${sourceUri}#chunk-0`);

const buildChunkNode = (
  k: KeptItem,
  c: { readonly index: number; readonly text: string },
  descriptor: SourceDescriptor,
  fetched: string,
): GraphNode => {
  const isOnlyChunk = k.chunks.length === 1;
  const id = isOnlyChunk ? k.source_uri : `${k.source_uri}#chunk-${c.index}`;
  return {
    id,
    label: isOnlyChunk ? k.title : `${k.title} [chunk ${c.index + 1}/${k.chunks.length}]`,
    file_type: 'document',
    source_file: k.source_uri,
    source_uri: k.source_uri,
    fetched_at: fetched,
    content_sha256: k.content_sha256,
    published_at: k.published_at,
    author: k.author,
    chunk_index: c.index,
    chunk_count: k.chunks.length,
    kind: descriptor.kind,
    wing: descriptor.wing,
    embedding_id: id,
    summary: c.text.length <= NODE_BODY_MAX ? c.text : c.text.slice(0, NODE_BODY_MAX),
  };
};

const buildNextChunkEdges = (k: KeptItem): readonly GraphEdge[] => {
  if (k.chunks.length <= 1) return [];
  const out: GraphEdge[] = [];
  for (let i = 0; i < k.chunks.length - 1; i++) {
    out.push({
      source: `${k.source_uri}#chunk-${i}`,
      target: `${k.source_uri}#chunk-${i + 1}`,
      relation: 'next_chunk',
      confidence: 'EXTRACTED',
      source_file: k.source_uri,
    });
  }
  return out;
};

// ─────────────── main use case ────────────

/**
 * Ingest a batch of ContentItems through the full pipeline:
 *
 *   1. Hash every text in parallel.
 *   2. Single graph.load() (under graphMutex when supplied).
 *   3. Classify each item — skip on hash match, otherwise mark
 *      new/updated.
 *   4. Chunk every kept item.
 *   5. Parallel-embed every chunk across the WHOLE batch in one
 *      shot. The batchingEmbedder coalesces into ⌈total_chunks/32⌉
 *      ONNX passes.
 *   6. Vector upserts (serial — sqlite-vec is single-writer).
 *   7. Apply every chunk node + next_chunk edge to the in-memory
 *      graph snapshot.
 *   8. If a mentionsExtractor is configured, run it over each
 *      chunk's text, upsert entity stub nodes (canonical metadata
 *      lives in entities.json), add `mentions` edges.
 *   9. Single graph.save() at the end of the mutex window.
 *
 * The mutex (when supplied) wraps ONLY the load → mutate → save
 * block. Embed work and vector upserts run lock-free.
 */
export const ingestBatch =
  (deps: IngestDeps) =>
  (params: BatchIngestParams): ResultAsync<SourceRun, AppError> => {
    const { descriptor, items } = params;
    if (items.length === 0) {
      return okAsync({
        source_id: descriptor.id,
        kind: descriptor.kind,
        items_seen: 0,
        items_new: 0,
        items_updated: 0,
        items_skipped: 0,
      });
    }

    // 1. Parallel hash
    const hashRes = ResultAsync.combine(
      items.map((it) =>
        hashContent(it.text)
          .mapErr((e): AppError => e)
          .map((h): HashedItem => ({
            source_uri: it.source_uri,
            title: it.title,
            text: it.text,
            content_sha256: h,
            published_at: it.published_at,
            author: it.author,
          })),
      ),
    );

    return hashRes.andThen((hashed) => {
      // 2. + 3. + 4. + 5. + 6. + 7. + 8. + 9. — all wrapped together
      // because they share the loaded snapshot.
      const work = (): ResultAsync<SourceRun, AppError> =>
        deps.graphs
          .load()
          .mapErr((e): AppError => e)
          .andThen((graph) => {
            // 3. Classify
            let newCount = 0;
            let updatedCount = 0;
            let skippedCount = 0;
            const kept: KeptItem[] = [];
            for (const h of hashed) {
              const existing = findExisting(graph, h.source_uri);
              const oldHash = (existing?.content_sha256 as string | undefined) ?? null;
              if (existing && oldHash === h.content_sha256) {
                skippedCount++;
                continue;
              }
              const chunks = chunkText(h.text);
              if (chunks.length === 0) {
                skippedCount++;
                continue;
              }
              const status: 'new' | 'updated' = existing ? 'updated' : 'new';
              kept.push({ ...h, chunks, status });
              if (existing) updatedCount++;
              else newCount++;
            }

            if (kept.length === 0) {
              // No work — return without saving.
              return okAsync<SourceRun, AppError>({
                source_id: descriptor.id,
                kind: descriptor.kind,
                items_seen: items.length,
                items_new: 0,
                items_updated: 0,
                items_skipped: skippedCount,
              });
            }

            // 4. Build flat chunk pair list for parallel embed.
            interface FlatChunk {
              readonly itemIdx: number;
              readonly chunkIdx: number;
              readonly text: string;
            }
            const flat: FlatChunk[] = [];
            kept.forEach((k, i) => {
              k.chunks.forEach((c) =>
                flat.push({ itemIdx: i, chunkIdx: c.index, text: c.text }),
              );
            });

            // 5. Parallel embed across the whole batch
            const embedRes = ResultAsync.combine(
              flat.map((f) => deps.embedder.embed(f.text).mapErr((e): AppError => e)),
            );

            return embedRes.andThen((vectors) => {
              // 6. Vector upserts (serial)
              const vectorWork = flat.reduce<ResultAsync<void, AppError>>(
                (acc, f, i) =>
                  acc.andThen(() => {
                    const k = kept[f.itemIdx];
                    const isOnlyChunk = k.chunks.length === 1;
                    const nodeId = isOnlyChunk
                      ? k.source_uri
                      : `${k.source_uri}#chunk-${f.chunkIdx}`;
                    return deps.vectors
                      .upsert({
                        node_id: nodeId,
                        wing: descriptor.wing,
                        vector: vectors[i],
                        raw_text: f.text,
                      })
                      .mapErr((e): AppError => e)
                      .map(() => undefined);
                  }),
                okAsync<void, AppError>(undefined),
              );

              return vectorWork.andThen(() => {
                // 7. Apply chunk nodes + next_chunk edges in memory
                let g: Graph = graph;
                const fetched = new Date().toISOString();
                // Frequency map of mentions per entity id — mirrors the
                // graph's edge count exactly. touchMany takes this as
                // a ReadonlyMap so a single registry write captures
                // the true count instead of under-counting via Set
                // dedupe (gemini synthesis HIGH on entity-registry.ts:153).
                const mentionCounts = new Map<string, number>();

                for (const k of kept) {
                  const isOnlyChunk = k.chunks.length === 1;
                  for (const c of k.chunks) {
                    const node = buildChunkNode(k, c, descriptor, fetched);
                    const r = upsertNodePure(g, node);
                    if (r.isOk()) g = r.value;

                    // 8. Entity extraction (when configured)
                    if (deps.mentionsExtractor) {
                      const mentions = deps.mentionsExtractor.extract(c.text);
                      const sourceId = isOnlyChunk
                        ? k.source_uri
                        : `${k.source_uri}#chunk-${c.index}`;
                      for (const m of mentions) {
                        const stub: GraphNode = {
                          id: m.entity_id,
                          // Stub node — canonical metadata lives in
                          // entities.json. Renderer joins on read.
                          label: m.entity_id,
                          file_type: 'rationale',
                          source_file: 'entities.json',
                          kind: 'entity',
                        };
                        // Wholesale replace (not merge) — codex review M5.
                        // entities.json is the canonical store; if a
                        // legacy stub had `aliases`, `mention_count`, or
                        // `note` baked into the graph node, shallow
                        // merge would preserve them forever even after
                        // the registry moved on. replaceNode discards
                        // all prior attributes so the graph stub stays
                        // the slim projection it's supposed to be.
                        const sr = replaceNode(g, stub);
                        if (sr.isOk()) g = sr.value;
                        const edge: GraphEdge = {
                          source: sourceId,
                          target: m.entity_id,
                          relation: 'mentions',
                          confidence: 'EXTRACTED',
                          source_file: k.source_uri,
                          surface: m.surface,
                        };
                        const er = upsertEdge(g, edge);
                        if (er.isOk()) g = er.value;
                        mentionCounts.set(
                          m.entity_id,
                          (mentionCounts.get(m.entity_id) ?? 0) + 1,
                        );
                      }
                    }
                  }
                  for (const e of buildNextChunkEdges(k)) {
                    const r = upsertEdge(g, e);
                    if (r.isOk()) g = r.value;
                  }
                }

                // 8b. Save graph FIRST, then bump registry counts.
                //
                // Order matters for crash recovery (codex review HIGH
                // on batch-ingest.ts:301):
                //   - Graph.save() persists `mentions` edges to graph.json.
                //     This IS the truth — mention_count can always be
                //     re-derived as the count of inbound mentions edges
                //     per entity.
                //   - registry.touchMany updates entities.json's
                //     mention_count + last_seen — a derived projection.
                //
                // If process dies between the two: the graph holds
                // the edges (recoverable), the registry has a slight
                // undercount that the NEXT ingest fixes (or a future
                // boot-time reconciliation pass collapses).
                //
                // Previous order (registry → graph) had the inverse
                // failure: registry showing increased counts the
                // graph couldn't back up — semantically broken with
                // no recovery path.
                return deps.graphs
                  .save(g)
                  .mapErr((e): AppError => e)
                  .map((): SourceRun => {
                    if (deps.mentionsExtractor && mentionCounts.size > 0) {
                      deps.mentionsExtractor.touchMany(mentionCounts);
                    }
                    return {
                      source_id: descriptor.id,
                      kind: descriptor.kind,
                      items_seen: items.length,
                      items_new: newCount,
                      items_updated: updatedCount,
                      items_skipped: skippedCount,
                    };
                  });
              });
            });
          });

      if (!deps.graphMutex) return work();
      // ResultAsync over the mutex — preserves error type via the
      // throw → catch dance because the mutex API uses Promises.
      return ResultAsync.fromPromise(
        deps.graphMutex.runExclusive(async () => {
          const r = await work();
          if (r.isErr()) throw r.error;
          return r.value;
        }),
        (e): AppError =>
          e && typeof e === 'object' && 'type' in (e as object)
            ? (e as AppError)
            : { type: 'GraphWriteError', path: '<batch>', message: String(e) },
      );
    });
  };

// Silence unused (errAsync kept for parity with other application files).
void errAsync;
