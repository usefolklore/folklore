# folklore in-session demo. Capture real outputs first, then record FROM this dir:
#   cd examples/in-session && bash capture.sh && vhs demo.tape
Output in-session.gif

Set Shell bash
Set FontSize 17
Set Width 1480
Set Height 680
Set Theme "Catppuccin Mocha"
Set Padding 24

# launch hidden — session.mjs runs console.clear() on start, so the launch
# command is wiped before we Show. What's recorded looks like a live session.
Hide
Type "node session.mjs"
Enter
Sleep 700ms
Show

Sleep 18s
