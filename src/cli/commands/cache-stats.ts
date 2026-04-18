/**
 * `wellinformed cache-stats` — print L1 query cache observability.
 *
 * Pure proxy for the daemon-side `cache-stats` IPC command. Only
 * meaningful when the daemon is running (the cache lives in the
 * daemon's process, not in the spawned CLI). When the daemon isn't
 * running, prints "not running" and exits 0 — non-fatal because cache
 * stats are observability, not state.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const wellinformedHome = (): string =>
  process.env.WELLINFORMED_HOME ?? join(homedir(), '.wellinformed');

export const cacheStats = async (_args: string[]): Promise<number> => {
  // The actual IPC call is intercepted in bin/wellinformed.js when the
  // socket exists; this function only runs when the shim falls through
  // (no daemon socket). We render the no-daemon case here.
  const sock = join(wellinformedHome(), 'daemon.sock');
  if (!existsSync(sock)) {
    console.log(JSON.stringify({
      size: 0,
      hits: 0,
      misses: 0,
      evictions: 0,
      hit_rate: 0,
      via: 'no-daemon',
      note: 'L1 cache lives in the daemon process. Start `wellinformed daemon` to populate.',
    }));
    return 0;
  }
  // If we got here despite the socket existing, IPC delegation either
  // failed silently or the socket is stale. Emit an empty record + a
  // hint.
  console.log(JSON.stringify({
    via: 'no-daemon',
    note: 'IPC delegation failed despite socket presence — daemon may be stale',
  }));
  return 0;
};
