/**
 * Pure domain vocabulary for rooms.
 *
 * A Room is the top-level partition of the knowledge graph. Each room
 * represents a distinct research domain ("homelab", "fundraise",
 * "ml-papers"). Nodes, sources, and reports are all scoped to a room.
 *
 * This module owns the type definitions and pure validation functions.
 * No I/O, no classes, no throws.
 */

import { Result, err, ok } from 'neverthrow';
import { GraphError } from './errors.js';

/** Stable room identifier — lowercase, alphanumeric + hyphens. */
export type RoomId = string;

/** Metadata stored in the room registry. */
export interface RoomMeta {
  /** Unique identifier. Also used as the `room` field on graph nodes. */
  readonly id: RoomId;
  /** Human-friendly display name. */
  readonly name: string;
  /** One-line description of what this room is about. */
  readonly description: string;
  /** Keywords that describe the room's topic area. Used by init to suggest sources. */
  readonly keywords: readonly string[];
  /** Default wing for new nodes if the source adapter doesn't set one. */
  readonly default_wing?: string;
  /** ISO-8601 creation timestamp. */
  readonly created_at: string;
}

/** The registry of all rooms. */
export interface RoomRegistry {
  readonly rooms: readonly RoomMeta[];
  /** The room that commands default to when --room is omitted. */
  readonly default_room?: RoomId;
}

// ─────────────── validation ─────────────

const ROOM_ID_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** Validate a room id. Must be lowercase alphanumeric + hyphens, 1-63 chars. */
export const validateRoomId = (id: string): Result<RoomId, GraphError> =>
  ROOM_ID_RE.test(id)
    ? ok(id)
    : err(
        GraphError.invalidNode(
          'room.id',
          `room id '${id}' must be lowercase alphanumeric + hyphens, 1-63 chars`,
        ),
      );

/** Build a room id from a human-friendly name (slugify). */
export const slugifyRoomName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63) || 'default';

// ─────────────── helpers ────────────────

/** Find a room by id in the registry. */
export const findRoom = (registry: RoomRegistry, id: RoomId): RoomMeta | undefined =>
  registry.rooms.find((r) => r.id === id);

/** Check if a room exists. */
export const hasRoom = (registry: RoomRegistry, id: RoomId): boolean =>
  registry.rooms.some((r) => r.id === id);

/** Get the effective default room. */
export const defaultRoom = (registry: RoomRegistry): RoomId | undefined =>
  registry.default_room ?? registry.rooms[0]?.id;

/** List all room ids. */
export const roomIds = (registry: RoomRegistry): readonly RoomId[] =>
  registry.rooms.map((r) => r.id);

// ─────────────── pure mutators ──────────

/** Add a room to the registry. Rejects duplicates. */
export const addRoom = (
  registry: RoomRegistry,
  room: RoomMeta,
): Result<RoomRegistry, GraphError> => {
  if (hasRoom(registry, room.id)) {
    return err(GraphError.invalidNode('room.id', `room '${room.id}' already exists`));
  }
  const validation = validateRoomId(room.id);
  if (validation.isErr()) return err(validation.error);
  return ok({
    ...registry,
    rooms: [...registry.rooms, room],
    default_room: registry.default_room ?? room.id,
  });
};

/** Set the default room. The room must exist. */
export const setDefault = (
  registry: RoomRegistry,
  id: RoomId,
): Result<RoomRegistry, GraphError> => {
  if (!hasRoom(registry, id)) {
    return err(GraphError.nodeNotFound(id));
  }
  return ok({ ...registry, default_room: id });
};

/** Create an empty registry. */
export const emptyRegistry = (): RoomRegistry => ({
  rooms: [],
  default_room: undefined,
});
