/**
 * Desktop notification when a peer pulls from your tree — a top-right pop, in
 * real time, so you SEE the network reach you while you work (no listener to
 * run, no statusline to watch).
 *
 * macOS: uses terminal-notifier when present (a folklore-coloured icon), else
 * falls back to osascript. Best-effort and rate-limited — a burst of requests
 * never spams; a failure never touches the serve path. Opt out with
 * FOLKLORE_NOTIFY=0.
 */
import { spawn, execFileSync } from 'node:child_process';
import { platform } from 'node:os';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let lastAt = 0;
const MIN_INTERVAL_MS = 1200;
/** Resolved once per process: terminal-notifier path, '' if absent, null if unchecked. */
let tnPath: string | null = null;

const which = (bin: string): string => {
  try {
    // `command -v` needs a shell; run sh directly (no shell:true) — bin is a
    // fixed literal, never user input.
    return execFileSync('/bin/sh', ['-c', `command -v ${bin}`], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};

const label = (home: string, peer: string): string => {
  try {
    const j = JSON.parse(readFileSync(join(home, 'peer-labels.json'), 'utf8')) as {
      peers?: Record<string, { github?: string }>;
    };
    const gh = j.peers?.[peer]?.github;
    if (gh) return `@${gh}`;
  } catch { /* unlabelled */ }
  return `peer:${peer.slice(0, 6)}…${peer.slice(-4)}`;
};

const shortNode = (id?: string): string => {
  if (!id) return 'a trace';
  const tail = id.split('/').filter(Boolean).pop() ?? id;
  return tail.length > 40 ? tail.slice(0, 39) + '…' : tail;
};

/**
 * Pop a "peer pulled from your tree" notification. Best-effort; swallows all
 * errors. Rate-limited so bursts collapse into one visible pop.
 */
export const notifyPeerRequest = (home: string, peer: string, node?: string): void => {
  if (process.env.FOLKLORE_NOTIFY === '0') return;
  if (platform() !== 'darwin') return; // macOS pops today; other OSes are no-ops
  const now = Date.now();
  if (now - lastAt < MIN_INTERVAL_MS) return;
  lastAt = now;

  const who = label(home, peer);
  const body = `${who}  ←  ${shortNode(node)}`;
  const title = '🌐 folklore';
  const subtitle = 'peer pulled from your tree';

  try {
    if (tnPath === null) tnPath = which('terminal-notifier');
    if (tnPath) {
      // terminal-notifier renders its own icon → a distinct coloured pop.
      spawn(
        tnPath,
        ['-title', title, '-subtitle', subtitle, '-message', body, '-sender', 'com.apple.Terminal', '-group', 'folklore'],
        { stdio: 'ignore' },
      ).unref();
      return;
    }
    const esc = (s: string): string => s.replace(/["\\]/g, '\\$&');
    spawn(
      'osascript',
      ['-e', `display notification "${esc(body)}" with title "${esc(title)}" subtitle "${esc(subtitle)}"`],
      { stdio: 'ignore' },
    ).unref();
  } catch {
    /* best-effort — never breaks a serve */
  }
};
