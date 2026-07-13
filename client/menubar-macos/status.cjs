#!/usr/bin/env node
/**
 * Status probe for the folklore menubar client.
 *
 * Emits a compact snapshot of the local node — daemon state, connected
 * peers, standing roster, contribution ledger, and graph size — as a single
 * JSON object written to ~/.folklore/menubar-status.json (and echoed to
 * stdout). The Swift menubar reads the cache file natively so opening the
 * menu never blocks on a Node boot or a graph parse.
 *
 * The graph node/edge count is the only expensive read (graph.json can be
 * hundreds of MB), so it is memoised against the file's mtime: re-parsed only
 * when the graph actually changed, served from menubar-status.json otherwise.
 *
 * Best-effort throughout — every read is guarded; a missing or malformed file
 * degrades to a zero/unknown field rather than throwing.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const HOME = process.env.FOLKLORE_HOME || path.join(os.homedir(), '.folklore');
const CACHE = path.join(HOME, 'menubar-status.json');

const readJson = (p) => {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
};

/** Daemon liveness via pid existence check — 'on' | 'stale' | 'off'. */
const daemonState = () => {
  const pidPath = path.join(HOME, 'daemon.pid');
  if (!fs.existsSync(pidPath)) return { state: 'off', pid: null };
  try {
    const pid = parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10);
    process.kill(pid, 0);
    return { state: 'on', pid };
  } catch {
    return { state: 'stale', pid: null };
  }
};

/** Latest `connected_peers=N` the daemon logged — the live P2P link count. */
const connectedPeers = () => {
  const logPath = path.join(HOME, 'daemon.log');
  try {
    const stat = fs.statSync(logPath);
    // Only tail the last 64 KiB — the log grows unbounded and we just need
    // the most recent connected_peers marker.
    const size = stat.size;
    const start = Math.max(0, size - 65_536);
    const fd = fs.openSync(logPath, 'r');
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    const matches = buf.toString('utf8').match(/connected_peers=(\d+)/g);
    if (!matches || matches.length === 0) return 0;
    const last = matches[matches.length - 1];
    return parseInt(last.split('=')[1], 10) || 0;
  } catch {
    return 0;
  }
};

/** Standing peer roster (who we know about), distinct from live links. */
const rosterCount = () => {
  const peers = readJson(path.join(HOME, 'peers.json'));
  return peers && Array.isArray(peers.peers) ? peers.peers.length : 0;
};

/** Outbound contribution ledger — reputation + peers helped + last serve. */
const contribution = () => {
  const c = readJson(path.join(HOME, 'contribution.json'));
  if (!c) return { reputation: 0, peers_helped: 0, last_served_peer: null, last_served_ago_ms: null };
  const helped = Array.isArray(c.peers_helped) ? c.peers_helped.length : 0;
  const ago = c.last_served_at ? Date.now() - Date.parse(c.last_served_at) : null;
  return {
    reputation: c.reputation || 0,
    peers_helped: helped,
    last_served_peer: labelPeer(c.last_served_peer),
    last_served_ago_ms: Number.isFinite(ago) ? ago : null,
  };
};

/** Resolve a peer-id → @handle via peer-labels.json, else short slice. */
let labelsCache;
const labelPeer = (peerId) => {
  if (!peerId) return null;
  if (labelsCache === undefined) {
    const l = readJson(path.join(HOME, 'peer-labels.json'));
    labelsCache = l && l.peers ? l.peers : {};
  }
  const gh = labelsCache[peerId] && labelsCache[peerId].github;
  return gh ? `@${gh}` : `peer:${String(peerId).slice(0, 8)}`;
};

/**
 * Graph node/edge count, memoised against graph.json's mtime. Re-parses only
 * when the graph changed since the last cached snapshot — otherwise the prior
 * count is reused so a huge unchanged graph costs nothing.
 */
const graphStats = (prevCache) => {
  const graphPath = path.join(HOME, 'graph.json');
  let mtimeMs = 0;
  try {
    mtimeMs = fs.statSync(graphPath).mtimeMs;
  } catch {
    return { nodes: 0, edges: 0, graph_mtime: 0 };
  }
  if (prevCache && prevCache.graph_mtime === mtimeMs && typeof prevCache.nodes === 'number') {
    return { nodes: prevCache.nodes, edges: prevCache.edges || 0, graph_mtime: mtimeMs };
  }
  const g = readJson(graphPath);
  const nodes = g && Array.isArray(g.nodes) ? g.nodes.length : 0;
  const edges = g && Array.isArray(g.links) ? g.links.length : 0;
  return { nodes, edges, graph_mtime: mtimeMs };
};

/** Vector count estimate from vectors.db size (~1.6 KB/row), no sqlite spawn. */
const vectorEstimate = () => {
  try {
    const stat = fs.statSync(path.join(HOME, 'vectors.db'));
    return Math.max(1, Math.floor(stat.size / 1600));
  } catch {
    return 0;
  }
};

const identity = () => {
  const linked = readJson(path.join(HOME, 'linked-accounts.json'));
  const gh = linked && linked.accounts && linked.accounts.github;
  if (gh && gh.handle) return `@${gh.handle}`;
  return null;
};

const main = () => {
  const prev = readJson(CACHE);
  const d = daemonState();
  const g = graphStats(prev);
  const snapshot = {
    ts: new Date().toISOString(),
    daemon: d.state,
    pid: d.pid,
    peers_connected: connectedPeers(),
    peers_roster: rosterCount(),
    nodes: g.nodes,
    edges: g.edges,
    graph_mtime: g.graph_mtime,
    vectors: vectorEstimate(),
    identity: identity(),
    ...contribution(),
  };
  const out = JSON.stringify(snapshot);
  try {
    fs.writeFileSync(CACHE, out);
  } catch {
    /* stdout is still authoritative */
  }
  process.stdout.write(out + '\n');
};

main();
