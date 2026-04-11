/**
 * git_log source adapter — indexes recent git commits.
 *
 * Creates one ContentItem per commit with: hash, author, date,
 * message, and list of changed files. The embedded text captures
 * the commit message + file list so semantic search can find
 * "who changed the vector store" or "commits about chunking".
 *
 * Config:
 *   {
 *     root?: string       // project root (default: cwd)
 *     max_commits?: number // default 50
 *     since?: string       // git --since date (default: "30 days ago")
 *   }
 */

import { spawnSync } from 'node:child_process';
import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import type { AppError } from '../../domain/errors.js';
import type { ContentItem } from '../../domain/content.js';
import type { Source, SourceDescriptor } from '../../domain/sources.js';

interface GitLogConfig {
  readonly root: string;
  readonly max_commits: number;
  readonly since: string;
}

const parseConfig = (raw: Readonly<Record<string, unknown>>): GitLogConfig => ({
  root: typeof raw.root === 'string' ? raw.root : process.cwd(),
  max_commits: typeof raw.max_commits === 'number' ? raw.max_commits : 50,
  since: typeof raw.since === 'string' ? raw.since : '30 days ago',
});

const SEPARATOR = '---COMMIT_SEP---';
const FORMAT = `%H%n%an%n%aI%n%s%n%b${SEPARATOR}`;

interface CommitInfo {
  readonly hash: string;
  readonly author: string;
  readonly date: string;
  readonly subject: string;
  readonly body: string;
  readonly files: readonly string[];
}

const parseCommits = (output: string): readonly CommitInfo[] => {
  const blocks = output.split(SEPARATOR).filter((b) => b.trim().length > 0);
  const commits: CommitInfo[] = [];

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 4) continue;
    commits.push({
      hash: lines[0],
      author: lines[1],
      date: lines[2],
      subject: lines[3],
      body: lines.slice(4).join('\n').trim(),
      files: [], // filled in separately
    });
  }
  return commits;
};

const getChangedFiles = (root: string, hash: string): readonly string[] => {
  const result = spawnSync('git', ['-C', root, 'diff-tree', '--no-commit-id', '--name-only', '-r', hash], {
    encoding: 'utf8',
  });
  if (result.status !== 0) return [];
  return result.stdout.trim().split('\n').filter(Boolean);
};

export const gitLogSource = () =>
  (descriptor: SourceDescriptor): Source => {
    const cfg = parseConfig(descriptor.config);

    const fetchItems = (): ResultAsync<readonly ContentItem[], AppError> => {
      try {
        const result = spawnSync(
          'git',
          ['-C', cfg.root, 'log', `--max-count=${cfg.max_commits}`, `--since=${cfg.since}`, `--format=${FORMAT}`],
          { encoding: 'utf8' },
        );

        if (result.status !== 0) {
          return errAsync<readonly ContentItem[], AppError>({
            type: 'GraphReadError',
            path: cfg.root,
            message: `git log failed: ${result.stderr}`,
          });
        }

        const commits = parseCommits(result.stdout);
        const items: ContentItem[] = commits.map((c) => {
          const files = getChangedFiles(cfg.root, c.hash);
          const textParts = [
            `Commit: ${c.hash.slice(0, 8)}`,
            `Author: ${c.author}`,
            `Date: ${c.date}`,
            `Subject: ${c.subject}`,
            c.body ? `Body: ${c.body}` : '',
            files.length > 0 ? `Changed files: ${files.join(', ')}` : '',
          ].filter(Boolean);

          return {
            source_uri: `git://${c.hash}`,
            title: `${c.hash.slice(0, 8)}: ${c.subject}`,
            text: textParts.join('\n'),
            published_at: c.date,
            author: c.author,
            metadata: {
              kind: 'git_log',
              hash: c.hash,
              files,
            },
          };
        });

        return okAsync(items);
      } catch (e) {
        return errAsync<readonly ContentItem[], AppError>({
          type: 'GraphReadError',
          path: cfg.root,
          message: (e as Error).message,
        });
      }
    };

    return { descriptor, fetch: fetchItems };
  };
