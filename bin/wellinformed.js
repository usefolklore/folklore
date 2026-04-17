#!/usr/bin/env node
/**
 * wellinformed CLI entry (thin shim).
 * Prefers the compiled output at ../dist/cli/index.js.
 * Falls back to running the TypeScript source via `tsx` for local development.
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const distEntry = join(here, '..', 'dist', 'cli', 'index.js');
const srcEntry = join(here, '..', 'src', 'cli', 'index.ts');

if (existsSync(distEntry)) {
  await import(distEntry);
} else if (existsSync(srcEntry)) {
  const result = spawnSync('npx', ['--yes', 'tsx', srcEntry, ...process.argv.slice(2)], {
    stdio: 'inherit',
  });
  process.exit(result.status ?? 1);
} else {
  console.error('wellinformed: no build output and no source found.');
  console.error('run `npm install && npm run build` from the project root.');
  process.exit(1);
}
