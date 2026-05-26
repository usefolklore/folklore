/**
 * Bench — AkashikBench-F (federation-level compounding).
 *
 * The benchmark the octopus-discover Round 5 synthesis identified
 * as the only one that can falsify or validate the federated-
 * commons thesis. Lives in `docs/research/octopus-discover/round-
 * 5-2026-05-26/synthesis.md` for context.
 *
 * Loads a frozen OSS corpus (default: snap-research/locomo factual
 * subset), partitions documents into N strictly disjoint peer
 * shards (each peer starts knowing only its own slice), runs a
 * Zipfian query stream with realistic offline churn through the
 * pure-domain federation simulator
 * (`src/domain/federation-sim.ts`), and emits:
 *
 *   - `web_fallback_rate(t)` ladder — the network's curiosity-
 *     driven learning curve. Falling = compounding.
 *   - `compoundingSlope` — linear-regression slope of the ladder.
 *     Negative = thesis validated. Near-zero = thesis open. Above
 *     zero = thesis broken (would be very strange in this sim).
 *   - `propagationHalfLife` — median sim-steps from "a doc enters
 *     the network via web fallback" to "≥ 50% of peers hold it".
 *     Lower = faster compounding. Infinity = niche-evaporation
 *     case (Q6b in the Round 5 brief).
 *   - Cumulative source breakdown — fraction of all queries
 *     resolved locally / via federation / via web.
 *
 * Environment contract (all required to run; otherwise skipped):
 *
 *   AKASHIK_BENCH_F=1
 *     Master gate (off by default so CI stays fast).
 *
 *   LOCOMO_DIR=/path/to/locomo
 *     Provides the corpus. Same dir convention as the existing
 *     `bench-locomo-real.test.ts`. Set to a directory that
 *     contains `locomo10.json`.
 *
 *   WELLINFORMED_BENCH_OUT=/path/to/run.jsonl   (optional)
 *     If set, suite appends one `BenchSuiteReport` JSON line.
 *
 *   AKASHIK_BENCH_PEERS=10           (default 10 — Round 5 spec)
 *   AKASHIK_BENCH_STEPS=2000         (default 2000)
 *   AKASHIK_BENCH_OFFLINE=0.2        (default 0.2 — Round 5 spec)
 *   AKASHIK_BENCH_ZIPF=1.0           (default 1.0)
 *   AKASHIK_BENCH_SEED=42            (default 42)
 *   AKASHIK_BENCH_SHARD=0.05         (default 0.05 — 50% web-only
 *                                     at 10 peers; gives a strong
 *                                     compounding signal)
 *   AKASHIK_BENCH_WINDOW=100         (default 100)
 *
 * Why a pure simulator instead of spinning up real peers:
 *
 *   v1 measures federation DYNAMICS — does the curiosity-driven
 *   cache-fill mechanism produce compounding under realistic
 *   churn? It deliberately abstracts away per-peer retrieval
 *   quality (those are measured separately by the LongMemEval /
 *   LoCoMo / BEIR public-corpus benches). Boolean "does the peer
 *   hold this doc" is the right granularity for this question
 *   and it runs in seconds. v2 plugs in real retrieval per peer
 *   for a full-stack federation bench — but only after v1
 *   confirms the dynamics work.
 */

import assert from 'node:assert/strict';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  runFederationSim,
  webFallbackRateOverTime,
  compoundingSlope,
  propagationHalfLife,
  resolveSourceCounts,
  type SimCorpus,
} from '../src/domain/federation-sim.js';
import type { BenchSuiteReport } from '../src/domain/bench-types.js';

// ─────────────── corpus loader ─────────────

interface LocomoQa {
  readonly question: string;
  readonly evidence?: readonly string[];
  readonly category?: number;
}

interface LocomoSample {
  readonly sample_id?: string;
  readonly qa: readonly LocomoQa[];
  readonly conversation: Readonly<Record<string, unknown>>;
}

const FACTUAL_CATEGORIES = new Set([1, 2, 3]);

/**
 * Build a `SimCorpus` from the LoCoMo factual subset. Each LoCoMo
 * QA pair becomes one simulator `SimQuery`. The `goldDocs` are the
 * LoCoMo session tags (e.g. `D3`, `D7`) referenced by the QA's
 * `evidence` field. Tags are namespaced by sample id so different
 * samples' D1's don't collide.
 */
const buildCorpusFromLoCoMo = (locomoPath: string): SimCorpus => {
  const dataset = JSON.parse(readFileSync(locomoPath, 'utf8')) as readonly LocomoSample[];
  const queries: { id: string; goldDocs: string[] }[] = [];
  const docSet = new Set<string>();
  for (let sIdx = 0; sIdx < dataset.length; sIdx++) {
    const sample = dataset[sIdx];
    const sampleTag = sample.sample_id ?? `s${sIdx}`;
    for (let qIdx = 0; qIdx < sample.qa.length; qIdx++) {
      const q = sample.qa[qIdx];
      if (q.category === undefined || !FACTUAL_CATEGORIES.has(q.category)) continue;
      if (!q.evidence || q.evidence.length === 0) continue;
      const gold = new Set<string>();
      for (const ev of q.evidence) {
        if (typeof ev !== 'string') continue;
        const colon = ev.indexOf(':');
        const tag = (colon >= 0 ? ev.slice(0, colon) : ev).trim();
        if (tag.length === 0) continue;
        const nsTag = `${sampleTag}/${tag}`;
        gold.add(nsTag);
        docSet.add(nsTag);
      }
      if (gold.size === 0) continue;
      queries.push({
        id: `${sampleTag}#q${qIdx}`,
        goldDocs: Array.from(gold),
      });
    }
  }
  return { queries, allDocs: Array.from(docSet) };
};

// ─────────────── bench ─────────────

test('bench: AkashikBench-F — federation compounding on LoCoMo', { timeout: 60 * 60 * 1000 }, async (t) => {
  if (process.env.AKASHIK_BENCH_F !== '1') {
    t.skip('AKASHIK_BENCH_F not set — skipping AkashikBench-F');
    return;
  }
  const dir = process.env.LOCOMO_DIR;
  if (!dir) {
    t.skip('LOCOMO_DIR not set — see suite header for layout');
    return;
  }
  const corpusPath = join(dir, 'locomo10.json');
  if (!existsSync(corpusPath)) {
    t.skip(`missing ${corpusPath}`);
    return;
  }

  const corpus = buildCorpusFromLoCoMo(corpusPath);
  assert.ok(corpus.queries.length > 0, 'corpus has zero queries');
  assert.ok(corpus.allDocs.length > 0, 'corpus has zero docs');

  const numPeers = Number(process.env.AKASHIK_BENCH_PEERS ?? 10);
  const numSteps = Number(process.env.AKASHIK_BENCH_STEPS ?? 2000);
  const offlineProbability = Number(process.env.AKASHIK_BENCH_OFFLINE ?? 0.2);
  const zipfAlpha = Number(process.env.AKASHIK_BENCH_ZIPF ?? 1.0);
  const seed = Number(process.env.AKASHIK_BENCH_SEED ?? 42);
  const initialShardFraction = Number(process.env.AKASHIK_BENCH_SHARD ?? 0.05);
  const windowSize = Number(process.env.AKASHIK_BENCH_WINDOW ?? 100);

  // Disjointness invariant: numPeers × initialShardFraction ≤ 1.0
  // — otherwise the simulator's sequential sharding can't allocate
  // enough docs and later peers get smaller shards (or nothing).
  // We don't fail; just log a warning.
  const totalCoverage = numPeers * initialShardFraction;
  if (totalCoverage > 1.0) {
    console.warn(`  WARN: peers (${numPeers}) × shardFraction (${initialShardFraction}) = ${totalCoverage} > 1.0 — sharding will be uneven`);
  }

  console.log(`AkashikBench-F: ${numPeers} peers × ${numSteps} steps · offline=${offlineProbability} · zipf=${zipfAlpha} · shard=${initialShardFraction} (coverage ${(totalCoverage * 100).toFixed(0)}%) · corpus=${corpus.queries.length} queries, ${corpus.allDocs.length} docs`);

  const t0 = performance.now();
  const result = runFederationSim(corpus, {
    numPeers,
    numSteps,
    offlineProbability,
    zipfAlpha,
    seed,
    initialShardFraction,
  });
  const elapsedMs = performance.now() - t0;

  const rates = webFallbackRateOverTime(result.events, windowSize);
  const slope = compoundingSlope(rates);
  const halfLife = propagationHalfLife(result.events, numPeers);
  const counts = resolveSourceCounts(result.events);

  // First and last window's fallback rates for a punchy comparison
  const firstRate = rates.length > 0 ? rates[0].rate : 0;
  const lastRate = rates.length > 0 ? rates[rates.length - 1].rate : 0;

  console.log(`  web_fallback_rate trajectory:`);
  for (let i = 0; i < rates.length; i++) {
    if (i === 0 || i === rates.length - 1 || i % Math.max(1, Math.floor(rates.length / 8)) === 0) {
      console.log(`    t≈${rates[i].t.toString().padStart(5)}  rate=${rates[i].rate.toFixed(3)}`);
    }
  }
  console.log(`  first→last fallback rate: ${firstRate.toFixed(3)} → ${lastRate.toFixed(3)}  (slope=${slope.toExponential(2)})`);
  console.log(`  propagation half-life: median=${halfLife.median.toFixed(1)} steps · ever-reached=${halfLife.everReached} · never=${halfLife.never}`);
  console.log(`  resolve sources: local=${counts.local} federation=${counts.federation} web=${counts.web} (total ${counts.total})`);
  console.log(`  elapsed: ${(elapsedMs).toFixed(1)} ms`);

  const report: BenchSuiteReport = {
    suite: 'akashik-federation',
    metrics: {
      webFallbackRateFirst: firstRate,
      webFallbackRateLast: lastRate,
      compoundingSlope: slope,
      propagationHalfLifeMedian: Number.isFinite(halfLife.median) ? halfLife.median : -1,
      propagationEverReached: halfLife.everReached,
      propagationNever: halfLife.never,
      localFraction: counts.total > 0 ? counts.local / counts.total : 0,
      federationFraction: counts.total > 0 ? counts.federation / counts.total : 0,
      webFraction: counts.total > 0 ? counts.web / counts.total : 0,
      simSteps: numSteps,
      eventsEmitted: result.events.length,
      numPeers,
    },
    perQuery: rates.map((r, i) => ({
      id: `window-${i}`,
      metric: 'web_fallback_rate',
      value: r.rate,
    })),
    elapsedMs,
    notes: `AkashikBench-F v1 on LoCoMo factual — ${corpus.queries.length} queries × ${corpus.allDocs.length} docs · ${numPeers} peers · ${numSteps} steps · offline=${offlineProbability} · zipf=${zipfAlpha} · shard=${initialShardFraction}. Boolean federation simulator (no per-peer retrieval — see suite header). Compounding = negative slope of web_fallback_rate over the simulation.`,
  };

  if (process.env.WELLINFORMED_BENCH_OUT) {
    appendFileSync(process.env.WELLINFORMED_BENCH_OUT, JSON.stringify(report) + '\n');
  }

  // Floor: with realistic Zipfian curiosity + < 100% initial coverage,
  // the network MUST show negative slope (web_fallback_rate falling).
  // If this fails, either the simulator is broken or the federated-
  // commons thesis is wrong for this corpus / config — both are
  // useful to know.
  assert.ok(slope < 0, `compoundingSlope must be negative (network learning); got ${slope}`);
  // Sanity: at least SOME fallback should hit the web; otherwise
  // the config didn't exercise the federation mechanism.
  assert.ok(counts.web > 0, `expected at least some web fallbacks; got ${counts.web}`);
});
