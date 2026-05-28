//! Room routing via pilot-centroid classifier.
//!
//! Phase 28 of v2.1 Path B. Based on RouterRetriever (AAAI 2025,
//! arXiv:2409.02685) — the only paper with published NDCG@10 gains on
//! BEIR from routing. The mechanism: compute a representative centroid
//! embedding per room (the "pilot" vector), then route each query to
//! the room whose centroid is nearest. Cheap, zero extra training,
//! sub-millisecond at query time.
//!
//! Refutes my Wave 4 "rooms are cosmetic" conclusion — which the
//! data researcher audit proved was Simpson's paradox. Rooms ARE a
//! retrieval signal on hard sub-populations; we just have to route
//! to them with a continuous signal instead of a hard filter.
//!
//! ## Pure domain — no I/O, no mutation beyond function-local scratch
//!
//! All functions here take immutable inputs and return immutable
//! outputs. Zero infrastructure dependencies.

use std::collections::HashMap;

use crate::domain::vector_ops::cosine;

/// Pilot centroid for a single room — the mean of all document vectors
/// belonging to that room, L2-normalized so cosine similarity equals
/// the dot product.
#[derive(Clone, Debug)]
pub struct RoomCentroid {
    pub room: String,
    pub vector: Vec<f32>,
    pub doc_count: usize,
}

/// Compute L2-normalized pilot centroids for every room present in
/// the labeled vector set. Returns an empty map if the input is empty.
///
/// Pure function. Folds over the input, accumulates sums per room,
/// normalizes in a post-pass. No mutation escapes the function body.
pub fn compute_centroids<'a, I>(labeled: I) -> HashMap<String, RoomCentroid>
where
    I: IntoIterator<Item = (&'a str, &'a [f32])>,
{
    // Accumulator: room → (running_sum, count)
    let mut sums: HashMap<String, (Vec<f32>, usize)> = HashMap::new();

    for (room, vec) in labeled {
        let entry = sums.entry(room.to_string()).or_insert_with(|| (vec![0.0; vec.len()], 0));
        let (running, count) = entry;
        if running.len() != vec.len() {
            // Dimension mismatch — skip rather than panic (pure fn
            // contract: return empty/partial, not crash)
            continue;
        }
        for (acc, v) in running.iter_mut().zip(vec.iter()) {
            *acc += *v;
        }
        *count += 1;
    }

    sums.into_iter()
        .map(|(room, (running, count))| {
            let mean: Vec<f32> = running.iter().map(|x| x / count as f32).collect();
            let norm: f32 = mean.iter().map(|x| x * x).sum::<f32>().sqrt().max(1e-12);
            let normalized: Vec<f32> = mean.iter().map(|x| x / norm).collect();
            (
                room.clone(),
                RoomCentroid {
                    room,
                    vector: normalized,
                    doc_count: count,
                },
            )
        })
        .collect()
}

/// Route a query vector to the top-N rooms by cosine similarity to
/// their centroids. Returns `Vec<(room, similarity)>` sorted
/// descending. Pure function.
///
/// Query vector should be L2-normalized by the caller (the production
/// Xenova/fastembed pipelines normalize by default).
pub fn route_to_rooms(
    query_vec: &[f32],
    centroids: &HashMap<String, RoomCentroid>,
    top_n: usize,
) -> Vec<(String, f32)> {
    let mut scored: Vec<(String, f32)> = centroids
        .values()
        .map(|c| (c.room.clone(), cosine(query_vec, &c.vector)))
        .collect();
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(top_n);
    scored
}

#[cfg(test)]
mod tests {
    use super::*;

    fn labeled<'a>(room: &'a str, v: &'a [f32]) -> (&'a str, &'a [f32]) {
        (room, v)
    }

    #[test]
    fn empty_input_empty_output() {
        let centroids = compute_centroids(std::iter::empty::<(&str, &[f32])>());
        assert!(centroids.is_empty());
    }

    #[test]
    fn single_room_centroid_is_mean_normalized() {
        let v1 = [1.0_f32, 0.0];
        let v2 = [0.0_f32, 1.0];
        let centroids = compute_centroids(vec![labeled("a", &v1), labeled("a", &v2)]);
        assert_eq!(centroids.len(), 1);
        let c = &centroids["a"];
        assert_eq!(c.doc_count, 2);
        // Mean = [0.5, 0.5], L2 norm = sqrt(0.5) = 1/sqrt(2)
        // Normalized = [1/sqrt(2), 1/sqrt(2)]
        let expected = std::f32::consts::FRAC_1_SQRT_2;
        assert!((c.vector[0] - expected).abs() < 1e-3);
        assert!((c.vector[1] - expected).abs() < 1e-3);
    }

    #[test]
    fn multiple_rooms_are_independent() {
        let a1 = [1.0_f32, 0.0];
        let b1 = [0.0_f32, 1.0];
        let centroids = compute_centroids(vec![labeled("room_a", &a1), labeled("room_b", &b1)]);
        assert_eq!(centroids.len(), 2);
        assert!((centroids["room_a"].vector[0] - 1.0).abs() < 1e-3);
        assert!((centroids["room_b"].vector[1] - 1.0).abs() < 1e-3);
    }

    #[test]
    fn route_picks_closest_room() {
        let a1 = [1.0_f32, 0.0];
        let b1 = [0.0_f32, 1.0];
        let centroids = compute_centroids(vec![labeled("room_a", &a1), labeled("room_b", &b1)]);
        // Query closer to room_a
        let q = [0.9_f32, 0.1];
        let routed = route_to_rooms(&q, &centroids, 2);
        assert_eq!(routed[0].0, "room_a");
        assert!(routed[0].1 > routed[1].1);
    }

    #[test]
    fn route_top_n_limits_output() {
        let a = [1.0_f32, 0.0];
        let b = [0.0_f32, 1.0];
        let c = [0.7_f32, 0.7];
        let centroids = compute_centroids(vec![
            labeled("a", &a),
            labeled("b", &b),
            labeled("c", &c),
        ]);
        let routed = route_to_rooms(&[1.0, 0.0], &centroids, 2);
        assert_eq!(routed.len(), 2);
    }
}
