/**
 * `wellinformed init` — register external content sources.
 *
 * V5 (Phase 24): rooms deleted. The original wizard walked the user
 * through creating a research room + seeding RSS / ArXiv / HN sources
 * scoped to that room. Without rooms, this becomes a non-interactive
 * helper for registering external sources globally.
 *
 * Kept as an entry point so legacy docs / scripts that call
 * `wellinformed init` don't 404. New usage may also prefer:
 *
 *   wellinformed onboard     — installer + identity + hooks
 *   wellinformed this me     — index current cwd into the graph
 *   wellinformed sources add — register an RSS / ArXiv / HN source
 */

import type { Interface } from 'node:readline';
import { createInterface } from 'node:readline';
import type { SourceDescriptor, SourceKind } from '../../domain/sources.js';
import { fileSourcesConfig } from '../../infrastructure/sources-config.js';
import { runtimePaths } from '../runtime.js';
import { formatError } from '../../domain/errors.js';

// ─────────────── prompter port ──────────

export interface Prompter {
  ask(question: string, defaultValue?: string): Promise<string>;
  confirm(question: string, defaultYes?: boolean): Promise<boolean>;
  close(): void;
}

export const readlinePrompter = (): Prompter => {
  const rl: Interface = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (question: string, defaultValue?: string): Promise<string> =>
    new Promise((resolve) => {
      const suffix = defaultValue ? ` [${defaultValue}]` : '';
      rl.question(`  ${question}${suffix}: `, (answer) => {
        resolve(answer.trim() || defaultValue || '');
      });
    });
  const confirm = (question: string, defaultYes = true): Promise<boolean> =>
    new Promise((resolve) => {
      const hint = defaultYes ? '[Y/n]' : '[y/N]';
      rl.question(`  ${question} ${hint}: `, (answer) => {
        const a = answer.trim().toLowerCase();
        if (a === '') resolve(defaultYes);
        else resolve(a === 'y' || a === 'yes');
      });
    });
  const close = (): void => rl.close();
  return { ask, confirm, close };
};

export const staticPrompter = (answers: readonly string[]): Prompter => {
  let idx = 0;
  const ask = async (): Promise<string> => answers[idx++] ?? '';
  const confirm = async (): Promise<boolean> => {
    const a = answers[idx++] ?? 'y';
    return a.toLowerCase() === 'y' || a.toLowerCase() === 'yes';
  };
  const close = (): void => {};
  return { ask, confirm, close };
};

// ─────────────── flag parsing ───────────

interface InitFlags {
  readonly rss?: string;
  readonly arxiv?: boolean;
  readonly hn?: boolean;
  readonly keywords?: string;
}

const parseFlags = (args: readonly string[]): InitFlags => {
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = (): string => args[++i] ?? '';
    if (a === '--rss') flags.rss = next();
    else if (a.startsWith('--rss=')) flags.rss = a.slice('--rss='.length);
    else if (a === '--keywords') flags.keywords = next();
    else if (a.startsWith('--keywords=')) flags.keywords = a.slice('--keywords='.length);
    else if (a === '--arxiv') flags.arxiv = true;
    else if (a === '--no-arxiv') flags.arxiv = false;
    else if (a === '--hn') flags.hn = true;
    else if (a === '--no-hn') flags.hn = false;
  }
  return flags as InitFlags;
};

// ─────────────── entry ──────────────────

export const init = async (args: readonly string[]): Promise<number> => {
  const flags = parseFlags(args);

  console.log('wellinformed init — register external content sources');
  console.log('  (V5: rooms deleted. Run `wellinformed onboard` for the full installer wizard.)');
  console.log('');

  const isNonInteractive = Boolean(flags.rss) || Boolean(flags.keywords);
  const prompter = isNonInteractive ? staticPrompter([]) : readlinePrompter();
  const paths = runtimePaths();
  const sources = fileSourcesConfig(paths.sources);

  try {
    const keywordsStr =
      flags.keywords ?? (await prompter.ask('Search keywords (comma-separated, optional)', ''));
    const keywords = keywordsStr
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    const collected: SourceDescriptor[] = [];

    const rssUrl = flags.rss ?? (await prompter.ask('RSS/Atom feed URL? (blank to skip)'));
    if (rssUrl) {
      collected.push({
        id: `rss-${Date.now()}`,
        kind: 'generic_rss' as SourceKind,
        enabled: true,
        config: { feed_url: rssUrl, max_items: 20 },
      });
      console.log(`  + generic_rss: ${rssUrl}`);
    }

    if (keywords.length > 0) {
      const useArxiv = flags.arxiv ?? (await prompter.confirm(`Search ArXiv for "${keywords.join(' OR ')}"?`));
      if (useArxiv) {
        const query = keywords.map((k) => `abs:${k}`).join(' OR ');
        collected.push({
          id: `arxiv-${Date.now()}`,
          kind: 'arxiv' as SourceKind,
          enabled: true,
          config: { query, max_items: 10 },
        });
        console.log(`  + arxiv: ${query}`);
      }
      const useHn = flags.hn ?? (await prompter.confirm(`Search Hacker News for "${keywords.join(' ')}"?`));
      if (useHn) {
        collected.push({
          id: `hn-${Date.now()}`,
          kind: 'hn_algolia' as SourceKind,
          enabled: true,
          config: { query: keywords.join(' '), max_items: 15, tags: 'story' },
        });
        console.log(`  + hn_algolia: ${keywords.join(' ')}`);
      }
    }

    for (const s of collected) {
      const sr = await sources.add(s);
      if (sr.isErr()) {
        console.error(`init: failed to add source ${s.id}: ${formatError(sr.error)}`);
      }
    }

    console.log(`\n${collected.length} source(s) registered.`);
    if (collected.length > 0) {
      console.log(`run 'wellinformed trigger' to fetch initial content.`);
    }
    return 0;
  } finally {
    prompter.close();
  }
};
