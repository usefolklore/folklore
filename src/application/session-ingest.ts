/**
 * Phase 20 — session ingest orchestrator.
 *
 * Thin application-layer wiring between the claude-sessions source adapter,
 * the rooms registry (auto-provision `sessions` room), the shared-rooms
 * registry (mark sessions room shareable: false), and the retention pruner.
 *
 * Does NOT re-implement the ingest pipeline — the claude-sessions source
 * is registered as a normal SourceDescriptor and picked up by the existing
 * daemon tick via triggerRoom('sessions').
 */

import { ResultAsync, okAsync } from 'neverthrow';
import { join } from 'node:path';
import type { AppError } from '../domain/errors.js';
import type { SessionError } from '../domain/errors.js';
import { SessionError as SE } from '../domain/errors.js';
import type { GraphRepository } from '../infrastructure/graph-repository.js';
import type { RoomsConfig } from '../infrastructure/rooms-config.js';
import type { SourcesConfig } from '../infrastructure/sources-config.js';
import { mutateSharedRooms, addSharedRoom } from '../infrastructure/share-store.js';
import { hasKeySignal } from '../domain/sessions.js';
import { nodesInRoom } from '../domain/graph.js';
import type { GraphNode } from '../domain/graph.js';

const SESSIONS_ROOM = 'sessions' as const;
const DEFAULT_SOURCE_ID = 'claude-sessions-default' as const;

// ─────────────────────── room auto-provision ──────────────

export interface SessionEnsureDeps {
  readonly rooms: RoomsConfig;
  readonly sources: SourcesConfig;
  readonly homePath: string;
}

/**
 * Ensure the `sessions` room exists, the claude_sessions source is
 * registered, and the shared-rooms.json entry for `sessions` is marked
 * shareable: false. Idempotent — safe to call on every daemon tick.
 *
 * Steps:
 *   1. rooms.create (idempotent — addRoom deduplicates by id)
 *   2. sources.list → add claude-sessions-default if absent
 *   3. mutateSharedRooms → ensure record exists with shareable: false
 */
export const ensureSessionsRoom = (
  deps: SessionEnsureDeps,
): ResultAsync<void, AppError> => {
  const roomMeta = {
    id: SESSIONS_ROOM,
    name: 'sessions',
    description: 'Auto-ingested Claude Code session transcripts',
    keywords: ['session', 'claude', 'history'],
    created_at: new Date().toISOString(),
  };

  return deps.rooms
    .create(roomMeta)
    .mapErr((e): AppError => e)
    .andThen(() =>
      deps.sources
        .list()
        .mapErr((e): AppError => e)
        .andThen((all) => {
          const exists = all.some((s) => s.id === DEFAULT_SOURCE_ID);
          if (exists) return okAsync<void, AppError>(undefined);
          return deps.sources
            .add({
              id: DEFAULT_SOURCE_ID,
              kind: 'claude_sessions',
              room: SESSIONS_ROOM,
              config: {},
              enabled: true,
            })
            .mapErr((e): AppError => e)
            .map(() => undefined);
        }),
    )
    .andThen(() => {
      const path = join(deps.homePath, 'shared-rooms.json');
      return mutateSharedRooms(path, (current) => {
        const existing = current.rooms.find((r) => r.name === SESSIONS_ROOM);
        if (existing && existing.shareable === false) return current;
        return addSharedRoom(current, {
          name: SESSIONS_ROOM,
          sharedAt: new Date().toISOString(),
          shareable: false,
        });
      })
        .mapErr((e): AppError => e)
        .map(() => undefined);
    });
};

// ─────────────────────── retention ─────────────────────────

export interface RetentionDeps {
  readonly graphs: GraphRepository;
}

/**
 * Prune session nodes older than `retentionDays` that lack key signals.
 *
 * Key signals (defined in domain/sessions.ts hasKeySignal):
 *   - Git commit hashes in label or content_summary
 *   - External API URLs
 *   - Blocked-secret markers (content replaced by scanner)
 *
 * Nodes WITH key signals are retained indefinitely regardless of age.
 * Returns the count of dropped nodes. Errors become SessionError so the
 * daemon can log and swallow them without crashing the tick.
 */
export const enforceRetention = (
  deps: RetentionDeps,
  retentionDays: number,
): ResultAsync<number, SessionError> => {
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  return deps.graphs
    .load()
    .mapErr((e): SessionError =>
      SE.retentionError(`graph load failed: ${JSON.stringify(e)}`),
    )
    .andThen((graph) => {
      const nodes = nodesInRoom(graph, SESSIONS_ROOM);
      const toDrop: GraphNode[] = [];

      for (const node of nodes) {
        const ts =
          typeof node.timestamp === 'string'
            ? Date.parse(node.timestamp as string)
            : NaN;
        if (!Number.isFinite(ts) || ts >= cutoffMs) continue;

        // Retain nodes with key signals (git hashes, API URLs, blocked markers)
        const labelStr = typeof node.label === 'string' ? node.label : '';
        const summaryStr =
          typeof node.content_summary === 'string'
            ? (node.content_summary as string)
            : '';

        if (hasKeySignal({ label: labelStr, content_summary: summaryStr })) continue;
        toDrop.push(node);
      }

      if (toDrop.length === 0) return okAsync<number, SessionError>(0);

      // Filter the graph in-memory then save atomically.
      const dropIds = new Set(toDrop.map((n) => n.id));
      const nextGraph = {
        ...graph,
        json: {
          ...graph.json,
          nodes: graph.json.nodes.filter((n) => !dropIds.has(n.id)),
          links: graph.json.links.filter(
            (e) => !dropIds.has(e.source) && !dropIds.has(e.target),
          ),
        },
      };

      return deps.graphs
        .save(nextGraph)
        .mapErr((e): SessionError =>
          SE.retentionError(`graph save failed: ${JSON.stringify(e)}`),
        )
        .map(() => toDrop.length);
    });
};

// Keep imports honest
void (SE as unknown);
