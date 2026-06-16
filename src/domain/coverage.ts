/**
 * Coverage map (RFC-0003 OQ#3) — a transparent, no-LLM first cut at the
 * "did the evidence actually cover the question?" signal.
 *
 * This is deliberately NOT semantic fact extraction. It reports
 * **query-term coverage**: of the salient terms in the query, which ones
 * appear in the retrieved evidence text and which are missing. A low
 * ratio is a concrete reason to keep searching — and the missing terms
 * scope a *constrained* next search instead of a blanket "search the
 * web". It is computed only at borderline decisions (verify / search),
 * where the extra signal can move the call; clear use_memory / ask_user
 * cases don't pay for it. The honest framing matters: this measures term
 * presence, not understanding. The LLM-backed required-facts version is
 * the open question this stands in for.
 *
 * Pure data + pure functions. No I/O.
 */

export interface CoverageTerm {
  readonly term: string;
  readonly covered: boolean;
  /** node_ids whose text contains the term (empty when missing). */
  readonly evidence: readonly string[];
}

export interface CoverageMap {
  readonly query: string;
  /** Always 'heuristic-terms' in v1 — names the method so callers don't over-trust it. */
  readonly method: 'heuristic-terms';
  readonly required_terms: readonly string[];
  readonly covered: readonly CoverageTerm[];
  readonly missing: readonly CoverageTerm[];
  /** covered / required, rounded to 2dp; 1 when the query has no salient terms. */
  readonly coverage_ratio: number;
  /** Constrained next move: search only for what's missing. */
  readonly recommended_action: string;
}

/** One retrieval hit reduced to what coverage needs. */
export interface CoverageHit {
  readonly node_id: string;
  readonly text: string;
}

// Common English function words — dropped so coverage reflects the
// content terms a searcher actually cares about, not "how"/"the"/"is".
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with',
  'by', 'at', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'do',
  'does', 'did', 'how', 'what', 'why', 'when', 'where', 'which', 'who', 'whom',
  'this', 'that', 'these', 'those', 'i', 'you', 'it', 'my', 'our', 'your',
  'can', 'should', 'would', 'could', 'will', 'about', 'into', 'than', 'then',
  'use', 'using', 'get', 'set', 'via', 'vs', 'not', 'no', 'yes',
]);

const MAX_TERMS = 8;

/**
 * Extract salient terms from a query: quoted phrases kept whole, plus
 * content words (len ≥ 3, not a stopword), lowercased and deduped,
 * capped at MAX_TERMS in first-seen order.
 */
export const extractQueryTerms = (query: string): readonly string[] => {
  const terms: string[] = [];
  const seen = new Set<string>();
  const push = (t: string): void => {
    const k = t.trim().toLowerCase();
    if (k.length < 3 || STOPWORDS.has(k) || seen.has(k)) return;
    seen.add(k);
    terms.push(k);
  };
  // Quoted phrases first — they're the strongest signal of intent.
  const quoted = query.match(/"([^"]+)"|'([^']+)'/g) ?? [];
  for (const q of quoted) push(q.replace(/['"]/g, ''));
  // Then individual content tokens.
  for (const tok of query.toLowerCase().split(/[^a-z0-9.+#-]+/)) push(tok);
  return terms.slice(0, MAX_TERMS);
};

/**
 * Build a query-term coverage map over the retrieved hits. Pure.
 */
export const buildCoverageMap = (
  query: string,
  hits: readonly CoverageHit[],
): CoverageMap => {
  const required = extractQueryTerms(query);
  const texts = hits.map((h) => ({ node_id: h.node_id, text: h.text.toLowerCase() }));

  const covered: CoverageTerm[] = [];
  const missing: CoverageTerm[] = [];
  for (const term of required) {
    const evidence = texts.filter((t) => t.text.includes(term)).map((t) => t.node_id);
    (evidence.length > 0 ? covered : missing).push({
      term,
      covered: evidence.length > 0,
      evidence,
    });
  }

  const ratio = required.length === 0 ? 1 : covered.length / required.length;
  const recommended_action =
    missing.length === 0
      ? 'evidence covers the query terms — no constrained search needed'
      : `search only for the missing terms: ${missing.map((m) => m.term).join(', ')}`;

  return {
    query,
    method: 'heuristic-terms',
    required_terms: required,
    covered,
    missing,
    coverage_ratio: Math.round(ratio * 100) / 100,
    recommended_action,
  };
};
