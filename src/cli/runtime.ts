/**
 * CLI runtime helpers — one place that builds the live dependency
 * graph (graph repo, vector index, embedder, sources config,
 * registry) from the user's environment. Commands pull from here.
 *
 * Pure factories, no global state. Each command calls the builder
 * it needs and passes the result to the application-layer use cases.
 */

import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ResultAsync, errAsync } from 'neverthrow';
import type { AppError } from '../domain/errors.js';
import { fileGraphRepository, type GraphRepository } from '../infrastructure/graph-repository.js';
import { openSqliteVectorIndex, type VectorIndex } from '../infrastructure/vector-index.js';
import {
  xenovaEmbedder,
  rustSubprocessEmbedder,
  batchingEmbedder,
  type Embedder,
} from '../infrastructure/embedders.js';
import { fileSourcesConfig, type SourcesConfig } from '../infrastructure/sources-config.js';
import { httpFetcher, type HttpFetcher } from '../infrastructure/http/fetcher.js';
import { xmlParser, type XmlParserPort } from '../infrastructure/parsers/xml-parser.js';
import { readabilityExtractor, type HtmlExtractor } from '../infrastructure/parsers/html-extractor.js';
import { sourceRegistry, type SourceRegistry } from '../infrastructure/sources/registry.js';
import { loadConfig } from '../infrastructure/config-loader.js';
import { buildPatterns } from '../domain/sharing.js';
import { asyncMutex, type AsyncMutex } from '../infrastructure/async-mutex.js';
import { fileEntityRegistry, type EntityRegistry } from '../infrastructure/entity-registry.js';
import { extractMentions } from '../domain/entity-extract.js';
import type { IngestDeps, MentionsExtractorPort } from '../application/ingest.js';

/**
 * V5 workspace detection — replaces the deleted rooms abstraction for
 * read-side pre-filtering. Returns a slugged form of the cwd's git
 * toplevel basename, or undefined when cwd is not in a git repo.
 *
 * Used by `ask`, `save`, `recall`, `report` (Wave 3 surgical edits)
 * to scope queries/writes to the current workspace by default.
 * Pass `--workspace all` from the CLI to opt out.
 *
 * Local-only — never enters the federation wire envelope.
 */
const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63);

export const detectWorkspace = (cwd: string = process.cwd()): string | undefined => {
  try {
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!top) return undefined;
    return slugify(basename(top));
  } catch {
    return undefined;
  }
};

export const wellinformedHome = (): string =>
  process.env.WELLINFORMED_HOME ?? join(homedir(), '.wellinformed');

/**
 * Parse the binary-quantization env toggle.
 *   WELLINFORMED_VECTOR_QUANTIZATION=binary-512   → returns 512
 *   WELLINFORMED_VECTOR_QUANTIZATION=binary-256   → returns 256
 *   (unset | 'fp32' | anything else)              → returns undefined
 *
 * When set to a supported value, the VectorIndex opens with Matryoshka-
 * binary storage alongside fp32 and searchHybrid dispatches through the
 * Hamming-ranked path (Phase 3 of the v4 plan). When unset, behavior is
 * identical to v3. Invalid values silently fall back to fp32 — the
 * VectorIndex validates the dim further and coerces unsupported values
 * to null.
 */
export const parseQuantizationEnv = (): number | undefined => {
  const raw = process.env.WELLINFORMED_VECTOR_QUANTIZATION;
  if (!raw) return undefined;
  const m = /^binary-(\d+)$/i.exec(raw.trim());
  if (!m) return undefined;
  const dim = parseInt(m[1], 10);
  if (!Number.isFinite(dim)) return undefined;
  return dim;
};

/**
 * Build the live Embedder adapter based on environment configuration.
 *
 * Backends (selected by `WELLINFORMED_EMBEDDER_BACKEND`):
 *   'xenova'  — legacy `@xenova/transformers` in-process ONNX. Default.
 *               Known defective on bge-base-en-v1.5 (-11 NDCG vs published);
 *               correct on nomic-embed-text-v1.5 and all-MiniLM-L6-v2.
 *   'rust'    — spawns the `wellinformed-rs` embed_server binary and
 *               streams batches over stdio JSON-RPC. Uses fastembed-rs
 *               which pulls Qdrant-curated ONNX conversions that match
 *               the published BEIR ceilings within noise.
 *
 * Rust backend options (all optional, sensible defaults):
 *   WELLINFORMED_EMBEDDER_MODEL   — 'minilm' | 'nomic' | 'bge-base'
 *   WELLINFORMED_RUST_BIN         — path to embed_server binary
 *
 * This is a factory, not a global — each call constructs a fresh
 * adapter. No singletons, no shared mutable state.
 */
export const buildEmbedder = (modelCache: string): Embedder => {
  const backend = (process.env.WELLINFORMED_EMBEDDER_BACKEND ?? 'xenova').toLowerCase();

  // Phase 2 — coalescing batch decorator. Transparent to callers;
  // individual `.embed()` calls (e.g. from indexNode) get queued and
  // flushed as a single `embedBatch()` against the underlying encoder.
  // Measured 3.1× throughput on the live wellinformed stack via
  // scripts/bench-embed-throughput.mjs (bge-base, N=32: serial 8.56
  // docs/sec → batched 26.56 docs/sec).
  //
  // Opt-out via WELLINFORMED_EMBEDDER_BATCH=off for the serial path
  // (useful for comparisons or if the batching window ever interferes
  // with a latency-sensitive caller). Defaults to enabled.
  const batchingEnabled = (process.env.WELLINFORMED_EMBEDDER_BATCH ?? 'on').toLowerCase() !== 'off';
  const batchSize = parseInt(process.env.WELLINFORMED_EMBEDDER_BATCH_SIZE ?? '32', 10) || 32;
  const batchWaitMs = parseInt(process.env.WELLINFORMED_EMBEDDER_BATCH_MS ?? '20', 10) || 20;

  const base: Embedder = (() => {
    if (backend === 'rust') {
      const model = (process.env.WELLINFORMED_EMBEDDER_MODEL ?? 'minilm').toLowerCase();
      const dim =
        model === 'minilm' ? 384 : model === 'nomic' || model === 'bge-base' ? 768 : 384;
      if (model !== 'minilm' && model !== 'nomic' && model !== 'bge-base') {
        throw new Error(
          `WELLINFORMED_EMBEDDER_MODEL='${model}' — supported: minilm, nomic, bge-base`,
        );
      }
      return rustSubprocessEmbedder({ model, dim });
    }
    return xenovaEmbedder({ cacheDir: modelCache });
  })();

  return batchingEnabled
    ? batchingEmbedder(base, { maxBatch: batchSize, flushAfterMs: batchWaitMs })
    : base;
};

export interface RuntimePaths {
  readonly home: string;
  readonly graph: string;
  readonly vectors: string;
  readonly sources: string;
  readonly modelCache: string;
  readonly codeGraph: string;
}

export const runtimePaths = (): RuntimePaths => {
  const home = wellinformedHome();
  return {
    home,
    graph: join(home, 'graph.json'),
    vectors: join(home, 'vectors.db'),
    sources: join(home, 'sources.json'),
    modelCache: join(home, 'models'),
    codeGraph: join(home, 'code-graph.db'),
  };
};

/** The minimal dependency set used by every command. Lazily constructed. */
export interface Runtime {
  readonly paths: RuntimePaths;
  readonly graphs: GraphRepository;
  readonly vectors: VectorIndex;
  readonly embedder: Embedder;
  readonly sources: SourcesConfig;
  readonly http: HttpFetcher;
  readonly xml: XmlParserPort;
  readonly html: HtmlExtractor;
  readonly registry: SourceRegistry;
  /**
   * Canonical entity store. Source of truth for entity metadata —
   * label, aliases, type, mention_count, first_seen, last_seen.
   * Graph nodes with kind:'entity' are stubs; the renderer joins
   * here on read. Single-write boundary; ingest pipeline only
   * touches it via the MentionsExtractorPort.
   */
  readonly entityRegistry: EntityRegistry;
  /** A convenience packet of the fields ingest.ts needs. */
  readonly ingestDeps: IngestDeps;
  /**
   * In-process write serialization. Shared by daemon tick + job
   * worker; either side that does load → mutate → save on the
   * graph wraps its critical section in
   * `runtime.graphMutex.runExclusive(async () => { ... })` to close
   * the lost-update window across in-process concurrent writers.
   */
  readonly graphMutex: AsyncMutex;
  /** Release native resources (sqlite) */
  close(): void;
}

/**
 * Build the default runtime — opens sqlite, constructs all adapters,
 * hands back everything the CLI commands need. Call once per command
 * invocation.
 *
 * Loads config.yaml for secrets patterns (passed to the claude-sessions
 * source adapter for pre-ingest redaction). loadConfig returns typed
 * defaults when the file does not exist — it never fails on a missing file.
 */
export const defaultRuntime = (): ResultAsync<Runtime, AppError> => {
  const paths = runtimePaths();
  const cfgPath = join(paths.home, 'config.yaml');

  // V5 cutover (Phase 24): the boot path no longer reads or writes
  // the old room registry or share-policy files. The rooms
  // abstraction was deleted entirely — see ROOMS-DEL-02.

  return loadConfig(cfgPath)
    .mapErr((e): AppError => e)
    .andThen((cfg) =>
      openSqliteVectorIndex({
        path: paths.vectors,
        binaryDim: parseQuantizationEnv(),
        binaryOnly: (process.env.WELLINFORMED_VECTOR_FP32_DROP ?? '').toLowerCase() === 'true',
      })
        .mapErr((e): AppError => e)
        .map((vectors): Runtime => {
          const graphs = fileGraphRepository(paths.graph);
          const embedder = buildEmbedder(paths.modelCache);
          const sources = fileSourcesConfig(paths.sources);
          const http = httpFetcher();
          const xml = xmlParser();
          const html = readabilityExtractor();
          const registry = sourceRegistry({
            http,
            xml,
            html,
            claudeSessions: {
              homePath: paths.home,
              patterns: buildPatterns(cfg.security.secrets_patterns),
              scanUserMessages: cfg.sessions.scan_user_messages,
              nowMs: () => Date.now(),
            },
          });
          const graphMutex = asyncMutex();

          // Entity registry — canonical store for entity metadata.
          // Wired into the ingest pipeline via the MentionsExtractor
          // port so the application layer doesn't need to import
          // infrastructure/entity-registry directly.
          const entityRegistry = fileEntityRegistry(join(paths.home, 'entities.json'));
          const mentionsExtractor: MentionsExtractorPort = {
            extract: (text: string) =>
              extractMentions(text, {
                resolveAlias: (s) => entityRegistry.resolve(s),
                autoRegister: (input) => entityRegistry.register(input),
              }),
            touchMany: (counts) => { entityRegistry.touchMany(counts); },
          };

          const ingestDeps: IngestDeps = {
            graphs, vectors, embedder, sources, registry,
            graphMutex, mentionsExtractor,
          };
          return {
            paths,
            graphs,
            vectors,
            embedder,
            sources,
            http,
            xml,
            html,
            registry,
            entityRegistry,
            ingestDeps,
            graphMutex,
            close: () => vectors.close(),
          };
        }),
    );
};

// Silence strict-linting on the unused errAsync import — kept for
// parity with other runtime files that may grow error branches.
void errAsync;
