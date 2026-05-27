/**
 * Cross-encoder adapter — Xenova ONNX `Xenova/ms-marco-MiniLM-L-6-v2`.
 *
 * Implements the `CrossEncoderScorer` port from `domain/cross-rerank.ts`.
 * Lazy-loaded singleton: the model is fetched on the first score()
 * call and cached for the process lifetime. Subsequent calls reuse
 * the same pipeline.
 *
 * Pipeline task: `text-classification` with the (query, doc) pair
 * encoded as `${query} [SEP] ${doc}` truncated to the model's 512-
 * token context. The pipeline returns one score per pair which we
 * pass through the domain `rerankMatches` for distance rewriting.
 *
 * Failure mode: this module is fail-open. When the model fails to
 * load (offline + no cache, malformed ONNX, etc.) the score() call
 * returns RerankError.modelLoad(...) and the domain rerank passes
 * the input through unchanged. The caller never sees a hard failure
 * from rerank, only a telemetry signal.
 *
 * Why @xenova/transformers (already a dep):
 *   - ONNX runtime ships embedded, no native compilation
 *   - Quantised int8 variant fits in <30 MB
 *   - CPU-only — no GPU dependency, runs on the same machine as the
 *     daemon
 *   - Same library powers the bi-encoder embedder in `embedders.ts`,
 *     so the dependency surface stays unchanged
 */

import { ResultAsync } from 'neverthrow';
import type { CrossEncoderScorer } from '../domain/cross-rerank.js';
import { RerankError } from '../domain/errors.js';

// ─────────────── options ─────────────

export interface XenovaCrossEncoderOptions {
  /**
   * HuggingFace model id. Default `Xenova/ms-marco-MiniLM-L-6-v2` —
   * the canonical MS-MARCO cross-encoder distilled to a 6-layer
   * MiniLM. ~22 MB quantised. Trained on (query, passage) relevance
   * judgments so it works out-of-the-box for retrieval rerank.
   */
  readonly model?: string;
  /**
   * Cache directory for the downloaded model. Defaults to whatever
   * `@xenova/transformers` uses (`~/.cache/huggingface/...`). Override
   * to keep wellinformed self-contained.
   */
  readonly cacheDir?: string;
  /**
   * Use the int8-quantised ONNX variant. Default `true` — for cross-
   * encoder rerank we care about latency on a 20-pair head batch, and
   * the rerank lift survives quantisation (unlike retrieval embedding
   * which loses 11+ NDCG points on int8 per the audit in
   * `embedders.ts:78-82`). Set to false to use fp32 if you have the
   * RAM and want to ablate.
   */
  readonly quantized?: boolean;
}

// ─────────────── pipeline shape ─────────────

/**
 * Shape of the Xenova text-classification pipeline output. The
 * pipeline returns either a single `{label, score}` object or an
 * array of them; we coerce both forms in `score()`.
 */
interface ClassificationOutput {
  readonly label: string;
  readonly score: number;
}

type ClassificationPipeline = (
  input: string | readonly string[],
  opts?: { topk?: number },
) => Promise<ClassificationOutput | ClassificationOutput[] | ClassificationOutput[][]>;

// ─────────────── adapter ─────────────

/**
 * Build a lazy Xenova-backed cross-encoder scorer.
 *
 * The pipeline is fetched on the first call to `score()` and stays
 * alive for the process lifetime. The promise is memoised so concurrent
 * first-callers share the same load operation.
 */
export const xenovaCrossEncoder = (opts: XenovaCrossEncoderOptions = {}): CrossEncoderScorer => {
  const model = opts.model ?? 'Xenova/ms-marco-MiniLM-L-6-v2';
  const quantized = opts.quantized ?? true;
  let pipePromise: Promise<ClassificationPipeline> | null = null;

  const getPipe = (): ResultAsync<ClassificationPipeline, RerankError> => {
    if (!pipePromise) {
      pipePromise = (async () => {
        const tx = (await import('@xenova/transformers')) as unknown as {
          env: { cacheDir?: string };
          pipeline: (
            task: string,
            modelId: string,
            o?: { quantized?: boolean },
          ) => Promise<ClassificationPipeline>;
        };
        if (opts.cacheDir) tx.env.cacheDir = opts.cacheDir;
        return tx.pipeline('text-classification', model, { quantized });
      })();
    }
    return ResultAsync.fromPromise(pipePromise, (e) =>
      RerankError.modelLoad(model, (e as Error).message),
    );
  };

  const score = (
    query: string,
    docs: readonly string[],
  ): ResultAsync<readonly number[], RerankError> => {
    if (docs.length === 0) return ResultAsync.fromSafePromise(Promise.resolve([] as readonly number[]));
    const pairs = docs.map((d) => buildPair(query, d));
    return getPipe().andThen((pipe) =>
      ResultAsync.fromPromise(pipe(pairs), (e) =>
        RerankError.inference((e as Error).message),
      ).map(coerceScores),
    );
  };

  return { score };
};

// ─────────────── helpers ─────────────

/**
 * Encode a (query, doc) pair for the text-classification pipeline.
 *
 * MS-MARCO cross-encoders are trained on `${query} [SEP] ${doc}`. The
 * pipeline tokenizer handles `[SEP]` natively (BERT-family special
 * token); we just concatenate. Truncation happens inside the pipeline
 * — the 512-token ceiling is non-negotiable for this model class, so
 * we pre-truncate the doc to ~2000 chars to avoid wasting the cross-
 * encoder's context on long bodies (the tokenizer will cut it again).
 *
 * 2000 chars ≈ 500 tokens for English; leaves headroom for the
 * query + [SEP] + special tokens.
 */
const PAIR_CHAR_CAP = 2000;

const buildPair = (query: string, doc: string): string => {
  const truncatedDoc = doc.length > PAIR_CHAR_CAP ? doc.slice(0, PAIR_CHAR_CAP) : doc;
  return `${query} [SEP] ${truncatedDoc}`;
};

/**
 * Normalise the pipeline's polymorphic output into a flat number[].
 *
 * Pipeline shapes observed in `@xenova/transformers` 2.x:
 *   - single string  → `{label, score}`
 *   - string[]       → `{label, score}[]`
 *   - with topk > 1  → `{label, score}[][]`
 *
 * We always call with string[] and no topk, so the expected shape is
 * `{label, score}[]`. The other branches are defensive.
 */
const coerceScores = (
  out: ClassificationOutput | ClassificationOutput[] | ClassificationOutput[][],
): readonly number[] => {
  if (Array.isArray(out)) {
    return out.map((o) => {
      if (Array.isArray(o)) return o[0]?.score ?? 0;
      return o.score;
    });
  }
  return [out.score];
};

// ─────────────── factory ─────────────

/**
 * Resolve the project-wide cross-encoder scorer from env.
 *
 * Returns `null` when the reranker is disabled — the application
 * layer treats null as "skip rerank, pass through". Enabling requires
 * `WELLINFORMED_RERANK=1` explicitly; the rerank pass is opt-in
 * because it adds 30-80 ms of latency for a 20-pair head.
 */
export const crossEncoderFromEnv = (): CrossEncoderScorer | null => {
  if (process.env.WELLINFORMED_RERANK !== '1') return null;
  return xenovaCrossEncoder({
    model: process.env.WELLINFORMED_RERANK_MODEL,
    cacheDir: process.env.WELLINFORMED_RERANK_CACHE,
    quantized: process.env.WELLINFORMED_RERANK_FP32 !== '1',
  });
};
