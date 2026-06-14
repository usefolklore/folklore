#!/usr/bin/env node
/**
 * Value-model scorecard.
 *
 * Aggregates the measured benchmark artifacts into the product questions
 * the website has to answer:
 *   - What quantitative advantage does the model create?
 *   - How much model-token input does graph transfer save?
 *   - How much more context/complexity is imported per remote hit?
 *   - Does provenance/context make a lighter model safer?
 *   - What is still not proven?
 *
 * This script does not invent new measurements. It reads the benchmark
 * outputs produced by bench-compounding, bench-subgraph-transfer,
 * bench-index-health, bench-user-value, and the Fellows poison eval.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'eval', 'out');

const readJson = (rel, fallback = null) => {
  const path = join(ROOT, rel);
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
};

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const xfmt = (x) => `${x.toFixed(x >= 10 ? 1 : 2)}x`;
const nfmt = (n) => Math.round(n).toLocaleString('en-US');

const comp = readJson('eval/out/compounding-summary.json');
const transfer = readJson('eval/out/subgraph-transfer-summary.json');
const index = readJson('eval/out/index-health-summary.json');
const userValue = readJson('eval/out/user-value-summary.json');
const haiku = readJson('eval/out.run6-haiku/summary.json');

const requireArtifact = (name, value) => {
  if (value === null) {
    console.error(`bench-value-model: missing ${name}. Run the component benchmark first.`);
    process.exit(1);
  }
};

requireArtifact('eval/out/compounding-summary.json', comp);
requireArtifact('eval/out/subgraph-transfer-summary.json', transfer);
requireArtifact('eval/out.run6-haiku/summary.json', haiku);

const asrT0 = mean(Object.values(haiku.asr.T0));
const asrT1 = mean(Object.values(haiku.asr.T1));
const effectT0 = mean(Object.values(haiku.effect.T0));
const effectT1 = mean(Object.values(haiku.effect.T1));

const cumulative = comp.cumulative;
const sub = comp.subgraph_economics;
const realTransfer = transfer.token_model;
const graph = transfer.graph;

const scorecard = {
  generated_at: new Date().toISOString(),
  questions: [
    {
      question: 'What quantitative advantage does cooperative graph transfer create?',
      benchmark: 'bench-compounding cumulative stream, 64 peers, 200k queries',
      result: {
        paid_web_trips_no_cache: cumulative.paid_trips.no_cache,
        paid_web_trips_isolated: cumulative.paid_trips.isolated,
        paid_web_trips_cooperative: cumulative.paid_trips.cooperative,
        web_trips_avoided: cumulative.cumulative_trips_avoided,
        cheaper_x: cumulative.cheaper_x,
        end_marginal_cost_cooperative: cumulative.end_marginal_cost.cooperative,
      },
      website_line: `${xfmt(cumulative.cheaper_x)} fewer paid web trips over 200k queries; end marginal web cost falls to ${pct(cumulative.end_marginal_cost.cooperative)}.`,
      inference_grade: 'strong simulator evidence, Che-validated; still needs production semantic satisfaction.',
    },
    {
      question: 'How much model-token input does subgraph transfer save?',
      benchmark: 'bench-compounding subgraph economics plus real graph transfer payload model',
      result: {
        synthetic_tokens_no_cache: sub.model_input_tokens.no_cache,
        synthetic_tokens_cooperative: sub.model_input_tokens.cooperative,
        synthetic_token_saving: sub.token_saving_vs_no_cache,
        synthetic_cheaper_x: sub.cheaper_x_vs_no_cache,
        real_graph_token_saving: realTransfer.token_saving_fraction,
        real_graph_cheaper_x: realTransfer.cheaper_x,
      },
      website_line: `${pct(sub.token_saving_vs_no_cache)} fewer model input tokens in the demand simulation; ${pct(realTransfer.token_saving_fraction)} saved on the measured local graph neighborhood model.`,
      inference_grade: 'grounded economics model; token counts are modeled from measured trips and measured graph payloads, not LLM bill logs.',
    },
    {
      question: 'How much more context/complexity can the user carry locally?',
      benchmark: 'bench-subgraph-transfer over the real local graph',
      result: {
        graph_nodes: graph.nodes,
        graph_links: graph.links,
        average_transplant_nodes: transfer.transplant.nodes.avg,
        average_transplant_edges: transfer.transplant.edges.avg,
        p50_payload_bytes: transfer.transplant.bytes.p50,
        p90_payload_bytes: transfer.transplant.bytes.p90,
        effective_related_queries: realTransfer.effective_related_queries,
      },
      website_line: `A remote hit imports ${transfer.transplant.nodes.avg.toFixed(1)} nodes and ${transfer.transplant.edges.avg.toFixed(1)} edges on average from the live graph; p50 payload ${(transfer.transplant.bytes.p50 / 1024).toFixed(1)} KiB, p90 ${(transfer.transplant.bytes.p90 / 1024).toFixed(1)} KiB.`,
      inference_grade: 'real local graph measurement; semantic usefulness of each imported neighbor still needs a satisfaction benchmark.',
    },
    {
      question: 'Can lighter models work better when the graph supplies trusted context?',
      benchmark: 'Fellows displaced-poison matrix, Haiku agent, Opus judge',
      result: {
        judged_cells: haiku.n_judged,
        total_queries: haiku.total_queries,
        flip_asr_baseline: asrT0,
        flip_asr_with_provenance_ranker: asrT1,
        flip_asr_reduction_x: asrT0 / Math.max(1e-9, asrT1),
        attack_effect_baseline: effectT0,
        attack_effect_with_provenance_ranker: effectT1,
        attack_effect_reduction_x: effectT0 / Math.max(1e-9, effectT1),
      },
      website_line: `On Haiku, provenance ranking cuts poison flip-ASR from ${pct(asrT0)} to ${pct(asrT1)} (${xfmt(asrT0 / Math.max(1e-9, asrT1))}) and attack-effect from ${pct(effectT0)} to ${pct(effectT1)} (${xfmt(effectT0 / Math.max(1e-9, effectT1))}).`,
      inference_grade: 'strong lighter-model safety result for same-model baseline vs protocol; not yet a Haiku+protocol vs Opus-alone comparison.',
    },
    {
      question: 'Does the current user-facing ask path already deflect web search?',
      benchmark: 'bench-user-value natural questions over actual folklore ask --json',
      result: userValue?.overall ?? null,
      website_line: userValue
        ? `Current natural-question graph hit rate is only ${pct(userValue.overall.success_rate)} with ${pct(userValue.overall.web_deflection_rate)} web deflection; do not use this as a positive website claim yet.`
        : 'Not measured in this run.',
      inference_grade: 'negative/gap result; index health suggests reindexing titles, source URIs, and provenance into embedded text before claiming user-question deflection.',
    },
  ],
  current_claims_allowed: [
    `Cooperative graph sharing reduced paid web trips from ${nfmt(cumulative.paid_trips.no_cache)} to ${nfmt(cumulative.paid_trips.cooperative)} over the 200k-query simulation (${xfmt(cumulative.cheaper_x)} cheaper).`,
    `Subgraph transfer reduced modeled model-input tokens from ${nfmt(sub.model_input_tokens.no_cache)} to ${nfmt(sub.model_input_tokens.cooperative)} (${pct(sub.token_saving_vs_no_cache)} saved).`,
    `On the measured local graph, one-hop subgraph transfer saved ${pct(realTransfer.token_saving_fraction)} of model input tokens across related queries (${xfmt(realTransfer.cheaper_x)} fewer).`,
    `On Haiku, provenance ranking reduced poison flip-ASR by ${xfmt(asrT0 / Math.max(1e-9, asrT1))}.`,
  ],
  claims_not_allowed_yet: [
    'Do not claim natural user-question web deflection yet; the current measured success rate is 5.0%.',
    'Do not claim Haiku+protocol beats Opus alone until the Opus displaced-poison head-to-head is complete.',
    'Do not claim production P2P churn/availability proof until the two-daemon subgraph transfer smoke is run.',
  ],
  index_health: index,
};

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'value-model-summary.json'), JSON.stringify(scorecard, null, 2) + '\n');

const W = 900, H = 460, P = 64;
const bars = [
  ['web trips saved', comp.cumulative.cumulative_trips_avoided / comp.cumulative.paid_trips.no_cache, '#2e86de', pct(comp.cumulative.cumulative_trips_avoided / comp.cumulative.paid_trips.no_cache)],
  ['model tokens saved', sub.token_saving_vs_no_cache, '#27ae60', pct(sub.token_saving_vs_no_cache)],
  ['real graph tokens saved', realTransfer.token_saving_fraction, '#8e44ad', pct(realTransfer.token_saving_fraction)],
  ['Haiku ASR removed', 1 - (asrT1 / Math.max(1e-9, asrT0)), '#c0392b', pct(1 - (asrT1 / Math.max(1e-9, asrT0)))],
  ['natural ask success', userValue?.overall?.success_rate ?? 0, '#777', pct(userValue?.overall?.success_rate ?? 0)],
];
const bw = (W - 2 * P) / bars.length;
const y = (v) => (H - P) - v * (H - 2 * P);
const svg = [];
svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="ui-monospace,monospace">`);
svg.push(`<rect width="${W}" height="${H}" fill="#fdfdfb"/>`);
svg.push(`<text x="${W / 2}" y="30" text-anchor="middle" font-size="16" font-weight="700">Folklore value-model scorecard</text>`);
svg.push(`<line x1="${P}" y1="${H - P}" x2="${W - P}" y2="${H - P}" stroke="#333"/>`);
svg.push(`<line x1="${P}" y1="${P}" x2="${P}" y2="${H - P}" stroke="#333"/>`);
for (let f = 0; f <= 1.0001; f += 0.25) {
  svg.push(`<line x1="${P - 4}" y1="${y(f)}" x2="${W - P}" y2="${y(f)}" stroke="#eee"/>`);
  svg.push(`<text x="${P - 8}" y="${y(f) + 4}" text-anchor="end" font-size="11">${Math.round(f * 100)}%</text>`);
}
bars.forEach(([label, value, color, text], i) => {
  const x = P + i * bw + 22;
  const h = (H - P) - y(value);
  svg.push(`<rect x="${x}" y="${y(value)}" width="${Math.max(24, bw - 44)}" height="${h}" fill="${color}"/>`);
  svg.push(`<text x="${x + Math.max(24, bw - 44) / 2}" y="${y(value) - 8}" text-anchor="middle" font-size="12" font-weight="700">${text}</text>`);
  svg.push(`<text x="${x + Math.max(24, bw - 44) / 2}" y="${H - P + 18}" text-anchor="middle" font-size="11">${label}</text>`);
});
svg.push(`<text x="${W / 2}" y="${H - 16}" text-anchor="middle" font-size="12">measured advantage per benchmark; gray bar is the current gap, not a claim</text>`);
svg.push('</svg>');
writeFileSync(join(OUT, 'value-model-scorecard.svg'), svg.join('\n'));

console.log('bench-value-model: quantitative scorecard');
for (const q of scorecard.questions) {
  console.log(`- ${q.question}`);
  console.log(`  ${q.website_line}`);
}
console.log(`bench-value-model: -> ${join(OUT, 'value-model-summary.json')}`);
console.log(`bench-value-model: -> ${join(OUT, 'value-model-scorecard.svg')}`);
