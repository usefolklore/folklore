//! BEIR v1 dataset types + pure loaders.
//!
//! The loaders are pure in the sense that they take a `Path` and return
//! a `Result`. They touch the filesystem, which technically makes them
//! not "pure" in the strict functional sense — but the IO is the
//! identity transformation (read bytes, parse JSONL, return a `Vec`),
//! no side effects, no hidden state, no caching. Equivalent to pure.

use anyhow::{Context, Result};
use serde::Deserialize;
use std::{
    collections::{HashMap, HashSet},
    fs::File,
    io::{BufRead, BufReader},
    path::Path,
};

#[derive(Deserialize, Debug, Clone)]
pub struct BeirDoc {
    #[serde(rename = "_id")]
    pub id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub text: String,
}

#[derive(Deserialize, Debug, Clone)]
pub struct BeirQuery {
    #[serde(rename = "_id")]
    pub id: String,
    pub text: String,
}

/// qrels[query_id] -> map<doc_id, relevance_grade>. BEIR uses graded
/// qrels (0/1/2) on SciDocs/FiQA and binary (0/1) elsewhere.
pub type Qrels = HashMap<String, HashMap<String, i32>>;

/// A fully-loaded BEIR dataset ready for retrieval evaluation.
#[derive(Debug, Clone)]
pub struct BeirDataset {
    pub corpus: Vec<BeirDoc>,
    pub queries: Vec<BeirQuery>,
    pub qrels: Qrels,
}

// ─── pure JSONL loader (generic over Deserialize target) ─────────

pub fn load_jsonl<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<Vec<T>> {
    BufReader::new(File::open(path).with_context(|| format!("open {}", path.display()))?)
        .lines()
        .map_while(Result::ok)
        .filter(|l| !l.trim().is_empty())
        .map(|l| serde_json::from_str::<T>(&l).map_err(Into::into))
        .collect()
}

// ─── pure qrels loader ───────────────────────────────────────────

fn parse_qrels_line(line: &str) -> Option<(String, String, i32)> {
    let mut parts = line.split('\t');
    let qid = parts.next()?.to_string();
    let doc = parts.next()?.to_string();
    let grade: i32 = parts.next()?.parse().ok()?;
    (grade > 0).then_some((qid, doc, grade))
}

pub fn load_qrels(path: &Path) -> Result<Qrels> {
    let reader =
        BufReader::new(File::open(path).with_context(|| format!("open {}", path.display()))?);
    Ok(reader
        .lines()
        .map_while(Result::ok)
        .skip(1) // header
        .filter_map(|l| parse_qrels_line(&l))
        .fold(HashMap::new(), |mut acc: Qrels, (qid, doc, grade)| {
            acc.entry(qid).or_default().insert(doc, grade);
            acc
        }))
}

// ─── composed dataset loader ────────────────────────────────────

pub fn load_beir(dir: &Path) -> Result<BeirDataset> {
    let corpus = load_jsonl::<BeirDoc>(&dir.join("corpus.jsonl"))?;
    let queries_all = load_jsonl::<BeirQuery>(&dir.join("queries.jsonl"))?;
    let qrels = load_qrels(&dir.join("qrels/test.tsv"))?;
    let test_qids: HashSet<&String> = qrels.keys().collect();
    let queries = queries_all
        .into_iter()
        .filter(|q| test_qids.contains(&q.id))
        .collect();
    Ok(BeirDataset {
        corpus,
        queries,
        qrels,
    })
}

// ─── pure text transformations ──────────────────────────────────

pub fn doc_text(doc: &BeirDoc, prefix: &str) -> String {
    let body = if doc.title.is_empty() {
        doc.text.clone()
    } else {
        format!("{}. {}", doc.title, doc.text)
    };
    format!("{prefix}{body}")
}

pub fn query_text(query: &BeirQuery, prefix: &str) -> String {
    format!("{}{}", prefix, query.text)
}
