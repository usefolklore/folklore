#!/usr/bin/env bash
#
# bench-memtool.sh — one-command reproduction of the full memory-tool benchmark
# (folklore vs mem0 / LangChain / Zep / Pinecone on the axes folklore competes on:
# web-gating, provenance/poison-defense, federated compounding, latency + cost).
#
# Scope, method, honest caveats:  docs/MEMORY-TOOL-BENCH-SCOPE.md
# Consolidated results:           docs/MEMORY-TOOL-BENCH-RESULTS.md
#
# Requirements (this sandbox):
#   - node + a built dist/ (npm run build) for the capability matrix + folklore gate
#   - python3.13 with: torch sentence-transformers langchain-community
#     langchain-huggingface faiss-cpu mem0ai ollama requests
#     (python3.9 cannot run mem0 — mem0ai 2.x uses PEP-604)
#   - a local Ollama serving qwen2.5:7b (for mem0's LLM-mediated writes)
#
# Snapshots land in ~/.folklore/bench/memory-tools/*.json; the report step renders
# them into docs/MEMORY-TOOL-BENCH-RESULTS.md. Every number is labeled
# MEASURED / SIMULATOR / STRUCTURAL — honest benches only, no weak-baseline inflation.
#
# Usage:  bash bench/bench-memtool.sh            # full suite
#         bash bench/bench-memtool.sh --fast     # skip the slow mem0 + folklore-CLI runs

set -uo pipefail
cd "$(dirname "$0")/.."

PY="${MEMTOOL_PY:-python3.13}"
FAST=0
[ "${1:-}" = "--fast" ] && FAST=1

hr(){ printf '\n\033[1m=== %s ===\033[0m\n' "$*"; }
have(){ command -v "$1" >/dev/null 2>&1; }

# preflight — report what is/ isn't available rather than failing opaquely
hr "preflight"
have node && echo "node: $(node --version)" || echo "node: MISSING (capability matrix + folklore gate will skip)"
if have "$PY"; then echo "$PY: $($PY --version 2>&1)"; else echo "$PY: MISSING — fall back to python3 (mem0 will report unavailable on <3.10)"; PY=python3; fi
curl -sS -m3 http://localhost:11434/api/tags >/dev/null 2>&1 && echo "ollama: up" || echo "ollama: down (mem0 will report unavailable)"
[ -f dist/cli/index.js ] && echo "folklore dist: built" || echo "folklore dist: MISSING (run npm run build)"

hr "P0 capability matrix"
have node && node bench/bench-memory-tools.mjs || echo "skipped (no node)"

if [ "$FAST" = "1" ]; then
  TOOLS="cosine,langchain"
else
  TOOLS="cosine,langchain,folklore,mem0"
fi

hr "P1 web-gating (fair metric: fallback @ matched false-accept)"
"$PY" bench/bench-memtool-webgating.py --tools "$TOOLS"

hr "P1 variance (mem0 nondeterminism; cosine/langchain stability)"
[ "$FAST" = "1" ] && "$PY" bench/bench-memtool-webgating.py --tools cosine,langchain --repeats 4 \
                  || "$PY" bench/bench-memtool-webgating.py --tools cosine,langchain,mem0 --repeats 4

hr "P2 provenance / poison-defense (toy)"
"$PY" bench/bench-memtool-poison.py

hr "P2 provenance / poison-defense (real BEIR scifact-mini)"
"$PY" bench/bench-memtool-poison-scifact.py

hr "P3 federated compounding (toy)"
"$PY" bench/bench-memtool-federation.py

hr "P3 federated compounding (real BEIR scifact-mini)"
"$PY" bench/bench-memtool-federation-scifact.py

hr "axis D — latency + cost"
"$PY" bench/bench-memtool-latency.py

hr "consolidate -> docs/MEMORY-TOOL-BENCH-RESULTS.md"
python3 bench/bench-memtool-report.py

hr "done"
echo "results doc: docs/MEMORY-TOOL-BENCH-RESULTS.md"
echo "snapshots:   ~/.folklore/bench/memory-tools/*.json"
