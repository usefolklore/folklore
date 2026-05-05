/**
 * Job runner — dispatches Job → Runtime work.
 *
 * Lives in the daemon. Receives the warmed Runtime singleton + a
 * handle to the cross-process write lock (already held by the daemon
 * for its lifetime, so ingestion work runs lock-free here).
 *
 * Each handler returns a single-line result summary that surfaces in
 * `wellinformed jobs list`. Errors throw — the queue catches them and
 * tags the job `failed`.
 */

import { dirname, isAbsolute } from 'node:path';
import { readFileSync, statSync } from 'node:fs';
import { okAsync, ResultAsync } from 'neverthrow';
import type { AppError } from '../domain/errors.js';
import { formatError } from '../domain/errors.js';
import type { Job } from '../domain/job.js';
import type { Runtime } from '../cli/runtime.js';
import type { Source, SourceDescriptor } from '../domain/sources.js';
import type { ContentItem } from '../domain/content.js';
import type { Graph, GraphEdge, GraphNode } from '../domain/graph.js';
import { getNode, upsertEdge, upsertNode as upsertNodePure } from '../domain/graph.js';
import { chunk as chunkText } from '../domain/chunks.js';
import { hashContent } from '../infrastructure/http/fetcher.js';
import { triggerRoom, ingestSource } from '../application/ingest.js';
import { extractMentions } from '../domain/entity-extract.js';
import { fileEntityRegistry } from '../infrastructure/entity-registry.js';
import { join } from 'node:path';

export interface RunnerDeps {
  readonly runtime: Runtime;
}

const runIngestRoom = async (deps: RunnerDeps, room: string): Promise<string> => {
  const result = await triggerRoom(deps.runtime.ingestDeps)(room);
  if (result.isErr()) {
    throw new Error(`ingest:room ${room} — ${formatError(result.error)}`);
  }
  const r = result.value;
  const newCount = r.runs.reduce((a, x) => a + x.items_new, 0);
  const updCount = r.runs.reduce((a, x) => a + x.items_updated, 0);
  const errCount = r.runs.filter((x) => x.error !== undefined).length;
  return `room=${room} sources=${r.runs.length} new=${newCount} updated=${updCount} errors=${errCount}`;
};

/**
 * Re-ingest a single file inside a known room. Reads the file directly,
 * builds a synthetic ContentItem, and routes through the chunk-based
 * ingest pipeline — bypassing the codebase adapter's directory walk
 * entirely.
 *
 * Was: walked the parent directory and let content-hash dedupe skip
 * siblings. For a 200-file dir, 200 statSync + 200 hash compares per
 * editor save. Bursty workloads (npm install touching package-lock,
 * git checkout, watch-mode rebuild) would queue N jobs each redoing
 * O(N) sibling walks → O(N²) on a single repo edit.
 *
 * Now: O(1) per save. Just the file we got the change event for.
 */
const runIngestFile = async (
  deps: RunnerDeps,
  room: string,
  path: string,
): Promise<string> => {
  if (!isAbsolute(path) || path === '/') {
    throw new Error(`ingest:file refused — non-absolute or root path: ${path}`);
  }

  // Read the file. Skip cleanly when it was deleted between the
  // watcher event and the worker pulling the job.
  let text: string;
  let mtime: Date;
  try {
    const buf = readFileSync(path, 'utf8');
    text = buf;
    mtime = statSync(path).mtime;
  } catch (e) {
    return `file=${path} room=${room} skipped (${(e as Error).message})`;
  }

  // Skip empty / huge files — embedding them is wasted work, and the
  // codebase adapter already filters by extension at the directory
  // walk; here we re-apply a size sanity check.
  const MAX_FILE_BYTES = 2_000_000;
  if (text.length === 0) return `file=${path} room=${room} skipped (empty)`;
  if (text.length > MAX_FILE_BYTES) {
    return `file=${path} room=${room} skipped (>${MAX_FILE_BYTES}B)`;
  }

  // Build a synthetic single-item Source so the existing chunk
  // pipeline (chunk text → batched embed → single graph save) does
  // the work. The descriptor's source_uri is the file path; the
  // ingest pipeline's content-hash dedupe will skip if the file
  // hasn't actually changed since last index.
  const item: ContentItem = {
    source_uri: `file://${path}`,
    title: path,
    text,
    metadata: { kind: 'ingest:file-watch', mtime: mtime.toISOString() },
  };
  const desc: SourceDescriptor = {
    id: `${room}-watch-${path}`,
    kind: 'codebase',
    room,
    enabled: true,
    config: { root: dirname(path) },
  };
  const synthSource: Source = {
    descriptor: desc,
    fetch: () => okAsync<readonly ContentItem[], AppError>([item]),
  };

  const ingest = ingestSource(deps.runtime.ingestDeps);
  const r = await ingest(synthSource);
  if (r.isErr()) throw new Error(`ingest:file ${path} — ${formatError(r.error)}`);
  return `file=${path} room=${room} new=${r.value.items_new} updated=${r.value.items_updated} skipped=${r.value.items_skipped}`;
};

/**
 * Incremental session ingest. Routes through triggerRoom('sessions')
 * which uses the existing sessions-state.json offset cursor — only
 * new lines are read; the JSONL re-walk is cheap when most files are
 * unchanged.
 */
const runIngestSession = async (
  deps: RunnerDeps,
  path?: string,
): Promise<string> => {
  // path is reserved for a future targeted re-walk; for v1 we route
  // through the room-level trigger which inspects every JSONL via the
  // cursor and is already efficient on incremental change.
  void path;
  return runIngestRoom(deps, 'sessions');
};

/**
 * Batched file ingest — N paths, ONE graph load + ONE graph save
 * covering every item.
 *
 * Bypasses the per-item ingestSource → indexChunksFor pipeline
 * (which saves the graph once per item) and runs the equivalent
 * work directly:
 *
 *   1. Read every file, build ContentItems (skip empty/oversized/missing).
 *   2. Load graph ONCE under the mutex (cached if a recent load happened).
 *   3. Per item: hash, dedupe-classify (uses multi-chunk fallback),
 *      keep only items that need work.
 *   4. Chunk every kept item.
 *   5. Parallel-embed ALL chunks across the entire batch in one
 *      shot. The batchingEmbedder coalesces into ⌈N/32⌉ ONNX
 *      passes — much fewer than per-item ingest would fire.
 *   6. Vector upserts (serial — sqlite-vec is single-writer).
 *   7. Apply every chunk node + next_chunk edge into the in-memory
 *      Graph.
 *   8. Save ONCE.
 *
 * For an 8-file batch on a 16 MB graph, the old per-item path paid
 * 8 × ~80 ms = 640 ms of graph saves alone. The new path pays one
 * ~80 ms save for the whole batch.
 */
const MAX_BATCH_FILE_BYTES = 2_000_000;
const BODY_MAX = 1500;

interface BatchItem {
  readonly source_uri: string;
  readonly title: string;
  readonly text: string;
  readonly content_sha256: string;
  readonly mtime: string;
}

const runIngestBatch = async (
  deps: RunnerDeps,
  room: string,
  paths: readonly string[],
): Promise<string> => {
  if (paths.length === 0) return `room=${room} paths=0 (empty)`;

  // 1. Read files
  const itemsRaw: ContentItem[] = [];
  let skippedRead = 0;
  let skippedSize = 0;
  for (const path of paths) {
    if (!isAbsolute(path) || path === '/') { skippedRead++; continue; }
    try {
      const text = readFileSync(path, 'utf8');
      if (text.length === 0) { skippedSize++; continue; }
      if (text.length > MAX_BATCH_FILE_BYTES) { skippedSize++; continue; }
      const mtime = statSync(path).mtime.toISOString();
      itemsRaw.push({
        source_uri: `file://${path}`,
        title: path,
        text,
        metadata: { kind: 'ingest:batch-watch', mtime },
      });
    } catch {
      skippedRead++;
    }
  }
  if (itemsRaw.length === 0) {
    return `room=${room} paths=${paths.length} skipped_read=${skippedRead} skipped_size=${skippedSize}`;
  }

  // 2. Hash every item (parallel — pure CPU on small inputs)
  const hashed: BatchItem[] = await Promise.all(
    itemsRaw.map(async (it) => {
      const r = await hashContent(it.text);
      if (r.isErr()) throw new Error(`batch hash error: ${formatError(r.error)}`);
      return {
        source_uri: it.source_uri,
        title: it.title,
        text: it.text,
        content_sha256: r.value,
        mtime: typeof it.metadata?.mtime === 'string' ? it.metadata.mtime : new Date().toISOString(),
      };
    }),
  );

  // 3. Single graph load (cached) — classify each item against the
  // current state, partition into work / skip. The mutex guards the
  // load+save block; the embed and vector work happen lock-free.
  const mutex = deps.runtime.ingestDeps.graphMutex;
  let newCount = 0;
  let updatedCount = 0;
  let skippedDedupe = 0;

  const work = async (): Promise<void> => {
    const graphRes = await deps.runtime.graphs.load();
    if (graphRes.isErr()) throw new Error(`batch load: ${formatError(graphRes.error)}`);
    const graphSnapshot = graphRes.value;

    interface KeptItem extends BatchItem {
      readonly chunks: readonly { readonly index: number; readonly text: string }[];
      readonly status: 'new' | 'updated';
    }
    const kept: KeptItem[] = [];

    for (const it of hashed) {
      const existing =
        getNode(graphSnapshot, it.source_uri) ??
        getNode(graphSnapshot, `${it.source_uri}#chunk-0`);
      const oldHash = (existing?.content_sha256 as string | undefined) ?? null;
      if (existing && oldHash === it.content_sha256) {
        skippedDedupe++;
        continue;
      }
      const chunks = chunkText(it.text);
      if (chunks.length === 0) {
        skippedDedupe++;
        continue;
      }
      kept.push({
        ...it,
        chunks,
        status: existing ? 'updated' : 'new',
      });
      if (existing) updatedCount++;
      else newCount++;
    }

    if (kept.length === 0) return;  // nothing to do; no save needed

    // 5. Parallel-embed every chunk across the entire batch.
    // Flat array of (item_idx, chunk_idx, text) for stable ordering.
    interface FlatChunk {
      readonly itemIdx: number;
      readonly chunkIdx: number;
      readonly text: string;
    }
    const flat: FlatChunk[] = [];
    kept.forEach((k, i) => {
      k.chunks.forEach((c) => flat.push({ itemIdx: i, chunkIdx: c.index, text: c.text }));
    });

    const embedRes = await ResultAsync.combine(
      flat.map((f) => deps.runtime.ingestDeps.embedder.embed(f.text)),
    );
    if (embedRes.isErr()) throw new Error(`batch embed: ${formatError(embedRes.error)}`);
    const vectors = embedRes.value;

    // 6. Vector upserts — serial; sqlite-vec is single-writer.
    for (let i = 0; i < flat.length; i++) {
      const f = flat[i];
      const k = kept[f.itemIdx];
      const isOnlyChunk = k.chunks.length === 1;
      const nodeId = isOnlyChunk ? k.source_uri : `${k.source_uri}#chunk-${f.chunkIdx}`;
      const upRes = await deps.runtime.ingestDeps.vectors.upsert({
        node_id: nodeId,
        room,
        vector: vectors[i],
        raw_text: f.text,
      });
      if (upRes.isErr()) throw new Error(`batch vector: ${formatError(upRes.error)}`);
    }

    // 7. Apply every chunk node + next_chunk edge to the in-memory
    // graph snapshot. We start from the same `graphSnapshot` we
    // loaded above — single in-memory mutation chain.
    let g: Graph = graphSnapshot;
    const fetched = new Date().toISOString();

    // Entity layer — set up the registry once per batch. Heuristic
    // auto-registers (capitalised idents, URL hosts, GitHub repos)
    // accumulate during this batch and persist atomically when the
    // batch ends. Registered-alias resolution stays case-insensitive.
    const registry = fileEntityRegistry(join(deps.runtime.paths.home, 'entities.json'));
    const mentionedEntityIds: string[] = [];
    const extractDeps = {
      resolveAlias: (s: string) => registry.resolve(s),
      autoRegister: (input: {
        readonly label: string;
        readonly type: 'product' | 'symbol' | 'url' | 'repo' | 'concept' | 'unknown';
        readonly aliases?: readonly string[];
      }) => registry.register(input),
    };

    for (const k of kept) {
      const isOnlyChunk = k.chunks.length === 1;
      for (const c of k.chunks) {
        const nodeId = isOnlyChunk ? k.source_uri : `${k.source_uri}#chunk-${c.index}`;
        const node: GraphNode = {
          id: nodeId,
          label: isOnlyChunk ? k.title : `${k.title} [chunk ${c.index + 1}/${k.chunks.length}]`,
          file_type: 'document',
          source_file: k.source_uri,
          source_uri: k.source_uri,
          fetched_at: fetched,
          content_sha256: k.content_sha256,
          chunk_index: c.index,
          chunk_count: k.chunks.length,
          kind: 'codebase',
          room,
          embedding_id: nodeId,
          summary: c.text.length <= BODY_MAX ? c.text : c.text.slice(0, BODY_MAX),
        };
        const upserted = upsertNodePure(g, node);
        if (upserted.isOk()) g = upserted.value;

        // Entity extraction: scan the chunk text, upsert the entity
        // node into the graph, add a `mentions` edge from this
        // chunk to each detected entity. The registry's auto-
        // register call already wrote the canonical metadata to
        // entities.json — we mirror the entity into the Graph so
        // graph traversal works without a separate index.
        const mentions = extractMentions(c.text, extractDeps);
        for (const m of mentions) {
          const entityFromRegistry = registry.getById(m.entity_id);
          if (!entityFromRegistry) continue;
          const entityNode: GraphNode = {
            id: entityFromRegistry.id,
            label: entityFromRegistry.label,
            file_type: 'rationale',         // entity is metadata, not a document
            source_file: 'entities.json',
            kind: 'entity',
            // Carry the entity-specific fields through the
            // [extra: string] index signature on GraphNode.
            entity_type: entityFromRegistry.type,
            aliases: entityFromRegistry.aliases,
            mention_count: entityFromRegistry.mention_count + 1,
            first_seen: entityFromRegistry.first_seen,
            last_seen: fetched,
          };
          const upRes = upsertNodePure(g, entityNode);
          if (upRes.isOk()) g = upRes.value;

          const edge: GraphEdge = {
            source: nodeId,
            target: entityFromRegistry.id,
            relation: 'mentions',
            confidence: 'EXTRACTED',
            source_file: k.source_uri,
            surface: m.surface,
          };
          const er = upsertEdge(g, edge);
          if (er.isOk()) g = er.value;
          mentionedEntityIds.push(entityFromRegistry.id);
        }
      }
      // next_chunk edges between consecutive chunks of multi-chunk items
      if (k.chunks.length > 1) {
        for (let i = 0; i < k.chunks.length - 1; i++) {
          const edge: GraphEdge = {
            source: `${k.source_uri}#chunk-${i}`,
            target: `${k.source_uri}#chunk-${i + 1}`,
            relation: 'next_chunk',
            confidence: 'EXTRACTED',
            source_file: k.source_uri,
          };
          const r = upsertEdge(g, edge);
          if (r.isOk()) g = r.value;
        }
      }
    }

    // 7b. Bump entity mention_count + last_seen in the registry —
    // batched as one read-modify-write so 200 mentions don't touch
    // entities.json 200 times.
    if (mentionedEntityIds.length > 0) {
      registry.touchMany(mentionedEntityIds);
    }

    // 8. Single save — covers every chunk node, every edge, every
    //    entity node, and every `mentions` edge for the batch.
    const saveRes = await deps.runtime.graphs.save(g);
    if (saveRes.isErr()) throw new Error(`batch save: ${formatError(saveRes.error)}`);
  };

  if (mutex) {
    await mutex.runExclusive(work);
  } else {
    await work();
  }

  return `room=${room} paths=${paths.length} new=${newCount} updated=${updatedCount} skipped=${skippedDedupe + skippedRead + skippedSize}`;
};

/**
 * Project ingest — the four ephemeral descriptors that `wellinformed
 * this` wants to run, but routed through the daemon's worker so the
 * graph.json write-lock dance stays single-writer. Descriptors are
 * NOT persisted to sources.json (mirrors `wellinformed index`).
 */
const runIngestProject = async (
  deps: RunnerDeps,
  room: string,
  root: string,
  maxCommits: number,
  includeDev: boolean,
): Promise<string> => {
  const descriptors: SourceDescriptor[] = [
    { id: `${room}-codebase`, kind: 'codebase', room, enabled: true, config: { root } },
    { id: `${room}-deps`, kind: 'package_deps', room, enabled: true, config: { root, include_dev: includeDev } },
    { id: `${room}-submodules`, kind: 'git_submodules', room, enabled: true, config: { root } },
    { id: `${room}-git`, kind: 'git_log', room, enabled: true, config: { root, max_commits: maxCommits } },
  ];
  const ingest = ingestSource(deps.runtime.ingestDeps);
  let totalNew = 0;
  let totalUpd = 0;
  let totalSkip = 0;
  let errs = 0;
  for (const desc of descriptors) {
    const built = deps.runtime.registry.buildAll([desc]);
    if (built.errors.length > 0 || built.sources.length === 0) {
      errs++;
      continue;
    }
    const r = await ingest(built.sources[0]);
    if (r.isErr()) {
      errs++;
      continue;
    }
    totalNew += r.value.items_new;
    totalUpd += r.value.items_updated;
    totalSkip += r.value.items_skipped;
  }
  return `room=${room} root=${root} new=${totalNew} updated=${totalUpd} skipped=${totalSkip} errors=${errs}`;
};

// ─────────────── dispatch ──────────────────

/**
 * Build the per-job dispatcher. The mutex now lives at a finer
 * granularity — inside indexChunksFor's load→upsert→save block — so
 * skipped items, embed work, and vector upserts run lock-free. This
 * keeps the mutex window tiny (~80ms graph save) instead of holding
 * the gate for the entire job lifetime, which under burst load
 * (boot reconciliation enqueues hundreds of jobs) was queueing
 * skipped no-op jobs behind one another for tens of seconds each.
 */
export const buildJobRunner = (deps: RunnerDeps) =>
  async (job: Job): Promise<string> => {
    const p = job.payload;
    switch (p.kind) {
      case 'ingest:room':    return runIngestRoom(deps, p.room);
      case 'ingest:file':    return runIngestFile(deps, p.room, p.path);
      case 'ingest:session': return runIngestSession(deps, p.path);
      case 'ingest:project': return runIngestProject(deps, p.room, p.root, p.maxCommits ?? 50, p.includeDev ?? true);
      case 'ingest:batch':   return runIngestBatch(deps, p.room, p.paths);
      default: {
        const _exhaustive: never = p;
        void _exhaustive;
        throw new Error(`unknown job kind: ${(p as { kind: string }).kind}`);
      }
    }
  };

