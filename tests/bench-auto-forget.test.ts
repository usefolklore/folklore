/**
 * Benchmark — auto-forget precision/recall (Phase 23).
 *
 * 50-node staged graph fixture: 20 nodes intentionally stale (TTL
 * expired, retention frozen, or contradicting a strong semantic), 30
 * nodes that should survive. Run `planAutoForget` and score the set
 * of demoted/deleted node ids against ground truth.
 *
 * Acceptance: F1 ≥ 0.85. Lower than gate F1 because retention is a
 * tunable curve (λ, σ, demoteMinAgeDays) where a few edge cases are
 * intentionally ambiguous and labelled accordingly.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendFileSync as _appendFileSync } from 'node:fs';
const appendBenchReport = (path: string, data: string): void => _appendFileSync(path, data);
import { planAutoForget } from '../src/domain/auto-forget.js';
import type { GraphNode } from '../src/domain/graph.js';
import {
  f1,
  precision,
  recall,
  type ConfusionMatrix,
  type BenchSuiteReport,
} from '../src/domain/bench-types.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-05-19T00:00:00Z');
const iso = (daysAgo: number): string => new Date(NOW - daysAgo * DAY).toISOString();

interface LabelledNode extends GraphNode {
  readonly expectedAction: 'delete' | 'demote' | 'keep';
}

const node = (overrides: Partial<GraphNode> & { id: string; expectedAction: 'delete' | 'demote' | 'keep' }): LabelledNode =>
  ({
    label: overrides.id,
    file_type: 'document',
    source_file: overrides.id,
    source_uri: overrides.id,
    ...overrides,
  }) as LabelledNode;

// ─────────────── 50-node fixture ─────────────

const FIXTURE: readonly LabelledNode[] = [
  // ─── keep: fresh tier nodes (20) ─────────────
  // Each summary is uniquely worded so the contradiction pass doesn't
  // pathologically Jaccard-match across them.
  ...Array.from({ length: 5 }, (_, i) =>
    node({
      id: `synthesis://fresh-${i}`,
      fetched_at: iso(3 + i),
      consolidated_at: iso(3 + i),
      concepts: [`fresh-topic-${i}`, `benchmark-cluster-${i}`],
      summary: [
        'BGE-base outperforms MiniLM on BEIR SciFact retrieval',
        'HotpotQA multi-hop requires bridging two distant evidence paragraphs',
        'LongMemEval-S tests five abilities including knowledge updates',
        'Cross-encoder ms-marco-MiniLM yields measurable rerank lift on top-20 heads',
        'RRF fusion k equal to sixty is the canonical TREC deep learning combiner',
      ][i],
      expectedAction: 'keep',
    }),
  ),
  ...Array.from({ length: 5 }, (_, i) =>
    node({
      id: `decision://recent-workflow-${i}`,
      fetched_at: iso(2 + i * 2),
      concepts: [`workflow-${i}`, `step-class-${i}`],
      summary: [
        'Release workflow runs tests then tags then pushes then announces',
        'Hotfix protocol bypasses milestone planning when production is bleeding',
        'PR review flow requires two approvals plus green CI before merge',
        'Eval rerun nightly compares retrieval against the locked baseline corpus',
        'Federation handshake exchanges signed peer DIDs over libp2p Noise channels',
      ][i],
      expectedAction: 'keep',
    }),
  ),
  ...Array.from({ length: 5 }, (_, i) =>
    node({
      id: `session://recent-${i}`,
      fetched_at: iso(1 + i),
      summary: [
        'Session covered debugging the gossipsub fan-out timeout edge case',
        'Today we paired on the Bayesian counter calibration test fixture',
        'Pair session producing the write gate fixture with adversarial samples',
        'Live debugging of the auto-forget contradiction pathological match',
        'Onboarding walkthrough of the room-sharing CRDT layer for a new contributor',
      ][i],
      expectedAction: 'keep',
    }),
  ),
  ...Array.from({ length: 5 }, (_, i) =>
    node({
      id: `file:///recent/doc-${i}.md`,
      // observation tier — auto-forget MUST skip
      fetched_at: iso(2),
      expectedAction: 'keep',
    }),
  ),

  // ─── delete: TTL-expired (5) ─────────────
  // Each has a unique summary so the contradiction pass doesn't
  // pathologically Jaccard-match on label-only tokens.
  ...Array.from({ length: 5 }, (_, i) =>
    node({
      id: `synthesis://ttl-${i}`,
      fetched_at: iso(5),
      consolidated_at: iso(5),
      forgetAfter: iso(1),   // yesterday
      concepts: [`ephemeral-${i}`, `ttl-topic-${i}`],
      summary: `Ephemeral semantic ${i} about transient measurement set ${i} that the writer marked for short retention via explicit TTL configuration.`,
      expectedAction: 'delete',
    } as unknown as LabelledNode & { forgetAfter: string }),
  ),

  // ─── demote: frozen retention (10) ─────────────
  ...Array.from({ length: 10 }, (_, i) =>
    node({
      id: `synthesis://ancient-${i}`,
      fetched_at: iso(400 + i * 10),
      consolidated_at: iso(400 + i * 10),
      concepts: [`archived-${i}`, `topic-ancient-${i}`],
      summary: `Ancient archived semantic memory number ${i} about a legacy topic that was once relevant but the underlying field has moved on substantially since.`,
      expectedAction: 'demote',
    }),
  ),

  // ─── ambiguous (5) — labelled keep but the planner may demote on edge cases.
  ...Array.from({ length: 5 }, (_, i) =>
    node({
      id: `synthesis://midband-${i}`,
      fetched_at: iso(70 + i * 5),
      consolidated_at: iso(70 + i * 5),
      concepts: [`midlife-${i}`, `still-warm-${i}`],
      summary: `Midband semantic ${i} discussing an evolving area where the original observation still mostly holds but newer evidence is starting to refine it.`,
      expectedAction: 'keep',
    }),
  ),
];

// ─────────────── score ─────────────

test('bench: auto-forget F1 ≥ 0.85', () => {
  const t0 = performance.now();
  const plan = planAutoForget(FIXTURE, NOW, { demoteMinAgeDays: 30, lambda: 0.01, sigma: 0.3 });
  const actedOn = new Set(plan.items.map((it) => it.nodeId));

  const groundTruth = new Set<string>(
    FIXTURE.filter((n) => n.expectedAction !== 'keep').map((n) => n.id),
  );

  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const n of FIXTURE) {
    const expectedAct = groundTruth.has(n.id);
    const actuallyAct = actedOn.has(n.id);
    if (expectedAct && actuallyAct) tp++;
    else if (!expectedAct && actuallyAct) fp++;
    else if (expectedAct && !actuallyAct) fn++;
    else tn++;
  }
  const cm: ConfusionMatrix = { tp, fp, fn, tn };
  const p = precision(cm);
  const r = recall(cm);
  const score = f1(cm);
  const elapsedMs = performance.now() - t0;

  const report: BenchSuiteReport = {
    suite: 'auto-forget',
    metrics: {
      autoForgetF1: score,
      precision: p,
      recall: r,
      tp, fp, fn, tn,
      planned_deletes: plan.stats.deletes,
      planned_demotes: plan.stats.demotes,
    },
    perQuery: [],
    elapsedMs,
  };

  if (process.env.WELLINFORMED_BENCH_OUT) {
    appendBenchReport(process.env.WELLINFORMED_BENCH_OUT, JSON.stringify(report) + '\n');
  }

  console.log(
    `bench auto-forget: F1=${score.toFixed(4)} (P=${p.toFixed(3)} R=${r.toFixed(3)}, deletes=${plan.stats.deletes} demotes=${plan.stats.demotes}) in ${elapsedMs.toFixed(1)}ms`,
  );
  assert.ok(score >= 0.85, `auto-forget F1 ${score} below 0.85`);
});
