/**
 * seed-corpus + seed-graph tests.
 *
 * Locks the cold-start seeding contract:
 *   - parseSeedCorpus accepts a well-formed manifest, normalises fields
 *   - parseSeedCorpus rejects every structural defect with a parse error
 *   - the bundled DEFAULT_SEED_CORPUS validates
 *   - seedToNode produces a save-shaped node with seed:// provenance
 *   - seedGraph indexes every entry on an empty graph
 *   - seedGraph is idempotent (re-run skips present ids)
 *   - seedGraph --force re-indexes everything
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { okAsync } from 'neverthrow';

import { empty as emptyGraph, upsertNode, type Graph, type GraphNode } from '../src/domain/graph.js';
import type { UseCaseDeps } from '../src/application/use-cases.js';
import { seedGraph } from '../src/application/seed-graph.js';
import {
  parseSeedCorpus,
  seedToNode,
  seedNodeId,
  SEED_SOURCE_SCHEME,
} from '../src/domain/seed-corpus.js';
import { DEFAULT_SEED_CORPUS } from '../src/domain/seed-corpus-data.js';
import { isWorkspaceVisible } from '../src/cli/commands/ask.js';

const FIXED = new Date('2026-06-09T00:00:00Z');

const goodCorpus = {
  version: 1,
  entries: [
    { type: 'concept', label: 'Network-before-web gate', body: 'Ask the graph before the web.' },
    { label: 'Auto-save loop', body: 'Save web results so the next query hits the graph.' },
    { type: 'source', label: 'A pinned source', body: 'External pointer worth keeping.', source_uri: 'https://example.com/x', private: true },
  ],
};

// ─────────────── parse ───────────────

test('seed: parseSeedCorpus accepts a well-formed manifest and defaults type to concept', () => {
  const r = parseSeedCorpus(goodCorpus, 'good.json');
  assert.ok(r.isOk());
  const c = r._unsafeUnwrap();
  assert.equal(c.version, 1);
  assert.equal(c.entries.length, 3);
  assert.equal(c.entries[1].type, 'concept', 'missing type defaults to concept');
  assert.equal(c.entries[0].private, false, 'private defaults to false');
  assert.equal(c.entries[2].private, true);
  assert.equal(c.entries[2].source_uri, 'https://example.com/x');
});

test('seed: parseSeedCorpus rejects structural defects', () => {
  const cases: readonly [string, unknown][] = [
    ['not an object', 42],
    ['missing version', { entries: [] }],
    ['entries not array', { version: 1, entries: {} }],
    ['empty entries', { version: 1, entries: [] }],
    ['entry not object', { version: 1, entries: ['x'] }],
    ['missing label', { version: 1, entries: [{ body: 'b' }] }],
    ['missing body', { version: 1, entries: [{ label: 'L' }] }],
    ['bad type', { version: 1, entries: [{ type: 'transcript', label: 'L', body: 'b' }] }],
    ['empty source_uri', { version: 1, entries: [{ label: 'L', body: 'b', source_uri: '' }] }],
    ['non-bool private', { version: 1, entries: [{ label: 'L', body: 'b', private: 'yes' }] }],
    ['duplicate label', { version: 1, entries: [{ label: 'L', body: 'a' }, { label: 'l', body: 'b' }] }],
  ];
  for (const [name, raw] of cases) {
    const r = parseSeedCorpus(raw, 'bad.json');
    assert.ok(r.isErr(), `expected reject: ${name}`);
    assert.equal(r._unsafeUnwrapErr().type, 'GraphParseError', `wrong error type for: ${name}`);
  }
});

test('seed: bundled DEFAULT_SEED_CORPUS validates', () => {
  const r = parseSeedCorpus(DEFAULT_SEED_CORPUS, '<bundled>');
  assert.ok(r.isOk(), r.isErr() ? r._unsafeUnwrapErr().type : 'ok');
  assert.ok(r._unsafeUnwrap().entries.length >= 10, 'corpus should be non-trivial');
});

// ─────────────── seedToNode ───────────────

test('seed: seedToNode stamps seed:// provenance and embeds label+body', () => {
  const { node, text } = seedToNode(
    { type: 'concept', label: 'Gate', body: 'Ask graph first.', private: false },
    FIXED,
  );
  assert.equal(node.id, seedNodeId({ type: 'concept', label: 'Gate', body: 'x', private: false }, FIXED));
  assert.ok(String(node.source_uri).startsWith(SEED_SOURCE_SCHEME));
  assert.ok(text.includes('Gate') && text.includes('Ask graph first.'));
  assert.equal((node as GraphNode & { private?: boolean }).private, false);
});

test('seed: an explicit source_uri overrides the seed:// default', () => {
  const { node } = seedToNode(
    { type: 'source', label: 'Pin', body: 'b', source_uri: 'https://e.com/y', private: true },
    FIXED,
  );
  assert.equal(node.source_uri, 'https://e.com/y');
});

// ─────────────── workspace visibility (cold-start fix) ───────────────

test('seed: untagged global nodes are visible in any workspace', () => {
  // Seeded reference nodes carry no workspace tag — they must surface
  // when the live hook runs `ask` inside an arbitrary repo (no
  // --workspace all), which is what unblocks cold-start deflection.
  assert.equal(isWorkspaceVisible(undefined, 'folklore'), true);
  assert.equal(isWorkspaceVisible(undefined, 'some-other-repo'), true);
});

test('seed: repo-tagged nodes stay scoped to their repo', () => {
  assert.equal(isWorkspaceVisible('folklore', 'folklore'), true);
  assert.equal(isWorkspaceVisible('folklore', 'some-other-repo'), false);
});

// ─────────────── seedGraph ───────────────

interface FakeDeps {
  readonly deps: UseCaseDeps;
  readonly current: () => Graph;
  readonly embedCalls: () => number;
}

const buildFakeDeps = (initial: Graph): FakeDeps => {
  let g = initial;
  let embeds = 0;
  const deps: UseCaseDeps = {
    graphs: {
      load: () => okAsync(g),
      save: (next: Graph) => { g = next; return okAsync(undefined); },
    } as UseCaseDeps['graphs'],
    vectors: {
      upsert: () => okAsync(undefined),
    } as unknown as UseCaseDeps['vectors'],
    embedder: {
      dim: 3,
      embed: () => { embeds++; return okAsync(new Float32Array([1, 0, 0])); },
      embedBatch: (ts: readonly string[]) => okAsync(ts.map(() => new Float32Array([1, 0, 0]))),
    } as UseCaseDeps['embedder'],
    githubUser: () => undefined,
  };
  return { deps, current: () => g, embedCalls: () => embeds };
};

test('seed: seedGraph indexes every entry on an empty graph', async () => {
  const corpus = parseSeedCorpus(goodCorpus)._unsafeUnwrap();
  const fake = buildFakeDeps(emptyGraph());
  const r = await seedGraph(fake.deps)({ corpus, now: FIXED });
  assert.ok(r.isOk());
  const report = r._unsafeUnwrap();
  assert.equal(report.total, 3);
  assert.equal(report.seeded, 3);
  assert.equal(report.skipped, 0);
  assert.equal(fake.current().nodeById.size, 3);
  assert.equal(fake.embedCalls(), 3);
});

test('seed: seedGraph is idempotent — re-run skips present ids', async () => {
  const corpus = parseSeedCorpus(goodCorpus)._unsafeUnwrap();
  const fake = buildFakeDeps(emptyGraph());
  await seedGraph(fake.deps)({ corpus, now: FIXED });
  const r2 = await seedGraph(fake.deps)({ corpus, now: FIXED });
  assert.ok(r2.isOk());
  const report = r2._unsafeUnwrap();
  assert.equal(report.seeded, 0, 'nothing re-written');
  assert.equal(report.skipped, 3, 'all present');
  assert.equal(fake.current().nodeById.size, 3, 'no duplicates');
});

test('seed: seedGraph --force re-indexes everything', async () => {
  const corpus = parseSeedCorpus(goodCorpus)._unsafeUnwrap();
  const fake = buildFakeDeps(emptyGraph());
  await seedGraph(fake.deps)({ corpus, now: FIXED });
  const r2 = await seedGraph(fake.deps)({ corpus, force: true, now: FIXED });
  assert.ok(r2.isOk());
  assert.equal(r2._unsafeUnwrap().seeded, 3, 'force re-indexes all');
  assert.equal(fake.embedCalls(), 6, '3 initial + 3 forced re-embeds');
});

test('seed: seedGraph seeds only the missing entries when partially present', async () => {
  const corpus = parseSeedCorpus(goodCorpus)._unsafeUnwrap();
  // Pre-populate one of the three ids.
  const presentId = seedNodeId(corpus.entries[0], FIXED);
  const seeded = upsertNode(emptyGraph(), {
    id: presentId,
    label: corpus.entries[0].label,
    file_type: 'rationale',
    source_file: 'folklore:save',
  } as GraphNode);
  assert.ok(seeded.isOk());
  const fake = buildFakeDeps(seeded._unsafeUnwrap());
  const r = await seedGraph(fake.deps)({ corpus, now: FIXED });
  assert.ok(r.isOk());
  const report = r._unsafeUnwrap();
  assert.equal(report.seeded, 2);
  assert.equal(report.skipped, 1);
  assert.deepEqual(report.skipped_ids, [presentId]);
});
