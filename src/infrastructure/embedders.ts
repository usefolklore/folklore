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
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { dirname, join } from 'node:path';
import * as readline from 'node:readline';
import { fileURLToPath } from 'node:url';
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
  /**
   * Whether to use the int8-quantized ONNX variant (Xenova transformers 2.x
   * default) or the full-precision fp32 model. Default `false` — force full
   * precision.
   *
   * Xenova publishes ~8 ONNX variants per model (fp32, fp16, int8, bnb4, q4,
   * q4f16, uint8, quantized). The transformers.js 2.x default is
   * `quantized: true` which loads the int8 variant. On retrievers this
   * costs **11-13 NDCG@10 points** on BEIR (measured on bge-base and nomic).
   * Unless you have a strong size/latency reason, use full precision.
   */
  readonly quantized?: boolean;
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
  const quantized = opts.quantized ?? false;
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
            opts?: { quantized?: boolean },
          ) => Promise<(text: string, o: unknown) => Promise<{ data: Float32Array }>>;
        };
        if (opts.cacheDir) tx.env.cacheDir = opts.cacheDir;
        return tx.pipeline('feature-extraction', model, { quantized });
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

// ─────────────────────── rust-subprocess adapter ──────────

/**
 * Options for the Rust subprocess embedder — Phase 24 of v2.1.
 *
 * Spawns the `wellinformed-rs/target/release/embed_server` binary on
 * first use and streams embedding requests through its stdio JSON-RPC
 * protocol. Exists because Xenova/bge-base-en-v1.5 is a measured-
 * defective ONNX conversion (-11 NDCG@10 on BEIR SciFact vs published);
 * the Rust binary loads fastembed-rs which uses Qdrant-curated ONNX
 * weights that match the published ceiling within 0.66 NDCG points.
 *
 * For nomic and MiniLM the Xenova ports are correct and either route
 * works equivalently.
 */
export interface RustSubprocessOptions {
  /** Short model name: 'nomic' | 'bge-base' | 'minilm'. */
  readonly model: 'nomic' | 'bge-base' | 'minilm';
  /** Output dimension — must match the model. */
  readonly dim: number;
  /**
   * Path to the embed_server binary. Defaults to the repo-local
   * `wellinformed-rs/target/release/embed_server`; override via
   * `$WELLINFORMED_RUST_BIN` env var or this option.
   */
  readonly binaryPath?: string;
  /** Treat texts as queries (embed with query prefix). */
  readonly isQuery?: boolean;
}

interface RustRequest {
  readonly op: 'embed' | 'ping' | 'shutdown';
  readonly model?: string;
  readonly texts?: readonly string[];
  readonly is_query?: boolean;
  readonly raw?: boolean;
}

interface RustResponse {
  readonly ok: boolean;
  readonly dim?: number;
  readonly vectors?: readonly (readonly number[])[];
  readonly error?: string;
  readonly version?: string;
}

/**
 * Build an Embedder that proxies every embedding call to a long-lived
 * Rust subprocess speaking JSON-lines. One request in flight at a time
 * (serialized via a promise queue) — simplest correct shape.
 *
 * The subprocess is spawned lazily on the first call and stays alive
 * until the Node process exits. No connection pooling, no retry logic
 * beyond propagating errors as neverthrow Err results.
 */
export const rustSubprocessEmbedder = (opts: RustSubprocessOptions): Embedder => {
  const binaryPath =
    opts.binaryPath ??
    process.env.WELLINFORMED_RUST_BIN ??
    // Default path assumes the repo layout: wellinformed-rs is a sibling
    // of src/. Resolve relative to this file's directory.
    (() => {
      const here = dirname(fileURLToPath(import.meta.url));
      // dist/infrastructure/embedders.js → dist/infrastructure → ../.. → repo root
      return join(here, '..', '..', 'wellinformed-rs', 'target', 'release', 'embed_server');
    })();

  let child: ChildProcessWithoutNullStreams | null = null;
  // Serial request queue — each request pushes a resolver, each response
  // shifts the head resolver off the queue. FIFO, single-flight.
  const pending: Array<(res: RustResponse) => void> = [];
  let initPromise: Promise<void> | null = null;

  const ensureStarted = (): ResultAsync<void, EmbeddingError> => {
    if (child && !child.killed) return okAsync(undefined);
    if (!initPromise) {
      initPromise = new Promise<void>((resolve, reject) => {
        try {
          const spawned = spawn(binaryPath, [], {
            stdio: ['pipe', 'pipe', 'pipe'],
          });
          spawned.on('error', (e) => reject(e));
          spawned.on('exit', (code) => {
            child = null;
            // Fail any still-pending resolvers
            while (pending.length > 0) {
              const resolver = pending.shift();
              if (resolver) {
                resolver({
                  ok: false,
                  error: `embed_server exited with code ${code}`,
                });
              }
            }
          });
          spawned.stderr.setEncoding('utf8');
          spawned.stderr.on('data', () => {
            // Rust server prints startup lines + exit msg to stderr.
            // Silently absorb — not an error channel for the protocol.
          });

          readline.createInterface({ input: spawned.stdout }).on('line', (line) => {
            const resolver = pending.shift();
            if (!resolver) return;
            try {
              resolver(JSON.parse(line) as RustResponse);
            } catch (e) {
              resolver({
                ok: false,
                error: `stdout parse: ${(e as Error).message}  line: ${line.slice(0, 200)}`,
              });
            }
          });

          child = spawned;
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    }
    return ResultAsync.fromPromise(initPromise, (e) =>
      EmbeddingError.modelLoad(opts.model, (e as Error).message),
    );
  };

  const sendRequest = (req: RustRequest): ResultAsync<RustResponse, EmbeddingError> =>
    ensureStarted().andThen(() =>
      ResultAsync.fromPromise(
        new Promise<RustResponse>((resolve) => {
          pending.push(resolve);
          child?.stdin.write(`${JSON.stringify(req)}\n`);
        }),
        (e) => EmbeddingError.inference((e as Error).message),
      ).andThen((resp) =>
        resp.ok
          ? okAsync<RustResponse, EmbeddingError>(resp)
          : errAsync<RustResponse, EmbeddingError>(
              EmbeddingError.inference(resp.error ?? 'rust embed_server returned ok:false'),
            ),
      ),
    );

  const embed = (text: string): ResultAsync<Vector, EmbeddingError> =>
    sendRequest({
      op: 'embed',
      model: opts.model,
      texts: [text],
      is_query: opts.isQuery ?? false,
    }).andThen((resp) => {
      const vecs = resp.vectors;
      if (!vecs || vecs.length === 0) {
        return errAsync<Vector, EmbeddingError>(
          EmbeddingError.inference('empty vectors from rust embed_server'),
        );
      }
      return okAsync<Vector, EmbeddingError>(new Float32Array(vecs[0]));
    });

  const embedBatch = (
    texts: readonly string[],
  ): ResultAsync<readonly Vector[], EmbeddingError> =>
    sendRequest({
      op: 'embed',
      model: opts.model,
      texts,
      is_query: opts.isQuery ?? false,
    }).andThen((resp) => {
      const vecs = resp.vectors;
      if (!vecs) {
        return errAsync<readonly Vector[], EmbeddingError>(
          EmbeddingError.inference('no vectors from rust embed_server'),
        );
      }
      return okAsync<readonly Vector[], EmbeddingError>(
        vecs.map((v) => new Float32Array(v)),
      );
    });

  return { dim: opts.dim, embed, embedBatch };
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
