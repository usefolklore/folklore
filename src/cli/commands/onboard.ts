/**
 * `wellinformed onboard` — first-run installer + onboarding wizard.
 *
 * Eight numbered steps that take a fresh machine to a wired install:
 *
 *   1. Pick the data home directory
 *   2. Run doctor (informational)
 *   3. Materialise the libp2p identity
 *   4. Ensure system rooms (toolshed + research) are shareable
 *   5. Wire Claude Code hooks + strip ghost helper-script entries
 *   6. Optionally ingest past Claude Code sessions (detached)
 *   7. Start the daemon
 *   8. Show P2P status + final cheatsheet
 *
 * The UI uses @clack/prompts so the surface matches modern installer
 * UX (bordered intro/outro, spinners with live status, clean Ctrl-C
 * cancellation). Onboarding deliberately does NOT index the cwd —
 * indexing is the user's intent, exposed as `wellinformed this`.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { connect } from 'node:net';
import {
  intro,
  outro,
  text,
  confirm,
  spinner,
  note,
  log,
  isCancel,
  cancel,
} from '@clack/prompts';
import { formatError } from '../../domain/errors.js';
import { loadOrCreateIdentity } from '../../infrastructure/peer-transport.js';
import { ensureSystemRoomsShared, loadSharedRooms } from '../../infrastructure/share-store.js';
import { loadPeers } from '../../infrastructure/peer-store.js';
import { isRunning, readPid } from '../../daemon/loop.js';
import { runtimePaths } from '../runtime.js';
import { claudeInstall } from './claude-install.js';

// ─────────────── flags ─────────────────────

interface Flags {
  readonly yes: boolean;
  readonly home?: string;
  readonly noSessions: boolean;
}

const parseFlags = (args: readonly string[]): Flags => {
  let yes = false;
  let home: string | undefined;
  let noSessions = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = (): string => args[++i] ?? '';
    if (a === '--yes' || a === '-y') yes = true;
    else if (a === '--home') home = next();
    else if (a.startsWith('--home=')) home = a.slice('--home='.length);
    else if (a === '--no-sessions') noSessions = true;
  }
  return { yes, home, noSessions };
};

// ─────────────── ghost-hook cleanup ────────

interface GhostRemoval {
  readonly event: string;
  readonly path: string;
}

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
        if (!existsSync(join(projectDir, rel))) return true;
      }
    }
    return false;
  };

  for (const event of Object.keys(hooks)) {
    const arr = hooks[event];
    if (!Array.isArray(arr)) continue;
    hooks[event] = arr.filter((entry) => {
      if (!isBroken(entry)) return true;
      const inner = (entry as { hooks?: unknown[] }).hooks ?? [];
      for (const h of inner) {
        const cmd = (h as { command?: string })?.command ?? '';
        const m = cmd.match(/\.claude\/[^"\s']+\.(?:cjs|mjs|sh|js)/g) ?? [];
        for (const p of m) {
          if (!existsSync(join(projectDir, p))) removed.push({ event, path: p });
        }
      }
      return false;
    });
  }
  if (removed.length > 0) {
    parsed.hooks = hooks;
    writeFileSync(settingsPath, JSON.stringify(parsed, null, 2));
  }
  return removed;
};

// ─────────────── cancel helper ─────────────

const ensure = <T>(v: T | symbol): T => {
  if (isCancel(v)) {
    cancel('onboarding cancelled — run again whenever.');
    process.exit(0);
  }
  return v as T;
};

// ─────────────── steps ─────────────────────

const stepHome = async (flags: Flags): Promise<string> => {
  const def = flags.home ?? process.env.WELLINFORMED_HOME ?? join(homedir(), '.wellinformed');
  const chosen = flags.yes
    ? def
    : ensure(
        await text({
          message: 'Data home',
          placeholder: def,
          initialValue: def,
          validate: (v) => (v && v.trim() ? undefined : 'path required'),
        }),
      );
  process.env.WELLINFORMED_HOME = chosen;
  mkdirSync(chosen, { recursive: true });
  if (chosen !== join(homedir(), '.wellinformed')) {
    note(
      `Add to your shell profile so future sessions agree:\n  export WELLINFORMED_HOME="${chosen}"`,
      'non-default home',
    );
  }
  return chosen;
};

const stepDoctor = (): void => {
  const sp = spinner();
  sp.start('checking runtime (Node, Python, venv, graphify)');
  const r = spawnSync(process.execPath, [process.argv[1], 'doctor'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.status === 0) {
    sp.stop('runtime healthy');
  } else {
    sp.stop("runtime check reported issues — run 'wellinformed doctor --fix'");
  }
};

const stepIdentity = async (home: string): Promise<string | null> => {
  const sp = spinner();
  sp.start('creating libp2p identity (Ed25519)');
  const res = await loadOrCreateIdentity(join(home, 'peer-identity.json'));
  if (res.isErr()) {
    sp.stop(`identity failed: ${formatError(res.error)}`);
    return null;
  }
  sp.stop(`peer identity ready · ${res.value.peerId.slice(0, 24)}…`);
  return res.value.peerId;
};

/**
 * Optional GitHub OAuth link — wires a verified GitHub handle to the
 * local DID via Device Flow. Skippable; users without
 * `WELLINFORMED_GITHUB_CLIENT_ID` configured see a clear "skip + how
 * to enable later" message rather than a broken flow.
 *
 * The actual OAuth round-trip lives in src/cli/commands/login.ts; this
 * step calls it via the same dispatcher the standalone command uses.
 */
const stepLoginGithub = async (flags: Flags): Promise<void> => {
  const clientId = process.env.WELLINFORMED_GITHUB_CLIENT_ID;
  if (!clientId || clientId.trim().length === 0) {
    note(
      [
        'Linking a GitHub identity to your local DID lets P2P peers verify',
        'your signed envelopes against your public GitHub profile.',
        '',
        'To enable later:',
        '  1. Register a Device Flow OAuth app:',
        '     https://github.com/settings/applications/new',
        '  2. export WELLINFORMED_GITHUB_CLIENT_ID="Iv1.<your_id>"',
        '  3. wellinformed login github',
      ].join('\n'),
      'GitHub login (optional, skipped — no client id configured)',
    );
    return;
  }

  const proceed = flags.yes
    ? false
    : ensure(
        await confirm({
          message: `Link your GitHub identity now via ${clientId.slice(0, 8)}…?`,
          initialValue: true,
        }),
      );
  if (!proceed) {
    log.message('skipped — run `wellinformed login github` when convenient');
    return;
  }

  // Defer to the standalone login command so the flow + persistence
  // logic is identical to `wellinformed login github`. One canonical
  // path keeps the codex round-3 "behavioral inconsistency across
  // parallel surfaces" verdict from re-emerging here.
  const { login } = await import('./login.js');
  const exit = await login(['github']);
  if (exit !== 0) {
    log.warn('login github failed — `wellinformed login github` to retry');
  }
};

const stepSystemRooms = async (home: string): Promise<void> => {
  const sp = spinner();
  sp.start('marking system rooms shareable');
  const r = await ensureSystemRoomsShared(join(home, 'shared-rooms.json'));
  if (r.isErr()) {
    sp.stop(`system rooms: ${formatError(r.error)}`);
    return;
  }
  sp.stop('system rooms ready: toolshed (code/deps/git), research (arxiv/hn/rss/web)');
};

const stepClaudeInstall = async (projectDir: string): Promise<void> => {
  const settingsPath = join(projectDir, '.claude', 'settings.json');
  const sp = spinner();
  sp.start('cleaning broken hook entries from .claude/settings.json');
  const removed = cleanGhostHooks(settingsPath, projectDir);
  if (removed.length > 0) {
    sp.stop(`removed ${removed.length} broken hook entr${removed.length === 1 ? 'y' : 'ies'}`);
    note(removed.map((r) => `${r.event}: ${r.path}`).join('\n'), 'cleaned (referenced files were missing)');
  } else {
    sp.stop('no broken hooks to clean');
  }

  const sp2 = spinner();
  sp2.start('wiring PreToolUse / PostToolUse / SessionStart hooks');
  // claudeInstall prints to stdout — silence it under the spinner.
  const stdoutWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (() => true) as typeof process.stdout.write;
  try {
    await claudeInstall(['install']);
  } finally {
    process.stdout.write = stdoutWrite;
  }
  sp2.stop('Claude Code hooks wired (smart prefetch + auto-save + session summary)');
};

/**
 * Sessions ingest is a long, file-heavy walk over ~/.claude/projects.
 * We launch it detached so the wizard never blocks, then either tail
 * progress for a few seconds or hand control back with a status command.
 */
const stepIngestSessions = async (flags: Flags, home: string): Promise<void> => {
  if (flags.noSessions) {
    log.info('past Claude sessions — skipped (--no-sessions)');
    return;
  }
  const explainer = [
    'Reads every transcript under ~/.claude/projects/**/*.jsonl.',
    'Each becomes a searchable node in the local-only "sessions" room.',
    'Secrets pre-scan strips API keys / tokens / .env values before embed.',
    "The 'sessions' room is hard-blocked from P2P sharing — stays local.",
    '',
    'Default is NO because re-walking can be heavy on the first run.',
    "Skip if unsure; you can always run 'wellinformed trigger --room sessions' later.",
  ].join('\n');
  note(explainer, 'past Claude sessions');

  const yes = flags.yes
    ? false
    : ensure(
        await confirm({
          message: 'Ingest sessions now (detached, tail status afterwards)?',
          initialValue: false,
        }),
      );
  if (!yes) {
    log.message('skipped — run `wellinformed trigger --room sessions` when convenient');
    return;
  }

  const logPath = join(home, 'sessions-ingest.log');
  const child = spawn(
    process.execPath,
    [process.argv[1], 'trigger', '--room', 'sessions'],
    {
      detached: true,
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env, WELLINFORMED_HOME: home },
    },
  );
  child.unref();

  // Detect early child failure — without this the spinner cheerfully
  // reports "warming up…" while the spawned process is already dead
  // (PATH miss, trigger refused, env mismatch, etc.).
  let childAlive = true;
  let childExitCode: number | null = null;
  child.on('exit', (code) => { childAlive = false; childExitCode = code; });
  child.on('error', () => { childAlive = false; });

  // Tail the sessions-state.json for ~10 seconds so the user sees
  // progress. Then return control with a status hint.
  const statePath = join(home, 'sessions-state.json');
  const sp = spinner();
  sp.start(`ingest pid=${child.pid} — tracking state file…`);
  const start = Date.now();
  const peek = (): string => {
    if (!existsSync(statePath)) return 'warming up…';
    try {
      const stat = statSync(statePath);
      const parsed = JSON.parse(readFileSync(statePath, 'utf8')) as {
        files?: Record<string, { byteOffset?: number; lastLineNum?: number }>;
      };
      const files = parsed.files ?? {};
      const fileCount = Object.keys(files).length;
      const lines = Object.values(files).reduce((a, f) => a + (f.lastLineNum ?? 0), 0);
      return `${fileCount} files · ${lines.toLocaleString()} lines · ${stat.size} B state`;
    } catch {
      return 'ingest in progress…';
    }
  };
  while (Date.now() - start < 10_000 && childAlive) {
    sp.message(peek());
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!childAlive) {
    if (childExitCode === 0) {
      sp.stop('ingest finished quickly — sessions room is up to date');
    } else {
      sp.stop(`ingest exited early (code=${childExitCode ?? 'error'})`);
      note(
        `The 'wellinformed trigger --room sessions' subprocess exited before the\nwizard's tail window finished. Common causes:\n  - WELLINFORMED_HOME mismatch (chosen home: ${home})\n  - claude_sessions source not provisioned (daemon will create it on next boot)\n  - first-run schema migration\n\nRetry manually with:\n  wellinformed trigger --room sessions`,
        'session ingest failed',
      );
    }
    return;
  }
  sp.stop(`ingest still running in background (pid=${child.pid})`);
  note(
    `Track progress with:\n  wellinformed sessions status\n  tail -f ${logPath}\n\nThe daemon will pick up the new nodes once it starts.`,
    'sessions ingest detached',
  );
  void logPath; // reserved for future stdout redirect
};

const stepDaemon = async (home: string): Promise<void> => {
  if (isRunning(home)) {
    log.success(`daemon already running (pid=${readPid(home)})`);
    return;
  }
  const dist = join(dirname(process.argv[1]), '..', 'dist', 'cli', 'index.js');
  const child = spawn(
    process.execPath,
    [existsSync(dist) ? dist : process.argv[1], 'daemon', '_run'],
    { detached: true, stdio: 'ignore', env: { ...process.env } },
  );
  child.unref();

  // LIVENESS PROBE (round-3 UX review — `onboard.ts:339` always logged
  // success regardless of whether the daemon actually came up).
  //
  // Two checks, in this order:
  //   1. PID file appears (daemon wrote it during startLoop)
  //   2. IPC socket accepts a connection (daemon's IPC server is up)
  //
  // Cap the wait at 8s — covers cold ONNX load + sqlite-vec open on
  // slow machines without making a failed boot invisible. On timeout
  // we log a warning + tail the daemon.log path so the user can see
  // exactly what went wrong instead of a silent "started" lie.
  const sockPath = join(home, 'daemon.sock');
  const start = Date.now();
  let pidVisible = false;
  let sockReachable = false;
  while (Date.now() - start < 8000) {
    if (!pidVisible && isRunning(home)) pidVisible = true;
    if (pidVisible && !sockReachable && existsSync(sockPath)) {
      sockReachable = await new Promise<boolean>((resolve) => {
        const sock = connect(sockPath);
        const settle = (ok: boolean): void => {
          try { sock.destroy(); } catch { /* benign */ }
          resolve(ok);
        };
        sock.once('connect', () => settle(true));
        sock.once('error', () => settle(false));
        setTimeout(() => settle(false), 500);
      });
    }
    if (pidVisible && sockReachable) break;
    await new Promise((r) => setTimeout(r, 200));
  }

  const elapsed = Date.now() - start;
  const pid = readPid(home);
  if (pidVisible && sockReachable) {
    log.success(`daemon ready (pid=${pid}, ipc reachable in ${elapsed}ms) · logs: ${join(home, 'daemon.log')}`);
  } else if (pidVisible && !sockReachable) {
    log.warn(`daemon started (pid=${pid}) but IPC socket not reachable yet — initial requests may queue. Tail \`${join(home, 'daemon.log')}\` if it stays this way.`);
  } else {
    log.warn(`daemon spawn returned (pid=${child.pid}) but no PID file after ${elapsed}ms — see \`${join(home, 'daemon.log')}\` for the failure reason.`);
  }
};

const stepP2pStatus = async (home: string, peerId: string | null): Promise<void> => {
  const peers = await loadPeers(join(home, 'peers.json'));
  const known = peers.isOk() ? peers.value.peers.length : 0;
  const shared = await loadSharedRooms(join(home, 'shared-rooms.json'));
  const sharedCount = shared.isOk() ? shared.value.rooms.length : 0;

  const lines = [
    `identity:     ${peerId ?? '<unknown>'}`,
    `known peers:  ${known} (daemon dials these on connect)`,
    `shared rooms: ${sharedCount} (toolshed + research always-on)`,
  ];
  if (known === 0) {
    lines.push('');
    lines.push('No peers yet. Your graph works fully offline; federation is opt-in.');
    lines.push('Add a bootstrap peer:');
    lines.push('  wellinformed peer add /ip4/<host>/tcp/<port>/p2p/<id>');
  }
  note(lines.join('\n'), 'P2P status');
};

// ─────────────── usage + entry ─────────────

const USAGE = `usage: wellinformed onboard [--yes] [--home DIR] [--no-sessions]

  --yes, -y       accept every default; skip optional prompts
  --home DIR      data home (graph + vectors + model cache); also via $WELLINFORMED_HOME
  --no-sessions   skip ingesting past Claude Code sessions

  Run once on a fresh machine. Sets up identity, system rooms, hooks,
  daemon, and prints what wellinformed will do on every session.

  Onboard does NOT index any folder. To index a project, cd into it and
  run 'wellinformed this me' (private) or 'wellinformed this everyone'
  (P2P-shared, secrets-audited).`;

export const onboard = async (args: readonly string[]): Promise<number> => {
  if (args.includes('--help') || args.includes('-h') || args.includes('help')) {
    console.log(USAGE);
    return 0;
  }
  const flags = parseFlags(args);
  const projectDir = process.cwd();

  intro('wellinformed onboard');
  note(
    [
      'CPU-local knowledge graph + opt-in P2P federation.',
      'Nothing leaves this machine unless you say so explicitly.',
      'Secrets are scanned and refused at the share boundary, no override.',
    ].join('\n'),
    'privacy contract',
  );

  log.step('1/8 · choose data home');
  const home = await stepHome(flags);
  void runtimePaths();

  log.step('2/8 · check runtime');
  stepDoctor();

  log.step('3/9 · create P2P identity');
  const peerId = await stepIdentity(home);

  log.step('4/9 · link GitHub identity (optional)');
  await stepLoginGithub(flags);

  log.step('5/9 · system rooms');
  await stepSystemRooms(home);

  log.step('6/9 · wire Claude Code hooks');
  await stepClaudeInstall(projectDir);

  log.step('7/9 · past Claude sessions');
  await stepIngestSessions(flags, home);

  log.step('8/9 · start daemon');
  await stepDaemon(home);

  log.step('9/9 · P2P status');
  await stepP2pStatus(home, peerId);

  note(
    [
      'Every Claude Code session, automatically:',
      '  · SessionStart   shows graph stats + last session context',
      '  · PreToolUse     prefetches the graph before Glob/Grep/Read/WebSearch',
      '  · PostToolUse    saves WebSearch / WebFetch results into research room',
      '  · daemon         fetches sources, consolidates memory, syncs P2P rooms',
      '',
      'Daily commands:',
      '  wellinformed this              index the current folder, keep it private',
      '  wellinformed this everyone     index + share with the P2P network',
      '  wellinformed ask "..."         semantic search across your graph',
      '  wellinformed trigger           refresh all rooms',
      '  wellinformed peer list         see who you talk to',
      '  wellinformed doctor            health check',
      '',
      'Privacy:',
      `  · Everything stays under ${process.env.WELLINFORMED_HOME}`,
      "  · 'this me' never leaves your machine",
      "  · 'this everyone' enters the secrets-audit gate before federation",
      "  · Stop the network at any time: wellinformed daemon stop",
    ].join('\n'),
    'you are wired in',
  );
  outro('done');
  return 0;
};
