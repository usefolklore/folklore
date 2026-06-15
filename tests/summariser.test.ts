/**
 * Unit tests — Summariser port + adapters (Phase 21B).
 *
 * Pure unit tests against the fixture adapter and a stub ollama
 * client. No network. Locks:
 *   - fixture table lookup + fallback
 *   - fixture error propagation
 *   - ollama wrapping concatenates system + user with separator
 *   - summariserFromEnv() respects FOLKLORE_SUMMARISER=fixture
 *   - summariserFromEnv() falls back to ollama adapter when client passed
 *   - summariserFromEnv() returns null when no config + no client
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { okAsync } from 'neverthrow';
import {
  fixtureSummariser,
  ollamaSummariser,
  summariserFromEnv,
  type Summariser,
} from '../src/infrastructure/summariser.js';
import type { OllamaClient } from '../src/infrastructure/ollama-client.js';
import { ConsolidationError, type AppError } from '../src/domain/errors.js';

// ─────────────── fixture adapter ─────────────

test('fixtureSummariser: table hit returns canned response', async () => {
  const s = fixtureSummariser({ table: { 'q1': 'a1', 'q2': 'a2' } });
  const r = await s.summarise('system', 'q1');
  assert.ok(r.isOk());
  assert.equal(r._unsafeUnwrap(), 'a1');
});

test('fixtureSummariser: table miss returns fallback', async () => {
  const s = fixtureSummariser({ fallback: 'default' });
  const r = await s.summarise('sys', 'unknown');
  assert.equal(r._unsafeUnwrap(), 'default');
});

test('fixtureSummariser: error opt propagates as AppError', async () => {
  const err: AppError = ConsolidationError.invalidParameter('test', 'simulated');
  const s = fixtureSummariser({ error: err });
  const r = await s.summarise('sys', 'q');
  assert.ok(r.isErr());
  assert.deepEqual(r._unsafeUnwrapErr(), err);
});

test('fixtureSummariser: model field present for audit', () => {
  const s = fixtureSummariser({ model: 'my-fixture' });
  assert.equal(s.model, 'my-fixture');
});

// ─────────────── ollama adapter ─────────────

test('ollamaSummariser: concatenates system + user with separator', async () => {
  let capturedPrompt = '';
  const stub: OllamaClient = {
    baseUrl: 'http://localhost:11434',
    defaultModel: 'qwen2.5:1.5b',
    generate: (prompt) => {
      capturedPrompt = prompt;
      return okAsync('summary out');
    },
    ping: () => okAsync('0.1.0'),
  };
  const s = ollamaSummariser(stub);
  const r = await s.summarise('You are a summariser.', 'Distill these notes.');
  assert.ok(r.isOk());
  assert.equal(r._unsafeUnwrap(), 'summary out');
  assert.ok(capturedPrompt.includes('You are a summariser.'));
  assert.ok(capturedPrompt.includes('--- USER ---'));
  assert.ok(capturedPrompt.includes('Distill these notes.'));
});

test('ollamaSummariser: passes maxTokens + temperature through to client', async () => {
  let capturedOpts: { numPredict?: number; temperature?: number } = {};
  const stub: OllamaClient = {
    baseUrl: 'http://localhost:11434',
    defaultModel: 'qwen2.5:1.5b',
    generate: (_prompt, opts) => {
      capturedOpts = opts ?? {};
      return okAsync('ok');
    },
    ping: () => okAsync('0.1.0'),
  };
  const s = ollamaSummariser(stub);
  await s.summarise('sys', 'user', { maxTokens: 512, temperature: 0.5 });
  assert.equal(capturedOpts.numPredict, 512);
  assert.equal(capturedOpts.temperature, 0.5);
});

test('ollamaSummariser: model reflects client.defaultModel', () => {
  const stub: OllamaClient = {
    baseUrl: 'http://localhost:11434',
    defaultModel: 'phi-3.5-mini',
    generate: () => okAsync(''),
    ping: () => okAsync(''),
  };
  assert.equal(ollamaSummariser(stub).model, 'phi-3.5-mini');
});

// ─────────────── env factory ─────────────

const withEnv = async <T>(env: Record<string, string | undefined>, fn: () => T | Promise<T>): Promise<T> => {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) {
    saved[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  try {
    return await fn();
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
};

test('summariserFromEnv: FOLKLORE_SUMMARISER=fixture → fixture adapter', async () => {
  await withEnv(
    { FOLKLORE_SUMMARISER: 'fixture', FOLKLORE_SUMMARISER_FIXTURE: 'env-default' },
    async () => {
      const s = summariserFromEnv();
      assert.ok(s !== null);
      const r = await (s as Summariser).summarise('sys', 'anything');
      assert.equal(r._unsafeUnwrap(), 'env-default');
    },
  );
});

test('summariserFromEnv: no env + ollama supplied → ollama adapter', async () => {
  await withEnv({ FOLKLORE_SUMMARISER: undefined }, () => {
    const stub: OllamaClient = {
      baseUrl: 'x',
      defaultModel: 'q2',
      generate: () => okAsync(''),
      ping: () => okAsync(''),
    };
    const s = summariserFromEnv({ ollama: stub });
    assert.ok(s !== null);
    assert.equal((s as Summariser).model, 'q2');
  });
});

test('summariserFromEnv: no env + no ollama → null', async () => {
  await withEnv({ FOLKLORE_SUMMARISER: undefined }, () => {
    assert.equal(summariserFromEnv(), null);
  });
});
