/**
 * Consolidator — Phase 4b application orchestrator for episodic→
 * semantic memory distillation.
 *
 * The pure clustering math lives in `src/domain/consolidated-memory.ts`.
 * This module composes it with three injected ports:
 *
 *   loadEntries(workspace)         → episodic entries for a workspace
 *   generateSummary(cluster)       → LLM-distilled summary text
 *   persistConsolidated(memory)    → write to graph + vector index
 *   markEntriesConsolidated(ids,t) → set `consolidated_at` on sources
 *
 * The ports are plain functions returning ResultAsync. Concrete
 * implementations (Ollama, graph repo, vector index) live in Phase 4c.
 * Keeping orchestration injection-driven means we can unit-test the
 * decision logic with in-memory fakes — no Ollama running, no SQLite.
 *
 * Pure: no I/O at this layer. No classes. neverthrow throughout.
 */

import { Result, ResultAsync, errAsync, okAsync, ok } from 'neverthrow';
import { createHash } from 'node:crypto';
import type { AppError } from '../domain/errors.js';
import type { NodeId } from '../domain/graph.js';
import {
  findClusters,
  buildConsolidatedMemory,
  partitionByWorkspace,
  type ClusterOptions,
  type ConsolidatedMemory,
  type ConsolidationCluster,
  type EpisodicEntry,
} from '../domain/consolidated-memory.js';

// ─────────────── ports (injected) ───────────────

export interface ConsolidatorDeps {
  /** Load every episodic entry for a single workspace. */
  readonly loadEntries: (workspace: string) => ResultAsync<readonly EpisodicEntry[], AppError>;

  /**
   * Distill a cluster's raw_text fields into a single summary via LLM.
   * Receives the cluster (so the impl can build its prompt) and returns
   * the natural-language summary. Failure surfaces as AppError so the
   * orchestrator can decide whether to skip vs abort.
   */
  readonly generateSummary: (cluster: ConsolidationCluster) => ResultAsync<string, AppError>;

  /**
   * Persist a finalized ConsolidatedMemory to the graph + vector index.
   * The impl is responsible for: creating a graph node with kind=
   * 'consolidated_memory', upserting the centroid as the vector,
   * recording provenance_ids + llm_model + consolidated_at as fields.
   */
  readonly persistConsolidated: (memory: ConsolidatedMemory) => ResultAsync<void, AppError>;

  /**
   * Mark the given entry IDs as `consolidated_at = at` in the graph.
   * The retention pass uses this to know which raw entries are now
   * safe to prune.
   */
  readonly markEntriesConsolidated: (
    ids: readonly NodeId[],
    at: string,
  ) => ResultAsync<void, AppError>;

  /** LLM model identifier (e.g. 'qwen2.5:1.5b') to pin in the consolidated record. */
  readonly llm_model: string;

  /** Clock for consolidated_at — defaults to () => new Date().toISOString(). */
  readonly clock?: () => string;
}

// ─────────────── public API ───────────────

export interface ConsolidationParams {
  readonly workspace: string;
  readonly clusterOpts?: ClusterOptions;
  /**
   * If true, the orchestrator builds clusters + LLM-summarizes but
   * does NOT call persist/mark. Useful for `folklore consolidate
   * dry-run` and the bench gate measurement.
   */
  readonly dryRun?: boolean;
}

export interface ConsolidationReport {
  readonly workspace: string;
  readonly entries_loaded: number;
  readonly clusters_found: number;
  readonly clusters_summarized: number;
  readonly clusters_persisted: number;
  /** IDs of entries that were marked consolidated_at. Empty in dry-run. */
  readonly source_ids_marked: readonly NodeId[];
  /** Per-cluster outcomes (summary text omitted in `summary` to keep report compact). */
  readonly results: ReadonlyArray<{
    readonly cluster_size: number;
    readonly seed_node_id: NodeId;
    readonly status: 'persisted' | 'dry_run' | 'summary_failed' | 'persist_failed';
    readonly summary_chars: number;
    readonly memory_id?: NodeId;
    readonly error?: string;
  }>;
}

/**
 * Run a single-workspace consolidation pass.
 *
 * Steps:
 *   1. loadEntries(workspace) — pull all episodic entries
 *   2. findClusters() — pure domain
 *   3. For each cluster: generateSummary → buildConsolidatedMemory →
 *      persistConsolidated → markEntriesConsolidated
 *   4. Per-cluster failures are collected (not fatal) so a single bad
 *      LLM call doesn't abort the whole pass.
 *
 * Returns a report with one entry per cluster + aggregate counts.
 */
export const runConsolidation = (deps: ConsolidatorDeps) =>
  (params: ConsolidationParams): ResultAsync<ConsolidationReport, AppError> => {
    const clock = deps.clock ?? (() => new Date().toISOString());
    const dryRun = params.dryRun ?? false;

    return deps.loadEntries(params.workspace).andThen((entries) => {
      // findClusters returns Result; lift it into ResultAsync.
      const clustersRes = findClusters(entries, params.clusterOpts);
      if (clustersRes.isErr()) return errAsync<ConsolidationReport, AppError>(clustersRes.error);
      const clusters = clustersRes.value;

      // Process clusters serially so we don't hammer Ollama with N
      // parallel requests. Sequential is also more deterministic for
      // the bench gate's reproducibility check.
      return processClustersSerial(deps, clusters, dryRun, clock).map((results) => {
        const summarized = results.filter((r) => r.summary_chars > 0).length;
        const persisted = results.filter((r) => r.status === 'persisted').length;
        const sourceIds = results.flatMap((r, i) =>
          r.status === 'persisted' ? clusters[i].entries.map((e) => e.node_id) : [],
        );
        return {
          workspace: params.workspace,
          entries_loaded: entries.length,
          clusters_found: clusters.length,
          clusters_summarized: summarized,
          clusters_persisted: persisted,
          source_ids_marked: sourceIds,
          results,
        };
      });
    });
  };

/**
 * Convenience wrapper for multi-workspace consolidation. Loads ALL
 * entries the caller specifies, partitions per-workspace, and runs
 * `runConsolidation` for each workspace. Reports are concatenated.
 *
 * Caller controls scope by passing `loadAllEntries` that returns the
 * union — we don't impose a "consolidate every workspace" policy at
 * this layer.
 */
export const runConsolidationAcrossWorkspaces = (deps: ConsolidatorDeps) =>
  (
    loadAllEntries: () => ResultAsync<readonly EpisodicEntry[], AppError>,
    clusterOpts?: ClusterOptions,
    dryRun?: boolean,
  ): ResultAsync<readonly ConsolidationReport[], AppError> =>
    loadAllEntries().andThen((all) => {
      const partitioned = partitionByWorkspace(all);
      const workspaces = [...partitioned.keys()].sort();

      // Per-workspace runs serial — same Ollama-rate-limit reasoning as above.
      const runOne = (workspace: string): ResultAsync<ConsolidationReport, AppError> => {
        const perWorkspaceDeps: ConsolidatorDeps = {
          ...deps,
          loadEntries: () => okAsync(partitioned.get(workspace) ?? []),
        };
        return runConsolidation(perWorkspaceDeps)({ workspace, clusterOpts, dryRun });
      };

      return runWorkspacesSerial(workspaces, runOne);
    });

// ─────────────── helpers ───────────────

const processClustersSerial = (
  deps: ConsolidatorDeps,
  clusters: readonly ConsolidationCluster[],
  dryRun: boolean,
  clock: () => string,
): ResultAsync<ReadonlyArray<ConsolidationReport['results'][number]>, AppError> => {
  // Reduce-style accumulation that preserves order + lets us collect
  // per-cluster outcomes without aborting on a single failure.
  type Step = ConsolidationReport['results'][number];
  return clusters.reduce<ResultAsync<Step[], AppError>>(
    (acc, cluster) =>
      acc.andThen((accumulated) =>
        processOneCluster(deps, cluster, dryRun, clock).map((step) => [...accumulated, step]),
      ),
    okAsync<Step[], AppError>([]),
  );
};

const processOneCluster = (
  deps: ConsolidatorDeps,
  cluster: ConsolidationCluster,
  dryRun: boolean,
  clock: () => string,
): ResultAsync<ConsolidationReport['results'][number], AppError> => {
  type Step = ConsolidationReport['results'][number];
  const baseStep = {
    cluster_size: cluster.entries.length,
    seed_node_id: cluster.seed_node_id,
    summary_chars: 0,
  };

  // Per-cluster failures must NOT abort the orchestrator — capture them
  // as Step records instead. Wrap the whole flow in an async function
  // that always resolves, then lift to ResultAsync.
  const work = async (): Promise<Step> => {
    const summaryRes = await deps.generateSummary(cluster);
    if (summaryRes.isErr()) {
      return { ...baseStep, status: 'summary_failed', error: errToString(summaryRes.error) };
    }
    const summary = summaryRes.value;

    const memoryRes = buildConsolidatedMemory(cluster, summary, {
      makeId: defaultMakeId,
      clock,
      llm_model: deps.llm_model,
    });
    if (memoryRes.isErr()) {
      return { ...baseStep, status: 'persist_failed', summary_chars: summary.length, error: errToString(memoryRes.error) };
    }
    const memory = memoryRes.value;

    if (dryRun) {
      return { ...baseStep, status: 'dry_run', summary_chars: summary.length, memory_id: memory.id };
    }

    const persistRes = await deps.persistConsolidated(memory);
    if (persistRes.isErr()) {
      return { ...baseStep, status: 'persist_failed', summary_chars: summary.length, error: errToString(persistRes.error) };
    }

    const markRes = await deps.markEntriesConsolidated(memory.provenance_ids, memory.consolidated_at);
    if (markRes.isErr()) {
      // Persisted but couldn't mark — still report as persisted (the
      // memory exists) but flag via error field for visibility.
      return {
        ...baseStep,
        status: 'persisted',
        summary_chars: summary.length,
        memory_id: memory.id,
        error: `mark failed: ${errToString(markRes.error)}`,
      };
    }

    return { ...baseStep, status: 'persisted', summary_chars: summary.length, memory_id: memory.id };
  };

  return ResultAsync.fromPromise(
    work().catch((e): Step => ({
      ...baseStep,
      status: 'summary_failed',
      error: e instanceof Error ? e.message : String(e),
    })),
    () => ({ type: 'ConsolidationEmptyInput' as const, message: 'unreachable — work() never throws' }),
  );
};

const runWorkspacesSerial = <T>(
  workspaces: readonly string[],
  fn: (workspace: string) => ResultAsync<T, AppError>,
): ResultAsync<readonly T[], AppError> =>
  workspaces.reduce<ResultAsync<T[], AppError>>(
    (acc, workspace) =>
      acc.andThen((reports) =>
        fn(workspace).map((report) => [...reports, report]),
      ),
    okAsync<T[], AppError>([]),
  );

// ─────────────── ID generation ───────────────

/**
 * Default content-addressed ID for a consolidated memory:
 *   sha256(cluster.workspace + ":" + sorted(provenance_ids).join(",") + ":" + summary)
 *   prefix "consolidated:"
 *
 * Cross-peer determinism: two peers with identical sources + summary
 * compute identical IDs. Federated dedup falls out for free.
 */
export const defaultMakeId = (
  cluster: ConsolidationCluster,
  summary: string,
): NodeId => {
  const ids = cluster.entries.map((e) => e.node_id).sort().join(',');
  const h = createHash('sha256')
    .update(`${cluster.workspace ?? ''}:${ids}:${summary}`)
    .digest('hex');
  return `consolidated:${h.slice(0, 32)}` as NodeId;
};

// ─────────────── util ───────────────

const errToString = (e: unknown): string => {
  if (typeof e === 'object' && e !== null && 'type' in e) {
    return String((e as { type: string }).type);
  }
  if (e instanceof Error) return e.message;
  return String(e);
};

// Quiet the unused-import linter while keeping `Result`/`ok` in the
// public surface contract for future extensions.
void Result;
void ok;
