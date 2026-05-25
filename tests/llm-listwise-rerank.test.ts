/**
 * Phase 23.12 — unit tests for the LLM-listwise reranker.
 *
 * Pure-domain tests using the fixture scorer (no Ollama dependency).
 * Verifies the rerank algorithm's order-folding + fail-open behaviour
 * and the response-parser's robustness against LLM drift.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { okAsync } from 'neverthrow';

import {
  rerankMatchesListwise,
  parseListwiseResponse,
  buildListwisePrompt,
} from '../src/domain/llm-listwise-rerank.js';
import {
  fixtureListwiseScorer,
} from '../src/infrastructure/llm-listwise-rerank.js';
import type { Match } from '../src/domain/vectors.js';

// ─────────────── helpers ─────────────

const mk = (id: string, distance: number): Match => ({
  node_id: id,
  distance,
});

const docTextOf = (textMap: Record<string, string>) => (m: Match): string | undefined =>
  textMap[String(m.node_id)];

// ─────────────── parser ─────────────

test('parseListwiseResponse: extracts canonical RANKING: line', () => {
  const ids = new Set(['a1', 'b2', 'c3']);
  const out = parseListwiseResponse('RANKING: c3, a1, b2', ids);
  assert.deepEqual(out, ['c3', 'a1', 'b2']);
});

test('parseListwiseResponse: case-insensitive RANKING prefix', () => {
  const ids = new Set(['a1', 'b2']);
  const out = parseListwiseResponse('ranking: a1, b2', ids);
  assert.deepEqual(out, ['a1', 'b2']);
});

test('parseListwiseResponse: tolerates arrow-style ranking', () => {
  const ids = new Set(['x', 'y', 'z']);
  const out = parseListwiseResponse('RANKING: y > x > z', ids);
  assert.deepEqual(out, ['y', 'x', 'z']);
});

test('parseListwiseResponse: tolerates numbered-list output', () => {
  const ids = new Set(['x', 'y', 'z']);
  const out = parseListwiseResponse('RANKING:\n1. y\n2. x\n3. z', ids);
  assert.deepEqual(out, ['y', 'x', 'z']);
});

test('parseListwiseResponse: drops hallucinated / out-of-range ids', () => {
  const ids = new Set(['a', 'b']);
  const out = parseListwiseResponse('RANKING: a, hallucinated_id, b', ids);
  assert.deepEqual(out, ['a', 'b']);
});

test('parseListwiseResponse: dedupes repeated ids', () => {
  const ids = new Set(['a', 'b', 'c']);
  const out = parseListwiseResponse('RANKING: a, b, a, c, b', ids);
  assert.deepEqual(out, ['a', 'b', 'c']);
});

test('parseListwiseResponse: tolerates id=value form', () => {
  const ids = new Set(['session-1', 'session-2']);
  const out = parseListwiseResponse('RANKING: id=session-2, id=session-1', ids);
  assert.deepEqual(out, ['session-2', 'session-1']);
});

test('parseListwiseResponse: returns [] on garbage input', () => {
  assert.deepEqual(parseListwiseResponse('completely unrelated text', new Set(['a'])), []);
  assert.deepEqual(parseListwiseResponse('', new Set(['a'])), []);
  assert.deepEqual(parseListwiseResponse(null as unknown as string, new Set(['a'])), []);
});

test('parseListwiseResponse: parses when no RANKING prefix but format is clean', () => {
  const ids = new Set(['a', 'b', 'c']);
  const out = parseListwiseResponse('c, b, a', ids);
  assert.deepEqual(out, ['c', 'b', 'a']);
});

// ─────────────── prompt builder ─────────────

test('buildListwisePrompt: contains query + every candidate id + RANKING directive', () => {
  const prompt = buildListwisePrompt({
    query: 'find docs about marathons',
    candidates: [
      { id: 'doc-1', text: 'Berlin marathon training.' },
      { id: 'doc-2', text: 'Quantum mechanics.' },
    ],
    topK: 2,
  });
  assert.ok(prompt.includes('find docs about marathons'));
  assert.ok(prompt.includes('id=doc-1'));
  assert.ok(prompt.includes('id=doc-2'));
  assert.ok(prompt.includes('Berlin marathon training.'));
  assert.ok(/RANKING:/i.test(prompt));
});

// ─────────────── rerank algorithm ─────────────

test('rerankMatchesListwise: empty matches → empty output', async () => {
  const scorer = fixtureListwiseScorer({ fallback: [] });
  const r = await rerankMatchesListwise('q', [], () => undefined, scorer);
  assert.ok(r.isOk());
  assert.deepEqual(r._unsafeUnwrap(), []);
});

test('rerankMatchesListwise: scorer returns its order → matches reorder', async () => {
  const matches = [mk('a', 0.1), mk('b', 0.2), mk('c', 0.3)];
  const textMap = { a: 'doc-a text', b: 'doc-b text', c: 'doc-c text' };
  const scorer = fixtureListwiseScorer({
    table: { 'q1': ['c', 'a', 'b'] },
  });
  const r = await rerankMatchesListwise('q1', matches, docTextOf(textMap), scorer);
  assert.ok(r.isOk());
  const out = r._unsafeUnwrap();
  assert.deepEqual(out.map((m) => m.node_id), ['c', 'a', 'b']);
});

test('rerankMatchesListwise: tail past headSize stays in bi-encoder order', async () => {
  const matches = [
    mk('h1', 0.1), mk('h2', 0.2), mk('h3', 0.3),
    mk('t1', 0.4), mk('t2', 0.5),  // beyond headSize=3
  ];
  const textMap = { h1: 'x', h2: 'y', h3: 'z', t1: 'tail-1', t2: 'tail-2' };
  const scorer = fixtureListwiseScorer({
    table: { 'q': ['h3', 'h1', 'h2'] },
  });
  const r = await rerankMatchesListwise('q', matches, docTextOf(textMap), scorer, { headSize: 3 });
  const out = r._unsafeUnwrap();
  assert.deepEqual(out.map((m) => m.node_id), ['h3', 'h1', 'h2', 't1', 't2']);
});

test('rerankMatchesListwise: matches with no text bypass the LLM and append after the ranked head', async () => {
  const matches = [
    mk('a', 0.1), mk('b', 0.2), mk('c', 0.3),
  ];
  // `b` has no text → bypass the LLM, append after the ranked set.
  const textMap = { a: 'a-text', c: 'c-text' };
  const scorer = fixtureListwiseScorer({
    table: { 'q': ['c', 'a'] },
  });
  const r = await rerankMatchesListwise('q', matches, docTextOf(textMap), scorer);
  const out = r._unsafeUnwrap();
  // `c, a` ranked first; `b` (no text) appended.
  assert.deepEqual(out.map((m) => m.node_id), ['c', 'a', 'b']);
});

test('rerankMatchesListwise: scorer returns partial list → unranked head items appended in original order', async () => {
  const matches = [mk('a', 0.1), mk('b', 0.2), mk('c', 0.3)];
  const textMap = { a: 'a-text', b: 'b-text', c: 'c-text' };
  // LLM only returns the top 2; `b` should be appended in original order.
  const scorer = fixtureListwiseScorer({
    table: { 'q': ['c', 'a'] },
  });
  const r = await rerankMatchesListwise('q', matches, docTextOf(textMap), scorer);
  const out = r._unsafeUnwrap();
  assert.deepEqual(out.map((m) => m.node_id), ['c', 'a', 'b']);
});

test('rerankMatchesListwise: scorer returns empty → algorithm fail-opens, returns input', async () => {
  const matches = [mk('a', 0.1), mk('b', 0.2)];
  const textMap = { a: 'x', b: 'y' };
  const scorer = fixtureListwiseScorer({ fallback: [] });
  const r = await rerankMatchesListwise('unregistered-q', matches, docTextOf(textMap), scorer);
  // Empty ranking → all head-with-text items appended in original
  // order; same effect as a passthrough.
  const out = r._unsafeUnwrap();
  assert.deepEqual(out.map((m) => m.node_id), ['a', 'b']);
});

test('rerankMatchesListwise: candidate text is truncated to maxCharsPerCandidate', async () => {
  const longText = 'x'.repeat(2000);
  let lastInput: { candidates: ReadonlyArray<{ id: string; text: string }> } | null = null;
  const matches = [mk('a', 0.1)];
  const textMap = { a: longText };
  const scorer = {
    model: 'spy',
    score: (input: { candidates: ReadonlyArray<{ id: string; text: string }> }) => {
      lastInput = input;
      return okAsync<readonly string[], unknown>(['a']);
    },
  } as unknown as Parameters<typeof rerankMatchesListwise>[3];
  await rerankMatchesListwise('q', matches, docTextOf(textMap), scorer, { maxCharsPerCandidate: 100 });
  assert.ok(lastInput !== null);
  const truncated = (lastInput as { candidates: ReadonlyArray<{ id: string; text: string }> }).candidates[0].text;
  // 100 chars + ellipsis = 101 chars.
  assert.equal(truncated.length, 101);
  assert.ok(truncated.endsWith('…'));
});

// ─────────────── fixture scorer ─────────────

test('fixtureListwiseScorer: table hit returns the registered ordering', async () => {
  const scorer = fixtureListwiseScorer({ table: { 'find marathon': ['d2', 'd1'] } });
  const r = await scorer.score({
    query: 'find marathon',
    candidates: [{ id: 'd1', text: 'a' }, { id: 'd2', text: 'b' }],
    topK: 2,
  });
  assert.deepEqual(r._unsafeUnwrap(), ['d2', 'd1']);
});

test('fixtureListwiseScorer: miss falls through to fallback', async () => {
  const scorer = fixtureListwiseScorer({ fallback: ['x'] });
  const r = await scorer.score({
    query: 'anything',
    candidates: [{ id: 'x', text: 'a' }],
    topK: 1,
  });
  assert.deepEqual(r._unsafeUnwrap(), ['x']);
});

test('fixtureListwiseScorer: model identifier exposed', () => {
  assert.equal(fixtureListwiseScorer().model, 'fixture://llm-listwise');
});
