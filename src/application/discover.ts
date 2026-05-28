/**
 * Discovery use case — STUB (V5 Phase 24).
 *
 * Pre-V5 this scanned a room's keywords against a known-feed table and
 * a research-channel adapter list to suggest new sources. With rooms
 * deleted (Phase 24), there is no per-room keyword set to drive the
 * suggestion engine. The whole feature is deferred until a
 * replacement primitive (workspace-keyword index? source-affinity
 * graph?) is designed in Phase 25+.
 *
 * This file remains as a stub returning the empty list so callers
 * (CLI, discovery-loop) compile cleanly and exit with a graceful
 * "no suggestions" path. Callers should expect the empty list and
 * print a helpful message.
 */

import { ResultAsync, okAsync } from 'neverthrow';
import type { AppError } from '../domain/errors.js';
import type { SourceDescriptor } from '../domain/sources.js';
import type { SourcesConfig } from '../infrastructure/sources-config.js';

// ─────────────── types ──────────────────

export interface DiscoverDeps {
  readonly sources: SourcesConfig;
}

export interface Suggestion {
  readonly descriptor: SourceDescriptor;
  readonly reason: string;
}

// ─────────────── use case ───────────────

/**
 * V5 stub — always returns an empty suggestion list. The pre-V5
 * keyword-derived suggestion engine relied on Room.keywords which no
 * longer exists. Replacement is deferred.
 */
export const discover =
  (_deps: DiscoverDeps) =>
  (): ResultAsync<readonly Suggestion[], AppError> =>
    okAsync<readonly Suggestion[], AppError>([]);
