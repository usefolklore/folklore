/**
 * Phase 38 — oracle bulletin board (domain + wire).
 *
 * Layer A of the peer-discovery stack. Questions and answers are
 * GraphNodes in the `oracle` system room; propagation is free via
 * touch + CRDT; validator and secret-gate already protect the wire.
 *
 * This file covers the domain surface. Phase35 carries the P2P E2E.
 */

import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';

import type { GraphNode } from '../src/domain/graph.js';
import {
  nodeFromQuestion,
  nodeFromAnswer,
  listQuestions,
  listAnswers,
  questionFromNode,
  answerFromNode,
  isQuestionId,
  isAnswerId,
} from '../src/domain/oracle.js';
import { ORACLE, belongsToSystemRoom, nodesInSystemRoom } from '../src/domain/system-rooms.js';
import { validateRemoteNode } from '../src/domain/remote-node-validator.js';

describe('Phase 38 — oracle domain', () => {
  test('O1: nodeFromQuestion produces a well-shaped question node', () => {
    const q = nodeFromQuestion({
      text: 'What is the fastest way to build a RAG pipeline on CPU only?',
      askedBy: '12D3KooWAlice',
      date: new Date('2026-04-17T00:00:00Z'),
    });
    assert.ok(isQuestionId(q.id));
    assert.strictEqual(q.oracle_kind, 'question');
    assert.strictEqual(q.asked_by, '12D3KooWAlice');
    assert.strictEqual(q.status, 'open');
    assert.strictEqual(q.room, 'oracle');
    assert.strictEqual(q.file_type, 'document');
    assert.strictEqual(q.source_uri, q.id);
    assert.strictEqual(q.fetched_at, '2026-04-17T00:00:00.000Z');
  });

  test('O2: nodeFromAnswer clamps confidence and links to questionId', () => {
    const a = nodeFromAnswer({
      questionId: 'oracle-question:abc',
      text: 'Try fastembed-rs with bge-base — ~75% NDCG on SciFact and ~3.4 docs/sec.',
      answeredBy: '12D3KooWBob',
      confidence: 1.5, // out-of-range → clamped to 1
      date: new Date('2026-04-17T00:00:00Z'),
    });
    assert.ok(isAnswerId(a.id));
    assert.strictEqual(a.oracle_kind, 'answer');
    assert.strictEqual(a.question_id, 'oracle-question:abc');
    assert.strictEqual(a.confidence, 1);
    assert.strictEqual(a.file_type, 'rationale');
  });

  test('O3: questionFromNode / answerFromNode round-trip their constructors', () => {
    const q = nodeFromQuestion({ text: 'Q?', askedBy: 'alice' });
    const a = nodeFromAnswer({ questionId: q.id, text: 'A.', answeredBy: 'bob', confidence: 0.7 });
    const qv = questionFromNode(q);
    const av = answerFromNode(a);
    assert.ok(qv && qv.id === q.id);
    assert.ok(av && av.questionId === q.id && av.confidence === 0.7);

    // Non-oracle nodes are rejected
    const notOracle = { id: 'x', label: 'x', file_type: 'document' as const, source_file: 'x' } as GraphNode;
    assert.strictEqual(questionFromNode(notOracle), undefined);
    assert.strictEqual(answerFromNode(notOracle), undefined);
  });

  test('O4: listQuestions counts answers and sorts newest-first', () => {
    const q1 = nodeFromQuestion({ text: 'first',  askedBy: 'alice', date: new Date('2026-04-10T00:00:00Z') });
    const q2 = nodeFromQuestion({ text: 'second', askedBy: 'alice', date: new Date('2026-04-15T00:00:00Z') });
    const a1 = nodeFromAnswer({ questionId: q1.id, text: 'answer A', answeredBy: 'bob' });
    const a2 = nodeFromAnswer({ questionId: q1.id, text: 'answer B', answeredBy: 'carol', confidence: 0.9 });

    const questions = listQuestions([q1, q2, a1, a2]);
    assert.deepStrictEqual(questions.map((q) => q.label), ['second', 'first']);
    const first = questions.find((q) => q.label === 'first');
    assert.strictEqual(first?.answerCount, 2);
  });

  test('O5: listAnswers sorts by confidence DESC then recency DESC', () => {
    const q = nodeFromQuestion({ text: 'q', askedBy: 'a' });
    const lowConf  = nodeFromAnswer({ questionId: q.id, text: 'l', answeredBy: 'a', confidence: 0.3,
      date: new Date('2026-04-17T00:00:00Z') });
    const highConf = nodeFromAnswer({ questionId: q.id, text: 'h', answeredBy: 'b', confidence: 0.9,
      date: new Date('2026-04-10T00:00:00Z') });
    const unknown  = nodeFromAnswer({ questionId: q.id, text: 'u', answeredBy: 'c',
      date: new Date('2026-04-17T00:00:00Z') });
    const out = listAnswers([q, lowConf, highConf, unknown], q.id);
    assert.deepStrictEqual(out.map((a) => a.text), ['h', 'l', 'u']);
  });

  test('O6: listAnswers filters out answers for other questions', () => {
    const qA = nodeFromQuestion({ text: 'qA', askedBy: 'a' });
    const qB = nodeFromQuestion({ text: 'qB', askedBy: 'a' });
    const aA = nodeFromAnswer({ questionId: qA.id, text: 'for-A', answeredBy: 'x' });
    const aB = nodeFromAnswer({ questionId: qB.id, text: 'for-B', answeredBy: 'y' });
    const out = listAnswers([qA, qB, aA, aB], qA.id);
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].text, 'for-A');
  });

  test('O7: questions + answers belong to the oracle system room by scheme', () => {
    const q = nodeFromQuestion({ text: 'q', askedBy: 'a' });
    const a = nodeFromAnswer({ questionId: q.id, text: 'a', answeredBy: 'b' });
    assert.ok(belongsToSystemRoom(q, ORACLE));
    assert.ok(belongsToSystemRoom(a, ORACLE));
    // nodesInSystemRoom returns both, newest-first
    const out = nodesInSystemRoom([q, a], ORACLE);
    assert.strictEqual(out.length, 2);
  });

  test('O8: oracle nodes cross the remote-node validator (trust boundary)', () => {
    const q = nodeFromQuestion({ text: 'q', askedBy: 'alice' });
    const a = nodeFromAnswer({ questionId: q.id, text: 'long enough answer body', answeredBy: 'bob', confidence: 0.5 });
    const qv = validateRemoteNode(q);
    const av = validateRemoteNode(a);
    assert.ok(qv.isOk(), qv.isErr() ? JSON.stringify(qv.error) : '');
    assert.ok(av.isOk(), av.isErr() ? JSON.stringify(av.error) : '');
  });
});
