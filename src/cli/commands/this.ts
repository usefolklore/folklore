/**
 * `wellinformed this [me|everyone] [--root DIR] [--name NAME]`
 *
 * Index the current (or `--root`) directory into the knowledge graph
 * under a room slug derived from its basename. The visibility token
 * decides whether the resulting room is kept private (`me`, default)
 * or marked shareable on the P2P federation (`everyone`).
 *
 *   wellinformed this              → index cwd, room private
 *   wellinformed this me           → same (explicit private)
 *   wellinformed this everyone     → index cwd + share room with peers
 *
 * Sharing routes through the existing share-room flow, which audits
 * for secrets and refuses on flagged nodes — no override. Privacy
 * boundary identical to `wellinformed share room <name>`.
 */

import { basename, join, resolve } from 'node:path';
import { slugifyRoomName } from '../../domain/rooms.js';
import { indexProject } from './index-project.js';
import { share } from './share.js';
import { registerWatchTarget } from '../../infrastructure/watch-targets.js';
import { wellinformedHome, runtimePaths } from '../runtime.js';
import { isRunning } from '../../daemon/loop.js';
import { ipcCallLines } from '../ipc-client.js';

type Visibility = 'me' | 'everyone';

interface Parsed {
  readonly visibility: Visibility;
  readonly root: string;
  readonly name?: string;
}

const parseArgs = (args: readonly string[]): Parsed => {
  let visibility: Visibility = 'me';
  let root = process.cwd();
  let name: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = (): string => args[++i] ?? '';
    if (a === 'me' || a === 'private') visibility = 'me';
    else if (a === 'everyone' || a === 'public' || a === 'all') visibility = 'everyone';
    else if (a === '--root') root = next();
    else if (a.startsWith('--root=')) root = a.slice('--root='.length);
    else if (a === '--name') name = next();
    else if (a.startsWith('--name=')) name = a.slice('--name='.length);
  }
  return { visibility, root, name };
};

const USAGE = `usage: wellinformed this [me|everyone] [--root DIR] [--name NAME]

  me           keep room private (default; nothing leaves the host)
  everyone     index + mark room shareable on the P2P network
               (audited for secrets; flagged content is refused)

flags:
  --root DIR   index DIR instead of the current working directory
  --name NAME  override the room slug (default: basename of root)`;

export const thisCmd = async (args: readonly string[]): Promise<number> => {
  if (args.includes('--help') || args.includes('-h') || args.includes('help')) {
    console.log(USAGE);
    return 0;
  }
  const { visibility, root, name } = parseArgs(args);
  const slug = slugifyRoomName(name ?? basename(root));

  console.log(`wellinformed this ${visibility} — room '${slug}' (${root})\n`);
  const absRoot = resolve(root);

  // Register the watch-target FIRST. This is independent of the index
  // result — if the indexer hits a transient error mid-run, the
  // watcher should still be set up so future saves can heal it.
  // Idempotent — re-running just refreshes registered_at.
  registerWatchTarget(join(wellinformedHome(), 'watch-targets.json'), {
    room: slug,
    root: absRoot,
  });

  // Daemon-submit path — when the daemon is running, the synchronous
  // index-project mutates graph.json from this process while the
  // daemon's tick may also write, racing on the same file's tmp
  // rename. Submit an ingest:room job to the daemon instead so the
  // single-writer worker handles it; we return immediately.
  const daemonAlive = isRunning(runtimePaths().home);
  if (daemonAlive) {
    const out = await ipcCallLines('submit-job', ['ingest:project', slug, absRoot]);
    if (out === null) {
      console.error('this: failed to submit ingest:project — is the daemon healthy?');
      return 1;
    }
    const id = out.trim();
    console.log(`  queued  ${id}  ingest:project ${slug} (${absRoot})`);
    console.log(`\n  watch-target registered for ${absRoot}`);
    console.log(`  the daemon picks up the new watcher on next restart:`);
    console.log(`    wellinformed daemon stop && wellinformed daemon start`);
    console.log(`\n  track ingest progress with:  wellinformed jobs watch`);
    if (visibility === 'everyone') {
      console.log('');
      const shareCode = await share(['room', slug]);
      if (shareCode !== 0) return shareCode;
    } else {
      console.log(`\n  room '${slug}' is private. nothing leaves this machine.`);
      console.log(`  to share later: wellinformed share room ${slug}`);
    }
    return 0;
  }

  // Sync path — daemon not running, original behaviour.
  const indexCode = await indexProject(['--room', slug, '--root', root]);
  console.log(`\nwatch-target registered — start the daemon to enable auto re-embed:`);
  console.log(`  wellinformed daemon start`);

  if (indexCode !== 0) return indexCode;

  if (visibility === 'everyone') {
    console.log('');
    const shareCode = await share(['room', slug]);
    if (shareCode !== 0) return shareCode;
  } else {
    console.log(`\nroom '${slug}' indexed privately. nothing leaves this machine.`);
    console.log(`  to share later: wellinformed share room ${slug}`);
  }
  return 0;
};
