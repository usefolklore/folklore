/**
 * Hot cache — pure recency digest generator.
 *
 * Port of claude-obsidian's `wiki/hot.md` pattern: a ~500-word markdown
 * blob refreshed after every daemon tick and written to
 * `~/.wellinformed/hot.md`. A new Claude session reads hot.md at
 * SessionStart and walks in already oriented — no "here's what I was
 * doing" recap needed from the user.
 *
 * Deterministic + pure. No LLM calls — if we summarised with Claude we
 * would be paying per-tick token costs for a file that changes many
 * times per day. Instead we project raw graph counts + newest-N titles
 * + most-active-rooms into a fixed template. Good enough for orientation.
 *
 * Size cap enforced in `render()` — the caller never needs to worry
 * about blowing past the word budget.
 */

import type { Graph, GraphNode } from './graph.js';

const WORD_BUDGET = 500;
const RECENT_NODE_LIMIT = 15;
const TOP_ROOM_LIMIT = 5;
const RECENT_SESSION_LIMIT = 5;

/** Structural summary — the pure-data projection before rendering. */
export interface HotCacheSnapshot {
  readonly generated_at: string;
  readonly total_nodes: number;
  readonly total_rooms: number;
  readonly rooms_by_size: ReadonlyArray<{ readonly name: string; readonly node_count: number }>;
  /** Newest nodes across the whole graph, by fetched_at descending. */
  readonly recent_nodes: ReadonlyArray<{
    readonly id: string;
    readonly label: string;
    readonly room: string;
    readonly fetched_at?: string;
  }>;
  /** Newest session IDs across the sessions room (if present). */
  readonly recent_sessions: ReadonlyArray<{
    readonly session_id: string;
    readonly label: string;
    readonly fetched_at?: string;
  }>;
  /** Count of inbound nodes from P2P peers in the last 7 days. */
  readonly p2p_inbound_7d: number;
}

const sortByFetchedAt = (nodes: readonly GraphNode[]): readonly GraphNode[] =>
  [...nodes].sort((a, b) => {
    const aT = typeof a.fetched_at === 'string' ? a.fetched_at : '';
    const bT = typeof b.fetched_at === 'string' ? b.fetched_at : '';
    return bT.localeCompare(aT);
  });

const groupByRoom = (nodes: readonly GraphNode[]): Map<string, GraphNode[]> => {
  const m = new Map<string, GraphNode[]>();
  for (const n of nodes) {
    const room = typeof n.room === 'string' ? n.room : '(unassigned)';
    const bucket = m.get(room) ?? [];
    bucket.push(n);
    m.set(room, bucket);
  }
  return m;
};

/** Build the structured snapshot from the current graph. Pure. */
export const buildSnapshot = (
  graph: Graph,
  nowIso: string = new Date().toISOString(),
): HotCacheSnapshot => {
  const nodes = graph.json.nodes;
  const byRoom = groupByRoom(nodes);

  const roomsBySize = [...byRoom.entries()]
    .map(([name, list]) => ({ name, node_count: list.length }))
    .sort((a, b) => b.node_count - a.node_count)
    .slice(0, TOP_ROOM_LIMIT);

  const recent = sortByFetchedAt(nodes).slice(0, RECENT_NODE_LIMIT);
  const recentNodes = recent.map((n) => ({
    id: n.id,
    label: typeof n.label === 'string' ? n.label : '(unlabelled)',
    room: typeof n.room === 'string' ? n.room : '(unassigned)',
    fetched_at: typeof n.fetched_at === 'string' ? n.fetched_at : undefined,
  }));

  const sessionNodes = nodes.filter((n) => n.room === 'sessions');
  const recentSessionsRaw = sortByFetchedAt(sessionNodes).slice(0, RECENT_SESSION_LIMIT);
  const recentSessions = recentSessionsRaw.map((n) => ({
    session_id: typeof n.source_file === 'string' ? n.source_file : n.id,
    label: typeof n.label === 'string' ? n.label.slice(0, 200) : '(unlabelled)',
    fetched_at: typeof n.fetched_at === 'string' ? n.fetched_at : undefined,
  }));

  // P2P inbound heuristic: nodes whose source_file indicates remote origin.
  // share-sync.ts stamps remote-applied updates with a recognisable prefix.
  const sevenDaysAgo = new Date(Date.parse(nowIso) - 7 * 24 * 60 * 60 * 1000).toISOString();
  const p2pInbound7d = nodes.filter((n) => {
    if (typeof n.fetched_at !== 'string' || n.fetched_at < sevenDaysAgo) return false;
    const sf = n.source_file;
    return typeof sf === 'string' && (sf.startsWith('peer:') || sf.startsWith('p2p:'));
  }).length;

  return {
    generated_at: nowIso,
    total_nodes: nodes.length,
    total_rooms: byRoom.size,
    rooms_by_size: roomsBySize,
    recent_nodes: recentNodes,
    recent_sessions: recentSessions,
    p2p_inbound_7d: p2pInbound7d,
  };
};

/**
 * Render the snapshot to markdown with a soft word-budget cap. The
 * template mirrors claude-obsidian's hot.md section headings so a
 * user switching between the two systems gets a familiar format.
 */
export const render = (snap: HotCacheSnapshot): string => {
  const lines: string[] = [];
  lines.push('---');
  lines.push('type: meta');
  lines.push('title: "Hot Cache"');
  lines.push(`updated: ${snap.generated_at}`);
  lines.push('generator: wellinformed');
  lines.push('---');
  lines.push('');
  lines.push('# Recent Context');
  lines.push('');
  lines.push('## Graph at a Glance');
  lines.push(`- **${snap.total_nodes}** nodes across **${snap.total_rooms}** rooms`);
  lines.push(`- **${snap.p2p_inbound_7d}** node(s) received from P2P peers in the last 7 days`);
  lines.push('');

  if (snap.rooms_by_size.length > 0) {
    lines.push('## Biggest Rooms');
    for (const r of snap.rooms_by_size) {
      lines.push(`- \`${r.name}\` — ${r.node_count} nodes`);
    }
    lines.push('');
  }

  if (snap.recent_nodes.length > 0) {
    lines.push('## Newest Nodes');
    for (const n of snap.recent_nodes) {
      const when = n.fetched_at ? ` (${n.fetched_at.slice(0, 10)})` : '';
      lines.push(`- \`${n.room}\` — ${n.label.slice(0, 140)}${when}`);
    }
    lines.push('');
  }

  if (snap.recent_sessions.length > 0) {
    lines.push('## Recent Claude Sessions');
    for (const s of snap.recent_sessions) {
      const when = s.fetched_at ? ` (${s.fetched_at.slice(0, 10)})` : '';
      lines.push(`- ${s.label}${when}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push(`_Generated by wellinformed. Reload with \`wellinformed hot --refresh\`._`);

  const raw = lines.join('\n');
  return clampToWordBudget(raw, WORD_BUDGET);
};

/**
 * Trim a markdown document to a rough word budget without breaking
 * section headings. Appends a tombstone line when trimming happens so
 * the reader knows content was dropped.
 */
const clampToWordBudget = (text: string, budget: number): string => {
  const words = text.split(/\s+/);
  if (words.length <= budget) return text;
  const kept = words.slice(0, budget).join(' ');
  // Walk back to the last newline so we don't chop mid-heading.
  const lastNewline = kept.lastIndexOf('\n');
  const clamped = lastNewline > 0 ? kept.slice(0, lastNewline) : kept;
  return `${clamped}\n\n_[trimmed at ${budget}-word budget]_\n`;
};
