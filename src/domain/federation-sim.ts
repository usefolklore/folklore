// V5: room dimension removed; benchmark scoring logic deferred to Phase 25 (AkashikBench-F redesign).
//
// Niche-evaporation was the room-membership metric this simulator used to
// surface in V4. With rooms gone, the metric has no domain to compute
// against — see `simulateNicheEvaporation` below for the deferred-OK stub.

/**
 * Phase 24 (Akashik) — federation simulator (pure domain).
 *
 * Per the Round 5 octopus-discover synthesis
 * (docs/research/octopus-discover/round-5-2026-05-26/),
 * **AkashikBench-F** is the only benchmark that can falsify or
 * validate the federated-commons thesis. The current public-corpus
 * benchmarks (LongMemEval, LoCoMo, BEIR) measure *single-peer*
 * retrieval quality, not the compounding the mission claims.
 *
 * This module is the simulator — deterministic, pure, in-process,
 * boolean-set abstraction over the actual retrieval mechanism. It
 * answers exactly one question:
 *
 *   "Given N peers, a Zipfian query stream, an offline-churn rate,
 *    and the ambitioned-curator + curiosity-driven cache-fill
 *    mechanism — does the network's web_fallback_rate fall over
 *    time, and how fast does a newly-acquired fact propagate to
 *    half the network?"
 *
 * Boolean abstraction: each peer either holds doc D or it doesn't.
 * This deliberately ignores retrieval-quality concerns (R@K /
 * NDCG / MRR — those are measured separately by the public-corpus
 * benches). What this measures is *federation dynamics* under
 * realistic churn + curiosity patterns. v2 plugs in real retrieval
 * per peer; v1 keeps the dynamics testable in seconds, not hours.
 *
 * No I/O. No clock. No randomness without a seed. The whole sim
 * runs in a single process and is deterministic given (config,
 * seed, corpus, query-stream).
 */

// ─────────────── seeded PRNG ─────────────

/**
 * xorshift32 — fast deterministic PRNG. Same algorithm as the
 * listwise-rerank shuffle (`src/domain/llm-listwise-rerank.ts`),
 * keeping behaviour consistent across deterministic-replay paths.
 */
const xorshift32 = (seed: number): (() => number) => {
  let s = seed === 0 ? 1 : seed >>> 0;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return (s >>> 0) / 0xFFFFFFFF;
  };
};

// ─────────────── corpus ─────────────

/**
 * A `Query` in this simulation universe — an identifier the
 * Zipfian sampler can refer to, plus the set of ground-truth gold
 * document IDs (≥ 1) that satisfy the query. Boolean abstraction:
 * "the peer has the answer" iff the peer holds ANY gold doc.
 *
 * For the strict-all-gold semantic (LoCoMo-style), the consuming
 * harness can change `goldFound` to require ALL gold IDs present
 * before counting it as satisfied.
 */
export interface SimQuery {
  readonly id: string;
  readonly goldDocs: ReadonlyArray<string>;
}

export interface SimCorpus {
  readonly queries: ReadonlyArray<SimQuery>;
  /** All doc IDs that exist in the universe — used to seed peer shards. */
  readonly allDocs: ReadonlyArray<string>;
}

// ─────────────── config ─────────────

export interface SimConfig {
  readonly numPeers: number;
  /** Total simulation steps (one query per step). */
  readonly numSteps: number;
  /** Per-step probability that any given peer is offline. */
  readonly offlineProbability: number;
  /**
   * Zipfian shape parameter for the query stream. α=0 → uniform
   * (every query equally likely); α=1 → classic Zipf (popularity
   * tail). The Round 5 brief specifies a Zipfian stream as the
   * realistic shape for OSS-community curiosity.
   */
  readonly zipfAlpha: number;
  /** PRNG seed — deterministic replay key. */
  readonly seed: number;
  /**
   * Fraction of `allDocs` each peer's initial shard contains.
   * The simulator enforces shard *disjointness* — no doc starts
   * on two peers. Round 5 specifies disjoint seeding to prevent
   * "Corpus Contamination" inflating false compounding.
   */
  readonly initialShardFraction: number;
  /**
   * Verbose per-step logging (off by default — bench harness
   * decides when to emit progress).
   */
  readonly trace?: boolean;
}

// ─────────────── outcomes ─────────────

export type ResolveSource = 'local' | 'federation' | 'web';

export interface SimEvent {
  readonly t: number;
  readonly queryId: string;
  readonly askingPeer: string;
  readonly source: ResolveSource;
  readonly servingPeer?: string;
  readonly goldFound: boolean;
  readonly peersOnline: number;
  /**
   * Doc IDs the asking peer now holds after this event. Useful
   * for downstream propagation analysis (which peer learned what
   * at which time).
   */
  readonly askerLearned: ReadonlyArray<string>;
}

export interface SimResult {
  readonly events: ReadonlyArray<SimEvent>;
  readonly peerStates: ReadonlyMap<string, ReadonlySet<string>>;
}

// ─────────────── Zipfian sampler ─────────────

/**
 * Build a Zipfian sampler over [0, n) with shape parameter α.
 * Uses inverse CDF — O(log n) per sample after O(n) setup.
 * Deterministic for a given PRNG.
 */
const zipfianSampler = (
  n: number,
  alpha: number,
  rng: () => number,
): (() => number) => {
  if (alpha === 0 || n <= 1) {
    return () => Math.floor(rng() * n);
  }
  // CDF: P(rank ≤ k) ∝ Σ_{i=1..k} (1/i^α)
  const cdf: number[] = new Array(n);
  let total = 0;
  for (let i = 1; i <= n; i++) {
    total += 1 / Math.pow(i, alpha);
    cdf[i - 1] = total;
  }
  for (let i = 0; i < n; i++) cdf[i] /= total;

  return () => {
    const r = rng();
    // Binary search for first cdf[i] >= r
    let lo = 0, hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (cdf[mid] >= r) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  };
};

// ─────────────── simulator ─────────────

/**
 * Run the federation simulation. Pure: given (corpus, config), the
 * result is deterministic and replay-friendly.
 *
 * Loop per step:
 *   1. Roll online/offline state for every peer (independent
 *      Bernoulli trials with `offlineProbability`).
 *   2. Sample a query from the Zipfian stream.
 *   3. Pick an *online* peer uniformly at random as the asker.
 *   4. Local lookup → if any gold doc present, satisfy locally.
 *   5. Else fan out to other online peers → if any of them holds
 *      any gold doc, federation hit; asker pulls the matching
 *      docs into its own local set (cross-peer transfer = caching).
 *   6. Else web fallback → asker fetches gold docs from the
 *      "controlled oracle web corpus" (i.e. the simulator's
 *      ground-truth gold set for that query) and saves them
 *      locally. Asker is now the ambitioned curator.
 *   7. Emit a `SimEvent` describing what happened.
 *
 * If no peer is online at all in a step (rare under reasonable
 * churn), the step is skipped — no query was askable.
 */
export const runFederationSim = (corpus: SimCorpus, config: SimConfig): SimResult => {
  const rng = xorshift32(config.seed);
  const sampler = zipfianSampler(corpus.queries.length, config.zipfAlpha, rng);

  // Initial sharding — disjoint per peer, leftovers stay on the
  // "web oracle" (i.e. nobody knows them locally until asked).
  const peers: { id: string; docs: Set<string> }[] = [];
  const allDocs = corpus.allDocs;
  const shardSize = Math.floor(allDocs.length * config.initialShardFraction);
  // Deterministically shuffle docs once, then partition into N
  // shards of `shardSize` each. Anything past N×shardSize starts
  // un-cached on any peer (web-only knowledge).
  const shuffled = [...allDocs];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  for (let p = 0; p < config.numPeers; p++) {
    const start = p * shardSize;
    const end = Math.min(start + shardSize, shuffled.length);
    peers.push({
      id: `peer-${p}`,
      docs: new Set(shuffled.slice(start, end)),
    });
  }

  const events: SimEvent[] = [];

  for (let t = 0; t < config.numSteps; t++) {
    // 1. roll online state
    const online: typeof peers = [];
    for (const p of peers) {
      if (rng() >= config.offlineProbability) online.push(p);
    }
    if (online.length === 0) continue;

    // 2. sample query
    const qIdx = sampler();
    const q = corpus.queries[qIdx];

    // 3. asker = uniform random online peer
    const asker = online[Math.floor(rng() * online.length)];

    // 4. local lookup — every branch below assigns source/goldFound.
    let source: ResolveSource;
    let servingPeer: string | undefined = asker.id;
    let goldFound: boolean;
    const askerLearned: string[] = [];

    const localHit = q.goldDocs.find((d) => asker.docs.has(d));
    if (localHit !== undefined) {
      source = 'local';
      goldFound = true;
    } else {
      // 5. federation fan-out (other online peers)
      let federationHitDoc: string | undefined;
      let federationHitPeer: string | undefined;
      for (const p of online) {
        if (p.id === asker.id) continue;
        const hit = q.goldDocs.find((d) => p.docs.has(d));
        if (hit !== undefined) {
          federationHitDoc = hit;
          federationHitPeer = p.id;
          break;
        }
      }
      if (federationHitDoc !== undefined) {
        source = 'federation';
        servingPeer = federationHitPeer;
        goldFound = true;
        // Cross-peer transfer: asker pulls ALL of the query's gold
        // docs that any online peer holds (best-effort caching of
        // everything related to the asker's question).
        for (const p of online) {
          for (const d of q.goldDocs) {
            if (p.docs.has(d) && !asker.docs.has(d)) {
              asker.docs.add(d);
              askerLearned.push(d);
            }
          }
        }
      } else {
        // 6. web fallback — fetch all gold docs from the oracle
        source = 'web';
        servingPeer = undefined;
        goldFound = true;
        for (const d of q.goldDocs) {
          if (!asker.docs.has(d)) {
            asker.docs.add(d);
            askerLearned.push(d);
          }
        }
      }
    }

    events.push({
      t,
      queryId: q.id,
      askingPeer: asker.id,
      source,
      servingPeer,
      goldFound,
      peersOnline: online.length,
      askerLearned,
    });
  }

  const peerStates = new Map<string, ReadonlySet<string>>();
  for (const p of peers) peerStates.set(p.id, p.docs);

  return { events, peerStates };
};

// ─────────────── metrics ─────────────

/**
 * Web-fallback rate as a function of time, computed over a sliding
 * window of `windowSize` events. Returns one point per non-empty
 * window. The Round 5 brief defines compounding as the **negative
 * slope of `web_fallback_rate` over the simulation** — if knowledge
 * is genuinely compounding, fewer queries should fall back to the
 * web as the network learns.
 */
export const webFallbackRateOverTime = (
  events: readonly SimEvent[],
  windowSize: number,
): ReadonlyArray<{ t: number; rate: number; n: number }> => {
  if (events.length === 0 || windowSize <= 0) return [];
  const out: { t: number; rate: number; n: number }[] = [];
  for (let i = windowSize; i <= events.length; i += windowSize) {
    const window = events.slice(i - windowSize, i);
    const webs = window.filter((e) => e.source === 'web').length;
    out.push({
      t: window[window.length - 1]?.t ?? i - 1,
      rate: webs / window.length,
      n: window.length,
    });
  }
  return out;
};

/**
 * Linear-regression slope (least squares) of (t, rate) points.
 * `compoundingSlope < 0` means the network is learning: web
 * fallback rate falls over time. `≈ 0` means no compounding.
 * `> 0` is degradation (rare in this simulator; would indicate
 * something pathological like query-distribution drift).
 */
export const compoundingSlope = (
  rates: ReadonlyArray<{ t: number; rate: number }>,
): number => {
  const n = rates.length;
  if (n < 2) return 0;
  let sumT = 0, sumR = 0, sumTT = 0, sumTR = 0;
  for (const { t, rate } of rates) {
    sumT += t; sumR += rate;
    sumTT += t * t; sumTR += t * rate;
  }
  const denom = n * sumTT - sumT * sumT;
  if (denom === 0) return 0;
  return (n * sumTR - sumT * sumR) / denom;
};

/**
 * Propagation half-life — for each document that was *first*
 * introduced to the network via a web-fallback event, measure the
 * number of subsequent simulation steps until at least 50% of
 * peers hold that document. Returns the median half-life across
 * all such documents (∞ for documents that never reached 50%).
 *
 * The half-life is a property of how quickly newly-acquired
 * knowledge spreads through curiosity-driven federation — the
 * core operational claim of the Akashik mechanism.
 */
export const propagationHalfLife = (
  events: readonly SimEvent[],
  numPeers: number,
): { median: number; everReached: number; never: number } => {
  // For every web-fallback event, the docs in `askerLearned` are
  // "newly introduced" at time t. We then count how many later
  // events caused those docs to spread to additional peers.
  const halfThreshold = Math.ceil(numPeers * 0.5);

  // Track per-doc: { introducedAt, peersHolding (set) }
  type DocTrack = { introducedAt: number; peers: Set<string>; halfLifeT: number | null };
  const tracker = new Map<string, DocTrack>();

  for (const e of events) {
    if (e.source === 'web') {
      for (const d of e.askerLearned) {
        if (!tracker.has(d)) {
          tracker.set(d, {
            introducedAt: e.t,
            peers: new Set([e.askingPeer]),
            halfLifeT: null,
          });
        }
      }
    } else if (e.source === 'federation') {
      // The asker just learned `askerLearned` from another peer.
      for (const d of e.askerLearned) {
        const dt = tracker.get(d);
        if (!dt || dt.halfLifeT !== null) continue;
        dt.peers.add(e.askingPeer);
        if (dt.peers.size >= halfThreshold) {
          dt.halfLifeT = e.t - dt.introducedAt;
        }
      }
    }
  }

  const halfLives: number[] = [];
  let never = 0;
  for (const dt of tracker.values()) {
    if (dt.halfLifeT === null) never++;
    else halfLives.push(dt.halfLifeT);
  }
  if (halfLives.length === 0) {
    return { median: Number.POSITIVE_INFINITY, everReached: 0, never };
  }
  halfLives.sort((a, b) => a - b);
  const mid = Math.floor(halfLives.length / 2);
  const median = halfLives.length % 2 === 0
    ? (halfLives[mid - 1] + halfLives[mid]) / 2
    : halfLives[mid];
  return { median, everReached: halfLives.length, never };
};

/**
 * Niche-evaporation metric — DEFERRED to Phase 25 (AkashikBench-F
 * redesign). The original V4 implementation measured how quickly a
 * topical room's signal evaporated as its hosting peers churned
 * offline. With the room dimension removed in V5, the metric has no
 * domain to compute against.
 *
 * This stub keeps the export surface stable so any external callers
 * compile and receive an explicit "deferred" marker. The semantics
 * will be redesigned in Phase 25 around per-document propagation
 * dynamics (similar in spirit to `propagationHalfLife`) without
 * appealing to a room-membership axis.
 */
export const simulateNicheEvaporation = (): {
  readonly ratio: number;
  readonly deferred: boolean;
  readonly reason: string;
} => ({
  ratio: 0,
  deferred: true,
  reason: 'Phase 25 will redesign without room dimension',
});

/**
 * Cumulative resolve-source breakdown — how many queries were
 * satisfied locally, by federation, vs falling through to the web.
 * Useful as a summary stat alongside the time-series ladder.
 */
export const resolveSourceCounts = (
  events: readonly SimEvent[],
): { local: number; federation: number; web: number; total: number } => {
  let local = 0, federation = 0, web = 0;
  for (const e of events) {
    if (e.source === 'local') local++;
    else if (e.source === 'federation') federation++;
    else if (e.source === 'web') web++;
  }
  return { local, federation, web, total: events.length };
};
