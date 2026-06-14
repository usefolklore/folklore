#!/usr/bin/env node
// Phase 2 diagnostic — measure whether the Rust embed_server has
// throughput headroom that request coalescing / multi-worker would
// unlock, OR whether fastembed's internal ORT intraop threads already
// saturate the cores.
//
// Fires three passes against the running embed_server:
//   A. 32 requests of 1 text each  — worst case per-request overhead
//   B. 1 request of 32 texts       — already-batched
//   C. 4 requests of 8 texts each  — mid batch
//
// If A / B ≫ 1 → request coalescing in the server has 3-6× to give.
// If A / B ≈ 1 → fastembed is already saturating; Phase 2 nulls, the
//                real lift is elsewhere (bigger batches from ingest,
//                or model compute ceiling).
//
// Usage:
//   node scripts/bench-embed-throughput.mjs [--model bge-base] [--n 32]

import { rustSubprocessEmbedder } from '../dist/infrastructure/embedders.js';

const args = process.argv.slice(2);
const getArg = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };

const MODEL = getArg('--model', 'bge-base');
const N = parseInt(getArg('--n', '32'), 10);
const DIM = MODEL === 'minilm' ? 384 : 768;

// Repeatable corpus — fixed seed-derived texts so runs are comparable.
const TEXTS = Array.from({ length: N }, (_, i) =>
  `This is synthetic document number ${i} for throughput benchmarking, with moderately typical length that mirrors the average BEIR SciFact passage plus a bit more filler text to exercise the tokenizer at a realistic input length around sixty or seventy tokens which is the right ballpark for the target corpus.`,
);

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(` Phase 2 diagnostic — Rust embed_server throughput (${MODEL}, N=${N})`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const embedder = rustSubprocessEmbedder({ model: MODEL, dim: DIM });

// Warm up — spawn the Rust process + load the model
console.log('warming up...');
await embedder.embedBatch([TEXTS[0]]);
console.log('warm.');

const time = async (label, fn) => {
  const t0 = Date.now();
  await fn();
  const elapsed = (Date.now() - t0) / 1000;
  const docsPerSec = N / elapsed;
  console.log(`  ${label.padEnd(36)} ${elapsed.toFixed(2)}s  →  ${docsPerSec.toFixed(2)} docs/sec`);
  return docsPerSec;
};

console.log('');
console.log('[A] serial single-text requests (worst case):');
const serial = await time(`${N}× embedBatch([one_text])`, async () => {
  for (let i = 0; i < N; i++) await embedder.embedBatch([TEXTS[i]]);
});

console.log('');
console.log('[B] one big batched request (best case):');
const batched = await time(`1× embedBatch([${N}_texts])`, async () => {
  await embedder.embedBatch(TEXTS);
});

console.log('');
console.log('[C] 4 mid-sized batches:');
const mid = await time(`4× embedBatch([${N / 4}_texts])`, async () => {
  for (let i = 0; i < 4; i++) {
    await embedder.embedBatch(TEXTS.slice(i * N / 4, (i + 1) * N / 4));
  }
});

console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(' Throughput comparison');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  serial:  ${serial.toFixed(2)} docs/sec`);
console.log(`  batched: ${batched.toFixed(2)} docs/sec`);
console.log(`  mid:     ${mid.toFixed(2)} docs/sec`);
console.log('');
const ratio = batched / serial;
console.log(`  batched / serial = ${ratio.toFixed(2)}×`);
console.log('');
if (ratio >= 2.5) {
  console.log('✓ HEADROOM — request coalescing / multi-worker pool would yield a real win.');
  console.log('  The serial path pays per-request overhead. Batch accumulator in the');
  console.log('  Rust server can close this gap.');
} else if (ratio >= 1.5) {
  console.log('~ PARTIAL — some coalescing gain available (1.5–2.5× on small-batch');
  console.log('  workloads). Cheap win: tell ingest to batch at 32+ consistently.');
} else {
  console.log('✗ NULL — fastembed already saturates; batching gives no meaningful lift.');
  console.log('  The ONNX forward pass is the bottleneck. Real throughput gains require');
  console.log('  GPU, a smaller model, or model quantization (int8/fp16) — not protocol');
  console.log('  changes. Phase 2 as scoped nulls; document and move on.');
}
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
