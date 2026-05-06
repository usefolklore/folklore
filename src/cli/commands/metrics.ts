/**
 * `wellinformed metrics` — emit the daemon's live metrics snapshot.
 *
 * Pure proxy for the daemon-side `metrics` IPC handler. The metrics
 * registry lives in the daemon process (counters/gauges/histograms
 * accumulated as the loop ticks); when the daemon is running the
 * shim in `bin/wellinformed.js` intercepts this command BEFORE we
 * reach this fallback and routes it over the unix socket.
 *
 * This file only fires when:
 *   - the user runs `wellinformed metrics` with no daemon running, OR
 *   - IPC delegation failed silently (stale socket, etc.)
 *
 * In both cases the right answer is a structured "no daemon" record
 * — non-fatal, exit 0 — so scripts that hot-poll metrics survive a
 * daemon restart cycle without dying.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const wellinformedHome = (): string =>
  process.env.WELLINFORMED_HOME ?? join(homedir(), '.wellinformed');

export const metricsCmd = async (_args: string[]): Promise<number> => {
  const sock = join(wellinformedHome(), 'daemon.sock');
  const note = existsSync(sock)
    ? 'IPC delegation failed despite socket presence — daemon may be stale'
    : 'metrics live in the daemon process. start `wellinformed daemon` to populate.';
  console.log(
    JSON.stringify({
      counters: {},
      gauges: {},
      histograms: {},
      via: 'no-daemon',
      note,
      emitted_at: new Date().toISOString(),
    }),
  );
  return 0;
};
