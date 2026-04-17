/**
 * save-note — pure helpers for the `wellinformed save` command.
 *
 * Port of claude-obsidian's `/save` skill (third recommendation in
 * docs/claude-obsidian-parity.md). Distillation step that complements
 * raw session auto-ingest: user files the current answer, insight, or
 * decision as a typed node that outlives the transcript.
 *
 * Four note types:
 *   concept    — named idea or primitive ("Touch primitive")
 *   synthesis  — merged finding across sources ("Why hybrid hurts ArguAna")
 *   decision   — logged choice with rationale ("Ship dense-only for stance tasks")
 *   source     — external pointer worth preserving as a graph node
 *
 * Node IDs are deterministic — `<type>://YYYY-MM-DD/<slug>` — so saving
 * the same title twice in one day idempotently updates the existing node.
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
  readonly room: string;
  readonly body?: string;
  readonly sourceUri?: string;
  readonly date?: Date;
}

/**
 * Deterministic id derived from (type, date, slug(label)). Re-saving
 * the same label in the same UTC day collides on purpose — upsertNode
 * merges the body update in place.
 */
export const saveIdOf = (type: NoteType, label: string, date: Date = new Date()): string =>
  `${type}://${dateStamp(date)}/${slugify(label)}`;

/**
 * Build a GraphNode from a save input. 'source' maps to file_type
 * 'document' (it's an external pointer); the other note types map to
 * 'rationale' (they're reasoning artifacts, not primary documents).
 */
export const nodeFromSave = (i: SaveNoteInput): GraphNode => {
  const now = (i.date ?? new Date()).toISOString();
  const id = saveIdOf(i.type, i.label, i.date);
  const body = i.body ?? '';
  return {
    id,
    label: i.label,
    file_type: i.type === 'source' ? 'document' : 'rationale',
    source_file: 'wellinformed:save',
    room: i.room,
    source_uri: i.sourceUri ?? id,
    fetched_at: now,
    embedding_id: id,
    summary: body.slice(0, 8000),
    note_type: i.type,
  } as GraphNode;
};
