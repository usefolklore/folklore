#!/bin/sh
# wellinformed Post-Edit hook — after file edits, remind about re-indexing
#
# Fires after Write/Edit/MultiEdit. If the edited file is in src/,
# suggest re-indexing to keep the graph current with code changes.

# Only fire for source files, not config/docs
FILE_PATH="${CLAUDE_FILE_PATH:-}"
case "$FILE_PATH" in
  src/*|tests/*)
    echo '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"wellinformed: Source file changed. Run `wellinformed index` to update the codebase graph, or the daemon will pick it up on the next tick."}}'
    ;;
esac
