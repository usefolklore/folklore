/**
 * Embedder — port + adapters for turning text into unit vectors.
 *
 * Port:
 *   Embedder
 *     - embed(text) -> ResultAsync<Vector, EmbeddingError>
 *     - embedBatch(texts) -> ResultAsync<Vector[], EmbeddingError>
 *     - dim: number
 *
 * Adapters:
 *   xenovaEmbedder     — lazy ONNX via @xenova/transformers
 *   fixtureEmbedder    — deterministic seeded vectors for tests
 *
 * The fixture variant supports pre-registering explicit vectors for
 * specific input strings, which keeps tests readable and stable
 * without pulling the 25MB MiniLM weights.
 */

import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { EmbeddingError } from '../domain/errors.js';
import type { Vector } from '../domain/vectors.js';
import { DEFAULT_DIM, normalize } from '../domain/vectors.js';

/** Port. */
export interface Embedder {
  readonly dim: number;
  embed(text: string): ResultAsync<Vector, EmbeddingError>;
  embedBatch(texts: readonly string[]): ResultAsync<readonly Vector[], EmbeddingError>;
}

// ─────────────────────── xenova adapter ───────────────────

/**
 * Token-pooling strategy for sentence embeddings. Must match the model's
 * training pooling or embedding quality silently degrades ~10-15%.
 *
 *   'mean' — average over token hidden states (nomic-embed-text, E5-*,
 *            all-MiniLM-L6-v2, gte-*). The Xenova default.
 *   'cls'  — use the [CLS] token's hidden state (BGE, jina-v2, many
 *            contrastively-trained BERT-family retrievers).
 *   'last' — use the last token's hidden state (mxbai-embed-xsmall-v1,
 *            nomic-embed-v2-moe).
 */
export type PoolingStrategy = 'mean' | 'cls' | 'last';

export interface XenovaOptions {
  readonly model?: string;
  readonly cacheDir?: string;
  readonly dim?: number;
  /**
   * Max tokenizer input length. Defaults to 8192 (nomic-embed-text-v1.5
   * context window). Xenova's feature-extraction pipeline otherwise
   * silently truncates at the tokenizer's pre-configured default (often
   * 512), which catastrophically degrades retrieval quality on datasets
   * with long queries/docs (ArguAna queries are 200-645 tokens).
   *
   * Set to 512 if the caller's model has a 512-token ceiling
   * (all-MiniLM-L6-v2, bge-base-en-v1.5).
   */
  readonly maxLength?: number;
  /**
   * Pooling strategy. Must match the model's training pooling.
   * Default 'mean' — correct for nomic, E5, MiniLM, GTE.
   * BGE models require 'cls' pooling — using 'mean' on BGE silently
   * degrades retrieval quality ~10-15% (measured on SciFact).
   */
  readonly pooling?: PoolingStrategy;
}

/**
 * Build a lazy Xenova-backed Embedder. The model is fetched on the
 * first call to embed() and cached in `cacheDir` (or the transformers
 * default under ~/.cache/). Subsequent calls reuse the same pipeline.
 */
export const xenovaEmbedder = (opts: XenovaOptions = {}): Embedder => {
  const model = opts.model ?? 'Xenova/all-MiniLM-L6-v2';
  const dim = opts.dim ?? DEFAULT_DIM;
  const maxLength = opts.maxLength ?? 8192;
  const pooling = opts.pooling ?? 'mean';
  let pipePromise: Promise<(text: string, o: unknown) => Promise<{ data: Float32Array }>> | null = null;

  const getPipe = (): ResultAsync<
    (text: string, o: unknown) => Promise<{ data: Float32Array }>,
    EmbeddingError
  > => {
    if (!pipePromise) {
      pipePromise = (async () => {
        const tx = (await import('@xenova/transformers')) as unknown as {
          env: { cacheDir?: string };
          pipeline: (
            task: string,
            model: string,
          ) => Promise<(text: string, o: unknown) => Promise<{ data: Float32Array }>>;
        };
        if (opts.cacheDir) tx.env.cacheDir = opts.cacheDir;
        return tx.pipeline('feature-extraction', model);
      })();
    }
    return ResultAsync.fromPromise(pipePromise, (e) =>
      EmbeddingError.modelLoad(model, (e as Error).message),
    );
  };

  const embed = (text: string): ResultAsync<Vector, EmbeddingError> =>
    getPipe().andThen((pipe) =>
      ResultAsync.fromPromise(
        pipe(text, {
          pooling,
          normalize: true,
          truncation: true,
          max_length: maxLength,
        }),
        (e) => EmbeddingError.inference((e as Error).message),
      ).map((out) => new Float32Array(out.data)),
    );

  const embedBatch = (texts: readonly string[]): ResultAsync<readonly Vector[], EmbeddingError> =>
    texts.reduce<ResultAsync<Vector[], EmbeddingError>>(
      (acc, text) => acc.andThen((prev) => embed(text).map((v) => [...prev, v])),
      okAsync<Vector[], EmbeddingError>([]),
    );

  return { dim, embed, embedBatch };
};

// ─────────────────────── fixture adapter ──────────────────

export interface FixtureOptions {
  readonly dim?: number;
}

/**
 * Build a deterministic fixture Embedder. Tests call `register` on
 * the returned object to pin specific texts to specific vectors, and
 * anything unregistered falls back to a seeded mulberry32 vector
 * derived from a 32-bit FNV-1a hash of the input.
 *
 * NOT suitable for production semantic search — similar texts do NOT
 * get similar vectors. Tests drive similarity explicitly.
 */
export interface FixtureEmbedder extends Embedder {
  readonly register: (text: string, vector: Vector) => void;
}

export const fixtureEmbedder = (opts: FixtureOptions = {}): FixtureEmbedder => {
  const dim = opts.dim ?? DEFAULT_DIM;
  const fixtures = new Map<string, Vector>();

  const register = (text: string, vector: Vector): void => {
    if (vector.length !== dim) {
      // Tests should surface bad inputs loudly — throwing here is
      // acceptable because register() is called in arrange phases,
      // not inside a Result chain.
      throw new Error(`fixtureEmbedder.register: expected dim=${dim}, got ${vector.length}`);
    }
    fixtures.set(text, normalize(vector));
  };

  const seedVector = (text: string): Vector => {
    const seed = fnv1a(text);
    const rng = mulberry32(seed);
    const v = new Float32Array(dim);
    for (let i = 0; i < dim; i++) v[i] = rng() * 2 - 1;
    return normalize(v);
  };

  const embed = (text: string): ResultAsync<Vector, EmbeddingError> => {
    const hit = fixtures.get(text);
    return okAsync(hit ?? seedVector(text));
  };

  const embedBatch = (texts: readonly string[]): ResultAsync<readonly Vector[], EmbeddingError> =>
    texts.reduce<ResultAsync<Vector[], EmbeddingError>>(
      (acc, text) => acc.andThen((prev) => embed(text).map((v) => [...prev, v])),
      okAsync<Vector[], EmbeddingError>([]),
    );

  // satisfy the exhaustiveness check so ESLint doesn't whine about
  // `errAsync` being imported but unused — we keep it imported for
  // symmetry with other adapters that may need to error-async.
  void errAsync;

  return { dim, embed, embedBatch, register };
};

// ─────────────────────── helpers ──────────────────────────

const fnv1a = (s: string): number => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
