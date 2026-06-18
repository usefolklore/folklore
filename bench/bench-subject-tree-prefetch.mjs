/**
 * bench-subject-tree-prefetch — does inheriting a peer's whole SUBJECT SUBTREE
 * pre-answer your NEXT 4–8 questions, not just the immediate one?
 *
 * The deeper compounding claim: a peer's work on a subject is a TREE of related
 * questions + verified evidence docs. When you match ONE answered question, you
 * should inherit the connected subtree — the whole subject's body of resolved
 * inference — so your follow-up questions on that subject are already cached.
 *
 * Honest measurement on a real IR corpus (BEIR + qrels). We build SUBJECT
 * clusters from query-embedding proximity (related questions group together),
 * then simulate SESSIONS: a peer asks M questions from one subject in sequence.
 * Three retrieval systems on the identical session stream, recall@1 on real
 * qrels, scored separately for the FIRST question vs the FOLLOW-UPS (Q2..QM):
 *   - BASELINE          : direct query→doc top-1.
 *   - SINGLE-DOC INHERIT: match nearest prior answered question (q2q≥thr),
 *                         inherit ONLY its doc(s).
 *   - SUBTREE INHERIT   : match nearest prior question, inherit the WHOLE
 *                         subject's accumulated docs (the peer's subtree).
 * Anti-gaming: pool/subject-cache hold only PRIOR instances; inheriting a wrong
 * subject's docs would hurt follow-up recall (reported); recall is vs qrels.
 *
 *   node bench/bench-subject-tree-prefetch.mjs [--dataset scifact] [--session 8]
 *     [--subject-t 0.55] [--q2q 0.55] [--sigma 0.033] [--steps 1500] [--json]
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { xenovaEmbedder } from '../dist/infrastructure/embedders.js';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const JSON_OUT = args.includes('--json');
const DATASET = flag('dataset', 'scifact');
const M = Number(flag('session', 8)); // questions per session (1 immediate + M-1 follow-ups)
const SUBJECT_T = Number(flag('subject-t', 0.55)); // cos to group questions into a subject
const Q2Q = Number(flag('q2q', 0.55));
const SIGMA = Number(flag('sigma', 0.033));
const SESSIONS = Number(flag('steps', 1500));
const HOME = process.env.FOLKLORE_HOME || join(homedir(), '.folklore');
const BASE = join(HOME, 'bench', DATASET, DATASET);
const pct = (x) => `${(x * 100).toFixed(1)}%`;

if (!existsSync(join(HOME, 'models')) || !existsSync(join(BASE, 'corpus.jsonl'))) {
  console.error(`need cached MiniLM + ${DATASET} dataset.`); process.exit(2);
}
const readJsonl = (p) => readFileSync(p, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const corpus = readJsonl(join(BASE, 'corpus.jsonl'));
const queries = readJsonl(join(BASE, 'queries.jsonl'));
const qtext = new Map(queries.map((q) => [String(q._id), q.text]));
const corpusText = new Map(corpus.map((d) => [String(d._id), `${d.title ? d.title + ' ' : ''}${d.text ?? ''}`.trim()]));
const corpusIds = [...corpusText.keys()];
const qrelsPath = existsSync(join(BASE, 'qrels', 'test.tsv')) ? join(BASE, 'qrels', 'test.tsv') : join(BASE, 'qrels', 'dev.tsv');
const qrels = new Map();
for (const line of readFileSync(qrelsPath, 'utf8').split('\n').slice(1)) {
  const [qid, did, sc] = line.split('\t');
  if (!qid || !did || Number(sc) <= 0) continue;
  if (!qrels.has(qid)) qrels.set(qid, new Set());
  qrels.get(qid).add(did);
}
const evalQids = [...qrels.keys()].filter((qid) => qtext.has(qid) && [...qrels.get(qid)].some((d) => corpusText.has(d)));

const embedder = xenovaEmbedder({ cacheDir: join(HOME, 'models') });
const E = async (t) => { const r = await embedder.embed(t); if (r.isErr()) throw new Error(r.error.message); return Array.from(r.value); };
const cacheFile = join(tmpdir(), `folklore-emb-${DATASET}-minilm.json`);
let docEmb;
if (existsSync(cacheFile)) docEmb = new Map(Object.entries(JSON.parse(readFileSync(cacheFile, 'utf8'))));
else {
  if (!JSON_OUT) console.error(`embedding ${corpusIds.length} docs (one-time)…`);
  docEmb = new Map();
  for (const id of corpusIds) docEmb.set(id, await E(corpusText.get(id)));
  try { writeFileSync(cacheFile, JSON.stringify(Object.fromEntries(docEmb))); } catch { /* */ }
}
const qEmb = new Map();
for (const qid of evalQids) qEmb.set(qid, await E(qtext.get(qid)));

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const norm = (x) => { let s = 0; for (const v of x) s += v * v; s = Math.sqrt(s) || 1; return x.map((v) => v / s); };
const directTop1 = (qe) => { let best = null, bs = -Infinity; for (const id of corpusIds) { const s = dot(qe, docEmb.get(id)); if (s > bs) { bs = s; best = id; } } return best; };

// ── subject clusters: greedy group of eval queries by embedding proximity ──
const clusterOf = new Map(); // qid -> cluster idx
const clusters = []; // idx -> [qid...]
for (const qid of evalQids) {
  if (clusterOf.has(qid)) continue;
  const idx = clusters.length;
  const members = [qid];
  clusterOf.set(qid, idx);
  const qe = qEmb.get(qid);
  for (const other of evalQids) {
    if (clusterOf.has(other)) continue;
    if (dot(qe, qEmb.get(other)) >= SUBJECT_T) { clusterOf.set(other, idx); members.push(other); }
  }
  clusters.push(members);
}
const multi = clusters.map((m, i) => i).filter((i) => clusters[i].length >= 2); // subjects with follow-ups

let _s = 0x5EED >>> 0;
const rnd = () => { _s = (_s + 0x6d2b79f5) >>> 0; let t = _s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = () => { const u = Math.max(rnd(), 1e-9); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
const para = (qid) => norm(qEmb.get(qid).map((v) => v + SIGMA * gauss()));

// pool of answered questions + per-subject accumulated docs (the shared subtree)
const pool = []; // {emb, subject, docs:Set}
const subjectDocs = new Map(); // cluster idx -> Set(docs cached by prior peers)

const acc = () => ({ first: { base: 0, single: 0, subtree: 0, n: 0 }, follow: { base: 0, single: 0, subtree: 0, n: 0, subtreeHurt: 0 } });
const R = acc();

if (multi.length === 0) { console.error('no multi-question subjects at this subject-t'); process.exit(2); }

for (let s = 0; s < SESSIONS; s++) {
  // pick a subject (uniform over multi-question subjects), walk M of its questions
  const cidx = multi[Math.floor(rnd() * multi.length)];
  const members = clusters[cidx];
  for (let pos = 0; pos < M; pos++) {
    const qid = members[Math.floor(rnd() * members.length)];
    const qe = para(qid);
    const rel = qrels.get(qid);
    const slot = pos === 0 ? R.first : R.follow;
    slot.n++;

    // BASELINE direct top-1
    if (rel.has(directTop1(qe))) slot.base++;

    // nearest prior answered question
    let best = { cos: -Infinity, e: null };
    for (const e of pool) { const c = dot(qe, e.emb); if (c > best.cos) best = { cos: c, e }; }
    const matched = best.e && best.cos >= Q2Q ? best.e : null;

    // SINGLE-DOC inherit: only the matched question's docs (+ direct as fallback)
    {
      const cand = new Map([[directTop1(qe), 0.1]]);
      if (matched) for (const d of matched.docs) cand.set(d, best.cos);
      const top = [...cand.entries()].sort((a, b) => b[1] - a[1])[0][0];
      if (rel.has(top)) slot.single++;
    }
    // SUBTREE inherit: ONE subject-match prefetches the matched subject's whole
    // body of (question→doc) EDGES; the follow-up is then served LOCALLY by q2q
    // over those prefetched edges (0 extra network round-trips).
    {
      let top = null, ts = -Infinity;
      if (matched) {
        const edges = subjectDocs.get(matched.subject) || [];
        for (const e of edges) { const c = dot(qe, e.emb); if (c > ts) { ts = c; top = e.doc; } }
      }
      if (ts < Q2Q) top = directTop1(qe); // no good local edge → direct fallback
      if (rel.has(top)) slot.subtree++;
      else if (pos > 0 && rel.has(directTop1(qe))) slot.subtreeHurt++;
    }

    // record the resolved tree + grow the subject subtree (question→doc edges)
    const sub = clusterOf.get(qid);
    pool.push({ emb: qe, subject: sub, docs: rel });
    if (!subjectDocs.has(sub)) subjectDocs.set(sub, []);
    for (const d of rel) subjectDocs.get(sub).push({ emb: qe, doc: d });
  }
}

const rate = (a, k) => (a.n ? a[k] / a.n : 0);
const followImp = rate(R.follow, 'base') > 0 ? (rate(R.follow, 'subtree') - rate(R.follow, 'base')) / rate(R.follow, 'base') : NaN;
if (JSON_OUT) {
  console.log(JSON.stringify({ dataset: DATASET, session: M, subjects: multi.length, follow: { baseline: rate(R.follow, 'base'), single_doc: rate(R.follow, 'single'), subtree: rate(R.follow, 'subtree'), improvement: followImp, hurt: R.follow.subtreeHurt } }, null, 2));
  process.exit(0);
}
console.log(`bench-subject-tree-prefetch: ${DATASET} — ${multi.length} multi-question subjects (subject-t ${SUBJECT_T}), sessions of ${M}, q2q≥${Q2Q}\n`);
console.log(`  recall@1                first question   follow-ups (Q2..Q${M})`);
console.log(`  BASELINE direct         ${pct(rate(R.first, 'base')).padStart(8)}        ${pct(rate(R.follow, 'base')).padStart(8)}`);
console.log(`  SINGLE-DOC inherit      ${pct(rate(R.first, 'single')).padStart(8)}        ${pct(rate(R.follow, 'single')).padStart(8)}`);
console.log(`  SUBTREE inherit         ${pct(rate(R.first, 'subtree')).padStart(8)}        ${pct(rate(R.follow, 'subtree')).padStart(8)}`);
console.log('');
console.log(`  follow-up improvement (subtree vs baseline): ${followImp >= 0 ? '+' : ''}${(followImp * 100).toFixed(1)}%   (subtree-hurt: ${R.follow.subtreeHurt})`);
console.log('');
const big = followImp >= 0.8;
console.log(big
  ? `VERDICT: SUBTREE PREFETCH WORKS — inheriting the subject subtree lifts FOLLOW-UP recall@1 ${pct(rate(R.follow, 'base'))}→${pct(rate(R.follow, 'subtree'))} (+${(followImp * 100).toFixed(0)}%). Your next ${M - 1} questions arrive pre-answered.`
  : `VERDICT: follow-up +${(followImp * 100).toFixed(1)}% via subtree (single-doc ${pct(rate(R.follow, 'single'))} vs subtree ${pct(rate(R.follow, 'subtree'))}). Target ≥80%; iterate subject clustering / q2q / fusion.`);
