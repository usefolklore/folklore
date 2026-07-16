# Homebrew cask for the folklore menubar app.
#
# Why this exists: the app is ad-hoc signed, not notarized — that needs a paid
# Apple Developer ID. A plain download is therefore quarantined and macOS makes
# the user dig through System Settings → Privacy & Security to open it. `brew
# install --cask` removes the quarantine attribute itself, so this is the clean
# install path until there's a Developer ID to notarize with. It's the same route
# other unsigned open-source Mac apps take.
#
# This file is not consumed from this repo. Homebrew reads casks from a tap:
#
#   1. Create a public repo named `usefolklore/homebrew-tap`.
#   2. Copy this file to `Casks/folklore.rb` in it.
#   3. Fill in `sha256` below from the published release:
#        shasum -a 256 folklore-macos.zip
#      (the Release workflow also uploads folklore-macos.zip.sha256)
#   4. Bump `version` + `sha256` on each release.
#
# Then it installs with:
#
#   brew install --cask usefolklore/tap/folklore
#
cask "folklore" do
  version "5.0.1"
  sha256 :no_check # replace with the release zip's shasum -a 256 once tagged

  url "https://github.com/usefolklore/folklore/releases/download/v#{version}/folklore-macos.zip"
  name "folklore"
  desc "Menubar client for a local folklore node, with peer activity in the notch"
  homepage "https://usefolklore.sh/"

  depends_on macos: ">= :ventura" # LSMinimumSystemVersion 13.0

  app "folklore.app"

  # The app is the face of the node — it shells out to the CLI for status and
  # daemon control, and does nothing useful on its own.
  caveats <<~EOS
    folklore.app talks to your local folklore node. Install it first:

      npm install -g @usefolklore/folklore

    This build is ad-hoc signed rather than notarized. Homebrew has already
    cleared the quarantine flag for you, so it will open without the
    Privacy & Security prompt a manual download would trigger.
  EOS

  zap trash: [
    "~/.folklore/menubar-status.json",
    "~/Library/Preferences/dev.folklore.menubar.plist",
  ]
end
