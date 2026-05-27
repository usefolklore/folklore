/**
 * Unit tests — Phase 25 data-dir relocation.
 *
 * Locks the decision matrix in `relocateDir`:
 *   legacy │ target              │ outcome
 *   ───────┼─────────────────────┼──────────────────────────────
 *   none   │ any                 │ noop
 *   exists │ none                │ relocated (rename)
 *   exists │ exists, empty       │ relocated (clear-then-rename)
 *   exists │ exists, non-empty   │ aborted (would-clobber)
 *
 * Drives the relocator via env vars + the exported test seam.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { __relocateDirForTest as relocateDir } from '../src/cli/commands/migrate.js';

const tmpRoot = (): string => mkdtempSync(join(tmpdir(), 'ak-reloc-'));

const withEnv = <T>(env: Record<string, string>, fn: () => T): T => {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) {
    prev[k] = process.env[k];
    process.env[k] = env[k];
  }
  try { return fn(); }
  finally {
    for (const k of Object.keys(prev)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
};

test('relocate: legacy absent → noop', () => {
  const root = tmpRoot();
  try {
    const legacy = join(root, '.wellinformed');
    const target = join(root, '.akashik');
    const r = withEnv({ AKASHIK_LEGACY_HOME: legacy, AKASHIK_HOME: target }, () => relocateDir());
    assert.equal(r.kind, 'noop');
    assert.equal(existsSync(target), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('relocate: legacy with data, target absent → rename + breadcrumb', () => {
  const root = tmpRoot();
  try {
    const legacy = join(root, '.wellinformed');
    const target = join(root, '.akashik');
    mkdirSync(legacy, { recursive: true });
    writeFileSync(join(legacy, 'graph.json'), '{"nodes":[]}');

    const r = withEnv({ AKASHIK_LEGACY_HOME: legacy, AKASHIK_HOME: target }, () => relocateDir());
    assert.equal(r.kind, 'relocated');
    assert.ok(existsSync(join(target, 'graph.json')), 'graph.json should be at target');
    assert.ok(existsSync(join(legacy, 'RELOCATED.txt')), 'breadcrumb file should be at legacy');
    assert.equal(existsSync(join(legacy, 'graph.json')), false, 'legacy graph.json should be gone');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('relocate: legacy + empty target → clear-then-rename', () => {
  const root = tmpRoot();
  try {
    const legacy = join(root, '.wellinformed');
    const target = join(root, '.akashik');
    mkdirSync(legacy, { recursive: true });
    writeFileSync(join(legacy, 'graph.json'), '{"nodes":[]}');
    mkdirSync(target, { recursive: true }); // empty target

    const r = withEnv({ AKASHIK_LEGACY_HOME: legacy, AKASHIK_HOME: target }, () => relocateDir());
    assert.equal(r.kind, 'relocated');
    assert.ok(existsSync(join(target, 'graph.json')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('relocate: legacy + non-empty target → aborted (would-clobber)', () => {
  const root = tmpRoot();
  try {
    const legacy = join(root, '.wellinformed');
    const target = join(root, '.akashik');
    mkdirSync(legacy, { recursive: true });
    writeFileSync(join(legacy, 'graph.json'), '{"nodes":[]}');
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, 'something.json'), '{}'); // non-empty target

    const r = withEnv({ AKASHIK_LEGACY_HOME: legacy, AKASHIK_HOME: target }, () => relocateDir());
    assert.equal(r.kind, 'aborted');
    assert.match(r.message, /refusing to merge automatically/);
    // Both should still exist, untouched.
    assert.ok(existsSync(join(legacy, 'graph.json')));
    assert.ok(existsSync(join(target, 'something.json')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('relocate: live daemon pidfile → aborted', () => {
  const root = tmpRoot();
  try {
    const legacy = join(root, '.wellinformed');
    const target = join(root, '.akashik');
    mkdirSync(legacy, { recursive: true });
    writeFileSync(join(legacy, 'graph.json'), '{"nodes":[]}');
    // Write our own PID as the daemon pidfile — guaranteed live.
    writeFileSync(join(legacy, 'daemon.pid'), String(process.pid));

    const r = withEnv({ AKASHIK_LEGACY_HOME: legacy, AKASHIK_HOME: target }, () => relocateDir());
    assert.equal(r.kind, 'aborted');
    assert.match(r.message, /daemon still running/);
    assert.equal(existsSync(target), false, 'target must not be created when aborted');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('relocate: stale pidfile (dead pid) → proceeds with relocate', () => {
  const root = tmpRoot();
  try {
    const legacy = join(root, '.wellinformed');
    const target = join(root, '.akashik');
    mkdirSync(legacy, { recursive: true });
    writeFileSync(join(legacy, 'graph.json'), '{"nodes":[]}');
    // PID 1 should always exist, so use a high impossible-on-test-host PID.
    // 999999999 is virtually guaranteed not to be live; process.kill(_, 0) throws.
    writeFileSync(join(legacy, 'daemon.pid'), '999999999');

    const r = withEnv({ AKASHIK_LEGACY_HOME: legacy, AKASHIK_HOME: target }, () => relocateDir());
    assert.equal(r.kind, 'relocated');
    assert.ok(existsSync(join(target, 'graph.json')));
    // Note: daemon.pid moves along with the rest of legacy/. That's fine —
    // the next daemon boot rewrites it.
    assert.ok(existsSync(join(target, 'daemon.pid')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('relocate: breadcrumb is human-readable + identifies target', () => {
  const root = tmpRoot();
  try {
    const legacy = join(root, '.wellinformed');
    const target = join(root, '.akashik');
    mkdirSync(legacy, { recursive: true });
    writeFileSync(join(legacy, 'graph.json'), '{}');

    withEnv({ AKASHIK_LEGACY_HOME: legacy, AKASHIK_HOME: target }, () => relocateDir());
    const breadcrumb = readFileSync(join(legacy, 'RELOCATED.txt'), 'utf8');
    assert.match(breadcrumb, /relocated to/);
    assert.ok(breadcrumb.includes(target), 'breadcrumb must name the new target');
    assert.match(breadcrumb, /one-way/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
