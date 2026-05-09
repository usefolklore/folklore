# wellinformed — federated retrieval inside an active Claude Code session.
# Driven by demo/scene-federated.sh (sets up 5-daemon mesh, records, tears down).
# Output: demo/scene-federated.gif

Output demo/scene-federated.gif

Set Shell "zsh"
Set FontSize 13
Set Width 1440
Set Height 900
Set TypingSpeed 26ms
Set PlaybackSpeed 1.0
Set Theme "Catppuccin Mocha"
Set Padding 20
Set Margin 0
Set BorderRadius 10
Set WindowBar Colorful
Set WindowBarSize 30

Hide
Type "cd /Users/saharbarak/personal/wellinformed"
Enter
Type "export WELLINFORMED_HOME=$HOME/.wellinformed.demo"
Enter
Type "export WELLINFORMED_PREFETCH_TIMEOUT_MS=15000"
Enter
Type "clear"
Enter
Sleep 200ms
Show

Type "claude --permission-mode bypassPermissions"
Enter
Sleep 9000ms

Type "Run this in Bash: wellinformed ask 'open hardware Raman LH2 spectrometer Munich' --peers --k 4. Then tell me which peer the top hit came from and what the note says."
Sleep 800ms
Enter
Sleep 100000ms

Ctrl+C
Sleep 800ms
Ctrl+C
Sleep 1500ms
