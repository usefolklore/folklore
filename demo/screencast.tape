# folklore — terminal demo (screencast)
#
# Headline gif. Walks through the queries described in
# demo/MANUSCRIPT.md scenes 1, 2, 5, 7, 8 — the terminal-only beats.
# Live-capture scenes (Claude Code panels, P2P touch) live in the
# scene-* gifs alongside this one.
#
# Run: bash demo/setup.sh && vhs demo/screencast.tape
# Output: demo/screencast.gif

Output demo/screencast.gif

Set Shell "zsh"
Set FontSize 14
Set Width 1100
Set Height 720
Set TypingSpeed 24ms
Set PlaybackSpeed 1.0
Set Theme "Catppuccin Mocha"
Set Padding 20
Set Margin 0
Set BorderRadius 10
Set WindowBar Colorful
Set WindowBarSize 30

# ─── hidden setup ──────────────────────────────────────────
Hide
Type "export FOLKLORE_HOME=$HOME/.folklore.demo"
Enter
Type "clear"
Enter
Sleep 200ms
Show

# ─── opening — value prop ──────────────────────────────────
Type '# folklore — local-first knowledge graph for AI agents'
Enter
Type '# 15 cryogenic-LH2 research notes already loaded · ready'
Enter
Sleep 1800ms

# ─── direct ask with timing ────────────────────────────────
Type 'time folklore ask "ML methods for liquid hydrogen leak detection" --k 3'
Enter
Sleep 4500ms

# ─── entity recall ─────────────────────────────────────────
Type 'clear'
Enter
Type '# entity recall — every chunk that mentions stanford-cryo-lab, across rooms'
Enter
Sleep 700ms

Type 'folklore recall stanford-cryo-lab'
Enter
Sleep 4500ms

# ─── second entity for variety ─────────────────────────────
Type 'clear'
Enter
Type '# same query channel, different entity'
Enter
Sleep 700ms

Type 'folklore recall nasa-glenn'
Enter
Sleep 4500ms

# ─── peer reputation snapshot — the new feature ────────────
Type 'clear'
Enter
Type '# peer reputation — the system tracks who knows what, learned from real federated asks'
Enter
Sleep 800ms

Type 'folklore peers rep'
Enter
Sleep 3500ms

# ─── closing ───────────────────────────────────────────────
Type 'clear'
Enter
Type 'echo "folklore — local-first knowledge for AI agents"'
Enter
Type 'echo "  ✓ sub-second local retrieval"'
Enter
Type 'echo "  ✓ entity-aware recall + peer reputation"'
Enter
Type 'echo "  ✓ proactive hook injection (PreToolUse + UserPromptSubmit)"'
Enter
Type 'echo "  ✓ P2P federation, signed envelopes, no server"'
Enter
Type 'echo'
Enter
Type 'echo "  github.com/SaharBarak/folklore"'
Enter
Sleep 3500ms
