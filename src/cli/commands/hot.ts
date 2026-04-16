/**
 * `wellinformed hot [--refresh] [--path]`
 *
 * --refresh (default): regenerate hot.md from the current graph and print its location
 * --print              : print the rendered markdown to stdout without writing
 * --path               : print the file path only (for SessionStart hook wiring)
 */

import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { runtimePaths } from '../runtime.js';
import { fileGraphRepository } from '../../infrastructure/graph-repository.js';
import { formatError } from '../../domain/errors.js';
import { refreshHotCache, buildHotCacheText, HOT_FILENAME } from '../../application/hot-cache-tick.js';

export const hot = async (rest: readonly string[]): Promise<number> => {
  const flag = rest[0] ?? '--refresh';
  const paths = runtimePaths();
  const graphs = fileGraphRepository(join(paths.home, 'graph.json'));
  const target = join(paths.home, HOT_FILENAME);

  if (flag === '--path') {
    console.log(target);
    return 0;
  }

  if (flag === '--print') {
    if (existsSync(target)) {
      process.stdout.write(readFileSync(target, 'utf8'));
      return 0;
    }
    const r = await buildHotCacheText(graphs);
    if (r.isErr()) {
      console.error(`hot: ${formatError(r.error)}`);
      return 1;
    }
    process.stdout.write(r.value);
    return 0;
  }

  // default: --refresh
  const r = await refreshHotCache(graphs, paths.home);
  if (r.isErr()) {
    console.error(`hot: ${formatError(r.error)}`);
    return 1;
  }
  console.log(`hot cache written: ${r.value}`);
  return 0;
};
