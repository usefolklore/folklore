/**
 * Phase 23.9 (E11) — rule-based contextual enrichment.
 *
 * Prepends a deterministic metadata header to a text body BEFORE
 * embedding so the bi-encoder's vector includes date / participant /
 * session-id signal in the same fixed prefix shape every time. Targets
 * the `multi-session` and `temporal-reasoning` weak spots on
 * LongMemEval-S (10pp + 13pp headroom respectively per the Phase 21-23
 * loss analysis; see docs/research/sota-retrieval-synthesis.md).
 *
 * Write-path intervention — pays its cost at index time, costs nothing
 * at query time. Compounds with E1' (cross-encoder rerank), E2/E3
 * (embedder swap), and any read-path technique because the enriched
 * embedding is just a better embedding.
 *
 * No LLM calls. The prefix template is fixed so the same input yields
 * the same enrichment across runs and across peers — the embedding
 * contribution is stable, which is what makes this safe to switch on
 * at the bench-comparison layer without invalidating earlier numbers
 * once the suite reports rerun.
 *
 * Prefix shape (only non-empty fields render; empty meta → original
 * text unchanged):
 *
 *   [date: 2024-04-05] [session: alice-d3] [participants: alice, bob]
 *   [tags: marathon, berlin] [room: locomo]
 *   <original text body>
 *
 * Caps on list lengths (participants ≤ 8, tags ≤ 8, entities ≤ 12) keep
 * the prefix bounded so it doesn't eat into the model's 512-token
 * context window when bodies are already long.
 */

// ─────────────── meta shape ─────────────

export interface EnrichmentMeta {
  /**
   * Session / event timestamp in any ISO-like form. Folded into the
   * vector via the `[date: ...]` tag; downstream temporal-reasoning
   * questions ("when did X happen") get a stable date token to
   * latch onto.
   */
  readonly date?: string;
  /**
   * Stable session identifier (e.g. `alice-d3`, `D1`, the haystack
   * session id). Distinguishes near-duplicate session contents that
   * happen at different times.
   */
  readonly sessionId?: string;
  /**
   * Distinct human/agent participants in the session. For LoCoMo
   * conversations this is the set of unique `speaker` strings; for
   * LongMemEval it's typically just `user, assistant`.
   */
  readonly participants?: readonly string[];
  /**
   * Free-form tags — domain labels, room name, topic clusters.
   * Optional; included when the caller has them.
   */
  readonly tags?: readonly string[];
  /**
   * Extracted entities (names, places, numbers) — left empty in the
   * v1 helper since entity extraction is its own can of worms; reserved
   * for follow-up work that wires a rule-based or NER-based extractor.
   */
  readonly entities?: readonly string[];
}

// ─────────────── compose ─────────────

const PARTICIPANTS_CAP = 8;
const TAGS_CAP = 8;
const ENTITIES_CAP = 12;

const cleanField = (s: string): string =>
  s.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

const cleanList = (xs: readonly string[], cap: number): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of xs) {
    if (typeof x !== 'string') continue;
    const c = cleanField(x);
    if (c.length === 0) continue;
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= cap) break;
  }
  return out;
};

/**
 * Build the enriched text. Pure function — no I/O, deterministic per
 * (text, meta) input pair.
 *
 * Returns the original text unchanged when no meta fields resolve to
 * non-empty values, so callers can apply this unconditionally without
 * worrying about polluting un-enrichable nodes.
 */
export const enrichText = (text: string, meta: EnrichmentMeta): string => {
  const body = typeof text === 'string' ? text : '';
  const tags: string[] = [];

  if (meta.date && cleanField(meta.date).length > 0) {
    tags.push(`date: ${cleanField(meta.date)}`);
  }
  if (meta.sessionId && cleanField(meta.sessionId).length > 0) {
    tags.push(`session: ${cleanField(meta.sessionId)}`);
  }
  if (meta.participants && meta.participants.length > 0) {
    const ps = cleanList(meta.participants, PARTICIPANTS_CAP);
    if (ps.length > 0) tags.push(`participants: ${ps.join(', ')}`);
  }
  if (meta.tags && meta.tags.length > 0) {
    const ts = cleanList(meta.tags, TAGS_CAP);
    if (ts.length > 0) tags.push(`tags: ${ts.join(', ')}`);
  }
  if (meta.entities && meta.entities.length > 0) {
    const es = cleanList(meta.entities, ENTITIES_CAP);
    if (es.length > 0) tags.push(`entities: ${es.join(', ')}`);
  }

  if (tags.length === 0) return body;
  return `[${tags.join('] [')}]\n${body}`;
};

/**
 * Env-gate helper. Returns `true` when `AKASHIK_BENCH_CONTEXTUAL_ENRICH=1`,
 * matching the project convention for opt-in bench-time interventions.
 * Centralised so bench files don't each parse the env var.
 */
export const isContextualEnrichEnabled = (): boolean =>
  process.env.AKASHIK_BENCH_CONTEXTUAL_ENRICH === '1';
