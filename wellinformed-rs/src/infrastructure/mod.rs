//! Infrastructure layer — adapters for external concerns.
//!
//! Per DDD, this is the only place allowed to touch the filesystem
//! (other than BEIR loading, which is in domain for symmetry with how
//! BEIR is treated in the literature), the ONNX runtime, network I/O,
//! or progress reporting. The application layer depends on the TRAITS
//! defined in each submodule here, not on concrete types.

pub mod encoder_port;
pub mod fastembed_encoder;
pub mod json_report;
pub mod progress;

pub use fastembed_encoder::FastembedEncoder;
pub use json_report::{write_result, LatencyMs, Metrics as OutputMetrics, ResultRecord};
pub use progress::{index_progress, query_progress};
