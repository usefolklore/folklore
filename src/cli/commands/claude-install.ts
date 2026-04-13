/**
 * `wellinformed claude install` / `wellinformed claude uninstall`
 *
 * Installs two things that make Claude Code use wellinformed
 * automatically without the user explicitly asking:
 *
 * 1. A PreToolUse hook in .claude/settings.json that fires before
 *    Glob, Grep, and Read calls. If a knowledge graph exists, it
 *    injects a reminder: "wellinformed: Knowledge graph available.
 *    Use the wellinformed MCP tools (search, ask, get_node) to find
 *    context before searching raw files."
 *
 * 2. A section in CLAUDE.md that tells Claude to prefer the graph
 *    for research/architecture questions.
 *
 * This is the same pattern graphify uses — a hook that makes the
 * agent graph-aware on every tool call.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const HOOK_SCRIPT_NAME = 'wellinformed-hook.sh';

const HOOK_SCRIPT = `#!/bin/sh
# wellinformed PreToolUse + SessionStart hook.
# Fires before Glob|Grep|Read (legacy hint) and on SessionStart (Phase 20 — recent session summary).
GRAPH="\${WELLINFORMED_HOME:-$HOME/.wellinformed}/graph.json"

# ── SessionStart branch (Phase 20) ──────────────────────────────────────────
if [ "\${CLAUDE_HOOK_EVENT:-}" = "SessionStart" ]; then
  if command -v wellinformed >/dev/null 2>&1; then
    RECENT=$(wellinformed recent-sessions --hours 24 --limit 1 --json 2>/dev/null || echo '{"count":0,"sessions":[]}')
    COUNT=$(printf '%s' "$RECENT" | grep -c '"id":' 2>/dev/null || echo 0)
    if [ "$COUNT" -gt 0 ]; then
      SID=$(printf '%s' "$RECENT" | grep -m1 '"id":' | sed 's/.*"id": *"\\([^"]*\\)".*/\\1/')
      STARTED=$(printf '%s' "$RECENT" | grep -m1 '"started_at":' | sed 's/.*"started_at": *"\\([^"]*\\)".*/\\1/')
      FINAL=$(printf '%s' "$RECENT" | grep -m1 '"final_assistant_message":' | sed 's/.*"final_assistant_message": *"\\([^"]*\\)".*/\\1/')
      BRANCH=$(printf '%s' "$RECENT" | grep -m1 '"git_branch":' | sed 's/.*"git_branch": *"\\([^"]*\\)".*/\\1/')
      MSG="wellinformed: Previous session $SID (started $STARTED, branch $BRANCH). Last assistant: \${FINAL:-<none>}. Call the recent_sessions MCP tool for the full rollup."
      printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\\n' "$MSG"
    fi
  fi
  exit 0
fi

# ── Legacy PreToolUse branch — unchanged output ──────────────────────────────
if [ -f "$GRAPH" ]; then
  NODES=$(grep -c '"id"' "$GRAPH" 2>/dev/null || echo 0)
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"wellinformed: Knowledge graph exists ('"$NODES"' nodes). Before searching raw files, consider using the wellinformed MCP tools: search (semantic k-NN), ask (search + context assembly), get_node (lookup by ID), get_neighbors (graph traversal). These return your indexed research + codebase + external sources in one query."}}'
fi
`;

// PreToolUse hook config — fires before Glob, Grep, Read.
// Sets CLAUDE_HOOK_EVENT so the script takes the legacy branch.
const HOOK_CONFIG_PRE_TOOL_USE = {
  matcher: 'Glob|Grep|Read',
  hooks: [
    {
      type: 'command',
      command: `sh -c 'CLAUDE_HOOK_EVENT=PreToolUse exec sh "\${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/${HOOK_SCRIPT_NAME}"'`,
      timeout: 3000,
    },
  ],
};

// SessionStart hook config — fires when Claude Code starts a new session.
// Sets CLAUDE_HOOK_EVENT=SessionStart so the script takes the Phase 20 branch.
const HOOK_CONFIG_SESSION_START = {
  hooks: [
    {
      type: 'command',
      command: `sh -c 'CLAUDE_HOOK_EVENT=SessionStart exec sh "\${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/${HOOK_SCRIPT_NAME}"'`,
      timeout: 5000,
    },
  ],
};

const CLAUDE_MD_SECTION = `
# wellinformed
When answering questions about research, architecture, dependencies, or "what did I read about X":
1. Use the wellinformed MCP tools (\`search\`, \`ask\`, \`get_node\`, \`get_neighbors\`) BEFORE searching raw files
2. The knowledge graph contains indexed ArXiv papers, HN stories, RSS posts, your codebase, dependencies, and git history
3. \`search\` takes a query string and optional room filter — use it like a research database
4. \`find_tunnels\` surfaces surprising connections across research domains
5. \`trigger_room\` refreshes the data if the user asks for latest research
`;

const CLAUDE_MD_MARKER_START = '<!-- wellinformed:start -->';
const CLAUDE_MD_MARKER_END = '<!-- wellinformed:end -->';

// ─────────────── install ────────────────

const install = (projectDir: string): number => {
  const claudeDir = join(projectDir, '.claude');
  const hooksDir = join(claudeDir, 'hooks');
  const settingsPath = join(claudeDir, 'settings.json');
  const claudeMdPath = join(projectDir, 'CLAUDE.md');

  // 1. Write the hook script
  mkdirSync(hooksDir, { recursive: true });
  const hookPath = join(hooksDir, HOOK_SCRIPT_NAME);
  writeFileSync(hookPath, HOOK_SCRIPT, { mode: 0o755 });
  console.log(`  wrote ${hookPath}`);

  // 2. Add PreToolUse hook to settings.json
  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    } catch {
      console.error(`  warning: could not parse ${settingsPath}, creating fresh`);
    }
  }

  const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;

  // PreToolUse — idempotent: filter by HOOK_SCRIPT_NAME then re-append
  const preToolUse = Array.isArray(hooks.PreToolUse) ? hooks.PreToolUse : [];
  const preFiltered = preToolUse.filter(
    (h) => !JSON.stringify(h).includes(HOOK_SCRIPT_NAME),
  );
  preFiltered.push(HOOK_CONFIG_PRE_TOOL_USE);
  hooks.PreToolUse = preFiltered;

  // SessionStart — Phase 20 — same idempotency discipline
  const sessionStart = Array.isArray(hooks.SessionStart) ? hooks.SessionStart : [];
  const ssFiltered = sessionStart.filter(
    (h) => !JSON.stringify(h).includes(HOOK_SCRIPT_NAME),
  );
  ssFiltered.push(HOOK_CONFIG_SESSION_START);
  hooks.SessionStart = ssFiltered;

  settings.hooks = hooks;
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  console.log(`  updated ${settingsPath} (PreToolUse hook added)`);

  // 3. Add section to CLAUDE.md
  let claudeMd = '';
  if (existsSync(claudeMdPath)) {
    claudeMd = readFileSync(claudeMdPath, 'utf8');
  }

  // Remove existing section if present
  const startIdx = claudeMd.indexOf(CLAUDE_MD_MARKER_START);
  const endIdx = claudeMd.indexOf(CLAUDE_MD_MARKER_END);
  if (startIdx >= 0 && endIdx >= 0) {
    claudeMd = claudeMd.slice(0, startIdx) + claudeMd.slice(endIdx + CLAUDE_MD_MARKER_END.length);
  }

  // Append
  const section = `\n${CLAUDE_MD_MARKER_START}\n${CLAUDE_MD_SECTION}\n${CLAUDE_MD_MARKER_END}\n`;
  claudeMd = claudeMd.trimEnd() + '\n' + section;
  writeFileSync(claudeMdPath, claudeMd);
  console.log(`  updated ${claudeMdPath} (wellinformed section added)`);

  console.log('\nClaude Code will now check the wellinformed knowledge graph');
  console.log('before searching raw files. Restart Claude Code to activate.');
  return 0;
};

// ─────────────── uninstall ──────────────

const uninstall = (projectDir: string): number => {
  const claudeDir = join(projectDir, '.claude');
  const settingsPath = join(claudeDir, 'settings.json');
  const claudeMdPath = join(projectDir, 'CLAUDE.md');
  const hookPath = join(claudeDir, 'hooks', HOOK_SCRIPT_NAME);

  // 1. Remove hook script
  if (existsSync(hookPath)) {
    const { unlinkSync } = require('node:fs');
    unlinkSync(hookPath);
    console.log(`  removed ${hookPath}`);
  }

  // 2. Remove from settings.json (both PreToolUse and SessionStart — Phase 20 symmetry)
  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
      const hooks = settings.hooks ?? {};
      let changed = false;
      if (Array.isArray(hooks.PreToolUse)) {
        hooks.PreToolUse = hooks.PreToolUse.filter(
          (h: unknown) => !JSON.stringify(h).includes(HOOK_SCRIPT_NAME),
        );
        changed = true;
      }
      if (Array.isArray(hooks.SessionStart)) {
        hooks.SessionStart = hooks.SessionStart.filter(
          (h: unknown) => !JSON.stringify(h).includes(HOOK_SCRIPT_NAME),
        );
        changed = true;
      }
      if (changed) {
        settings.hooks = hooks;
        writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        console.log(`  updated ${settingsPath} (hook removed)`);
      }
    } catch {
      console.error(`  warning: could not update ${settingsPath}`);
    }
  }

  // 3. Remove from CLAUDE.md
  if (existsSync(claudeMdPath)) {
    let claudeMd = readFileSync(claudeMdPath, 'utf8');
    const startIdx = claudeMd.indexOf(CLAUDE_MD_MARKER_START);
    const endIdx = claudeMd.indexOf(CLAUDE_MD_MARKER_END);
    if (startIdx >= 0 && endIdx >= 0) {
      claudeMd = claudeMd.slice(0, startIdx) + claudeMd.slice(endIdx + CLAUDE_MD_MARKER_END.length);
      claudeMd = claudeMd.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
      writeFileSync(claudeMdPath, claudeMd);
      console.log(`  updated ${claudeMdPath} (section removed)`);
    }
  }

  console.log('\nwellinformed hooks removed. Restart Claude Code to deactivate.');
  return 0;
};

// ─────────────── entry ──────────────────

export const claudeInstall = async (args: readonly string[]): Promise<number> => {
  const [sub] = args;
  const projectDir = process.cwd();

  switch (sub) {
    case 'install':
      console.log('wellinformed claude install\n');
      return install(projectDir);
    case 'uninstall':
      console.log('wellinformed claude uninstall\n');
      return uninstall(projectDir);
    default:
      console.error(`claude: unknown subcommand '${sub ?? ''}'. try: install | uninstall`);
      return 1;
  }
};
