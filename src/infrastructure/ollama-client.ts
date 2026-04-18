/**
 * Thin Ollama HTTP client — the infrastructure boundary for any
 * module that needs a local LLM call. Used by the Phase 4c
 * consolidator wiring; also reusable for future Contextual Retrieval
 * passes, HyDE query expansion, etc.
 *
 * No state, no classes. A factory returns a closure that holds the
 * base URL + default model + default options. All calls return
 * ResultAsync over a narrow error type.
 *
 * Intentionally minimal — just `generate` (non-streaming) for now.
 * Streaming + embed are v4.1 additions when we need them.
 */

import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import type { AppError } from '../domain/errors.js';

// ─────────────── types ───────────────

export interface OllamaClientOptions {
  /** Base URL, e.g. `http://localhost:11434`. */
  readonly baseUrl?: string;
  /** Default model name, e.g. `qwen2.5:1.5b`. Can be overridden per-call. */
  readonly model?: string;
  /** Per-request timeout (ms). Default 120_000 — LLM generation can be slow. */
  readonly timeoutMs?: number;
  /** Per-request retry count on transient failures. Default 3. */
  readonly retries?: number;
  /** Injected fetch — primarily for tests. Default: global `fetch`. */
  readonly fetchImpl?: typeof fetch;
}

export interface GenerateOptions {
  /** Overrides the client-default model for this call. */
  readonly model?: string;
  /** Max output tokens. Default 256. */
  readonly numPredict?: number;
  /** Sampling temperature. Default 0.2 (favor determinism for consolidation). */
  readonly temperature?: number;
  /** Top-p sampling. Default 0.9. */
  readonly topP?: number;
}

export interface OllamaClient {
  readonly baseUrl: string;
  readonly defaultModel: string;
  /** One-shot generation — non-streaming. */
  generate(prompt: string, opts?: GenerateOptions): ResultAsync<string, AppError>;
  /** Health probe — resolves with the Ollama version string. */
  ping(): ResultAsync<string, AppError>;
}

// ─────────────── implementation ───────────────

const DEFAULTS = {
  baseUrl: 'http://localhost:11434',
  model: 'qwen2.5:1.5b',
  timeoutMs: 120_000,
  retries: 3,
  numPredict: 256,
  temperature: 0.2,
  topP: 0.9,
};

/**
 * Construct an Ollama client. The base URL defaults to localhost;
 * override via WELLINFORMED_OLLAMA_URL at the runtime layer.
 */
export const ollamaClient = (opts: OllamaClientOptions = {}): OllamaClient => {
  const baseUrl = (opts.baseUrl ?? process.env.WELLINFORMED_OLLAMA_URL ?? DEFAULTS.baseUrl).replace(/\/$/, '');
  const defaultModel = opts.model ?? process.env.WELLINFORMED_OLLAMA_MODEL ?? DEFAULTS.model;
  const timeoutMs = opts.timeoutMs ?? DEFAULTS.timeoutMs;
  const retries = Math.max(1, opts.retries ?? DEFAULTS.retries);
  const fetchImpl = opts.fetchImpl ?? fetch;

  const generate = (prompt: string, genOpts: GenerateOptions = {}): ResultAsync<string, AppError> => {
    const model = genOpts.model ?? defaultModel;
    const numPredict = genOpts.numPredict ?? DEFAULTS.numPredict;
    const temperature = genOpts.temperature ?? DEFAULTS.temperature;
    const topP = genOpts.topP ?? DEFAULTS.topP;

    const url = `${baseUrl}/api/generate`;
    const body = JSON.stringify({
      model,
      prompt,
      stream: false,
      options: { num_predict: numPredict, temperature, top_p: topP },
    });

    return ResultAsync.fromPromise(
      (async () => {
        let lastError: Error | null = null;
        for (let attempt = 1; attempt <= retries; attempt++) {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);
          try {
            const res = await fetchImpl(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body,
              signal: controller.signal,
            });
            if (!res.ok) {
              const text = await res.text().catch(() => '');
              throw new Error(`Ollama ${res.status}: ${text.slice(0, 200)}`);
            }
            const json = await res.json() as { response?: string; error?: string };
            if (json.error) throw new Error(`Ollama error: ${json.error}`);
            if (typeof json.response !== 'string') throw new Error('Ollama response missing `response` field');
            return json.response.trim();
          } catch (e) {
            lastError = e as Error;
            if (attempt < retries) {
              await new Promise((r) => setTimeout(r, 250 * attempt));
              continue;
            }
            throw lastError;
          } finally {
            clearTimeout(timer);
          }
        }
        // Unreachable — the loop either returns or throws.
        throw lastError ?? new Error('ollama: exhausted retries');
      })(),
      (e): AppError => ({
        type: 'EmbeddingError' as never,
        message: `ollama generate: ${(e as Error).message}`,
      } as unknown as AppError),
    );
  };

  const ping = (): ResultAsync<string, AppError> =>
    ResultAsync.fromPromise(
      (async () => {
        const res = await fetchImpl(`${baseUrl}/api/version`, { method: 'GET' });
        if (!res.ok) throw new Error(`Ollama /api/version ${res.status}`);
        const json = await res.json() as { version?: string };
        return json.version ?? 'unknown';
      })(),
      (e): AppError => ({
        type: 'EmbeddingError' as never,
        message: `ollama ping: ${(e as Error).message}`,
      } as unknown as AppError),
    );

  // Suppress the unused-import linter on `errAsync` / `okAsync` — we
  // keep them in scope for future streaming extensions.
  void errAsync; void okAsync;

  return { baseUrl, defaultModel, generate, ping };
};
