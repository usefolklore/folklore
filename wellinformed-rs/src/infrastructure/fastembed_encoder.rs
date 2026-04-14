//! Fastembed adapter — wraps `fastembed::TextEmbedding` behind the
//! `Encoder` port. Hides all the ort + tokenizers plumbing from the
//! application layer.

use crate::domain::EncoderSpec;
use crate::infrastructure::encoder_port::Encoder;
use anyhow::{anyhow, Result};
use fastembed::{InitOptions, TextEmbedding};

pub struct FastembedEncoder {
    inner: TextEmbedding,
}

impl FastembedEncoder {
    pub fn try_new(spec: &EncoderSpec, show_progress: bool) -> Result<Self> {
        let inner = TextEmbedding::try_new(
            InitOptions::new(spec.model.clone()).with_show_download_progress(show_progress),
        )?;
        Ok(Self { inner })
    }
}

impl Encoder for FastembedEncoder {
    fn embed_batch(&mut self, texts: &[&str], batch_size: usize) -> Result<Vec<Vec<f32>>> {
        self.inner
            .embed(texts.to_vec(), Some(batch_size))
            .map_err(|e| anyhow!("fastembed batch embed: {e}"))
    }

    fn embed_query(&mut self, text: &str) -> Result<Vec<f32>> {
        let out = self
            .inner
            .embed(vec![text], None)
            .map_err(|e| anyhow!("fastembed query embed: {e}"))?;
        out.into_iter()
            .next()
            .ok_or_else(|| anyhow!("fastembed returned empty embedding"))
    }
}
