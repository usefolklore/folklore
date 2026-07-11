# folklore federation demo — two peers, one inference trace.
# Build the network first, then record FROM this dir:
#   cd examples/federation && bash setup.sh && vhs demo.tape
Output federation.gif

Set Shell bash
Set FontSize 18
Set Width 1520
Set Height 900
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms
Set Padding 26

Sleep 700ms
Type "# alice already debugged this yesterday (paid the tokens). bob asks today."
Enter
Sleep 1600ms

# 1st ask: bob's graph is empty → resolves from alice over P2P, pulls + verifies
Type "./resolve 'how do I fix the tokio spawn Send + static error sharing an Rc across await?'"
Enter
Sleep 5000ms

# 2nd ask: the trace is bob's now → instant, local, no network. it compounded.
Type "./resolve 'how do I fix the tokio spawn Send + static error sharing an Rc across await?'"
Enter
Sleep 4500ms
