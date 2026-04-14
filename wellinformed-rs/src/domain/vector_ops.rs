//! Pure vector math — cosine similarity and top-k retrieval.
//!
//! rayon is used for parallel scan in `top_k_indices` but the function
//! is still referentially transparent: same corpus + same query → same
//! ranked output. The parallelism is purely for throughput.

use rayon::prelude::*;

/// Cosine similarity on L2-normalized vectors equals the dot product.
/// Panics if the slices are different lengths (caller's contract).
#[must_use]
pub fn cosine(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b.iter()).map(|(x, y)| x * y).sum()
}

/// Return the top-k indices into `corpus_vecs` by descending cosine
/// similarity with `query_vec`. Parallel scan via rayon.
#[must_use]
pub fn top_k_indices(corpus_vecs: &[Vec<f32>], query_vec: &[f32], k: usize) -> Vec<usize> {
    let mut scored: Vec<(usize, f32)> = corpus_vecs
        .par_iter()
        .enumerate()
        .map(|(idx, v)| (idx, cosine(query_vec, v)))
        .collect();
    scored.sort_unstable_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    scored.into_iter().take(k).map(|(i, _)| i).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cosine_orthogonal() {
        let a = vec![1.0, 0.0];
        let b = vec![0.0, 1.0];
        assert!(cosine(&a, &b).abs() < 1e-9);
    }

    #[test]
    fn cosine_identical() {
        let a = vec![0.707, 0.707];
        assert!((cosine(&a, &a) - 1.0).abs() < 1e-3);
    }

    #[test]
    fn top_k_returns_best() {
        let corpus = vec![
            vec![1.0, 0.0],
            vec![0.707, 0.707],
            vec![0.0, 1.0],
        ];
        let query = vec![1.0, 0.0];
        let top = top_k_indices(&corpus, &query, 2);
        assert_eq!(top, vec![0, 1]);
    }
}
