/**
 * Meme image generation (AGENT-01).
 *
 * Two paths, one entrypoint:
 *
 *   1. No-credit SVG (DEFAULT) — composites an existing folk-art PNG
 *      from assets/gen/ under a folk-pop caption band into a
 *      self-contained `.svg` written next to the other meme art. Zero
 *      new deps (node:fs only), zero spend, zero network.
 *
 *   2. higgsfield (opt-in, ~1 credit) — shells out to the higgsfield
 *      CLI for a nano_banana_2 folk-pop gen. Wrapped in ResultAsync so
 *      a missing CLI / exhausted credit returns Err rather than throwing;
 *      the pipeline falls back to the SVG path on that Err.
 *
 * Functional DDD: no classes, neverthrow Results, ESM .js suffixes.
 */

import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import type { GraphError } from '../../domain/errors.js';
import { GraphError as GE } from '../../domain/errors.js';
import { MAX_CAPTION, type MemeAgentConfig, type MemeEntry } from './types.js';

/** Folk-pop palette (mirrors site/index.html CSS vars). */
const PAPER = '#f4ecd8';
const INK = '#1d1813';
const ACCENTS = ['#ff4f6d', '#2b3a8c', '#1fae8b', '#f5b921'] as const;

/** Default caption when none is provided. Folk-pop voice. */
const DEFAULT_CAPTION = 'never research twice — the graph remembers so the network never pays for the same answer again.';

/** Slug a string into a URL-safe id fragment. */
const slug = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

/** Truncate to the tweet ceiling. */
const clampCaption = (s: string): string =>
  s.length > MAX_CAPTION ? `${s.slice(0, MAX_CAPTION - 1)}…` : s;

/** XML-escape caption text for safe embedding in the SVG. */
const xmlEscape = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Wrap caption into <=N-char lines for the SVG caption band. */
const wrapLines = (s: string, perLine = 38): readonly string[] => {
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > perLine) {
      if (cur) lines.push(cur);
      cur = w;
    } else {
      cur = (cur ? cur + ' ' : '') + w;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 4);
};

/**
 * Pick a base art file from assets/gen/ to composite over. Prefers an
 * existing meme-*.png; falls back to the first png it finds.
 */
const pickBaseArt = (genDir: string): string => {
  if (!existsSync(genDir)) return 'meme-amnesia.png';
  const pngs = readdirSync(genDir).filter((f) => f.toLowerCase().endsWith('.png'));
  const meme = pngs.find((f) => f.startsWith('meme-'));
  return meme ?? pngs[0] ?? 'meme-amnesia.png';
};

/**
 * Build a self-contained SVG meme: base art + folk-pop caption band.
 * The `<image>` href is relative to the SVG's own location
 * (site/assets/gen/agent-<id>.svg → gen/<art>.png is a sibling).
 */
const buildSvg = (artFile: string, caption: string, accent: string): string => {
  const W = 1000;
  const H = 1000;
  const bandTop = 760;
  const lines = wrapLines(caption);
  const lineH = 46;
  const textBlock = lines
    .map(
      (ln, i) =>
        `<text x="${W / 2}" y="${bandTop + 60 + i * lineH}" text-anchor="middle" ` +
        `font-family="Fraunces, Georgia, serif" font-weight="800" font-size="34" ` +
        `fill="${PAPER}">${xmlEscape(ln)}</text>`,
    )
    .join('\n    ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <image href="${artFile}" xlink:href="${artFile}" x="40" y="40" width="${W - 80}" height="${bandTop - 80}" preserveAspectRatio="xMidYMid slice"/>
  <rect x="0" y="${bandTop}" width="${W}" height="${H - bandTop}" fill="${INK}"/>
  <rect x="0" y="${bandTop}" width="${W}" height="10" fill="${accent}"/>
  <rect x="20" y="20" width="${W - 40}" height="${H - 40}" fill="none" stroke="${INK}" stroke-width="8"/>
  ${textBlock}
  <text x="${W / 2}" y="${H - 28}" text-anchor="middle" font-family="Geist Mono, monospace" font-size="20" fill="${accent}">folklore · memes by the network</text>
</svg>
`;
};

/** Generate via the no-credit SVG path. Always synchronous file I/O. */
const generateSvg = (config: MemeAgentConfig): ResultAsync<MemeEntry, GraphError> => {
  const genDir = join(config.siteAssetsDir, 'gen');
  const caption = clampCaption(config.text ?? DEFAULT_CAPTION);
  const id = `${new Date().toISOString().slice(0, 10)}-${slug(config.text ?? 'folklore') || 'folklore'}`;
  const artFile = pickBaseArt(genDir); // basename, sibling of the svg
  const accent = ACCENTS[Math.abs(id.length) % ACCENTS.length];
  const svg = buildSvg(basename(artFile), caption, accent);
  const fileName = `agent-${id}.svg`;
  const outPath = join(genDir, fileName);

  try {
    mkdirSync(genDir, { recursive: true });
    writeFileSync(outPath, svg, 'utf8');
  } catch (e) {
    return errAsync(GE.writeError(outPath, (e as Error).message));
  }

  const entry: MemeEntry = {
    id,
    caption,
    image: `assets/gen/${fileName}`,
    alt: `folk-pop meme — ${caption.slice(0, 80)}`,
    createdAt: new Date().toISOString(),
    source: 'svg',
  };
  return okAsync(entry);
};

/**
 * Generate via the higgsfield CLI (opt-in, ~1 credit). Returns Err on a
 * missing CLI / exhausted credit / nonzero exit — never throws. The
 * caller (pipeline) falls back to the SVG path on this Err.
 */
const generateHiggsfield = (config: MemeAgentConfig): ResultAsync<MemeEntry, GraphError> =>
  ResultAsync.fromPromise(
    (async (): Promise<MemeEntry> => {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const run = promisify(execFile);
      const genDir = join(config.siteAssetsDir, 'gen');
      const caption = clampCaption(config.text ?? DEFAULT_CAPTION);
      const id = `${new Date().toISOString().slice(0, 10)}-hf-${slug(config.text ?? 'folklore') || 'folklore'}`;
      const fileName = `agent-${id}.png`;
      const outPath = join(genDir, fileName);
      mkdirSync(genDir, { recursive: true });
      // ~1 credit. nano_banana_2 folk-pop gen. Errors (missing CLI /
      // no credit) reject and surface as Err via fromPromise.
      await run('higgsfield', [
        'generate',
        '--model', 'nano_banana_2',
        '--prompt', `folk-pop sticker meme, ${caption}`,
        '--out', outPath,
      ]);
      if (!existsSync(outPath)) {
        throw new Error('higgsfield produced no output file');
      }
      const entry: MemeEntry = {
        id,
        caption,
        image: `assets/gen/${fileName}`,
        alt: `folk-pop meme — ${caption.slice(0, 80)}`,
        createdAt: new Date().toISOString(),
        source: 'higgsfield',
      };
      return entry;
    })(),
    (e) => GE.writeError('higgsfield', (e as Error).message),
  );

/**
 * Generate a meme image. Default = no-credit SVG. higgsfield only when
 * `config.useHiggsfield` is true; even then the CLI is never invoked
 * under the default config (the pipeline owns the SVG fallback).
 */
export const generateMeme = (config: MemeAgentConfig): ResultAsync<MemeEntry, GraphError> =>
  config.useHiggsfield ? generateHiggsfield(config) : generateSvg(config);
