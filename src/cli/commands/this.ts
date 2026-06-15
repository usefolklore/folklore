/**
 * `folklore this [me|everyone] [--root DIR] [--name NAME]`
 *
 * Index the current (or `--root`) directory into the knowledge graph
 * tagged with a workspace slug derived from its basename. The
 * visibility token decides whether the indexed nodes are marked
 * private (`me`, default) — V5 (Phase 24) per-node `private: bool`
 * gate — or left federation-eligible (`everyone`).
 *
 *   folklore this              → index cwd, nodes private
 *   folklore this me           → same (explicit private)
 *   folklore this everyone     → index cwd, nodes NOT marked private;
 *                                    use `folklore share <peer>` to
 *                                    actually publish.
 */

import { basename, join, resolve } from 'node:path';
import { indexProject } from './index-project.js';
import { share } from './share.js';

/** V5 (Phase 24): rooms deleted — slugify is local, used for workspace slugs. */
const slugifyWorkspace = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63) || 'unnamed';
import { registerWatchTarget } from '../../infrastructure/watch-targets.js';
import { folkloreHome, runtimePaths } from '../runtime.js';
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

const USAGE = `usage: folklore this [me|everyone] [--root DIR] [--name NAME]

  me           keep workspace private (default; nothing leaves the host)
  everyone     index + mark workspace shareable on the P2P network
               (audited for secrets; flagged content is refused)

flags:
  --root DIR   index DIR instead of the current working directory
  --name NAME  override the workspace slug (default: basename of root)`;

export const thisCmd = async (args: readonly string[]): Promise<number> => {
  if (args.includes('--help') || args.includes('-h') || args.includes('help')) {
    console.log(USAGE);
    return 0;
  }
  const { visibility, root, name } = parseArgs(args);
  const slug = slugifyWorkspace(name ?? basename(root));

  console.log(`folklore this ${visibility} — workspace '${slug}' (${root})\n`);
  const absRoot = resolve(root);

  // Register the watch-target FIRST. This is independent of the index
  // result. V5: the watch-target shape carries a workspace slug
  // instead of a room (back-compat: the field name remains `room`
  // until watch-targets.json shape is migrated).
  registerWatchTarget(join(folkloreHome(), 'watch-targets.json'), {
    room: slug,
    root: absRoot,
  });

  // Daemon-submit path — when the daemon is running, submit an
  // ingest:project job so the single-writer worker handles graph.json.
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
    console.log(`    folklore daemon stop && folklore daemon start`);
    console.log(`\n  track ingest progress with:  folklore jobs watch`);
    if (visibility === 'everyone') {
      console.log(`\n  workspace '${slug}' indexed — nodes are NOT marked private.`);
      console.log(`  publish to a peer with: folklore share <peer-id>`);
    } else {
      console.log(`\n  workspace '${slug}' indexed privately (V5: nodes get private:true).`);
      console.log(`  to publish later: re-run with 'folklore this everyone' or`);
      console.log(`  flip nodes manually with 'folklore save --label X' (default public).`);
    }
    return 0;
  }

  // Sync path — daemon not running.
  const indexCode = await indexProject(['--workspace', slug, '--root', root]);
  console.log(`\nwatch-target registered — start the daemon to enable auto re-embed:`);
  console.log(`  folklore daemon start`);

  if (indexCode !== 0) return indexCode;

  if (visibility === 'everyone') {
    console.log(`\nworkspace '${slug}' indexed — nodes are NOT marked private.`);
    console.log(`  publish to a peer with: folklore share <peer-id>`);
  } else {
    console.log(`\nworkspace '${slug}' indexed privately. nothing leaves this machine.`);
    console.log(`  to publish later: see 'folklore share <peer-id>'`);
  }
  // Silence unused-import warning while keeping the symbol available
  // for future re-introduction of an automatic share step.
  void share;
  return 0;
};
