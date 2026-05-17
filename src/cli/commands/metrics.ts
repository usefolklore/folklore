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

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const wellinformedHome = (): string =>
  process.env.WELLINFORMED_HOME ?? join(homedir(), '.wellinformed');

interface BypassRow {
  readonly ts: string;
  readonly tool: string;
  readonly query?: string;
  readonly terminal_query?: string;
  readonly satisfaction?: number | null;
  readonly peers_responded?: number;
  readonly peers_queried?: number;
  readonly denied?: boolean;
}

interface PrefetchRow {
  readonly ts: string;
  readonly query: string;
  readonly terminal?: boolean;
  readonly satisfaction?: number | null;
  readonly peers_responded?: number;
  readonly peers_queried?: number;
}

const readJsonl = <T>(path: string): T[] => {
  if (!existsSync(path)) return [];
  try {
    return readFileSync(path, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try { return JSON.parse(l) as T; } catch { return null; }
      })
      .filter((x): x is T => x !== null);
  } catch { return []; }
};

/**
 * `wellinformed metrics bypass [--json] [--since <iso>]`
 *
 * Reads the prompt-prefetch log + bypass-log and computes:
 *   - terminal-verdicts issued (sat ≥ 0.85)
 *   - outbound-tool calls attempted after a terminal verdict
 *   - bypass rate = bypass_attempts / terminal_verdicts
 *
 * Bypass rate baseline expectations:
 *   - WELLINFORMED_DENY_ON_TERMINAL=0 (soft persuasion only): some
 *     bypass is expected; the rate measures how often the contract
 *     block is ignored.
 *   - WELLINFORMED_DENY_ON_TERMINAL=1 (hard deny): bypass should
 *     never be 0 BLOCKED — every attempt logged is one the harness
 *     denied. Rate > 0 with denied=true means the deny path works.
 *     Rate > 0 with denied=false means the deny path failed open.
 */
const bypassSummary = (args: readonly string[]): number => {
  const asJson = args.includes('--json');
  const sinceIdx = args.indexOf('--since');
  const since = sinceIdx >= 0 ? args[sinceIdx + 1] : null;
  const sinceMs = since ? Date.parse(since) : 0;

  const home = wellinformedHome();
  const prefetch = readJsonl<PrefetchRow>(join(home, 'prompt-prefetch-log.jsonl'))
    .filter((r) => !sinceMs || Date.parse(r.ts) >= sinceMs);
  const bypass = readJsonl<BypassRow>(join(home, 'bypass-log.jsonl'))
    .filter((r) => !sinceMs || Date.parse(r.ts) >= sinceMs);

  const terminalVerdicts = prefetch.filter((r) => r.terminal === true).length;
  const allVerdicts = prefetch.length;
  const bypassAttempts = bypass.length;
  const bypassDenied = bypass.filter((r) => r.denied === true).length;
  const bypassPassed = bypass.filter((r) => r.denied !== true).length;
  const rate = terminalVerdicts > 0 ? bypassAttempts / terminalVerdicts : 0;
  const byTool: Record<string, number> = {};
  for (const r of bypass) byTool[r.tool] = (byTool[r.tool] ?? 0) + 1;

  const out = {
    terminal_verdicts: terminalVerdicts,
    all_verdicts: allVerdicts,
    bypass_attempts: bypassAttempts,
    bypass_denied: bypassDenied,
    bypass_passed: bypassPassed,
    bypass_rate: rate,
    by_tool: byTool,
    window_since: since ?? '(all time)',
    emitted_at: new Date().toISOString(),
  };

  if (asJson) {
    console.log(JSON.stringify(out, null, 2));
    return 0;
  }

  console.log(`wellinformed metrics bypass (window: ${out.window_since})`);
  console.log(`  terminal verdicts issued : ${terminalVerdicts}  (of ${allVerdicts} hook fires)`);
  console.log(`  bypass attempts          : ${bypassAttempts}`);
  console.log(`     denied by harness     : ${bypassDenied}`);
  console.log(`     passed through        : ${bypassPassed}`);
  console.log(`  bypass rate              : ${(rate * 100).toFixed(1)}%`);
  if (Object.keys(byTool).length > 0) {
    console.log(`  by tool:`);
    for (const [tool, count] of Object.entries(byTool).sort((a, b) => b[1] - a[1])) {
      console.log(`     ${tool.padEnd(12)} ${count}`);
    }
  }
  console.log('');
  if (bypassPassed > 0) {
    console.log(`! ${bypassPassed} bypass attempt(s) passed through. Either deny-on-terminal is`);
    console.log(`  off (WELLINFORMED_DENY_ON_TERMINAL=0 is the default) or the harness`);
    console.log(`  ignored the permissionDecision response. Investigate if you set =1.`);
  }
  return 0;
};

export const metricsCmd = async (args: string[]): Promise<number> => {
  // Subcommand: bypass
  if (args.length > 0 && args[0] === 'bypass') {
    return bypassSummary(args.slice(1));
  }

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
