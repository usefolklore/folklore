#!/usr/bin/env bash
#
# folklore bootstrap — sets up the per-user runtime dir, creates a
# Python venv for the graphify sidecar, and installs graphify in editable
# mode from the vendor/graphify submodule.
#
# safe to re-run: skips steps that are already complete, re-installs on
# version bump.
#
# exit codes:
#   0 — bootstrap completed (or already satisfied)
#   1 — python3 missing
#   2 — graphify submodule missing
#   3 — venv creation failed
#   4 — pip install failed

set -euo pipefail

# resolve script dir so we work regardless of CWD
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
GRAPHIFY_DIR="$REPO_ROOT/vendor/graphify"

WELL_DIR="${FOLKLORE_HOME:-$HOME/.folklore}"
VENV_DIR="$WELL_DIR/venv"
STATE_FILE="$WELL_DIR/bootstrap.state.json"

log()  { printf '[folklore] %s\n' "$*"; }
warn() { printf '[folklore] WARN %s\n' "$*" >&2; }
die()  { printf '[folklore] FATAL %s\n' "$*" >&2; exit "${2:-1}"; }

# 1. pick a python3 >= 3.10. probe newest→oldest minor, then fall back to
# generic python3 if it happens to satisfy the minimum. macOS ships python3.9
# in /usr/bin, so we can't just trust `python3` on PATH.
HOST_PY=""
for candidate in python3.13 python3.12 python3.11 python3.10 python3; do
  if command -v "$candidate" >/dev/null 2>&1; then
    v="$($candidate -c 'import sys; print("%d.%d" % sys.version_info[:2])' 2>/dev/null || echo 0.0)"
    major="${v%%.*}"
    minor="${v##*.}"
    if [ "${major:-0}" -ge 3 ] && [ "${minor:-0}" -ge 10 ]; then
      HOST_PY="$(command -v "$candidate")"
      break
    fi
  fi
done

if [ -z "$HOST_PY" ]; then
  die "no python >= 3.10 found on PATH. install one (e.g. 'brew install python@3.12') and re-run." 1
fi
PY_VERSION="$($HOST_PY -c 'import sys; print("%d.%d" % sys.version_info[:2])')"
log "using python at $HOST_PY (version $PY_VERSION)"

# 2. graphify submodule
if [ ! -f "$GRAPHIFY_DIR/pyproject.toml" ]; then
  die "vendor/graphify is missing. run 'git submodule update --init --recursive'." 2
fi
log "graphify submodule present at $GRAPHIFY_DIR"

# 3. runtime dir
mkdir -p "$WELL_DIR"
log "runtime dir $WELL_DIR"

# 4. venv
VENV_PY="$VENV_DIR/bin/python"
# if a venv exists but was built with the wrong (too-old) host python, blow
# it away. this is the one destructive action in the script and it only
# targets ~/.folklore/venv which is per-user cache.
if [ -f "$VENV_PY" ]; then
  existing_ver="$($VENV_PY -c 'import sys; print("%d.%d" % sys.version_info[:2])' 2>/dev/null || echo 0.0)"
  existing_minor="${existing_ver##*.}"
  if [ "${existing_minor:-0}" -lt 10 ]; then
    warn "existing venv uses python $existing_ver (<3.10). rebuilding from $HOST_PY"
    rm -rf "$VENV_DIR"
  fi
fi
if [ ! -f "$VENV_PY" ]; then
  log "creating venv at $VENV_DIR (with $HOST_PY)"
  "$HOST_PY" -m venv "$VENV_DIR" || die "venv creation failed" 3
fi
log "venv python: $VENV_PY"

# 5. upgrade pip + install graphify in editable mode
"$VENV_PY" -m pip install --quiet --upgrade pip wheel setuptools >/dev/null || \
  die "pip/wheel/setuptools upgrade failed" 4

# check if graphify is already importable at the current vendor SHA
VENDOR_SHA="$(git -C "$GRAPHIFY_DIR" rev-parse HEAD 2>/dev/null || echo unknown)"
INSTALLED_SHA=""
if [ -f "$STATE_FILE" ]; then
  INSTALLED_SHA="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("graphify_sha",""))' "$STATE_FILE" 2>/dev/null || echo "")"
fi

if [ "$INSTALLED_SHA" = "$VENDOR_SHA" ] && "$VENV_PY" -c 'import graphify' >/dev/null 2>&1; then
  log "graphify already installed at SHA $VENDOR_SHA — skipping pip install"
else
  log "installing graphify (editable) from $GRAPHIFY_DIR"
  "$VENV_PY" -m pip install --quiet -e "$GRAPHIFY_DIR" >/dev/null || \
    die "pip install -e graphify failed" 4
fi

# 6. sanity check — import graphify and print version
if ! "$VENV_PY" -c 'import graphify; import graphify.validate; print("graphify OK — OPTIONAL_NODE_FIELDS =", sorted(graphify.validate.OPTIONAL_NODE_FIELDS))'; then
  die "graphify import failed after install" 4
fi

# 7. record bootstrap state (no jq dependency — use python for safety)
"$VENV_PY" - "$STATE_FILE" "$VENDOR_SHA" "$VENV_PY" <<'PY'
import json, sys, datetime
state_file, sha, venv_py = sys.argv[1:]
state = {
    "graphify_sha": sha,
    "venv_python": venv_py,
    "bootstrapped_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
}
with open(state_file, "w") as f:
    json.dump(state, f, indent=2)
print(f"[folklore] state written to {state_file}")
PY

log "bootstrap OK — run 'folklore doctor' to verify the full stack"
