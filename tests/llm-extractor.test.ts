/**
 * Unit tests — Phase 23.8 LLM extractor + SQuAD-style F1 scorer.
 *
 * Pure-compute (no Ollama call): exercises the SQuAD normalisation,
 * F1 / EM under the canonical edge cases from the official evaluator
 * (whitespace, articles, punctuation, multiset overlap), and the
 * fixtureLlmExtractor adapter that mirrors the Ollama adapter's
 * interface without touching the network.
 *
 * Skipped Ollama smoke-test: the live `ollamaLlmExtractor` only runs
 * when `WELLINFORMED_BENCH_LLM_EXTRACTOR=1` and a reachable Ollama is
 * configured — it lives inside the bench-locomo-real suite, not here.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  squadF1,
  squadExactMatch,
  normalizeAnswer,
  buildExtractPrompt,
} from '../src/domain/llm-extractor.js';
import { fixtureLlmExtractor } from '../src/infrastructure/llm-extractor.js';

// ─────────────── normalisation ───────────────

test('normalizeAnswer: lowercases, strips articles + punctuation, collapses ws', () => {
  assert.equal(normalizeAnswer('The Tesla Model 3.'), 'tesla model 3');
  assert.equal(normalizeAnswer('  A   QUICK ,   brown fox '), 'quick brown fox');
  assert.equal(normalizeAnswer('an apple-tree!'), 'apple tree');
  assert.equal(normalizeAnswer('27,500'), '27 500');
  assert.equal(normalizeAnswer(''), '');
});

test('normalizeAnswer: handles non-string input gracefully', () => {
  assert.equal(normalizeAnswer(undefined as unknown as string), '');
  assert.equal(normalizeAnswer(null as unknown as string), '');
});

// ─────────────── SQuAD-F1 ───────────────

test('squadF1: identical answers score 1.0', () => {
  assert.equal(squadF1('Berlin marathon', 'Berlin marathon'), 1);
  assert.equal(squadF1('Berlin marathon', 'the BERLIN marathon!'), 1);
});

test('squadF1: zero overlap → 0', () => {
  assert.equal(squadF1('Paris', 'Berlin marathon'), 0);
  assert.equal(squadF1('', 'Berlin marathon'), 0);
  assert.equal(squadF1('Berlin marathon', ''), 0);
});

test('squadF1: both empty → 1 (matches SQuAD yes/no handling)', () => {
  assert.equal(squadF1('', ''), 1);
});

test('squadF1: partial overlap computes correct precision-recall', () => {
  // predicted = ['berlin', 'marathon', 'sept', '28'] (4 tokens)
  // gold      = ['berlin', 'marathon', 'september', '28'] (4 tokens)
  // overlap   = {berlin, marathon, 28} = 3
  // precision = 3/4 = 0.75, recall = 3/4 = 0.75, F1 = 0.75
  const f1 = squadF1('Berlin marathon Sept 28', 'Berlin marathon September 28');
  assert.ok(Math.abs(f1 - 0.75) < 1e-9, `expected ~0.75, got ${f1}`);
});

test('squadF1: multiset overlap — duplicate tokens count per occurrence', () => {
  // predicted ['the', 'cat', 'cat'] → norm ['cat', 'cat'] (articles stripped)
  // gold      ['the', 'cat']         → norm ['cat']
  // overlap = min(2, 1) = 1; precision = 1/2 = 0.5; recall = 1/1 = 1
  // F1 = 2 * 0.5 * 1 / 1.5 = 0.6667
  const f1 = squadF1('the cat cat', 'the cat');
  assert.ok(Math.abs(f1 - (2 / 3)) < 1e-9, `expected ~0.667, got ${f1}`);
});

test('squadExactMatch: 1 iff normalised strings match exactly', () => {
  assert.equal(squadExactMatch('Berlin marathon', 'Berlin marathon'), 1);
  assert.equal(squadExactMatch('The Berlin Marathon!', 'berlin   marathon'), 1);
  assert.equal(squadExactMatch('Berlin marathon Sept 28', 'Berlin marathon September 28'), 0);
});

// ─────────────── extract prompt ───────────────

test('buildExtractPrompt: contains question + evidence + abstention guard', () => {
  const prompt = buildExtractPrompt({
    question: 'What color is the bike?',
    evidence: 'Bob bought a red road bike on day 25.',
  });
  assert.ok(prompt.includes('What color is the bike?'));
  assert.ok(prompt.includes('Bob bought a red road bike'));
  assert.ok(/I don't know/i.test(prompt), 'prompt must instruct the model on abstention');
  assert.ok(/--- ANSWER ---/i.test(prompt), 'prompt must end with answer marker');
});

test('buildExtractPrompt: truncates very long evidence to keep small models in their context budget', () => {
  const longEvidence = 'lorem '.repeat(5000);  // ~30k chars
  const prompt = buildExtractPrompt({ question: 'q', evidence: longEvidence });
  assert.ok(prompt.length < longEvidence.length + 1000, `prompt should be truncated (got ${prompt.length} chars)`);
  assert.ok(prompt.includes('…'), 'truncation marker must be present');
});

// ─────────────── fixture extractor ───────────────

test('fixtureLlmExtractor: table lookup hits return canned answer', async () => {
  const ex = fixtureLlmExtractor({
    table: { 'what is the bike color?': 'red' },
    fallback: 'I don\'t know.',
  });
  const r = await ex.extract({ question: 'what is the bike color?', evidence: 'irrelevant' });
  assert.ok(r.isOk());
  assert.equal(r._unsafeUnwrap(), 'red');
});

test('fixtureLlmExtractor: misses fall through to fallback', async () => {
  const ex = fixtureLlmExtractor({ fallback: 'fallback-answer' });
  const r = await ex.extract({ question: 'anything', evidence: '' });
  assert.equal(r._unsafeUnwrap(), 'fallback-answer');
});

test('fixtureLlmExtractor: model field reports the fixture identifier', () => {
  const ex = fixtureLlmExtractor();
  assert.equal(ex.model, 'fixture://llm-extractor');
});
