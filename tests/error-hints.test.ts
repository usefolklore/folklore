/**
 * Unit tests — `hintFor(e: AppError)` actionable remediation hints.
 *
 * Locks the contract that:
 *   - The 5 most-urgent error types from the round-3 UX review return
 *     non-null hints with command-shaped guidance.
 *   - PeerDialError differentiates between timeout and connection-
 *     refused with different hint wording.
 *   - GraphReadError differentiates ENOENT (first run, run trigger)
 *     from generic read errors.
 *   - SecretDetected hint embeds the offending node id so the user
 *     can locate the content.
 *   - Errors without obvious fixes return null.
 *   - formatErrorWithHint glues both together.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatError,
  formatErrorWithHint,
  hintFor,
  GraphError,
  VectorError,
  EmbeddingError,
  PeerError,
  ScanError,
  IdentityError,
  type AppError,
} from '../src/domain/errors.js';

// ─────────────── helpers ──────────────────

const sampleScanMatch = { field: 'label', patternName: 'github-token' } as const;

// ─────────────── happy-path hints ─────────

test('GraphReadError ENOENT → hint says run `akashik trigger`', () => {
  const e = GraphError.readError('/x/graph.json', 'ENOENT: no such file');
  const h = hintFor(e);
  assert.ok(h !== null);
  assert.match(h!, /akashik trigger/);
});

test('GraphReadError non-ENOENT → hint says run `doctor --fix`', () => {
  const e = GraphError.readError('/x/graph.json', 'EACCES: permission denied');
  const h = hintFor(e);
  assert.ok(h !== null);
  assert.match(h!, /doctor --fix/);
});

test('ModelLoadError → hint mentions ~90 MB download + cache env var', () => {
  const e = EmbeddingError.modelLoad('all-MiniLM-L6-v2', 'fetch failed');
  const h = hintFor(e);
  assert.ok(h !== null);
  assert.match(h!, /AKASHIK_MODEL_CACHE/);
  assert.match(h!, /90 MB/);
});

test('PeerDialError timeout → hint mentions firewall + the address', () => {
  const e = PeerError.dialError('/ip4/1.2.3.4/tcp/9001/p2p/abc', 'timeout');
  const h = hintFor(e);
  assert.ok(h !== null);
  assert.match(h!, /firewall/i);
  assert.match(h!, /1\.2\.3\.4/);
});

test('PeerDialError ECONNREFUSED → hint says peer offline / wrong port', () => {
  const e = PeerError.dialError('/ip4/127.0.0.1/tcp/9001/p2p/abc', 'ECONNREFUSED');
  const h = hintFor(e);
  assert.ok(h !== null);
  assert.match(h!, /offline|listening/i);
});

test('SecretDetected → hint embeds node id and points at non-shared room remediation', () => {
  const e = ScanError.secretDetected('node-abc-123', [sampleScanMatch]);
  const h = hintFor(e);
  assert.ok(h !== null);
  assert.match(h!, /node-abc-123/);
  assert.match(h!, /non-shared room|remove the credential/);
});

test('VectorOpenError → hint says doctor --fix or check sqlite-vec file perms', () => {
  const e = VectorError.openError('/x/vectors.db', 'EBUSY');
  const h = hintFor(e);
  assert.ok(h !== null);
  assert.match(h!, /doctor --fix|sqlite-vec/);
});

test('IdentityKeyGenerationError → hint says identity init / onboard', () => {
  const e = IdentityError.keyGeneration('crypto unavailable');
  const h = hintFor(e);
  assert.ok(h !== null);
  assert.match(h!, /identity init|onboard/);
});

// ─────────────── null path ────────────────

test('errors without an actionable fix return null', () => {
  // NodeNotFound is informational — no fix the user can run.
  const e = GraphError.nodeNotFound('node-z');
  assert.equal(hintFor(e), null);
});

// ─────────────── formatErrorWithHint ──────

test('formatErrorWithHint returns plain formatError when no hint', () => {
  const e = GraphError.nodeNotFound('node-z');
  assert.equal(formatErrorWithHint(e), formatError(e));
});

test('formatErrorWithHint glues the hint with a clear arrow separator', () => {
  const e = GraphError.readError('/x/graph.json', 'ENOENT');
  const out = formatErrorWithHint(e);
  // Two lines: error then hint.
  const lines = out.split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[1], /^\s*→ fix:/);
});

// ─────────────── guard against drift ──────

test('hintFor handles every error covered without throwing', () => {
  const samples: AppError[] = [
    GraphError.readError('/x', 'ENOENT'),
    GraphError.parseError('/x', 'syntax'),
    GraphError.writeError('/x', 'ENOSPC'),
    GraphError.nodeNotFound('z'),
    VectorError.openError('/x', 'EBUSY'),
    EmbeddingError.modelLoad('m', 'x'),
    PeerError.dialError('/ip4/x', 'timeout'),
    PeerError.identityReadError('/x', 'EACCES'),
    ScanError.secretDetected('z', [sampleScanMatch]),
    IdentityError.keyGeneration('x'),
  ];
  for (const e of samples) {
    // hintFor must not throw; result is string or null.
    const h = hintFor(e);
    assert.ok(h === null || typeof h === 'string');
  }
});
