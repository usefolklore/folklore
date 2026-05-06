# wellinformed — single-frame timing teaser
#
# Shows the headline number — `wellinformed ask` returning a full
# result block + agent contract in well under 1 second on a real
# 15-note corpus. This is the asset for social posts / README badges
# where the full screencast is too long.
#
# Run: bash demo/setup.sh && vhs demo/timing.tape
# Output: demo/timing.gif

Output demo/timing.gif

Set Shell "zsh"
Set FontSize 14
Set Width 1100
Set Height 480
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

Type '# 15 cryogenic-LH2 research notes loaded locally. cold cache.'
Enter
Sleep 800ms

Type 'time wellinformed ask "who runs quench-detection LSTM research" --k 3 | head -20'
Enter
Sleep 5500ms
