# wellinformed — scene 9 — UserPromptSubmit hook in flight
#
# Demonstrates the freshly-shipped UserPromptSubmit hook (commit
# 0749f21). A simulated Claude Code payload is piped into the hook;
# the contract block + 3 indexed hits come out — exactly what Claude
# would see as additionalContext on every user message.
#
# Run: bash demo/setup.sh && vhs demo/scene-prompt-hook.tape
# Output: demo/scene-prompt-hook.gif

Output demo/scene-prompt-hook.gif

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
Type "export WELLINFORMED_HOME=$HOME/.wellinformed.demo"
Enter
Type "clear"
Enter
Sleep 200ms
Show

Type "# wellinformed UserPromptSubmit hook — fires BEFORE Claude reads the user message."
Enter
Sleep 1800ms

Type "cat /tmp/wi-prompt-demo.json"
Enter
Sleep 1800ms

Type "echo"
Enter
Type "# pipe it into the hook ↓"
Enter
Sleep 800ms

Type "cat /tmp/wi-prompt-demo.json | node .claude/hooks/wellinformed-prompt-submit.cjs | jq -r .hookSpecificOutput.additionalContext"
Enter
Sleep 8000ms

Type "echo"
Enter
Type "# ↑ lands in Claude context BEFORE the LLM reads the user message —"
Enter
Type "# no WebSearch, no Read, no Grep. Local graph hit, cited, sub-second."
Enter
Sleep 4000ms
