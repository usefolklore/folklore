/**
 * seed-corpus — pure helpers for the `folklore seed` command.
 *
 * The cold-start problem: a fresh install has an empty graph, so the
 * first N prompts always miss the knowledge-before-web gate. The
 * auto-save PostToolUse hook only fills the graph *after* web traffic
 * happens, so the first session of every fresh machine pays full web
 * cost and the deny-on-confidence hook never fires. `folklore seed`
 * closes that loop by importing a small, curated corpus of durable
 * concept nodes at install time, so the graph answers from turn one.
 *
 * This module is pure: it parses + validates a bundled manifest into
 * typed seed entries and turns each entry into a deterministic
 * GraphNode (via save-note's `nodeFromSave`). No I/O, no classes,
 * neverthrow Results — the application layer owns embedding + persist.
 *
 * A seed node is just a `source`/`concept`/`synthesis` save-note with
 * a `seed:` source_uri scheme so it is auditable and never confused
 * with web-fetched provenance. Seed nodes are public by default (they
 * are curated, shareable reference material) but the corpus can mark
 * any entry private.
 */

import { err, ok, type Result } from 'neverthrow';
import type { AppError } from './errors.js';
import { GraphError } from './errors.js';
import type { GraphNode } from './graph.js';
import { type NoteType, isNoteType, nodeFromSave, saveIdOf } from './save-note.js';

/** The provenance scheme stamped on every seeded node's source_uri. */
export const SEED_SOURCE_SCHEME = 'seed://';

/**
 * One curated entry in the seed manifest. `body` carries the durable
 * claim; `label` is the retrieval title. `type` defaults to `concept`.
 */
export interface SeedEntry {
  readonly type: NoteType;
  readonly label: string;
  readonly body: string;
  /** Optional explicit provenance; defaults to a `seed://` id when absent. */
  readonly source_uri?: string;
  /** Curated reference material is public unless an entry opts out. */
  readonly private: boolean;
}

/** The parsed manifest — a version tag plus the entry list. */
export interface SeedCorpus {
  readonly version: number;
  readonly entries: readonly SeedEntry[];
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const nonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;

/**
 * Parse + validate a raw manifest object into a typed `SeedCorpus`.
 * Rejects (with a `GraphParseError`, the closest existing AppError
 * variant for a malformed local document) on any structural problem —
 * a corrupt seed file should fail loudly at the boundary rather than
 * silently planting garbage into the graph.
 *
 * `path` is threaded only for the error message so the caller can
 * point the user at the offending file.
 */
export const parseSeedCorpus = (
  raw: unknown,
  path = '<corpus>',
): Result<SeedCorpus, AppError> => {
  if (!isObject(raw)) {
    return err(GraphError.parseError(path, 'seed corpus must be a JSON object'));
  }
  const version = raw.version;
  if (typeof version !== 'number' || !Number.isFinite(version)) {
    return err(GraphError.parseError(path, 'seed corpus missing numeric "version"'));
  }
  const rawEntries = raw.entries;
  if (!Array.isArray(rawEntries)) {
    return err(GraphError.parseError(path, 'seed corpus "entries" must be an array'));
  }

  const entries: SeedEntry[] = [];
  for (let i = 0; i < rawEntries.length; i++) {
    const e = rawEntries[i];
    if (!isObject(e)) {
      return err(GraphError.parseError(path, `entry ${i} is not an object`));
    }
    if (!nonEmptyString(e.label)) {
      return err(GraphError.parseError(path, `entry ${i} missing non-empty "label"`));
    }
    if (!nonEmptyString(e.body)) {
      return err(GraphError.parseError(path, `entry ${i} ("${e.label}") missing non-empty "body"`));
    }
    const type = e.type ?? 'concept';
    if (typeof type !== 'string' || !isNoteType(type)) {
      return err(
        GraphError.parseError(path, `entry ${i} ("${e.label}") has invalid type "${String(type)}"`),
      );
    }
    if (e.source_uri !== undefined && !nonEmptyString(e.source_uri)) {
      return err(GraphError.parseError(path, `entry ${i} ("${e.label}") has empty "source_uri"`));
    }
    if (e.private !== undefined && typeof e.private !== 'boolean') {
      return err(GraphError.parseError(path, `entry ${i} ("${e.label}") "private" must be a boolean`));
    }
    entries.push({
      type,
      label: e.label.trim(),
      body: e.body.trim(),
      source_uri: nonEmptyString(e.source_uri) ? e.source_uri.trim() : undefined,
      private: e.private === true,
    });
  }

  // Reject duplicate labels within one corpus — same-day saveIdOf
  // collisions would silently collapse two distinct entries into one.
  const seen = new Set<string>();
  for (const entry of entries) {
    const key = `${entry.type}:${entry.label.toLowerCase()}`;
    if (seen.has(key)) {
      return err(GraphError.parseError(path, `duplicate entry: ${entry.type} "${entry.label}"`));
    }
    seen.add(key);
  }

  if (entries.length === 0) {
    return err(GraphError.parseError(path, 'seed corpus has no entries'));
  }
  return ok({ version, entries });
};

/**
 * The deterministic node id a seed entry maps to, on a given date.
 * Stable across runs so re-seeding is idempotent (an upsert, never a
 * duplicate). Exposed so the application layer can dedupe against an
 * already-seeded graph without re-deriving the rule.
 */
export const seedNodeId = (entry: SeedEntry, date: Date): string =>
  saveIdOf(entry.type, entry.label, date);

/** A seed entry's source_uri — explicit when given, else a `seed://` id. */
export const seedSourceUri = (entry: SeedEntry, date: Date): string =>
  entry.source_uri ?? `${SEED_SOURCE_SCHEME}${seedNodeId(entry, date)}`;

/**
 * Turn a seed entry into a persistable GraphNode + the text to embed.
 * Mirrors the `folklore save` write shape so seeded nodes are
 * indistinguishable in retrieval from user-saved notes (same file_type
 * mapping, same summary handling), differing only in the `seed://`
 * provenance scheme that makes them auditable.
 */
export const seedToNode = (
  entry: SeedEntry,
  date: Date,
): { readonly node: GraphNode; readonly text: string } => {
  const node = nodeFromSave({
    type: entry.type,
    label: entry.label,
    body: entry.body,
    sourceUri: seedSourceUri(entry, date),
    private: entry.private,
    date,
  });
  const text = `${entry.label}\n\n${entry.body}`;
  return { node, text };
};
