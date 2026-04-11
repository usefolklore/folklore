/**
 * `wellinformed init` — interactive room seeding wizard.
 *
 * Walks the user through:
 *   1. What are you researching? → room name + description
 *   2. Key topics / keywords → used to suggest sources
 *   3. Do you have RSS feeds? → adds generic_rss sources
 *   4. Search ArXiv? → adds arxiv source with derived query
 *   5. Search HN? → adds hn_algolia source with derived query
 *   6. Any specific URLs to seed? → adds generic_url sources
 *   7. Summary + confirmation
 *
 * The wizard talks to the room and source registries. It is
 * testable via the `Prompter` interface — tests inject answers
 * instead of using readline.
 *
 * Non-interactive mode: `wellinformed init --name X --desc Y --keywords a,b`
 * skips all prompts and creates the room + default sources from flags.
 */

import { createInterface, type Interface } from 'node:readline';
import { join } from 'node:path';
import { formatError } from '../../domain/errors.js';
import type { RoomMeta } from '../../domain/rooms.js';
import { slugifyRoomName } from '../../domain/rooms.js';
import type { SourceDescriptor, SourceKind } from '../../domain/sources.js';
import { fileRoomsConfig } from '../../infrastructure/rooms-config.js';
import { fileSourcesConfig } from '../../infrastructure/sources-config.js';
import { runtimePaths } from '../runtime.js';

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

/**
 * Builds a non-interactive prompter from pre-supplied answers.
 * Used by tests and the `--name/--desc/--keywords` flag path.
 */
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
  readonly name?: string;
  readonly desc?: string;
  readonly keywords?: string;
  readonly rss?: string;
  readonly arxiv?: boolean;
  readonly hn?: boolean;
}

const parseFlags = (args: readonly string[]): InitFlags => {
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = (): string => args[++i] ?? '';
    if (a === '--name') flags.name = next();
    else if (a.startsWith('--name=')) flags.name = a.slice('--name='.length);
    else if (a === '--desc') flags.desc = next();
    else if (a.startsWith('--desc=')) flags.desc = a.slice('--desc='.length);
    else if (a === '--keywords') flags.keywords = next();
    else if (a.startsWith('--keywords=')) flags.keywords = a.slice('--keywords='.length);
    else if (a === '--rss') flags.rss = next();
    else if (a.startsWith('--rss=')) flags.rss = a.slice('--rss='.length);
    else if (a === '--arxiv') flags.arxiv = true;
    else if (a === '--no-arxiv') flags.arxiv = false;
    else if (a === '--hn') flags.hn = true;
    else if (a === '--no-hn') flags.hn = false;
  }
  return flags as InitFlags;
};

// ─────────────── wizard ─────────────────

const runWizard = async (
  prompter: Prompter,
  flags: InitFlags,
): Promise<{
  room: RoomMeta;
  sources: readonly SourceDescriptor[];
} | null> => {
  console.log('\nwellinformed init — set up a new research room\n');

  // 1. Name
  const name = flags.name ?? (await prompter.ask('What are you researching?', 'homelab'));
  if (!name) {
    console.log('no room name provided. aborting.');
    return null;
  }
  const id = slugifyRoomName(name);

  // 2. Description
  const desc = flags.desc ?? (await prompter.ask('Short description', `Research room for ${name}`));

  // 3. Keywords
  const keywordsStr =
    flags.keywords ?? (await prompter.ask('Keywords (comma-separated)', name.toLowerCase()));
  const keywords = keywordsStr
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

  const room: RoomMeta = {
    id,
    name,
    description: desc,
    keywords,
    created_at: new Date().toISOString(),
  };

  console.log(`\n  room: ${id}`);
  console.log(`  desc: ${desc}`);
  console.log(`  keywords: ${keywords.join(', ')}\n`);

  // 4. Sources
  const sources: SourceDescriptor[] = [];

  // RSS
  const rssUrl = flags.rss ?? (await prompter.ask('RSS/Atom feed URL? (blank to skip)'));
  if (rssUrl) {
    sources.push({
      id: `${id}-rss`,
      kind: 'generic_rss' as SourceKind,
      room: id,
      enabled: true,
      config: { feed_url: rssUrl, max_items: 20 },
    });
    console.log(`  + generic_rss: ${rssUrl}`);
  }

  // ArXiv
  const useArxiv = flags.arxiv ?? (await prompter.confirm(`Search ArXiv for "${keywords.join(' OR ')}"?`));
  if (useArxiv) {
    const query = keywords.map((k) => `abs:${k}`).join(' OR ');
    sources.push({
      id: `${id}-arxiv`,
      kind: 'arxiv' as SourceKind,
      room: id,
      enabled: true,
      config: { query, max_items: 10 },
    });
    console.log(`  + arxiv: ${query}`);
  }

  // HN
  const useHn = flags.hn ?? (await prompter.confirm(`Search Hacker News for "${keywords.join(' ')}"?`));
  if (useHn) {
    sources.push({
      id: `${id}-hn`,
      kind: 'hn_algolia' as SourceKind,
      room: id,
      enabled: true,
      config: { query: keywords.join(' '), max_items: 15, tags: 'story' },
    });
    console.log(`  + hn_algolia: ${keywords.join(' ')}`);
  }

  console.log(`\n  total sources: ${sources.length}`);
  return { room, sources };
};

// ─────────────── entry ──────────────────

export const init = async (args: readonly string[]): Promise<number> => {
  const flags = parseFlags(args);
  const isNonInteractive = Boolean(flags.name);
  const prompter = isNonInteractive
    ? staticPrompter([]) // flags supply all values
    : readlinePrompter();

  try {
    const result = await runWizard(prompter, flags);
    if (!result) return 1;

    const paths = runtimePaths();
    const rooms = fileRoomsConfig(join(paths.home, 'rooms.json'));
    const sources = fileSourcesConfig(paths.sources);

    // Create room
    const roomResult = await rooms.create(result.room);
    if (roomResult.isErr()) {
      console.error(`init: ${formatError(roomResult.error)}`);
      return 1;
    }

    // Register sources
    for (const s of result.sources) {
      const sr = await sources.add(s);
      if (sr.isErr()) {
        console.error(`init: failed to add source ${s.id}: ${formatError(sr.error)}`);
      }
    }

    console.log(`\nroom '${result.room.id}' created with ${result.sources.length} source(s).`);
    console.log(`run 'wellinformed trigger --room ${result.room.id}' to fetch initial content.`);
    return 0;
  } finally {
    prompter.close();
  }
};
