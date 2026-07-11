#!/usr/bin/env bash
# Build the demo knowledge graph — idempotent. Ingests a small, curated corpus
# (Rust async runtimes) into an isolated FOLKLORE_HOME so the deny-gate demo is
# fast (~900ms/query) and reproducible, independent of the user's real graph.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BIN="$REPO_ROOT/bin/folklore.js"
export FOLKLORE_HOME="${FOLKLORE_HOME:-$REPO_ROOT/examples/deny-gate/.demo-home}"

# fresh graph each run so the demo is deterministic
rm -rf "$FOLKLORE_HOME"
mkdir -p "$FOLKLORE_HOME"

save() { node "$BIN" save --label "$1" --text "$2" --type concept >/dev/null 2>&1; }

save tokio-work-stealing   "Tokio uses a multi-threaded work-stealing scheduler: each worker thread has its own run queue and steals tasks from others when idle, keeping cores busy under uneven load."
save tokio-vs-async-std    "async-std mirrors the std library API and is simpler to adopt, while Tokio has a larger ecosystem (tower, hyper, tonic) and finer runtime control. Most production Rust services pick Tokio."
save async-await-desugar   "Rust async/await desugars to a state machine implementing Future; .await yields control at suspension points without blocking the OS thread."
save tokio-select          "tokio::select! polls multiple async branches concurrently and runs the first to complete, cancelling the rest — the idiom for timeouts and racing futures."
save blocking-in-async     "Calling blocking code inside an async task starves the runtime; use spawn_blocking or a dedicated thread pool for CPU-bound or sync-IO work."
save pin-and-futures       "A Future must be pinned before polling because self-referential state-machine fields cannot move; Pin guarantees the memory address is stable."
save tokio-runtime-flavors "Tokio offers a current-thread flavor (single-threaded, low overhead) and a multi-thread flavor (work-stealing across N workers) chosen via the runtime builder."
save send-bound-spawn      "tokio::spawn requires the future to be Send + 'static because the work-stealing scheduler may move it across threads; use a LocalSet for !Send futures."

echo "demo graph ready at $FOLKLORE_HOME"
