/**
 * `folklore live` — real-time feed of peers pulling parts of your tree.
 *
 * Proof the network is alive: every time another peer fetches or searches your
 * graph, the daemon appends the event to served-feed.jsonl; this command tails
 * it and prints each request as it lands —
 *
 *   ⬅  @sam-rs  pulled  concept://…/tokio-rc-send   from your tree   just now
 *
 * Read-only, runs until Ctrl-C. Reflects real serve traffic off the running
 * daemon; nothing is synthesised.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const HOME = (): string => process.env.FOLKLORE_HOME || join(homedir(), '.folklore');

const c = {
  reset: '\x1b[0m', dim: (s: string) => `\x1b[2m${s}\x1b[0m`, bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`, cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`, gray: (s: string) => `\x1b[90m${s}\x1b[0m`,
};

interface FeedLine {
  readonly ts: string;
  readonly peer: string;
  readonly kind: 'search' | 'fetch';
  readonly count: number;
  readonly nodes?: readonly string[];
}

/** Resolve a peer id to @handle (peer-labels.json) or a short id. */
const peerLabel = (home: string, peerId: string): string => {
  try {
    const labels = JSON.parse(readFileSync(join(home, 'peer-labels.json'), 'utf8')) as {
      peers?: Record<string, { github?: string }>;
    };
    const gh = labels.peers?.[peerId]?.github;
    if (gh) return `@${gh}`;
  } catch { /* unlabelled */ }
  return `peer:${peerId.slice(0, 6)}…${peerId.slice(-4)}`;
};

/** Shorten a node id to something readable — the last path segment, else a stub. */
const shortNode = (id: string): string => {
  if (!id) return '(node)';
  const tail = id.split('/').filter(Boolean).pop() ?? id;
  return tail.length > 40 ? tail.slice(0, 39) + '…' : tail;
};

const ago = (iso: string): string => {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 1500) return 'just now';
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return `${Math.floor(ms / 3_600_000)}h ago`;
};

const render = (home: string, l: FeedLine): string => {
  const who = c.cyan(peerLabel(home, l.peer));
  const verb = l.kind === 'fetch' ? 'pulled' : 'searched';
  const what = l.nodes && l.nodes.length
    ? c.bold(shortNode(l.nodes[0])) + (l.nodes.length > 1 ? c.dim(` +${l.nodes.length - 1}`) : '')
    : c.dim(`${l.count} node${l.count === 1 ? '' : 's'}`);
  return `  ${c.green('⬅')}  ${who}  ${c.dim(verb)}  ${what}  ${c.dim('from your tree')}  ${c.gray('· ' + ago(l.ts))}`;
};

export const live = async (args: readonly string[]): Promise<number> => {
  const home = HOME();
  const feed = join(home, 'served-feed.jsonl');
  const tail = Math.max(0, Number((args.find((a) => a.startsWith('--tail='))?.split('=')[1]) ?? 5));

  process.stdout.write('\n');
  process.stdout.write(`  ${c.bold('folklore live')} ${c.dim('· peers pulling from your tree, in real time')}\n`);
  process.stdout.write(`  ${c.dim('watching ' + feed)}\n`);
  process.stdout.write(`  ${c.dim('─'.repeat(64))}\n\n`);

  const printLines = (buf: string): void => {
    for (const raw of buf.split('\n')) {
      if (!raw.trim()) continue;
      try {
        process.stdout.write(render(home, JSON.parse(raw) as FeedLine) + '\n');
      } catch { /* skip malformed */ }
    }
  };

  // Seed with the last few historical events so the view isn't empty.
  let offset = 0;
  if (existsSync(feed)) {
    const all = readFileSync(feed, 'utf8');
    offset = Buffer.byteLength(all);
    const recent = all.split('\n').filter(Boolean).slice(-tail).join('\n');
    if (recent) { printLines(recent); }
  }
  if (offset === 0) {
    process.stdout.write(`  ${c.dim('no requests yet — waiting for peers to reach your tree…')}\n`);
  }

  // Poll for appends (portable + robust vs fs.watch quirks).
  await new Promise<void>((resolve) => {
    const timer = setInterval(() => {
      try {
        if (!existsSync(feed)) return;
        const size = statSync(feed).size;
        if (size > offset) {
          const fd = readFileSync(feed);
          printLines(fd.subarray(offset).toString('utf8'));
          offset = size;
        } else if (size < offset) {
          offset = size; // file rotated/truncated
        }
      } catch { /* transient */ }
    }, 500);
    const stop = (): void => { clearInterval(timer); process.stdout.write('\n'); resolve(); };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
  return 0;
};
