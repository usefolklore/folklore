/**
 * Meme-agent data contract (AGENT-01).
 *
 * `MemeEntry` is the SINGLE source of truth for the shape of every
 * record in `site/assets/memes.json`. Plan 28-03 reads this file to
 * render the #memes grid, so the schema here is the contract between
 * the agent (writer) and the site (reader). Keep it minimal and stable.
 *
 * Functional DDD: plain readonly interfaces, no classes. The agent
 * itself flows through neverthrow Results (see pipeline.ts / generate.ts).
 */

/** How a meme image was produced. */
export type MemeSource = 'svg' | 'higgsfield' | 'seed';

/**
 * One rendered meme — the record shape persisted to
 * `site/assets/memes.json` (a `MemeEntry[]`) and rendered by the site.
 */
export interface MemeEntry {
  /** Slug id, e.g. "2026-06-15-agent-amnesia". Stable, URL-safe. */
  readonly id: string;
  /** Caption / tweet text. Always <= 280 chars (tweet limit). */
  readonly caption: string;
  /** Image path RELATIVE to site/, e.g. "assets/gen/meme-amnesia.png". */
  readonly image: string;
  /** Accessible alt text for the image. */
  readonly alt: string;
  /** ISO-8601 creation timestamp. */
  readonly createdAt: string;
  /** Provenance of the image. */
  readonly source: MemeSource;
  /** x.com status URL when live-posted; omitted in dry-run / seed. */
  readonly postedUrl?: string;
}

/**
 * Runtime config for a single agent invocation. Built by run.ts from
 * CLI flags; consumed by pipeline.ts + generate.ts.
 */
export interface MemeAgentConfig {
  /** When true (DEFAULT), generate + append but never post to X. */
  readonly dryRun: boolean;
  /** When true, attempt the ~1-credit higgsfield path; else no-credit SVG. */
  readonly useHiggsfield: boolean;
  /** Absolute path to the `site/assets` directory (where gen/ + memes.json live). */
  readonly siteAssetsDir: string;
  /** Optional caption override; falls back to a default folk-pop line. */
  readonly text?: string;
}

/** Tweet character ceiling — captions are truncated to this. */
export const MAX_CAPTION = 280;
