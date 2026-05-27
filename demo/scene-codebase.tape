# akashik — scene 7 — codebase Q&A inside Claude Code
#
# The akashik repo is indexed into ~/.akashik.demo (room
# `akashik`, 342 nodes including 249 code chunks + 50 git log
# entries). The repo's `.claude/settings.json` wires the PreToolUse
# hook to prefetch the graph before any Read/Glob/Grep tool call.
#
# Claude is asked a specific implementation question. Without a
# graph, it would need to grep through the source. With the
# akashik hook, the relevant code chunks (and the very commit
# that introduced the change) are injected into context preemptively.
#
# Run: bash demo/setup.sh && AKASHIK_HOME=~/.akashik.demo \
#        akashik this me  &&  vhs demo/scene-codebase.tape
# Output: demo/scene-codebase.gif

Output demo/scene-codebase.gif

Set Shell "zsh"
Set FontSize 13
Set Width 1200
Set Height 760
Set TypingSpeed 26ms
Set PlaybackSpeed 1.0
Set Theme "Catppuccin Mocha"
Set Padding 20
Set Margin 0
Set BorderRadius 10
Set WindowBar Colorful
Set WindowBarSize 30

Hide
Type "export AKASHIK_HOME=$HOME/.akashik.demo"
Enter
Type "cd /Users/saharbarak/personal/akashik"
Enter
Type "clear"
Enter
Sleep 200ms
Show

Type '# Claude Code session in the akashik repo'
Enter
Type '# PreToolUse hook fires before any Read/Glob/Grep — akashik prefetches'
Enter
Sleep 800ms

Type 'time claude -p "How does the akashik daemon do bounded backpressure on the job queue? Cite the file path and key constants."'
Enter
Sleep 30s

Type 'echo'
Enter
Type 'echo "↑ akashik-prefetched: Claude cites src/daemon/job-queue.ts directly"'
Enter
Sleep 3500ms
