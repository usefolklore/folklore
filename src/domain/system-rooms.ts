/**
 * System-managed rooms — the out-of-the-box rooms every wellinformed
 * node carries and shares over P2P without user opt-in.
 *
 * Two rooms:
 *   toolshed  — the agent's capabilities: codebase nodes, skills, MCP
 *               tool descriptors, dependency graph, git history. This
 *               is "what can this peer do / what do they know how to
 *               do" — it's what lets another peer treat this one as a
 *               useful counterparty.
 *   research  — the agent's external reading: arxiv, hn, rss, web
 *               fetches, web searches, telegram captures. "What has
 *               this peer recently read about" — the epistemic surface.
 *
 * Design choices:
 *
 * 1. Virtual, not physical. A node's membership in toolshed/research is
 *    derived from its `source_uri` scheme, not set by a `room` field.
 *    A git commit tagged `room: wellinformed-dev` is STILL in toolshed.
 *    This avoids a schema migration and preserves the user's existing
 *    room taxonomy. Users still see the physical room in their graph;
 *    the system room is just a query-time lens over the same nodes.
 *
 * 2. Always shared. Both rooms are pinned into shared-rooms.json at
 *    boot, marked `shareable: true, systemManaged: true`. Unshare
 *    commands refuse to remove them. This is the always-available
 *    surface the P2P network relies on — every peer can touch the
 *    other's toolshed + research without negotiating individual rooms.
 *
 * 3. Age-gated. Each system room declares `staleAfterDays`. The touch
 *    responder sorts by `fetched_at DESC` before returning, and every
 *    node on the wire carries `fetched_at` (required, enforced by the
 *    remote-node validator). The initiator's LLM reads `age_days` off
 *    each hit and decides "trust the cache" vs "re-fetch fresh" per
 *    the rule documented in CLAUDE.md.
 *
 * No other rooms are system-managed. Every user room is negotiable —
 * opt-in for P2P sharing via the interactive `wellinformed share` TUI.
 */

import type { GraphNode } from './graph.js';

// ─────────────────────── types ────────────────────────────

export type SystemRoomName = 'toolshed' | 'research' | 'oracle';

export interface SystemRoomSpec {
  readonly name: SystemRoomName;
  readonly description: string;
  /** Node is stale when `now - fetched_at > staleAfterDays`. LLMs read this
   *  to decide whether a graph hit is fresh enough vs a re-fetch. */
  readonly staleAfterDays: number;
  /** URI-scheme prefixes whose nodes belong to this virtual room. Matched
   *  against node.source_uri via startsWith — single source of truth for
   *  membership. */
  readonly uriPrefixes: readonly string[];
}

// ─────────────────────── specs ────────────────────────────

export const TOOLSHED: SystemRoomSpec = Object.freeze({
  name: 'toolshed',
  description: 'codebase, skills, MCP tools, deps, git history — the agent\'s capabilities',
  staleAfterDays: 30,
  uriPrefixes: ['git:', 'npm:', 'file-uri:', 'file://', 'skill:', 'mcp-tool:', 'repo:'],
});

export const RESEARCH: SystemRoomSpec = Object.freeze({
  name: 'research',
  description: 'arxiv, hn, rss, web searches, web fetches, telegram — external reading',
  staleAfterDays: 7,
  uriPrefixes: ['arxiv:', 'hn:', 'rss:', 'websearch:', 'http://', 'https://', 'telegram:'],
});

/** Bulletin-board room for peer-to-peer Q&A. Questions and answers live
 *  here as nodes (schemes oracle-question: / oracle-answer:) and
 *  propagate via the existing touch + CRDT surface. Async by design —
 *  no new protocol code. Stale-after: 14 days (a question that's been
 *  open two weeks is probably not getting answered organically). */
export const ORACLE: SystemRoomSpec = Object.freeze({
  name: 'oracle',
  description: 'peer-to-peer Q&A bulletin board — questions and answers propagate via touch/CRDT',
  staleAfterDays: 14,
  uriPrefixes: ['oracle-question:', 'oracle-answer:'],
});

export const SYSTEM_ROOMS: readonly SystemRoomSpec[] = Object.freeze([TOOLSHED, RESEARCH, ORACLE]);

export const SYSTEM_ROOM_NAMES: ReadonlySet<string> =
  new Set(SYSTEM_ROOMS.map((r) => r.name));

export const isSystemRoomName = (name: string): name is SystemRoomName =>
  SYSTEM_ROOM_NAMES.has(name);

export const findSystemRoom = (name: string): SystemRoomSpec | undefined =>
  SYSTEM_ROOMS.find((r) => r.name === name);

// ─────────────────────── membership ────────────────────────

/**
 * Does this node belong to the given system room? Derived from
 * source_uri scheme — NOT from the node's own `room` field.
 *
 * Falsy source_uri → false (can't classify a node without a source).
 */
export const belongsToSystemRoom = (node: GraphNode, spec: SystemRoomSpec): boolean => {
  const uri = typeof node.source_uri === 'string' ? node.source_uri : undefined;
  if (!uri) return false;
  return spec.uriPrefixes.some((p) => uri.startsWith(p));
};

/**
 * All nodes in a system room, newest-first by fetched_at. Nodes without
 * `fetched_at` go last (they're un-aged, which is worse than known-stale).
 *
 * `isolatedRooms` is the opt-out list — physical room names the user
 * has marked `shareable: false` in shared-rooms.json. Nodes whose
 * physical `room` is in that set are excluded from system-room
 * membership even if their source_uri scheme matches. This is the
 * escape hatch that keeps `room: private` content off the wire.
 */
export const nodesInSystemRoom = (
  nodes: readonly GraphNode[],
  spec: SystemRoomSpec,
  isolatedRooms: ReadonlySet<string> = new Set(),
): readonly GraphNode[] => {
  const keep = nodes.filter((n) => {
    if (!belongsToSystemRoom(n, spec)) return false;
    if (typeof n.room === 'string' && isolatedRooms.has(n.room)) return false;
    return true;
  });
  return [...keep].sort((a, b) => {
    const ta = typeof a.fetched_at === 'string' ? Date.parse(a.fetched_at) : 0;
    const tb = typeof b.fetched_at === 'string' ? Date.parse(b.fetched_at) : 0;
    return tb - ta;
  });
};

// ─────────────────────── aging ────────────────────────────

/**
 * Days since fetched_at, or null if the node has no timestamp.
 * Fractional for sub-day precision; UTC-based; tolerates bad strings.
 */
export const ageDays = (node: GraphNode, now: Date = new Date()): number | null => {
  const ts = typeof node.fetched_at === 'string' ? Date.parse(node.fetched_at) : NaN;
  if (!Number.isFinite(ts)) return null;
  const deltaMs = now.getTime() - ts;
  return deltaMs / 86_400_000;
};

/** True when a node in `spec` is past its staleness window. */
export const isStale = (node: GraphNode, spec: SystemRoomSpec, now: Date = new Date()): boolean => {
  const age = ageDays(node, now);
  if (age === null) return true; // un-aged = worst case
  return age > spec.staleAfterDays;
};
