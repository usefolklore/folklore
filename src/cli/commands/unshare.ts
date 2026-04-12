/**
 * `wellinformed unshare <name>` — make a room private again.
 *
 * Phase 16 (SHARE-02). Removes the room from shared-rooms.json so the
 * daemon stops opening new sync streams for it. Existing streams are
 * closed when the daemon ticks next (or on daemon restart).
 *
 * KEEPS the .ydoc binary file at ~/.wellinformed/ydocs/<name>.ydoc so a
 * future `share room <name>` resumes from current CRDT state instead of
 * starting empty (locked decision in 16-CONTEXT.md).
 */
import { join } from 'node:path';
import { formatError } from '../../domain/errors.js';
import { mutateSharedRooms, removeSharedRoom } from '../../infrastructure/share-store.js';
import { wellinformedHome } from '../runtime.js';

const sharedRoomsPath = (): string => join(wellinformedHome(), 'shared-rooms.json');

const USAGE = `usage: wellinformed unshare <name>

Removes a room from the public registry. Existing imported nodes are
kept on disk and the .ydoc snapshot is retained for future re-sharing.`;

export const unshare = async (args: readonly string[]): Promise<number> => {
  const name = args[0];
  if (!name) {
    console.error('unshare: missing <name>');
    console.error(USAGE);
    return 1;
  }

  // Load current registry (identity transform) to detect whether the room is
  // currently shared, before committing a removal. This avoids a double-lock
  // sequence — the idempotent check is done inside a single lock scope by
  // calling mutateSharedRooms twice at the cost of one extra lock acquisition,
  // which is acceptable (the operation is human-initiated, not in a hot path).
  const before = await mutateSharedRooms(sharedRoomsPath(), (file) => file);
  if (before.isErr()) {
    console.error(`unshare: ${formatError(before.error)}`);
    return 1;
  }
  const wasShared = before.value.rooms.some((r) => r.name === name);

  if (!wasShared) {
    console.log(`unshare: '${name}' was not shared (no-op)`);
    return 0;
  }

  const writeResult = await mutateSharedRooms(sharedRoomsPath(), (file) =>
    removeSharedRoom(file, name),
  );
  if (writeResult.isErr()) {
    console.error(`unshare: ${formatError(writeResult.error)}`);
    return 1;
  }

  console.log(`unshare '${name}': now private`);
  console.log(`  .ydoc snapshot retained — future \`share room ${name}\` resumes from current state`);
  console.log('  restart the daemon (wellinformed daemon stop && start) to close active sync streams for this room');
  return 0;
};
