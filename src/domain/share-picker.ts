/**
 * share-picker — pure logic for the interactive room-share TUI.
 *
 * The TUI layer (src/cli/tui/share-picker.ts) owns stdin/stdout.
 * Everything testable lives here: list composition, key handling,
 * state transitions, and the diff that becomes a shared-rooms.json
 * mutation.
 *
 * Data flow:
 *
 *   load  — project all rooms from graph.json + shared-rooms.json
 *           into the PickerItem list, exclude system rooms (toolshed
 *           + research are non-negotiable; they're rendered as a
 *           static header but not pickable).
 *   input — key events produce PickerState transitions via step().
 *   save  — commit() returns the diff (rooms to mark shareable, rooms
 *           to mark not-shareable) that the caller passes into
 *           mutateSharedRooms.
 */

import { SYSTEM_ROOM_NAMES } from './system-rooms.js';
import type { GraphNode } from './graph.js';
import type { SharedRoomsFile, SharedRoomRecord } from '../infrastructure/share-store.js';

// ─────────────────────── types ────────────────────────────

export interface PickerItem {
  readonly name: string;
  /** Was this room marked shareable in shared-rooms.json before the user opened the picker? */
  readonly wasShareable: boolean;
  /** Current state — starts equal to wasShareable, flips on toggle. */
  readonly isShareable: boolean;
  /** Node count for display context. */
  readonly nodeCount: number;
}

export interface PickerState {
  readonly items: readonly PickerItem[];
  readonly cursor: number;
  readonly done: false | 'committed' | 'cancelled';
}

export type PickerKey =
  | { readonly kind: 'up' }
  | { readonly kind: 'down' }
  | { readonly kind: 'toggle' }
  | { readonly kind: 'commit' }
  | { readonly kind: 'cancel' };

// ─────────────────────── projection ────────────────────────

/**
 * Build the initial picker state from the current graph + shared-rooms
 * file. Physical rooms are the union of:
 *   - rooms mentioned in at least one graph node's `room` field
 *   - rooms already present in shared-rooms.json
 * System rooms are excluded entirely — they're always-on and
 * non-negotiable, so they must not appear in the pick list.
 */
export const buildPickerState = (
  nodes: readonly GraphNode[],
  shared: SharedRoomsFile,
): PickerState => {
  const counts = new Map<string, number>();
  for (const n of nodes) {
    if (typeof n.room !== 'string' || n.room.length === 0) continue;
    if (SYSTEM_ROOM_NAMES.has(n.room)) continue;
    counts.set(n.room, (counts.get(n.room) ?? 0) + 1);
  }
  const sharedMap = new Map<string, boolean>();
  for (const r of shared.rooms) {
    if (SYSTEM_ROOM_NAMES.has(r.name)) continue;
    sharedMap.set(r.name, r.shareable !== false);
    if (!counts.has(r.name)) counts.set(r.name, 0);
  }
  const names = [...counts.keys()].sort((a, b) => a.localeCompare(b));
  const items: PickerItem[] = names.map((name) => {
    const wasShareable = sharedMap.get(name) ?? false;
    return {
      name,
      wasShareable,
      isShareable: wasShareable,
      nodeCount: counts.get(name) ?? 0,
    };
  });
  return { items, cursor: 0, done: false };
};

// ─────────────────────── transitions ───────────────────────

const clampCursor = (items: readonly PickerItem[], n: number): number => {
  if (items.length === 0) return 0;
  if (n < 0) return items.length - 1;
  if (n >= items.length) return 0;
  return n;
};

const toggleAt = (items: readonly PickerItem[], i: number): readonly PickerItem[] =>
  items.map((it, idx) => (idx === i ? { ...it, isShareable: !it.isShareable } : it));

export const step = (state: PickerState, key: PickerKey): PickerState => {
  if (state.done !== false) return state;
  switch (key.kind) {
    case 'up':     return { ...state, cursor: clampCursor(state.items, state.cursor - 1) };
    case 'down':   return { ...state, cursor: clampCursor(state.items, state.cursor + 1) };
    case 'toggle': return { ...state, items: toggleAt(state.items, state.cursor) };
    case 'commit': return { ...state, done: 'committed' };
    case 'cancel': return { ...state, done: 'cancelled' };
  }
};

// ─────────────────────── diff / commit ─────────────────────

export interface PickerDiff {
  /** Rooms the user wants to START sharing — shareable: true. */
  readonly toShare: readonly string[];
  /** Rooms the user wants to STOP sharing — shareable: false. */
  readonly toUnshare: readonly string[];
  /** Rooms whose state did not change. */
  readonly unchanged: readonly string[];
}

export const computeDiff = (items: readonly PickerItem[]): PickerDiff => {
  const toShare: string[] = [];
  const toUnshare: string[] = [];
  const unchanged: string[] = [];
  for (const it of items) {
    if (it.isShareable === it.wasShareable) unchanged.push(it.name);
    else if (it.isShareable) toShare.push(it.name);
    else toUnshare.push(it.name);
  }
  return { toShare, toUnshare, unchanged };
};

/**
 * Apply a PickerDiff to a SharedRoomsFile. Never touches system rooms
 * (defense-in-depth — projections already exclude them, but if a diff
 * somehow contains one, we no-op rather than breaking the invariant).
 */
export const applyDiff = (file: SharedRoomsFile, diff: PickerDiff, now: Date = new Date()): SharedRoomsFile => {
  const iso = now.toISOString();
  const byName = new Map<string, SharedRoomRecord>();
  for (const r of file.rooms) byName.set(r.name, r);
  for (const name of diff.toShare) {
    if (SYSTEM_ROOM_NAMES.has(name)) continue;
    const existing = byName.get(name);
    byName.set(name, {
      name,
      sharedAt: existing?.sharedAt ?? iso,
      shareable: true,
    });
  }
  for (const name of diff.toUnshare) {
    if (SYSTEM_ROOM_NAMES.has(name)) continue;
    const existing = byName.get(name);
    byName.set(name, {
      name,
      sharedAt: existing?.sharedAt ?? iso,
      shareable: false,
    });
  }
  return {
    version: file.version,
    rooms: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
};
