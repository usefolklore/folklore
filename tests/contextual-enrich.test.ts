/**
 * Unit tests — Phase 23.9 (E11) rule-based contextual enrichment.
 *
 * Verifies the pure-domain `enrichText` builder produces a stable,
 * caller-friendly prefix; empty/missing meta is a no-op; list caps
 * are enforced; whitespace and CRLF in fields gets normalised.
 *
 * Bench-level wiring is exercised by the skip-path of the
 * bench-{longmemeval,locomo}-real suites — those don't load the
 * Xenova model when WELLINFORMED_BENCH_PUBLIC_REAL is unset, so the
 * enrichment branch can't be unit-tested via them. Here we test the
 * compose function in isolation.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { enrichText, isContextualEnrichEnabled } from '../src/domain/contextual-enrich.js';

// ─────────────── no-op ─────────────

test('enrichText: empty meta returns body unchanged', () => {
  assert.equal(enrichText('hello world', {}), 'hello world');
  assert.equal(enrichText('', {}), '');
});

test('enrichText: all-empty-string meta returns body unchanged', () => {
  assert.equal(
    enrichText('body', { date: '', sessionId: '', participants: [], tags: [], entities: [] }),
    'body',
  );
});

test('enrichText: handles non-string text input defensively', () => {
  assert.equal(enrichText(undefined as unknown as string, { date: '2026-05-21' }), '[date: 2026-05-21]\n');
  assert.equal(enrichText(null as unknown as string, { date: '2026-05-21' }), '[date: 2026-05-21]\n');
});

// ─────────────── single fields ─────────────

test('enrichText: date only', () => {
  assert.equal(
    enrichText('session content', { date: '2026-05-21T14:00:00Z' }),
    '[date: 2026-05-21T14:00:00Z]\nsession content',
  );
});

test('enrichText: sessionId only', () => {
  assert.equal(
    enrichText('content', { sessionId: 'alice-d3' }),
    '[session: alice-d3]\ncontent',
  );
});

test('enrichText: participants only — dedupes case-insensitively', () => {
  const out = enrichText('content', { participants: ['Alice', 'alice', 'Bob', 'BOB'] });
  // Both alice and bob should appear once, preserving original case from first occurrence.
  assert.match(out, /^\[participants: Alice, Bob\]/);
});

test('enrichText: tags only', () => {
  assert.equal(
    enrichText('content', { tags: ['marathon', 'berlin'] }),
    '[tags: marathon, berlin]\ncontent',
  );
});

test('enrichText: entities only', () => {
  assert.equal(
    enrichText('content', { entities: ['Tesla', 'Mountain View'] }),
    '[entities: Tesla, Mountain View]\ncontent',
  );
});

// ─────────────── combined fields ─────────────

test('enrichText: full meta renders in fixed order date → session → participants → tags → entities', () => {
  const out = enrichText('body', {
    date: '2026-05-21',
    sessionId: 'D1',
    participants: ['Alice'],
    tags: ['locomo'],
    entities: ['Berlin'],
  });
  assert.equal(
    out,
    '[date: 2026-05-21] [session: D1] [participants: Alice] [tags: locomo] [entities: Berlin]\nbody',
  );
});

// ─────────────── normalisation ─────────────

test('enrichText: collapses internal whitespace + CRLF in fields', () => {
  const out = enrichText('body', {
    date: '  2026-05-21\r\n14:00  ',
    sessionId: ' alice\nd3 ',
    participants: ['  Alice  ', '\tBob\t'],
  });
  assert.equal(out, '[date: 2026-05-21 14:00] [session: alice d3] [participants: Alice, Bob]\nbody');
});

// ─────────────── caps ─────────────

test('enrichText: caps participants at 8', () => {
  const ps = Array.from({ length: 20 }, (_, i) => `Person${i + 1}`);
  const out = enrichText('body', { participants: ps });
  const list = out.match(/participants: ([^\]]+)\]/)?.[1] ?? '';
  assert.equal(list.split(', ').length, 8);
  assert.equal(list.split(', ')[0], 'Person1');
  assert.equal(list.split(', ')[7], 'Person8');
});

test('enrichText: caps tags at 8 and entities at 12', () => {
  const ts = Array.from({ length: 20 }, (_, i) => `tag${i + 1}`);
  const es = Array.from({ length: 20 }, (_, i) => `entity${i + 1}`);
  const out = enrichText('body', { tags: ts, entities: es });
  const tagList = out.match(/tags: ([^\]]+)\]/)?.[1] ?? '';
  const entList = out.match(/entities: ([^\]]+)\]/)?.[1] ?? '';
  assert.equal(tagList.split(', ').length, 8);
  assert.equal(entList.split(', ').length, 12);
});

test('enrichText: filters non-string elements from lists', () => {
  const out = enrichText('body', {
    participants: ['Alice', null as unknown as string, 42 as unknown as string, 'Bob', ''],
  });
  assert.equal(out, '[participants: Alice, Bob]\nbody');
});

// ─────────────── env gate ─────────────

test('isContextualEnrichEnabled: gated by WELLINFORMED_BENCH_CONTEXTUAL_ENRICH=1', () => {
  const prior = process.env.WELLINFORMED_BENCH_CONTEXTUAL_ENRICH;
  try {
    delete process.env.WELLINFORMED_BENCH_CONTEXTUAL_ENRICH;
    assert.equal(isContextualEnrichEnabled(), false);
    process.env.WELLINFORMED_BENCH_CONTEXTUAL_ENRICH = '0';
    assert.equal(isContextualEnrichEnabled(), false);
    process.env.WELLINFORMED_BENCH_CONTEXTUAL_ENRICH = '1';
    assert.equal(isContextualEnrichEnabled(), true);
  } finally {
    if (prior === undefined) {
      delete process.env.WELLINFORMED_BENCH_CONTEXTUAL_ENRICH;
    } else {
      process.env.WELLINFORMED_BENCH_CONTEXTUAL_ENRICH = prior;
    }
  }
});
