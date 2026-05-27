/**
 * `wellinformed sources <sub>` — manage the ~/.wellinformed/sources.json
 * registry.
 *
 * Subcommands:
 *
 *   list
 *   add <id> --kind <kind> --room <room> [--wing <wing>] --config <json>
 *   remove <id>
 *   disable <id>
 *   enable <id>
 *
 * Example:
 *   wellinformed sources add hn-embeddings \
 *     --kind hn_algolia --room fundraise \
 *     --config '{"query":"embeddings","max_items":10}'
 */

import { formatError } from '../../domain/errors.js';
import type { SourceDescriptor, SourceKind } from '../../domain/sources.js';
import { fileSourcesConfig } from '../../infrastructure/sources-config.js';
import { runtimePaths } from '../runtime.js';

const VALID_KINDS: readonly SourceKind[] = ['generic_rss', 'arxiv', 'hn_algolia', 'generic_url'];

// ─────────────────────── arg parsing ──────────────────────

interface AddArgs {
  readonly id: string;
  readonly kind: SourceKind;
  readonly room: string;
  readonly wing?: string;
  readonly config: Readonly<Record<string, unknown>>;
}

const parseAddArgs = (args: readonly string[]): AddArgs | string => {
  if (args.length === 0) return 'missing <id> — usage: wellinformed sources add <id> --kind K --room R --config {json}';
  const id = args[0];
  let kind: string | undefined;
  let room: string | undefined;
  let wing: string | undefined;
  let configRaw: string | undefined;
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    const next = (): string | undefined => args[++i];
    if (a === '--kind') kind = next();
    else if (a.startsWith('--kind=')) kind = a.slice('--kind='.length);
    else if (a === '--room') room = next();
    else if (a.startsWith('--room=')) room = a.slice('--room='.length);
    else if (a === '--wing') wing = next();
    else if (a.startsWith('--wing=')) wing = a.slice('--wing='.length);
    else if (a === '--config') configRaw = next();
    else if (a.startsWith('--config=')) configRaw = a.slice('--config='.length);
  }
  if (!kind) return 'missing --kind';
  if (!room) return 'missing --room';
  if (!configRaw) return 'missing --config (JSON string)';
  if (!VALID_KINDS.includes(kind as SourceKind)) {
    return `invalid --kind '${kind}' — must be one of ${VALID_KINDS.join(', ')}`;
  }
  let config: Record<string, unknown>;
  try {
    const parsed = JSON.parse(configRaw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return '--config must be a JSON object';
    }
    config = parsed as Record<string, unknown>;
  } catch (e) {
    return `--config JSON parse failed: ${(e as Error).message}`;
  }
  return { id, kind: kind as SourceKind, room, wing, config };
};

// ─────────────────────── subcommands ──────────────────────

const list = async (): Promise<number> => {
  const cfg = fileSourcesConfig(runtimePaths().sources);
  const result = await cfg.list();
  if (result.isErr()) {
    console.error(`sources list: ${formatError(result.error)}`);
    return 1;
  }
  const all = result.value;
  if (all.length === 0) {
    console.log('no sources configured. try `wellinformed sources add` to create one.');
    return 0;
  }
  console.log('id                              kind            room            enabled  config');
  for (const d of all) {
    const enabled = d.enabled === false ? 'no ' : 'yes';
    const configStr = JSON.stringify(d.config);
    const line = `${d.id.padEnd(31)} ${d.kind.padEnd(15)} ${(d.room ?? '-').padEnd(15)} ${enabled}      ${configStr}`;
    console.log(line);
  }
  return 0;
};

const add = async (rest: readonly string[]): Promise<number> => {
  const parsed = parseAddArgs(rest);
  if (typeof parsed === 'string') {
    console.error(`sources add: ${parsed}`);
    return 1;
  }
  const descriptor: SourceDescriptor = {
    id: parsed.id,
    kind: parsed.kind,
    room: parsed.room,
    wing: parsed.wing,
    enabled: true,
    config: parsed.config,
  };
  const cfg = fileSourcesConfig(runtimePaths().sources);
  const result = await cfg.add(descriptor);
  if (result.isErr()) {
    console.error(`sources add: ${formatError(result.error)}`);
    return 1;
  }
  console.log(`added ${descriptor.id} (${descriptor.kind}) → room=${descriptor.room}`);
  return 0;
};

const remove = async (rest: readonly string[]): Promise<number> => {
  const id = rest[0];
  if (!id) {
    console.error('sources remove: missing <id>');
    return 1;
  }
  const cfg = fileSourcesConfig(runtimePaths().sources);
  const result = await cfg.remove(id);
  if (result.isErr()) {
    console.error(`sources remove: ${formatError(result.error)}`);
    return 1;
  }
  console.log(`removed ${id}`);
  return 0;
};

const toggle = async (rest: readonly string[], enable: boolean): Promise<number> => {
  const id = rest[0];
  if (!id) {
    console.error(`sources ${enable ? 'enable' : 'disable'}: missing <id>`);
    return 1;
  }
  const cfg = fileSourcesConfig(runtimePaths().sources);
  const current = await cfg.list();
  if (current.isErr()) {
    console.error(formatError(current.error));
    return 1;
  }
  const next = current.value.map((d) => (d.id === id ? { ...d, enabled: enable } : d));
  if (!current.value.some((d) => d.id === id)) {
    console.error(`sources ${enable ? 'enable' : 'disable'}: no source with id '${id}'`);
    return 1;
  }
  const replaced = await cfg.replace(next);
  if (replaced.isErr()) {
    console.error(formatError(replaced.error));
    return 1;
  }
  console.log(`${enable ? 'enabled' : 'disabled'} ${id}`);
  return 0;
};

// ─────────────────────── entry ────────────────────────────

export const sources = async (args: readonly string[]): Promise<number> => {
  const [sub, ...rest] = args;
  switch (sub) {
    case undefined:
    case 'list':
      return list();
    case 'add':
      return add(rest);
    case 'remove':
      return remove(rest);
    case 'disable':
      return toggle(rest, false);
    case 'enable':
      return toggle(rest, true);
    default:
      console.error(`sources: unknown subcommand '${sub}'. try: list | add | remove | disable | enable`);
      return 1;
  }
};
