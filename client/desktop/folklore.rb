# Homebrew cask for the Folklore desktop app (Tauri).
#
# Supersedes client/menubar-macos/folklore.rb (the old Swift menubar cask). The
# desktop app is the cross-platform GUI: tray + onboard wizard that wires the
# folklore memory server into every AI tool on the machine.
#
# Why a cask: the .dmg is unsigned/not-notarized until there's an Apple
# Developer ID, so a plain download is quarantined. `brew install --cask` strips
# the quarantine attribute, so it opens without the Privacy & Security prompt.
#
# Not consumed from this repo — Homebrew reads casks from a tap. To publish:
#   1. Create a public repo `usefolklore/homebrew-tap`.
#   2. Copy this file to `Casks/folklore.rb` in it.
#   3. Set `version` to the desktop release (e.g. 0.1.0) and fill `sha256` from
#      the published .dmg:  shasum -a 256 Folklore_0.1.0_universal.dmg
#   4. Bump both on each desktop-v* release.
#
# Then:  brew install --cask usefolklore/tap/folklore
#
cask "folklore" do
  version "0.1.0"
  sha256 :no_check # replace with the .dmg's shasum -a 256 once desktop-v0.1.0 ships

  url "https://github.com/usefolklore/folklore/releases/download/desktop-v#{version}/Folklore_#{version}_universal.dmg"
  name "Folklore"
  desc "Cross-platform tray app + setup wizard for a local folklore node"
  homepage "https://usefolklore.sh/"

  depends_on macos: :ventura

  app "Folklore.app"

  caveats <<~EOS
    On first launch, click "Install everything" — Folklore wires the memory
    server into every AI coding tool it finds and starts the local daemon.

    It drives the folklore CLI under the hood; if you don't already have it,
    the wizard fetches it via npx (Node required). Or install it yourself:

      npm install -g @usefolklore/folklore

    This build is not notarized. Homebrew has already cleared the quarantine
    flag, so it opens without the Privacy & Security prompt.
  EOS

  zap trash: [
    "~/.folklore",
    "~/Library/Preferences/sh.usefolklore.desktop.plist",
    "~/Library/Application Support/sh.usefolklore.desktop",
  ]
end
