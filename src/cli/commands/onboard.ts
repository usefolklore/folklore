/**
 * `wellinformed onboard` — first-run installer + onboarding wizard.
 *
 * One command that takes a fresh machine to a fully wired install:
 *
 *   1. Print the privacy contract (no secrets ever leave the host)
 *   2. Pick the data home directory (graph / vectors / models / models cache)
 *   3. Run doctor (informational; report blocking issues without bailing)
 *   4. Materialise the P2P identity (DID + libp2p PeerId)
 *   5. Ensure system rooms `toolshed` and `research` exist + shareable
 *   6. Wire Claude Code hooks (delegates to `claude install`) and CLAUDE.md
 *   7. Strip ghost hook entries pointing at non-existent helper scripts
 *      (cleans up claude-flow / ruflo leftovers that crash on startup)
 *   8. Optionally index the current project (`wellinformed this me`)
 *   9. Optionally ingest past Claude Code sessions
 *  10. Start the daemon if it isn't already running
 *  11. Show P2P status — own peerId, known-peer count, dial guidance
 *  12. Print the "from now on" explainer + cheatsheet
 *
 * The wizard re-uses the readlinePrompter from init.ts so prompt UX is
 * consistent with the room-creation flow. Non-interactive mode
 * (`--yes`) accepts every default and skips optional steps that would
 * block on a prompt.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { formatError } from '../../domain/errors.js';
import { loadOrCreateIdentity } from '../../infrastructure/peer-transport.js';
import { ensureSystemRoomsShared, loadSharedRooms } from '../../infrastructure/share-store.js';
import { loadPeers } from '../../infrastructure/peer-store.js';
import { isRunning, readPid } from '../../daemon/loop.js';
import { runtimePaths } from '../runtime.js';
import { readlinePrompter, staticPrompter, type Prompter } from './init.js';
import { claudeInstall } from './claude-install.js';
import { thisCmd } from './this.js';
import { trigger } from './trigger.js';

// ─────────────── render helpers ─────────────

const HR = '━'.repeat(60);

const banner = (title: string): void => {
  console.log('');
  console.log(HR);
  console.log(`  ${title}`);
  console.log(HR);
};

const step = (n: number, total: number, title: string): void => {
  console.log('');
  console.log(`[${n}/${total}] ${title}`);
};

const ok = (msg: string): void => console.log(`  ✓ ${msg}`);
const skip = (msg: string): void => console.log(`  · ${msg}`);
const warn = (msg: string): void => console.log(`  ! ${msg}`);

// ─────────────── flag parsing ───────────────

interface Flags {
  readonly yes: boolean;
  readonly home?: string;
  readonly noProject: boolean;
  readonly noSessions: boolean;
}

const parseFlags = (args: readonly string[]): Flags => {
  let yes = false;
  let home: string | undefined;
  let noProject = false;
  let noSessions = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = (): string => args[++i] ?? '';
    if (a === '--yes' || a === '-y') yes = true;
    else if (a === '--home') home = next();
    else if (a.startsWith('--home=')) home = a.slice('--home='.length);
    else if (a === '--no-project') noProject = true;
    else if (a === '--no-sessions') noSessions = true;
  }
  return { yes, home, noProject, noSessions };
};

// ─────────────── ghost-hook cleanup ─────────

interface GhostRemoval {
  readonly event: string;
  readonly path: string;
}

/**
 * Walks `.claude/settings.json` and drops hook entries whose command
 * line references a `.claude/...` script that does not exist on disk.
 * Catches stale claude-flow / ruflo wiring that throws MODULE_NOT_FOUND
 * on every Claude Code event (the SessionStart / UserPromptSubmit /
 * PreToolUse spam in the user's screenshot).
 *
 * Conservative — only filters entries we can prove are broken. Leaves
 * unknown shapes (no command, no `.claude/` path) untouched.
 */
const cleanGhostHooks = (
  settingsPath: string,
  projectDir: string,
): readonly GhostRemoval[] => {
  if (!existsSync(settingsPath)) return [];

  let parsed: { hooks?: Record<string, unknown[]> };
  try {
    parsed = JSON.parse(readFileSync(settingsPath, 'utf8'));
  } catch {
    return [];
  }
  const hooks = parsed.hooks;
  if (!hooks || typeof hooks !== 'object') return [];

  const removed: GhostRemoval[] = [];
  const isBroken = (entry: unknown): boolean => {
    const inner = (entry as { hooks?: unknown[] })?.hooks;
    if (!Array.isArray(inner)) return false;
    for (const h of inner) {
      const cmd = (h as { command?: string })?.command;
      if (typeof cmd !== 'string') continue;
      const matches = cmd.match(/\.claude\/[^"\s']+\.(?:cjs|mjs|sh|js)/g) ?? [];
      for (const rel of matches) {
        const abs = join(projectDir, rel);
        if (!existsSync(abs)) {
          return true;
        }
      }
    }
    return false;
  };

  for (const event of Object.keys(hooks)) {
    const arr = hooks[event];
    if (!Array.isArray(arr)) continue;
    const kept = arr.filter((entry) => {
      if (!isBroken(entry)) return true;
      const inner = (entry as { hooks?: unknown[] }).hooks ?? [];
      for (const h of inner) {
        const cmd = (h as { command?: string })?.command ?? '';
        const m = cmd.match(/\.claude\/[^"\s']+\.(?:cjs|mjs|sh|js)/g) ?? [];
        for (const p of m) {
          if (!existsSync(join(projectDir, p))) {
            removed.push({ event, path: p });
          }
        }
      }
      return false;
    });
    hooks[event] = kept;
  }

  if (removed.length > 0) {
    parsed.hooks = hooks;
    writeFileSync(settingsPath, JSON.stringify(parsed, null, 2));
  }
  return removed;
};

// ─────────────── steps ──────────────────────

const stepHome = async (prompter: Prompter, flags: Flags): Promise<string> => {
  const def = flags.home ?? process.env.WELLINFORMED_HOME ?? join(homedir(), '.wellinformed');
  const chosen = flags.yes
    ? def
    : await prompter.ask('Data home (graph / vectors / model cache)', def);

  process.env.WELLINFORMED_HOME = chosen;
  mkdirSync(chosen, { recursive: true });
  ok(`home: ${chosen}`);
  if (chosen !== join(homedir(), '.wellinformed')) {
    warn('non-default home — add this to your shell profile:');
    console.log(`      export WELLINFORMED_HOME="${chosen}"`);
  }
  return chosen;
};

const stepDoctor = (): void => {
  // Doctor is heavy (spawns python, scans venv). Run it but tolerate
  // failure — onboard is about wiring, not bootstrapping the venv.
  try {
    const r = spawnSync(process.execPath, [process.argv[1], 'doctor'], {
      stdio: 'inherit',
    });
    if (r.status !== 0) {
      warn(`doctor reported issues — run 'wellinformed doctor --fix' when convenient`);
    } else {
      ok('runtime healthy');
    }
  } catch (e) {
    warn(`doctor: ${(e as Error).message}`);
  }
};

const stepIdentity = async (home: string): Promise<string | null> => {
  const idPath = join(home, 'peer-identity.json');
  const res = await loadOrCreateIdentity(idPath);
  if (res.isErr()) {
    warn(`identity: ${formatError(res.error)}`);
    return null;
  }
  ok(`peerId: ${res.value.peerId}`);
  return res.value.peerId;
};

const stepSystemRooms = async (home: string): Promise<void> => {
  const r = await ensureSystemRoomsShared(join(home, 'shared-rooms.json'));
  if (r.isErr()) {
    warn(`system rooms: ${formatError(r.error)}`);
    return;
  }
  ok('toolshed (codebase, deps, git) — always on, P2P-shared');
  ok('research (arxiv, hn, rss, web) — always on, P2P-shared');
};

const stepClaudeInstall = async (projectDir: string): Promise<readonly GhostRemoval[]> => {
  const settingsPath = join(projectDir, '.claude', 'settings.json');
  const removed = cleanGhostHooks(settingsPath, projectDir);
  if (removed.length > 0) {
    ok(`removed ${removed.length} broken hook entr${removed.length === 1 ? 'y' : 'ies'}`);
    for (const r of removed) console.log(`     - ${r.event}: ${r.path}`);
  } else {
    skip('no broken hooks to clean');
  }
  await claudeInstall(['install']);
  return removed;
};

const stepIndexProject = async (
  prompter: Prompter,
  flags: Flags,
  projectDir: string,
): Promise<void> => {
  if (flags.noProject) {
    skip('skipped (--no-project)');
    return;
  }
  const yes = flags.yes
    ? true
    : await prompter.confirm(`Index this project (${projectDir}) into your toolshed now?`, true);
  if (!yes) {
    skip('skipped — run `wellinformed this me` later');
    return;
  }
  const code = await thisCmd(['me', '--root', projectDir]);
  if (code !== 0) warn('project index returned non-zero');
};

const stepIngestSessions = async (prompter: Prompter, flags: Flags): Promise<void> => {
  if (flags.noSessions) {
    skip('skipped (--no-sessions)');
    return;
  }
  const yes = flags.yes
    ? false
    : await prompter.confirm(
        'Ingest past Claude Code sessions (~/.claude/projects/**/*.jsonl)? Stays local.',
        false,
      );
  if (!yes) {
    skip('skipped — run `wellinformed trigger --room sessions` later');
    return;
  }
  const code = await trigger(['--room', 'sessions']);
  if (code !== 0) warn('session ingest returned non-zero');
};

const stepDaemon = async (home: string): Promise<void> => {
  if (isRunning(home)) {
    ok(`daemon already running (pid=${readPid(home)})`);
    return;
  }
  const dist = join(dirname(process.argv[1]), '..', 'dist', 'cli', 'index.js');
  const child = spawn(process.execPath, [existsSync(dist) ? dist : process.argv[1], 'daemon', '_run'], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env },
  });
  child.unref();
  ok(`daemon started (pid=${child.pid})`);
  console.log(`     logs: ${join(home, 'daemon.log')}`);
};

const stepP2pStatus = async (home: string, peerId: string | null): Promise<void> => {
  const peers = await loadPeers(join(home, 'peers.json'));
  const known = peers.isOk() ? peers.value.peers.length : 0;

  const shared = await loadSharedRooms(join(home, 'shared-rooms.json'));
  const sharedCount = shared.isOk() ? shared.value.rooms.length : 0;

  console.log(`  network`);
  console.log(`     identity:    ${peerId ?? '<unknown>'}`);
  console.log(`     known peers: ${known} dialled by daemon on connect`);
  console.log(`     shared rooms: ${sharedCount} (toolshed + research always on)`);

  if (known === 0) {
    warn('no peers yet — add one with: wellinformed peer add /ip4/<host>/tcp/<port>/p2p/<id>');
    console.log('     (your graph still works fully offline; federation is opt-in.)');
  }
};

const printOutro = (projectDir: string): void => {
  banner('you are wired in');
  console.log(`
  what runs on every session, automatically:
    · SessionStart: shows graph stats + last session's branch / final reply
    · PreToolUse:   prefetches the graph before Glob / Grep / Read / WebSearch / WebFetch
    · PostToolUse:  saves WebSearch / WebFetch results into the 'research' room
    · daemon:       fetches sources, consolidates memory, syncs P2P rooms

  daily commands:
    wellinformed this              index the current folder, keep it private
    wellinformed this me           same (explicit)
    wellinformed this everyone     index + share room with the P2P network
    wellinformed ask "..."         semantic search across your graph
    wellinformed trigger           refresh all rooms
    wellinformed peer list         see who you talk to
    wellinformed doctor            health check

  privacy contract:
    · everything stays under ${process.env.WELLINFORMED_HOME}
    · the secrets gate runs on every shared node — flagged content is REFUSED
    · 'this me' never leaves your machine; only 'this everyone' enters federation
    · system rooms (toolshed, research) are shared metadata only, never raw secrets
    · disable the network: wellinformed daemon stop
`);
  void projectDir;
};

// ─────────────── entry ──────────────────────

const USAGE = `usage: wellinformed onboard [--yes] [--home DIR] [--no-project] [--no-sessions]

  --yes, -y       accept every default; skip optional prompts
  --home DIR      data home (graph + vectors + model cache); also via $WELLINFORMED_HOME
  --no-project    skip indexing the current project
  --no-sessions   skip ingesting past Claude Code sessions

  Run once on a fresh machine. Sets up identity, system rooms, hooks,
  daemon, and prints what wellinformed will do on every session.`;

export const onboard = async (args: readonly string[]): Promise<number> => {
  if (args.includes('--help') || args.includes('-h') || args.includes('help')) {
    console.log(USAGE);
    return 0;
  }
  const flags = parseFlags(args);
  const projectDir = process.cwd();
  const prompter: Prompter = flags.yes ? staticPrompter([]) : readlinePrompter();

  banner('wellinformed onboard');
  console.log(`
  CPU-local knowledge graph + opt-in P2P federation.
  Nothing leaves this machine unless you say 'everyone'.
  Secrets are scanned and refused at the share boundary, no override.
`);

  const TOTAL = 9;
  try {
    step(1, TOTAL, 'choose data home');
    const home = await stepHome(prompter, flags);
    void runtimePaths(); // touch — surfaces invalid env early

    step(2, TOTAL, 'check runtime (doctor)');
    stepDoctor();

    step(3, TOTAL, 'create P2P identity');
    const peerId = await stepIdentity(home);

    step(4, TOTAL, 'system rooms');
    await stepSystemRooms(home);

    step(5, TOTAL, 'wire Claude Code hooks');
    await stepClaudeInstall(projectDir);

    step(6, TOTAL, 'index this project');
    await stepIndexProject(prompter, flags, projectDir);

    step(7, TOTAL, 'past Claude sessions');
    await stepIngestSessions(prompter, flags);

    step(8, TOTAL, 'start daemon');
    await stepDaemon(home);

    step(9, TOTAL, 'P2P status');
    await stepP2pStatus(home, peerId);

    printOutro(projectDir);
    return 0;
  } finally {
    prompter.close();
  }
};
