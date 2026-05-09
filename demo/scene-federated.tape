# wellinformed — federated P2P ask, captured live across a 5-daemon mesh.
# Driven by demo/scene-federated.sh.
# Output: demo/scene-federated.gif

Output demo/scene-federated.gif

Set Shell "zsh"
Set FontSize 14
Set Width 1280
Set Height 760
Set TypingSpeed 28ms
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

Type 'wellinformed peer list | head -20'
Enter
Sleep 4500ms

Type "clear"
Enter
Sleep 300ms

Type 'wellinformed ask --peers "open hardware Raman 532nm hydrogen" --k 5 2>/dev/null | head -40'
Enter
Sleep 7000ms
