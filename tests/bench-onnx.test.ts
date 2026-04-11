/**
 * Real ONNX IR benchmark — uses actual Xenova all-MiniLM-L6-v2.
 *
 * BENCH-01..04: Downloads the real model (25MB, cached after first run),
 * embeds the labeled corpus, measures true P@K, R@K, MRR, NDCG@5.
 *
 * This test is SLOW on first run (model download) but fast after.
 * Skip in CI with: node --test --test-name-pattern="^(?!.*onnx)"
 *
 * The labeled corpus is the same 30 documents from bench-real.test.ts.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { fileGraphRepository } from '../src/infrastructure/graph-repository.js';
import { openSqliteVectorIndex } from '../src/infrastructure/vector-index.js';
import { xenovaEmbedder } from '../src/infrastructure/embedders.js';
import { indexNode, searchByRoom } from '../src/application/use-cases.js';

// ─────────── corpus ───────────

const CORPUS = [
  { id: 'vs-1', label: 'HNSW index construction', text: 'Hierarchical navigable small world graphs for approximate nearest neighbor search with logarithmic complexity' },
  { id: 'vs-2', label: 'Product quantization', text: 'Divide vectors into subspaces and quantize each independently to reduce memory by 32x' },
  { id: 'vs-3', label: 'IVF-PQ hybrid index', text: 'Inverted file index with product quantization combining coarse partitioning with fine-grained compression' },
  { id: 'vs-4', label: 'sqlite-vec tuning', text: 'WAL mode pragma synchronous normal and batch inserts for sqlite vec0 virtual table' },
  { id: 'vs-5', label: 'Faiss vs Annoy vs ScaNN', text: 'Benchmark comparison of approximate nearest neighbor libraries on SIFT1M dataset' },
  { id: 'kg-1', label: 'Entity extraction NER', text: 'Named entity recognition using transformer models to populate knowledge graph nodes' },
  { id: 'kg-2', label: 'Relation extraction', text: 'Joint entity and relation extraction with attention-based span classification' },
  { id: 'kg-3', label: 'KG embeddings survey', text: 'TransE TransR RotatE ComplEx geometric models for link prediction in knowledge graphs' },
  { id: 'kg-9', label: 'GraphRAG architecture', text: 'Retrieval augmented generation with graph-structured knowledge for multi-hop reasoning' },
  { id: 'ml-1', label: 'ONNX Runtime serving', text: 'Cross-platform inference acceleration using ONNX format with hardware execution providers' },
  { id: 'ml-5', label: 'Quantization-aware training', text: 'Train neural networks with simulated low-precision arithmetic for int8 inference' },
  { id: 'ml-6', label: 'Kubernetes ML workloads', text: 'GPU scheduling node affinity and resource quotas for distributed training on Kubernetes' },
  { id: 'ml-10', label: 'Edge deployment', text: 'Model pruning knowledge distillation and TensorRT compilation for edge inference' },
];

const QUERIES = [
  { query: 'how to build a fast nearest neighbor index', expected: ['vs-1', 'vs-3', 'vs-5'] },
  { query: 'reduce embedding memory footprint', expected: ['vs-2', 'vs-3', 'ml-5', 'ml-10'] },
  { query: 'extract entities from text for knowledge graph', expected: ['kg-1', 'kg-2'] },
  { query: 'deploy ML models to production servers', expected: ['ml-1', 'ml-10', 'ml-6'] },
  { query: 'graph retrieval augmented generation', expected: ['kg-9', 'kg-3'] },
  { query: 'sqlite database vector search performance', expected: ['vs-4', 'vs-1'] },
  { query: 'ONNX model optimization and inference', expected: ['ml-1', 'ml-5'] },
];

// ─────────── metrics ───────────

const precisionAtK = (r: string[], rel: Set<string>, k: number) => r.slice(0, k).filter(id => rel.has(id)).length / k;
const recallAtK = (r: string[], rel: Set<string>, k: number) => rel.size > 0 ? r.slice(0, k).filter(id => rel.has(id)).length / rel.size : 0;
const mrr = (r: string[], rel: Set<string>) => { for (let i = 0; i < r.length; i++) { if (rel.has(r[i])) return 1 / (i + 1); } return 0; };
const ndcgAtK = (r: string[], rel: Set<string>, k: number) => {
  let dcg = 0; for (let i = 0; i < Math.min(r.length, k); i++) if (rel.has(r[i])) dcg += 1 / Math.log2(i + 2);
  let idcg = 0; for (let i = 0; i < Math.min(rel.size, k); i++) idcg += 1 / Math.log2(i + 2);
  return idcg > 0 ? dcg / idcg : 0;
};
const pctl = (arr: number[], p: number) => { const s = [...arr].sort((a, b) => a - b); return s[Math.max(0, Math.ceil(p / 100 * s.length) - 1)]; };

// ─────────── benchmark ───────────

test('onnx-bench: real all-MiniLM-L6-v2 IR metrics', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'wi-onnx-'));
  try {
    const graphs = fileGraphRepository(join(tmp, 'graph.json'));
    const vectors = (await openSqliteVectorIndex({ path: join(tmp, 'vectors.db') }))._unsafeUnwrap();
    // REAL embedder — downloads model on first run (~25MB)
    const embedder = xenovaEmbedder({ cacheDir: join(tmp, 'models') });
    const useCase = indexNode({ graphs, vectors, embedder });

    // Index corpus with real embeddings
    console.log('\n  Indexing corpus with real all-MiniLM-L6-v2...');
    const indexStart = performance.now();
    for (const item of CORPUS) {
      await useCase({
        node: { id: item.id, label: item.label, file_type: 'document', source_file: `corpus/${item.id}` },
        text: `${item.label}. ${item.text}`,
        room: 'bench',
      });
    }
    const indexTime = performance.now() - indexStart;
    console.log(`  Indexed ${CORPUS.length} docs in ${(indexTime / 1000).toFixed(1)}s`);

    // Run queries
    const searchDeps = { graphs, vectors, embedder };
    const results: Array<{ query: string; p5: number; r5: number; mrr_val: number; ndcg5: number; latency: number }> = [];

    for (const q of QUERIES) {
      const start = performance.now();
      const searchResult = (await searchByRoom(searchDeps)({ room: 'bench', text: q.query, k: 10 }))._unsafeUnwrap();
      const latency = performance.now() - start;
      const retrieved = searchResult.map(r => r.node_id);
      const relevant = new Set(q.expected);

      results.push({
        query: q.query,
        p5: precisionAtK(retrieved, relevant, 5),
        r5: recallAtK(retrieved, relevant, 5),
        mrr_val: mrr(retrieved, relevant),
        ndcg5: ndcgAtK(retrieved, relevant, 5),
        latency,
      });
    }

    const avgP5 = results.reduce((s, r) => s + r.p5, 0) / results.length;
    const avgR5 = results.reduce((s, r) => s + r.r5, 0) / results.length;
    const avgMRR = results.reduce((s, r) => s + r.mrr_val, 0) / results.length;
    const avgNDCG5 = results.reduce((s, r) => s + r.ndcg5, 0) / results.length;
    const latencies = results.map(r => r.latency);

    console.log(`\n  ┌─────────────────────────────────────────────────────────┐`);
    console.log(`  │  REAL ONNX IR Metrics (all-MiniLM-L6-v2)               │`);
    console.log(`  │  ${QUERIES.length} queries, ${CORPUS.length} documents                            │`);
    console.log(`  ├─────────────────────────────────────────────────────────┤`);
    console.log(`  │  Precision@5:  ${(avgP5 * 100).toFixed(1).padStart(6)}%                                │`);
    console.log(`  │  Recall@5:     ${(avgR5 * 100).toFixed(1).padStart(6)}%                                │`);
    console.log(`  │  MRR:          ${avgMRR.toFixed(3).padStart(6)}                                 │`);
    console.log(`  │  NDCG@5:       ${avgNDCG5.toFixed(3).padStart(6)}                                 │`);
    console.log(`  ├─────────────────────────────────────────────────────────┤`);
    console.log(`  │  Latency p50:  ${pctl(latencies, 50).toFixed(1).padStart(6)}ms (includes ONNX inference)  │`);
    console.log(`  │  Latency p99:  ${pctl(latencies, 99).toFixed(1).padStart(6)}ms                            │`);
    console.log(`  │  Index time:   ${(indexTime / 1000).toFixed(1).padStart(6)}s for ${CORPUS.length} docs                 │`);
    console.log(`  └─────────────────────────────────────────────────────────┘`);

    console.log(`\n  Per-query:`);
    for (const r of results) {
      console.log(`    ${r.query.slice(0, 48).padEnd(48)} P@5=${(r.p5 * 100).toFixed(0).padStart(3)}% R@5=${(r.r5 * 100).toFixed(0).padStart(3)}% MRR=${r.mrr_val.toFixed(2)} ${r.latency.toFixed(0)}ms`);
    }

    console.log(`\n  Comparison:`);
    console.log(`    mcp-memory-service: 86.0% R@5 (claimed)`);
    console.log(`    wellinformed:       ${(avgR5 * 100).toFixed(1)}% R@5 (measured, real ONNX)`);
    console.log(`    Cognee HotPotQA:    published but different corpus/metric`);

    // With real embeddings, MRR should be significantly better than fixture embedder
    assert.ok(avgMRR > 0.3, `MRR should be > 0.3 with real embeddings, got ${avgMRR.toFixed(3)}`);
    assert.ok(avgP5 > 0.1, `P@5 should be > 0.1 with real embeddings, got ${(avgP5 * 100).toFixed(1)}%`);

    vectors.close();
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
