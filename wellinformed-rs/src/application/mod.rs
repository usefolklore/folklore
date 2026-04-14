//! Application layer — use cases that orchestrate domain functions and
//! infrastructure ports. No concrete adapters here; everything is
//! expressed against traits.

pub mod pipeline;

pub use pipeline::{run_benchmark, BenchmarkConfig, BenchmarkReport};
