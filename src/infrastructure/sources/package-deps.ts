/**
 * package_deps source adapter — indexes package.json dependencies.
 *
 * Creates one ContentItem per dependency (both deps + devDeps) with
 * the package name, version, and a link to npm. The embedded text
 * includes the dep name + any description we can extract from
 * node_modules/<pkg>/package.json (if installed).
 *
 * Config:
 *   {
 *     root?: string         // project root (default: cwd)
 *     include_dev?: boolean // include devDependencies (default: false)
 *   }
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import type { AppError } from '../../domain/errors.js';
import type { ContentItem } from '../../domain/content.js';
import type { Source, SourceDescriptor } from '../../domain/sources.js';

interface PkgDepsConfig {
  readonly root: string;
  readonly include_dev: boolean;
}

const parseConfig = (raw: Readonly<Record<string, unknown>>): PkgDepsConfig => ({
  root: typeof raw.root === 'string' ? raw.root : process.cwd(),
  include_dev: typeof raw.include_dev === 'boolean' ? raw.include_dev : false,
});

const readPkgDescription = (root: string, name: string): string | undefined => {
  const pkgPath = join(root, 'node_modules', name, 'package.json');
  if (!existsSync(pkgPath)) return undefined;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return typeof pkg.description === 'string' ? pkg.description : undefined;
  } catch {
    return undefined;
  }
};

const readPkgHomepage = (root: string, name: string): string | undefined => {
  const pkgPath = join(root, 'node_modules', name, 'package.json');
  if (!existsSync(pkgPath)) return undefined;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return typeof pkg.homepage === 'string'
      ? pkg.homepage
      : typeof pkg.repository === 'string'
        ? pkg.repository
        : typeof pkg.repository?.url === 'string'
          ? pkg.repository.url
          : undefined;
  } catch {
    return undefined;
  }
};

export const packageDepsSource = () =>
  (descriptor: SourceDescriptor): Source => {
    const cfg = parseConfig(descriptor.config);

    const fetchItems = (): ResultAsync<readonly ContentItem[], AppError> => {
      const pkgPath = join(cfg.root, 'package.json');
      if (!existsSync(pkgPath)) {
        return errAsync<readonly ContentItem[], AppError>({
          type: 'GraphReadError',
          path: pkgPath,
          message: 'package.json not found',
        });
      }

      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
        const deps: Record<string, string> = {
          ...(pkg.dependencies ?? {}),
          ...(cfg.include_dev ? (pkg.devDependencies ?? {}) : {}),
        };

        const items: ContentItem[] = Object.entries(deps).map(([name, version]) => {
          const desc = readPkgDescription(cfg.root, name) ?? '';
          const homepage = readPkgHomepage(cfg.root, name);
          const textParts = [
            `Package: ${name}@${version}`,
            desc ? `Description: ${desc}` : '',
            homepage ? `Homepage: ${homepage}` : '',
            `npm: https://www.npmjs.com/package/${name}`,
          ].filter(Boolean);

          return {
            source_uri: `npm://${name}`,
            title: `${name}@${version}`,
            text: textParts.join('\n'),
            metadata: {
              kind: 'package_deps',
              version,
              description: desc || undefined,
              homepage: homepage || undefined,
            },
          };
        });

        return okAsync(items);
      } catch (e) {
        return errAsync<readonly ContentItem[], AppError>({
          type: 'GraphReadError',
          path: pkgPath,
          message: (e as Error).message,
        });
      }
    };

    return { descriptor, fetch: fetchItems };
  };
