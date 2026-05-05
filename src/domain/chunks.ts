/**
 * Pure text chunker.
 *
 * Splits a body of text into chunks that fit within a target token
 * budget while preserving sentence boundaries as much as possible.
 * No classes, no I/O, no external libraries — this is the "right
 * tool for the job": a single pure function that does one thing.
 *
 * Algorithm (recursive-character split, same shape as LangChain's
 * RecursiveCharacterTextSplitter but without the 21MB dep):
 *
 *   1. Try to split on paragraph separators (\n\n).
 *   2. If a fragment is still too big, split on single newlines.
 *   3. If still too big, split on sentence terminators `.!?` + space.
 *   4. If still too big, hard-slice at `maxChars`.
 *   5. Merge adjacent fragments into chunks up to `maxChars` with an
 *      optional overlap window of `overlap` characters so context at
 *      chunk boundaries isn't lost.
 *
 * Token estimation is approximated with characters-per-token because
 * we target all-MiniLM-L6-v2 which averages ~4 chars/token on English.
 * Callers can pass `maxChars` directly if they have a real tokenizer.
 */

/**
 * Per-chunk on-node body cap. Each chunk's text is persisted onto
 * GraphNode.summary up to this many chars; the read-side (ask, MCP
 * get_node, smart-hook) further truncates to ~400 for display, so
 * this is the storage cap, not the render floor.
 *
 * Single source of truth — was duplicated across application/ingest.ts
 * and daemon/job-runner.ts before the architectural review.
 */
export const NODE_BODY_MAX = 1500;

export interface ChunkOptions {
  /** Maximum characters per chunk. Default: 1200 (~300 tokens on English). */
  readonly maxChars?: number;
  /** Character overlap between adjacent chunks. Default: 100. */
  readonly overlap?: number;
  /** Minimum characters for a chunk to be emitted. Default: 80. */
  readonly minChars?: number;
}

export interface Chunk {
  /** Zero-indexed position of the chunk within the source text. */
  readonly index: number;
  /** The chunk text. Never empty. */
  readonly text: string;
  /** Character offset into the original source text. */
  readonly offset: number;
}

const DEFAULTS: Required<ChunkOptions> = {
  maxChars: 1200,
  overlap: 100,
  minChars: 80,
};

const SEPARATORS: readonly string[] = ['\n\n', '\n', '. ', '? ', '! ', '; ', ', ', ' '];

/**
 * Split a text into chunks. Returns an empty array for empty input.
 * Pure — same input produces same output byte-for-byte.
 */
export const chunk = (text: string, opts: ChunkOptions = {}): readonly Chunk[] => {
  const cfg: Required<ChunkOptions> = { ...DEFAULTS, ...opts };
  const normalized = normalize(text);
  if (normalized.length === 0) return [];

  // Recursive split — find the largest separator that breaks the
  // text into fragments all ≤ maxChars. Fall through separators in
  // order of coarseness.
  const fragments = splitRecursive(normalized, SEPARATORS, cfg.maxChars);

  // Merge fragments greedily into chunks with overlap.
  const chunks: Chunk[] = [];
  let buffer = '';
  let bufferOffset = 0;
  let cursor = 0;

  for (const frag of fragments) {
    if (frag.length === 0) {
      cursor += frag.length;
      continue;
    }
    // If adding this fragment would exceed maxChars, flush the buffer
    // and start a fresh chunk with the previous tail as overlap.
    if (buffer.length > 0 && buffer.length + frag.length > cfg.maxChars) {
      chunks.push({ index: chunks.length, text: buffer, offset: bufferOffset });
      const overlapTail = cfg.overlap > 0 ? tail(buffer, cfg.overlap) : '';
      buffer = overlapTail;
      bufferOffset = cursor - overlapTail.length;
    }
    if (buffer.length === 0) bufferOffset = cursor;
    buffer += frag;
    cursor += frag.length;
  }
  if (buffer.length >= cfg.minChars) {
    chunks.push({ index: chunks.length, text: buffer, offset: bufferOffset });
  } else if (chunks.length > 0 && buffer.length > 0) {
    // merge the small tail into the previous chunk
    const last = chunks[chunks.length - 1];
    chunks[chunks.length - 1] = {
      ...last,
      text: last.text + buffer,
    };
  } else if (buffer.length > 0) {
    // Single short chunk — emit it anyway so callers never lose input.
    chunks.push({ index: 0, text: buffer, offset: bufferOffset });
  }
  return chunks;
};

// ─────────────────────── internals ────────────────────────

/**
 * Recursively split `text` using the first separator in `separators`
 * that produces all-small-enough fragments, falling through to finer
 * separators as needed. Final fallback: hard-slice.
 */
const splitRecursive = (
  text: string,
  separators: readonly string[],
  maxChars: number,
): readonly string[] => {
  if (text.length <= maxChars) return [text];
  for (let i = 0; i < separators.length; i++) {
    const sep = separators[i];
    const pieces = splitPreservingSeparator(text, sep);
    if (pieces.length <= 1) continue;
    const tooBig = pieces.filter((p) => p.length > maxChars);
    if (tooBig.length === 0) return pieces;
    // some pieces are still too big — recurse on them with finer seps
    const out: string[] = [];
    for (const p of pieces) {
      if (p.length <= maxChars) out.push(p);
      else out.push(...splitRecursive(p, separators.slice(i + 1), maxChars));
    }
    return out;
  }
  // no separator worked — hard-slice
  const out: string[] = [];
  for (let i = 0; i < text.length; i += maxChars) out.push(text.slice(i, i + maxChars));
  return out;
};

/**
 * Split `text` on `sep` but keep `sep` attached to the preceding
 * fragment so the joined output equals the original.
 */
const splitPreservingSeparator = (text: string, sep: string): readonly string[] => {
  if (sep.length === 0 || !text.includes(sep)) return [text];
  const parts: string[] = [];
  let start = 0;
  while (start < text.length) {
    const at = text.indexOf(sep, start);
    if (at === -1) {
      parts.push(text.slice(start));
      break;
    }
    parts.push(text.slice(start, at + sep.length));
    start = at + sep.length;
  }
  return parts;
};

/**
 * Take the last `n` characters of `s`, respecting word boundaries
 * so we don't slice in the middle of a word. Falls back to raw
 * slice if no whitespace is found.
 */
const tail = (s: string, n: number): string => {
  if (s.length <= n) return s;
  const raw = s.slice(s.length - n);
  const space = raw.indexOf(' ');
  return space >= 0 ? raw.slice(space + 1) : raw;
};

/** Collapse runs of whitespace, trim, normalise line endings. */
const normalize = (text: string): string =>
  text.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
