/**
 * Phase 31 — regression test for the remote-node validator.
 *
 * The validator is the ONLY defence at the P2P trust boundary. Every
 * known-bad node shape must be rejected; every legitimate wellinformed
 * node must pass. If either side breaks, wellinformed becomes either
 * an RCE vector or useless for P2P — both are ship-blockers.
 *
 * Scope:
 *   - One positive path (real arXiv-style node)
 *   - One negative path per documented attack surface in
 *     docs/p2p-threat-model.md §AS-1, AS-2, AS-6, AS-7
 *   - One "drops unknown keys silently" case (extras are not errors)
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  validateRemoteNode,
  validateRemoteNodes,
} from '../src/domain/remote-node-validator.js';

// ─── positive baseline ────────────────────────────────────────────

test('phase-31: legitimate arxiv-shaped node passes validation', () => {
  const input = {
    id: 'https://arxiv.org/abs/2604.08540',
    label: 'AVGen-Bench: A Task-Driven Benchmark for Multi-Granular Evaluation',
    file_type: 'paper',
    source_file: 'arxiv',
    room: 'wellinformed-dev',
    source_uri: 'https://arxiv.org/abs/2604.08540',
    fetched_at: '2026-04-11T19:32:26.182Z',
    embedding_id: 'https://arxiv.org/abs/2604.08540',
    tags: ['ml', 'benchmark'],
  };
  const r = validateRemoteNode(input);
  assert.ok(r.isOk(), `expected ok, got ${r.isErr() ? JSON.stringify(r.error) : ''}`);
  if (r.isOk()) {
    assert.strictEqual(r.value.id, input.id);
    assert.strictEqual(r.value.label, input.label);
    assert.deepStrictEqual(r.value.tags, input.tags);
  }
});

// ─── AS-1 prototype pollution ────────────────────────────────────

test('phase-31: __proto__ / constructor / prototype keys are stripped silently', () => {
  const input = {
    id: 'n1',
    label: 'legit',
    file_type: 'document',
    source_file: 'x',
    fetched_at: '2026-04-17T00:00:00Z',
    __proto__: { polluted: true },
    constructor: { polluted: true },
    prototype: { polluted: true },
  };
  const r = validateRemoteNode(input);
  assert.ok(r.isOk());
  if (r.isOk()) {
    assert.strictEqual((r.value as Record<string, unknown>).polluted, undefined);
    // Own properties of the returned node must not include prototype-pollution keys
    assert.ok(!Object.prototype.hasOwnProperty.call(r.value, 'constructor'));
    assert.ok(!Object.prototype.hasOwnProperty.call(r.value, 'prototype'));
  }
});

// ─── AS-2 malformed node shapes ──────────────────────────────────

test('phase-31: missing required field rejected', () => {
  const r = validateRemoteNode({ id: 'x', label: 'y', file_type: 'document' /* missing source_file */ });
  assert.ok(r.isErr());
});

test('phase-31: invalid file_type rejected', () => {
  const r = validateRemoteNode({
    id: 'x', label: 'y', file_type: 'executable', source_file: 'z',
  });
  assert.ok(r.isErr());
  if (r.isErr()) assert.strictEqual(r.error.kind, 'FileTypeNotAllowed');
});

test('phase-31: oversized label rejected', () => {
  const r = validateRemoteNode({
    id: 'x',
    label: 'A'.repeat(20_000),
    file_type: 'document',
    source_file: 'z',
  });
  assert.ok(r.isErr());
  if (r.isErr()) assert.strictEqual(r.error.kind, 'StringTooLong');
});

test('phase-31: control chars in label rejected', () => {
  const r = validateRemoteNode({
    id: 'x',
    label: 'nul byte\u0000here',
    file_type: 'document',
    source_file: 'z',
  });
  assert.ok(r.isErr());
  if (r.isErr()) assert.strictEqual(r.error.kind, 'ControlCharacterInString');
});

test('phase-31: array at root rejected (must be object)', () => {
  const r = validateRemoteNode([]);
  assert.ok(r.isErr());
});

test('phase-31: null at root rejected', () => {
  const r = validateRemoteNode(null);
  assert.ok(r.isErr());
});

// ─── AS-6 SSRF via source_uri ────────────────────────────────────

test('phase-31: file:// URI rejected', () => {
  const r = validateRemoteNode({
    id: 'x', label: 'y', file_type: 'document', source_file: 'z',
    source_uri: 'file:///etc/passwd',
  });
  assert.ok(r.isErr());
  if (r.isErr()) assert.strictEqual(r.error.kind, 'UriSchemeNotAllowed');
});

test('phase-31: AWS IMDS host rejected', () => {
  const r = validateRemoteNode({
    id: 'x', label: 'y', file_type: 'document', source_file: 'z',
    source_uri: 'http://169.254.169.254/latest/meta-data/',
  });
  assert.ok(r.isErr());
  if (r.isErr()) assert.strictEqual(r.error.kind, 'UriHostBlocked');
});

test('phase-31: localhost host rejected', () => {
  const r = validateRemoteNode({
    id: 'x', label: 'y', file_type: 'document', source_file: 'z',
    source_uri: 'http://localhost:8080/admin',
  });
  assert.ok(r.isErr());
  if (r.isErr()) assert.strictEqual(r.error.kind, 'UriHostBlocked');
});

test('phase-31: private 192.168 host rejected', () => {
  const r = validateRemoteNode({
    id: 'x', label: 'y', file_type: 'document', source_file: 'z',
    source_uri: 'http://192.168.1.1/',
  });
  assert.ok(r.isErr());
});

test('phase-31: malformed URI rejected', () => {
  const r = validateRemoteNode({
    id: 'x', label: 'y', file_type: 'document', source_file: 'z',
    source_uri: 'not a url',
  });
  assert.ok(r.isErr());
});

test('phase-31: arxiv: scheme accepted', () => {
  const r = validateRemoteNode({
    id: 'x', label: 'y', file_type: 'paper', source_file: 'arxiv',
    source_uri: 'arxiv:2604.08540',
    fetched_at: '2026-04-17T00:00:00Z',
  });
  assert.ok(r.isOk());
});

// ─── AS-8 oversized serialised node ─────────────────────────────

test('phase-31: 100KB serialised node rejected at size gate', () => {
  const input: Record<string, unknown> = {
    id: 'x', label: 'y', file_type: 'document', source_file: 'z',
  };
  for (let i = 0; i < 200; i++) {
    // each key is allow-listed-ish; overall serialised size blows the cap
    input[`tags_${i}`] = 'a'.repeat(600);
  }
  const r = validateRemoteNode(input);
  assert.ok(r.isErr());
  if (r.isErr()) assert.strictEqual(r.error.kind, 'SerialisedNodeTooLarge');
});

// ─── batch behaviour ─────────────────────────────────────────────

test('phase-31: validateRemoteNodes partitions ok and rejected', () => {
  const good = {
    id: 'g', label: 'g', file_type: 'document', source_file: 's',
    fetched_at: '2026-04-17T00:00:00Z',
  };
  const bad = {
    id: 'b', label: 'b', file_type: 'not-a-kind', source_file: 's',
    fetched_at: '2026-04-17T00:00:00Z',
  };
  const { accepted, rejected } = validateRemoteNodes([good, bad, good]);
  assert.strictEqual(accepted.length, 2);
  assert.strictEqual(rejected.length, 1);
  assert.strictEqual(rejected[0].index, 1);
});

// ─── unknown extras are dropped silently (not an error) ─────────

test('phase-31: unknown extra keys are dropped, node still accepted', () => {
  const r = validateRemoteNode({
    id: 'x', label: 'y', file_type: 'document', source_file: 'z',
    fetched_at: '2026-04-17T00:00:00Z',
    some_adapter_specific_key: 'value',
    toJSON: () => 'hijacked', // attempted gadget — not a string, dropped
  });
  assert.ok(r.isOk());
  if (r.isOk()) {
    assert.strictEqual((r.value as Record<string, unknown>).some_adapter_specific_key, undefined);
    assert.strictEqual((r.value as Record<string, unknown>).toJSON, undefined);
  }
});
