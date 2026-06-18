#!/usr/bin/env node
/**
 * bench-memory-tools.mjs — Memory-Tool Benchmark, P0 (capability matrix).
 *
 * Honest, apples-to-apples positioning of folklore vs the memory/research
 * layers it actually competes with (mem0, Letta, LangChain RAG, Zep,
 * Pinecone-RAG) — on the axes folklore is built for, NOT on BEIR NDCG (the
 * memory tools don't compete there, and folklore's 0.7522 SciFact is already
 * capped). See docs/MEMORY-TOOL-BENCH-SCOPE.md.
 *
 * P0 = STRUCTURAL only: which tool can even perform each axis, drawn from each
 * tool's own documented design — labeled `structural`, NOT measured. It also
 * runs a LIVE pip-feasibility probe (which packages resolve in this sandbox)
 * so the "can we actually run a matched P1?" question is answered with facts,
 * not assumptions. No LLM, no server, no network beyond the pip index probe.
 *
 * P1+ (web-gating fallback rate, provenance flip-ASR, federated compounding)
 * produce MEASURED numbers and live in later passes / BENCHMARKS-RESULTS.md.
 *
 * Run:  node bench/bench-memory-tools.mjs
 *       node bench/bench-memory-tools.mjs --json
 *       node bench/bench-memory-tools.mjs --no-probe   (skip pip network probe)
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// ── axes folklore is built for (see scope doc §"What we measure") ──
const AXES = [
  { id: 'web_gating', label: 'Gates the web (answers before fetch / denies redundant calls)' },
  { id: 'provenance', label: 'Signed, attributable provenance per record (poison-defensible)' },
  { id: 'federation', label: 'Federated across peers (cross-user knowledge exchange)' },
  { id: 'cpu_only', label: 'Runs CPU-only (no GPU required)' },
  { id: 'no_llm_key', label: 'No LLM API key required to store/recall' },
  { id: 'no_server', label: 'No separate server/daemon-cluster required' },
];

// Structural capability per tool, from each tool's DOCUMENTED design.
//   true  = the tool can do this axis by design
//   false = it structurally cannot (this is a finding, not a measured loss)
// `notes` cite where the constraint comes from. Update only with a source.
const TOOLS = [
  {
    id: 'folklore', name: 'Folklore', pkg: null,
    caps: { web_gating: true, provenance: true, federation: true, cpu_only: true, no_llm_key: true, no_server: false },
    notes: 'web-gating via PreToolUse deny-hook; Ed25519/GitHub-signed nodes; libp2p P2P; CPU hybrid (MiniLM/ONNX); local daemon (no_server=false: a local daemon, not a cluster).',
  },
  {
    id: 'mem0', name: 'mem0', pkg: 'mem0ai',
    caps: { web_gating: false, provenance: false, federation: false, cpu_only: false, no_llm_key: false, no_server: true },
    notes: 'LLM-extracted memories (needs an LLM/key); single-user store; no web-gate, no peer exchange, no signed provenance. Can run keyless only if pointed at a local LLM.',
  },
  {
    id: 'letta', name: 'Letta (MemGPT)', pkg: 'letta',
    caps: { web_gating: false, provenance: false, federation: false, cpu_only: false, no_llm_key: false, no_server: false },
    notes: 'Agent server + LLM; self-editing memory per agent; single-user; no web-gate / federation / signed provenance.',
  },
  {
    id: 'langchain_rag', name: 'LangChain RAG', pkg: 'langchain',
    caps: { web_gating: false, provenance: false, federation: false, cpu_only: true, no_llm_key: true, no_server: true },
    notes: 'Retrieval over a vector store; embeddings can be CPU/local; "memory" is conversation buffer. No web-gate, no federation, no signed provenance. (no_llm_key true for pure retrieval; answer-gen needs an LLM.)',
  },
  {
    id: 'zep', name: 'Zep', pkg: 'zep-python',
    caps: { web_gating: false, provenance: false, federation: false, cpu_only: false, no_llm_key: false, no_server: false },
    notes: 'Client for a hosted/Docker Zep server; LLM-backed memory synthesis; single-tenant; no web-gate / federation / signed provenance.',
  },
  {
    id: 'pinecone_rag', name: 'Pinecone RAG', pkg: 'pinecone-client',
    caps: { web_gating: false, provenance: false, federation: false, cpu_only: true, no_llm_key: true, no_server: false },
    notes: 'Hosted vector DB (network + account); retrieval only; no web-gate, no federation, no signed provenance.',
  },
];

const args = new Set(process.argv.slice(2));
const asJson = args.has('--json');
const doProbe = !args.has('--no-probe');

// ── live pip-feasibility probe (pypi is allowlisted in this sandbox) ──
const probePip = (pkg) => {
  if (!pkg) return { resolvable: null, version: null }; // folklore — n/a
  const r = spawnSync('python3', ['-m', 'pip', 'index', 'versions', pkg], { encoding: 'utf8', timeout: 30000 });
  if (r.status !== 0 || !r.stdout) return { resolvable: false, version: null };
  // first line looks like: "pkg (X.Y.Z)"
  const m = r.stdout.match(/\(([^)]+)\)/);
  return { resolvable: true, version: m ? m[1] : null };
};

const feasibility = {};
if (doProbe) {
  for (const t of TOOLS) feasibility[t.id] = probePip(t.pkg);
}

// ── render ──
const tick = (v) => (v === true ? '✅' : v === false ? '❌' : '—');
const score = (caps) => AXES.filter((a) => caps[a.id] === true).length;

const result = {
  benchmark: 'memory-tools',
  phase: 'P0',
  kind: 'structural',
  note: 'Capabilities are from each tool\'s documented design, NOT measured. Measured axes (web-gating fallback rate, provenance flip-ASR, federated compounding) are P1+.',
  generated_axis_count: AXES.length,
  axes: AXES,
  tools: TOOLS.map((t) => ({
    id: t.id, name: t.name, pkg: t.pkg,
    caps: t.caps, cap_score: score(t.caps),
    feasibility: feasibility[t.id] ?? null,
    notes: t.notes,
  })),
};

if (asJson) {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} else {
  console.log('\nMemory-Tool Benchmark — P0 capability matrix (STRUCTURAL, not measured)\n');
  const head = ['Tool', ...AXES.map((a) => a.id), 'score'];
  console.log('  ' + head.join(' | '));
  for (const t of result.tools) {
    const row = [t.name.padEnd(14), ...AXES.map((a) => tick(t.caps[a.id]).padEnd(a.id.length)), String(t.cap_score)];
    console.log('  ' + row.join(' | '));
  }
  console.log('\n  axes: ' + AXES.map((a) => `${a.id}=${a.label}`).join('\n        '));
  if (doProbe) {
    console.log('\n  pip feasibility (this sandbox):');
    for (const t of result.tools) {
      const f = t.feasibility;
      if (!t.pkg) { console.log(`    ${t.name.padEnd(14)} n/a (this repo)`); continue; }
      console.log(`    ${t.name.padEnd(14)} ${t.pkg.padEnd(16)} ${f?.resolvable ? `resolvable @ ${f.version}` : 'NOT resolvable here'}`);
    }
  }
  console.log('\n  P0 = structural only. P1 adds MEASURED web-gating fallback rate under local-LLM parity.');
  console.log('  Folklore is the only tool with web_gating + provenance + federation by design.\n');
}

// ── persist snapshot ──
const outDir = join(homedir(), '.folklore', 'bench', 'memory-tools');
try {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'p0-capability-matrix.json'), JSON.stringify(result, null, 2) + '\n');
  if (!asJson) console.log(`  snapshot → ${join(outDir, 'p0-capability-matrix.json')}\n`);
} catch (e) {
  if (!asJson) console.error(`  (could not write snapshot: ${e.message})`);
}
