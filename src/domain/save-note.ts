/**
 * save-note — pure helpers for the `folklore save` command.
 *
 * Port of claude-obsidian's `/save` skill. Distillation step that
 * complements raw session auto-ingest: user files the current answer,
 * insight, or decision as a typed node that outlives the transcript.
 *
 * Four note types:
 *   concept    — named idea or primitive ("Touch primitive")
 *   synthesis  — merged finding across sources ("Why hybrid hurts ArguAna")
 *   decision   — logged choice with rationale ("Ship dense-only for stance tasks")
 *   source     — external pointer worth preserving as a graph node
 *
 * Node IDs are deterministic — `<type>://YYYY-MM-DD/<slug>` — so saving
 * the same title twice in one day idempotently updates the existing node.
 *
 * V5 (Phase 24): no room field on saved nodes. `private: boolean`
 * controls federation; `workspace?: string` is an optional cwd-derived tag.
 */
import type { GraphNode } from './graph.js';

export type NoteType = 'concept' | 'synthesis' | 'decision' | 'source';

export const NOTE_TYPES: ReadonlySet<NoteType> = new Set<NoteType>([
  'concept', 'synthesis', 'decision', 'source',
]);

export const isNoteType = (s: string): s is NoteType => NOTE_TYPES.has(s as NoteType);

/**
 * Slugify a label to a filesystem / URI-safe identifier. ASCII-lower,
 * non-alphanumerics collapsed to '-', trimmed, clamped to 60 chars.
 * Returns 'untitled' for labels that slugify to empty (e.g. emoji-only).
 */
export const slugify = (s: string): string =>
  s.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'untitled';

/** YYYY-MM-DD in UTC from a Date (default: now). */
export const dateStamp = (d: Date = new Date()): string => d.toISOString().slice(0, 10);

export interface SaveNoteInput {
  readonly type: NoteType;
  readonly label: string;
  readonly body?: string;
  readonly sourceUri?: string;
  readonly date?: Date;
  /** V5: per-node federation gate. Defaults to false. */
  readonly private?: boolean;
  /** V5: optional workspace tag (write-time, from cwd's git toplevel). */
  readonly workspace?: string;
}

/**
 * Deterministic id derived from (type, date, slug(label)).
 */
export const saveIdOf = (type: NoteType, label: string, date: Date = new Date()): string =>
  `${type}://${dateStamp(date)}/${slugify(label)}`;

/**
 * Build a GraphNode from a save input. 'source' maps to file_type
 * 'document'; the other note types map to 'rationale'.
 *
 * V5: `private` is always stamped (defaults false); `workspace` is
 * stamped only when supplied (omitting the field entirely otherwise).
 */
export const nodeFromSave = (i: SaveNoteInput): GraphNode => {
  const now = (i.date ?? new Date()).toISOString();
  const id = saveIdOf(i.type, i.label, i.date);
  const body = i.body ?? '';
  const base: Record<string, unknown> = {
    id,
    label: i.label,
    file_type: i.type === 'source' ? 'document' : 'rationale',
    source_file: 'folklore:save',
    source_uri: i.sourceUri ?? id,
    fetched_at: now,
    embedding_id: id,
    summary: body.slice(0, 8000),
    note_type: i.type,
    private: i.private ?? false,
  };
  if (typeof i.workspace === 'string' && i.workspace.length > 0) {
    base.workspace = i.workspace;
  }
  return base as unknown as GraphNode;
};
