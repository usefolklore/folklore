/**
 * SourceRegistry — turns a SourceDescriptor into a live Source
 * instance by looking up the adapter factory for its kind.
 *
 * This is the single place that wires the adapters to their infra
 * dependencies (http, xml, html). The application layer depends on
 * the registry, not on the concrete adapter modules, so adding a
 * new source kind in a later phase only touches one file.
 */

import { Result, err, ok, okAsync } from 'neverthrow';
import type { GraphError } from '../../domain/errors.js';
import { GraphError as GE } from '../../domain/errors.js';
import type { Source, SourceDescriptor, SourceKind } from '../../domain/sources.js';
import type { HttpFetcher } from '../http/fetcher.js';
import type { XmlParserPort } from '../parsers/xml-parser.js';
import type { HtmlExtractor } from '../parsers/html-extractor.js';
import { genericRssSource } from './generic-rss.js';
import { arxivSource } from './arxiv.js';
import { hnAlgoliaSource } from './hn-algolia.js';
import { genericUrlSource } from './generic-url.js';
import { codebaseSource } from './codebase.js';
import { packageDepsSource } from './package-deps.js';
import { gitSubmodulesSource } from './git-submodules.js';
import { gitLogSource } from './git-log.js';
import { ossInsightSource } from './oss-insight.js';
import { githubTrendingSource } from './github-trending.js';
import { redditSource } from './reddit.js';
import { devtoSource } from './devto.js';
import { productHuntSource } from './product-hunt.js';
import { ecosystemsTimelineSource } from './ecosystems-timeline.js';
import { githubReleasesSource } from './github-releases.js';
import { npmTrendingSource } from './npm-trending.js';
import { twitterSearchSource } from './twitter-search.js';
import { youtubeTranscriptSource } from './youtube-transcript.js';
import { podcastRssSource } from './podcast-rss.js';
import { claudeSessionsSource, type ClaudeSessionsDeps } from './claude-sessions.js';

export interface SourceRegistryDeps {
  readonly http: HttpFetcher;
  readonly xml: XmlParserPort;
  readonly html: HtmlExtractor;
  /** Phase 20 — session adapter deps. Required even for projects that never use
   *  claude_sessions (stub values are fine — the adapter never fetches unless a
   *  descriptor with kind 'claude_sessions' is built). */
  readonly claudeSessions: ClaudeSessionsDeps;
}

/** Known source kinds and their adapter factories. */
type Factory = (descriptor: SourceDescriptor) => Source;

/** Stub adapter for not-yet-implemented source kinds. */
const stubAdapter: Factory = (descriptor) => ({
  descriptor,
  fetch: () => okAsync([]),
});

// keep okAsync import used
void ok;

export interface SourceRegistry {
  /** Build a live Source from a descriptor, or error if the kind is unknown. */
  build(descriptor: SourceDescriptor): Result<Source, GraphError>;
  /** Build many descriptors, skipping ones whose kind is unknown (reported as errors). */
  buildAll(
    descriptors: readonly SourceDescriptor[],
  ): { readonly sources: readonly Source[]; readonly errors: readonly GraphError[] };
  /** List the kinds this registry knows about. */
  kinds(): readonly SourceKind[];
}

export const sourceRegistry = (deps: SourceRegistryDeps): SourceRegistry => {
  const factories: Record<SourceKind, Factory> = {
    generic_rss: genericRssSource({ http: deps.http, xml: deps.xml }),
    arxiv: arxivSource({ http: deps.http, xml: deps.xml }),
    hn_algolia: hnAlgoliaSource({ http: deps.http }),
    generic_url: genericUrlSource({ http: deps.http, html: deps.html }),
    codebase: codebaseSource(),
    package_deps: packageDepsSource(),
    git_submodules: gitSubmodulesSource(),
    git_log: gitLogSource(),
    oss_insight: ossInsightSource({ http: deps.http }),
    github_trending: githubTrendingSource({ http: deps.http }),
    reddit: redditSource({ http: deps.http }),
    devto: devtoSource({ http: deps.http }),
    product_hunt: productHuntSource({ http: deps.http }),
    ecosystems_timeline: ecosystemsTimelineSource({ http: deps.http }),
    github_releases: githubReleasesSource({ http: deps.http }),
    npm_trending: npmTrendingSource({ http: deps.http }),
    twitter_search: twitterSearchSource(),
    youtube_transcript: youtubeTranscriptSource({ http: deps.http, xml: deps.xml }),
    podcast_rss: podcastRssSource({ http: deps.http, xml: deps.xml }),
    // Multimodal stubs — return empty until adapter files are built
    image_metadata: stubAdapter,
    image_ocr: stubAdapter,
    audio_transcript: stubAdapter,
    pdf_text: stubAdapter,
    // Phase 20 — Claude session transcript ingestion
    claude_sessions: claudeSessionsSource(deps.claudeSessions),
  };

  const build = (descriptor: SourceDescriptor): Result<Source, GraphError> => {
    const factory = factories[descriptor.kind];
    if (!factory) {
      return err(
        GE.parseError(
          `source:${descriptor.id}`,
          `unknown source kind '${descriptor.kind}'. known: ${Object.keys(factories).join(',')}`,
        ),
      );
    }
    return ok(factory(descriptor));
  };

  const buildAll = (
    descriptors: readonly SourceDescriptor[],
  ): { readonly sources: readonly Source[]; readonly errors: readonly GraphError[] } => {
    const sources: Source[] = [];
    const errors: GraphError[] = [];
    for (const d of descriptors) {
      const r = build(d);
      if (r.isOk()) sources.push(r.value);
      else errors.push(r.error);
    }
    return { sources, errors };
  };

  const kinds = (): readonly SourceKind[] => Object.keys(factories) as SourceKind[];

  return { build, buildAll, kinds };
};
