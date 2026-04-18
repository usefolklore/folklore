/**
 * Tests for src/application/consolidator.ts — the Phase 4b orchestrator.
 *
 * All tests use injected fakes for the four ports (loadEntries,
 * generateSummary, persistConsolidated, markEntriesConsolidated). No
 * Ollama, no SQLite. The orchestrator's decision logic is what's
 * under test:
 *
 *   - Empty room → empty report (no clusters, no LLM calls)
 *   - Sub-min_size neighborhoods → no clusters → no LLM, no persist
 *   - Happy-path: cluster found → summary called → persist called → mark called
 *   - dryRun: skips persist + mark, still summarizes
 *   - Per-cluster summary failure: status=summary_failed, others continue
 *   - Per-cluster persist failure: status=persist_failed, others continue
 *   - Multi-room across-rooms helper: processes per room
 *   - defaultMakeId is content-addressed deterministic
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { okAsync, errAsync, ResultAsync } from 'neverthrow';
import {
  runConsolidation,
  runConsolidationAcrossRooms,
  defaultMakeId,
  type ConsolidatorDeps,
} from '../src/application/consolidator.ts';
import {
  type EpisodicEntry,
  type ConsolidatedMemory,
  type ConsolidationCluster,
} from '../src/domain/consolidated-memory.ts';
import type { NodeId, Room } from '../src/domain/graph.ts';
import type { AppError } from '../src/domain/errors.ts';
import { normalize } from '../src/domain/vectors.ts';

// ─────────────── helpers ───────────────

const unit = (dim: number, seed: number): Float32Array => {
  const v = new Float32Array(dim);
  let s = seed >>> 0;
  for (let i = 0; i < dim; i++) {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    v[i] = ((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5;
  }
  return normalize(v);
};

const nearby = (seed: Float32Array, angle: number, noiseSeed: number): Float32Array => {
  const noise = unit(seed.length, noiseSeed);
  const v = new Float32Array(seed.length);
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  for (let i = 0; i < seed.length; i++) v[i] = seed[i] * cosA + noise[i] * sinA;
  return normalize(v);
};

const mkEntry = (id: string, room: string, vector: Float32Array, ts: string, text: string | null = null): EpisodicEntry => ({
  node_id: id,
  room,
  vector,
  raw_text: text ?? `${id} body`,
  timestamp: ts,
});

interface Recorded {
  loadEntriesCalls: Room[];
  summaryCalls: Array<{ seed: NodeId; size: number }>;
  persisted: ConsolidatedMemory[];
  markedIds: Array<{ ids: readonly NodeId[]; at: string }>;
}

const buildFakeDeps = (overrides: Partial<ConsolidatorDeps> & { entriesByRoom?: Record<Room, readonly EpisodicEntry[]> } = {}): { deps: ConsolidatorDeps; rec: Recorded } => {
  const rec: Recorded = { loadEntriesCalls: [], summaryCalls: [], persisted: [], markedIds: [] };
  const entriesByRoom = overrides.entriesByRoom ?? {};
  const deps: ConsolidatorDeps = {
    llm_model: overrides.llm_model ?? 'fake-model:1',
    clock: overrides.clock ?? (() => '2026-04-18T00:00:00.000Z'),
    loadEntries: overrides.loadEntries ?? ((room) => {
      rec.loadEntriesCalls.push(room);
      return okAsync(entriesByRoom[room] ?? []);
    }),
    generateSummary: overrides.generateSummary ?? ((cluster) => {
      rec.summaryCalls.push({ seed: cluster.seed_node_id, size: cluster.entries.length });
      return okAsync<string, AppError>(`summary of ${cluster.seed_node_id} (${cluster.entries.length} members)`);
    }),
    persistConsolidated: overrides.persistConsolidated ?? ((m) => {
      rec.persisted.push(m);
      return okAsync<void, AppError>(undefined);
    }),
    markEntriesConsolidated: overrides.markEntriesConsolidated ?? ((ids, at) => {
      rec.markedIds.push({ ids, at });
      return okAsync<void, AppError>(undefined);
    }),
  };
  return { deps, rec };
};

const buildCluster = (room: Room): readonly EpisodicEntry[] => {
  const seed = unit(32, 100);
  const entries: EpisodicEntry[] = [
    mkEntry('seed', room, seed, '2026-04-01T00:00:00Z'),
  ];
  for (let i = 1; i <= 5; i++) {
    entries.push(mkEntry(`n${i}`, room, nearby(seed, 0.05 + i * 0.02, 200 + i), `2026-04-01T00:0${i}:00Z`));
  }
  return entries;
};

// ─────────────── tests ───────────────

describe('consolidator — empty + degenerate cases', () => {
  it('empty room → no clusters, no calls', async () => {
    const { deps, rec } = buildFakeDeps({ entriesByRoom: { 'r1': [] } });
    const r = await runConsolidation(deps)({ room: 'r1' });
    assert.ok(r.isOk());
    if (!r.isOk()) return;
    assert.equal(r.value.clusters_found, 0);
    assert.equal(rec.summaryCalls.length, 0);
    assert.equal(rec.persisted.length, 0);
  });

  it('sub-min-size neighborhood → no cluster → no LLM call', async () => {
    const { deps, rec } = buildFakeDeps({
      entriesByRoom: { 'r1': [
        mkEntry('a', 'r1', unit(16, 1), '2026-04-01T00:00:00Z'),
        mkEntry('b', 'r1', unit(16, 99), '2026-04-01T00:01:00Z'),
      ]},
    });
    const r = await runConsolidation(deps)({ room: 'r1' });
    assert.ok(r.isOk());
    if (!r.isOk()) return;
    assert.equal(r.value.clusters_found, 0);
    assert.equal(rec.summaryCalls.length, 0);
    assert.equal(rec.persisted.length, 0);
    assert.equal(rec.markedIds.length, 0);
  });
});

describe('consolidator — happy path', () => {
  it('cluster found → summary → persist → mark all in sequence', async () => {
    const entries = buildCluster('r1');
    const { deps, rec } = buildFakeDeps({ entriesByRoom: { 'r1': entries } });
    const r = await runConsolidation(deps)({
      room: 'r1',
      clusterOpts: { similarity_threshold: 0.9, min_size: 5 },
    });
    assert.ok(r.isOk());
    if (!r.isOk()) return;

    assert.equal(r.value.clusters_found, 1);
    assert.equal(r.value.clusters_summarized, 1);
    assert.equal(r.value.clusters_persisted, 1);

    assert.equal(rec.summaryCalls.length, 1);
    assert.equal(rec.summaryCalls[0].seed, 'seed');

    assert.equal(rec.persisted.length, 1);
    const memory = rec.persisted[0];
    assert.equal(memory.room, 'r1');
    assert.equal(memory.llm_model, 'fake-model:1');
    assert.ok(memory.id.startsWith('consolidated:'));
    assert.deepEqual([...memory.provenance_ids].sort(), [...memory.provenance_ids]); // already sorted

    assert.equal(rec.markedIds.length, 1);
    assert.equal(rec.markedIds[0].at, '2026-04-18T00:00:00.000Z');
    assert.equal(rec.markedIds[0].ids.length, memory.provenance_ids.length);
  });

  it('dryRun=true: summarizes but skips persist + mark', async () => {
    const entries = buildCluster('r1');
    const { deps, rec } = buildFakeDeps({ entriesByRoom: { 'r1': entries } });
    const r = await runConsolidation(deps)({
      room: 'r1',
      clusterOpts: { similarity_threshold: 0.9, min_size: 5 },
      dryRun: true,
    });
    assert.ok(r.isOk());
    if (!r.isOk()) return;

    assert.equal(r.value.clusters_summarized, 1);
    assert.equal(r.value.clusters_persisted, 0);
    assert.equal(rec.summaryCalls.length, 1);
    assert.equal(rec.persisted.length, 0);
    assert.equal(rec.markedIds.length, 0);
    assert.equal(r.value.results[0].status, 'dry_run');
    assert.ok(r.value.results[0].memory_id);
  });
});

describe('consolidator — per-cluster failure isolation', () => {
  it('summary failure on one cluster does not abort others', async () => {
    // Two distinct clusters in r1
    const seedA = unit(32, 50);
    const seedB = unit(32, 70);
    const entries: EpisodicEntry[] = [
      mkEntry('a-seed', 'r1', seedA, '2026-04-01T00:00:00Z'),
    ];
    for (let i = 1; i <= 5; i++) entries.push(mkEntry(`a-n${i}`, 'r1', nearby(seedA, 0.05 * i, 600 + i), `2026-04-01T00:0${i}:00Z`));
    entries.push(mkEntry('b-seed', 'r1', seedB, '2026-04-01T01:00:00Z'));
    for (let i = 1; i <= 5; i++) entries.push(mkEntry(`b-n${i}`, 'r1', nearby(seedB, 0.05 * i, 700 + i), `2026-04-01T01:0${i}:00Z`));

    let callCount = 0;
    const { deps, rec } = buildFakeDeps({
      entriesByRoom: { 'r1': entries },
      generateSummary: (cluster) => {
        callCount++;
        if (cluster.seed_node_id === 'a-seed') {
          return errAsync<string, AppError>({ type: 'EmbeddingError' as never, message: 'fake llm fail' } as unknown as AppError);
        }
        return okAsync<string, AppError>(`ok summary ${cluster.seed_node_id}`);
      },
    });

    const r = await runConsolidation(deps)({ room: 'r1', clusterOpts: { similarity_threshold: 0.85, min_size: 5 } });
    assert.ok(r.isOk());
    if (!r.isOk()) return;
    assert.equal(callCount, 2, 'both clusters attempted');
    assert.equal(r.value.clusters_found, 2);
    assert.equal(r.value.clusters_summarized, 1, 'only b-seed succeeded');
    assert.equal(r.value.clusters_persisted, 1);
    assert.equal(rec.persisted.length, 1);
    assert.equal(rec.persisted[0].provenance_ids.length, 6); // b-seed + 5

    const failed = r.value.results.find((s) => s.status === 'summary_failed');
    assert.ok(failed);
    assert.equal(failed!.seed_node_id, 'a-seed');
  });

  it('persist failure marks step as persist_failed but continues', async () => {
    const entries = buildCluster('r1');
    const { deps, rec } = buildFakeDeps({
      entriesByRoom: { 'r1': entries },
      persistConsolidated: () => errAsync<void, AppError>({ type: 'GraphWriteError' as never, path: '<mem>', message: 'disk full' } as unknown as AppError),
    });
    const r = await runConsolidation(deps)({ room: 'r1', clusterOpts: { similarity_threshold: 0.9, min_size: 5 } });
    assert.ok(r.isOk());
    if (!r.isOk()) return;
    assert.equal(r.value.clusters_persisted, 0);
    assert.equal(rec.persisted.length, 0);
    assert.equal(rec.markedIds.length, 0, 'mark not called when persist failed');
    assert.equal(r.value.results[0].status, 'persist_failed');
  });
});

describe('consolidator — across rooms', () => {
  it('partitions input + processes each room independently', async () => {
    const entriesR1 = buildCluster('r1');
    const entriesR2 = buildCluster('r2').map((e) => ({ ...e, node_id: e.node_id + '-r2' }));
    const all: readonly EpisodicEntry[] = [...entriesR1, ...entriesR2];

    const { deps, rec } = buildFakeDeps();
    const r = await runConsolidationAcrossRooms(deps)(
      () => okAsync(all),
      { similarity_threshold: 0.9, min_size: 5 },
    );
    assert.ok(r.isOk());
    if (!r.isOk()) return;
    assert.equal(r.value.length, 2);
    const rooms = r.value.map((rep) => rep.room).sort();
    assert.deepEqual(rooms, ['r1', 'r2']);

    // Both rooms persisted exactly one cluster each
    assert.equal(rec.persisted.length, 2);
    const persistedRooms = rec.persisted.map((p) => p.room).sort();
    assert.deepEqual(persistedRooms, ['r1', 'r2']);
  });
});

describe('defaultMakeId', () => {
  it('content-addressed: same inputs → same ID', () => {
    const cluster: ConsolidationCluster = {
      seed_node_id: 's',
      entries: [
        mkEntry('z', 'r1', unit(16, 1), '2026-04-01T00:00:00Z'),
        mkEntry('a', 'r1', unit(16, 2), '2026-04-01T00:01:00Z'),
      ],
      centroid: unit(16, 1),
      room: 'r1',
    };
    const id1 = defaultMakeId(cluster, 'a summary');
    const id2 = defaultMakeId(cluster, 'a summary');
    assert.equal(id1, id2);
    assert.ok(id1.startsWith('consolidated:'));
  });

  it('different summary → different ID', () => {
    const cluster: ConsolidationCluster = {
      seed_node_id: 's', entries: [mkEntry('s', 'r1', unit(16, 1), '2026-04-01T00:00:00Z')],
      centroid: unit(16, 1), room: 'r1',
    };
    const id1 = defaultMakeId(cluster, 'first');
    const id2 = defaultMakeId(cluster, 'second');
    assert.notEqual(id1, id2);
  });
});

// Quiet the unused-import linter
void ResultAsync;
