/**
 * Entity extraction — pure heuristic pass over a chunk's text.
 *
 * v1 policy:
 *   1. Registered aliases — case-insensitive whole-word match. This
 *      is the user-curated channel (the only one that can catch
 *      lowercase brand names like "lemlist" or compound names like
 *      "claude code"). Source of truth.
 *   2. Capitalised identifier heuristic — runs of letters/digits
 *      starting with an uppercase letter, length ≥ 3, NOT all-caps
 *      (filters out ACRONYMS like HTTP). Catches PascalCase code
 *      symbols and Title-Cased product names.
 *   3. URL hostname extraction — `lemlist.com` → 'lemlist.com' alias
 *      surface; the host gets registered as a `url`-kind entity.
 *   4. GitHub repo pattern — `github.com/owner/repo` → 'owner/repo'.
 *
 * Heuristics never overwrite registered entries; if 'Lemlist' (Cap-
 * heuristic) and 'lemlist' (registered) both fire, the registered
 * entity wins because lookup goes through the registry first.
 *
 * No NER model. The shape is built so a v2 swap to a sidecar NER
 * (spaCy / transformers.js) can replace `extractMentions` without
 * touching callers.
 */

import { type Entity, type Mention, entityId, normaliseAlias } from './entity.js';

// ─────────────── deps ─────────────────────

/**
 * The extractor consults the registry for alias resolution AND
 * lazily registers heuristic-detected entities. We pass minimal
 * read/write functions instead of the full registry interface so
 * the extractor stays in the domain layer (no infra import).
 */
export interface ExtractDeps {
  readonly resolveAlias: (surface: string) => Entity | undefined;
  /**
   * Auto-register a heuristic entity. The implementation may dedupe
   * by id and merge aliases. Returns the canonical Entity that
   * should be referenced in `Mention.entity_id`.
   *
   * Heuristic captures are stamped `auto: true` so the registry
   * can hide them from `entity list` by default and surface only
   * user-curated entries (which is what the user actually cares
   * about). Recall still finds auto-entries.
   */
  readonly autoRegister: (input: {
    readonly label: string;
    readonly type: 'product' | 'symbol' | 'url' | 'repo' | 'concept' | 'unknown';
    readonly aliases?: readonly string[];
    readonly auto?: boolean;
  }) => Entity;
}

// ─────────────── tunables ─────────────────

const CAP_IDENT_MIN_LEN = 3;
const CAP_IDENT_MAX_LEN = 40;

// Small stoplist to avoid matching ordinary capitalised English.
// Not exhaustive — that's what NER is for. Just kills the most
// common false positives that would flood the entity table.
const CAP_STOPLIST = new Set<string>([
  'The', 'This', 'That', 'These', 'Those', 'Their', 'There',
  'When', 'What', 'Where', 'While', 'Which', 'Who', 'Why', 'How',
  'And', 'But', 'For', 'Not', 'Are', 'Was', 'Were', 'Has', 'Have',
  'Had', 'Will', 'Would', 'Could', 'Should', 'May', 'Might', 'Can',
  'Must', 'Did', 'Does', 'Done',
  'Yes', 'No', 'Maybe',
  'A', 'An', 'I',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  'January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December',
]);

// ─────────────── extraction ───────────────

/**
 * Find every alias from the registry that occurs in `text` as a
 * whole word, case-insensitive. Returns Mention with span pointers
 * into `text` (first occurrence per alias only — repeats collapse
 * into one mention to avoid weighting one chunk that says "lemlist"
 * 30 times as 30 distinct mentions).
 */
const findRegisteredMentions = (text: string, deps: ExtractDeps): Mention[] => {
  const out: Mention[] = [];
  const seen = new Set<string>();
  const lower = text.toLowerCase();
  // We don't have the full registry list here — instead, iterate
  // alias matches by walking the text and asking the registry for
  // each candidate. That would be O(text²) on every call. Pragmatic
  // alternative: a single regex of all words; for each unique word
  // we ask the registry once (deduped via `seen`).
  const wordRx = /[a-zA-Z][a-zA-Z0-9._-]*/g;
  let m: RegExpExecArray | null;
  while ((m = wordRx.exec(lower)) !== null) {
    const surface = m[0];
    if (surface.length < 2) continue;
    if (seen.has(surface)) continue;
    seen.add(surface);
    const ent = deps.resolveAlias(surface);
    if (!ent) continue;
    out.push({
      entity_id: ent.id,
      surface: text.slice(m.index, m.index + surface.length),
      start: m.index,
      end: m.index + surface.length,
    });
  }
  // Multi-word alias pass — phrase aliases like "claude code". Walk
  // every alias on every entity that contains a space; check
  // substring match. Bounded by registry size (small).
  // We can't iterate the registry from here; the deps interface
  // doesn't expose a list, by design. Multi-word aliases are
  // resolved by the caller running `resolveAlias` on n-gram
  // candidates if needed — left as a v2 enhancement.
  return out;
};

const findCapitalisedIdents = (text: string, deps: ExtractDeps): Mention[] => {
  const out: Mention[] = [];
  const seen = new Set<string>();
  const rx = /\b[A-Z][a-zA-Z0-9]{2,}\b/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text)) !== null) {
    const surface = m[0];
    if (surface.length > CAP_IDENT_MAX_LEN) continue;
    if (surface.length < CAP_IDENT_MIN_LEN + 1) continue;
    if (CAP_STOPLIST.has(surface)) continue;
    // All-caps acronyms — skip (HTTP, JSON, RFC, etc).
    if (surface === surface.toUpperCase()) continue;
    const norm = normaliseAlias(surface);
    if (seen.has(norm)) continue;
    seen.add(norm);
    // Don't double-count if the registry already owns this surface.
    if (deps.resolveAlias(surface)) continue;
    // Heuristic auto-register as 'symbol' (most likely a code id
    // when it's CamelCase). The registry will dedupe on subsequent
    // hits.
    const ent = deps.autoRegister({ label: surface, type: 'symbol', auto: true });
    out.push({
      entity_id: ent.id,
      surface,
      start: m.index,
      end: m.index + surface.length,
    });
  }
  return out;
};

const findUrlHosts = (text: string, deps: ExtractDeps): Mention[] => {
  const out: Mention[] = [];
  const seen = new Set<string>();
  const rx = /https?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?:\/[^\s)>"']*)?/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text)) !== null) {
    const host = m[1].toLowerCase();
    if (seen.has(host)) continue;
    seen.add(host);
    if (deps.resolveAlias(host)) {
      const ent = deps.resolveAlias(host)!;
      out.push({
        entity_id: ent.id,
        surface: host,
        start: m.index + m[0].indexOf(host),
        end: m.index + m[0].indexOf(host) + host.length,
      });
      continue;
    }
    const ent = deps.autoRegister({ label: host, type: 'url', aliases: [host], auto: true });
    out.push({
      entity_id: ent.id,
      surface: host,
      start: m.index + m[0].indexOf(host),
      end: m.index + m[0].indexOf(host) + host.length,
    });
  }
  return out;
};

const findGithubRepos = (text: string, deps: ExtractDeps): Mention[] => {
  const out: Mention[] = [];
  const seen = new Set<string>();
  // github.com/owner/repo — owner/repo are alphanumeric + - + _
  const rx = /github\.com\/([a-zA-Z0-9][a-zA-Z0-9_-]*)\/([a-zA-Z0-9][a-zA-Z0-9._-]*)/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text)) !== null) {
    const owner = m[1];
    const repo = m[2];
    const slug = `${owner}/${repo}`;
    if (seen.has(slug)) continue;
    seen.add(slug);
    const existing = deps.resolveAlias(slug);
    const ent = existing ?? deps.autoRegister({
      label: slug,
      type: 'repo',
      aliases: [slug, `github.com/${slug}`],
      auto: true,
    });
    const start = m.index + m[0].indexOf(slug);
    out.push({
      entity_id: ent.id,
      surface: slug,
      start,
      end: start + slug.length,
    });
  }
  return out;
};

/**
 * Run every extractor over a single chunk's text. Returns deduped
 * mentions (one per entity_id, first occurrence wins).
 */
export const extractMentions = (text: string, deps: ExtractDeps): readonly Mention[] => {
  const all: Mention[] = [];
  all.push(...findRegisteredMentions(text, deps));
  all.push(...findGithubRepos(text, deps));   // before url-host so repo wins on github.com
  all.push(...findUrlHosts(text, deps));
  all.push(...findCapitalisedIdents(text, deps));
  // Dedupe on entity_id — keep earliest start.
  const byId = new Map<string, Mention>();
  for (const m of all) {
    const prev = byId.get(m.entity_id);
    if (!prev || m.start < prev.start) byId.set(m.entity_id, m);
  }
  return Array.from(byId.values());
};

// Pure helper for tests / future use — silence unused.
void entityId;
