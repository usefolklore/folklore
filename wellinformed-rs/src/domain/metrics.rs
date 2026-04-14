//! Information retrieval metrics — pure functions over ranked lists.
//!
//! Canonical BEIR metric definitions matching pytrec_eval / beir-cellar
//! implementations: graded NDCG@k, binary Recall@k, MRR, MAP@k. All
//! functions are pure (immutable inputs, immutable outputs, no I/O).

use std::collections::HashMap;

fn log2(x: f64) -> f64 {
    x.log2()
}

/// Graded NDCG@k. For binary qrels (SciFact/NFCorpus/ArguAna) this is
/// equivalent to the classical definition; for graded qrels (SciDocs/
/// FiQA/FEVER) the DCG uses the actual grades (0/1/2) rather than
/// collapsing to binary — matches pytrec_eval's default behaviour and
/// the beir-cellar `RelevanceEvaluator` reference implementation.
#[must_use]
pub fn ndcg_at_k(ranked: &[&str], rel: &HashMap<String, i32>, k: usize) -> f64 {
    let dcg: f64 = ranked
        .iter()
        .take(k)
        .enumerate()
        .map(|(i, id)| f64::from(*rel.get(*id).unwrap_or(&0)) / log2((i + 2) as f64))
        .sum();
    let mut ideal: Vec<i32> = rel.values().copied().collect();
    ideal.sort_unstable_by(|a, b| b.cmp(a));
    let idcg: f64 = ideal
        .into_iter()
        .take(k)
        .enumerate()
        .map(|(i, g)| f64::from(g) / log2((i + 2) as f64))
        .sum();
    if idcg > 0.0 {
        dcg / idcg
    } else {
        0.0
    }
}

#[must_use]
pub fn recall_at_k(ranked: &[&str], rel: &HashMap<String, i32>, k: usize) -> f64 {
    if rel.is_empty() {
        return 0.0;
    }
    let hits = ranked
        .iter()
        .take(k)
        .filter(|id| rel.contains_key(**id))
        .count();
    hits as f64 / rel.len() as f64
}

#[must_use]
pub fn mrr_one(ranked: &[&str], rel: &HashMap<String, i32>) -> f64 {
    ranked
        .iter()
        .position(|id| rel.contains_key(*id))
        .map_or(0.0, |i| 1.0 / (i + 1) as f64)
}

#[must_use]
pub fn map_at_k(ranked: &[&str], rel: &HashMap<String, i32>, k: usize) -> f64 {
    if rel.is_empty() {
        return 0.0;
    }
    let (sum, _) = ranked
        .iter()
        .take(k)
        .enumerate()
        .filter(|(_, id)| rel.contains_key(**id))
        .fold((0.0_f64, 0_usize), |(sum, count), (i, _)| {
            let next_count = count + 1;
            (sum + next_count as f64 / (i + 1) as f64, next_count)
        });
    sum / rel.len().min(k) as f64
}

#[must_use]
pub fn mean(xs: &[f64]) -> f64 {
    if xs.is_empty() {
        0.0
    } else {
        xs.iter().sum::<f64>() / xs.len() as f64
    }
}

#[must_use]
pub fn percentile(mut xs: Vec<u64>, p: f64) -> u64 {
    if xs.is_empty() {
        return 0;
    }
    xs.sort_unstable();
    let idx = ((xs.len() as f64) * p).floor() as usize;
    xs[idx.min(xs.len() - 1)]
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn rel(pairs: &[(&str, i32)]) -> HashMap<String, i32> {
        pairs.iter().map(|(k, v)| ((*k).to_string(), *v)).collect()
    }

    #[test]
    fn ndcg_perfect_ranking() {
        let r = rel(&[("a", 1), ("b", 1)]);
        // Perfect ranking: both relevant docs at top-2
        assert!((ndcg_at_k(&["a", "b", "c"], &r, 10) - 1.0).abs() < 1e-9);
    }

    #[test]
    fn ndcg_graded() {
        // Graded qrels: "a" is grade 2, "b" is grade 1
        let r = rel(&[("a", 2), ("b", 1)]);
        // Perfect graded ranking: 2 at rank 1, 1 at rank 2
        let val = ndcg_at_k(&["a", "b", "c"], &r, 10);
        assert!((val - 1.0).abs() < 1e-9);
    }

    #[test]
    fn recall_half_hit() {
        let r = rel(&[("a", 1), ("b", 1)]);
        assert!((recall_at_k(&["a", "x"], &r, 5) - 0.5).abs() < 1e-9);
    }

    #[test]
    fn mrr_position_2() {
        let r = rel(&[("a", 1)]);
        assert!((mrr_one(&["x", "a"], &r) - 0.5).abs() < 1e-9);
    }

    #[test]
    fn mean_empty_is_zero() {
        assert_eq!(mean(&[]), 0.0);
    }
}
