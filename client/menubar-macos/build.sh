#!/usr/bin/env bash
# Build folklore.app — a self-contained macOS menubar client.
#
# Compiles the AppKit client and assembles a .app bundle (LSUIElement, no Dock
# icon) with its status probe and current website brand marks in Resources.
#
# Usage:
#   ./build.sh                 # build to ./build/folklore.app (host arch — fast)
#   ./build.sh --universal     # arm64 + x86_64 fat binary — required for release
#   ./build.sh --install       # also copy into /Applications
#   FOLKLORE_BIN=/path/bin/folklore.js ./build.sh   # bake a CLI path default
set -euo pipefail
cd "$(dirname "$0")"

APP="build/folklore.app"
MACOS="$APP/Contents/MacOS"
RES="$APP/Contents/Resources"
DEPLOY_TARGET="13.0"   # keep in step with LSMinimumSystemVersion below

UNIVERSAL=0
INSTALL=0
for arg in "$@"; do
  case "$arg" in
    --universal) UNIVERSAL=1 ;;
    --install)   INSTALL=1 ;;
  esac
done

rm -rf "$APP"
mkdir -p "$MACOS" "$RES"

cp folklore-menubar.swift build/main.swift
if [[ "$UNIVERSAL" == "1" ]]; then
  # A release download has to run on Intel too. Without an explicit -target,
  # swiftc emits host-arch only, which silently ships an arm64-only app.
  echo "→ compiling universal (arm64 + x86_64, optimised)…"
  for arch in arm64 x86_64; do
    swiftc -O -target "${arch}-apple-macos${DEPLOY_TARGET}" -o "build/folklore-$arch" \
      build/main.swift activity-island.swift -framework AppKit -framework Foundation
  done
  lipo -create -output "$MACOS/folklore" build/folklore-arm64 build/folklore-x86_64
  rm -f build/folklore-arm64 build/folklore-x86_64
  echo "  architectures: $(lipo -archs "$MACOS/folklore")"
else
  echo "→ compiling (swiftc, host arch, optimised)…"
  swiftc -O -o "$MACOS/folklore" build/main.swift activity-island.swift \
    -framework AppKit -framework Foundation
fi
rm build/main.swift

echo "→ bundling status probe + current site icons…"
cp status.cjs "$RES/status.cjs"
cp ../../site/assets/folklore-logo.svg "$RES/folklore-logo.svg"
cp ../../site/assets/folklore-navbar.svg "$RES/folklore-navbar.svg"
cp ../../site/assets/folklore-favicon.svg "$RES/folklore-favicon.svg"
cp ../../site/assets/folklore-spark.svg "$RES/folklore-spark.svg"

echo "→ writing Info.plist…"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>   <string>en</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key>                <string>folklore</string>
  <key>CFBundleDisplayName</key>         <string>folklore</string>
  <key>CFBundleIdentifier</key>          <string>dev.folklore.menubar</string>
  <key>CFBundleVersion</key>             <string>1.1</string>
  <key>CFBundleShortVersionString</key>  <string>1.1</string>
  <key>CFBundlePackageType</key>         <string>APPL</string>
  <key>CFBundleSignature</key>           <string>????</string>
  <key>CFBundleExecutable</key>          <string>folklore</string>
  <key>LSMinimumSystemVersion</key>      <string>13.0</string>
  <key>LSUIElement</key>                 <true/>
  <key>NSHighResolutionCapable</key>     <true/>
  <key>NSPrincipalClass</key>            <string>NSApplication</string>
</dict>
</plist>
PLIST

printf 'APPL????' > "$APP/Contents/PkgInfo"

# Ad-hoc codesign so Gatekeeper lets the local build launch.
codesign --force --deep --sign - "$APP" 2>/dev/null || echo "  (codesign skipped)"

echo "✓ built $APP"

if [[ "$INSTALL" == "1" ]]; then
  rm -rf /Applications/folklore.app
  cp -R "$APP" /Applications/folklore.app
  echo "✓ installed → /Applications/folklore.app"
fi
