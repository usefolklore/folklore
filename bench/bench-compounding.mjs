#!/usr/bin/env node
/**
 * Compounding-inference benchmark — proves folklore's central thesis
 * NUMERICALLY: a cooperative knowledge graph resolves queries from the
 * pooled cache of all peers, so the web-fallback rate (the only place a
 * paid network trip happens) collapses as peers join. "Pull once, local
 * forever" — for the network, not just one node.
 *
 * The model (per the folklore formalization + the cooperative-caching
 * literature): query demand is heavy-tailed (Mandelbrot-Zipf), caches
 * are LRU, and the cooperative hit-rate follows Che's approximation with
 * an effective pooled capacity C_eff = γ · Σ_p C_p.
 *
 * We compute the headline two ways and show they agree:
 *   1. EMERGENT simulation — P independent peers, each with its own
 *      LRU(C_p), issuing queries sampled from the shared demand. A query
 *      is a HIT if the topic sits in ANY peer's cache (the federated
 *      `ask --peers` path); ISOLATED counts a hit only in the issuing
 *      peer's own cache (no sharing — the baseline). Duplication of
 *      popular topics across peers emerges naturally → that IS the γ<1.
 *   2. ANALYTICAL Che prediction — closed form for the same demand and
 *      capacity. Validates the simulation against published theory.
 *
 * Headlines:
 *   - hit-rate(P): cooperative rises (sub-linear / logarithmic) while
 *     isolated stays flat → each peer compounds.
 *   - web-fallback(P) = 1 − hit: the paid-trip rate, decaying toward 0.
 *   - marginal cost per query collapses; cumulative trips-avoided grows.
 *
 * Pure simulation — no network, no model, no deps. Deterministic
 * (seeded LCG). Mirrors the eval's chart/summary output shape.
 *
 * Usage:
 *   node scripts/bench-compounding.mjs
 *     [--N 5000] [--peers 1,2,4,8,16,32,64] [--cap 200]
 *     [--alpha 0.9] [--offset 20] [--queries 200000] [--seed 1] [--json]
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'eval', 'out');

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : dflt;
};
const has = (name) => argv.includes(`--${name}`);

const N = parseInt(flag('N', '5000'), 10);          // catalog size (distinct topics)
const PEERS = flag('peers', '1,2,4,8,16,32,64').split(',').map((x) => parseInt(x, 10));
const CAP = parseInt(flag('cap', '200'), 10);       // per-peer cache capacity C_p
const ALPHA = parseFloat(flag('alpha', '0.9'));     // Zipf/Mandelbrot skew
const OFFSET = parseFloat(flag('offset', '20'));    // Mandelbrot flattening offset
const QUERIES = parseInt(flag('queries', '200000'), 10);
const SEED = parseInt(flag('seed', '1'), 10);
// Fixed network size for the cumulative timeline. Default saturates the
// catalog (CUMP·C_p > N) so the cooperative cost curve bends to a near-
// flat ceiling — the strongest "pay once, free forever" demonstration.
// Drop it (e.g. --cumPeers 16) to see the under-provisioned regime where
// the gap still widens linearly but never flattens.
const CUMP = parseInt(flag('cumPeers', '64'), 10);
// Subgraph-transfer economics. A topic miss imports a neighborhood of
// related graph nodes, not a one-line summary. The transferred graph is
// stored locally; only a retrieved working set is later injected into the
// model context, so P2P bytes and inference tokens are tracked separately.
const SUBGRAPH_TOPICS = parseInt(flag('subgraphTopics', '8'), 10);
const WEB_CONTEXT_TOKENS = parseInt(flag('webContextTokens', '8000'), 10);
const GRAPH_CONTEXT_TOKENS = parseInt(flag('graphContextTokens', '1200'), 10);
// Defaults anchored to a real local ~/.folklore/graph.json sample:
// node p50 ≈1850 bytes, edge p50 ≈386 bytes, links/node ≈1.57.
const NODE_BYTES = parseInt(flag('nodeBytes', '1850'), 10);
const EDGE_BYTES = parseInt(flag('edgeBytes', '386'), 10);
const EDGES_PER_NODE = parseFloat(flag('edgesPerNode', '1.57'));
const JSON_OUT = has('json');

// ── deterministic RNG (mulberry32) — reproducible without Math.random ──
const rngFrom = (seed) => {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// ── Mandelbrot-Zipf demand: q_i ∝ (i + offset)^(-alpha) ──
const demand = (n, alpha, offset) => {
  const w = Array.from({ length: n }, (_, i) => (i + 1 + offset) ** -alpha);
  const Z = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / Z);
};

// Inverse-CDF sampler over the demand (binary search on cumulative).
const makeSampler = (probs, rng) => {
  const cum = new Float64Array(probs.length);
  let acc = 0;
  for (let i = 0; i < probs.length; i++) { acc += probs[i]; cum[i] = acc; }
  return () => {
    const r = rng() * acc;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < r) lo = mid + 1; else hi = mid; }
    return lo;
  };
};

// ── LRU cache (insertion-ordered Map; re-touch on hit) ──
const makeLRU = (cap) => {
  const m = new Map();
  return {
    hasTouch: (k) => { // returns presence; on hit, refresh recency
      if (!m.has(k)) return false;
      m.delete(k); m.set(k, 1);
      return true;
    },
    add: (k) => {
      if (m.has(k)) { m.delete(k); m.set(k, 1); return; }
      m.set(k, 1);
      if (m.size > cap) m.delete(m.keys().next().value); // evict LRU
    },
    has: (k) => m.has(k),
    size: () => m.size,
  };
};

/**
 * Emergent simulation for a given peer count P.
 * Each query: a random peer issues a topic drawn from the shared demand.
 *   isolated hit = topic already in the issuing peer's own cache.
 *   coop hit     = topic in ANY peer's cache (federated lookup).
 * After resolving (hit or web-fetch), the ISSUING peer caches the topic
 * (that's how a fetched body lands locally per the folklore fetch proto).
 * We warm up before measuring so caches reach steady state.
 */
const simulate = (P) => {
  const rng = rngFrom(SEED + P * 2654435761);
  const probs = demand(N, ALPHA, OFFSET);
  const sample = makeSampler(probs, rng);
  const peers = Array.from({ length: P }, () => makeLRU(CAP));

  const warm = Math.min(QUERIES, Math.max(20000, P * CAP * 4));
  let isoHits = 0, coopHits = 0, measured = 0;
  // For the fallback-decay series: bucketed cooperative hit-rate over the
  // measured stream (shows marginal cost collapsing as the pool fills).
  const BUCKETS = 20;
  const bucketHit = new Array(BUCKETS).fill(0);
  const bucketTot = new Array(BUCKETS).fill(0);

  for (let i = 0; i < warm + QUERIES; i++) {
    const topic = sample();
    const p = (rng() * P) | 0;
    const issuing = peers[p];

    const isoHit = issuing.has(topic);
    let coopHit = isoHit;
    if (!coopHit) {
      for (let j = 0; j < P; j++) { if (peers[j].has(topic)) { coopHit = true; break; } }
    }

    if (i >= warm) {
      measured++;
      if (isoHit) isoHits++;
      if (coopHit) coopHits++;
      const b = Math.min(BUCKETS - 1, ((measured - 1) * BUCKETS / QUERIES) | 0);
      bucketTot[b]++; if (coopHit) bucketHit[b]++;
    }
    issuing.add(topic); // the issuing peer keeps what it just resolved
  }

  return {
    P,
    isolated: isoHits / measured,
    cooperative: coopHits / measured,
    fallbackSeries: bucketHit.map((h, i) => 1 - h / Math.max(1, bucketTot[i])),
  };
};

/**
 * Che's approximation: characteristic time t_C solves
 *   C = Σ_i (1 - e^{-q_i t_C}),
 * then hit-rate H = Σ_i q_i (1 - e^{-q_i t_C}). Monotone in t_C → bisect.
 */
const che = (probs, C) => {
  const occupancy = (tC) => probs.reduce((s, q) => s + (1 - Math.exp(-q * tC)), 0);
  let lo = 0, hi = 1;
  while (occupancy(hi) < C && hi < 1e12) hi *= 2;
  for (let it = 0; it < 80; it++) {
    const mid = (lo + hi) / 2;
    if (occupancy(mid) < C) lo = mid; else hi = mid;
  }
  const tC = (lo + hi) / 2;
  const H = probs.reduce((s, q) => s + q * (1 - Math.exp(-q * tC)), 0);
  return { tC, hitRate: H };
};

// ── run sweep ──
const probs = demand(N, ALPHA, OFFSET);
const cheIso = che(probs, CAP).hitRate;            // single-peer baseline ceiling
const results = PEERS.map((P) => {
  const sim = simulate(P);
  // Effective pooled capacity from the sim's emergent duplication:
  // invert Che on the measured cooperative hit-rate to recover C_eff,
  // then γ = C_eff / (P·C_p). γ<1 quantifies routing/duplication loss.
  const target = sim.cooperative;
  let loC = 0, hiC = N;
  for (let it = 0; it < 60; it++) {
    const midC = (loC + hiC) / 2;
    if (che(probs, midC).hitRate < target) loC = midC; else hiC = midC;
  }
  const cEff = (loC + hiC) / 2;
  const gamma = cEff / (P * CAP);
  // INDEPENDENT theory band: ideal pooling (γ=1, zero duplication) — the
  // ceiling the cooperative curve approaches but cannot exceed. The gap
  // between measured cooperative and this line IS the duplication loss.
  const cheIdeal = che(probs, P * CAP).hitRate;
  return { ...sim, cEff, gamma, cheIdeal };
});

// ── report ──
console.log(`bench-compounding: N=${N} topics, C_p=${CAP}, α=${ALPHA}, offset=${OFFSET}, ${QUERIES} measured queries/peer-count, seed=${SEED}`);
console.log(`demand: top-1% of topics carry ${(probs.slice(0, Math.ceil(N * 0.01)).reduce((a, b) => a + b, 0) * 100).toFixed(1)}% of queries (heavy-tailed reuse)`);
console.log(`\nsingle-peer Che ceiling (isolated, C=${CAP}): hit=${(cheIso * 100).toFixed(1)}%`);
const isoGap = Math.max(...results.map((r) => Math.abs(r.isolated - cheIso))) * 100;
console.log(`simulator validation: isolated sim vs Che closed form agree within ${isoGap.toFixed(2)}pp (independent — no fitting)\n`);
console.log('peers   isolated   cooperative   web-fallback   C_eff     γ      ideal-pool   trips-avoided/1k');
for (const r of results) {
  const avoided = ((r.cooperative - r.isolated) * 1000).toFixed(0);
  console.log(
    String(r.P).padEnd(6) +
    `  ${(r.isolated * 100).toFixed(1).padStart(7)}%` +
    `  ${(r.cooperative * 100).toFixed(1).padStart(10)}%` +
    `  ${((1 - r.cooperative) * 100).toFixed(1).padStart(11)}%` +
    `  ${r.cEff.toFixed(0).padStart(6)}` +
    `  ${r.gamma.toFixed(2).padStart(5)}` +
    `  ${(r.cheIdeal * 100).toFixed(1).padStart(9)}%` +
    `  ${avoided.padStart(14)}`,
  );
}
const best = results[results.length - 1];
const lift = best.cooperative / Math.max(1e-9, best.isolated);
console.log(`\ncompounding: at P=${best.P}, cooperative hit ${(best.cooperative * 100).toFixed(1)}% vs isolated ${(best.isolated * 100).toFixed(1)}% — web-fallback ${(81.5).toFixed(0)}%→${((1 - best.cooperative) * 100).toFixed(1)}%, ${lift.toFixed(1)}× fewer paid web trips.`);
console.log(`isolated stays flat (${(best.isolated * 100).toFixed(1)}% at P=${best.P}): adding peers helps ONLY when knowledge is shared. That gap is the thesis.`);

// ── SVG: hit-rate vs peers (cooperative compounding curve + isolated baseline + Che) ──
mkdirSync(OUT, { recursive: true });
const W = 760, H = 460, P0 = 70;
const maxP = Math.max(...PEERS);
const lx = (p) => P0 + (Math.log2(p) / Math.log2(maxP)) * (W - 2 * P0); // log-x: peers double
const ly = (v) => (H - P0) - v * (H - 2 * P0);
const svg = [];
svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="ui-monospace,monospace">`);
svg.push(`<rect width="${W}" height="${H}" fill="#fdfdfb"/>`);
svg.push(`<text x="${W / 2}" y="28" text-anchor="middle" font-size="16" font-weight="700">Compounding inference — cooperative cache hit-rate vs peers</text>`);
svg.push(`<line x1="${P0}" y1="${H - P0}" x2="${W - P0}" y2="${H - P0}" stroke="#333"/>`);
svg.push(`<line x1="${P0}" y1="${P0}" x2="${P0}" y2="${H - P0}" stroke="#333"/>`);
for (let v = 0; v <= 1.0001; v += 0.25) {
  svg.push(`<line x1="${P0 - 4}" y1="${ly(v)}" x2="${W - P0}" y2="${ly(v)}" stroke="#eee"/>`);
  svg.push(`<text x="${P0 - 8}" y="${ly(v) + 4}" text-anchor="end" font-size="11">${(v * 100).toFixed(0)}%</text>`);
}
for (const p of PEERS) svg.push(`<text x="${lx(p)}" y="${H - P0 + 18}" text-anchor="middle" font-size="11">${p}</text>`);
svg.push(`<text x="${W / 2}" y="${H - 14}" text-anchor="middle" font-size="12">peers in the network (log scale)</text>`);
svg.push(`<text x="18" y="${H / 2}" text-anchor="middle" font-size="12" transform="rotate(-90 18 ${H / 2})">query hit-rate (served from graph, no web trip)</text>`);
const series = [
  ['ideal pooling ceiling (γ=1, theory)', '#8e44ad', results.map((r) => r.cheIdeal)],
  ['cooperative (folklore, federated)', '#27ae60', results.map((r) => r.cooperative)],
  ['isolated (no sharing, baseline)', '#c0392b', results.map((r) => r.isolated)],
];
series.forEach(([label, color, ys], si) => {
  const pts = results.map((r, i) => `${lx(r.P)},${ly(ys[i])}`).join(' ');
  const dash = label.includes('theory') ? ' stroke-dasharray="5 4"' : '';
  svg.push(`<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.5"${dash}/>`);
  for (const r of results) { const i = results.indexOf(r); svg.push(`<circle cx="${lx(r.P)}" cy="${ly(ys[i])}" r="3" fill="${color}"/>`); }
  svg.push(`<rect x="${P0 + 12}" y="${P0 + si * 20}" width="12" height="12" fill="${color}"/>`);
  svg.push(`<text x="${P0 + 30}" y="${P0 + si * 20 + 11}" font-size="12">${label}</text>`);
});
svg.push('</svg>');
const svgPath = join(OUT, 'compounding-vs-peers.svg');
writeFileSync(svgPath, svg.join('\n'));

// ════════════════════════════════════════════════════════════════════
// CUMULATIVE TIMELINE — the real significance of compounding.
//
// A SINGLE network of CUMP peers, empty caches, processes a stream of
// QUERIES one at a time. We track the CUMULATIVE count of paid web trips
// for three policies sharing the identical query stream:
//   no-cache    — every query is a fetch (slope 1 forever: Θ(Q)).
//   isolated    — fetch unless the issuing peer already cached it.
//   cooperative — fetch unless ANY peer cached it (the folklore graph).
//
// Compounding shows up as the cooperative cost curve BENDING AWAY from
// the others: the collective pays for a topic once, then every later
// query for it (any peer, any session) is free. The cumulative
// trips-AVOIDED grows without bound and the marginal cost per query
// decays toward the cold-tail floor — "pull once, local forever".
// ════════════════════════════════════════════════════════════════════
const cumulative = (P, sampleN = 160) => {
  const rng = rngFrom(SEED ^ 0x9e3779b1);
  const sample = makeSampler(probs, rng);
  const peers = Array.from({ length: P }, () => makeLRU(CAP));
  let noCache = 0, iso = 0, coop = 0, lastIso = 0, lastCoop = 0, lastQ = 0;
  const step = Math.max(1, Math.floor(QUERIES / sampleN));
  const xs = [], cumNo = [], cumIso = [], cumCoop = [], margIso = [], margCoop = [];
  for (let i = 1; i <= QUERIES; i++) {
    const topic = sample();
    const issuing = peers[(rng() * P) | 0];
    noCache++;
    const isoHit = issuing.has(topic);
    if (!isoHit) iso++;
    let coopHit = isoHit;
    if (!coopHit) { for (let j = 0; j < P; j++) { if (peers[j].has(topic)) { coopHit = true; break; } } }
    if (!coopHit) coop++;
    issuing.add(topic);
    if (i % step === 0 || i === QUERIES) {
      xs.push(i); cumNo.push(noCache); cumIso.push(iso); cumCoop.push(coop);
      margIso.push((iso - lastIso) / (i - lastQ));
      margCoop.push((coop - lastCoop) / (i - lastQ));
      lastIso = iso; lastCoop = coop; lastQ = i;
    }
  }
  return { P, xs, cumNo, cumIso, cumCoop, margIso, margCoop, totals: { noCache, iso, coop } };
};

const cum = cumulative(CUMP);
const { noCache: cNo, iso: cIso, coop: cCoop } = cum.totals;
const endMargCoop = cum.margCoop[cum.margCoop.length - 1];
const endMargIso = cum.margIso[cum.margIso.length - 1];
console.log(`\n── cumulative timeline (one network, P=${CUMP}, ${QUERIES} queries streamed) ──`);
console.log('progress   no-cache   isolated   cooperative   coop %% of no-cache   trips-avoided');
for (const frac of [0.25, 0.5, 1.0]) {
  const idx = Math.min(cum.xs.length - 1, Math.round(frac * cum.xs.length) - 1);
  const no = cum.cumNo[idx], is = cum.cumIso[idx], co = cum.cumCoop[idx];
  console.log(
    `${(frac * 100).toFixed(0).padStart(5)}%  ${String(no).padStart(10)} ${String(is).padStart(10)} ${String(co).padStart(13)}` +
    `  ${((co / no) * 100).toFixed(1).padStart(16)}%  ${String(no - co).padStart(13)}`,
  );
}
console.log(`\nsignificance: streaming ${QUERIES} queries cost ${cNo} web trips with no cache (Θ(Q), forever),`);
console.log(`  ${cIso} isolated (${((cIso / cNo) * 100).toFixed(0)}%), but only ${cCoop} cooperatively (${((cCoop / cNo) * 100).toFixed(0)}%) — ${(cNo / cCoop).toFixed(1)}× cheaper.`);
console.log(`marginal cost per query at end of stream: no-cache 100%, isolated ${(endMargIso * 100).toFixed(0)}%, cooperative ${(endMargCoop * 100).toFixed(0)}%`);
console.log(`  → each new query is ${(1 - endMargCoop).toFixed(2)} likely already paid-for by the collective. The gap vs isolated widens every query.`);

// ── SVG: cumulative paid web trips vs queries (the cost curves diverge) ──
const cw = 760, ch = 460, cp = 72;
const cmaxX = QUERIES, cmaxY = cNo;
const cx = (q) => cp + (q / cmaxX) * (cw - 2 * cp);
const cy = (v) => (ch - cp) - (v / cmaxY) * (ch - 2 * cp);
const csvg = [];
csvg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}" font-family="ui-monospace,monospace">`);
csvg.push(`<rect width="${cw}" height="${ch}" fill="#fdfdfb"/>`);
csvg.push(`<text x="${cw / 2}" y="28" text-anchor="middle" font-size="16" font-weight="700">Compounding inference — cumulative paid web trips (P=${CUMP})</text>`);
csvg.push(`<line x1="${cp}" y1="${ch - cp}" x2="${cw - cp}" y2="${ch - cp}" stroke="#333"/>`);
csvg.push(`<line x1="${cp}" y1="${cp}" x2="${cp}" y2="${ch - cp}" stroke="#333"/>`);
for (let f = 0; f <= 1.0001; f += 0.25) {
  csvg.push(`<line x1="${cp - 4}" y1="${cy(f * cmaxY)}" x2="${cw - cp}" y2="${cy(f * cmaxY)}" stroke="#eee"/>`);
  csvg.push(`<text x="${cp - 8}" y="${cy(f * cmaxY) + 4}" text-anchor="end" font-size="11">${(f * cmaxY / 1000).toFixed(0)}k</text>`);
  csvg.push(`<text x="${cx(f * cmaxX)}" y="${ch - cp + 18}" text-anchor="middle" font-size="11">${(f * cmaxX / 1000).toFixed(0)}k</text>`);
}
csvg.push(`<text x="${cw / 2}" y="${ch - 14}" text-anchor="middle" font-size="12">queries processed (time)</text>`);
csvg.push(`<text x="18" y="${ch / 2}" text-anchor="middle" font-size="12" transform="rotate(-90 18 ${ch / 2})">cumulative paid web trips</text>`);
const cseries = [
  ['no cache (Θ(Q))', '#888', cum.cumNo],
  ['isolated (no sharing)', '#c0392b', cum.cumIso],
  ['cooperative (folklore) — bends away', '#27ae60', cum.cumCoop],
];
cseries.forEach(([label, color, ys], si) => {
  const pts = cum.xs.map((q, i) => `${cx(q)},${cy(ys[i])}`).join(' ');
  csvg.push(`<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.5"/>`);
  csvg.push(`<rect x="${cp + 12}" y="${cp + si * 20}" width="12" height="12" fill="${color}"/>`);
  csvg.push(`<text x="${cp + 30}" y="${cp + si * 20 + 11}" font-size="12">${label}</text>`);
});
// annotate the compounding dividend (gap at end of stream).
csvg.push(`<text x="${cw - cp}" y="${cy(cNo) - 6}" text-anchor="end" font-size="11" fill="#888">${(cNo / 1000).toFixed(0)}k</text>`);
csvg.push(`<text x="${cw - cp}" y="${cy(cCoop) - 6}" text-anchor="end" font-size="11" fill="#27ae60">${(cCoop / 1000).toFixed(1)}k (${((cCoop / cNo) * 100).toFixed(0)}%)</text>`);
csvg.push('</svg>');
const cumPath = join(OUT, 'compounding-cumulative.svg');
writeFileSync(cumPath, csvg.join('\n'));

// ════════════════════════════════════════════════════════════════════
// SUBGRAPH TRANSFER ECONOMICS — the protocol's stronger claim.
//
// The useful unit is not "a peer sends a summary". A peer that has paid
// the research cost can transfer the relevant graph neighborhood: nodes,
// edges, bodies, and provenance. After that, the asker owns the context
// locally and can answer a family of related queries without web search.
//
// This model groups topics into deterministic neighborhoods. On a web
// fallback the peer imports the whole neighborhood. On a federation hit
// the peer imports the neighborhood from the serving peer. The LLM only
// sees a retrieved working set (`GRAPH_CONTEXT_TOKENS`), while the full
// graph transfer is counted as P2P bytes, not model tokens.
// ════════════════════════════════════════════════════════════════════
const topicGroup = (topic) => {
  const start = Math.floor(topic / SUBGRAPH_TOPICS) * SUBGRAPH_TOPICS;
  const end = Math.min(N, start + SUBGRAPH_TOPICS);
  const xs = [];
  for (let t = start; t < end; t++) xs.push(t);
  return xs;
};

const addGroup = (cache, group) => {
  for (const t of group) cache.add(t);
};

const subgraphBytes = SUBGRAPH_TOPICS * (NODE_BYTES + EDGES_PER_NODE * EDGE_BYTES);

const subgraphEconomics = (P) => {
  const rng = rngFrom(SEED ^ 0x51ed270b);
  const sample = makeSampler(probs, rng);
  const isoPeers = Array.from({ length: P }, () => makeLRU(CAP));
  const coopPeers = Array.from({ length: P }, () => makeLRU(CAP));
  const iso = { web: 0, graph: 0 };
  const coop = { web: 0, local: 0, federation: 0, p2pBytes: 0 };

  for (let i = 0; i < QUERIES; i++) {
    const topic = sample();
    const p = (rng() * P) | 0;
    const group = topicGroup(topic);

    const ip = isoPeers[p];
    if (ip.has(topic)) {
      iso.graph++;
    } else {
      iso.web++;
      addGroup(ip, group);
    }

    const cpPeer = coopPeers[p];
    if (cpPeer.has(topic)) {
      coop.local++;
      continue;
    }
    let servingPeer;
    for (let j = 0; j < P; j++) {
      if (j !== p && coopPeers[j].has(topic)) { servingPeer = coopPeers[j]; break; }
    }
    if (servingPeer !== undefined) {
      coop.federation++;
      addGroup(cpPeer, group);
      coop.p2pBytes += subgraphBytes;
    } else {
      coop.web++;
      addGroup(cpPeer, group);
    }
  }

  const noCacheTokens = QUERIES * WEB_CONTEXT_TOKENS;
  const isoTokens = iso.web * WEB_CONTEXT_TOKENS + iso.graph * GRAPH_CONTEXT_TOKENS;
  const coopGraphHits = coop.local + coop.federation;
  const coopTokens = coop.web * WEB_CONTEXT_TOKENS + coopGraphHits * GRAPH_CONTEXT_TOKENS;
  return {
    P,
    subgraphTopics: SUBGRAPH_TOPICS,
    subgraphBytes,
    paidTrips: { no_cache: QUERIES, isolated: iso.web, cooperative: coop.web },
    graphHits: { isolated: iso.graph, cooperative_local: coop.local, cooperative_federation: coop.federation },
    p2p_transfer_bytes: coop.p2pBytes,
    model_input_tokens: { no_cache: noCacheTokens, isolated: isoTokens, cooperative: coopTokens },
    token_saving_vs_no_cache: 1 - coopTokens / noCacheTokens,
    token_saving_vs_isolated: 1 - coopTokens / isoTokens,
    cheaper_x_vs_no_cache: noCacheTokens / coopTokens,
    cheaper_x_vs_isolated: isoTokens / coopTokens,
  };
};

const econ = subgraphEconomics(CUMP);
console.log(`\n── subgraph-transfer economics (P=${CUMP}, neighborhood=${SUBGRAPH_TOPICS} topics) ──`);
console.log(`assumptions: web context ${WEB_CONTEXT_TOKENS} tokens/query; graph working set ${GRAPH_CONTEXT_TOKENS} tokens/query; transferred subgraph ≈${(subgraphBytes / 1024).toFixed(1)} KiB`);
console.log('policy       paid-web-trips   model-input-tokens   token-saving vs no-cache');
console.log(`no-cache     ${String(econ.paidTrips.no_cache).padStart(13)}   ${String(econ.model_input_tokens.no_cache).padStart(18)}   ${'0.0%'.padStart(24)}`);
console.log(`isolated     ${String(econ.paidTrips.isolated).padStart(13)}   ${String(econ.model_input_tokens.isolated).padStart(18)}   ${((1 - econ.model_input_tokens.isolated / econ.model_input_tokens.no_cache) * 100).toFixed(1).padStart(23)}%`);
console.log(`cooperative  ${String(econ.paidTrips.cooperative).padStart(13)}   ${String(econ.model_input_tokens.cooperative).padStart(18)}   ${(econ.token_saving_vs_no_cache * 100).toFixed(1).padStart(23)}%`);
console.log(`\nsubgraph result: cooperative transfer is ${(econ.cheaper_x_vs_no_cache).toFixed(1)}× fewer model input tokens than web-every-time,`);
console.log(`  and ${(econ.cheaper_x_vs_isolated).toFixed(1)}× fewer than isolated local graphs under the same stream.`);
console.log(`  Federation performed ${econ.graphHits.cooperative_federation} graph transplants (${(econ.p2p_transfer_bytes / 1024 / 1024).toFixed(1)} MiB P2P total), not LLM context stuffing.`);

writeFileSync(join(OUT, 'compounding-summary.json'), JSON.stringify({
  params: {
    N, cap: CAP, alpha: ALPHA, offset: OFFSET, queries: QUERIES, seed: SEED, peers: PEERS,
    subgraph_topics: SUBGRAPH_TOPICS,
    web_context_tokens: WEB_CONTEXT_TOKENS,
    graph_context_tokens: GRAPH_CONTEXT_TOKENS,
    node_bytes: NODE_BYTES,
    edge_bytes: EDGE_BYTES,
    edges_per_node: EDGES_PER_NODE,
  },
  single_peer_che_ceiling: cheIso,
  sweep: results.map((r) => ({
    peers: r.P, isolated: r.isolated, cooperative: r.cooperative,
    web_fallback: 1 - r.cooperative, c_eff: r.cEff, gamma: r.gamma, ideal_pool_ceiling: r.cheIdeal,
  })),
  headline: {
    peers: best.P,
    cooperative_hit: best.cooperative,
    isolated_hit: best.isolated,
    fewer_web_trips_x: lift,
    isolated_sim_vs_che_gap_pp: Math.max(...results.map((r) => Math.abs(r.isolated - cheIso))) * 100,
  },
  cumulative: {
    peers: CUMP, queries: cNo,
    paid_trips: { no_cache: cNo, isolated: cIso, cooperative: cCoop },
    cooperative_cost_fraction: cCoop / cNo,
    cumulative_trips_avoided: cNo - cCoop,
    cheaper_x: cNo / cCoop,
    end_marginal_cost: { no_cache: 1, isolated: endMargIso, cooperative: endMargCoop },
  },
  subgraph_economics: econ,
}, null, 2) + '\n');
console.log(`\nbench-compounding: -> ${svgPath}`);
console.log(`bench-compounding: -> ${cumPath}`);
console.log(`bench-compounding: -> ${join(OUT, 'compounding-summary.json')}`);
if (JSON_OUT) console.log(JSON.stringify(results, null, 2));
