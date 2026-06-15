/**
 * Unit tests — Phase 23.11 rerank-tier picker.
 *
 * Covers every cell in the hardware × env decision matrix so a
 * regression in the picker shows up as a clean failure here, not as
 * a slow bench run on the wrong tier.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  pickRerankTier,
  rerankEnvFromProcess,
  formatRerankPlan,
} from '../src/domain/rerank-tier.js';
import type { HwCapabilities } from '../src/infrastructure/hw-detect.js';

// ─────────────── hw fixtures ─────────────

const HW_MIN: HwCapabilities = {
  platform: 'linux', arch: 'arm64', hostname: 'cax11',
  cpuCount: 2, memoryGB: 4, appleSilicon: false,
  hasCuda: false, gpus: [],
  hasOllama: false, ollamaModels: [],
  tier: 'minimal',
};

const HW_CPU: HwCapabilities = {
  ...HW_MIN, tier: 'cpu', memoryGB: 8, cpuCount: 4,
};

const HW_M_NO_OLLAMA: HwCapabilities = {
  platform: 'darwin', arch: 'arm64', hostname: 'mbp',
  cpuCount: 10, memoryGB: 16, appleSilicon: true,
  hasCuda: false, gpus: [],
  hasOllama: false, ollamaModels: [],
  tier: 'accelerated',
};

const HW_M_SMALL_OLLAMA: HwCapabilities = {
  ...HW_M_NO_OLLAMA, hasOllama: true,
  ollamaModels: ['qwen2.5:1.5b', 'phi3:mini'],
};

const HW_M_LARGE_OLLAMA: HwCapabilities = {
  ...HW_M_NO_OLLAMA, hasOllama: true,
  ollamaModels: ['qwen2.5:1.5b', 'qwen2.5:7b', 'gpt-oss:20b'],
};

const HW_GPU: HwCapabilities = {
  platform: 'linux', arch: 'x64', hostname: 'workstation',
  cpuCount: 24, memoryGB: 64, appleSilicon: false,
  hasCuda: true, gpus: ['NVIDIA RTX 4090'],
  hasOllama: true, ollamaModels: ['gpt-oss:20b', 'llama3.1:8b'],
  tier: 'gpu',
};

// ─────────────── master kill-switch ─────────────

test('pickRerankTier: FOLKLORE_RERANK=0 forces none on any hardware', () => {
  const plan = pickRerankTier(HW_GPU, { disabled: true });
  assert.equal(plan.tier, 'none');
  assert.match(plan.reason, /kill-switch/);
});

// ─────────────── explicit env override ─────────────

test('pickRerankTier: explicit override beats hardware default', () => {
  const plan = pickRerankTier(HW_MIN, { override: 'llm-listwise-large' });
  assert.equal(plan.tier, 'llm-listwise-large');
  assert.equal(plan.model, 'gpt-oss:20b');
  assert.match(plan.reason, /override/);
});

test('pickRerankTier: invalid override is ignored, falls back to hw default', () => {
  // Env reader filters invalid values, so test the env-reader path.
  const env = rerankEnvFromProcess({ FOLKLORE_RERANK_TIER: 'bogus' });
  assert.equal(env.override, undefined);
  const plan = pickRerankTier(HW_CPU, env);
  assert.equal(plan.tier, 'cross-encoder');
});

test('pickRerankTier: model override flows into the plan', () => {
  const plan = pickRerankTier(HW_CPU, { modelOverride: 'Xenova/bge-reranker-base' });
  assert.equal(plan.model, 'Xenova/bge-reranker-base');
  assert.equal(plan.tier, 'cross-encoder');
});

test('pickRerankTier: head-size override flows into the plan', () => {
  const plan = pickRerankTier(HW_CPU, { headSizeOverride: 50 });
  assert.equal(plan.headSize, 50);
});

// ─────────────── hardware-tier defaults ─────────────

test('pickRerankTier: minimal hardware (ARM cloud) → cross-encoder', () => {
  const plan = pickRerankTier(HW_MIN);
  assert.equal(plan.tier, 'cross-encoder');
  assert.equal(plan.model, 'Xenova/ms-marco-MiniLM-L-6-v2');
  assert.equal(plan.headSize, 20);
});

test('pickRerankTier: cpu-tier laptop → cross-encoder', () => {
  const plan = pickRerankTier(HW_CPU);
  assert.equal(plan.tier, 'cross-encoder');
});

test('pickRerankTier: Apple Silicon without Ollama → cross-encoder (no LLM endpoint)', () => {
  const plan = pickRerankTier(HW_M_NO_OLLAMA);
  assert.equal(plan.tier, 'cross-encoder');
});

test('pickRerankTier: Apple Silicon + small Ollama → llm-listwise-small', () => {
  const plan = pickRerankTier(HW_M_SMALL_OLLAMA);
  assert.equal(plan.tier, 'llm-listwise-small');
  assert.equal(plan.model, 'qwen2.5:1.5b');
});

test('pickRerankTier: Apple Silicon + gpt-oss → llm-listwise-large', () => {
  const plan = pickRerankTier(HW_M_LARGE_OLLAMA);
  assert.equal(plan.tier, 'llm-listwise-large');
  assert.equal(plan.model, 'gpt-oss:20b');
});

test('pickRerankTier: GPU host → llm-listwise-large', () => {
  const plan = pickRerankTier(HW_GPU);
  assert.equal(plan.tier, 'llm-listwise-large');
});

// ─────────────── latency budget gate ─────────────

test('pickRerankTier: tight latency budget downgrades from large → small on Apple Silicon', () => {
  const plan = pickRerankTier(HW_M_LARGE_OLLAMA, { latencyBudgetMs: 2000 });
  assert.equal(plan.tier, 'llm-listwise-small');
});

test('pickRerankTier: very tight latency budget downgrades to cross-encoder', () => {
  const plan = pickRerankTier(HW_M_LARGE_OLLAMA, { latencyBudgetMs: 500 });
  assert.equal(plan.tier, 'cross-encoder');
});

test('pickRerankTier: latency budget that fits everything stays at large', () => {
  const plan = pickRerankTier(HW_M_LARGE_OLLAMA, { latencyBudgetMs: 10_000 });
  assert.equal(plan.tier, 'llm-listwise-large');
});

// ─────────────── env reader ─────────────

test('rerankEnvFromProcess: parses all env vars', () => {
  const env = rerankEnvFromProcess({
    FOLKLORE_RERANK_TIER: 'llm-listwise-small',
    FOLKLORE_RERANK_MODEL: 'qwen2.5:3b',
    FOLKLORE_RERANK_LATENCY_MS: '2500',
    FOLKLORE_RERANK_HEAD: '40',
    FOLKLORE_RERANK: '1',
  });
  assert.equal(env.override, 'llm-listwise-small');
  assert.equal(env.modelOverride, 'qwen2.5:3b');
  assert.equal(env.latencyBudgetMs, 2500);
  assert.equal(env.headSizeOverride, 40);
  assert.equal(env.disabled, false);
});

test('rerankEnvFromProcess: empty env yields all-undefined plan input', () => {
  const env = rerankEnvFromProcess({});
  assert.equal(env.override, undefined);
  assert.equal(env.modelOverride, undefined);
  assert.equal(env.disabled, false);
});

// ─────────────── render helper ─────────────

test('formatRerankPlan: renders human line for cross-encoder tier', () => {
  const plan = pickRerankTier(HW_CPU);
  const line = formatRerankPlan(plan, HW_CPU);
  assert.match(line, /rerank: cross-encoder/);
  assert.match(line, /ms-marco/);
  assert.match(line, /hw=cpu/);
});

test('formatRerankPlan: renders human line for none', () => {
  const plan = pickRerankTier(HW_GPU, { disabled: true });
  const line = formatRerankPlan(plan, HW_GPU);
  assert.match(line, /rerank: none/);
  assert.match(line, /kill-switch/);
});
