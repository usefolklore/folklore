/**
 * `wellinformed claude install` / `wellinformed claude uninstall`
 *
 * Installs a three-layer integration that makes Claude Code route
 * knowledge questions through the wellinformed graph automatically:
 *
 * 1. PreToolUse smart prefetch (Glob|Grep|Read|WebSearch|WebFetch):
 *    Extracts the query from the tool input, runs `wellinformed ask
 *    --json` against the graph, and injects the top-3 hits into the
 *    tool-call context. On a miss, logs the query to
 *    ~/.wellinformed/miss-log.jsonl so the user can decide whether to
 *    ingest the topic. This converts "Claude goes to the web" into
 *    "Claude reads its own graph" whenever possible.
 *
 * 2. PostToolUse auto-save (WebSearch|WebFetch): after a web call
 *    succeeds, captures the result as a `source` note in the
 *    `research-inbox` room so the next session finds it via the graph
 *    instead of repeating the fetch. Closes the feedback loop.
 *
 * 3. SessionStart recent-sessions summary (legacy Phase 20 hook): on
 *    every session start, surfaces the previous session's final
 *    assistant message + branch so Claude walks in with context.
 *
 * 4. CLAUDE.md section: persistent system-prompt nudge so the skill
 *    trigger vocabulary is discoverable even without a hook firing.
 *
 * Hook source scripts live in .claude/hooks/ and ship with the npm
 * package (the package.json files entry includes .claude/**). The
 * install step copies them into the user's project .claude/hooks/.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, chmodSync, unlinkSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Script filenames in .claude/hooks/ — the "legacy" one is the Phase 20
// SessionStart hook; the others are the prefetch + auto-save layer.
const LEGACY_HOOK_NAME = 'wellinformed-hook.sh';
const SMART_HOOK_SH = 'wellinformed-smart-hook.sh';
const SMART_HOOK_CJS = 'wellinformed-smart-hook.cjs';
const POST_FETCH_SH = 'wellinformed-post-fetch.sh';
const POST_FETCH_CJS = 'wellinformed-post-fetch.cjs';

const BUNDLED_SCRIPTS = [SMART_HOOK_SH, SMART_HOOK_CJS, POST_FETCH_SH, POST_FETCH_CJS] as const;

// Every script name that this installer owns. Used by the settings.json
// dedupe filter so re-running `claude install` doesn't stack entries.
const OWNED_SCRIPT_NAMES = [
  LEGACY_HOOK_NAME,
  ...BUNDLED_SCRIPTS,
];

// Back-compat alias kept for test suites that grep this module's source
// for the string 'HOOK_SCRIPT_NAME'. Still true semantically — the legacy
// hook script is the original "the hook script" until v2.1 split it out.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const HOOK_SCRIPT_NAME = LEGACY_HOOK_NAME;
void HOOK_SCRIPT_NAME;

/** Absolute path to the .claude/hooks/ directory bundled with the installed
 * wellinformed package. When running from source, resolves to the repo's
 * own .claude/hooks/. When running from node_modules, resolves to the
 * installed package's .claude/hooks/ (shipped via the "files" entry). */
const bundledHooksDir = (): string => {
  // This file compiles to dist/cli/commands/claude-install.js. Walk up
  // three levels (commands → cli → dist → pkg root) then into .claude/hooks.
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..', '..', '.claude', 'hooks');
};

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

// PreToolUse smart-prefetch hook — fires before Glob/Grep/Read/WebSearch/
// WebFetch. Extracts the query and runs `wellinformed ask --json` against
// the graph; top-3 hits get injected into Claude's context so the outbound
// tool call is usually unnecessary. Zero hits are logged for later ingest.
const HOOK_CONFIG_PRE_TOOL_USE = {
  matcher: 'Glob|Grep|Read|WebSearch|WebFetch',
  hooks: [
    {
      type: 'command',
      command: `sh -c 'exec sh "\${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/${SMART_HOOK_SH}"'`,
      timeout: 5000,
    },
  ],
};

// PostToolUse auto-save hook — fires after WebSearch/WebFetch. Captures
// the tool result and files it as a `source` note in the research-inbox
// room, embedded + BM25-indexed, so the next query hits the graph
// instead of the network.
const HOOK_CONFIG_POST_TOOL_USE = {
  matcher: 'WebSearch|WebFetch',
  hooks: [
    {
      type: 'command',
      command: `sh -c 'exec sh "\${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/${POST_FETCH_SH}"'`,
      timeout: 10000,
    },
  ],
};

// SessionStart hook — recent-sessions summary (Phase 20). Uses the
// legacy combo script with CLAUDE_HOOK_EVENT=SessionStart so the script
// takes its SessionStart branch.
const HOOK_CONFIG_SESSION_START = {
  hooks: [
    {
      type: 'command',
      command: `sh -c 'CLAUDE_HOOK_EVENT=SessionStart exec sh "\${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/${LEGACY_HOOK_NAME}"'`,
      timeout: 5000,
    },
  ],
};

const CLAUDE_MD_SECTION = `
# wellinformed
wellinformed is a knowledge-graph-first research layer. A PreToolUse hook
prefetches the graph before Glob/Grep/Read/WebSearch/WebFetch and injects
top matches into your context. A PostToolUse hook auto-saves WebSearch /
WebFetch results to the \`research-inbox\` room so the graph absorbs
everything you learn from the web.

When you get a question about research, architecture, dependencies, or
"what did I read about X":
1. Use the wellinformed MCP tools (\`search\`, \`ask\`, \`get_node\`,
   \`get_neighbors\`) BEFORE outbound lookups.
2. The graph contains indexed ArXiv papers, HN stories, RSS posts, your
   codebase, dependencies, git history, and prior web research.
3. \`search\` / \`ask\` take a query string and optional room filter.
4. \`find_tunnels\` surfaces surprising connections across domains.
5. \`trigger_room\` refreshes a room's data on demand.
6. After reasoning through an external result, use
   \`wellinformed save --type synthesis --room <room>\` to file the
   distilled insight alongside the raw source node the auto-save hook
   already captured.
`;

const CLAUDE_MD_MARKER_START = '<!-- wellinformed:start -->';
const CLAUDE_MD_MARKER_END = '<!-- wellinformed:end -->';

// ─────────────── install ────────────────

const install = (projectDir: string): number => {
  const claudeDir = join(projectDir, '.claude');
  const hooksDir = join(claudeDir, 'hooks');
  const settingsPath = join(claudeDir, 'settings.json');
  const claudeMdPath = join(projectDir, 'CLAUDE.md');

  // 1. Write / copy hook scripts
  mkdirSync(hooksDir, { recursive: true });

  // 1a. Legacy combo script (inline, unchanged — still handles SessionStart).
  const legacyHookPath = join(hooksDir, LEGACY_HOOK_NAME);
  writeFileSync(legacyHookPath, HOOK_SCRIPT, { mode: 0o755 });
  console.log(`  wrote ${legacyHookPath}`);

  // 1b. Smart prefetch + auto-save scripts, copied from the bundled package.
  const srcDir = bundledHooksDir();
  for (const name of BUNDLED_SCRIPTS) {
    const src = join(srcDir, name);
    const dst = join(hooksDir, name);
    if (!existsSync(src)) {
      console.error(`  warning: bundled hook missing — ${src}. Skipping.`);
      continue;
    }
    copyFileSync(src, dst);
    chmodSync(dst, 0o755);
    console.log(`  wrote ${dst}`);
  }

  // 2. Wire settings.json
  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    } catch {
      console.error(`  warning: could not parse ${settingsPath}, creating fresh`);
    }
  }

  const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;

  // dedupe filter — any owned script name is a wellinformed entry
  const isOwned = (h: unknown): boolean => {
    const s = JSON.stringify(h);
    return OWNED_SCRIPT_NAMES.some((name) => s.includes(name));
  };

  const preToolUse = Array.isArray(hooks.PreToolUse) ? hooks.PreToolUse : [];
  hooks.PreToolUse = [...preToolUse.filter((h) => !isOwned(h)), HOOK_CONFIG_PRE_TOOL_USE];

  const postToolUse = Array.isArray(hooks.PostToolUse) ? hooks.PostToolUse : [];
  hooks.PostToolUse = [...postToolUse.filter((h) => !isOwned(h)), HOOK_CONFIG_POST_TOOL_USE];

  const sessionStart = Array.isArray(hooks.SessionStart) ? hooks.SessionStart : [];
  hooks.SessionStart = [...sessionStart.filter((h) => !isOwned(h)), HOOK_CONFIG_SESSION_START];

  settings.hooks = hooks;
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  console.log(`  updated ${settingsPath} (PreToolUse + PostToolUse + SessionStart wired)`);

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
  const hooksDir = join(claudeDir, 'hooks');

  // 1. Remove every hook script we own
  for (const name of OWNED_SCRIPT_NAMES) {
    const p = join(hooksDir, name);
    if (existsSync(p)) {
      unlinkSync(p);
      console.log(`  removed ${p}`);
    }
  }

  // 2. Remove PreToolUse / PostToolUse / SessionStart entries referencing
  // any owned script name.
  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
      const hooks = settings.hooks ?? {};
      const isOwned = (h: unknown): boolean => {
        const s = JSON.stringify(h);
        return OWNED_SCRIPT_NAMES.some((name) => s.includes(name));
      };
      let changed = false;
      for (const key of ['PreToolUse', 'PostToolUse', 'SessionStart'] as const) {
        if (Array.isArray(hooks[key])) {
          hooks[key] = hooks[key].filter((h: unknown) => !isOwned(h));
          changed = true;
        }
      }
      if (changed) {
        settings.hooks = hooks;
        writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        console.log(`  updated ${settingsPath} (hooks removed)`);
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
