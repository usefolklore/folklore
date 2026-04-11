/**
 * SourceRegistry — turns a SourceDescriptor into a live Source
 * instance by looking up the adapter factory for its kind.
 *
 * This is the single place that wires the adapters to their infra
 * dependencies (http, xml, html). The application layer depends on
 * the registry, not on the concrete adapter modules, so adding a
 * new source kind in a later phase only touches one file.
 */

import { Result, err, ok } from 'neverthrow';
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

export interface SourceRegistryDeps {
  readonly http: HttpFetcher;
  readonly xml: XmlParserPort;
  readonly html: HtmlExtractor;
}

/** Known source kinds and their adapter factories. */
type Factory = (descriptor: SourceDescriptor) => Source;

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
