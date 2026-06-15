/**
 * Phase 23.12 — LLM-listwise reranker, infrastructure adapters.
 *
 * Implements the `ListwiseScorer` port from
 * `domain/llm-listwise-rerank.ts`. Two adapters:
 *
 *   - `ollamaListwiseScorer` — wraps an `OllamaClient`. Production path.
 *     Picks the model from env / options; default `qwen2.5:1.5b` (small
 *     tier) per the rerank-tier picker.
 *
 *   - `fixtureListwiseScorer` — deterministic, table-driven. Tests
 *     pin (query → ordering) without touching the network.
 *
 * Env factory `listwiseScorerFromEnv()` materialises the right adapter
 * based on the rerank-tier picker's plan + the existing
 * `FOLKLORE_BENCH_LLM_EXTRACTOR_*` env namespace (extended here
 * for the rerank path).
 */

import { ResultAsync, okAsync } from 'neverthrow';
import type { AppError } from '../domain/errors.js';
import { RerankError } from '../domain/errors.js';
import {
  buildListwisePrompt,
  parseListwiseResponse,
  type ListwiseScorer,
  type ListwiseScorerInput,
} from '../domain/llm-listwise-rerank.js';
import { ollamaClient, type OllamaClient } from './ollama-client.js';

// ─────────────── ollama adapter ─────────────

export interface OllamaListwiseScorerOptions {
  /** Model identifier — `qwen2.5:1.5b` (default), `gpt-oss:20b`, etc. */
  readonly model?: string;
  /**
   * Max tokens to generate. The output is a short ID list — usually
   * <100 tokens — but small LLMs sometimes pad with explanation. 256
   * keeps the parser robust.
   */
  readonly maxTokens?: number;
  /** Sampling temperature. Default 0 (greedy decoding for determinism). */
  readonly temperature?: number;
}

/**
 * Build a listwise scorer backed by Ollama. The model loads on first
 * call and stays resident; subsequent calls reuse the loaded weights.
 * On any error (model unavailable, timeout, parse failure) we return
 * a `RerankError` and the algorithm's `.orElse` fail-open kicks in.
 */
export const ollamaListwiseScorer = (
  client: OllamaClient,
  opts: OllamaListwiseScorerOptions = {},
): ListwiseScorer => {
  const model = opts.model ?? client.defaultModel;
  const maxTokens = opts.maxTokens ?? 256;
  const temperature = opts.temperature ?? 0;

  return {
    model,
    score: (input: ListwiseScorerInput): ResultAsync<readonly string[], RerankError> => {
      const prompt = buildListwisePrompt(input);
      const validIds = new Set(input.candidates.map((c) => c.id));

      return client
        .generate(prompt, { model, numPredict: maxTokens, temperature })
        .mapErr((e: AppError): RerankError =>
          RerankError.inference(`ollama listwise: ${(e as { message?: string }).message ?? 'unknown'}`),
        )
        .andThen((raw) => {
          const ordered = parseListwiseResponse(raw, validIds);
          if (ordered.length === 0) {
            return ResultAsync.fromPromise(
              Promise.reject(RerankError.inference(`listwise parse: empty ranking from ${model}`)),
              (e) => e as RerankError,
            );
          }
          return okAsync<readonly string[], RerankError>(ordered);
        });
    },
  };
};

// ─────────────── fixture (tests) ─────────────

export interface FixtureListwiseScorerOptions {
  /** Map from query string → ordered list of candidate IDs. */
  readonly table?: Readonly<Record<string, readonly string[]>>;
  /** Returned when the table has no match for the input query. */
  readonly fallback?: readonly string[];
  /** Model identifier for audit. Default `fixture://llm-listwise`. */
  readonly model?: string;
}

/**
 * Deterministic ListwiseScorer for tests — keyed on the query string.
 * Returns the registered ordering, optionally falling back to a fixed
 * ordering when the query is unregistered.
 */
export const fixtureListwiseScorer = (opts: FixtureListwiseScorerOptions = {}): ListwiseScorer => {
  const table = opts.table ?? {};
  const fallback = opts.fallback ?? [];
  return {
    model: opts.model ?? 'fixture://llm-listwise',
    score: (input) => {
      const hit = Object.prototype.hasOwnProperty.call(table, input.query)
        ? table[input.query]
        : fallback;
      return okAsync<readonly string[], RerankError>(hit);
    },
  };
};

// ─────────────── env factory ─────────────

export interface ListwiseFactoryOptions {
  /** Optional override — caller-supplied model. Wins over env. */
  readonly model?: string;
  /** Reusable client — share with other Ollama users in-process. */
  readonly client?: OllamaClient;
}

/**
 * Resolve a listwise scorer from environment.
 *
 *   FOLKLORE_LLM_RERANK=1       master on/off (off by default)
 *   FOLKLORE_LLM_RERANK_MODEL   Ollama tag (default `qwen2.5:1.5b`)
 *   FOLKLORE_OLLAMA_URL         endpoint (default localhost:11434)
 *
 * Returns `null` when the master switch is off — caller passes through
 * to the cross-encoder path (or no rerank).
 */
export const listwiseScorerFromEnv = (
  opts: ListwiseFactoryOptions = {},
): ListwiseScorer | null => {
  if (process.env.FOLKLORE_LLM_RERANK !== '1') return null;
  const model = opts.model ?? process.env.FOLKLORE_LLM_RERANK_MODEL ?? 'qwen2.5:1.5b';
  const client = opts.client ?? ollamaClient({ model });
  return ollamaListwiseScorer(client, { model });
};
