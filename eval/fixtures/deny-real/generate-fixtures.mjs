#!/usr/bin/env node
/**
 * Generate a LABELED real-query set for the deny-gate calibration harness
 * (bench/bench-deny-real.mjs) from the ACTUAL ~/.folklore graph.
 *
 * ── Why this exists ───────────────────────────────────────────────────
 * The earlier deny benches (bench-deny-sweep, bench-deny-validate) ran on
 * a 12-query synthetic fixture seeded into a *fresh* throwaway graph. That
 * told us how the gate behaves on a hand-authored seed corpus — NOT how it
 * behaves on the user's real 21k-node graph, where in-corpus satisfaction
 * actually lands at 0.37–0.57 (far below the 0.85 use_memory breakpoint).
 * To calibrate against reality we need queries that are PROVABLY in / out
 * of the real corpus, with auditable provenance.
 *
 * ── How labels are assigned (no hand-faked satisfaction values) ────────
 * IN-CORPUS (expect deny=true — memory should answer):
 *   Sampled from real node LABELS in graph.json. Every in-corpus query is
 *   a natural-language question synthesised from the title/label of a node
 *   that DEMONSTRABLY exists in the graph (arxiv paper titles, indexed web
 *   page titles, folklore-codebase doc headings). The label is recorded as
 *   provenance (`from_node_id`, `from_label`, `source_uri`), so any reader
 *   can open the node and confirm the corpus genuinely contains the answer.
 *   The label of an in-corpus query is therefore grounded in graph state,
 *   NOT in a satisfaction number — the bench measures the satisfaction.
 *
 * OUT-OF-CORPUS (expect deny=false — web should be allowed):
 *   A curated set of topics that are provably ABSENT from this graph —
 *   cooking, sports, unrelated geography/biology, fast-changing facts. The
 *   graph is a software-research / AI-papers / coding-session corpus; these
 *   domains have zero coverage. Provenance for each is the REASON it is
 *   out-of-corpus (recorded in `reason`), and the bench independently
 *   confirms absence by reporting the nearest-hit distance (which should
 *   sit far past the relevance cap).
 *
 * Determinism: fixed seed + stable sort, so re-running reproduces the exact
 * same fixture from the same graph. Re-run after a graph change to refresh.
 *
 * Output: eval/fixtures/deny-real/{in-corpus.jsonl, out-of-corpus.jsonl}
 *
 * Usage:
 *   node eval/fixtures/deny-real/generate-fixtures.mjs [--graph PATH] [--in N] [--seed S]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : dflt;
};

const GRAPH = flag('graph', join(homedir(), '.folklore', 'graph.json'));
const TARGET_IN = parseInt(flag('in', '36'), 10);
let SEED = parseInt(flag('seed', '1318'), 10);

// Mulberry32 — tiny deterministic PRNG so sampling is reproducible.
const rng = () => {
  SEED |= 0;
  SEED = (SEED + 0x6d2b79f5) | 0;
  let t = Math.imul(SEED ^ (SEED >>> 15), 1 | SEED);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

if (!existsSync(GRAPH)) {
  console.error(`generate-fixtures: graph not found at ${GRAPH}`);
  process.exit(1);
}

console.error(`generate-fixtures: reading ${GRAPH} …`);
const graph = JSON.parse(readFileSync(GRAPH, 'utf8'));
const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
console.error(`generate-fixtures: ${nodes.length} nodes`);

// ── strip a label down to a clean topic phrase ─────────────────────────
const cleanLabel = (label) =>
  label
    .replace(/\[chunk[^\]]*\]/gi, '') // drop "[chunk 1/2]"
    .replace(/\[\d+\/\d+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// Build a natural question from a node's title/label. The question is a
// recall question about a SPECIFIC titled artifact in the corpus, so the
// in-corpus label is justified by the node's existence.
//
// We keep the head before the colon, but if that head is too terse (an
// acronym-only title like "SAGA"), we retain the descriptive subtitle too —
// otherwise the query carries no discriminating terms and would understate
// retrievability for reasons unrelated to corpus coverage. The whole title
// stays grounded in the node label either way.
const topicPhrase = (title) => {
  const clean = cleanLabel(title).replace(/^Quoting\s+/i, '').trim();
  const head = clean.replace(/:.*$/, '').trim();
  if (head.split(/\s+/).length >= 3) return head; // descriptive enough on its own
  return clean.replace(/\s+/g, ' ').trim(); // keep the full "ACRONYM: subtitle"
};
const arxivQuestion = (title) => `what does the paper "${topicPhrase(title)}" propose?`;
const webQuestion = (title) => `what is "${topicPhrase(title)}" about?`;

// reject junk / placeholder labels that aren't real recall topics
const isUsableLabel = (label) => {
  const c = cleanLabel(label);
  if (/^url:\s/i.test(c)) return false; // "url: https://example.com/..." placeholder nodes
  if (/^https?:\/\//i.test(c)) return false; // bare URL as label
  return c.length > 8;
};

// ── sample IN-CORPUS sources ───────────────────────────────────────────
// Pull from three real, well-labeled strata so the in-corpus set spans the
// graph rather than one cluster: arxiv paper titles, indexed web pages, and
// the folklore-codebase docs (wellinformed README / design docs).
const isChunkHead = (n) => n.chunk_index === 0 || n.chunk_index === undefined || n.chunk_index === null;

const arxiv = nodes.filter(
  (n) => n.kind === 'arxiv' && isChunkHead(n) && typeof n.label === 'string' && isUsableLabel(n.label),
);
const web = nodes.filter(
  (n) =>
    typeof n.source_uri === 'string' &&
    n.source_uri.startsWith('https') &&
    n.kind !== 'arxiv' &&
    isChunkHead(n) &&
    typeof n.label === 'string' &&
    isUsableLabel(n.label) &&
    // skip pure version-bump noise titles ("asgi-gzip 0.3") — too terse to
    // form a meaningful recall question
    /[a-z].*\s.*[a-z]/i.test(cleanLabel(n.label)),
);

// de-dupe web by page (source_uri without #fragment), keep first chunk-head
const webByPage = new Map();
for (const n of web) {
  const page = n.source_uri.split('#')[0];
  if (!webByPage.has(page)) webByPage.set(page, n);
}
const webPages = [...webByPage.values()];

console.error(`generate-fixtures: ${arxiv.length} arxiv heads, ${webPages.length} distinct web pages`);

const perStratum = Math.ceil(TARGET_IN / 2);

// De-dupe by the synthesised query text (many distinct nodes share one
// label, e.g. repeated "IL market: …" listing pages). Over-sample then
// trim, so dedup losses are backfilled from the shuffled pool.
const buildStratum = (pool, questionFn, stratum, provenance) => {
  const seen = new Set();
  const rows = [];
  for (const n of shuffle(pool)) {
    const query = questionFn(n.label);
    const key = query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      query,
      label: 'in_corpus',
      expect_deny: true,
      stratum,
      from_node_id: n.id,
      from_label: cleanLabel(n.label),
      source_uri: n.source_uri ?? null,
      provenance,
    });
    if (rows.length >= perStratum) break;
  }
  return rows;
};

const inCorpus = [
  ...buildStratum(
    arxiv,
    arxivQuestion,
    'arxiv',
    'natural recall question about an arxiv paper whose title node exists in the graph; answer is in-corpus by construction',
  ),
  ...buildStratum(
    webPages,
    webQuestion,
    'web',
    'natural recall question about an indexed web page whose title node exists in the graph; answer is in-corpus by construction',
  ),
];

// trim to exactly TARGET_IN, stable
const inFinal = inCorpus.slice(0, TARGET_IN);

// ── OUT-OF-CORPUS: curated absent topics ───────────────────────────────
// This corpus is software-research / AI-papers / coding sessions. The
// topics below have zero coverage. `reason` is the auditable provenance:
// why we assert absence. The bench independently confirms by reporting the
// nearest-hit distance (expected to sit far past the relevance cap).
const outOfCorpus = [
  ['how do I bake sourdough bread with a 70% hydration starter?', 'home cooking / baking — no food content in a software-research graph'],
  ['what is the best way to truss a turkey for roasting?', 'cooking — absent domain'],
  ['how do I prune tomato plants for maximum yield?', 'gardening — absent domain'],
  ['what were the final standings of the 2025 Tour de France?', 'professional cycling results — absent and fast-changing'],
  ['who won the most recent FIFA World Cup final?', 'sports result — absent and fast-changing'],
  ['what is the offside rule in football?', 'sports rules — absent domain'],
  ['what is the capital of Burkina Faso?', 'world geography trivia — absent domain'],
  ['how long is the Nile river in kilometres?', 'geography fact — absent domain'],
  ['what is the airspeed velocity of an unladen swallow?', 'absurd trivia — provably absent'],
  ['how do I treat a second-degree burn at home?', 'first aid / medical — absent domain'],
  ['what are the symptoms of vitamin D deficiency?', 'consumer health — absent domain'],
  ['what is the current price of bitcoin in USD?', 'live market price — absent and fast-changing'],
  ['what is the mortgage interest rate forecast for next year?', 'personal finance forecast — absent domain'],
  ['how do I change the oil in a 2018 Honda Civic?', 'auto maintenance — absent domain'],
  ['what is the recommended tyre pressure for a road bike?', 'cycling maintenance — absent domain'],
  ['how do I knit a basic scarf for beginners?', 'crafts / knitting — absent domain'],
  ['what is the plot of Shakespeare\'s Macbeth?', 'classic literature — absent domain'],
  ['what year did the Roman Empire fall?', 'ancient history — absent domain'],
  ['how do I make a classic margarita cocktail?', 'bartending / recipes — absent domain'],
  ['what is the gestation period of an African elephant?', 'zoology trivia — absent domain'],
  ['how do I grow basil indoors over winter?', 'gardening — absent domain'],
  ['what is the boiling point of water at 3000m altitude?', 'physical-science trivia — absent from this corpus'],
];

const outFinal = outOfCorpus.map(([query, reason]) => ({
  query,
  label: 'out_of_corpus',
  expect_deny: false,
  reason,
  provenance:
    'topic with zero coverage in a software-research/AI-papers/coding-session graph; absence reasoned topically and confirmed by nearest-hit distance at bench time',
}));

// ── write JSONL ─────────────────────────────────────────────────────────
mkdirSync(HERE, { recursive: true });
const toJsonl = (rows) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
writeFileSync(join(HERE, 'in-corpus.jsonl'), toJsonl(inFinal));
writeFileSync(join(HERE, 'out-of-corpus.jsonl'), toJsonl(outFinal));

const manifest = {
  generated_at: new Date().toISOString(),
  graph: GRAPH,
  graph_nodes: nodes.length,
  seed: parseInt(flag('seed', '1318'), 10),
  in_corpus_count: inFinal.length,
  in_corpus_strata: { arxiv: inFinal.filter((r) => r.stratum === 'arxiv').length, web: inFinal.filter((r) => r.stratum === 'web').length },
  out_of_corpus_count: outFinal.length,
  label_method: {
    in_corpus: 'natural recall question derived from a real node label; node id recorded as provenance; answerability is structural (the node exists), satisfaction is measured by the bench not assumed',
    out_of_corpus: 'topic absent from a software-research corpus; reason recorded; absence confirmed at bench time by nearest-hit distance',
  },
};
writeFileSync(join(HERE, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

console.error(
  `generate-fixtures: wrote ${inFinal.length} in-corpus + ${outFinal.length} out-of-corpus → ${HERE}`,
);
console.error(`  arxiv: ${manifest.in_corpus_strata.arxiv}, web: ${manifest.in_corpus_strata.web}`);
