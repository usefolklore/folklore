# wellinformed — terminal demo
# Recorded via VHS (https://github.com/charmbracelet/vhs).
#
# Walks through the queries described in demo/MANUSCRIPT.md scenes
# 1, 2, 5, 7, 8 — the terminal-only beats. Scenes 3, 4, 6 (Claude
# Code session, side-by-side timing, P2P touch) need live screen
# capture; this gif covers what VHS can drive directly.
#
# Run: bash demo/setup.sh && vhs demo/screencast.tape
# Output: demo/screencast.gif

Output demo/screencast.gif

Set Shell "zsh"
Set FontSize 14
Set Width 1100
Set Height 720
Set TypingSpeed 28ms
Set PlaybackSpeed 1.0
Set Theme "Catppuccin Mocha"
Set Padding 20
Set Margin 0
Set BorderRadius 10
Set WindowBar Colorful
Set WindowBarSize 30

# ─── hidden setup ──────────────────────────────────────────
# Pin the demo home + clear the screen before frame 1. The corpus
# is already loaded by `bash demo/setup.sh` (prerequisite).
Hide
Type "export WELLINFORMED_HOME=$HOME/.wellinformed.demo"
Enter
Type "clear"
Enter
Sleep 200ms
Show

# ─── scene 0: title ────────────────────────────────────────
Type '# wellinformed — local-first knowledge graph for AI agents'
Enter
Type '# 15 notes on cryogenic LH2 leak detection — already loaded'
Enter
Sleep 1500ms

Type 'ls demo/research-corpus | head -5'
Enter
Sleep 2500ms

# ─── scene 2: direct ask with timing ───────────────────────
Type 'echo'
Enter
Type '# scene 2 — direct query, full result block'
Enter
Sleep 800ms

Type 'time wellinformed ask "ML methods for liquid hydrogen leak detection" --k 3'
Enter
Sleep 4500ms

# ─── scene 5: recall by entity ─────────────────────────────
Type 'clear'
Enter
Type 'echo'
Enter
Type '# scene 5 — entity recall: every chunk that mentions stanford-cryo-lab'
Enter
Sleep 800ms

Type 'wellinformed recall stanford-cryo-lab'
Enter
Sleep 4500ms

# ─── scene 5b: another entity recall to show the pattern ───
Type 'clear'
Enter
Type 'echo'
Enter
Type '# scene 5b — entity recall: nasa-glenn'
Enter
Sleep 800ms

Type 'wellinformed recall nasa-glenn'
Enter
Sleep 4500ms

# ─── scene 8: closing ──────────────────────────────────────
Type 'clear'
Enter
Type 'echo'
Enter
Type 'echo "wellinformed — local-first knowledge for AI agents"'
Enter
Type 'echo "  ✓ sub-second local retrieval"'
Enter
Type 'echo "  ✓ entity-aware recall"'
Enter
Type 'echo "  ✓ proactive hook injection — see Claude Code panel demo"'
Enter
Type 'echo "  ✓ P2P federation, signed envelopes, no server"'
Enter
Type 'echo'
Enter
Type 'echo "  github.com/SaharBarak/wellinformed"'
Enter
Sleep 3500ms
