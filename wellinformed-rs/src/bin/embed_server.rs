//! embed_server — stdio JSON-RPC embedding server.
//!
//! Phase 24 of the v2.1 milestone. Long-lived process the TypeScript
//! wellinformed stack spawns on first use to embed via production-
//! quality ONNX weights (fastembed, which pulls Qdrant-curated ports)
//! instead of `@xenova/transformers` (which silently ships a defective
//! bge-base-en-v1.5 conversion — measured -11.4 NDCG@10 on BEIR SciFact
//! vs the published BAAI ceiling).
//!
//! Protocol (JSON-lines, one message per line, request/response pairs):
//!
//!   client → server: {"op":"embed", "model":"bge-base", "texts":[...], "is_query":false}
//!   server → client: {"ok":true, "dim":768, "vectors":[[0.1,...],[0.2,...]]}
//!
//!   client → server: {"op":"ping"}
//!   server → client: {"ok":true, "version":"0.1.0"}
//!
//!   any error → {"ok":false, "error":"..."}
//!
//! Models are lazy-loaded on first use and kept in a HashMap keyed by
//! the short name ("nomic" | "bge-base" | "minilm"). The server stays
//! alive until stdin is closed by the client.

#![warn(clippy::all, clippy::pedantic)]
#![allow(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    clippy::missing_errors_doc,
    clippy::missing_panics_doc,
    clippy::doc_markdown,
    clippy::similar_names,
    clippy::module_name_repetitions
)]

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Write},
};
use wellinformed_bench::{
    domain::{
        beir::{doc_text as prefix_doc, query_text as prefix_query, BeirDoc},
        BeirQuery, EncoderSpec,
    },
    infrastructure::{encoder_port::Encoder, FastembedEncoder},
};

// ─── protocol types ─────────────────────────────────────────────

#[derive(Deserialize, Debug)]
#[serde(tag = "op", rename_all = "snake_case")]
enum Request {
    Embed {
        model: String,
        texts: Vec<String>,
        #[serde(default)]
        is_query: bool,
        /// Skip the nomic prefix prepend. Use when the caller has
        /// already added their own prefixes (e.g. the TS bench does
        /// this explicitly). Default false — the server prepends the
        /// canonical prefix for the model.
        #[serde(default)]
        raw: bool,
    },
    Ping,
    Shutdown,
}

#[derive(Serialize, Debug)]
#[serde(untagged)]
enum Response {
    EmbedOk {
        ok: bool,
        dim: usize,
        vectors: Vec<Vec<f32>>,
    },
    PingOk {
        ok: bool,
        version: String,
    },
    Err {
        ok: bool,
        error: String,
    },
}

// ─── encoder registry (lazy loaded) ─────────────────────────────

struct EncoderRegistry {
    encoders: HashMap<String, Box<dyn Encoder + Send>>,
}

impl EncoderRegistry {
    fn new() -> Self {
        Self {
            encoders: HashMap::new(),
        }
    }

    fn get_or_load(&mut self, model_name: &str) -> Result<(&mut dyn Encoder, EncoderSpec)> {
        let spec = EncoderSpec::parse(model_name)?;
        if !self.encoders.contains_key(model_name) {
            let encoder: Box<dyn Encoder + Send> =
                Box::new(FastembedEncoder::try_new(&spec, false)?);
            self.encoders.insert(model_name.to_string(), encoder);
        }
        let enc = self
            .encoders
            .get_mut(model_name)
            .ok_or_else(|| anyhow!("encoder not loaded: {model_name}"))?;
        Ok((enc.as_mut(), spec))
    }
}

// ─── request handlers (pure wrt side effects) ───────────────────

fn handle_embed(
    registry: &mut EncoderRegistry,
    model: &str,
    texts: &[String],
    is_query: bool,
    raw: bool,
) -> Result<Response> {
    let (encoder, spec) = registry.get_or_load(model)?;

    // Apply the canonical prefix unless the caller said `raw: true`.
    // This mirrors the TypeScript BEIR bench prep exactly so that
    // wellinformed's production indexNode path gets the correct
    // nomic `search_document: ` / `search_query: ` prefixes without
    // the caller having to know about them.
    let prefixed: Vec<String> = if raw {
        texts.to_vec()
    } else if is_query {
        texts
            .iter()
            .map(|t| {
                let q = BeirQuery {
                    id: String::new(),
                    text: t.clone(),
                };
                prefix_query(&q, spec.query_prefix)
            })
            .collect()
    } else {
        texts
            .iter()
            .map(|t| {
                let d = BeirDoc {
                    id: String::new(),
                    title: String::new(),
                    text: t.clone(),
                };
                prefix_doc(&d, spec.doc_prefix)
            })
            .collect()
    };

    let dim = spec.dim;
    let batch_size = prefixed.len().max(1);
    let refs: Vec<&str> = prefixed.iter().map(String::as_str).collect();
    let vectors = encoder.embed_batch(&refs, batch_size)?;

    Ok(Response::EmbedOk {
        ok: true,
        dim,
        vectors,
    })
}

fn handle_ping() -> Response {
    Response::PingOk {
        ok: true,
        version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

fn err_response(msg: impl Into<String>) -> Response {
    Response::Err {
        ok: false,
        error: msg.into(),
    }
}

// ─── main loop ──────────────────────────────────────────────────

fn main() -> Result<()> {
    // Startup banner to stderr so stdout stays pure JSON for the client.
    eprintln!(
        "wellinformed-bench embed_server v{} — stdio JSON-RPC",
        env!("CARGO_PKG_VERSION")
    );
    eprintln!("supported models: nomic, bge-base, minilm");

    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout().lock();
    let reader = BufReader::new(stdin.lock());
    let mut registry = EncoderRegistry::new();

    for line_res in reader.lines() {
        let line = match line_res {
            Ok(l) => l,
            Err(e) => {
                eprintln!("stdin read error: {e}");
                break;
            }
        };
        if line.trim().is_empty() {
            continue;
        }

        // Parse and dispatch. Any error collapses to an Err response so
        // the client can always keep going — the server only exits on
        // explicit Shutdown or stdin EOF.
        let response = match serde_json::from_str::<Request>(&line) {
            Ok(Request::Embed {
                model,
                texts,
                is_query,
                raw,
            }) => handle_embed(&mut registry, &model, &texts, is_query, raw)
                .unwrap_or_else(|e| err_response(format!("embed: {e}"))),
            Ok(Request::Ping) => handle_ping(),
            Ok(Request::Shutdown) => {
                let resp = Response::PingOk {
                    ok: true,
                    version: "shutdown".to_string(),
                };
                write_response(&mut stdout, &resp)?;
                break;
            }
            Err(e) => err_response(format!("parse: {e}")),
        };

        write_response(&mut stdout, &response)?;
    }

    eprintln!("embed_server exiting cleanly");
    Ok(())
}

fn write_response(stdout: &mut std::io::StdoutLock<'_>, resp: &Response) -> Result<()> {
    let line = serde_json::to_string(resp).context("serialize response")?;
    stdout.write_all(line.as_bytes())?;
    stdout.write_all(b"\n")?;
    stdout.flush()?;
    Ok(())
}
