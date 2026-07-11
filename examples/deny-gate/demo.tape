# folklore deny-gate demo.
# Build the graph first, then record FROM this dir:
#   cd examples/deny-gate && bash setup.sh && vhs demo.tape
Output deny-gate.gif

Set Shell bash
Set FontSize 18
Set Width 1500
Set Height 820
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms
Set Padding 26

Sleep 700ms
Type "# folklore: your coding agent asks its graph before it asks the web"
Enter
Sleep 1800ms

# case 1: the graph knows it → web call DENIED, answered offline in ~0.8s
Type "./agent 'how does tokio schedule tasks across threads?'"
Enter
Sleep 6000ms

# case 2: the graph does not know it → web call ALLOWED, result auto-saves
Type "./agent 'what is the current SOFR interest rate today?'"
Enter
Sleep 5500ms
