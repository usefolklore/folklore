#!/usr/bin/env node
/**
 * User-value benchmark.
 *
 * Generates product-shaped questions from the real local graph and runs
 * actual `folklore ask --json` calls. This measures whether the graph can
 * answer questions users naturally ask before the harness falls through
 * to web search.
 *
 * Scenarios:
 *   exact_recall         "What do we know about <node title>?"
 *   provenance_lookup   "What is the source and date for <node title>?"
 *   related_context     "Show related context around <node title>."
 *
 * Success is intentionally strict and grounded:
 *   exact/provenance: seed node appears in top-k.
 *   related_context: seed or a one-hop neighbor appears in top-k.
 *
 * No web calls. No model judge. Uses current graph + current retriever.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'eval', 'out');

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : dflt;
};
const has = (name) => argv.includes(`--${name}`);

const GRAPH_PATH = flag('graph', join(homedir(), '.folklore', 'graph.json'));
const BIN = flag('bin', join(ROOT, 'bin', 'folklore.js'));
const SOURCE_HOME = dirname(GRAPH_PATH);
const HOME_EXPLICIT = argv.includes('--home');
const HOME = flag('home', join('/tmp', 'folklore-user-value-home'));
const PER_SCENARIO = parseInt(flag('perScenario', '12'), 10);
const K = parseInt(flag('k', '5'), 10);
const SEED = parseInt(flag('seed', '7'), 10);
const WEB_CONTEXT_TOKENS = parseInt(flag('webContextTokens', '8000'), 10);
const GRAPH_CONTEXT_TOKENS = parseInt(flag('graphContextTokens', '1200'), 10);
const TIMEOUT_MS = parseInt(flag('timeoutMs', '30000'), 10);

const rngFrom = (seed) => {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const cleanTitle = (label) =>
  String(label ?? '')
    .replace(/\s*\[chunk\s+\d+\/\d+\]\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

const sourceKey = (uri) =>
  String(uri ?? '')
    .replace(/#chunk-\d+$/i, '')
    .replace(/#atom-everything.*$/i, '#atom-everything')
    .trim();

const isPublicSource = (uri) => /^(https?:|arxiv:)/i.test(String(uri ?? ''));

const isHumanTitle = (title) =>
  title.length >= 16 &&
  title.length <= 120 &&
  !title.startsWith('[') &&
  !title.includes('/Users/') &&
  !title.includes('file://') &&
  !/\.(ts|tsx|js|json|md|py|css|html)\b/i.test(title);

const contentPhrase = (text) =>
  String(text)
    .replace(/\s+/g, ' ')
    .split(/[.!?]/)[0]
    .split(' ')
    .slice(0, 18)
    .join(' ')
    .trim();

const contentExcerpt = (text) =>
  String(text)
    .replace(/\s+/g, ' ')
    .slice(0, 220)
    .trim();

const pct = (xs, p) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
};

const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

if (!existsSync(GRAPH_PATH)) {
  console.error(`bench-user-value: no graph at ${GRAPH_PATH}`);
  process.exit(1);
}

const copyIfChanged = (src, dst) => {
  if (!existsSync(src)) return;
  const srcStat = statSync(src);
  if (existsSync(dst)) {
    const dstStat = statSync(dst);
    if (dstStat.size === srcStat.size && Math.trunc(dstStat.mtimeMs) >= Math.trunc(srcStat.mtimeMs)) return;
  }
  copyFileSync(src, dst);
};

const prepareWritableHome = () => {
  if (HOME_EXPLICIT) return;
  mkdirSync(HOME, { recursive: true });
  for (const name of ['graph.json', 'vectors.db', 'entities.json', 'config.yaml', 'sources.json', 'linked-accounts.json']) {
    copyIfChanged(join(SOURCE_HOME, name), join(HOME, name));
  }
  const srcModels = join(SOURCE_HOME, 'models');
  const dstModels = join(HOME, 'models');
  if (existsSync(srcModels) && !existsSync(dstModels)) {
    try { symlinkSync(srcModels, dstModels, 'dir'); } catch { /* best effort */ }
  }
};

prepareWritableHome();

const rawTextById = (() => {
  const dbPath = join(HOME, 'vectors.db');
  if (!existsSync(dbPath)) return new Map();
  const db = new Database(dbPath, { readonly: true });
  try {
    return new Map(
      db.prepare(
        'SELECT node_id, raw_text FROM vec_meta WHERE raw_text IS NOT NULL AND length(raw_text) >= 160',
      ).all().map((r) => [r.node_id, String(r.raw_text)]),
    );
  } finally {
    db.close();
  }
})();

const raw = JSON.parse(readFileSync(GRAPH_PATH, 'utf8'));
const nodes = Array.isArray(raw.nodes) ? raw.nodes : [];
const links = Array.isArray(raw.links) ? raw.links : [];
const byId = new Map(nodes.map((n) => [n.id, n]));
const neighbors = new Map();
for (const e of links) {
  if (!byId.has(e.source) || !byId.has(e.target)) continue;
  const a = neighbors.get(e.source) ?? new Set();
  a.add(e.target); neighbors.set(e.source, a);
  const b = neighbors.get(e.target) ?? new Set();
  b.add(e.source); neighbors.set(e.target, b);
}

const candidates = nodes
  .filter((n) =>
    n.private !== true &&
    typeof n.id === 'string' &&
    isHumanTitle(cleanTitle(n.label)) &&
    typeof n.source_uri === 'string' &&
    isPublicSource(n.source_uri) &&
    typeof n.fetched_at === 'string')
  .map((n) => ({ ...n, _title: cleanTitle(n.label), _source_key: sourceKey(n.source_uri), _degree: neighbors.get(n.id)?.size ?? 0 }));

const contentCandidates = candidates
  .map((n) => ({ ...n, _raw_text: rawTextById.get(n.id) }))
  .filter((n) => typeof n._raw_text === 'string' && contentPhrase(n._raw_text).length >= 40);

const rng = rngFrom(SEED);
const sample = (pool, n) => {
  const copy = [...pool];
  const out = [];
  while (copy.length > 0 && out.length < n) {
    const idx = (rng() * copy.length) | 0;
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
};

const exactSeeds = sample(candidates, PER_SCENARIO);
const provenanceSeeds = sample(candidates, PER_SCENARIO);
const relatedSeeds = sample(candidates.filter((n) => n._degree > 0), PER_SCENARIO);

const scenarios = [
  {
    name: 'content_excerpt',
    description: 'Paste an exact passage/snippet from prior context.',
    seeds: sample(contentCandidates, PER_SCENARIO),
    query: (n) => contentExcerpt(n._raw_text),
    relevant: (n) => new Set([n.id]),
    sourceKey: (n) => n._source_key,
  },
  {
    name: 'content_phrase',
    description: 'Paste a phrase remembered from something already read.',
    seeds: sample(contentCandidates, PER_SCENARIO),
    query: (n) => contentPhrase(n._raw_text),
    relevant: (n) => new Set([n.id]),
    sourceKey: (n) => n._source_key,
  },
  {
    name: 'content_question',
    description: 'Ask what the graph knows about an indexed passage.',
    seeds: sample(contentCandidates, PER_SCENARIO),
    query: (n) => `What do we know about: ${contentPhrase(n._raw_text)}?`,
    relevant: (n) => new Set([n.id]),
    sourceKey: (n) => n._source_key,
  },
  {
    name: 'direct_title',
    description: 'Paste the title/topic directly.',
    seeds: sample(candidates, PER_SCENARIO),
    query: (n) => n._title,
    relevant: (n) => new Set([n.id]),
    sourceKey: (n) => n._source_key,
  },
  {
    name: 'source_url',
    description: 'Has this exact source already been fetched?',
    seeds: sample(candidates.filter((n) => String(n.source_uri).startsWith('http')), PER_SCENARIO),
    query: (n) => String(n.source_uri),
    relevant: (n) => new Set([n.id]),
    sourceKey: (n) => n._source_key,
  },
  {
    name: 'exact_recall',
    description: 'Has anyone already looked this up?',
    seeds: exactSeeds,
    query: (n) => `What do we know about ${n._title}?`,
    relevant: (n) => new Set([n.id]),
    sourceKey: (n) => n._source_key,
  },
  {
    name: 'provenance_lookup',
    description: 'Where did this come from, and how fresh is it?',
    seeds: provenanceSeeds,
    query: (n) => `What is the source and date for ${n._title}?`,
    relevant: (n) => new Set([n.id]),
    sourceKey: (n) => n._source_key,
    requireMetadata: true,
  },
  {
    name: 'related_context',
    description: 'Give me the surrounding context, not a summary.',
    seeds: relatedSeeds,
    query: (n) => `Show related context around ${n._title}.`,
    relevant: (n) => new Set([n.id, ...Array.from(neighbors.get(n.id) ?? [])]),
    sourceKey: (n) => n._source_key,
  },
];

const runAsk = (query) => {
  const t0 = performance.now();
  const r = spawnSync(process.execPath, [BIN, 'ask', query, '--json', '--k', String(K), '--workspace', 'all'], {
    env: { ...process.env, FOLKLORE_HOME: HOME },
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
  });
  const ms = performance.now() - t0;
  if (r.status !== 0) return { ok: false, ms, error: (r.stderr || '').trim() };
  try {
    return { ok: true, ms, data: JSON.parse(r.stdout) };
  } catch (e) {
    return { ok: false, ms, error: `bad json: ${(e).message}` };
  }
};

const rows = [];
for (const scenario of scenarios) {
  for (const seed of scenario.seeds) {
    const query = scenario.query(seed);
    const res = runAsk(query);
    const hits = res.ok && Array.isArray(res.data.hits) ? res.data.hits : [];
    const hitIds = hits.map((h) => h.id);
    const relevant = scenario.relevant(seed);
    const foundAt = hitIds.findIndex((id) => relevant.has(id));
    const expectedSource = scenario.sourceKey?.(seed);
    const sourceFoundAt = expectedSource
      ? hits.findIndex((h) => sourceKey(h.source_uri) === expectedSource)
      : -1;
    const metadataOk = !scenario.requireMetadata || hits.some((h) =>
      (relevant.has(h.id) || sourceKey(h.source_uri) === expectedSource) && h.source_uri && h.fetched_at);
    const success = res.ok && (foundAt >= 0 || sourceFoundAt >= 0) && metadataOk;
    rows.push({
      scenario: scenario.name,
      description: scenario.description,
      seed_id: seed.id,
      seed_label: seed._title,
      query,
      ok: res.ok,
      success,
      rank: foundAt >= 0 ? foundAt + 1 : sourceFoundAt >= 0 ? sourceFoundAt + 1 : null,
      latency_ms: Math.round(res.ms),
      satisfaction: res.ok && typeof res.data.satisfaction === 'number' ? res.data.satisfaction : null,
      decision: res.ok ? res.data.decision ?? null : null,
      hits: hits.slice(0, K).map((h) => ({ id: h.id, label: h.label, source_uri: h.source_uri })),
      error: res.ok ? undefined : res.error,
    });
  }
}

const byScenario = Object.fromEntries(scenarios.map((s) => [s.name, rows.filter((r) => r.scenario === s.name)]));
const summarize = (rs) => {
  const ok = rs.filter((r) => r.ok);
  const successes = rs.filter((r) => r.success);
  const deflected = rs.filter((r) => r.success && ['use_memory', 'verify_one_source'].includes(r.decision));
  const lat = ok.map((r) => r.latency_ms);
  const sats = ok.map((r) => r.satisfaction).filter((x) => typeof x === 'number');
  const savedTokens = deflected.length * Math.max(0, WEB_CONTEXT_TOKENS - GRAPH_CONTEXT_TOKENS);
  return {
    n: rs.length,
    ok: ok.length,
    success: successes.length,
    success_rate: successes.length / Math.max(1, rs.length),
    web_deflections: deflected.length,
    web_deflection_rate: deflected.length / Math.max(1, rs.length),
    p50_latency_ms: pct(lat, 0.5),
    p90_latency_ms: pct(lat, 0.9),
    mean_satisfaction: mean(sats),
    estimated_input_tokens_saved: savedTokens,
  };
};

const summary = {
  graph: { path: GRAPH_PATH, nodes: nodes.length, links: links.length, candidates: candidates.length },
  params: {
    per_scenario: PER_SCENARIO,
    k: K,
    seed: SEED,
    web_context_tokens: WEB_CONTEXT_TOKENS,
    graph_context_tokens: GRAPH_CONTEXT_TOKENS,
  },
  scenarios: Object.fromEntries(Object.entries(byScenario).map(([name, rs]) => [name, summarize(rs)])),
  overall: summarize(rows),
};

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'user-value-rows.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
writeFileSync(join(OUT, 'user-value-summary.json'), JSON.stringify(summary, null, 2) + '\n');

const W = 760, H = 420, P = 72;
const names = scenarios.map((s) => s.name);
const svg = [];
svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="ui-monospace,monospace">`);
svg.push(`<rect width="${W}" height="${H}" fill="#fdfdfb"/>`);
svg.push(`<text x="${W / 2}" y="28" text-anchor="middle" font-size="16" font-weight="700">Folklore user-value questions — graph answer rate</text>`);
svg.push(`<line x1="${P}" y1="${H - P}" x2="${W - P}" y2="${H - P}" stroke="#333"/>`);
svg.push(`<line x1="${P}" y1="${P}" x2="${P}" y2="${H - P}" stroke="#333"/>`);
for (let v = 0; v <= 1.001; v += 0.25) {
  const y = (H - P) - v * (H - 2 * P);
  svg.push(`<line x1="${P - 4}" y1="${y}" x2="${W - P}" y2="${y}" stroke="#eee"/>`);
  svg.push(`<text x="${P - 8}" y="${y + 4}" text-anchor="end" font-size="11">${(v * 100).toFixed(0)}%</text>`);
}
const bw = (W - 2 * P) / names.length;
names.forEach((name, i) => {
  const s = summary.scenarios[name];
  const h = s.success_rate * (H - 2 * P);
  const x = P + i * bw + bw * 0.25;
  svg.push(`<rect x="${x}" y="${H - P - h}" width="${bw * 0.5}" height="${h}" fill="#27ae60"/>`);
  svg.push(`<text x="${x + bw * 0.25}" y="${H - P + 18}" text-anchor="middle" font-size="10">${name.replace('_', ' ')}</text>`);
  svg.push(`<text x="${x + bw * 0.25}" y="${H - P - h - 6}" text-anchor="middle" font-size="11">${(s.success_rate * 100).toFixed(0)}%</text>`);
});
svg.push(`<text x="${W / 2}" y="${H - 16}" text-anchor="middle" font-size="12">question type generated from real graph nodes</text>`);
svg.push(`<text x="18" y="${H / 2}" text-anchor="middle" font-size="12" transform="rotate(-90 18 ${H / 2})">top-${K} grounded success</text>`);
svg.push('</svg>');
writeFileSync(join(OUT, 'user-value-questions.svg'), svg.join('\n'));

console.log(`bench-user-value: graph=${nodes.length} nodes, candidates=${candidates.length}, queries=${rows.length}`);
console.log('scenario             ok     success  deflect  p50ms  mean_satisfaction  est_tokens_saved');
for (const s of scenarios) {
  const r = summary.scenarios[s.name];
  console.log(
    `${s.name.padEnd(20)} ${String(r.ok).padStart(2)}/${String(r.n).padEnd(2)}  ` +
    `${(r.success_rate * 100).toFixed(1).padStart(6)}%  ` +
    `${(r.web_deflection_rate * 100).toFixed(1).padStart(6)}%  ` +
    `${String(Math.round(r.p50_latency_ms)).padStart(5)}  ` +
    `${r.mean_satisfaction.toFixed(2).padStart(17)}  ` +
    `${String(r.estimated_input_tokens_saved).padStart(16)}`,
  );
}
console.log(`overall: ${(summary.overall.success_rate * 100).toFixed(1)}% grounded success, ${(summary.overall.web_deflection_rate * 100).toFixed(1)}% web deflection`);
console.log(`bench-user-value: -> ${join(OUT, 'user-value-summary.json')}`);
console.log(`bench-user-value: -> ${join(OUT, 'user-value-rows.jsonl')}`);
console.log(`bench-user-value: -> ${join(OUT, 'user-value-questions.svg')}`);

if (has('json')) console.log(JSON.stringify(summary, null, 2));
