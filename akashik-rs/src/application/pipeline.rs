//! Benchmark pipeline — the single application use case.
//!
//! `run_benchmark` is a pure orchestration function over an `Encoder`
//! port and a `BeirDataset`. No I/O, no filesystem, no global state —
//! just fold the corpus through the encoder, fold the queries through
//! top-k retrieval, fold the outcomes through the metric computation.
//! Infrastructure (writing JSON, showing progress bars) is injected
//! via callbacks so the pipeline itself stays testable in isolation.

use crate::domain::{
    beir::{doc_text, query_text},
    map_at_k, mean, mrr_one, ndcg_at_k, percentile, recall_at_k, top_k_indices, BeirDataset,
    BeirQuery, EncoderSpec, Qrels,
};
use crate::infrastructure::encoder_port::Encoder;
use anyhow::Result;
use std::{collections::HashMap, time::Instant};

#[derive(Debug, Clone)]
pub struct BenchmarkConfig {
    pub spec: EncoderSpec,
    pub batch_size: usize,
    pub k: usize,
}

/// Metrics computed over all queries — averages + per-query arrays
/// for downstream paired-bootstrap significance testing.
#[derive(Debug, Clone)]
pub struct AggregatedMetrics {
    pub ndcg_at_10: f64,
    pub map_at_10: f64,
    pub recall_at_5: f64,
    pub recall_at_10: f64,
    pub mrr: f64,
    pub per_q_ndcg: Vec<f64>,
    pub per_q_r10: Vec<f64>,
    pub qids: Vec<String>,
}

/// Latency summary over the query pass.
#[derive(Debug, Clone)]
pub struct LatencySummary {
    pub total_p50: u64,
    pub total_p95: u64,
    pub dense_p50: u64,
}

/// Full benchmark outcome that wires up to a `ResultRecord` writer.
#[derive(Debug, Clone)]
pub struct BenchmarkReport {
    pub indexing_ms: u64,
    pub indexing_throughput: f64,
    pub metrics: AggregatedMetrics,
    pub latency: LatencySummary,
}

/// Per-query outcome — immutable once constructed.
#[derive(Debug, Clone)]
struct QueryOutcome {
    qid: String,
    top_ids: Vec<String>,
    dense_ms: u64,
    total_ms: u64,
}

fn run_one_query(
    encoder: &mut dyn Encoder,
    corpus_ids: &[String],
    corpus_vecs: &[Vec<f32>],
    query: &BeirQuery,
    query_prefixed: &str,
    k: usize,
) -> Result<QueryOutcome> {
    let t_total = Instant::now();
    let q_vec = encoder.embed_query(query_prefixed)?;
    let t_dense = Instant::now();
    let top_ids = top_k_indices(corpus_vecs, &q_vec, k)
        .into_iter()
        .map(|i| corpus_ids[i].clone())
        .collect();
    let dense_ms = u64::try_from(t_dense.elapsed().as_micros() / 1000).unwrap_or(u64::MAX);
    let total_ms = u64::try_from(t_total.elapsed().as_micros() / 1000).unwrap_or(u64::MAX);
    Ok(QueryOutcome {
        qid: query.id.clone(),
        top_ids,
        dense_ms,
        total_ms,
    })
}

fn aggregate(outcomes: &[QueryOutcome], qrels: &Qrels, k: usize) -> AggregatedMetrics {
    let empty: HashMap<String, i32> = HashMap::new();
    let tuples: Vec<(f64, f64, f64, f64, f64, String)> = outcomes
        .iter()
        .map(|o| {
            let rel = qrels.get(&o.qid).unwrap_or(&empty);
            let ranked: Vec<&str> = o.top_ids.iter().map(String::as_str).collect();
            (
                ndcg_at_k(&ranked, rel, k),
                map_at_k(&ranked, rel, k),
                recall_at_k(&ranked, rel, 5),
                recall_at_k(&ranked, rel, k),
                mrr_one(&ranked, rel),
                o.qid.clone(),
            )
        })
        .collect();

    let per_q_ndcg: Vec<f64> = tuples.iter().map(|t| t.0).collect();
    let per_q_map: Vec<f64> = tuples.iter().map(|t| t.1).collect();
    let per_q_r5: Vec<f64> = tuples.iter().map(|t| t.2).collect();
    let per_q_r10: Vec<f64> = tuples.iter().map(|t| t.3).collect();
    let per_q_mrr: Vec<f64> = tuples.iter().map(|t| t.4).collect();
    let qids: Vec<String> = tuples.into_iter().map(|t| t.5).collect();

    AggregatedMetrics {
        ndcg_at_10: mean(&per_q_ndcg),
        map_at_10: mean(&per_q_map),
        recall_at_5: mean(&per_q_r5),
        recall_at_10: mean(&per_q_r10),
        mrr: mean(&per_q_mrr),
        per_q_ndcg,
        per_q_r10,
        qids,
    }
}

fn latency_from(outcomes: &[QueryOutcome]) -> LatencySummary {
    LatencySummary {
        total_p50: percentile(outcomes.iter().map(|o| o.total_ms).collect(), 0.50),
        total_p95: percentile(outcomes.iter().map(|o| o.total_ms).collect(), 0.95),
        dense_p50: percentile(outcomes.iter().map(|o| o.dense_ms).collect(), 0.50),
    }
}

/// Run a BEIR benchmark end-to-end. `encoder` is taken by mutable
/// reference (encoders carry ort session state), `data` and `cfg` are
/// immutable. Progress callbacks let the CLI render progress without
/// the pipeline knowing about terminals.
pub fn run_benchmark(
    encoder: &mut dyn Encoder,
    data: &BeirDataset,
    cfg: &BenchmarkConfig,
    mut on_doc_indexed: impl FnMut(usize),
    mut on_query_done: impl FnMut(usize),
) -> Result<BenchmarkReport> {
    // 1. Prepare text via pure transformations
    let doc_texts: Vec<String> = data
        .corpus
        .iter()
        .map(|d| doc_text(d, cfg.spec.doc_prefix))
        .collect();
    let query_texts: Vec<String> = data
        .queries
        .iter()
        .map(|q| query_text(q, cfg.spec.query_prefix))
        .collect();

    // 2. Embed corpus — iterator-chain fold via chunks
    let t_index = Instant::now();
    let corpus_vecs: Vec<Vec<f32>> = doc_texts
        .chunks(cfg.batch_size)
        .try_fold(Vec::with_capacity(data.corpus.len()), |mut acc, chunk| {
            let batch: Vec<&str> = chunk.iter().map(String::as_str).collect();
            let emb = encoder.embed_batch(&batch, cfg.batch_size)?;
            acc.extend(emb);
            on_doc_indexed(chunk.len());
            Ok::<_, anyhow::Error>(acc)
        })?;
    let indexing_ms = u64::try_from(t_index.elapsed().as_millis()).unwrap_or(u64::MAX);
    let indexing_throughput = data.corpus.len() as f64 / (indexing_ms as f64 / 1000.0);

    // 3. Run queries — immutable corpus, mutable encoder session
    let corpus_ids: Vec<String> = data.corpus.iter().map(|d| d.id.clone()).collect();
    let outcomes: Vec<QueryOutcome> = data
        .queries
        .iter()
        .zip(query_texts.iter())
        .map(|(q, qt)| {
            let out = run_one_query(encoder, &corpus_ids, &corpus_vecs, q, qt, cfg.k);
            on_query_done(1);
            out
        })
        .collect::<Result<Vec<_>>>()?;

    // 4. Fold outcomes into metrics + latency summaries
    let metrics = aggregate(&outcomes, &data.qrels, cfg.k);
    let latency = latency_from(&outcomes);

    Ok(BenchmarkReport {
        indexing_ms,
        indexing_throughput,
        metrics,
        latency,
    })
}
