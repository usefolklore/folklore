/**
 * LlmExtractor adapters (Phase 23.8) — Ollama backend + deterministic
 * fixture for tests.
 *
 * Port lives at `src/domain/llm-extractor.ts`; this file only
 * contains the infrastructure-side boundary (HTTP, env). The bench
 * suites call `llmExtractorFromEnv()` to materialise an instance
 * without baking Ollama into the test code.
 */

import { ResultAsync, okAsync } from 'neverthrow';
import type { AppError } from '../domain/errors.js';
import type { LlmExtractor, ExtractInput } from '../domain/llm-extractor.js';
import { buildExtractPrompt } from '../domain/llm-extractor.js';
import { ollamaClient, type OllamaClient } from './ollama-client.js';

// ─────────────── ollama adapter ───────────────

export interface OllamaLlmExtractorOptions {
  /** Default `phi3:mini` — small, fast, instruction-tuned. Override via env or this option. */
  readonly model?: string;
  /** Max output tokens — kept tight because extractive answers are short. Default 64. */
  readonly maxTokens?: number;
  /** Sampling temperature. Default 0 (greedy decoding for determinism). */
  readonly temperature?: number;
}

/**
 * Wrap an `OllamaClient` as an `LlmExtractor`. Uses the canonical
 * extraction prompt from `domain/llm-extractor.ts` so behaviour is
 * consistent across adapters.
 *
 * The trailing "--- ANSWER ---" marker in the prompt asks the model
 * to emit just the answer; we still trim conservatively because some
 * small models echo the heading.
 */
export const ollamaLlmExtractor = (
  client: OllamaClient,
  opts: OllamaLlmExtractorOptions = {},
): LlmExtractor => {
  const model = opts.model ?? client.defaultModel;
  const maxTokens = opts.maxTokens ?? 64;
  const temperature = opts.temperature ?? 0;

  return {
    model,
    extract: (input: ExtractInput): ResultAsync<string, AppError> =>
      client.generate(buildExtractPrompt(input), {
        model,
        numPredict: maxTokens,
        temperature,
      }).map((raw) => {
        // Some small models prefix with "Answer:" or echo the marker —
        // strip leading "Answer:", quotes, and the literal heading.
        let out = raw.replace(/^[\s\-]*answer\s*:\s*/i, '');
        out = out.replace(/^---\s*answer\s*---\s*/i, '');
        out = out.replace(/^["'`]+|["'`]+$/g, '');
        return out.trim();
      }),
  };
};

// ─────────────── fixture (tests) ───────────────

export interface FixtureLlmExtractorOptions {
  /** Map of question → canned answer. Lookups are case-sensitive. */
  readonly table?: Readonly<Record<string, string>>;
  /** Returned when the table has no match. */
  readonly fallback?: string;
  /** Model name for audit. Default `fixture://llm-extractor`. */
  readonly model?: string;
}

/**
 * Deterministic LlmExtractor for tests — no network, no I/O. Keyed on
 * the question text; ignores the evidence.
 */
export const fixtureLlmExtractor = (opts: FixtureLlmExtractorOptions = {}): LlmExtractor => {
  const table = opts.table ?? {};
  const fallback = opts.fallback ?? '';
  return {
    model: opts.model ?? 'fixture://llm-extractor',
    extract: ({ question }) =>
      okAsync<string, AppError>(
        Object.prototype.hasOwnProperty.call(table, question) ? table[question] : fallback,
      ),
  };
};

// ─────────────── env factory ───────────────

/**
 * Resolve the project-wide LlmExtractor from environment.
 *
 * Order of precedence:
 *   1. `WELLINFORMED_BENCH_LLM_EXTRACTOR_FIXTURE=1` → fixtureLlmExtractor
 *      (deterministic; for offline bench smoke-tests).
 *   2. Default → ollamaLlmExtractor against `WELLINFORMED_OLLAMA_URL`
 *      (default `http://localhost:11434`). Model from
 *      `WELLINFORMED_BENCH_LLM_EXTRACTOR_MODEL` (default `phi3:mini`).
 *
 * Returns `null` only on misconfiguration; never throws. The bench
 * caller decides how to handle null (fall back to pure-compute
 * containment scoring).
 */
export const llmExtractorFromEnv = (): LlmExtractor | null => {
  if (process.env.WELLINFORMED_BENCH_LLM_EXTRACTOR_FIXTURE === '1') {
    return fixtureLlmExtractor({
      fallback: process.env.WELLINFORMED_BENCH_LLM_EXTRACTOR_FIXTURE_ANSWER ?? '',
    });
  }

  const baseUrl = process.env.WELLINFORMED_OLLAMA_URL;
  const model = process.env.WELLINFORMED_BENCH_LLM_EXTRACTOR_MODEL ?? 'phi3:mini';
  // ollamaClient already defaults baseUrl to localhost — pass through
  // either an explicit override or undefined.
  return ollamaLlmExtractor(
    ollamaClient(baseUrl ? { baseUrl, model } : { model }),
    { model },
  );
};
