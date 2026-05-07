# wellinformed — scene 4 — side-by-side timing comparison
#
# Same prompt to `claude -p` twice:
#   Run A: in /tmp/demo-without-wellinformed (no project hooks)
#   Run B: in this repo (wellinformed PreToolUse hook is wired)
#
# Both wrapped in `time` so the timing delta + the citation delta is
# the headline signal. Run A web-searches and hedges; Run B gets the
# wellinformed prefetch and cites local notes.
#
# Run: bash demo/setup.sh && vhs demo/scene-claude.tape
# Output: demo/scene-claude.gif

Output demo/scene-claude.gif

Set Shell "zsh"
Set FontSize 13
Set Width 1200
Set Height 800
Set TypingSpeed 26ms
Set PlaybackSpeed 1.0
Set Theme "Catppuccin Mocha"
Set Padding 20
Set Margin 0
Set BorderRadius 10
Set WindowBar Colorful
Set WindowBarSize 30

Hide
Type "export WELLINFORMED_HOME=$HOME/.wellinformed.demo"
Enter
Type "clear"
Enter
Sleep 200ms
Show

# ─── Run A: Claude WITHOUT wellinformed ────────────────────
Type '# Run A — Claude alone, no project hook, no local graph'
Enter
Type 'cd /tmp/demo-without-wellinformed'
Enter
Sleep 600ms

Type 'time claude -p "Which research group publishes on quench-detection LSTMs for cryogenic hydrogen storage? Cite the most relevant 2024 paper if you know one."'
Enter
Sleep 60s

# ─── Run B: Claude WITH wellinformed ───────────────────────
Type 'clear'
Enter
Type '# Run B — same model, same query, this time wellinformed hook is wired'
Enter
Type 'cd /Users/saharbarak/personal/wellinformed'
Enter
Sleep 600ms

Type 'time claude -p "Which research group publishes on quench-detection LSTMs for cryogenic hydrogen storage? Cite the most relevant 2024 paper if you know one."'
Enter
Sleep 25s

# ─── closing ───────────────────────────────────────────────
Type 'echo'
Enter
Type 'echo "↑ same model · same query · only difference is the wellinformed hook"'
Enter
Sleep 3500ms
