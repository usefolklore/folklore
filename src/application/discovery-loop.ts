/**
 * Discovery loop — STUB (V5 Phase 24).
 *
 * Pre-V5 this recursively expanded a room's source list by walking
 * indexed content, extracting keywords, calling `discover` to suggest
 * new sources, ingesting them, and looping until convergence. With
 * rooms deleted, there is no per-room keyword set or per-room ingest
 * scope to drive the loop.
 *
 * Kept as a stub returning a converged report so callers compile;
 * a workspace-aware replacement is deferred to Phase 25+.
 */

import { ResultAsync, okAsync } from 'neverthrow';
import type { AppError } from '../domain/errors.js';
import type { IngestDeps } from './ingest.js';
import type { SourcesConfig } from '../infrastructure/sources-config.js';

// ─────────────── types ──────────────────

export interface DiscoveryLoopDeps {
  readonly ingestDeps: IngestDeps;
  readonly sources: SourcesConfig;
}

export interface IterationReport {
  readonly iteration: number;
  readonly new_sources: number;
  readonly new_nodes: number;
  readonly new_keywords: readonly string[];
}

export interface DiscoveryLoopOptions {
  readonly maxIterations?: number;
  readonly onIteration?: (r: IterationReport) => void;
}

export interface DiscoveryLoopReport {
  readonly converged: boolean;
  readonly total_sources_added: number;
  readonly total_nodes_added: number;
  readonly final_keywords: readonly string[];
}

// ─────────────── use case ───────────────

/**
 * V5 stub — converges immediately with an empty report. The pre-V5
 * recursive expansion required per-room keyword state which no longer
 * exists.
 */
export const discoveryLoop =
  (_deps: DiscoveryLoopDeps) =>
  (
    _opts: DiscoveryLoopOptions = {},
  ): ResultAsync<DiscoveryLoopReport, AppError> =>
    okAsync<DiscoveryLoopReport, AppError>({
      converged: true,
      total_sources_added: 0,
      total_nodes_added: 0,
      final_keywords: [],
    });
