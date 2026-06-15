/**
 * Summariser — port + adapters for the long-term memory consolidation
 * + tier-promotion pipeline (Phase 21B).
 *
 * Port:
 *   Summariser
 *     - summarise(system, user, opts?) -> ResultAsync<string, AppError>
 *     - model: string  // for audit / provenance pinning
 *
 * Adapters:
 *   ollamaSummariser     — wraps the existing `ollamaClient`
 *   fixtureSummariser    — deterministic table-driven, for tests
 *   summariserFromEnv()  — factory that picks an adapter from env
 *
 * Why a new port instead of using `ollamaClient` directly:
 *   - Multiple call sites need summarisation: episodic→semantic
 *     promotion, semantic→procedural pattern mining, contradiction
 *     resolution, GSW operator (Phase 22). All share the same shape;
 *     they shouldn't hard-bind to Ollama.
 *   - BYO API key options (OpenAI, Anthropic, Gemini) plug in here
 *     without touching call sites.
 *   - Tests need a deterministic fixture; coupling to ollamaClient
 *     would force every consolidation test to mock fetch.
 *
 * The `system` / `user` split mirrors the OpenAI / Anthropic chat
 * shape because that's the most expressive substrate — Ollama-only
 * adapters concatenate them into one prompt.
 */

import { ResultAsync, okAsync } from 'neverthrow';
import type { AppError } from '../domain/errors.js';
import { ConsolidationError } from '../domain/errors.js';
import type { OllamaClient } from './ollama-client.js';

// ─────────────── port ─────────────

export interface SummariseOptions {
  /** Max output tokens. Defaults vary by adapter. */
  readonly maxTokens?: number;
  /** Sampling temperature. Default 0.2 — favour determinism. */
  readonly temperature?: number;
  /** Per-request timeout (ms). Default 60_000. */
  readonly timeoutMs?: number;
}

export interface Summariser {
  /** Model identifier — `qwen2.5:1.5b`, `gpt-4o-mini`, etc. Persisted on consolidated memories for replay-staleness checks. */
  readonly model: string;
  summarise(
    system: string,
    user: string,
    opts?: SummariseOptions,
  ): ResultAsync<string, AppError>;
}

// ─────────────── ollama adapter ─────────────

/**
 * Wrap an `OllamaClient` as a `Summariser`. Ollama has no built-in
 * system/user split (it's a single-prompt completion API), so we
 * concatenate with a clear separator that local models trained on
 * chat-style data still respect.
 *
 * The model field is whatever `ollamaClient.defaultModel` is — set
 * via `FOLKLORE_OLLAMA_MODEL` or the OllamaClientOptions.model.
 */
export const ollamaSummariser = (client: OllamaClient): Summariser => ({
  model: client.defaultModel,
  summarise: (system, user, opts = {}) => {
    const prompt = system
      ? `${system}\n\n--- USER ---\n${user}`
      : user;
    return client.generate(prompt, {
      numPredict: opts.maxTokens ?? 256,
      temperature: opts.temperature ?? 0.2,
    });
  },
});

// ─────────────── fixture (tests) ─────────────

export interface FixtureSummariserOptions {
  /** Map of `user`-prompt → canned response. Lookups are case-sensitive. */
  readonly table?: Record<string, string>;
  /** Returned when the table has no match for the user prompt. */
  readonly fallback?: string;
  /** When set, every summarise() call returns this Err instead. */
  readonly error?: AppError;
  /** Optional model name for audit. Default `fixture://summariser`. */
  readonly model?: string;
}

/**
 * Build a deterministic summariser keyed on the `user` prompt text.
 *
 * Test scenarios:
 *   - happy path: register exact user-prompts → expected summaries
 *   - failure: pass `error` to simulate a backend outage
 *   - generic: omit table; every call returns `fallback`
 */
export const fixtureSummariser = (opts: FixtureSummariserOptions = {}): Summariser => {
  const table = opts.table ?? {};
  const fallback = opts.fallback ?? 'fixture-summary';
  return {
    model: opts.model ?? 'fixture://summariser',
    summarise: (_system, user) => {
      if (opts.error) {
        return ResultAsync.fromPromise(
          Promise.reject(opts.error),
          (e) => e as AppError,
        );
      }
      const hit = Object.prototype.hasOwnProperty.call(table, user)
        ? table[user]
        : fallback;
      return okAsync(hit);
    },
  };
};

// ─────────────── env factory ─────────────

/**
 * Resolve the project-wide summariser from environment.
 *
 * Order of precedence:
 *   1. `FOLKLORE_SUMMARISER=fixture` → fixtureSummariser (tests)
 *   2. `FOLKLORE_SUMMARISER=ollama` OR ollama unset OR default →
 *      ollamaSummariser (local, free, privacy-preserving). The caller
 *      passes the OllamaClient so we don't bake a default URL here.
 *   3. (Future) `OPENAI_API_KEY` set → OpenAI adapter — Phase 21C.
 *   4. (Future) `ANTHROPIC_API_KEY` set → Anthropic adapter — Phase 21C.
 *
 * Returns `null` when no adapter is configured AND no ollama client
 * is supplied — caller decides whether to fail-loud or fall through
 * to a fixture. This null path is the integration-bypass for tests
 * that don't want to spin up a real backend.
 */
export const summariserFromEnv = (
  opts: { readonly ollama?: OllamaClient } = {},
): Summariser | null => {
  const choice = (process.env.FOLKLORE_SUMMARISER ?? '').toLowerCase();
  if (choice === 'fixture') {
    return fixtureSummariser({
      fallback: process.env.FOLKLORE_SUMMARISER_FIXTURE ?? 'fixture-summary',
    });
  }
  if (opts.ollama) return ollamaSummariser(opts.ollama);
  return null;
};

// ─────────────── helper: AppError factory for summariser-specific failures ─────────────

/**
 * Wrap a free-form error from inside an adapter as a typed AppError
 * via the ConsolidationError union. Saves callers from importing the
 * constructor manually.
 */
export const summariserInfraError = (message: string): AppError =>
  ConsolidationError.invalidParameter('summariser', message);
