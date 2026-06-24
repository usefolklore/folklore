/**
 * Pure information-retrieval evaluation metrics.
 *
 * Three classics under binary relevance — the eval harness operates
 * on `(retrieved, relevant)` tuples and aggregates over many queries.
 *
 * Pure: no I/O, no clock, deterministic. Lives in domain so the
 * application/CLI layers and any future test fixture can share it.
 */

/**
 * Recall@k under binary relevance.
 *
 *   recall@k = |relevant ∩ top_k| / |relevant|
 *
 * Returns 0 when `relevant` is empty (vacuous — no signal possible).
 * Always in [0, 1].
 */
export const recallAtK = (
  retrieved: readonly string[],
  relevant: ReadonlySet<string>,
  k: number,
): number => {
  if (relevant.size === 0) return 0;
  let hits = 0;
  const top = retrieved.slice(0, k);
  for (const id of top) if (relevant.has(id)) hits++;
  return hits / relevant.size;
};

/**
 * recall_any@k — binary: 1 if ANY relevant item appears in top-k, else 0.
 *
 * This is the metric agentmemory and most LongMemEval retrieval reports
 * use ("does any gold session appear in top-K"). It differs sharply from
 * `recallAtK` (fraction of gold found) when a query has multiple gold
 * items: finding 1 of 3 gold scores 1.0 here but 0.33 under recallAtK.
 * Use this for apples-to-apples comparison against published recall@k.
 */
export const recallAnyAtK = (
  retrieved: readonly string[],
  relevant: ReadonlySet<string>,
  k: number,
): number => {
  if (relevant.size === 0) return 0;
  const top = retrieved.slice(0, k);
  for (const id of top) if (relevant.has(id)) return 1;
  return 0;
};

/**
 * Normalised Discounted Cumulative Gain at k under binary relevance.
 *
 *   DCG@k  = sum_{i=1..k}  rel_i / log2(i + 1)
 *   IDCG@k = sum_{i=1..min(k, |R|)} 1 / log2(i + 1)
 *   NDCG@k = DCG@k / IDCG@k    (0 if IDCG is 0)
 *
 * Always in [0, 1].
 */
export const ndcgAtK = (
  retrieved: readonly string[],
  relevant: ReadonlySet<string>,
  k: number,
): number => {
  if (relevant.size === 0) return 0;
  let dcg = 0;
  const top = retrieved.slice(0, k);
  for (let i = 0; i < top.length; i++) {
    if (relevant.has(top[i])) dcg += 1 / Math.log2(i + 2);
  }
  let idcg = 0;
  const idealCount = Math.min(k, relevant.size);
  for (let i = 0; i < idealCount; i++) idcg += 1 / Math.log2(i + 2);
  return idcg === 0 ? 0 : dcg / idcg;
};

/**
 * Reciprocal rank of the first relevant item, 0 if no relevant item
 * was retrieved at all. Aggregating MRR = mean of these.
 */
export const reciprocalRank = (
  retrieved: readonly string[],
  relevant: ReadonlySet<string>,
): number => {
  for (let i = 0; i < retrieved.length; i++) {
    if (relevant.has(retrieved[i])) return 1 / (i + 1);
  }
  return 0;
};
