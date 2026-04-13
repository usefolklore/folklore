/**
 * CLI runtime helpers — one place that builds the live dependency
 * graph (graph repo, vector index, embedder, sources config,
 * registry) from the user's environment. Commands pull from here.
 *
 * Pure factories, no global state. Each command calls the builder
 * it needs and passes the result to the application-layer use cases.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { ResultAsync, errAsync } from 'neverthrow';
import type { AppError } from '../domain/errors.js';
import { fileGraphRepository, type GraphRepository } from '../infrastructure/graph-repository.js';
import { openSqliteVectorIndex, type VectorIndex } from '../infrastructure/vector-index.js';
import { xenovaEmbedder, type Embedder } from '../infrastructure/embedders.js';
import { fileSourcesConfig, type SourcesConfig } from '../infrastructure/sources-config.js';
import { fileRoomsConfig, type RoomsConfig } from '../infrastructure/rooms-config.js';
import { httpFetcher, type HttpFetcher } from '../infrastructure/http/fetcher.js';
import { xmlParser, type XmlParserPort } from '../infrastructure/parsers/xml-parser.js';
import { readabilityExtractor, type HtmlExtractor } from '../infrastructure/parsers/html-extractor.js';
import { sourceRegistry, type SourceRegistry } from '../infrastructure/sources/registry.js';
import type { IngestDeps } from '../application/ingest.js';

export const wellinformedHome = (): string =>
  process.env.WELLINFORMED_HOME ?? join(homedir(), '.wellinformed');

export interface RuntimePaths {
  readonly home: string;
  readonly graph: string;
  readonly vectors: string;
  readonly sources: string;
  readonly rooms: string;
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
    rooms: join(home, 'rooms.json'),
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
  readonly rooms: RoomsConfig;
  readonly http: HttpFetcher;
  readonly xml: XmlParserPort;
  readonly html: HtmlExtractor;
  readonly registry: SourceRegistry;
  /** A convenience packet of the fields ingest.ts needs. */
  readonly ingestDeps: IngestDeps;
  /** Release native resources (sqlite) */
  close(): void;
}

/**
 * Build the default runtime — opens sqlite, constructs all adapters,
 * hands back everything the CLI commands need. Call once per command
 * invocation.
 */
export const defaultRuntime = (): ResultAsync<Runtime, AppError> => {
  const paths = runtimePaths();
  return openSqliteVectorIndex({ path: paths.vectors })
    .mapErr((e): AppError => e)
    .map((vectors): Runtime => {
      const graphs = fileGraphRepository(paths.graph);
      const embedder = xenovaEmbedder({ cacheDir: paths.modelCache });
      const sources = fileSourcesConfig(paths.sources);
      const rooms = fileRoomsConfig(paths.rooms);
      const http = httpFetcher();
      const xml = xmlParser();
      const html = readabilityExtractor();
      const registry = sourceRegistry({
        http,
        xml,
        html,
        claudeSessions: {
          homePath: paths.home,
          patterns: [],
          scanUserMessages: false,
          nowMs: () => Date.now(),
        },
      });
      const ingestDeps: IngestDeps = { graphs, vectors, embedder, sources, registry };
      return {
        paths,
        graphs,
        vectors,
        embedder,
        sources,
        rooms,
        http,
        xml,
        html,
        registry,
        ingestDeps,
        close: () => vectors.close(),
      };
    });
};

// Silence strict-linting on the unused errAsync import — kept for
// parity with other runtime files that may grow error branches.
void errAsync;
