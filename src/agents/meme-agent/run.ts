/**
 * Meme-agent CLI entrypoint (AGENT-01).
 *
 *   node --import tsx src/agents/meme-agent/run.ts [--live] [--higgsfield] [--text "<caption>"]
 *
 * Default = full DRY-RUN: generates a no-credit SVG meme from existing
 * folk art, posts NOTHING (no creds required), and appends one
 * MemeEntry to site/assets/memes.json. `--live` enables the gated post
 * step (still a no-op unless X_CLIENT_ID is set). `--higgsfield` opts
 * into the ~1-credit higgsfield path (falls back to SVG on failure).
 */

import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { formatError } from '../../domain/errors.js';
import { runMemeAgent } from './pipeline.js';
import type { MemeAgentConfig } from './types.js';

/** Parse argv into a MemeAgentConfig. dryRun defaults true (no --live). */
export const parseArgs = (argv: readonly string[], cwd: string = process.cwd()): MemeAgentConfig => {
  const live = argv.includes('--live');
  const useHiggsfield = argv.includes('--higgsfield');
  const ti = argv.indexOf('--text');
  const text = ti >= 0 && ti + 1 < argv.length ? argv[ti + 1] : undefined;
  return {
    dryRun: !live,
    useHiggsfield,
    siteAssetsDir: join(cwd, 'site', 'assets'),
    text,
  };
};

/** CLI main — returns a process exit code. */
export const main = async (argv: readonly string[] = process.argv.slice(2)): Promise<number> => {
  const config = parseArgs(argv);
  const mode = config.dryRun ? 'DRY-RUN (no live post)' : 'LIVE';
  const gen = config.useHiggsfield ? 'higgsfield (~1 credit, falls back to SVG)' : 'no-credit SVG';
  console.log(`meme-agent · ${mode} · ${gen}`);
  if (config.text) console.log(`caption override: ${config.text}`);

  const res = await runMemeAgent(config);
  if (res.isErr()) {
    console.error(`meme-agent: ${formatError(res.error)}`);
    return 1;
  }
  const entry = res.value;
  console.log('\nappended MemeEntry to site/assets/memes.json:');
  console.log(JSON.stringify(entry, null, 2));
  console.log(entry.postedUrl ? `\nposted: ${entry.postedUrl}` : '\n[dry-run] not posted to X');
  return 0;
};

// Run when invoked directly (not when imported by tests).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void main().then((code) => {
    process.exitCode = code;
  });
}
