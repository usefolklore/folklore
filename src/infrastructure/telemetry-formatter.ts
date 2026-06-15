/**
 * Render PeerPullTelemetry as a compact ASCII block suitable for:
 *   - Claude Code PreToolUse hook `additionalContext`
 *   - MCP tool response strings (Codex / Gemini / opencode etc.)
 *   - CLI tail output after `folklore ask --peers`
 *
 * Pure function. Deterministic. No I/O.
 */

import type { PeerPullTelemetry } from '../domain/peer-telemetry.js';

const HR_TOP    = '─── folklore peer pull ─────────────────────────────────';
const HR_BOTTOM = '─────────────────────────────────────────────────────────────';

const formatBytes = (n: number): string => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const formatMs = (n: number): string => {
  if (n < 1000) return `${Math.round(n)}ms`;
  return `${(n / 1000).toFixed(2)}s`;
};

const truncQuery = (q: string, max = 48): string => {
  if (q.length <= max) return q;
  return q.slice(0, max - 1).trimEnd() + '…';
};

export const formatTelemetryBlock = (t: PeerPullTelemetry): string => {
  const queryLine = ` query    "${truncQuery(t.query)}"${t.room ? ` · room=${t.room}` : ''}`;
  const tookLine = ` took     ${formatMs(t.took_ms)}  (${formatMs(t.took_local_ms)} local · ${formatMs(t.took_merge_ms)} merge)`;
  const dataLine = ` data     ${formatBytes(t.bytes_received)} · ${t.result_count} result${t.result_count === 1 ? '' : 's'} · ${t.distinct_sources} unique source${t.distinct_sources === 1 ? '' : 's'}`;
  const peersLine = ` peers    ${t.peers_responded}/${t.peers_queried} responded · ${t.peers_alive} alive on swarm${
    t.peers_timed_out + t.peers_errored > 0
      ? ` · ${t.peers_timed_out} timeout · ${t.peers_errored} error`
      : ''
  }`;

  const s = t.satisfaction;
  const fitLine = ` fit      ${s.score.toFixed(2)} satisfaction · ${s.fresh_count} fresh · ${s.stale_count} stale · ${s.unsigned_count} unsigned`;
  // Decision line is the explicit agent contract (v1 placeholder for
  // the protocol-quality breakpoint shape — see
  // docs/PROTOCOL-QUALITY-QUESTIONS.md). Stable surface across v1→v2.
  const actionLine = ` action   ${t.decision}`;

  return [HR_TOP, queryLine, tookLine, dataLine, peersLine, fitLine, actionLine, HR_BOTTOM].join('\n');
};

/**
 * One-line variant for tight contexts (status lines, JSON-line logs).
 */
export const formatTelemetryOneLine = (t: PeerPullTelemetry): string =>
  `peer-pull ${formatMs(t.took_ms)} · ${t.result_count} hits · ${t.peers_responded}/${t.peers_queried} peers · sat=${t.satisfaction.score.toFixed(2)}`;
