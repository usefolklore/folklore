/**
 * Phase 20 — session ingest orchestrator.
 *
 * V5 (Phase 24): the `sessions` pseudo-room is gone. Session nodes are
 * identified by their source_uri scheme `claude_sessions:` (set by the
 * claude-sessions adapter). The boot-time `ensureSessionsRoom`
 * room-provisioning step is a no-op; what remains is the retention
 * pruner that drops aged-out session nodes lacking key signals.
 *
 * The claude-sessions source descriptor still gets auto-registered if
 * missing — but without a room field. The daemon's flat per-source
 * tick (Phase 24-04 `runSources`) picks it up like any other source.
 */

import { ResultAsync, okAsync } from 'neverthrow';
import type { AppError } from '../domain/errors.js';
import type { SessionError } from '../domain/errors.js';
import { SessionError as SE } from '../domain/errors.js';
import type { GraphRepository } from '../infrastructure/graph-repository.js';
import type { SourcesConfig } from '../infrastructure/sources-config.js';
import { hasKeySignal } from '../domain/sessions.js';
import type { GraphNode } from '../domain/graph.js';

const DEFAULT_SOURCE_ID = 'claude-sessions-default' as const;
const SESSION_URI_PREFIX = 'claude_sessions:' as const;

// ─────────────────────── source registration ─────────────

export interface SessionEnsureDeps {
  readonly sources: SourcesConfig;
  readonly homePath: string;
}

/**
 * Ensure the `claude_sessions` source adapter is registered. Idempotent.
 *
 * V5: no room or shared-rooms.json side-effects — sharing decisions
 * happen per-node via `private: boolean`. The claude-sessions adapter
 * itself stamps `private: true` on session nodes so they never federate.
 */
export const ensureSessionsRoom = (
  deps: SessionEnsureDeps,
): ResultAsync<void, AppError> =>
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
          config: {},
          enabled: true,
        })
        .mapErr((e): AppError => e)
        .map(() => undefined);
    });

// ─────────────────────── retention ─────────────────────────

export interface RetentionDeps {
  readonly graphs: GraphRepository;
}

/**
 * Prune session nodes older than `retentionDays` that lack key signals.
 *
 * V5: identifies sessions via the source_uri scheme `claude_sessions:`,
 * not by room membership.
 */
export const enforceRetention = (
  deps: RetentionDeps,
  retentionDays: number,
): ResultAsync<number, SessionError> => {
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  return deps.graphs
    .load()
    .mapErr((e: AppError): SessionError =>
      SE.retentionError(`graph load failed: ${JSON.stringify(e)}`),
    )
    .andThen((graph) => {
      const nodes = graph.json.nodes.filter((n) => {
        const uri = typeof n.source_uri === 'string' ? n.source_uri : '';
        return uri.startsWith(SESSION_URI_PREFIX);
      });
      const toDrop: GraphNode[] = [];

      for (const node of nodes) {
        const ts =
          typeof node.timestamp === 'string'
            ? Date.parse(node.timestamp as string)
            : NaN;
        if (!Number.isFinite(ts) || ts >= cutoffMs) continue;

        const labelStr = typeof node.label === 'string' ? node.label : '';
        const summaryStr =
          typeof node.content_summary === 'string'
            ? (node.content_summary as string)
            : '';

        if (hasKeySignal({ label: labelStr, content_summary: summaryStr })) continue;
        toDrop.push(node);
      }

      if (toDrop.length === 0) return okAsync<number, SessionError>(0);

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
        .mapErr((e: AppError): SessionError =>
          SE.retentionError(`graph save failed: ${JSON.stringify(e)}`),
        )
        .map(() => toDrop.length);
    });
};

// Keep imports honest
void (SE as unknown);
