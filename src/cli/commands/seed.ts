/**
 * `folklore seed [--file PATH] [--force] [--dry-run] [--json]`
 *
 * Seed a fresh (or any) graph with a curated corpus of durable concept
 * nodes so the network-before-web gate answers from the first session
 * instead of waiting for web traffic to warm the graph. Without --file
 * the bundled DEFAULT_SEED_CORPUS is used; --file loads and validates a
 * user-supplied manifest of the same shape.
 *
 * Idempotent by default: entries whose deterministic id already exists
 * are skipped, so re-running seed is a safe no-op. --force re-indexes
 * every entry (refresh embeddings after a corpus change).
 *
 * --dry-run validates + reports what *would* be written without
 * touching the graph or vector index.
 */

import { readFileSync } from 'node:fs';
import { defaultRuntime } from '../runtime.js';
import { formatError, formatErrorWithHint } from '../../domain/errors.js';
import { parseSeedCorpus, type SeedCorpus } from '../../domain/seed-corpus.js';
import { DEFAULT_SEED_CORPUS } from '../../domain/seed-corpus-data.js';
import { seedGraph } from '../../application/seed-graph.js';

interface SeedFlags {
  readonly file?: string;
  readonly force: boolean;
  readonly dryRun: boolean;
  readonly json: boolean;
}

const parseFlags = (rest: readonly string[]): SeedFlags | string => {
  let file: string | undefined;
  let force = false;
  let dryRun = false;
  let json = false;
  for (let i = 0; i < rest.length; i++) {
    const f = rest[i];
    if (f === '--file') { file = rest[++i]; continue; }
    if (f.startsWith('--file=')) { file = f.slice('--file='.length); continue; }
    if (f === '--force') { force = true; continue; }
    if (f === '--dry-run') { dryRun = true; continue; }
    if (f === '--json') { json = true; continue; }
    if (f === '--help' || f === '-h') return 'help';
    return `seed: unknown flag '${f}'`;
  }
  return { file, force, dryRun, json };
};

const USAGE = `usage: folklore seed [--file PATH] [--force] [--dry-run] [--json]

  Seed the graph with a curated corpus of durable concept nodes so the
  network-before-web gate answers from the first session.

  --file PATH   load a JSON manifest ({version, entries:[{type,label,body,...}]})
                instead of the bundled default corpus
  --force       re-index every entry even if its id already exists
  --dry-run     validate + report what would be written; touch nothing
  --json        machine-readable report on stdout

  Idempotent without --force: entries already present (by deterministic
  id) are skipped, so re-running is safe.`;

const loadCorpus = (file?: string): SeedCorpus | string => {
  if (!file) {
    const parsed = parseSeedCorpus(DEFAULT_SEED_CORPUS, '<bundled>');
    // The bundled corpus is validated at build authoring time; a parse
    // failure here is a programmer error, surfaced rather than swallowed.
    return parsed.isOk() ? parsed.value : `seed: bundled corpus invalid: ${formatError(parsed.error)}`;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    return `seed: cannot read corpus file '${file}': ${(e as Error).message}`;
  }
  const parsed = parseSeedCorpus(raw, file);
  return parsed.isOk() ? parsed.value : `seed: ${formatError(parsed.error)}`;
};

export const seed = async (rest: readonly string[]): Promise<number> => {
  const flags = parseFlags(rest);
  if (flags === 'help') { console.log(USAGE); return 0; }
  if (typeof flags === 'string') { console.error(flags); return 1; }

  const corpus = loadCorpus(flags.file);
  if (typeof corpus === 'string') { console.error(corpus); return 1; }

  if (flags.dryRun) {
    const report = {
      dry_run: true,
      total: corpus.entries.length,
      labels: corpus.entries.map((e) => e.label),
    };
    if (flags.json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`seed: --dry-run — ${corpus.entries.length} entr${corpus.entries.length === 1 ? 'y' : 'ies'} in corpus (nothing written):`);
      for (const e of corpus.entries) console.log(`  · ${e.type.padEnd(9)} ${e.label}`);
    }
    return 0;
  }

  const rtRes = await defaultRuntime();
  if (rtRes.isErr()) {
    console.error(`seed: ${formatErrorWithHint(rtRes.error)}`);
    return 1;
  }
  const runtime = rtRes.value;

  try {
    const deps = {
      graphs: runtime.graphs,
      vectors: runtime.vectors,
      embedder: runtime.embedder,
      githubUser: runtime.githubUser,
    };
    const res = await seedGraph(deps)({ corpus, force: flags.force });
    if (res.isErr()) {
      console.error(`seed: ${formatErrorWithHint(res.error)}`);
      return 1;
    }
    const r = res.value;
    if (flags.json) {
      console.log(JSON.stringify(r, null, 2));
    } else {
      console.log(
        `seed: ${r.seeded} node(s) indexed, ${r.skipped} already present (${r.total} in corpus).`,
      );
      if (r.seeded > 0) console.log(`  run 'folklore ask "<concept>"' — the graph now answers from turn one.`);
      else if (r.skipped === r.total) console.log(`  graph already seeded; use --force to re-index.`);
    }
    return 0;
  } finally {
    runtime.close();
  }
};
