/**
 * RoomsConfig — port + JSON file adapter for the room registry.
 *
 * Stores the room registry at `~/.wellinformed/rooms.json`. Same
 * pattern as sources-config: read-all on every call, atomic write,
 * ResultAsync returns.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import type { GraphError } from '../domain/errors.js';
import { GraphError as GE } from '../domain/errors.js';
import type { RoomMeta, RoomRegistry, RoomId } from '../domain/rooms.js';
import { addRoom, emptyRegistry, setDefault } from '../domain/rooms.js';

/** Port. */
export interface RoomsConfig {
  load(): ResultAsync<RoomRegistry, GraphError>;
  save(registry: RoomRegistry): ResultAsync<void, GraphError>;
  create(room: RoomMeta): ResultAsync<RoomRegistry, GraphError>;
  setDefault(id: RoomId): ResultAsync<RoomRegistry, GraphError>;
}

export const fileRoomsConfig = (path: string): RoomsConfig => {
  const load = (): ResultAsync<RoomRegistry, GraphError> => {
    if (!existsSync(path)) return okAsync(emptyRegistry());
    return ResultAsync.fromPromise(readFile(path, 'utf8'), (e) =>
      GE.readError(path, (e as Error).message),
    ).andThen((text) => {
      if (text.trim().length === 0) return okAsync<RoomRegistry, GraphError>(emptyRegistry());
      try {
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object') {
          return errAsync<RoomRegistry, GraphError>(
            GE.parseError(path, 'rooms.json root must be an object'),
          );
        }
        const registry: RoomRegistry = {
          rooms: Array.isArray(parsed.rooms) ? (parsed.rooms as RoomMeta[]) : [],
          default_room: typeof parsed.default_room === 'string' ? parsed.default_room : undefined,
        };
        return okAsync<RoomRegistry, GraphError>(registry);
      } catch (e) {
        return errAsync<RoomRegistry, GraphError>(GE.parseError(path, (e as Error).message));
      }
    });
  };

  const save = (registry: RoomRegistry): ResultAsync<void, GraphError> => {
    try {
      mkdirSync(dirname(path), { recursive: true });
    } catch (e) {
      return errAsync(GE.writeError(path, (e as Error).message));
    }
    return ResultAsync.fromPromise(
      writeFile(path, JSON.stringify(registry, null, 2), 'utf8'),
      (e) => GE.writeError(path, (e as Error).message),
    );
  };

  const create = (room: RoomMeta): ResultAsync<RoomRegistry, GraphError> =>
    load().andThen((registry) => {
      const result = addRoom(registry, room);
      if (result.isErr()) return errAsync<RoomRegistry, GraphError>(result.error);
      const next = result.value;
      return save(next).map(() => next);
    });

  const setDefaultRoom = (id: RoomId): ResultAsync<RoomRegistry, GraphError> =>
    load().andThen((registry) => {
      const result = setDefault(registry, id);
      if (result.isErr()) return errAsync<RoomRegistry, GraphError>(result.error);
      const next = result.value;
      return save(next).map(() => next);
    });

  return { load, save, create, setDefault: setDefaultRoom };
};
