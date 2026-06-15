# folklore — scene 6 — P2P touch across a 5-daemon mesh
#
# Driven by demo/scene-touch.sh, which spins up peer A + 4 peers
# (B/C/D/E) and exports their peerIds as env vars. After recording,
# scene-touch.sh's EXIT trap stops every daemon, so this gif leaves
# nothing running on disk.
#
# Output: demo/scene-touch.gif

Output demo/scene-touch.gif

Set Shell "zsh"
Set FontSize 13
Set Width 1200
Set Height 760
Set TypingSpeed 26ms
Set PlaybackSpeed 1.0
Set Theme "Catppuccin Mocha"
Set Padding 20
Set Margin 0
Set BorderRadius 10
Set WindowBar Colorful
Set WindowBarSize 30

Hide
Type "export FOLKLORE_HOME=$HOME/.folklore.demo"
Enter
Type "clear"
Enter
Sleep 200ms
Show

# ─── 1. peer list — 4 connected peers ──────────────────────
Type '# 5-daemon mesh: peer A + B + C + D + E, all on 127.0.0.1'
Enter
Sleep 600ms

Type 'folklore peer list'
Enter
Sleep 4000ms

# ─── 2. baseline ask — peer A only knows the original corpus ───
Type 'clear'
Enter
Type '# baseline — peer A asks about a Munich open-hardware Raman kit'
Enter
Type '# (only peer B has that note locally)'
Enter
Sleep 600ms

Type 'folklore ask "open-hardware portable Raman LH2 spectrometer munich" --k 3 --json | jq ".aggregate // .satisfaction.score"'
Enter
Sleep 3500ms

# ─── 3. touch peer B — pull the unique note ────────────────
Type 'clear'
Enter
Type '# touch peer B for the chunk it has but A does not'
Enter
Sleep 600ms

Type 'folklore touch --peer "$FOLKLORE_DEMO_PEER_B_ID" --room research'
Enter
Sleep 4500ms

# ─── 4. touch peer D — pull NASA benchmark snippet ─────────
Type '# touch peer D for the NASA Q1 2025 benchmark — different exclusive note'
Enter
Sleep 600ms

Type 'folklore touch --peer "$FOLKLORE_DEMO_PEER_D_ID" --room research'
Enter
Sleep 4500ms

# ─── 5. ask now surfaces the pulled chunks ─────────────────
Type 'clear'
Enter
Type '# now ask again — the new peer-attributed chunks rank in'
Enter
Sleep 600ms

Type 'folklore ask "open-hardware portable Raman LH2 spectrometer munich" --k 3'
Enter
Sleep 5000ms

Type 'echo'
Enter
Type 'echo "↑ source_peer markers show which peer each chunk came from"'
Enter
Sleep 3500ms
