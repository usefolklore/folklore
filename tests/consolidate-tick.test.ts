/**
 * Tests for src/daemon/consolidate-tick.ts — Phase 4.1+ daemon-tick
 * auto-consolidation gate logic. We don't actually spawn child
 * processes in unit tests (the spawn would try to launch dist/cli/
 * index.js with consolidate which needs Ollama); we validate the
 * decision logic + state persistence.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  shouldRunConsolidate,
  loadConsolidateTickState,
} from '../src/daemon/consolidate-tick.ts';
import type { ConsolidateConfig } from '../src/infrastructure/config-loader.ts';

const baseConfig: ConsolidateConfig = {
  enabled: true,
  rooms: ['sessions'],
  interval_seconds: 86400,
  model: 'qwen2.5:1.5b',
  similarity_threshold: 0.8,
  min_size: 5,
  max_size: 100,
  prune: true,
  min_room_raw_to_trigger: 50,
};

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'wi-ctick-'));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe('shouldRunConsolidate', () => {
  it('disabled config → never runs', () => {
    const cfg = { ...baseConfig, enabled: false };
    assert.equal(shouldRunConsolidate(cfg, null), false);
    assert.equal(shouldRunConsolidate(cfg, '2026-04-18T00:00:00Z'), false);
  });

  it('enabled + never run → runs', () => {
    assert.equal(shouldRunConsolidate(baseConfig, null), true);
  });

  it('enabled + within interval → skips', () => {
    const now = new Date('2026-04-18T12:00:00Z');
    const lastRun = '2026-04-18T11:00:00Z'; // 1 hour ago, < 86400 interval
    assert.equal(shouldRunConsolidate(baseConfig, lastRun, now), false);
  });

  it('enabled + interval elapsed → runs', () => {
    const now = new Date('2026-04-19T12:00:01Z'); // 86401 seconds after last run
    const lastRun = '2026-04-18T12:00:00Z';
    assert.equal(shouldRunConsolidate(baseConfig, lastRun, now), true);
  });

  it('exact interval boundary → runs (>= comparison)', () => {
    const now = new Date('2026-04-19T12:00:00.000Z');
    const lastRun = '2026-04-18T12:00:00.000Z';
    assert.equal(shouldRunConsolidate(baseConfig, lastRun, now), true);
  });
});

describe('loadConsolidateTickState', () => {
  it('returns the default when no state file', () => {
    const s = loadConsolidateTickState(home);
    assert.equal(s.last_run_at, null);
    assert.equal(s.last_outcome, null);
    assert.equal(s.version, 1);
  });

  it('reads back a persisted state file', async () => {
    const path = join(home, 'consolidate-last-run.json');
    await writeFile(path, JSON.stringify({
      version: 1,
      last_run_at: '2026-04-18T10:00:00Z',
      last_outcome: 'ok',
    }));
    const s = loadConsolidateTickState(home);
    assert.equal(s.last_run_at, '2026-04-18T10:00:00Z');
    assert.equal(s.last_outcome, 'ok');
  });

  it('returns default on corrupt JSON', async () => {
    const path = join(home, 'consolidate-last-run.json');
    await writeFile(path, '{ not json');
    const s = loadConsolidateTickState(home);
    assert.equal(s.last_run_at, null);
  });

  it('returns default when version mismatches', async () => {
    const path = join(home, 'consolidate-last-run.json');
    await writeFile(path, JSON.stringify({
      version: 99,
      last_run_at: '2026-04-18T10:00:00Z',
      last_outcome: 'ok',
    }));
    const s = loadConsolidateTickState(home);
    assert.equal(s.last_run_at, null);
  });
});

describe('integration — config wiring', () => {
  it('config-loader sets the consolidate defaults correctly', async () => {
    const { loadConfig } = await import('../src/infrastructure/config-loader.ts');
    // Write an empty config; defaults should hydrate
    const cfgPath = join(home, 'config.yaml');
    await writeFile(cfgPath, 'daemon: {}');
    const r = await loadConfig(cfgPath);
    assert.ok(r.isOk(), `load: ${r.isErr() ? JSON.stringify(r.error) : ''}`);
    if (!r.isOk()) return;
    assert.equal(r.value.daemon.consolidate.enabled, false);
    assert.equal(r.value.daemon.consolidate.interval_seconds, 86400);
    assert.equal(r.value.daemon.consolidate.model, 'qwen2.5:1.5b');
    assert.equal(r.value.daemon.consolidate.prune, true);
  });

  it('config-loader honors explicit consolidate overrides', async () => {
    const { loadConfig } = await import('../src/infrastructure/config-loader.ts');
    const cfgPath = join(home, 'config.yaml');
    await writeFile(cfgPath, [
      'daemon:',
      '  consolidate:',
      '    enabled: true',
      '    rooms: [sessions, research]',
      '    interval_seconds: 3600',
      '    model: qwen2.5:3b',
      '    prune: false',
      '    min_size: 10',
    ].join('\n'));
    const r = await loadConfig(cfgPath);
    assert.ok(r.isOk());
    if (!r.isOk()) return;
    assert.equal(r.value.daemon.consolidate.enabled, true);
    assert.deepEqual([...r.value.daemon.consolidate.rooms], ['sessions', 'research']);
    assert.equal(r.value.daemon.consolidate.interval_seconds, 3600);
    assert.equal(r.value.daemon.consolidate.model, 'qwen2.5:3b');
    assert.equal(r.value.daemon.consolidate.prune, false);
    assert.equal(r.value.daemon.consolidate.min_size, 10);
  });
});
