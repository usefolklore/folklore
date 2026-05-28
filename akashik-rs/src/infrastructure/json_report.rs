//! JSON results writer — mirrors the schema of the TypeScript bench
//! so `scripts/bench-compare.mjs` can diff Rust vs TS runs head-to-head.

use anyhow::Result;
use serde::Serialize;
use std::path::Path;

#[derive(Serialize)]
pub struct Metrics {
    pub ndcg_at_10: f64,
    pub map_at_10: f64,
    pub recall_at_5: f64,
    pub recall_at_10: f64,
    pub mrr: f64,
}

#[derive(Serialize)]
pub struct LatencyMs {
    pub total_p50: u64,
    pub total_p95: u64,
    pub dense_p50: u64,
}

#[derive(Serialize)]
pub struct ResultRecord {
    pub dataset: String,
    pub split: String,
    pub model: String,
    pub dim: usize,
    pub runtime: String,
    pub corpus_size: usize,
    pub query_count: usize,
    pub indexing_ms: u64,
    pub indexing_throughput_docs_per_sec: f64,
    pub metrics: Metrics,
    pub latency_ms: LatencyMs,
    pub per_query_qids: Vec<String>,
    pub per_query_ndcg10: Vec<f64>,
    pub per_query_recall10: Vec<f64>,
    pub timestamp: String,
}

pub fn write_result(path: &Path, record: &ResultRecord) -> Result<()> {
    std::fs::write(path, serde_json::to_string_pretty(record)?)?;
    Ok(())
}
