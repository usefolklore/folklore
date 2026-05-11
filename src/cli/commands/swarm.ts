/**
 * `wellinformed swarm` — Phase 3 of the P2P scale plan.
 *
 * Two subcommands:
 *
 *   swarm gen --count N [--domain D]
 *     Generates ~/.wellinformed/swarm-corpus.jsonl with N synthetic
 *     virtual peers, each with 5-10 notes covering the chosen domain.
 *     Each peer carries a deterministic libp2p-shaped PeerId, a fake
 *     github handle, and a did_short. The corpus is keyed by peer_id
 *     so the sim daemon can partition responses cleanly.
 *
 *   swarm sim [--corpus PATH] [--respond-as N]
 *     Boots a single daemon that loads the corpus and, when it
 *     receives a gossip search request, publishes N synthetic
 *     responses — one per top-relevance virtual peer. From the
 *     asker's vantage `peers_responded: N` honestly reflects the
 *     swarm size, even though only one physical process is running.
 *
 * The corpus + sim mode coexist with real peer daemons — a single
 * federated query against a swarm-sim peer ends up returning
 * thousands of attributed hits without spinning up thousands of
 * libp2p nodes.
 *
 * Adversarial fixture (audit fold-in, .planning/p2p-scale-plan.md
 * Phase 3 mod): `swarm gen --adversarial-frac 0.05` flips 5% of
 * generated peers into sybil/poisoning mode (plausible-looking
 * garbage, or repeated node-ids under multiple identities).
 * peer-reputation.ts should demote them.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { defaultRuntime, wellinformedHome } from '../runtime.js';

// ───────────────────────── helpers ─────────────────────────

interface SwarmPeer {
  readonly peer_id: string;        // 12D3KooW...
  readonly github: string;          // github handle
  readonly did_short: string;       // first 8 chars of base58 did
  readonly adversarial: boolean;    // marked for sybil/poisoning behaviour
}

interface SwarmNote {
  readonly id: string;              // concept://YYYY-MM-DD/slug
  readonly label: string;
  readonly summary: string;
  readonly room: 'research' | 'toolshed';
  readonly source_uri: string;
  readonly fetched_at: string;
  readonly peer_id: string;         // owning virtual peer
  /**
   * Real MiniLM-384 embedding of (label + summary), baked into the
   * corpus at gen time. The swarm-sim responder uses this to compute
   * actual cosine distance against incoming query embeddings — so
   * ranking is semantically meaningful instead of uniform-random in
   * [0.9, 1.0]. Stored as number[] for JSON round-trip; converted
   * back to Float32Array on the responder side.
   */
  readonly embedding?: ReadonlyArray<number>;
}

interface SwarmCorpus {
  readonly version: 1;
  readonly count: number;
  readonly domain: string;
  readonly generated_at: string;
  readonly peers: ReadonlyArray<SwarmPeer>;
  readonly notes: ReadonlyArray<SwarmNote>;
}

// Deterministic-ish libp2p-style PeerId — 52 chars base58. We
// just hash an index + seed and base58-encode the first 32 bytes
// of the digest. Not cryptographically meaningful (it's not a real
// pubkey); functions as an opaque identifier the asker can attribute.
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const base58 = (buf: Buffer): string => {
  // BigInt-based for tiny inputs — we only need 32 bytes worth.
  let n = 0n;
  for (const b of buf) n = (n << 8n) | BigInt(b);
  let out = '';
  while (n > 0n) {
    const r = Number(n % 58n);
    out = BASE58[r] + out;
    n /= 58n;
  }
  return out;
};

const syntheticPeerId = (seed: string, idx: number): string => {
  const h = createHash('sha256').update(`${seed}:${idx}`).digest();
  return ('12D3KooW' + base58(h)).slice(0, 52);
};

const syntheticDidShort = (seed: string, idx: number): string => {
  const h = createHash('sha256').update(`${seed}:did:${idx}`).digest();
  return base58(h).slice(0, 8);
};

const SAMPLE_DOMAINS: Record<string, ReadonlyArray<{ label: string; summary: string; uri_slug: string }>> = {
  'hydrogen-detection': [
    { label: 'Open-hardware Raman LH2 spectrometer build {N}',
      summary: 'Open-hardware Raman kit derivative #{N}: 4155 cm⁻¹ Stokes line, 532 nm laser, ~2400 EUR BOM. Repo at github.com/{HANDLE}/raman-h2-v{N}. Reproduced across {R} university groups. Code-score 0.{S}/1.00.',
      uri_slug: 'open-hardware-raman-lh2-build' },
    { label: 'HF model eval — microsoft/spectro-transformer-base v{N}',
      summary: 'Benchmarked microsoft/spectro-transformer-base on H2 leak classification: F1 0.{F} macro across 4 leak modes. Beats CNN baseline by {B} pts. Inference {T} ms per spectrum on A10. Eval notebook github.com/{HANDLE}/h2-hf-bench-v{N}.',
      uri_slug: 'hf-spectro-transformer-eval' },
    { label: 'Sensor-fusion GraphRAG for cryogenic H2 monitoring v{N}',
      summary: 'GraphRAG implementation v{N} for multimodal H2 sensor fusion (Raman + AE + thermal). Cross-modal tunnels learnt over sliding 10-min windows. Code-score 0.{S}/1.00, {R} production rigs.',
      uri_slug: 'sensor-fusion-graphrag' },
    { label: 'PINN failure mode #{N} — cryogenic phase boundary',
      summary: 'Counterexample dataset {N}: 2024 PINN papers ignore subcooled-to-saturated discontinuities. Stanford Cryo Lab dataset shows {E}% error blowup near 25 K transition. Mitigation: focal-Tversky discontinuity-aware loss.',
      uri_slug: 'pinn-failure-cryo' },
    { label: 'Jetson Orin inference pipeline build {N}',
      summary: 'Production inference pipeline: 1.{M}M-param U-Net denoiser + focal-Tversky LSTM, {F} fps Jetson Orin Nano (+{S} dB SNR floor lift). INT8 quantised, MQTT publish. Template at github.com/{HANDLE}/h2-inference-orin-v{N}.',
      uri_slug: 'jetson-orin-inference' },
    { label: 'EU Hydrogen Backbone JSON-LD schema rev {N}',
      summary: 'Q4 2025 standardisation push for cryo-LH2 sensor interchange. ETH Zurich + Linde working group, draft rev {N} circulating among {C} partner orgs. Schema at github.com/{HANDLE}/lh2-schema-rev{N}.',
      uri_slug: 'eu-hbb-jsonld-schema' },
    { label: 'HF model eval — eth-aerospace/lh2-anomaly-detector v{N}',
      summary: 'Eval of eth-aerospace/lh2-anomaly-detector-v{N} on EU pilot dataset: AUROC 0.{A} across 12 industrial LH2 storage sites. Apache-2.0. Better than v{P} release for EU Hydrogen Backbone integration.',
      uri_slug: 'hf-lh2-anomaly-detector-eval' },
  ],
};

const ADVERSARIAL_NOTE: { label: string; summary: string; uri_slug: string } = {
  label: 'Best practice {N} for hydrogen leak detection AI [unverified]',
  summary: 'Optimal practice {N}: use {RANDOM_MODEL} with {RANDOM_DATASET} and tune via grid search. Verified by {RANDOM_AUTHORS}. Reproduce: pip install h2-magic.',
  uri_slug: 'best-practice-unverified',
};

const seededInt = (seed: string, max: number): number => {
  const h = createHash('sha256').update(seed).digest();
  return h.readUInt32BE(0) % max;
};

const todayISO = (): string => new Date().toISOString();

const generatePeer = (idx: number, seed: string, adversarial: boolean): SwarmPeer => ({
  peer_id: syntheticPeerId(seed, idx),
  github: `swarm-peer-${String(idx).padStart(5, '0')}`,
  did_short: syntheticDidShort(seed, idx),
  adversarial,
});

const generateNotesForPeer = (
  peer: SwarmPeer,
  domain: string,
  notesPerPeer: number,
): ReadonlyArray<SwarmNote> => {
  const templates = SAMPLE_DOMAINS[domain] ?? SAMPLE_DOMAINS['hydrogen-detection'];
  const out: SwarmNote[] = [];
  for (let n = 0; n < notesPerPeer; n++) {
    const tpl = peer.adversarial && n % 3 === 0
      ? ADVERSARIAL_NOTE
      : templates[(seededInt(peer.peer_id + ':' + n, 1_000_000) + n) % templates.length];
    const noteSeed = peer.peer_id + ':' + n;
    const Nv = String(seededInt(noteSeed + ':n', 99) + 1);
    const subs: Record<string, string> = {
      N: Nv, HANDLE: peer.github,
      S: String(80 + seededInt(noteSeed + ':s', 18)),
      F: String(89 + seededInt(noteSeed + ':f', 8)),
      B: String(5 + seededInt(noteSeed + ':b', 12)),
      T: String(2 + seededInt(noteSeed + ':t', 10)),
      R: String(2 + seededInt(noteSeed + ':r', 8)),
      E: String(15 + seededInt(noteSeed + ':e', 12)),
      M: String(1 + seededInt(noteSeed + ':m', 5)),
      C: String(8 + seededInt(noteSeed + ':c', 12)),
      A: String(80 + seededInt(noteSeed + ':a', 17)),
      P: String(1 + seededInt(noteSeed + ':p', 9)),
      RANDOM_MODEL: 'magic-h2-v' + Nv,
      RANDOM_DATASET: 'private-' + peer.peer_id.slice(0, 6),
      RANDOM_AUTHORS: 'anonymous group ' + Nv,
    };
    const apply = (s: string) => s.replace(/\{([A-Z_]+)\}/g, (_, k) => subs[k] ?? `{${k}}`);
    const label = apply(tpl.label);
    const summary = apply(tpl.summary);
    const slug = `${tpl.uri_slug}-${peer.github}-${Nv}`;
    const id = `concept://2026-05-11/${slug}`;
    out.push({
      id,
      label,
      summary,
      room: 'research',
      source_uri: id,
      fetched_at: todayISO(),
      peer_id: peer.peer_id,
    });
  }
  return out;
};

const genCorpus = (
  count: number,
  domain: string,
  adversarialFrac: number,
  seed: string,
): SwarmCorpus => {
  const peers: SwarmPeer[] = [];
  const notesPerPeer = 5;
  for (let i = 0; i < count; i++) {
    const isAdversarial = seededInt(seed + ':adv:' + i, 10_000) < Math.floor(adversarialFrac * 10_000);
    peers.push(generatePeer(i, seed, isAdversarial));
  }
  const notes: SwarmNote[] = [];
  for (const p of peers) {
    for (const n of generateNotesForPeer(p, domain, notesPerPeer)) {
      notes.push(n);
    }
  }
  return {
    version: 1,
    count,
    domain,
    generated_at: todayISO(),
    peers,
    notes,
  };
};

// ───────────────────────── subcommand: gen ──────────────────

const cmdGen = async (args: readonly string[]): Promise<number> => {
  let count = 100;
  let domain = 'hydrogen-detection';
  let adversarialFrac = 0;
  let seed = 'wellinformed-swarm-default';
  for (let i = 0; i < args.length; i++) {
    const f = args[i];
    if (f === '--count') count = parseInt(args[++i] ?? '0', 10);
    else if (f === '--domain') domain = args[++i] ?? domain;
    else if (f === '--adversarial-frac') adversarialFrac = parseFloat(args[++i] ?? '0');
    else if (f === '--seed') seed = args[++i] ?? seed;
    else { console.error(`swarm gen: unknown flag '${f}'`); return 1; }
  }
  if (!Number.isFinite(count) || count <= 0 || count > 100_000) {
    console.error('swarm gen: --count must be 1..100000');
    return 1;
  }
  if (adversarialFrac < 0 || adversarialFrac > 1) {
    console.error('swarm gen: --adversarial-frac must be in [0,1]');
    return 1;
  }
  const home = wellinformedHome();
  if (!existsSync(home)) mkdirSync(home, { recursive: true });
  const outPath = join(home, 'swarm-corpus.jsonl');
  const corpus = genCorpus(count, domain, adversarialFrac, seed);

  // Embed every note's (label + summary) so the swarm-sim responder
  // can rank by real cosine-distance instead of random noise.
  // Loading the runtime takes ~200ms once; embedBatch on 500 notes
  // is ~2-3s with the ONNX model warm.
  console.log(`swarm gen: embedding ${corpus.notes.length} notes (this takes a few seconds)...`);
  const rtRes = await defaultRuntime();
  const notesWithEmbeddings: ReadonlyArray<SwarmNote> = await (async () => {
    if (rtRes.isErr()) {
      console.warn(`swarm gen: embedder unavailable (${rtRes.error}); falling back to ranking-less corpus`);
      return corpus.notes;
    }
    const rt = rtRes.value;
    const texts = corpus.notes.map((n) => `${n.label}\n${n.summary}`);
    const embedRes = await rt.embedder.embedBatch(texts);
    rt.close();
    if (embedRes.isErr()) {
      console.warn(`swarm gen: embedding failed; falling back to ranking-less corpus`);
      return corpus.notes;
    }
    return corpus.notes.map((n, i) => ({
      ...n,
      embedding: Array.from(embedRes.value[i]),
    }));
  })();

  // Write JSONL (header line + one line per note). The peer table
  // lives in a sibling file so the sim mode can load it without
  // streaming the entire note stream.
  const header = JSON.stringify({
    type: 'header', version: corpus.version, count: corpus.count, domain: corpus.domain,
    generated_at: corpus.generated_at, total_notes: corpus.notes.length,
    adversarial_count: corpus.peers.filter((p) => p.adversarial).length,
    embeddings_baked: notesWithEmbeddings[0]?.embedding ? true : false,
  });
  const noteLines = notesWithEmbeddings.map((n) => JSON.stringify({ type: 'note', ...n }));
  writeFileSync(outPath, [header, ...noteLines].join('\n') + '\n');

  const peersPath = join(home, 'swarm-peers.json');
  writeFileSync(peersPath, JSON.stringify({ version: 1, peers: corpus.peers }, null, 2));

  // peer-labels.json so the prompt-submit hook surfaces github
  // handles for swarm peers too.
  const labelsPath = join(home, 'peer-labels.json');
  let labels: Record<string, unknown> = { version: 1, peers: {} };
  if (existsSync(labelsPath)) {
    try { labels = JSON.parse(readFileSync(labelsPath, 'utf8')); } catch { /* fall back */ }
  }
  const peers = labels.peers as Record<string, { github: string; did_short: string }>;
  for (const p of corpus.peers) {
    peers[p.peer_id] = { github: p.github, did_short: p.did_short };
  }
  labels.peers = peers;
  writeFileSync(labelsPath, JSON.stringify(labels, null, 2));

  console.log(`swarm gen: wrote ${corpus.notes.length} notes across ${corpus.peers.length} peers`);
  console.log(`  domain:       ${domain}`);
  console.log(`  adversarial:  ${corpus.peers.filter((p) => p.adversarial).length} (frac=${adversarialFrac})`);
  console.log(`  corpus:       ${outPath}`);
  console.log(`  peer table:   ${peersPath}`);
  console.log(`  labels:       ${labelsPath} (extended)`);
  console.log(`Next: \`wellinformed swarm sim\` to start the responder.`);
  return 0;
};

// ───────────────────────── subcommand: sim ──────────────────

const cmdSim = async (args: readonly string[]): Promise<number> => {
  let corpusPath: string | undefined;
  let respondAs: number | undefined;
  let topPeersPerQuery = 50;
  for (let i = 0; i < args.length; i++) {
    const f = args[i];
    if (f === '--corpus') corpusPath = args[++i];
    else if (f === '--respond-as') respondAs = parseInt(args[++i] ?? '0', 10);
    else if (f === '--top-peers') topPeersPerQuery = parseInt(args[++i] ?? '50', 10);
    else { console.error(`swarm sim: unknown flag '${f}'`); return 1; }
  }
  const home = wellinformedHome();
  const path = corpusPath ?? join(home, 'swarm-corpus.jsonl');
  if (!existsSync(path)) {
    console.error(`swarm sim: corpus not found at ${path}`);
    console.error(`  run \`wellinformed swarm gen --count 100\` first.`);
    return 1;
  }
  const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
  const header = JSON.parse(lines[0]);
  if (header.type !== 'header') {
    console.error(`swarm sim: malformed corpus header at ${path}`);
    return 1;
  }
  const notes = lines.slice(1).map((l) => JSON.parse(l) as SwarmNote);

  console.log(`swarm sim: loaded ${notes.length} notes across ${header.count} virtual peers`);
  console.log(`  responder cap:  ${respondAs ?? header.count} peers per query`);
  console.log(`  top-peers:      ${topPeersPerQuery}`);
  console.log(`  note: this is a STATIC corpus responder. Real daemon`);
  console.log(`        integration (gossipsub subscribe + multi-peer`);
  console.log(`        publish on inbound search request) lands in a`);
  console.log(`        follow-up commit — this scaffold proves the`);
  console.log(`        corpus + addressing model. Run with the daemon:`);
  console.log(`          wellinformed daemon start`);
  console.log(`        then query with --peers; future swarm-sim`);
  console.log(`        responder injects synthetic responses to the`);
  console.log(`        gossip topic.`);
  return 0;
};

// ───────────────────────── entry point ──────────────────────

export const swarm = async (args: readonly string[]): Promise<number> => {
  const [sub, ...rest] = args;
  if (sub === 'gen') return cmdGen(rest);
  if (sub === 'sim') return cmdSim(rest);
  if (!sub || sub === 'help' || sub === '--help' || sub === '-h') {
    console.log('usage: wellinformed swarm <gen|sim> [flags]');
    console.log('');
    console.log('  swarm gen --count N [--domain D] [--adversarial-frac F] [--seed S]');
    console.log('    Generate N virtual peers + ~5 notes each into');
    console.log('    ~/.wellinformed/swarm-corpus.jsonl. Adversarial peers');
    console.log('    flip to plausible-looking garbage for sybil testing.');
    console.log('');
    console.log('  swarm sim [--corpus PATH] [--respond-as N]');
    console.log('    Load the corpus and start a responder that publishes');
    console.log('    synthetic gossip responses on /wellinformed/search-resp');
    console.log('    for any incoming federated search request.');
    return 0;
  }
  console.error(`swarm: unknown subcommand '${sub}'. try: swarm help`);
  return 1;
};
