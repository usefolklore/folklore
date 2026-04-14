//! wellinformed-bench library — shared modules for the `bench_beir`
//! binary (BEIR runner) and the `embed_server` binary (stdio JSON-RPC
//! embedding server consumed by the TypeScript wellinformed stack).
//!
//! DDD layer boundaries:
//!   `domain`         — pure functions, no I/O, no mutation beyond the
//!                      function call boundary. Immutable domain types.
//!   `application`    — use cases orchestrating domain + ports.
//!   `infrastructure` — adapters: ONNX (fastembed), JSON output, progress.

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
    clippy::needless_pass_by_value,
    // `implicit_hasher` wants us to generalize over BuildHasher on every
    // public fn that takes a HashMap — noise for a small internal library.
    clippy::implicit_hasher,
    // `float_cmp` in tests uses == for f64 returns that are computed
    // deterministically — the intent is exact equality, not approximate.
    clippy::float_cmp,
    // #[must_use] on every pub fn that returns a value is noise; the
    // caller usually IS consuming the result (it's the only reason to
    // call the fn in the first place).
    clippy::must_use_candidate
)]

pub mod application;
pub mod domain;
pub mod infrastructure;
