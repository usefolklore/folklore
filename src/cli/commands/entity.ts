/**
 * `wellinformed entity <sub>` — manage the entity registry.
 *
 *   add <label> [--alias A] [--alias B] [--type T] [--note ...]
 *   list [--json]
 *   remove <id>
 *
 * The registry lives at $WELLINFORMED_HOME/entities.json. It's the
 * source of truth for canonical aliases — heuristic detection
 * augments it but cannot override.
 */

import { join } from 'node:path';
import { fileEntityRegistry } from '../../infrastructure/entity-registry.js';
import { type EntityKind } from '../../domain/entity.js';
import { runtimePaths } from '../runtime.js';

const VALID_TYPES: ReadonlySet<EntityKind> = new Set([
  'product', 'org', 'person', 'repo', 'package', 'concept', 'symbol', 'url', 'unknown',
]);

const USAGE = `usage: wellinformed entity <sub>

  add <label> [--alias A]+ [--type T] [--note ...]
                              register a canonical entity. label is
                              the display form; aliases are surface
                              forms (case-insensitive) the extractor
                              should map to this entity.
                              types: product, org, person, repo,
                              package, concept, symbol, url, unknown
                              (default: unknown)
  list [--json] [--all]       show user-curated entities (--all
                              includes heuristic auto-detected)
  remove <id>                 delete an entity by canonical id`;

const add = async (rest: readonly string[]): Promise<number> => {
  if (rest.length === 0) {
    console.error('entity add: missing <label>');
    console.error(USAGE);
    return 1;
  }
  const aliases: string[] = [];
  let label = '';
  let type: EntityKind = 'unknown';
  let note: string | undefined;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const next = (): string => rest[++i] ?? '';
    if (a === '--alias') aliases.push(next());
    else if (a.startsWith('--alias=')) aliases.push(a.slice('--alias='.length));
    else if (a === '--type') {
      const t = next();
      if (!VALID_TYPES.has(t as EntityKind)) {
        console.error(`entity add: invalid --type '${t}'. allowed: ${Array.from(VALID_TYPES).join(', ')}`);
        return 1;
      }
      type = t as EntityKind;
    } else if (a.startsWith('--type=')) {
      const t = a.slice('--type='.length);
      if (!VALID_TYPES.has(t as EntityKind)) {
        console.error(`entity add: invalid --type '${t}'`);
        return 1;
      }
      type = t as EntityKind;
    } else if (a === '--note') note = next();
    else if (a.startsWith('--note=')) note = a.slice('--note='.length);
    else if (!a.startsWith('-')) label = label ? `${label} ${a}` : a;
  }
  if (!label) {
    console.error('entity add: missing <label>');
    return 1;
  }
  const paths = runtimePaths();
  const reg = fileEntityRegistry(join(paths.home, 'entities.json'));
  const ent = reg.register({ label, type, aliases, note });
  console.log(`registered ${ent.id}`);
  console.log(`  label:   ${ent.label}`);
  console.log(`  type:    ${ent.type}`);
  console.log(`  aliases: ${ent.aliases.join(', ')}`);
  if (ent.note) console.log(`  note:    ${ent.note}`);
  console.log('');
  console.log(`mentions across the graph will be picked up on the next ingest.`);
  console.log(`run \`wellinformed recall ${label}\` after ingest to see hits.`);
  return 0;
};

const list = async (rest: readonly string[]): Promise<number> => {
  const json = rest.includes('--json');
  const showAll = rest.includes('--all');
  const paths = runtimePaths();
  const reg = fileEntityRegistry(join(paths.home, 'entities.json'));
  const allEnts = reg.list();
  // Default view = user-curated only. Heuristic auto-detected
  // entries (CamelCase symbols, URL hosts) flood the registry on a
  // big ingest and aren't usually what the user wants to inspect.
  // `--all` surfaces everything.
  const ents = showAll ? allEnts : allEnts.filter((e) => !e.auto);
  const autoCount = allEnts.length - ents.length;

  if (json) {
    console.log(JSON.stringify({ count: ents.length, total_with_auto: allEnts.length, entities: ents }, null, 2));
    return 0;
  }
  if (allEnts.length === 0) {
    console.log('no entities registered yet.');
    console.log('add one with: wellinformed entity add <label> [--alias A] [--type T]');
    return 0;
  }
  if (ents.length === 0) {
    console.log(`no user-curated entities (${autoCount} heuristic auto-detected — pass --all to see them).`);
    console.log('add one with: wellinformed entity add <label> [--alias A] [--type T]');
    return 0;
  }
  console.log(`entities (${ents.length}${showAll ? '' : `, +${autoCount} auto hidden`}):\n`);
  const sorted = ents
    .slice()
    .sort((a, b) => b.mention_count - a.mention_count || a.label.localeCompare(b.label));
  for (const e of sorted) {
    const tag = e.auto ? ' [auto]' : '';
    console.log(`  ${e.id}${tag}`);
    console.log(`    label:    ${e.label}`);
    console.log(`    type:     ${e.type}`);
    console.log(`    aliases:  ${e.aliases.join(', ')}`);
    console.log(`    mentions: ${e.mention_count}`);
    if (e.note) console.log(`    note:     ${e.note}`);
    console.log('');
  }
  return 0;
};

const remove = async (rest: readonly string[]): Promise<number> => {
  const id = rest[0];
  if (!id) {
    console.error('entity remove: missing <id>');
    return 1;
  }
  const paths = runtimePaths();
  const reg = fileEntityRegistry(join(paths.home, 'entities.json'));
  const ok = reg.remove(id);
  if (!ok) {
    console.error(`entity remove: '${id}' not found`);
    return 1;
  }
  console.log(`removed ${id}`);
  console.log('  note: existing `mentions` edges in the graph remain;');
  console.log('  they will be orphaned until the next consolidate / clean pass.');
  return 0;
};

export const entity = async (args: readonly string[]): Promise<number> => {
  const [sub, ...rest] = args;
  if (!sub || sub === '--help' || sub === '-h' || sub === 'help') {
    console.log(USAGE);
    return 0;
  }
  switch (sub) {
    case 'add':    return add(rest);
    case 'list':   return list(rest);
    case 'remove': return remove(rest);
    default:
      console.error(`entity: unknown subcommand '${sub}'`);
      console.error(USAGE);
      return 1;
  }
};
