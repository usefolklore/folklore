//! wellinformed-bench — BEIR benchmark runner (CLI entry).
//!
//! This file is deliberately thin: argument parsing, path composition,
//! progress bar rendering, and a single call to `application::run_benchmark`.
//! All domain logic lives in `src/domain/`, all ports in `src/infrastructure/`,
//! all orchestration in `src/application/`. Per the project DDD standard:
//! domain is pure, application composes ports, infrastructure is the only
//! place allowed to touch the outside world.
//!
//! Apples-to-apples target for `scripts/bench-beir-sota.mjs`: same data,
//! same encoder, same metric, same output schema.

#![warn(clippy::all, clippy::pedantic)]
#![allow(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    clippy::missing_errors_doc,
    clippy::missing_panics_doc,
    clippy::doc_markdown,
    clippy::similar_names,
    clippy::module_name_repetitions,
    clippy::needless_pass_by_value
)]

mod application;
mod domain;
mod infrastructure;

use anyhow::{Context, Result};
use application::{run_benchmark, BenchmarkConfig, BenchmarkReport};
use domain::{beir::load_beir, BeirDataset, EncoderSpec};
use infrastructure::{
    index_progress, query_progress, write_result, FastembedEncoder, LatencyMs, OutputMetrics,
    ResultRecord,
};
use std::{path::PathBuf, time::Instant};

#[derive(Debug, Clone)]
struct CliArgs {
    dataset: String,
    model: String,
    batch_size: usize,
}

fn parse_args(argv: &[String]) -> CliArgs {
    let dataset = argv.get(1).cloned().unwrap_or_else(|| "scifact".to_string());
    let model = arg_value(argv, "--model").unwrap_or_else(|| "nomic".to_string());
    let batch_size = arg_value(argv, "--batch")
        .and_then(|s| s.parse().ok())
        .unwrap_or(32);
    CliArgs {
        dataset,
        model,
        batch_size,
    }
}

fn arg_value(argv: &[String], flag: &str) -> Option<String> {
    argv.iter()
        .position(|a| a == flag)
        .and_then(|i| argv.get(i + 1).cloned())
}

fn print_banner(cli: &CliArgs, spec: &EncoderSpec, data_dir: &std::path::Path) {
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!(
        " wellinformed-bench (Rust/functional/DDD) — BEIR {}",
        cli.dataset.to_uppercase()
    );
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!(" Dataset:  BeIR/{}", cli.dataset);
    println!(" Model:    {} ({} dim)", spec.name, spec.dim);
    println!(" Data dir: {}", data_dir.display());
    println!(" Runtime:  Rust 1.94 + fastembed + rayon (layered DDD)");
    println!();
}

fn print_results(cli: &CliArgs, data: &BeirDataset, spec: &EncoderSpec, report: &BenchmarkReport) {
    let m = &report.metrics;
    let l = &report.latency;
    println!();
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!(" BEIR {} — Rust/DDD Results", cli.dataset.to_uppercase());
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!(" Corpus:    {} passages", data.corpus.len());
    println!(" Queries:   {}", data.queries.len());
    println!(" Model:     {} ({} dim)", spec.name, spec.dim);
    println!();
    println!(" NDCG@10:   {:.2}%", m.ndcg_at_10 * 100.0);
    println!(" MAP@10:    {:.2}%", m.map_at_10 * 100.0);
    println!(" Recall@5:  {:.2}%", m.recall_at_5 * 100.0);
    println!(" Recall@10: {:.2}%", m.recall_at_10 * 100.0);
    println!(" MRR:       {:.4}", m.mrr);
    println!();
    println!(
        " Latency p50/p95 (ms): dense={} total_p50={} total_p95={}",
        l.dense_p50, l.total_p50, l.total_p95
    );
    println!(" Indexing:  {:.0} docs/sec", report.indexing_throughput);
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

fn to_result_record(
    cli: &CliArgs,
    spec: &EncoderSpec,
    data: &BeirDataset,
    report: &BenchmarkReport,
) -> ResultRecord {
    let m = &report.metrics;
    ResultRecord {
        dataset: format!("BeIR/{}", cli.dataset),
        split: "test".to_string(),
        model: spec.name.to_string(),
        dim: spec.dim,
        runtime: "rust-fastembed-ddd".to_string(),
        corpus_size: data.corpus.len(),
        query_count: data.queries.len(),
        indexing_ms: report.indexing_ms,
        indexing_throughput_docs_per_sec: report.indexing_throughput,
        metrics: OutputMetrics {
            ndcg_at_10: m.ndcg_at_10,
            map_at_10: m.map_at_10,
            recall_at_5: m.recall_at_5,
            recall_at_10: m.recall_at_10,
            mrr: m.mrr,
        },
        latency_ms: LatencyMs {
            total_p50: report.latency.total_p50,
            total_p95: report.latency.total_p95,
            dense_p50: report.latency.dense_p50,
        },
        per_query_qids: m.qids.clone(),
        per_query_ndcg10: m.per_q_ndcg.clone(),
        per_query_recall10: m.per_q_r10.clone(),
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| format!("{}", d.as_secs()))
            .unwrap_or_default(),
    }
}

fn main() -> Result<()> {
    let argv: Vec<String> = std::env::args().collect();
    let cli = parse_args(&argv);
    let spec = EncoderSpec::parse(&cli.model)?;

    let home = std::env::var("HOME").context("HOME not set")?;
    let bench_root = PathBuf::from(&home).join(".wellinformed/bench");
    let data_dir = bench_root.join(&cli.dataset).join(&cli.dataset);
    let cache_dir = bench_root.join(format!(
        "{}__rust_ddd__{}",
        cli.dataset,
        spec.name.replace(['/', '.'], "-").to_lowercase()
    ));
    std::fs::create_dir_all(&cache_dir)?;

    print_banner(&cli, &spec, &data_dir);

    // 1. Load BEIR (domain function, pure wrt filesystem input)
    println!("[1/5] Loading corpus, queries, qrels...");
    let data = load_beir(&data_dir)?;
    println!("  corpus:  {} passages", data.corpus.len());
    println!("  queries: {} (test split)", data.queries.len());

    // 2. Build encoder via the Encoder port (strategy pattern)
    println!("[2/5] Loading encoder...");
    let t_load = Instant::now();
    let mut encoder = FastembedEncoder::try_new(&spec, true)?;
    println!("  loaded in {:.1}s", t_load.elapsed().as_secs_f64());

    // 3-5. Hand off to the application-layer pipeline. Progress rendering
    // is injected as FnMut closures; the pipeline itself knows nothing
    // about terminals.
    println!("[3/5] Embedding corpus (batch={})...", cli.batch_size);
    let pb_idx = index_progress(data.corpus.len() as u64);
    let pb_idx_ref = &pb_idx;
    println!("[4/5] Running queries (after indexing)...");
    let pb_q = query_progress(data.queries.len() as u64);
    let pb_q_ref = &pb_q;

    let cfg = BenchmarkConfig {
        spec: spec.clone(),
        batch_size: cli.batch_size,
        k: 10,
    };

    let report = run_benchmark(
        &mut encoder,
        &data,
        &cfg,
        |n| pb_idx_ref.inc(n as u64),
        |n| pb_q_ref.inc(n as u64),
    )?;
    pb_idx.finish();
    pb_q.finish();

    println!("[5/5] Done — computing metrics...");
    print_results(&cli, &data, &spec, &report);

    let out_path = cache_dir.join("results.json");
    let rec = to_result_record(&cli, &spec, &data, &report);
    write_result(&out_path, &rec)?;
    println!("\nResults JSON: {}", out_path.display());

    Ok(())
}
