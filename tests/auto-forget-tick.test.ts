/**
 * Tests for src/daemon/auto-forget-tick.ts — the daemon-tick cadence gate
 * and the in-process GC runner. The underlying planner + apply logic is
 * covered in auto-forget.test.ts; here we validate: the gate (enabled +
 * interval), that a disabled config never touches disk, and that a run
 * persists a last-run state so the next tick waits out the interval.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { okAsync } from 'neverthrow';
import {
  shouldRunAutoForget,
  runAutoForgetDaemonTick,
  loadAutoForgetTickState,
} from '../src/daemon/auto-forget-tick.ts';
import type { AutoForgetDaemonConfig } from '../src/infrastructure/config-loader.ts';
import type { AutoForgetDeps } from '../src/application/auto-forget-tick.ts';
import { empty as emptyGraph } from '../src/domain/graph.ts';

const baseConfig: AutoForgetDaemonConfig = {
  enabled: true,
  interval_seconds: 86400,
  dry_run: false,
  demote_band: 'frozen',
  min_age_days: 30,
};

// Fake deps: an empty graph → planAutoForget returns nothing → a clean,
// no-op pass that still exercises the runner + state persistence.
const noopDeps = (): AutoForgetDeps => ({
  graphs: {
    load: () => okAsync(emptyGraph()),
    save: () => okAsync(undefined),
  },
  vectors: {
    deleteByNodeId: () => okAsync(undefined),
  },
});

let home: string;
const logs: string[] = [];
const log = (m: string): void => void logs.push(m);

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'wi-aftick-'));
  logs.length = 0;
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe('shouldRunAutoForget', () => {
  it('disabled config → never runs', () => {
    const cfg = { ...baseConfig, enabled: false };
    assert.equal(shouldRunAutoForget(cfg, null), false);
    assert.equal(shouldRunAutoForget(cfg, '2026-07-01T00:00:00Z'), false);
  });

  it('enabled + never run → runs', () => {
    assert.equal(shouldRunAutoForget(baseConfig, null), true);
  });

  it('enabled + within interval → skips', () => {
    const now = new Date('2026-07-19T12:00:00Z');
    const lastRun = '2026-07-19T11:00:00Z'; // 1h ago < 86400s
    assert.equal(shouldRunAutoForget(baseConfig, lastRun, now), false);
  });

  it('enabled + interval elapsed → runs', () => {
    const now = new Date('2026-07-20T12:00:01Z'); // > 86400s after last run
    const lastRun = '2026-07-19T12:00:00Z';
    assert.equal(shouldRunAutoForget(baseConfig, lastRun, now), true);
  });
});

describe('runAutoForgetDaemonTick', () => {
  it('disabled → returns null, writes no state file', async () => {
    const cfg = { ...baseConfig, enabled: false };
    const res = await runAutoForgetDaemonTick(noopDeps(), home, cfg, log);
    assert.ok(res.isOk());
    assert.equal(res._unsafeUnwrap(), null);
    assert.equal(existsSync(join(home, 'auto-forget-last-run.json')), false);
  });

  it('enabled → runs, persists last-run state, logs an applied summary', async () => {
    const now = new Date('2026-07-19T12:00:00Z');
    const res = await runAutoForgetDaemonTick(noopDeps(), home, baseConfig, log, now);
    assert.ok(res.isOk());
    assert.notEqual(res._unsafeUnwrap(), null); // a report, not skipped

    const state = loadAutoForgetTickState(home);
    assert.equal(state.last_run_at, now.toISOString());
    assert.equal(state.last_outcome, 'ok');
    assert.ok(logs.some((l) => l.includes('auto-forget-tick: applied')));
  });

  it('dry_run → reports plan-only, mutates nothing', async () => {
    let saved = false;
    const deps: AutoForgetDeps = {
      graphs: { load: () => okAsync(emptyGraph()), save: () => { saved = true; return okAsync(undefined); } },
      vectors: { deleteByNodeId: () => okAsync(undefined) },
    };
    const res = await runAutoForgetDaemonTick(deps, home, { ...baseConfig, dry_run: true }, log);
    assert.ok(res.isOk());
    // empty graph → nothing to save even on a real run, but the log must say dry-run
    assert.equal(saved, false);
    assert.ok(logs.some((l) => l.includes('dry-run')));
  });

  it('within interval → skips without running', async () => {
    // Seed a recent run, then a second call inside the interval must skip.
    const first = new Date('2026-07-19T12:00:00Z');
    await runAutoForgetDaemonTick(noopDeps(), home, baseConfig, log, first);
    logs.length = 0;
    const second = new Date('2026-07-19T13:00:00Z'); // 1h later < interval
    const res = await runAutoForgetDaemonTick(noopDeps(), home, baseConfig, log, second);
    assert.equal(res._unsafeUnwrap(), null);
    assert.equal(logs.length, 0);
  });
});
