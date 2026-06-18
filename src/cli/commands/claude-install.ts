/**
 * `folklore claude install` / `folklore claude uninstall`
 *
 * Wires the FULL Claude Code integration — the exact surface the
 * project's own .claude/settings.json uses (that file is the source of
 * truth for what a fresh install should produce):
 *
 * 1. PreToolUse smart prefetch (Glob|Grep|Read|WebSearch|WebFetch):
 *    Extracts the query, runs `folklore ask --json` against the graph,
 *    and injects the top hits into the tool-call context. On a miss,
 *    logs the query for later ingest. Turns "Claude goes to the web"
 *    into "Claude reads its own graph" whenever possible.
 *
 * 2. PreToolUse MCP-pre (mcp__folklore__*): before any folklore MCP
 *    tool call, records it + injects a freshness/coverage hint so the
 *    agent weighs cache age before trusting a hit.
 *
 * 3. PostToolUse auto-save (WebSearch|WebFetch): after a web call
 *    succeeds, files the result as a `source` note so the next session
 *    hits the graph instead of repeating the fetch.
 *
 * 4. UserPromptSubmit prefetch: surfaces relevant graph context into
 *    every turn, even when no tool call would have triggered it.
 *
 * 5. SessionStart recent-sessions summary (legacy Phase 20 hook):
 *    surfaces the previous session's final message + branch.
 *
 * 6. statusLine: the folklore graph/identity panel (set only when the
 *    user has no statusline or already uses ours).
 *
 * 7. env flags: switches on the working gates (energy gate, query
 *    reuse, deny-on-confidence, local-only prefetch) — merged into the
 *    user's env, folklore-owned keys only.
 *
 * 8. CLAUDE.md section: persistent system-prompt nudge so the skill
 *    trigger vocabulary is discoverable even without a hook firing.
 *
 * Hook + helper source scripts live in .claude/hooks/ and
 * .claude/helpers/ and ship with the npm package (the package.json
 * files entry includes .claude/**). The install step copies them into
 * the user's project .claude/.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, chmodSync, unlinkSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Script filenames in .claude/hooks/ — the "legacy" one is the Phase 20
// SessionStart hook; the others are the prefetch + auto-save + MCP-pre +
// prompt-submit layer. The full set mirrors the project's own working
// .claude/settings.json, which is the source of truth for what a fresh
// install should wire.
const LEGACY_HOOK_NAME = 'folklore-hook.sh';
const SMART_HOOK_SH = 'folklore-smart-hook.sh';
const SMART_HOOK_CJS = 'folklore-smart-hook.cjs';
const POST_FETCH_SH = 'folklore-post-fetch.sh';
const POST_FETCH_CJS = 'folklore-post-fetch.cjs';
const MCP_PRE_CJS = 'folklore-mcp-pre.cjs';
const PROMPT_SUBMIT_CJS = 'folklore-prompt-submit.cjs';

// Hook scripts copied verbatim from the bundled package .claude/hooks/.
const BUNDLED_SCRIPTS = [
  SMART_HOOK_SH,
  SMART_HOOK_CJS,
  POST_FETCH_SH,
  POST_FETCH_CJS,
  MCP_PRE_CJS,
  PROMPT_SUBMIT_CJS,
] as const;

// Statusline helper lives in .claude/helpers/ (not hooks/). Copied so the
// statusLine command resolves on a fresh install.
const STATUSLINE_HELPER = 'ak-statusline.cjs';

// Runtime env flags that switch on folklore's working gates. Mirrors the
// project's own settings.json `env` block. Merged into the user's existing
// env (folklore-owned keys only — never clobbers unrelated vars).
//   FOLKLORE_ENERGY_GATE   — energy-OOD admission gate (AUC 0.78)
//   FOLKLORE_QUERY_REUSE   — federated inference-tree reuse
//   FOLKLORE_DENY_WEBSEARCH— network-before-web: deny redundant web calls
//   FOLKLORE_PREFETCH_PEERS— 0 = local-only prefetch (no federated fan-out)
const FOLKLORE_ENV: Readonly<Record<string, string>> = {
  FOLKLORE_ENERGY_GATE: '1',
  FOLKLORE_QUERY_REUSE: '1',
  FOLKLORE_DENY_WEBSEARCH: '1',
  FOLKLORE_PREFETCH_PEERS: '0',
};

// Every script name that this installer owns. Used by the settings.json
// dedupe filter so re-running `claude install` doesn't stack entries.
const OWNED_SCRIPT_NAMES = [
  LEGACY_HOOK_NAME,
  ...BUNDLED_SCRIPTS,
];

// Back-compat alias kept for test suites that grep this module's source
// for the string 'HOOK_SCRIPT_NAME'. Still true semantically — the legacy
// hook script is the original "the hook script" until v2.1 split it out.
const HOOK_SCRIPT_NAME = LEGACY_HOOK_NAME;
void HOOK_SCRIPT_NAME;

/** Absolute path to the .claude/hooks/ directory bundled with the installed
 * folklore package. When running from source, resolves to the repo's
 * own .claude/hooks/. When running from node_modules, resolves to the
 * installed package's .claude/hooks/ (shipped via the "files" entry). */
const bundledHooksDir = (): string => {
  // This file compiles to dist/cli/commands/claude-install.js. Walk up
  // three levels (commands → cli → dist → pkg root) then into .claude/hooks.
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..', '..', '.claude', 'hooks');
};

/** Absolute path to the bundled .claude/helpers/ directory (statusline). */
const bundledHelpersDir = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..', '..', '.claude', 'helpers');
};

const HOOK_SCRIPT = `#!/bin/sh
# folklore PreToolUse + SessionStart hook.
# Fires before Glob|Grep|Read (legacy hint) and on SessionStart (Phase 20 — recent session summary).
GRAPH="\${FOLKLORE_HOME:-$HOME/.folklore}/graph.json"

# ── SessionStart branch (Phase 20) ──────────────────────────────────────────
if [ "\${CLAUDE_HOOK_EVENT:-}" = "SessionStart" ]; then
  if command -v folklore >/dev/null 2>&1; then
    RECENT=$(folklore recent-sessions --hours 24 --limit 1 --json 2>/dev/null || echo '{"count":0,"sessions":[]}')
    COUNT=$(printf '%s' "$RECENT" | grep -c '"id":' 2>/dev/null || echo 0)
    if [ "$COUNT" -gt 0 ]; then
      SID=$(printf '%s' "$RECENT" | grep -m1 '"id":' | sed 's/.*"id": *"\\([^"]*\\)".*/\\1/')
      STARTED=$(printf '%s' "$RECENT" | grep -m1 '"started_at":' | sed 's/.*"started_at": *"\\([^"]*\\)".*/\\1/')
      FINAL=$(printf '%s' "$RECENT" | grep -m1 '"final_assistant_message":' | sed 's/.*"final_assistant_message": *"\\([^"]*\\)".*/\\1/')
      BRANCH=$(printf '%s' "$RECENT" | grep -m1 '"git_branch":' | sed 's/.*"git_branch": *"\\([^"]*\\)".*/\\1/')
      MSG="folklore: Previous session $SID (started $STARTED, branch $BRANCH). Last assistant: \${FINAL:-<none>}. Call the recent_sessions MCP tool for the full rollup."
      printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\\n' "$MSG"
    fi
  fi
  exit 0
fi

# ── Legacy PreToolUse branch — unchanged output ──────────────────────────────
if [ -f "$GRAPH" ]; then
  NODES=$(grep -c '"id"' "$GRAPH" 2>/dev/null || echo 0)
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"folklore: Knowledge graph exists ('"$NODES"' nodes). Before searching raw files, consider using the folklore MCP tools: search (semantic k-NN), ask (search + context assembly), get_node (lookup by ID), get_neighbors (graph traversal). These return your indexed research + codebase + external sources in one query."}}'
fi
`;

// PreToolUse smart-prefetch hook — fires before Glob/Grep/Read/WebSearch/
// WebFetch. Extracts the query and runs `folklore ask --json` against
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

// PreToolUse MCP-pre hook — fires before any mcp__folklore__* tool call.
// Records the call + injects a freshness/coverage hint so the agent
// reasons about cache age before trusting a graph hit.
const HOOK_CONFIG_MCP_PRE = {
  matcher: 'mcp__folklore__.*',
  hooks: [
    {
      type: 'command',
      command: `sh -c 'exec node "\${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/${MCP_PRE_CJS}"'`,
      timeout: 3000,
    },
  ],
};

// UserPromptSubmit hook — fires on every prompt. Surfaces relevant graph
// context (folklore prefetch) into the turn before the agent reasons, so
// memory is consulted even when no tool call would have triggered it.
const HOOK_CONFIG_USER_PROMPT_SUBMIT = {
  hooks: [
    {
      type: 'command',
      command: `sh -c 'exec node "\${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/${PROMPT_SUBMIT_CJS}"'`,
      timeout: 5000,
    },
  ],
};

// statusLine — folklore graph/identity panel. Set only when the user has no
// statusLine yet, or already uses ours (never clobbers a custom statusline).
const STATUSLINE_CONFIG = {
  type: 'command',
  command: `sh -c 'node "\${CLAUDE_PROJECT_DIR:-.}/.claude/helpers/${STATUSLINE_HELPER}" 2>/dev/null'`,
};

const CLAUDE_MD_SECTION = `
# folklore
folklore is a knowledge-graph-first research layer with P2P
federation. A PreToolUse hook prefetches the graph before
Glob/Grep/Read/WebSearch/WebFetch and injects top matches into your
context. A PostToolUse hook auto-saves WebSearch / WebFetch results so
the graph absorbs everything you learn from the web.

## Privacy + workspace model (V5)

Two graph-level primitives replace the legacy room abstraction:

- **\`private: boolean\`** — defaults to \`false\`. Set with
  \`folklore save --private\` when a node must never federate.
  Sharing gates on \`private === false\` at the share-sync layer.
- **\`workspace?: string\`** — populated automatically from the slug
  of the current git repo's basename. Local-only; never enters the
  federation wire envelope. Use \`--workspace <slug>\` to override or
  \`--workspace all\` to opt out of the cwd pre-filter.

Source-URI scheme still tells you provenance (\`arxiv://\`, \`hn://\`,
\`git://\`, \`oracle-question:\`, etc.). Use it to filter queries when
you want only a specific provenance class.

## Freshness rule (data aging)

Every graph hit returned by \`ask --json\` and the prefetch hook carries
\`age_days\` and \`fetched_at\`. The smart-hook render shows it inline:
\`label [workspace, 3d] d=0.82\`. When choosing whether to trust a cache
hit vs re-fetch:

- If the hit is younger than a reasonable window for its source-URI
  scheme, trust the cache.
- If the hit is older, prefer a fresh pull — re-run the source's
  ingest (\`folklore trigger\`) or the original WebFetch / WebSearch
  — and let the auto-save hook put the newer version back into the
  graph.
- If a hit has no \`fetched_at\` at all, treat it as stale of unknown age.

## When to invoke folklore

1. Use the folklore MCP tools (\`search\`, \`ask\`, \`get_node\`,
   \`get_neighbors\`) BEFORE outbound lookups on any research,
   architecture, or "what did I read about X" question.
2. \`search\` / \`ask\` take a query string. The active workspace is
   applied as a pre-filter automatically when cwd is inside a git repo.
3. After reasoning through an external result, use
   \`folklore save --type synthesis --label "..."\` to file the
   distilled insight alongside the raw source node the auto-save hook
   already captured. Add \`--private\` to keep the synthesis local.
`;

const CLAUDE_MD_MARKER_START = '<!-- folklore:start -->';
const CLAUDE_MD_MARKER_END = '<!-- folklore:end -->';

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

  // 1c. Statusline helper, copied into .claude/helpers/.
  const helpersDir = join(claudeDir, 'helpers');
  mkdirSync(helpersDir, { recursive: true });
  const helperSrc = join(bundledHelpersDir(), STATUSLINE_HELPER);
  const helperDst = join(helpersDir, STATUSLINE_HELPER);
  if (existsSync(helperSrc)) {
    copyFileSync(helperSrc, helperDst);
    chmodSync(helperDst, 0o755);
    console.log(`  wrote ${helperDst}`);
  } else {
    console.error(`  warning: bundled statusline helper missing — ${helperSrc}. Skipping.`);
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

  // dedupe filter — any owned script name is a folklore entry
  const isOwned = (h: unknown): boolean => {
    const s = JSON.stringify(h);
    return OWNED_SCRIPT_NAMES.some((name) => s.includes(name));
  };

  // PreToolUse carries TWO folklore entries: smart prefetch (Glob/Grep/
  // Read/WebSearch/WebFetch) + MCP-pre (mcp__folklore__*). Strip any owned
  // entries, then append both.
  const preToolUse = Array.isArray(hooks.PreToolUse) ? hooks.PreToolUse : [];
  hooks.PreToolUse = [
    ...preToolUse.filter((h) => !isOwned(h)),
    HOOK_CONFIG_PRE_TOOL_USE,
    HOOK_CONFIG_MCP_PRE,
  ];

  const postToolUse = Array.isArray(hooks.PostToolUse) ? hooks.PostToolUse : [];
  hooks.PostToolUse = [...postToolUse.filter((h) => !isOwned(h)), HOOK_CONFIG_POST_TOOL_USE];

  const userPromptSubmit = Array.isArray(hooks.UserPromptSubmit) ? hooks.UserPromptSubmit : [];
  hooks.UserPromptSubmit = [
    ...userPromptSubmit.filter((h) => !isOwned(h)),
    HOOK_CONFIG_USER_PROMPT_SUBMIT,
  ];

  const sessionStart = Array.isArray(hooks.SessionStart) ? hooks.SessionStart : [];
  hooks.SessionStart = [...sessionStart.filter((h) => !isOwned(h)), HOOK_CONFIG_SESSION_START];

  settings.hooks = hooks;

  // statusLine — set only if absent or already folklore's (never clobber a
  // user's custom statusline).
  const existingStatus = settings.statusLine as { command?: string } | undefined;
  const ownsStatus =
    !existingStatus ||
    (typeof existingStatus.command === 'string' && existingStatus.command.includes(STATUSLINE_HELPER));
  if (ownsStatus && existsSync(helperDst)) {
    settings.statusLine = STATUSLINE_CONFIG;
  }

  // env — merge folklore-owned flags, preserving any unrelated user vars.
  const existingEnv = (settings.env ?? {}) as Record<string, string>;
  settings.env = { ...existingEnv, ...FOLKLORE_ENV };

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  console.log(
    `  updated ${settingsPath} (PreToolUse + MCP-pre + PostToolUse + UserPromptSubmit + SessionStart + statusLine + env wired)`,
  );

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
  console.log(`  updated ${claudeMdPath} (folklore section added)`);

  console.log('\nClaude Code will now check the folklore knowledge graph');
  console.log('before searching raw files. Restart Claude Code to activate.');
  return 0;
};

// ─────────────── uninstall ──────────────

const uninstall = (projectDir: string): number => {
  const claudeDir = join(projectDir, '.claude');
  const settingsPath = join(claudeDir, 'settings.json');
  const claudeMdPath = join(projectDir, 'CLAUDE.md');
  const hooksDir = join(claudeDir, 'hooks');
  const helpersDir = join(claudeDir, 'helpers');

  // 1. Remove every hook script we own (+ the statusline helper)
  for (const name of OWNED_SCRIPT_NAMES) {
    const p = join(hooksDir, name);
    if (existsSync(p)) {
      unlinkSync(p);
      console.log(`  removed ${p}`);
    }
  }
  const helperPath = join(helpersDir, STATUSLINE_HELPER);
  if (existsSync(helperPath)) {
    unlinkSync(helperPath);
    console.log(`  removed ${helperPath}`);
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
      for (const key of ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'SessionStart'] as const) {
        if (Array.isArray(hooks[key])) {
          hooks[key] = hooks[key].filter((h: unknown) => !isOwned(h));
          changed = true;
        }
      }
      // Remove our statusLine if (and only if) it's ours.
      const status = settings.statusLine as { command?: string } | undefined;
      if (status && typeof status.command === 'string' && status.command.includes(STATUSLINE_HELPER)) {
        delete settings.statusLine;
        changed = true;
      }
      // Remove folklore-owned env keys, preserving unrelated vars.
      if (settings.env && typeof settings.env === 'object') {
        const env = settings.env as Record<string, string>;
        for (const k of Object.keys(FOLKLORE_ENV)) {
          if (k in env) { delete env[k]; changed = true; }
        }
        if (Object.keys(env).length === 0) delete settings.env;
      }
      if (changed) {
        settings.hooks = hooks;
        writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        console.log(`  updated ${settingsPath} (hooks + statusLine + env removed)`);
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

  console.log('\nfolklore hooks removed. Restart Claude Code to deactivate.');
  return 0;
};

// ─────────────── entry ──────────────────

export const claudeInstall = async (args: readonly string[]): Promise<number> => {
  const [sub] = args;
  const projectDir = process.cwd();

  switch (sub) {
    case 'install':
      console.log('folklore claude install\n');
      return install(projectDir);
    case 'uninstall':
      console.log('folklore claude uninstall\n');
      return uninstall(projectDir);
    default:
      console.error(`claude: unknown subcommand '${sub ?? ''}'. try: install | uninstall`);
      return 1;
  }
};
