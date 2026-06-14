#!/usr/bin/env node
/**
 * Real-graph subgraph-transfer benchmark.
 *
 * Measures the actual local graph topology behind the product claim:
 * a federated hit transfers a bounded graph neighborhood (nodes + edges
 * + bodies + provenance), not a one-shot summary. The benchmark samples
 * real 1-hop neighborhoods from ~/.folklore/graph.json and reports:
 *
 *   - how many nodes/edges a bounded transplant carries
 *   - how large the P2P payload is
 *   - how many model input tokens are avoided when future related asks
 *     retrieve a compact graph working set instead of repeating web
 *     context
 *
 * No model, no network, no deps. Deterministic sample.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'eval', 'out');

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : dflt;
};

const GRAPH_PATH = flag('graph', join(homedir(), '.folklore', 'graph.json'));
const SAMPLE = parseInt(flag('sample', '2000'), 10);
const MAX_NODES = parseInt(flag('maxNodes', '48'), 10);
const WEB_CONTEXT_TOKENS = parseInt(flag('webContextTokens', '8000'), 10);
const GRAPH_CONTEXT_TOKENS = parseInt(flag('graphContextTokens', '1200'), 10);
const RELATED_QUERIES = parseInt(flag('relatedQueries', '8'), 10);
const SEED = parseInt(flag('seed', '1'), 10);

const rngFrom = (seed) => {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const pct = (xs, p) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
};

const stat = (xs) => ({
  avg: xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length),
  p50: pct(xs, 0.5),
  p90: pct(xs, 0.9),
  p95: pct(xs, 0.95),
});

if (!existsSync(GRAPH_PATH)) {
  console.error(`bench-subgraph-transfer: no graph at ${GRAPH_PATH}`);
  process.exit(1);
}

const raw = JSON.parse(readFileSync(GRAPH_PATH, 'utf8'));
const nodes = Array.isArray(raw.nodes) ? raw.nodes : [];
const links = Array.isArray(raw.links) ? raw.links : [];
const byId = new Map(nodes.map((n) => [n.id, n]));
const edgeByNode = new Map();
for (const e of links) {
  if (!byId.has(e.source) || !byId.has(e.target)) continue;
  const a = edgeByNode.get(e.source) ?? [];
  a.push(e);
  edgeByNode.set(e.source, a);
  const b = edgeByNode.get(e.target) ?? [];
  b.push(e);
  edgeByNode.set(e.target, b);
}

const publicNodes = nodes.filter((n) => n.private !== true);
const rng = rngFrom(SEED);
const sampled = [];
for (let i = 0; i < Math.min(SAMPLE, publicNodes.length); i++) {
  sampled.push(publicNodes[(rng() * publicNodes.length) | 0]);
}

const projectNode = (n) => ({
  node_id: n.id,
  label: n.label,
  summary: typeof n.summary === 'string' ? n.summary.slice(0, 4000) : undefined,
  source_uri: typeof n.source_uri === 'string' ? n.source_uri : undefined,
  fetched_at: typeof n.fetched_at === 'string' ? n.fetched_at : undefined,
});

const projectEdge = (e) => ({
  source: e.source,
  target: e.target,
  relation: e.relation,
  confidence: e.confidence,
  source_file: 'peer-subgraph',
  ...(typeof e.confidence_score === 'number' ? { confidence_score: e.confidence_score } : {}),
});

const rows = sampled.map((seedNode) => {
  const selected = new Set([seedNode.id]);
  const incident = edgeByNode.get(seedNode.id) ?? [];
  for (const e of incident) {
    if (selected.size >= MAX_NODES) break;
    const other = e.source === seedNode.id ? e.target : e.source;
    const n = byId.get(other);
    if (n && n.private !== true) selected.add(other);
  }
  const subNodes = [...selected].map((id) => byId.get(id)).filter(Boolean);
  const allowed = new Set(subNodes.map((n) => n.id));
  const subEdges = incident
    .filter((e) => allowed.has(e.source) && allowed.has(e.target))
    .map(projectEdge);
  const payload = {
    type: 'fetch_ok',
    protocol_version: 5,
    nodes: subNodes.map(projectNode),
    edges: subEdges,
  };
  return {
    seed: seedNode.id,
    nodes: subNodes.length,
    edges: subEdges.length,
    bytes: Buffer.byteLength(JSON.stringify(payload)),
  };
});

const nodeStats = stat(rows.map((r) => r.nodes));
const edgeStats = stat(rows.map((r) => r.edges));
const byteStats = stat(rows.map((r) => r.bytes));
const meanNodes = nodeStats.avg;
const effectiveRelated = Math.max(1, Math.min(RELATED_QUERIES, meanNodes));
const noGraphTokens = effectiveRelated * WEB_CONTEXT_TOKENS;
const graphTokens = WEB_CONTEXT_TOKENS + Math.max(0, effectiveRelated - 1) * GRAPH_CONTEXT_TOKENS;
const saving = 1 - graphTokens / noGraphTokens;

mkdirSync(OUT, { recursive: true });

const summary = {
  graph: {
    path: GRAPH_PATH,
    nodes: nodes.length,
    public_nodes: publicNodes.length,
    links: links.length,
  },
  params: {
    sample: rows.length,
    max_nodes: MAX_NODES,
    related_queries: RELATED_QUERIES,
    web_context_tokens: WEB_CONTEXT_TOKENS,
    graph_context_tokens: GRAPH_CONTEXT_TOKENS,
    seed: SEED,
  },
  transplant: {
    nodes: nodeStats,
    edges: edgeStats,
    bytes: byteStats,
  },
  token_model: {
    effective_related_queries: effectiveRelated,
    no_graph_tokens: noGraphTokens,
    graph_transfer_then_retrieve_tokens: graphTokens,
    token_saving_fraction: saving,
    cheaper_x: noGraphTokens / graphTokens,
  },
};

writeFileSync(join(OUT, 'subgraph-transfer-summary.json'), JSON.stringify(summary, null, 2) + '\n');

const W = 760, H = 420, P = 70;
const maxB = Math.max(...rows.map((r) => r.bytes), 1);
const bins = new Array(12).fill(0);
for (const r of rows) bins[Math.min(bins.length - 1, Math.floor((r.bytes / maxB) * bins.length))]++;
const maxBin = Math.max(...bins, 1);
const svg = [];
svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="ui-monospace,monospace">`);
svg.push(`<rect width="${W}" height="${H}" fill="#fdfdfb"/>`);
svg.push(`<text x="${W / 2}" y="28" text-anchor="middle" font-size="16" font-weight="700">Real graph subgraph-transfer payloads</text>`);
svg.push(`<line x1="${P}" y1="${H - P}" x2="${W - P}" y2="${H - P}" stroke="#333"/>`);
svg.push(`<line x1="${P}" y1="${P}" x2="${P}" y2="${H - P}" stroke="#333"/>`);
const bw = (W - 2 * P) / bins.length;
bins.forEach((v, i) => {
  const x = P + i * bw + 3;
  const h = (v / maxBin) * (H - 2 * P);
  svg.push(`<rect x="${x}" y="${H - P - h}" width="${Math.max(1, bw - 6)}" height="${h}" fill="#2e86de"/>`);
});
svg.push(`<text x="${W / 2}" y="${H - 18}" text-anchor="middle" font-size="12">bounded 1-hop transplant payload bytes</text>`);
svg.push(`<text x="18" y="${H / 2}" text-anchor="middle" font-size="12" transform="rotate(-90 18 ${H / 2})">sample count</text>`);
svg.push(`<text x="${P}" y="${H - P + 18}" text-anchor="middle" font-size="11">0</text>`);
svg.push(`<text x="${W - P}" y="${H - P + 18}" text-anchor="middle" font-size="11">${Math.round(maxB / 1024)} KiB</text>`);
svg.push(`<text x="${W - P}" y="${P}" text-anchor="end" font-size="12">p50 ${(byteStats.p50 / 1024).toFixed(1)} KiB · p90 ${(byteStats.p90 / 1024).toFixed(1)} KiB</text>`);
svg.push('</svg>');
writeFileSync(join(OUT, 'subgraph-transfer-payloads.svg'), svg.join('\n'));

console.log(`bench-subgraph-transfer: graph=${nodes.length} nodes, ${links.length} links, sample=${rows.length}`);
console.log(`transplant nodes: avg=${nodeStats.avg.toFixed(1)} p50=${nodeStats.p50} p90=${nodeStats.p90}`);
console.log(`transplant edges: avg=${edgeStats.avg.toFixed(1)} p50=${edgeStats.p50} p90=${edgeStats.p90}`);
console.log(`payload bytes: avg=${(byteStats.avg / 1024).toFixed(1)} KiB p50=${(byteStats.p50 / 1024).toFixed(1)} KiB p90=${(byteStats.p90 / 1024).toFixed(1)} KiB`);
console.log(`token model: ${(saving * 100).toFixed(1)}% saved over ${effectiveRelated.toFixed(1)} related queries (${(noGraphTokens / graphTokens).toFixed(1)}x fewer model input tokens)`);
console.log(`bench-subgraph-transfer: -> ${join(OUT, 'subgraph-transfer-summary.json')}`);
console.log(`bench-subgraph-transfer: -> ${join(OUT, 'subgraph-transfer-payloads.svg')}`);
