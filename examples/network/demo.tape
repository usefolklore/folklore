# folklore network demo — peers discover each other through a tracker.
# Build the network first, then record FROM this dir:
#   cd examples/network && bash setup.sh && vhs demo.tape && bash teardown.sh
Output network.gif

Set Shell bash
Set FontSize 18
Set Width 1520
Set Height 760
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms
Set Padding 26

Sleep 700ms
Type "# alice and bob each run folklore pointed at the same tracker — no peer-add, no DHT"
Enter
Sleep 1600ms

# the tracker directory — they registered + found each other with zero config
Type "./peers"
Enter
Sleep 3500ms

# bob's agent asks something alice already researched → it already reached him
Type "./resolve 'how do I fix the tokio spawn Send + static error sharing an Rc across await?'"
Enter
Sleep 4500ms
