/**
 * bench-compounding-graded — does P2P knowledge + inference reuse COMPOUND
 * under GRADED (semantic) retrieval, not the boolean exact-match that
 * bench-compounding.mjs uses?
 *
 * The cost + degradation critiques flagged that the 17%→1% web-fallback decay
 * rests on a boolean assumption: a peer either holds the EXACT topic id or it
 * doesn't. Real retrieval is graded — a query is a paraphrase, and a peer
 * "resolves" it only if a cached node is semantically close enough to clear the
 * admission gate. This sim makes that honest:
 *
 *   - K topics are unit vectors in R^d (the semantic space).
 *   - Demand is Mandelbrot-Zipf over topic rank.
 *   - A query for topic k is a NOISED paraphrase: normalize(topic_k + σ·gauss).
 *   - A peer resolves from memory iff the REAL energy gate (src/domain/
 *     energy-gate.ts, the shipped admission test) ADMITS over the cosine
 *     similarities of its candidate cache hits. Else it "pays web", then
 *     deposits topic_k's TRUE vector into its cache (compounding).
 *   - ISOLATED reads only the issuing peer's cache; COOPERATIVE reads the union
 *     of all peers' caches (federated pull).
 *
 * Because topics are vectors and the gate is the real one, this captures what
 * boolean can't: paraphrase MISSES (σ too high → no cached vector clears the
 * gate) and near-miss FALSE-ADMITS (a query lands close to the WRONG cached
 * topic). We know ground truth, so we report both. The compounding claim holds
 * iff cooperative web-fallback decays below isolated AND false-admit stays low.
 *
 *   node bench/bench-compounding-graded.mjs [--peers 16] [--steps 4000]
 *     [--topics 600] [--cap 200] [--dim 24] [--sigma 0.35] [--json]
 *
 * NOTE: synthetic vectors (geometric sim), not real text embeddings — the point
 * is graded geometry + the real gate, a strict honesty upgrade over boolean.
 * Not a claim about a specific embedder's paraphrase robustness.
 */

import { energyGate, freeEnergy } from '../dist/domain/energy-gate.js';

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : def;
};
const JSON_OUT = args.includes('--json');
const P = flag('peers', 16);
const STEPS = flag('steps', 4000);
const K = flag('topics', 600);
const CAP = flag('cap', 200);
const DIM = flag('dim', 24);
const SIGMA = flag('sigma', 0.35); // paraphrase noise stdev
const ALPHA = 0.9; // Zipf exponent
const ZIPF_Q = 5; // Mandelbrot plateau (flattened head)
const TOPK = 5; // candidate hits fed to the gate
const CHURN = flag('churn', 0); // fraction of peers offline per step
const SWEEP = args.includes('--sweep-peers');
// Labeled token-cost model for LLM inference reuse: a fresh resolution costs a
// research inference (~web fetch + synthesis); a memory hit costs a cheap
// recall. compute-saved = correct reuses × (research − recall). ONE projection,
// not double-counted with web-trip count.
const C_RESEARCH = 8000;
const C_RECALL = 200;
const pct = (x) => `${(x * 100).toFixed(1)}%`;

// ── deterministic RNG (mulberry32) ──
let _s = 0x9e3779b9 >>> 0;
const rnd = () => {
  _s = (_s + 0x6d2b79f5) >>> 0;
  let t = _s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const gauss = () => {
  // Box-Muller
  const u = Math.max(rnd(), 1e-9);
  const v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

const norm = (x) => {
  let s = 0;
  for (const v of x) s += v * v;
  s = Math.sqrt(s) || 1;
  return x.map((v) => v / s);
};
const cos = (a, b) => {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += a[i] * b[i];
  return d; // both unit-norm
};

// ── topics as unit vectors; Mandelbrot-Zipf demand ──
const topics = Array.from({ length: K }, () => norm(Array.from({ length: DIM }, () => gauss())));
const weights = Array.from({ length: K }, (_, i) => 1 / Math.pow(i + 1 + ZIPF_Q, ALPHA));
const wsum = weights.reduce((a, b) => a + b, 0);
const cdf = [];
{
  let acc = 0;
  for (const w of weights) {
    acc += w / wsum;
    cdf.push(acc);
  }
}
const drawTopic = () => {
  const u = rnd();
  let lo = 0;
  let hi = K - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cdf[mid] < u) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};
const query = (k) => norm(topics[k].map((v) => v + SIGMA * gauss()));

// ── per-peer LRU cache of (topicId → trueVector) ──
const mkPeer = () => ({ map: new Map() }); // insertion-ordered = LRU
const touch = (peer, k) => {
  if (peer.map.has(k)) peer.map.delete(k);
  peer.map.set(k, topics[k]);
  if (peer.map.size > CAP) peer.map.delete(peer.map.keys().next().value);
};

// Top-K cosine sims of a query vector against a set of cached (k→vec) maps,
// plus the cached topic id of the single best hit (for ground-truth scoring).
const candidateSims = (qv, caches) => {
  // Dedup by topic id (mirrors federated search dedup by node_id +
  // also_from_peers): the SAME replicated node from many peers is ONE hit, not
  // TOPK identical copies — otherwise duplicates flood the top-K and collapse
  // the separation guard (Δ between top-1 and top-2 → 0).
  const bestPerTopic = new Map();
  for (const cache of caches) {
    for (const [k, vec] of cache) {
      const s = cos(qv, vec);
      const cur = bestPerTopic.get(k);
      if (cur === undefined || s > cur) bestPerTopic.set(k, s);
    }
  }
  const sims = [...bestPerTopic.values()].sort((a, b) => b - a);
  return { top: sims.slice(0, TOPK) };
};

// ── calibrate the admission threshold τ to THIS sim's geometry ──
// Mirrors bench-energy-gate on real data: build labeled positive (true topic
// present among candidates) vs negative (only wrong-topic neighbours) sim-sets,
// then pick the Youden-optimal τ on −E. Without this the real-graph-fitted
// default τ mis-fires on synthetic geometry (rubber-stamps everything).
const sep = (sims) => {
  const s = [...sims].sort((a, b) => b - a);
  return s.length >= 2 ? s[0] - s[1] : 0;
};
const youden = (pos, neg) => {
  const lo = Math.min(...pos, ...neg);
  const hi = Math.max(...pos, ...neg);
  let best = { cut: lo, youden: -1, tpr: 0, fpr: 0 };
  for (let i = 0; i <= 50; i++) {
    const cut = lo + ((hi - lo) * i) / 50;
    const tpr = pos.filter((x) => x >= cut).length / pos.length;
    const fpr = neg.filter((x) => x >= cut).length / neg.length;
    if (tpr - fpr > best.youden) best = { cut, youden: tpr - fpr, tpr, fpr };
  }
  return best;
};
const calibrate = (T = 0.1) => {
  const negE = { pos: [], neg: [] };
  const sepD = { pos: [], neg: [] };
  // A realistically-sized federated candidate pool of cached topics, so the
  // spurious-best-neighbour distribution matches the running sim.
  const cachedKs = Array.from({ length: Math.min(P * CAP, 400) }, () => Math.floor(rnd() * K));
  for (let i = 0; i < 800; i++) {
    const k = drawTopic();
    const qv = query(k);
    const neigh = cachedKs.filter((c) => c !== k).map((c) => cos(qv, topics[c])).sort((a, b) => b - a);
    const posSims = [cos(qv, topics[k]), ...neigh].sort((a, b) => b - a).slice(0, TOPK);
    const negSims = neigh.slice(0, TOPK);
    negE.pos.push(-freeEnergy(posSims, T));
    negE.neg.push(-freeEnergy(negSims, T));
    sepD.pos.push(sep(posSims));
    sepD.neg.push(sep(negSims));
  }
  const tau = youden(negE.pos, negE.neg);
  const sm = youden(sepD.pos, sepD.neg);
  return { tau: tau.cut, sepMin: sm.cut, tpr: tau.tpr, fpr: tau.fpr, sepTpr: sm.tpr, sepFpr: sm.fpr };
};

const runArm = (cooperative, tau, sepMin, churn = 0, peerCount = P) => {
  _s = 0x12345678 >>> 0; // reset RNG per arm for a fair, identical query stream
  const peers = Array.from({ length: peerCount }, mkPeer);
  const BUCKETS = 20;
  const perBucket = Math.ceil(STEPS / BUCKETS);
  const fallbackSeries = new Array(BUCKETS).fill(0);
  const bucketCount = new Array(BUCKETS).fill(0);
  let hits = 0;
  let falseAdmits = 0;
  let correct = 0;
  let webPaid = 0;

  for (let t = 0; t < STEPS; t++) {
    const issuing = peers[Math.floor(rnd() * peerCount)];
    const k = drawTopic();
    const qv = query(k);
    // churn: a fraction of peers are offline this step (issuing peer always up)
    const caches = cooperative
      ? peers.filter((p) => p === issuing || rnd() >= churn).map((p) => p.map)
      : [issuing.map];
    const { top } = candidateSims(qv, caches);
    const verdict = top.length > 0 ? energyGate(top, { tau, sepMin }) : { admit: false };
    // Ground truth: is the queried topic's TRUE answer actually in the cache?
    const present = caches.some((c) => c.has(k));

    const b = Math.min(BUCKETS - 1, Math.floor(t / perBucket));
    bucketCount[b]++;
    if (verdict.admit) {
      hits++;
      // False-admit = "use memory" when the real answer is ABSENT (resolved
      // from a wrong-but-close topic). Not "the single closest vector wasn't an
      // exact id match" — under cache crowding a synonym can be numerically
      // closest while the true answer is still present and correct.
      if (!present) falseAdmits++;
      else correct++;
    } else {
      webPaid++;
      fallbackSeries[b]++;
      // pay web → deposit the TRUE answer. ISOLATED: only the issuing peer
      // caches. COOPERATIVE: CRDT sync propagates the node to all currently-
      // reachable (online) peers — so shared knowledge is REPLICATED, not
      // single-homed, and survives churn (the degradation-dynamics durability
      // mechanism: replication factor > 1).
      if (cooperative) {
        for (const p of peers) if (p === issuing || rnd() >= churn) touch(p, k);
      } else {
        touch(issuing, k);
      }
    }
  }
  const series = fallbackSeries.map((f, i) => (bucketCount[i] ? f / bucketCount[i] : 0));
  return {
    fallback_start: series[0],
    fallback_end: series[series.length - 1],
    hit_rate: hits / STEPS,
    false_admit_rate: hits > 0 ? falseAdmits / hits : 0,
    correct_resolves: correct,
    correct_resolve_rate: correct / STEPS,
    web_paid: webPaid,
    series,
  };
};

const cal = calibrate();

// ── R(T,t) peer sweep: compounding scales with peer count ──
if (SWEEP) {
  const Ps = [1, 2, 4, 8, 16, 32];
  const rows = Ps.map((p) => {
    const r = runArm(true, cal.tau, cal.sepMin, CHURN, p);
    return { p, ...r, compute_saved_tok: r.correct_resolves * (C_RESEARCH - C_RECALL) };
  });
  if (JSON_OUT) {
    console.log(JSON.stringify({ params: { STEPS, K, CAP, DIM, SIGMA, CHURN }, calibration: cal, sweep: rows }, null, 2));
    process.exit(0);
  }
  console.log(`bench-compounding-graded: R(T,t) peer sweep — dim ${DIM}, σ=${SIGMA}, churn ${pct(CHURN)}, ${STEPS} steps`);
  console.log(`  calibrated τ=${cal.tau.toFixed(3)} / sepMin=${cal.sepMin.toFixed(3)} (true-match TPR ${pct(cal.tpr)})\n`);
  console.log('  peers   web-fallback-end   correct-resolve   false-admit   compute-saved');
  for (const r of rows) {
    console.log(
      `  ${String(r.p).padStart(5)}   ${pct(r.fallback_end).padStart(13)}   ${pct(r.correct_resolve_rate).padStart(13)}   ${pct(r.false_admit_rate).padStart(9)}   ${(r.compute_saved_tok / 1e6).toFixed(2).padStart(8)} Mtok`,
    );
  }
  const grows = rows[rows.length - 1].correct_resolve_rate > rows[0].correct_resolve_rate + 0.05;
  console.log('');
  console.log(
    grows
      ? `R(T,t) GROWS with peers: correct-resolve ${pct(rows[0].correct_resolve_rate)} (P=1) → ${pct(rows[rows.length - 1].correct_resolve_rate)} (P=32); web-fallback falls, compute reused rises. Compounding scales.`
      : `No R(T,t) growth at σ=${SIGMA} — paraphrase noise caps reuse regardless of peer count.`,
  );
  process.exit(0);
}

const iso = runArm(false, cal.tau, cal.sepMin, CHURN);
const coop = runArm(true, cal.tau, cal.sepMin, CHURN);

if (JSON_OUT) {
  console.log(JSON.stringify({ params: { P, STEPS, K, CAP, DIM, SIGMA, CHURN }, calibration: cal, isolated: iso, cooperative: coop }, null, 2));
  process.exit(0);
}

const savedTok = (r) => r.correct_resolves * (C_RESEARCH - C_RECALL);
console.log(`bench-compounding-graded: ${P} peers, ${STEPS} steps, ${K} topics, cap ${CAP}, dim ${DIM}, σ=${SIGMA}, churn ${pct(CHURN)}`);
console.log('  (graded retrieval — real energy gate over cosine sims of noised paraphrase queries)');
console.log(`  calibrated τ=${cal.tau.toFixed(3)} (TPR ${pct(cal.tpr)}/FPR ${pct(cal.fpr)}), sepMin=${cal.sepMin.toFixed(3)}\n`);
console.log(`                       isolated      cooperative`);
console.log(`  web-fallback start   ${pct(iso.fallback_start).padStart(8)}     ${pct(coop.fallback_start).padStart(8)}`);
console.log(`  web-fallback end     ${pct(iso.fallback_end).padStart(8)}     ${pct(coop.fallback_end).padStart(8)}`);
console.log(`  correct-resolve rate ${pct(iso.correct_resolve_rate).padStart(8)}     ${pct(coop.correct_resolve_rate).padStart(8)}   (admit AND answer present — genuine reuse)`);
console.log(`  false-admit rate     ${pct(iso.false_admit_rate).padStart(8)}     ${pct(coop.false_admit_rate).padStart(8)}   (wrong topic admitted — the honest cost)`);
console.log(`  web trips paid       ${String(iso.web_paid).padStart(8)}     ${String(coop.web_paid).padStart(8)}`);
console.log(`  compute saved        ${(savedTok(iso) / 1e6).toFixed(2).padStart(6)} M    ${(savedTok(coop) / 1e6).toFixed(2).padStart(6)} M tok   (correct reuses × ${C_RESEARCH - C_RECALL}/reuse; one projection)`);
console.log('');
const compounds = coop.fallback_end < iso.fallback_end - 0.02 && coop.correct_resolve_rate > iso.correct_resolve_rate;
const cheaper = iso.web_paid > 0 ? (iso.web_paid / Math.max(1, coop.web_paid)).toFixed(2) : 'n/a';
if (compounds) {
  console.log(`VERDICT: COMPOUNDS — cooperative correct-resolve ${pct(coop.correct_resolve_rate)} vs isolated ${pct(iso.correct_resolve_rate)}, web-fallback ${pct(coop.fallback_end)} vs ${pct(iso.fallback_end)}.`);
  console.log(`  ${cheaper}× fewer paid web trips, ${((savedTok(coop) - savedTok(iso)) / 1e6).toFixed(2)} M extra tokens reused cooperatively. false-admit ${pct(coop.false_admit_rate)}.`);
} else {
  console.log(`VERDICT: NO genuine compounding gap at σ=${SIGMA} — cooperative correct-resolve ${pct(coop.correct_resolve_rate)} vs isolated ${pct(iso.correct_resolve_rate)}.`);
  console.log(`  The honest gate pays web rather than false-resolving; the boolean sim would have hidden this.`);
}
