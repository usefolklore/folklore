/**
 * Tests for src/daemon/ipc.ts — Unix-socket IPC server + client.
 *
 * Covers:
 *   - round-trip of a known handler
 *   - fallback sentinel for unregistered commands
 *   - concurrent requests share one server
 *   - socket cleanup on stop()
 *   - client returns null when no socket exists
 *   - handler throwing produces exit=1 + stderr, doesn't crash the server
 *   - 0600 permissions on the socket file (POSIX)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  startIpcServer,
  sendIpcRequest,
  socketPath,
  IPC_FALLBACK_SENTINEL,
  type IpcHandler,
} from '../src/daemon/ipc.ts';

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'wi-ipc-'));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe('ipc — server lifecycle', () => {
  it('starts + stops cleanly, removes socket file', async () => {
    const handlers = new Map<string, IpcHandler<{}>>();
    handlers.set('ping', async () => ({ stdout: 'pong', exit: 0 }));
    const server = await startIpcServer({ homeDir: home, ctx: {}, handlers });
    assert.ok(existsSync(server.path), 'socket file should exist after start');
    await server.stop();
    assert.ok(!existsSync(server.path), 'socket file should be removed after stop');
  });

  it('survives a stale socket from a prior crashed daemon', async () => {
    // Create a stale socket path (simulated via an empty file at the same location)
    const { writeFile } = await import('node:fs/promises');
    const staleSock = socketPath(home);
    const { mkdir } = await import('node:fs/promises');
    await mkdir(home, { recursive: true });
    await writeFile(staleSock, '');
    assert.ok(existsSync(staleSock));

    const handlers = new Map<string, IpcHandler<{}>>();
    handlers.set('ping', async () => ({ stdout: 'pong', exit: 0 }));
    const server = await startIpcServer({ homeDir: home, ctx: {}, handlers });
    try {
      assert.ok(existsSync(server.path));
    } finally {
      await server.stop();
    }
  });

  it('POSIX: socket is 0600', { skip: process.platform === 'win32' }, async () => {
    const handlers = new Map<string, IpcHandler<{}>>();
    handlers.set('noop', async () => ({ stdout: '', exit: 0 }));
    const server = await startIpcServer({ homeDir: home, ctx: {}, handlers });
    try {
      const s = await stat(server.path);
      assert.equal(s.mode & 0o777, 0o600, `expected 0600, got ${(s.mode & 0o777).toString(8)}`);
    } finally {
      await server.stop();
    }
  });
});

describe('ipc — request/response', () => {
  it('round-trips a handler return value', async () => {
    const handlers = new Map<string, IpcHandler<{ greet: string }>>();
    handlers.set('hello', async (args, ctx) => ({
      stdout: `${ctx.greet} ${args.join(' ')}\n`,
      exit: 0,
    }));
    const server = await startIpcServer({ homeDir: home, ctx: { greet: 'hi' }, handlers });
    try {
      const resp = await sendIpcRequest(home, 'hello', ['world']);
      assert.ok(resp);
      assert.equal(resp!.ok, true);
      assert.equal(resp!.stdout, 'hi world\n');
      assert.equal(resp!.exit, 0);
    } finally {
      await server.stop();
    }
  });

  it('unregistered command returns null (treated as fallback by client)', async () => {
    const handlers = new Map<string, IpcHandler<{}>>();
    handlers.set('known', async () => ({ stdout: '', exit: 0 }));
    const server = await startIpcServer({ homeDir: home, ctx: {}, handlers });
    try {
      const resp = await sendIpcRequest(home, 'unknown-command', []);
      // Client maps the fallback sentinel to null so the shim spawns instead
      assert.equal(resp, null);
    } finally {
      await server.stop();
    }
  });

  it('handler throw produces exit=1 + stderr, server keeps serving', async () => {
    const handlers = new Map<string, IpcHandler<{}>>();
    handlers.set('boom', async () => { throw new Error('intentional'); });
    handlers.set('ok', async () => ({ stdout: 'fine', exit: 0 }));
    const server = await startIpcServer({ homeDir: home, ctx: {}, handlers });
    try {
      const bad = await sendIpcRequest(home, 'boom', []);
      assert.ok(bad);
      assert.equal(bad!.ok, false);
      assert.ok(bad!.stderr && bad!.stderr.includes('intentional'));
      // Server still serving:
      const good = await sendIpcRequest(home, 'ok', []);
      assert.ok(good);
      assert.equal(good!.ok, true);
    } finally {
      await server.stop();
    }
  });

  it('concurrent requests all complete', async () => {
    const handlers = new Map<string, IpcHandler<{}>>();
    handlers.set('echo', async (args) => ({ stdout: args.join(','), exit: 0 }));
    const server = await startIpcServer({ homeDir: home, ctx: {}, handlers });
    try {
      const responses = await Promise.all(
        [1, 2, 3, 4, 5].map((n) => sendIpcRequest(home, 'echo', [`msg-${n}`])),
      );
      for (let i = 0; i < 5; i++) {
        assert.ok(responses[i]);
        assert.equal(responses[i]!.stdout, `msg-${i + 1}`);
      }
    } finally {
      await server.stop();
    }
  });

  it('returns null when no daemon socket exists', async () => {
    // No server started — socket file absent.
    const resp = await sendIpcRequest(home, 'anything', []);
    assert.equal(resp, null);
  });

  it('emits onCommand observability hook with timing', async () => {
    const events: Array<{ cmd: string; argsLen: number; ms: number }> = [];
    const handlers = new Map<string, IpcHandler<{}>>();
    handlers.set('probe', async () => {
      await new Promise((r) => setTimeout(r, 10));
      return { stdout: 'ok', exit: 0 };
    });
    const server = await startIpcServer({
      homeDir: home,
      ctx: {},
      handlers,
      onCommand: (cmd, argsLen, ms) => events.push({ cmd, argsLen, ms }),
    });
    try {
      await sendIpcRequest(home, 'probe', ['a', 'b']);
      assert.equal(events.length, 1);
      assert.equal(events[0].cmd, 'probe');
      assert.equal(events[0].argsLen, 2);
      assert.ok(events[0].ms >= 10, `ms should be ≥10, got ${events[0].ms}`);
    } finally {
      await server.stop();
    }
  });
});
