#!/usr/bin/env node
/**
 * wellinformed status line for Claude Code.
 *
 * Shows real-time knowledge graph stats in the Claude Code status bar.
 * Reads directly from ~/.wellinformed/ files — no server needed.
 *
 * Output format (ANSI colored):
 * ┃ wellinformed • homelab │ 📊 154 nodes  30 edges │ 🔍 154 vectors │ 📡 4 sources │ 🏠 1 room │ 🤖 MCP 11 tools
 *
 * Performance: reads 3 small JSON files, no spawns, < 50ms.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const HOME = process.env.WELLINFORMED_HOME || path.join(require('os').homedir(), '.wellinformed');

// Repo-derived room: basename of the git toplevel for the current
// working directory (CLAUDE_PROJECT_DIR wins, then cwd). Slugified to
// match the room-id alphabet (lowercase alnum + hyphen). Returns null
// outside a git repo so the caller can fall back to registry default.
function getRepoRoom() {
  const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  try {
    const top = execSync('git rev-parse --show-toplevel', {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
      timeout: 500,
    }).trim();
    if (!top) return null;
    const slug = path.basename(top)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 63);
    return slug || null;
  } catch {
    return null;
  }
}

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[0;32m',
  yellow: '\x1b[0;33m',
  blue: '\x1b[0;34m',
  purple: '\x1b[0;35m',
  cyan: '\x1b[0;36m',
  brightGreen: '\x1b[1;32m',
  brightCyan: '\x1b[1;36m',
  brightPurple: '\x1b[1;35m',
  brightYellow: '\x1b[1;33m',
  brightWhite: '\x1b[1;37m',
  orange: '\x1b[38;5;208m',
};

function readJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function getGraphStats() {
  const graph = readJson(path.join(HOME, 'graph.json'));
  if (!graph) return { nodes: 0, edges: 0, rooms: new Set() };
  const nodes = Array.isArray(graph.nodes) ? graph.nodes.length : 0;
  const edges = Array.isArray(graph.links) ? graph.links.length : 0;
  const rooms = new Set();
  if (Array.isArray(graph.nodes)) {
    for (const n of graph.nodes) {
      if (n.room) rooms.add(n.room);
    }
  }
  return { nodes, edges, rooms };
}

function getVectorCount() {
  // Check if vectors.db exists and get its size as proxy
  const dbPath = path.join(HOME, 'vectors.db');
  if (!fs.existsSync(dbPath)) return 0;
  try {
    const stat = fs.statSync(dbPath);
    // Rough estimate: each vector row ≈ 1.6KB (384 floats × 4 bytes + metadata)
    // More accurate count would need sqlite but we avoid spawns for speed
    return Math.max(1, Math.floor(stat.size / 1600));
  } catch {
    return 0;
  }
}

function getSourceCount() {
  const sources = readJson(path.join(HOME, 'sources.json'));
  if (!Array.isArray(sources)) return 0;
  return sources.filter(s => s.enabled !== false).length;
}

function getRoomInfo() {
  const registry = readJson(path.join(HOME, 'rooms.json'));
  if (!registry || !Array.isArray(registry.rooms)) return { count: 0, default: null };
  return {
    count: registry.rooms.length,
    default: registry.default_room || (registry.rooms[0] ? registry.rooms[0].id : null),
  };
}

function getDaemonStatus() {
  const pidPath = path.join(HOME, 'daemon.pid');
  if (!fs.existsSync(pidPath)) return 'off';
  try {
    const pid = parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10);
    process.kill(pid, 0); // existence check
    return 'on';
  } catch {
    return 'stale';
  }
}

function getLastTrigger() {
  // Check daemon.log for last tick timestamp
  const logPath = path.join(HOME, 'daemon.log');
  if (!fs.existsSync(logPath)) return null;
  try {
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.trim().split('\n');
    const last = lines[lines.length - 1];
    const match = last.match(/^\[([^\]]+)\]/);
    if (match) {
      const d = new Date(match[1]);
      const now = Date.now();
      const ago = Math.floor((now - d.getTime()) / 60000);
      if (ago < 60) return `${ago}m ago`;
      if (ago < 1440) return `${Math.floor(ago / 60)}h ago`;
      return `${Math.floor(ago / 1440)}d ago`;
    }
  } catch {}
  return null;
}

function getLastFederation() {
  // Reads ~/.wellinformed/prefetch-cache.jsonl — written by the
  // UserPromptSubmit + mcp-pre hooks every time wellinformed
  // federates. Shows the latest verdict in the status bar
  // persistently — the watcher can always see what wellinformed
  // last reported, even when Claude Code's TUI folds the hook's
  // additionalContext into a (ctrl+o to expand) collapse.
  //
  // Returned object: { ageMs, peers_responded, peers_queried,
  //   satisfaction, terminal, query }
  const cachePath = path.join(HOME, 'prefetch-cache.jsonl');
  if (!fs.existsSync(cachePath)) return null;
  try {
    const raw = fs.readFileSync(cachePath, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    if (lines.length === 0) return null;
    const entry = JSON.parse(lines[lines.length - 1]);
    const ts = Date.parse(entry.ts);
    if (!Number.isFinite(ts)) return null;
    return {
      ageMs: Date.now() - ts,
      peers_responded: entry.peers_responded ?? 0,
      peers_queried: entry.peers_queried ?? 0,
      satisfaction: entry.satisfaction ?? null,
      terminal: entry.terminal === true,
      query: entry.query ?? '',
      took_ms: entry.took_ms ?? null,
      decision: entry.decision ?? null,
      top_peer: entry.top_peer ?? null,
    };
  } catch { return null; }
}

// Resolve a peer-id → @handle via peer-labels.json (same format
// as the prompt-submit hook). Falls back to a short peer-id slice.
let peerLabelsCache = null;
function formatPeerForStatusline(peerId) {
  if (!peerId) return null;
  if (peerLabelsCache === null) {
    try {
      const raw = fs.readFileSync(path.join(HOME, 'peer-labels.json'), 'utf8');
      peerLabelsCache = JSON.parse(raw)?.peers ?? {};
    } catch { peerLabelsCache = {}; }
  }
  const entry = peerLabelsCache[peerId];
  if (entry?.github) return `@${entry.github}`;
  return `peer:${String(peerId).slice(0, 8)}`;
}

function formatAge(ms) {
  if (ms < 1000) return 'just now';
  if (ms < 60_000) return Math.floor(ms / 1000) + 's ago';
  if (ms < 3_600_000) return Math.floor(ms / 60_000) + 'm ago';
  return Math.floor(ms / 3_600_000) + 'h ago';
}

function getNodeKindBreakdown(graphNodes) {
  const kinds = { code: 0, external: 0, dep: 0, git: 0 };
  if (!Array.isArray(graphNodes)) return kinds;
  for (const n of graphNodes) {
    const k = n.kind || n.file_type || '';
    const uri = n.source_uri || n.source_file || '';
    if (uri.startsWith('file://') || k === 'codebase') kinds.code++;
    else if (uri.startsWith('npm://') || k === 'package_deps') kinds.dep++;
    else if (uri.startsWith('git://') || k === 'git_log' || uri.startsWith('submodule://')) kinds.git++;
    else kinds.external++;
  }
  return kinds;
}

function main() {
  const graph = readJson(path.join(HOME, 'graph.json'));
  const graphStats = getGraphStats();
  const vectorEstimate = getVectorCount();
  const sourceCount = getSourceCount();
  const roomInfo = getRoomInfo();
  const daemonSt = getDaemonStatus();
  const lastTrigger = getLastTrigger();
  const kinds = getNodeKindBreakdown(graph ? graph.nodes : []);

  const parts = [];

  // Project name + room. Prefer the repo-derived room (basename of
  // `git rev-parse --show-toplevel` for the harness cwd) so the
  // statusline reflects the codebase you're actually in, not a stale
  // global default. Falls back to the registry default outside a repo.
  const repoRoom = getRepoRoom();
  const registryHasRepoRoom = repoRoom && Array.isArray(graph?.nodes)
    ? graphStats.rooms.has(repoRoom)
    : false;
  const roomLabel = repoRoom || roomInfo.default || 'no room';
  const roomMarker = repoRoom && !registryHasRepoRoom ? `${c.dim}*${c.reset}` : '';
  parts.push(`${c.brightPurple}Akashik${c.reset} ${c.dim}•${c.reset} ${c.cyan}${roomLabel}${c.reset}${roomMarker}`);

  // Node stats with kind breakdown
  const nodeStr = `${c.brightGreen}${graphStats.nodes}${c.reset} nodes`;
  const kindStr = graphStats.nodes > 0
    ? ` ${c.dim}(${c.reset}${c.blue}${kinds.code}${c.dim}code ${c.reset}${c.yellow}${kinds.external}${c.dim}ext ${c.reset}${c.purple}${kinds.dep}${c.dim}dep ${c.reset}${c.cyan}${kinds.git}${c.dim}git${c.reset}${c.dim})${c.reset}`
    : '';
  parts.push(`📊 ${nodeStr}${kindStr}  ${c.dim}${graphStats.edges}${c.reset} edges`);

  // Vectors
  parts.push(`🔍 ${c.brightCyan}~${vectorEstimate}${c.reset} vectors`);

  // Sources
  parts.push(`📡 ${c.brightYellow}${sourceCount}${c.reset} sources`);

  // Rooms
  const roomCountStr = `${c.orange}${roomInfo.count}${c.reset}`;
  parts.push(`🏠 ${roomCountStr} room${roomInfo.count !== 1 ? 's' : ''}`);

  // Daemon
  const daemonIcon = daemonSt === 'on' ? `${c.brightGreen}●${c.reset}` : `${c.dim}○${c.reset}`;
  const daemonStr = `daemon${daemonIcon}`;
  const triggerStr = lastTrigger ? ` ${c.dim}${lastTrigger}${c.reset}` : '';
  parts.push(`🤖 ${daemonStr}${triggerStr}`);

  // MCP
  parts.push(`${c.brightPurple}MCP${c.reset} ${c.dim}23 tools${c.reset}`);

  // Federation status — the persistent "Getting Informed" surface.
  // Always renders when there's a recent prefetch-cache entry (under
  // 5 min old); falls off after that to avoid stale banners.
  const fed = getLastFederation();
  if (fed && fed.ageMs < 5 * 60_000) {
    const peerStr = fed.peers_queried > 0
      ? `${c.brightCyan}${fed.peers_responded}/${fed.peers_queried}${c.reset} peers`
      : `${c.dim}local-only${c.reset}`;
    const confStr = fed.satisfaction != null
      ? ` ${c.dim}conf${c.reset} ${(fed.terminal ? c.brightGreen : c.yellow)}${fed.satisfaction.toFixed(2)}${c.reset}`
      : '';
    const latStr = fed.took_ms != null
      ? ` ${c.dim}${fed.took_ms}ms${c.reset}`
      : '';
    const decStr = fed.decision
      ? ` ${c.dim}→${c.reset} ${(fed.terminal ? c.brightGreen : c.yellow)}${fed.decision}${c.reset}`
      : '';
    const topPeerLabel = formatPeerForStatusline(fed.top_peer);
    const topStr = topPeerLabel
      ? ` ${c.dim}top${c.reset} ${c.brightPurple}${topPeerLabel}${c.reset}`
      : '';
    const qStr = fed.query
      ? ` ${c.dim}q${c.reset} "${fed.query.length > 32 ? fed.query.slice(0, 29) + '…' : fed.query}"`
      : '';
    const ageStr = ` ${c.dim}${formatAge(fed.ageMs)}${c.reset}`;
    parts.push(`${c.brightPurple}⌐${c.reset} ${peerStr}${confStr}${latStr}${decStr}${topStr}${qStr}${ageStr}`);
  }

  // Join with separators
  const line = parts.join(`  ${c.dim}│${c.reset}  `);
  process.stdout.write(line + '\n');
}

main();
