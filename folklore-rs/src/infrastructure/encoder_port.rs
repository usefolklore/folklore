//! Encoder port — the narrow capability interface the application
//! layer depends on. Concrete adapters (fastembed, candle, direct ort)
//! implement this trait. Strategy pattern: swapping encoders is a
//! one-line change in the factory, not a refactor.

use anyhow::Result;

/// An encoder turns batches of texts into vectors. Implementations may
/// be stateful (e.g., wrapping an ONNX session with mutable buffers).
///
/// Interior mutability is allowed (wrap the session in `&mut self` or
/// `RefCell`); exterior interface stays batch-in-vec-out.
pub trait Encoder {
    /// Embed a batch of documents. Returns `Vec<Vec<f32>>`, one per input.
    fn embed_batch(&mut self, texts: &[&str], batch_size: usize) -> Result<Vec<Vec<f32>>>;

    /// Embed a single query — short-circuit for the query hot path.
    fn embed_query(&mut self, text: &str) -> Result<Vec<f32>>;
}
