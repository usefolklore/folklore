//! Progress bar factory — centralizes terminal rendering so the
//! application layer never touches `indicatif` directly.

use indicatif::{ProgressBar, ProgressStyle};

#[must_use]
pub fn index_progress(total: u64) -> ProgressBar {
    let pb = ProgressBar::new(total);
    pb.set_style(
        ProgressStyle::with_template(
            "  {bar:40.cyan/blue} {pos:>6}/{len:6} ({per_sec} docs/sec)",
        )
        .unwrap(),
    );
    pb
}

#[must_use]
pub fn query_progress(total: u64) -> ProgressBar {
    let pb = ProgressBar::new(total);
    pb.set_style(ProgressStyle::with_template("  {bar:40.cyan/blue} {pos:>5}/{len:5}").unwrap());
    pb
}
