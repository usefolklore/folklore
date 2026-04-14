//! Domain layer — pure types and pure functions.
//!
//! Per the project's DDD standard, this module has zero I/O, zero
//! mutable global state, and no dependencies on infrastructure ports.
//! Everything here is a transformation of immutable inputs to
//! immutable outputs. If it takes `&mut` or calls the filesystem, it
//! belongs in `infrastructure`, not here.

pub mod beir;
pub mod encoder_spec;
pub mod metrics;
pub mod room_routing;
pub mod tunnel_graph;
pub mod vector_ops;

pub use beir::{BeirDataset, BeirQuery, Qrels};
pub use encoder_spec::EncoderSpec;
pub use metrics::{map_at_k, mean, mrr_one, ndcg_at_k, percentile, recall_at_k};
pub use room_routing::{compute_centroids, route_to_rooms, RoomCentroid};
pub use tunnel_graph::{find_tunnels_rng, LabeledVector, Tunnel};
pub use vector_ops::top_k_indices;
