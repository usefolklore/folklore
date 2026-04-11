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
# wellinformed PreToolUse hook — reminds Claude that the knowledge graph exists.
# Fires before Glob, Grep, Read. If graph.json is present, inject a context hint.
GRAPH="\${WELLINFORMED_HOME:-$HOME/.wellinformed}/graph.json"
if [ -f "$GRAPH" ]; then
  NODES=$(grep -c '"id"' "$GRAPH" 2>/dev/null || echo 0)
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"wellinformed: Knowledge graph exists ('"$NODES"' nodes). Before searching raw files, consider using the wellinformed MCP tools: search (semantic k-NN), ask (search + context assembly), get_node (lookup by ID), get_neighbors (graph traversal). These return your indexed research + codebase + external sources in one query."}}'
fi
`;

const HOOK_CONFIG = {
  matcher: 'Glob|Grep|Read',
  hooks: [
    {
      type: 'command',
      command: `sh -c 'exec sh "\${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/${HOOK_SCRIPT_NAME}"'`,
      timeout: 3000,
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
  const preToolUse = Array.isArray(hooks.PreToolUse) ? hooks.PreToolUse : [];

  // Remove any existing wellinformed hook
  const filtered = preToolUse.filter(
    (h) => !JSON.stringify(h).includes(HOOK_SCRIPT_NAME),
  );
  filtered.push(HOOK_CONFIG);
  hooks.PreToolUse = filtered;
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

  // 2. Remove from settings.json
  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
      const hooks = settings.hooks ?? {};
      if (Array.isArray(hooks.PreToolUse)) {
        hooks.PreToolUse = hooks.PreToolUse.filter(
          (h: unknown) => !JSON.stringify(h).includes(HOOK_SCRIPT_NAME),
        );
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
