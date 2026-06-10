/**
 * Help-coverage gate — every command registered in src/cli/index.ts
 * must appear in the help text. Catches the drift where a command
 * ships but stays undiscoverable (`save`, `share`, `peer`, and 20
 * others were missing from help before this gate existed).
 *
 * Text-level on purpose: importing the CLI entry would execute its
 * argv routing, and importing help.ts only gets us half the pair.
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const registrySource = readFileSync(join(ROOT, 'src', 'cli', 'index.ts'), 'utf8');
const helpSource = readFileSync(join(ROOT, 'src', 'cli', 'commands', 'help.ts'), 'utf8');

/** Commands that are deliberately undocumented. */
const HIDDEN = new Set([
  '--version', '-v', '--help', '-h',   // aliases of version/help
]);

const extractRegistryCommands = (src: string): string[] => {
  const block = src.match(/const commands: Record<string, CommandFn> = \{([\s\S]*?)\n\};/);
  assert.ok(block, 'commands registry not found in src/cli/index.ts');
  const keys: string[] = [];
  for (const line of block[1].split('\n')) {
    // `  name,` | `  name: fn,` | `  'quoted-name': fn,`
    const m = line.match(/^\s{2}'?([a-z][a-z0-9-]*)'?\s*[:,]/);
    if (m) keys.push(m[1]);
  }
  return keys;
};

describe('help coverage', () => {
  it('every registered command is documented in help', () => {
    const commands = extractRegistryCommands(registrySource);
    assert.ok(commands.length > 30, `registry parse looks broken (${commands.length} commands)`);
    const missing = commands.filter((c) => !HIDDEN.has(c) && !new RegExp(`(^|[\\s|])${c}([\\s|]|$)`, 'm').test(helpSource));
    assert.deepEqual(missing, [], `undocumented commands: ${missing.join(', ')} — add them to src/cli/commands/help.ts`);
  });
});
