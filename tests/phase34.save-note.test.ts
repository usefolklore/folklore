/**
 * Phase 34 — save-note regression tests.
 *
 * Covers the pure helpers that back the `wellinformed save` CLI:
 *   - slugify edge cases
 *   - deterministic id derivation (same input → same id)
 *   - GraphNode shape + file_type mapping per note type
 *   - idempotent upsert in the same UTC day
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { empty, upsertNode } from '../src/domain/graph.js';
import {
  slugify,
  saveIdOf,
  nodeFromSave,
  isNoteType,
  NOTE_TYPES,
} from '../src/domain/save-note.js';

test('phase-34: slugify collapses non-alphanumerics and clamps length', () => {
  assert.strictEqual(slugify('Touch primitive'), 'touch-primitive');
  assert.strictEqual(slugify('  Why hybrid HURTS ArguAna?! '), 'why-hybrid-hurts-arguana');
  assert.strictEqual(slugify('---'), 'untitled');
  assert.strictEqual(slugify(''), 'untitled');
  assert.strictEqual(slugify('a'.repeat(200)).length, 60);
});

test('phase-34: saveIdOf is deterministic for same (type, date, label)', () => {
  const d = new Date('2026-04-17T12:34:56Z');
  const a = saveIdOf('synthesis', 'Touch primitive', d);
  const b = saveIdOf('synthesis', 'Touch primitive', d);
  assert.strictEqual(a, b);
  assert.strictEqual(a, 'synthesis://2026-04-17/touch-primitive');
});

test('phase-34: note type guard rejects unknown strings', () => {
  for (const t of NOTE_TYPES) assert.ok(isNoteType(t));
  assert.ok(!isNoteType('transcript'));
  assert.ok(!isNoteType('SYNTHESIS'));
});

test("phase-34: nodeFromSave maps 'source' → document, others → rationale", () => {
  const d = new Date('2026-04-17T00:00:00Z');
  const src = nodeFromSave({ type: 'source', label: 'BAAI bge-base', room: 'r', date: d });
  const syn = nodeFromSave({ type: 'synthesis', label: 'Hybrid lift', room: 'r', date: d });
  const con = nodeFromSave({ type: 'concept', label: 'RNG tunnels', room: 'r', date: d });
  const dec = nodeFromSave({ type: 'decision', label: 'Dense-only for stance', room: 'r', date: d });
  assert.strictEqual(src.file_type, 'document');
  assert.strictEqual(syn.file_type, 'rationale');
  assert.strictEqual(con.file_type, 'rationale');
  assert.strictEqual(dec.file_type, 'rationale');
  for (const n of [src, syn, con, dec]) {
    assert.strictEqual(n.source_file, 'wellinformed:save');
    assert.strictEqual(n.room, 'r');
  }
});

test('phase-34: nodeFromSave clamps body to 8000 chars, stamps note_type + id as embedding_id', () => {
  const big = 'x'.repeat(10_000);
  const n = nodeFromSave({ type: 'synthesis', label: 'L', room: 'r', body: big, date: new Date('2026-04-17T00:00:00Z') });
  assert.strictEqual(String(n.summary).length, 8000);
  assert.strictEqual(n.note_type, 'synthesis');
  assert.strictEqual(n.embedding_id, n.id);
});

test('phase-34: save is idempotent within a UTC day (same id → merged)', () => {
  const d = new Date('2026-04-17T00:00:00Z');
  const first = nodeFromSave({ type: 'concept', label: 'Touch primitive', room: 'r', body: 'v1', date: d });
  const later = nodeFromSave({ type: 'concept', label: 'Touch primitive', room: 'r', body: 'v2 revised', date: d });
  assert.strictEqual(first.id, later.id);

  let g = empty();
  const r1 = upsertNode(g, first);
  assert.ok(r1.isOk());
  if (r1.isOk()) g = r1.value;
  const r2 = upsertNode(g, later);
  assert.ok(r2.isOk());
  if (r2.isOk()) g = r2.value;

  assert.strictEqual(g.json.nodes.length, 1);
  assert.strictEqual(g.json.nodes[0].summary, 'v2 revised');
});

test('phase-34: explicit sourceUri overrides the default (id) source_uri', () => {
  const n = nodeFromSave({
    type: 'source',
    label: 'External pointer',
    room: 'r',
    sourceUri: 'https://arxiv.org/abs/2409.02685',
    date: new Date('2026-04-17T00:00:00Z'),
  });
  assert.strictEqual(n.source_uri, 'https://arxiv.org/abs/2409.02685');
});
