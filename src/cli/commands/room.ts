/**
 * `wellinformed room <sub>` — manage the room registry.
 *
 * Subcommands:
 *   list            show all rooms + which is default
 *   create <name>   create a room (prompts or flags for details)
 *   switch <id>     set the default room
 *   current         print the current default room
 *   describe <id>   show full metadata for a room
 *
 * Example:
 *   wellinformed room create homelab --desc "Home lab infra" --keywords "proxmox,mikrotik,10gbe"
 *   wellinformed room switch homelab
 */

import { formatError } from '../../domain/errors.js';
import type { RoomMeta } from '../../domain/rooms.js';
import { slugifyRoomName } from '../../domain/rooms.js';
import { fileRoomsConfig } from '../../infrastructure/rooms-config.js';
import { runtimePaths } from '../runtime.js';
import { join } from 'node:path';

const roomsPath = (): string => join(runtimePaths().home, 'rooms.json');

// ─────────────── subcommands ──────────────

const list = async (): Promise<number> => {
  const cfg = fileRoomsConfig(roomsPath());
  const result = await cfg.load();
  if (result.isErr()) {
    console.error(`room list: ${formatError(result.error)}`);
    return 1;
  }
  const registry = result.value;
  if (registry.rooms.length === 0) {
    console.log('no rooms configured. try `wellinformed init` or `wellinformed room create <name>`.');
    return 0;
  }
  for (const r of registry.rooms) {
    const marker = r.id === registry.default_room ? ' *' : '  ';
    const keywords = r.keywords.length > 0 ? ` [${r.keywords.join(', ')}]` : '';
    console.log(`${marker} ${r.id.padEnd(20)} ${r.description}${keywords}`);
  }
  console.log(`\n  * = default room`);
  return 0;
};

const create = async (rest: readonly string[]): Promise<number> => {
  if (rest.length === 0) {
    console.error('room create: missing <name>. usage: wellinformed room create <name> [--desc "..."] [--keywords "a,b,c"] [--wing "default"]');
    return 1;
  }
  const name = rest[0];
  const id = slugifyRoomName(name);
  let description = '';
  let keywords: string[] = [];
  let wing: string | undefined;

  for (let i = 1; i < rest.length; i++) {
    const a = rest[i];
    const next = (): string | undefined => rest[++i];
    if (a === '--desc' || a === '--description') description = next() ?? '';
    else if (a.startsWith('--desc=')) description = a.slice('--desc='.length);
    else if (a === '--keywords') keywords = (next() ?? '').split(',').map((k) => k.trim()).filter(Boolean);
    else if (a.startsWith('--keywords=')) keywords = a.slice('--keywords='.length).split(',').map((k) => k.trim()).filter(Boolean);
    else if (a === '--wing') wing = next();
    else if (a.startsWith('--wing=')) wing = a.slice('--wing='.length);
  }

  const room: RoomMeta = {
    id,
    name,
    description: description || `Research room for ${name}`,
    keywords,
    default_wing: wing,
    created_at: new Date().toISOString(),
  };

  const cfg = fileRoomsConfig(roomsPath());
  const result = await cfg.create(room);
  if (result.isErr()) {
    console.error(`room create: ${formatError(result.error)}`);
    return 1;
  }
  console.log(`created room '${id}' (${room.description})`);
  if (result.value.default_room === id) {
    console.log(`  set as default room`);
  }
  return 0;
};

const switchRoom = async (rest: readonly string[]): Promise<number> => {
  const id = rest[0];
  if (!id) {
    console.error('room switch: missing <id>');
    return 1;
  }
  const cfg = fileRoomsConfig(roomsPath());
  const result = await cfg.setDefault(id);
  if (result.isErr()) {
    console.error(`room switch: ${formatError(result.error)}`);
    return 1;
  }
  console.log(`default room is now '${id}'`);
  return 0;
};

const current = async (): Promise<number> => {
  const cfg = fileRoomsConfig(roomsPath());
  const result = await cfg.load();
  if (result.isErr()) {
    console.error(formatError(result.error));
    return 1;
  }
  const def = result.value.default_room;
  if (!def) {
    console.log('no default room set. run `wellinformed init` to create one.');
    return 0;
  }
  console.log(def);
  return 0;
};

const describe = async (rest: readonly string[]): Promise<number> => {
  const id = rest[0];
  if (!id) {
    console.error('room describe: missing <id>');
    return 1;
  }
  const cfg = fileRoomsConfig(roomsPath());
  const result = await cfg.load();
  if (result.isErr()) {
    console.error(formatError(result.error));
    return 1;
  }
  const room = result.value.rooms.find((r) => r.id === id);
  if (!room) {
    console.error(`room describe: room '${id}' not found`);
    return 1;
  }
  console.log(`id:           ${room.id}`);
  console.log(`name:         ${room.name}`);
  console.log(`description:  ${room.description}`);
  console.log(`keywords:     ${room.keywords.join(', ') || '(none)'}`);
  console.log(`default wing: ${room.default_wing ?? '(none)'}`);
  console.log(`created:      ${room.created_at}`);
  console.log(`is default:   ${result.value.default_room === room.id ? 'yes' : 'no'}`);
  return 0;
};

// ─────────────── entry ──────────────────

export const room = async (args: readonly string[]): Promise<number> => {
  const [sub, ...rest] = args;
  switch (sub) {
    case undefined:
    case 'list':
      return list();
    case 'create':
      return create(rest);
    case 'switch':
      return switchRoom(rest);
    case 'current':
      return current();
    case 'describe':
      return describe(rest);
    default:
      console.error(`room: unknown subcommand '${sub}'. try: list | create | switch | current | describe`);
      return 1;
  }
};
