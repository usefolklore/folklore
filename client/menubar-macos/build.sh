#!/usr/bin/env bash
# Build folklore.app — a self-contained macOS menubar client.
#
# Compiles folklore-menubar.swift and assembles a .app bundle (LSUIElement, no
# Dock icon) with status.cjs bundled into Resources. Output: ./build/folklore.app
#
# Usage:
#   ./build.sh                 # build to ./build/folklore.app
#   ./build.sh --install       # also copy into /Applications
#   FOLKLORE_BIN=/path/bin/folklore.js ./build.sh   # bake a CLI path default
set -euo pipefail
cd "$(dirname "$0")"

APP="build/folklore.app"
MACOS="$APP/Contents/MacOS"
RES="$APP/Contents/Resources"

rm -rf "$APP"
mkdir -p "$MACOS" "$RES"

echo "→ compiling (swiftc, arm64+ optimised)…"
swiftc -O -o "$MACOS/folklore" folklore-menubar.swift \
  -framework AppKit -framework Foundation

echo "→ bundling status probe…"
cp status.cjs "$RES/status.cjs"

echo "→ writing Info.plist…"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>                <string>folklore</string>
  <key>CFBundleDisplayName</key>         <string>folklore</string>
  <key>CFBundleIdentifier</key>          <string>dev.folklore.menubar</string>
  <key>CFBundleVersion</key>             <string>1.0</string>
  <key>CFBundleShortVersionString</key>  <string>1.0</string>
  <key>CFBundlePackageType</key>         <string>APPL</string>
  <key>CFBundleExecutable</key>          <string>folklore</string>
  <key>LSMinimumSystemVersion</key>      <string>13.0</string>
  <key>LSUIElement</key>                 <true/>
  <key>NSHighResolutionCapable</key>     <true/>
</dict>
</plist>
PLIST

# Ad-hoc codesign so Gatekeeper lets the local build launch.
codesign --force --deep --sign - "$APP" 2>/dev/null || echo "  (codesign skipped)"

echo "✓ built $APP"

if [[ "${1:-}" == "--install" ]]; then
  rm -rf /Applications/folklore.app
  cp -R "$APP" /Applications/folklore.app
  echo "✓ installed → /Applications/folklore.app"
fi
