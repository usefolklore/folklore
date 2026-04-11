/**
 * git_submodules source adapter — indexes .gitmodules entries.
 *
 * Creates one ContentItem per submodule with URL, branch, path,
 * and current HEAD SHA.
 *
 * Config:
 *   { root?: string }
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import type { AppError } from '../../domain/errors.js';
import type { ContentItem } from '../../domain/content.js';
import type { Source, SourceDescriptor } from '../../domain/sources.js';

interface SubmoduleEntry {
  readonly name: string;
  readonly path: string;
  readonly url: string;
  readonly branch?: string;
}

const parseGitmodules = (content: string): readonly SubmoduleEntry[] => {
  const entries: SubmoduleEntry[] = [];
  const lines = content.split('\n');
  let current: { name?: string; path?: string; url?: string; branch?: string } = {};

  for (const line of lines) {
    const trimmed = line.trim();
    const sectionMatch = trimmed.match(/^\[submodule\s+"([^"]+)"\]/);
    if (sectionMatch) {
      if (current.name && current.path && current.url) {
        entries.push({ name: current.name, path: current.path, url: current.url, branch: current.branch });
      }
      current = { name: sectionMatch[1] };
      continue;
    }
    const kvMatch = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
    if (kvMatch) {
      const [, key, value] = kvMatch;
      if (key === 'path') current.path = value.trim();
      else if (key === 'url') current.url = value.trim();
      else if (key === 'branch') current.branch = value.trim();
    }
  }
  if (current.name && current.path && current.url) {
    entries.push({ name: current.name, path: current.path, url: current.url, branch: current.branch });
  }
  return entries;
};

const getSubmoduleSha = (root: string, path: string): string | undefined => {
  const result = spawnSync('git', ['-C', join(root, path), 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  });
  return result.status === 0 ? result.stdout.trim() : undefined;
};

export const gitSubmodulesSource = () =>
  (descriptor: SourceDescriptor): Source => {
    const root = typeof descriptor.config.root === 'string' ? descriptor.config.root : process.cwd();

    const fetchItems = (): ResultAsync<readonly ContentItem[], AppError> => {
      const gitmodulesPath = join(root, '.gitmodules');
      if (!existsSync(gitmodulesPath)) {
        return okAsync([]); // no submodules, not an error
      }

      try {
        const content = readFileSync(gitmodulesPath, 'utf8');
        const entries = parseGitmodules(content);

        const items: ContentItem[] = entries.map((entry) => {
          const sha = getSubmoduleSha(root, entry.path);
          const textParts = [
            `Submodule: ${entry.name}`,
            `Path: ${entry.path}`,
            `URL: ${entry.url}`,
            entry.branch ? `Branch: ${entry.branch}` : '',
            sha ? `HEAD: ${sha}` : '',
          ].filter(Boolean);

          return {
            source_uri: `submodule://${entry.name}`,
            title: `submodule: ${entry.name}`,
            text: textParts.join('\n'),
            metadata: {
              kind: 'git_submodules',
              path: entry.path,
              url: entry.url,
              branch: entry.branch,
              sha,
            },
          };
        });

        return okAsync(items);
      } catch (e) {
        return errAsync<readonly ContentItem[], AppError>({
          type: 'GraphReadError',
          path: gitmodulesPath,
          message: (e as Error).message,
        });
      }
    };

    return { descriptor, fetch: fetchItems };
  };
