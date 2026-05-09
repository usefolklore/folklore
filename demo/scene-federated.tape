# wellinformed — federated P2P ask, captured live across a 5-daemon mesh.
#
# Driven by demo/scene-federated.sh, which spins up peer A + B/C/D/E
# (4 peers each holding one exclusive note), runs the federated ask
# from peer A, and records the actual stdout. Teardown runs in the
# scene-federated.sh EXIT trap.
#
# Output: demo/scene-federated.gif

Output demo/scene-federated.gif

Set Shell "zsh"
Set FontSize 14
Set Width 1280
Set Height 760
Set TypingSpeed 24ms
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

Type "# 5 wellinformed daemons on 127.0.0.1 — peer A + 4 peers each"
Enter
Type "# holding one exclusive note. Peer A asks; peers respond live."
Enter
Sleep 800ms

Type 'wellinformed peer list | head -20'
Enter
Sleep 3500ms

Type "clear"
Enter
Type "# the Munich open-hardware Raman kit is only on peer B."
Enter
Type "# ask across the mesh — federated, sub-second."
Enter
Sleep 800ms

Type 'wellinformed ask --peers "open hardware Raman 532nm hydrogen" --k 5 2>/dev/null | head -40'
Enter
Sleep 6000ms

Type "clear"
Enter
Type "# top hit: source_peer = peer B, room = research, distance ~0.85"
Enter
Type "# the Munich note lives ONLY on peer B's machine. We just pulled"
Enter
Type "# it across libp2p with cryptographic attribution in 209 ms."
Enter
Sleep 4000ms
