# Bundled Node runtime

Populated per-platform by `.github/workflows/desktop-release.yml` before the
Tauri build: a clean Node dist is extracted here so the app can run the folklore
CLI (via `npx`) with zero Node installed on the user's machine.

Left empty in the repo (only this README is tracked). When empty, the app falls
back to the system Node / npx. See `bundled_node_bin` in `src/lib.rs`.
