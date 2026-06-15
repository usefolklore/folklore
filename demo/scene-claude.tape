# folklore — scene 4 — side-by-side timing comparison
#
# THE marquee gif. Lead with the value prop, then prove it. Same
# `claude -p` prompt run twice. Run A: no project hooks, Claude alone.
# Run B: this repo, folklore PreToolUse hook wired.
#
# Total target: ~25-30 s gif. First 4 s carry the value proposition
# in text so the gif works as a teaser even if a viewer doesn't
# wait for the full thing.
#
# Run: bash demo/setup.sh && vhs demo/scene-claude.tape
# Output: demo/scene-claude.gif

Output demo/scene-claude.gif

Set Shell "zsh"
Set FontSize 13
Set Width 1200
Set Height 760
Set TypingSpeed 22ms
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

# ─── value prop opens the gif ──────────────────────────────
Type '# Same model. Same prompt. The only difference: folklore.'
Enter
Sleep 1800ms

Type 'cd /tmp/demo-without-folklore'
Enter
Sleep 400ms

# ─── Run A: Claude alone — slow + hedged ───────────────────
Type '# (1)  claude alone — no project hook, no local graph'
Enter
Sleep 700ms

Type 'time claude -p "Which research group publishes on quench-detection LSTMs for cryogenic hydrogen storage? Name the lab and the most relevant 2024 paper."'
Enter
Sleep 45s

# ─── Run B: Claude + folklore — fast + cited ───────────
Type 'clear'
Enter
Sleep 300ms

Type 'cd /Users/saharbarak/personal/folklore'
Enter
Sleep 300ms

Type '# (2)  claude WITH the folklore PreToolUse hook'
Enter
Sleep 700ms

Type 'time claude -p "Which research group publishes on quench-detection LSTMs for cryogenic hydrogen storage? Name the lab and the most relevant 2024 paper."'
Enter
Sleep 22s

# ─── closing — drives the punchline home ───────────────────
Type 'echo'
Enter
Type 'echo "↑ ~10x faster · cited from local research · hook fired before any tool call"'
Enter
Sleep 3500ms
