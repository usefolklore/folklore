/**
 * Pure domain vocabulary for sources.
 *
 * A `Source` is the strategy that knows how to produce `ContentItem`s
 * for a given room. The port is narrow — one method, one ResultAsync —
 * so any adapter (RSS, ArXiv, HN, URL, future: github_trending,
 * star_history, ecosystems_timeline) plugs in uniformly.
 *
 * Registered adapters are described by a `SourceDescriptor`: a kind,
 * the config shape, the list of rooms it belongs to. The infra layer
 * reads these descriptors from sources.json and hydrates them into
 * live `Source` instances via a registry.
 *
 * This file has no I/O and no classes — just types + pure helpers.
 */

import type { ResultAsync } from 'neverthrow';
import type { AppError } from './errors.js';
import type { ContentItem } from './content.js';
import type { Room, Wing } from './graph.js';

/** Source adapter kinds. Phase 2: external feeds. Project indexing: codebase, deps, submodules, git. */
export type SourceKind =
  | 'generic_rss'
  | 'arxiv'
  | 'hn_algolia'
  | 'generic_url'
  | 'codebase'
  | 'package_deps'
  | 'git_submodules'
  | 'git_log'
  | 'oss_insight'
  | 'github_trending';

/**
 * One registered source in the user's sources.json. The shape of
 * `config` is adapter-specific — adapters validate it when hydrated.
 */
export interface SourceDescriptor {
  /** Stable opaque id; used in logs and SourceRun reports. */
  readonly id: string;
  readonly kind: SourceKind;
  /** The room this source feeds into. */
  readonly room: Room;
  /** Optional sub-partition on the emitted nodes. */
  readonly wing?: Wing;
  /** If false, the source is skipped by trigger-room. Defaults to true. */
  readonly enabled?: boolean;
  /** Adapter-specific configuration. */
  readonly config: Readonly<Record<string, unknown>>;
}

/** The live instance a descriptor hydrates into. */
export interface Source {
  readonly descriptor: SourceDescriptor;
  /** Pull the current batch of content items from this source. */
  fetch(): ResultAsync<readonly ContentItem[], AppError>;
}

/**
 * Result of running one source through the ingest pipeline. Aggregated
 * into a `RoomRun` at the trigger-room level.
 */
export interface SourceRun {
  readonly source_id: string;
  readonly kind: SourceKind;
  readonly room: Room;
  readonly items_seen: number;
  readonly items_new: number;
  readonly items_updated: number;
  readonly items_skipped: number;
  readonly error?: AppError;
}

/** Aggregate of all source runs for one room. */
export interface RoomRun {
  readonly room: Room;
  readonly runs: readonly SourceRun[];
  readonly started_at: string;
  readonly finished_at: string;
}

// ─────────────────────── helpers ──────────────────────────

/** Default predicate — a descriptor is enabled unless explicitly disabled. */
export const isEnabled = (d: SourceDescriptor): boolean => d.enabled !== false;

/** Filter descriptors to those matching a room and currently enabled. */
export const forRoom = (
  descriptors: readonly SourceDescriptor[],
  room: Room,
): readonly SourceDescriptor[] => descriptors.filter((d) => d.room === room && isEnabled(d));

/**
 * Build an empty SourceRun for a descriptor — used by the ingest
 * pipeline when a source produces no items or fails before fetching.
 */
export const emptyRun = (d: SourceDescriptor): SourceRun => ({
  source_id: d.id,
  kind: d.kind,
  room: d.room,
  items_seen: 0,
  items_new: 0,
  items_updated: 0,
  items_skipped: 0,
});
