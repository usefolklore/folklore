//! Encoder specification — model, dimension, required prefixes.
//!
//! Pure value object. No I/O, no mutable state. The infrastructure
//! layer takes an `EncoderSpec` and materializes a real encoder; the
//! spec itself is just a record of "what retriever do you want".

use anyhow::{anyhow, Result};
use fastembed::EmbeddingModel;

#[derive(Clone, Debug)]
pub struct EncoderSpec {
    pub model: EmbeddingModel,
    pub dim: usize,
    pub name: &'static str,
    /// Prepended to every document before embedding. Required by nomic.
    /// Empty string for models that don't use prefixes (BGE, MiniLM).
    pub doc_prefix: &'static str,
    /// Prepended to every query before embedding. Required by nomic;
    /// BGE models that use a query instruction should set it here too.
    pub query_prefix: &'static str,
}

impl EncoderSpec {
    /// Resolve a short name or a HuggingFace model id into a spec.
    pub fn parse(name: &str) -> Result<Self> {
        match name {
            "nomic" | "nomic-ai/nomic-embed-text-v1.5" => Ok(Self {
                model: EmbeddingModel::NomicEmbedTextV15,
                dim: 768,
                name: "nomic-ai/nomic-embed-text-v1.5",
                doc_prefix: "search_document: ",
                query_prefix: "search_query: ",
            }),
            "bge-base" | "BAAI/bge-base-en-v1.5" => Ok(Self {
                model: EmbeddingModel::BGEBaseENV15,
                dim: 768,
                name: "BAAI/bge-base-en-v1.5",
                doc_prefix: "",
                query_prefix: "",
            }),
            "minilm" | "sentence-transformers/all-MiniLM-L6-v2" => Ok(Self {
                model: EmbeddingModel::AllMiniLML6V2,
                dim: 384,
                name: "sentence-transformers/all-MiniLM-L6-v2",
                doc_prefix: "",
                query_prefix: "",
            }),
            other => Err(anyhow!(
                "unknown encoder '{other}': supported nomic, bge-base, minilm"
            )),
        }
    }
}
