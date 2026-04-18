/**
 * `wellinformed consolidate <sub>` — Phase 4c CLI surface for the
 * episodic→semantic consolidation worker. Wires the Phase 4b
 * orchestrator to concrete infrastructure ports:
 *
 *   loadEntries  → pulls nodes from graph.json + vectors.db, filters
 *                  to the requested room, excludes already-consolidated
 *                  entries
 *   generateSummary → Ollama /api/generate with a deterministic prompt
 *   persistConsolidated → upserts a new graph node (kind=
 *                  'consolidated_memory') + centroid vector
 *   markEntriesConsolidated → writes `consolidated_at` field on each
 *                  source node so the retention pass knows they're safe
 *                  to prune
 *
 * Subcommands:
 *   run <room> [--dry-run] [--threshold N] [--min-size N] [--model M]
 *   status        — summary of consolidated vs unconsolidated entries per room
 *   help
 *
 * The CLI enforces `wellinformed daemon start` is NOT running with
 * concurrent writes — or rather: the daemon holds no write lock, so
 * concurrent writes from this CLI would race with ingestion ticks.
 * For v4.0 we document "run consolidate when daemon is stopped";
 * v4.1 can add a proper write lock.
 */

import { formatError } from '../../domain/errors.js';
import type { AppError, GraphError } from '../../domain/errors.js';
import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import { getNode, nodesInRoom, upsertNode } from '../../domain/graph.js';
import type { GraphNode, NodeId, Room } from '../../domain/graph.js';
import type { VectorRecord } from '../../domain/vectors.js';
import type { EpisodicEntry, ConsolidatedMemory } from '../../domain/consolidated-memory.js';
import type { ConsolidationCluster } from '../../domain/consolidated-memory.js';
import { runConsolidation, type ConsolidationReport, type ConsolidatorDeps } from '../../application/consolidator.js';
import { defaultRuntime, type Runtime } from '../runtime.js';
import { ollamaClient } from '../../infrastructure/ollama-client.js';
import { acquireLock } from '../../infrastructure/process-lock.js';
import { wellinformedHome } from '../runtime.js';
import { join } from 'node:path';

// ─── arg parsing ──────────────────────────────────────────────────

interface RunArgs {
  readonly room: Room;
  readonly dryRun: boolean;
  readonly threshold: number;
  readonly minSize: number;
  readonly maxSize: number;
  readonly model: string;
  readonly prune: boolean;
  readonly backup: boolean;
  readonly backupPath: string | null;
}

const parseRunArgs = (args: readonly string[]): RunArgs | string => {
  let room: string | null = null;
  let dryRun = false;
  let threshold = 0.8;
  let minSize = 5;
  let maxSize = 100;
  let model = process.env.WELLINFORMED_OLLAMA_MODEL ?? 'qwen2.5:1.5b';
  let prune = false;
  // Backup-before-prune is ON by default when --prune is used. Explicit
  // --no-backup disables. --backup <path> overrides the auto-generated
  // filename. Makes destructive --prune reversible: the source raw
  // entries go to an NDJSON file that `wellinformed sessions reingest`
  // OR a manual reimport can restore.
  let backup = true;
  let backupPath: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = (): string => args[++i] ?? '';
    if (a === '--dry-run') dryRun = true;
    else if (a === '--prune') prune = true;
    else if (a === '--no-backup') backup = false;
    else if (a === '--backup') { backup = true; backupPath = next(); }
    else if (a === '--threshold') threshold = parseFloat(next()) || threshold;
    else if (a === '--min-size') minSize = parseInt(next(), 10) || minSize;
    else if (a === '--max-size') maxSize = parseInt(next(), 10) || maxSize;
    else if (a === '--model') model = next();
    else if (!a.startsWith('-')) room = room ?? a;
  }
  if (!room) return 'missing <room>. usage: wellinformed consolidate run <room> [--dry-run] [--prune [--backup PATH | --no-backup]]';
  if (dryRun && prune) return 'cannot use --dry-run and --prune together';
  return { room, dryRun, threshold, minSize, maxSize, model, prune, backup, backupPath };
};

// ─── wiring: build ConsolidatorDeps from Runtime ────────────────

const buildDeps = (runtime: Runtime, model: string): ConsolidatorDeps => {
  const ollama = ollamaClient({ model });

  const loadEntries = (room: Room): ResultAsync<readonly EpisodicEntry[], AppError> =>
    runtime.graphs
      .load()
      .mapErr((e): AppError => e)
      .andThen((graph) => {
        const roomNodes = nodesInRoom(graph, room).filter((n) => {
          // Skip already-consolidated raw entries + skip the consolidated
          // nodes themselves (they live in the same room but have
          // kind === 'consolidated_memory').
          if ((n as { consolidated_at?: unknown }).consolidated_at) return false;
          if ((n as { kind?: unknown }).kind === 'consolidated_memory') return false;
          return true;
        });
        return runtime.vectors.all()
          .mapErr((e): AppError => e)
          .map((records): readonly EpisodicEntry[] => {
            const vByNode = new Map<NodeId, VectorRecord>();
            for (const r of records) vByNode.set(r.node_id, r);

            const entries: EpisodicEntry[] = [];
            for (const node of roomNodes) {
              const vec = vByNode.get(node.id);
              if (!vec) continue; // node has no vector — skip (can't cluster)
              const tsRaw = (node as { timestamp?: unknown; fetched_at?: unknown }).timestamp
                ?? (node as { fetched_at?: unknown }).fetched_at
                ?? '1970-01-01T00:00:00Z';
              const timestamp = typeof tsRaw === 'string' ? tsRaw : '1970-01-01T00:00:00Z';
              entries.push({
                node_id: node.id,
                room,
                vector: vec.vector,
                raw_text: typeof vec.raw_text === 'string' ? vec.raw_text : null,
                timestamp,
              });
            }
            return entries;
          });
      });

  const generateSummary = (cluster: ConsolidationCluster): ResultAsync<string, AppError> => {
    const bodies = cluster.entries
      .map((e, i) => `<entry ${i + 1}>\n${e.raw_text ?? '(no text)'}\n</entry ${i + 1}>`)
      .join('\n\n');
    const prompt =
      `Below are ${cluster.entries.length} related memory entries from the "${cluster.room}" room:\n\n` +
      bodies +
      `\n\nWrite a single 100-word semantic summary that captures the shared topic, key entities, and any decisions or conclusions. This summary will replace the raw entries as a consolidated memory, so it must preserve what's useful for future recall. Output only the summary, no preamble.`;

    return ollama.generate(prompt, { numPredict: 200, temperature: 0.2 });
  };

  const persistConsolidated = (memory: ConsolidatedMemory): ResultAsync<void, AppError> => {
    // Upsert the centroid vector with the summary as raw_text
    const vectorUpsert = runtime.vectors.upsert({
      node_id: memory.id,
      room: memory.room,
      vector: memory.centroid,
      raw_text: memory.summary,
    }).mapErr((e): AppError => e);

    // Upsert the graph node
    const graphUpsert = runtime.graphs.load().mapErr((e): AppError => e).andThen((graph) => {
      const node: GraphNode = {
        id: memory.id,
        label: memory.summary.slice(0, 80),
        file_type: 'document',
        source_file: `consolidated://${memory.id}`,
        room: memory.room,
        summary: memory.summary,
        kind: 'consolidated_memory',
        consolidated_at: memory.consolidated_at,
        llm_model: memory.llm_model,
        provenance_ids: memory.provenance_ids,
        fetched_at: memory.consolidated_at,
      };
      const upserted = upsertNode(graph, node);
      if (upserted.isErr()) return errAsync<void, AppError>(upserted.error);
      return runtime.graphs.save(upserted.value).mapErr((e): AppError => e);
    });

    return vectorUpsert.andThen(() => graphUpsert);
  };

  const markEntriesConsolidated = (
    ids: readonly NodeId[],
    at: string,
  ): ResultAsync<void, AppError> =>
    runtime.graphs.load().mapErr((e): AppError => e).andThen((graph) => {
      const idSet = new Set<NodeId>(ids);
      // Walk nodes once, mark matches in place (functional: emit a new array)
      const nextNodes: GraphNode[] = graph.json.nodes.map((n) =>
        idSet.has(n.id) ? ({ ...n, consolidated_at: at } as GraphNode) : n,
      );
      const nextGraph = { ...graph, json: { ...graph.json, nodes: nextNodes } };
      return runtime.graphs.save(nextGraph).mapErr((e): AppError => e);
    });

  return {
    llm_model: model,
    loadEntries,
    generateSummary,
    persistConsolidated,
    markEntriesConsolidated,
  };
};

// ─── subcommands ─────────────────────────────────────────────────

const runCmd = async (args: readonly string[]): Promise<number> => {
  const parsed = parseRunArgs(args);
  if (typeof parsed === 'string') {
    console.error(`consolidate run: ${parsed}`);
    return 1;
  }

  // Phase 4.1 — acquire the cross-process write lock BEFORE opening the
  // runtime so the daemon (or another mutator) doesn't race on graph.json
  // mid-consolidate. waitMs=30s gives the daemon time to drain a tick if
  // it's mid-write. Removes the v4.0 "stop the daemon first" caveat.
  const lockRes = await acquireLock(wellinformedHome(), {
    owner: 'consolidate',
    waitMs: 30_000,
    pollIntervalMs: 250,
  });
  if (lockRes.isErr()) {
    console.error(`consolidate: ${formatError(lockRes.error)}`);
    console.error(`  the daemon (or another mutating command) is currently writing.`);
    console.error(`  retry, or run 'wellinformed daemon stop' to free the lock.`);
    return 1;
  }
  const lock = lockRes.value;

  const rt = await defaultRuntime();
  if (rt.isErr()) {
    console.error(`consolidate: ${formatError(rt.error)}`);
    await lock.release();
    return 1;
  }
  const runtime = rt.value;

  try {
    const deps = buildDeps(runtime, parsed.model);

    // Probe Ollama first — fail fast with a clear message
    const ping = await ollamaClient({ model: parsed.model }).ping();
    if (ping.isErr()) {
      console.error(`consolidate: ollama unreachable — ${formatError(ping.error)}`);
      console.error(`  start it with: ollama serve  (or configure WELLINFORMED_OLLAMA_URL)`);
      return 1;
    }
    console.error(`consolidate: ollama ${ping.value} @ ${process.env.WELLINFORMED_OLLAMA_URL ?? 'http://localhost:11434'}, model=${parsed.model}`);

    console.error(
      `consolidate: room=${parsed.room} threshold=${parsed.threshold} ` +
      `min_size=${parsed.minSize} max_size=${parsed.maxSize} ${parsed.dryRun ? '(dry-run)' : ''}`,
    );

    const res = await runConsolidation(deps)({
      room: parsed.room,
      clusterOpts: {
        similarity_threshold: parsed.threshold,
        min_size: parsed.minSize,
        max_size: parsed.maxSize,
      },
      dryRun: parsed.dryRun,
    });

    if (res.isErr()) {
      console.error(`consolidate: ${formatError(res.error)}`);
      return 1;
    }

    printReport(res.value);

    // Phase 4.1 — atomic prune. After successful consolidation, remove
    // the source raw entries from BOTH the graph and the vector index
    // so they no longer compete with the consolidated_memory in
    // retrieval (closes the BENCH-v2.md §2j quality regression).
    //
    // Safer than a delayed retention pass: we know the source was
    // consolidated_at = now and the consolidated_memory exists at the
    // ID we just persisted. No race window where pruning could happen
    // before the summary is durable.
    if (parsed.prune && res.value.source_ids_marked.length > 0) {
      const ids = res.value.source_ids_marked;

      // Phase 4.2 — backup-before-prune. On by default. Writes source
      // graph nodes to an NDJSON file so `wellinformed sessions reingest`
      // (or a manual re-import) can undo the prune.
      if (parsed.backup) {
        const path = parsed.backupPath
          ?? join(wellinformedHome(), `prune-backup-${parsed.room}-${Date.now()}.ndjson`);
        const backupRes = await writeBackup(runtime, ids, path);
        if (backupRes.isErr()) {
          console.error(`consolidate prune: backup failed, ABORTING prune: ${formatError(backupRes.error)}`);
          console.error(`  the consolidated memories persisted successfully; sources were NOT deleted.`);
          console.error(`  use --no-backup to prune without a backup file.`);
          return 1;
        }
        console.error(`consolidate prune: wrote ${backupRes.value} bytes to ${path}`);
      } else {
        console.error(`consolidate prune: --no-backup — proceeding with destructive delete`);
      }

      console.error(`consolidate prune: removing ${ids.length} source entries from graph + vectors...`);
      const pruneStart = Date.now();
      const pruneRes = await pruneSources(runtime, ids);
      if (pruneRes.isErr()) {
        console.error(`consolidate prune: ${formatError(pruneRes.error)}`);
        return 1;
      }
      console.error(`consolidate prune: ${pruneRes.value.deletedFromGraph} graph nodes + ${pruneRes.value.deletedFromVectors} vectors removed in ${((Date.now() - pruneStart) / 1000).toFixed(1)}s`);
    }

    return 0;
  } finally {
    runtime.close();
    await lock.release();
  }
};

const writeBackup = (
  runtime: Runtime,
  ids: readonly NodeId[],
  path: string,
): ResultAsync<number, AppError> =>
  runtime.graphs.load().mapErr((e): AppError => e).andThen((graph) => {
    const idSet = new Set<NodeId>(ids);
    const nodes = graph.json.nodes.filter((n) => idSet.has(n.id));
    return ResultAsync.fromPromise(
      (async () => {
        const { writeFile, mkdir } = await import('node:fs/promises');
        const { dirname } = await import('node:path');
        await mkdir(dirname(path), { recursive: true });
        const body = nodes.map((n) => JSON.stringify(n)).join('\n') + '\n';
        await writeFile(path, body, 'utf8');
        return body.length;
      })(),
      (e): AppError => ({ type: 'GraphWriteError', path, message: (e as Error).message } as GraphError),
    );
  });

const pruneSources = (
  runtime: Runtime,
  ids: readonly NodeId[],
): ResultAsync<{ deletedFromGraph: number; deletedFromVectors: number }, AppError> => {
  const idSet = new Set<NodeId>(ids);

  // Vector deletes are independent rows; serialize through the existing
  // single-flight queue (better-sqlite3 is sync, but the API is async).
  // Each deleteByNodeId is idempotent so re-runs after partial failure
  // are safe.
  return ResultAsync.fromPromise(
    (async () => {
      let deletedFromVectors = 0;
      for (const id of ids) {
        const r = await runtime.vectors.deleteByNodeId(id);
        if (r.isOk()) deletedFromVectors++;
        // Single-vector failure is logged + ignored — partial prune is
        // better than no prune; the entries are already consolidated_at-
        // marked so a re-run will pick them up.
      }
      return deletedFromVectors;
    })(),
    (e): AppError => ({ type: 'GraphWriteError', path: '<vectors>', message: (e as Error).message } as GraphError),
  ).andThen((deletedFromVectors) => {
    return runtime.graphs.load()
      .mapErr((e): AppError => e)
      .andThen((graph) => {
        const beforeCount = graph.json.nodes.length;
        const nextNodes = graph.json.nodes.filter((n) => !idSet.has(n.id));
        const nextLinks = graph.json.links.filter((edge) => !idSet.has(edge.source) && !idSet.has(edge.target));
        const deletedFromGraph = beforeCount - nextNodes.length;
        const nextGraph = { ...graph, json: { ...graph.json, nodes: nextNodes, links: nextLinks } };
        return runtime.graphs.save(nextGraph)
          .mapErr((e): AppError => e)
          .map(() => ({ deletedFromGraph, deletedFromVectors }));
      });
  });
};

const printReport = (r: ConsolidationReport): void => {
  console.log(`# consolidate ${r.room}`);
  console.log(`  entries loaded:        ${r.entries_loaded}`);
  console.log(`  clusters found:        ${r.clusters_found}`);
  console.log(`  clusters summarized:   ${r.clusters_summarized}`);
  console.log(`  clusters persisted:    ${r.clusters_persisted}`);
  console.log(`  sources marked:        ${r.source_ids_marked.length}`);
  console.log('');
  if (r.results.length === 0) return;
  console.log('  per-cluster:');
  for (const step of r.results) {
    const marker = step.status === 'persisted' ? '✓'
      : step.status === 'dry_run' ? '•'
      : '✗';
    const idTail = step.memory_id ? ` id=${step.memory_id.slice(0, 30)}...` : '';
    const err = step.error ? `   err: ${step.error}` : '';
    console.log(`    ${marker} size=${step.cluster_size} seed=${step.seed_node_id} status=${step.status}${idTail}${err}`);
  }
};

const status = async (): Promise<number> => {
  const rt = await defaultRuntime();
  if (rt.isErr()) {
    console.error(`consolidate: ${formatError(rt.error)}`);
    return 1;
  }
  const runtime = rt.value;
  try {
    const g = await runtime.graphs.load();
    if (g.isErr()) {
      console.error(`consolidate: ${formatError(g.error)}`);
      return 1;
    }
    const counts = new Map<string, { raw: number; consolidated_raw: number; consolidated_memories: number }>();
    for (const n of g.value.json.nodes) {
      const r = (n as { room?: string }).room ?? '(no room)';
      const cur = counts.get(r) ?? { raw: 0, consolidated_raw: 0, consolidated_memories: 0 };
      if ((n as { kind?: string }).kind === 'consolidated_memory') cur.consolidated_memories++;
      else if ((n as { consolidated_at?: string }).consolidated_at) cur.consolidated_raw++;
      else cur.raw++;
      counts.set(r, cur);
    }
    console.log('# consolidation status (graph-wide)');
    console.log('  room                               raw  consolidated_raw  consolidated_memories');
    const rooms = [...counts.keys()].sort();
    for (const r of rooms) {
      const c = counts.get(r)!;
      console.log(`  ${r.padEnd(32)} ${String(c.raw).padStart(6)}  ${String(c.consolidated_raw).padStart(16)}  ${String(c.consolidated_memories).padStart(20)}`);
    }
    return 0;
  } finally {
    runtime.close();
  }
};

const help = (): number => {
  console.log('usage: wellinformed consolidate <sub>');
  console.log('');
  console.log('  run <room> [--dry-run | --prune] [--threshold 0.8] [--min-size 5] [--max-size 100] [--model M]');
  console.log('                    Cluster raw entries in <room>, LLM-summarize each cluster,');
  console.log('                    persist as consolidated_memory nodes, mark sources.');
  console.log('                    --prune: also DELETE source raw entries (graph + vectors)');
  console.log('                             after successful consolidation. Closes the BENCH §2j');
  console.log('                             quality regression by removing BM25 competitors.');
  console.log('                             Mutually exclusive with --dry-run.');
  console.log('  status            Counts of raw / consolidated entries per room.');
  console.log('  help              This text.');
  console.log('');
  console.log('Consolidation runs against your local Ollama (default http://localhost:11434).');
  console.log('Set WELLINFORMED_OLLAMA_URL / WELLINFORMED_OLLAMA_MODEL to override.');
  console.log('');
  console.log('Run consolidation while `wellinformed daemon` is stopped — v4.0 has no');
  console.log('cross-process write lock; concurrent ingestion can corrupt graph.json.');
  return 0;
};

export const consolidate = async (args: readonly string[]): Promise<number> => {
  const [sub, ...rest] = args;
  switch (sub) {
    case 'run':           return runCmd(rest);
    case 'status':
    case undefined:       return status();
    case 'help':
    case '--help':
    case '-h':            return help();
    default:
      console.error(`consolidate: unknown subcommand '${sub}'`);
      return help();
  }
};

// Quiet unused-imports on types referenced only for documentation
void okAsync; void errAsync;
// Also silence the unused GraphError import (kept for future branch)
type _UnusedError = GraphError;
void ({} as _UnusedError);
void getNode;
