/**
 * Phase 37 — interactive share picker (pure logic).
 *
 * Covers the domain module only — TTY rendering + raw-stdin decoding
 * lives in src/cli/tui/share-picker-tty.ts and is exercised end-to-end
 * manually. These tests pin the stateless behaviour:
 *   - buildPickerState excludes system rooms, aggregates counts
 *   - step() handles every key transition and clamps the cursor
 *   - computeDiff partitions correctly
 *   - applyDiff preserves existing sharedAt + never touches system rooms
 */

import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';

import type { GraphNode } from '../src/domain/graph.js';
import type { SharedRoomsFile } from '../src/infrastructure/share-store.js';
import {
  buildPickerState,
  step,
  computeDiff,
  applyDiff,
  type PickerState,
} from '../src/domain/share-picker.js';

const mkNode = (room: string, id = `n-${room}`): GraphNode => ({
  id,
  label: id,
  file_type: 'document',
  source_file: 's',
  fetched_at: '2026-04-17T00:00:00Z',
  room,
}) as GraphNode;

const emptyFile: SharedRoomsFile = { version: 2, rooms: [] };

describe('Phase 37 — share-picker domain', () => {
  test('P1: buildPickerState aggregates rooms from graph + shared file', () => {
    const nodes = [mkNode('alpha'), mkNode('alpha', 'a2'), mkNode('beta')];
    const shared: SharedRoomsFile = {
      version: 2,
      rooms: [
        { name: 'beta',  sharedAt: '2026-04-10T00:00:00Z', shareable: true },
        { name: 'gamma', sharedAt: '2026-04-11T00:00:00Z', shareable: false },
      ],
    };
    const s = buildPickerState(nodes, shared);
    // alpha (graph-only), beta (both), gamma (shared-only) — system rooms excluded
    assert.deepStrictEqual(s.items.map((i) => i.name), ['alpha', 'beta', 'gamma']);
    assert.strictEqual(s.items.find((i) => i.name === 'alpha')?.nodeCount, 2);
    assert.strictEqual(s.items.find((i) => i.name === 'beta')?.nodeCount,  1);
    assert.strictEqual(s.items.find((i) => i.name === 'gamma')?.nodeCount, 0);
    assert.strictEqual(s.items.find((i) => i.name === 'beta')?.wasShareable, true);
    assert.strictEqual(s.items.find((i) => i.name === 'gamma')?.wasShareable, false);
    assert.strictEqual(s.cursor, 0);
    assert.strictEqual(s.done, false);
  });

  test('P2: buildPickerState excludes system rooms even if present in the graph or shared file', () => {
    const nodes = [mkNode('toolshed'), mkNode('research'), mkNode('ok')];
    const shared: SharedRoomsFile = {
      version: 2,
      rooms: [
        { name: 'toolshed', sharedAt: '2026-04-17T00:00:00Z', shareable: true },
        { name: 'research', sharedAt: '2026-04-17T00:00:00Z', shareable: true },
      ],
    };
    const s = buildPickerState(nodes, shared);
    assert.deepStrictEqual(s.items.map((i) => i.name), ['ok']);
  });

  test('P3: step — up / down wrap around correctly', () => {
    const base: PickerState = {
      items: [
        { name: 'a', wasShareable: false, isShareable: false, nodeCount: 0 },
        { name: 'b', wasShareable: false, isShareable: false, nodeCount: 0 },
        { name: 'c', wasShareable: false, isShareable: false, nodeCount: 0 },
      ],
      cursor: 0,
      done: false,
    };
    // up at top wraps to bottom
    assert.strictEqual(step(base, { kind: 'up' }).cursor, 2);
    // down at bottom wraps to top
    const atBottom = { ...base, cursor: 2 };
    assert.strictEqual(step(atBottom, { kind: 'down' }).cursor, 0);
    // middle-navigation
    assert.strictEqual(step(base, { kind: 'down' }).cursor, 1);
  });

  test('P4: step — toggle flips isShareable only at cursor', () => {
    const initial: PickerState = {
      items: [
        { name: 'x', wasShareable: false, isShareable: false, nodeCount: 3 },
        { name: 'y', wasShareable: true,  isShareable: true,  nodeCount: 5 },
      ],
      cursor: 1,
      done: false,
    };
    const after = step(initial, { kind: 'toggle' });
    assert.strictEqual(after.items[0].isShareable, false);
    assert.strictEqual(after.items[1].isShareable, false);
  });

  test('P5: step — commit and cancel mark done, further keys are no-ops', () => {
    const base: PickerState = {
      items: [{ name: 'a', wasShareable: false, isShareable: false, nodeCount: 0 }],
      cursor: 0,
      done: false,
    };
    const committed = step(base, { kind: 'commit' });
    assert.strictEqual(committed.done, 'committed');
    assert.strictEqual(step(committed, { kind: 'toggle' }).items[0].isShareable, false);
    const cancelled = step(base, { kind: 'cancel' });
    assert.strictEqual(cancelled.done, 'cancelled');
  });

  test('P6: computeDiff partitions shared/unshared/unchanged', () => {
    const diff = computeDiff([
      { name: 'becomes-shared',   wasShareable: false, isShareable: true,  nodeCount: 0 },
      { name: 'becomes-unshared', wasShareable: true,  isShareable: false, nodeCount: 0 },
      { name: 'stays-shared',     wasShareable: true,  isShareable: true,  nodeCount: 0 },
      { name: 'stays-unshared',   wasShareable: false, isShareable: false, nodeCount: 0 },
    ]);
    assert.deepStrictEqual(diff.toShare,   ['becomes-shared']);
    assert.deepStrictEqual(diff.toUnshare, ['becomes-unshared']);
    assert.deepStrictEqual(diff.unchanged, ['stays-shared', 'stays-unshared']);
  });

  test('P7: applyDiff preserves existing sharedAt and upserts both directions', () => {
    const before: SharedRoomsFile = {
      version: 2,
      rooms: [
        { name: 'keeper', sharedAt: '2024-01-01T00:00:00Z', shareable: true },
        { name: 'flip-off', sharedAt: '2024-02-01T00:00:00Z', shareable: true },
      ],
    };
    const after = applyDiff(before, {
      toShare:    ['new-room'],
      toUnshare:  ['flip-off'],
      unchanged:  ['keeper'],
    }, new Date('2026-04-17T12:00:00Z'));
    const names = after.rooms.map((r) => r.name).sort();
    assert.deepStrictEqual(names, ['flip-off', 'keeper', 'new-room']);
    assert.strictEqual(after.rooms.find((r) => r.name === 'keeper')?.sharedAt,   '2024-01-01T00:00:00Z');
    assert.strictEqual(after.rooms.find((r) => r.name === 'flip-off')?.sharedAt, '2024-02-01T00:00:00Z');
    assert.strictEqual(after.rooms.find((r) => r.name === 'flip-off')?.shareable, false);
    assert.strictEqual(after.rooms.find((r) => r.name === 'new-room')?.shareable, true);
    assert.strictEqual(after.rooms.find((r) => r.name === 'new-room')?.sharedAt, '2026-04-17T12:00:00.000Z');
  });

  test('P8: applyDiff ignores system-room names — defense in depth', () => {
    const before: SharedRoomsFile = { version: 2, rooms: [] };
    const after = applyDiff(before, {
      toShare: ['toolshed', 'user-room'],
      toUnshare: ['research'],
      unchanged: [],
    });
    // Only user-room made it in; the two system-room names were silently dropped
    assert.deepStrictEqual(after.rooms.map((r) => r.name), ['user-room']);
  });
});
