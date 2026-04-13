/**
 * `wellinformed recent-sessions` — Phase 20 CLI surface.
 *
 * Queries ~/.wellinformed/graph.json for nodes in the `sessions` room,
 * groups them by session_id, aggregates per-session rollups, and prints
 * either a human-readable table or JSON.
 *
 * Flags:
 *   --hours N        Look-back window in hours (default 24)
 *   --project PATH   Filter sessions whose cwd contains PATH
 *   --limit N        Maximum sessions to show (default 10)
 *   --json           Emit structured JSON instead of a table
 *
 * The `rollupSessions` helper is exported so the MCP tool reuses the
 * same code path — one implementation, two surfaces.
 */

import { formatError } from '../../domain/errors.js';
import { nodesInRoom } from '../../domain/graph.js';
import { fileGraphRepository } from '../../infrastructure/graph-repository.js';
import { runtimePaths } from '../runtime.js';
import type { GraphNode } from '../../domain/graph.js';

// ─────────────────────── types ────────────────────────────

export interface SessionRollup {
  readonly id: string;
  readonly started_at: string;
  readonly duration_ms: number;
  readonly tool_calls: number;
  readonly files_touched: readonly string[];
  readonly final_assistant_message: string;
  readonly git_branch: string | null;
  readonly node_count: number;
}

interface Flags {
  readonly hours: number;
  readonly project?: string;
  readonly limit: number;
  readonly json: boolean;
}

// ─────────────────────── flag parsing ────────────────────

const parseFlags = (rest: readonly string[]): Flags => {
  let hours = 24;
  let project: string | undefined;
  let limit = 10;
  let json = false;

  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--hours' && i + 1 < rest.length) {
      const parsed = parseInt(rest[++i], 10);
      if (!Number.isNaN(parsed) && parsed > 0) hours = parsed;
    } else if (a === '--project' && i + 1 < rest.length) {
      project = rest[++i];
    } else if (a === '--limit' && i + 1 < rest.length) {
      const parsed = parseInt(rest[++i], 10);
      if (!Number.isNaN(parsed) && parsed > 0) limit = parsed;
    } else if (a === '--json') {
      json = true;
    }
  }

  return { hours, project, limit, json };
};

// ─────────────────────── rollup helper ───────────────────

/**
 * Group session graph nodes into per-session rollups.
 *
 * Pure function — no I/O. Exported for MCP tool reuse so both CLI
 * and MCP share a single aggregation implementation.
 *
 * @param nodes       All GraphNode objects from the `sessions` room
 * @param cutoffMs    Unix timestamp (ms) — only nodes with timestamp >= cutoff are included
 * @param projectFilter  Optional cwd substring filter
 * @returns Per-session rollups sorted most-recent first
 */
export const rollupSessions = (
  nodes: readonly GraphNode[],
  cutoffMs: number,
  projectFilter: string | undefined,
): readonly SessionRollup[] => {
  const bySession = new Map<string, GraphNode[]>();

  for (const node of nodes) {
    const sessionId = node.session_id as string | undefined;
    if (!sessionId) continue;

    const ts =
      typeof node.timestamp === 'string'
        ? Date.parse(node.timestamp as string)
        : NaN;
    if (!Number.isFinite(ts) || ts < cutoffMs) continue;

    if (projectFilter) {
      const cwd = (node.cwd as string | undefined) ?? '';
      if (!cwd.includes(projectFilter)) continue;
    }

    const existing = bySession.get(sessionId) ?? [];
    existing.push(node);
    bySession.set(sessionId, existing);
  }

  const rollups: SessionRollup[] = [];

  for (const [id, group] of bySession.entries()) {
    // Sort nodes within the session chronologically
    const sorted = [...group].sort((a, b) => {
      const ta = Date.parse((a.timestamp as string | undefined) ?? '');
      const tb = Date.parse((b.timestamp as string | undefined) ?? '');
      return (Number.isFinite(ta) ? ta : 0) - (Number.isFinite(tb) ? tb : 0);
    });

    const started = (sorted[0].timestamp as string | undefined) ?? '';
    const ended = (sorted[sorted.length - 1].timestamp as string | undefined) ?? '';
    const startedMs = Date.parse(started);
    const endedMs = Date.parse(ended);
    const duration_ms =
      Number.isFinite(startedMs) && Number.isFinite(endedMs)
        ? endedMs - startedMs
        : 0;

    // Aggregate tool calls count
    const toolCallCount = sorted.reduce(
      (acc, n) =>
        acc + ((n.tool_calls as unknown[] | undefined)?.length ?? 0),
      0,
    );

    // Collect unique file paths from tool_calls[].target_path
    const filesTouched = new Set<string>();
    for (const n of sorted) {
      const calls =
        (n.tool_calls as Array<{ target_path?: string }> | undefined) ?? [];
      for (const c of calls) {
        if (c.target_path) filesTouched.add(c.target_path);
      }
    }

    // Last assistant message for quick context
    const lastAssistant = [...sorted]
      .reverse()
      .find((n) => (n.entry_kind as string | undefined) === 'assistant');
    const final_assistant_message =
      typeof lastAssistant?.content_summary === 'string'
        ? (lastAssistant.content_summary as string)
        : '';

    const git_branch =
      (sorted[0].git_branch as string | null | undefined) ?? null;

    rollups.push({
      id,
      started_at: started,
      duration_ms,
      tool_calls: toolCallCount,
      files_touched: Array.from(filesTouched),
      final_assistant_message,
      git_branch,
      node_count: sorted.length,
    });
  }

  // Most recent first
  return rollups.sort(
    (a, b) =>
      Date.parse(b.started_at) - Date.parse(a.started_at),
  );
};

// ─────────────────────── command entry ───────────────────

export const recentSessions = async (args: readonly string[]): Promise<number> => {
  const flags = parseFlags(args);
  const graphRepo = fileGraphRepository(runtimePaths().graph);
  const graphRes = await graphRepo.load();

  if (graphRes.isErr()) {
    console.error(`recent-sessions: ${formatError(graphRes.error)}`);
    return 1;
  }

  const graph = graphRes.value;
  const sessionNodes = nodesInRoom(graph, 'sessions');
  const cutoffMs = Date.now() - flags.hours * 60 * 60 * 1000;
  const rollups = rollupSessions(sessionNodes, cutoffMs, flags.project).slice(
    0,
    flags.limit,
  );

  if (flags.json) {
    console.log(JSON.stringify({ count: rollups.length, sessions: rollups }, null, 2));
    return 0;
  }

  if (rollups.length === 0) {
    console.log(
      'no recent sessions indexed. run `wellinformed daemon start` so the claude-sessions adapter can populate the graph.',
    );
    return 0;
  }

  console.log(`recent sessions (last ${flags.hours}h):\n`);
  for (const r of rollups) {
    console.log(`  ${r.id}`);
    console.log(`    started:         ${r.started_at}`);
    console.log(`    duration:        ${Math.round(r.duration_ms / 1000)}s`);
    console.log(`    tool calls:      ${r.tool_calls}`);
    console.log(`    files touched:   ${r.files_touched.length}`);
    console.log(`    git branch:      ${r.git_branch ?? '-'}`);
    if (r.final_assistant_message) {
      console.log(
        `    final message:   ${r.final_assistant_message.slice(0, 100)}`,
      );
    }
    console.log('');
  }

  return 0;
};
