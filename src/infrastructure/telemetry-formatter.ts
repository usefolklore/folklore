/**
 * Render PeerPullTelemetry as a compact ASCII block suitable for:
 *   - Claude Code PreToolUse hook `additionalContext`
 *   - MCP tool response strings (Codex / Gemini / opencode etc.)
 *   - CLI tail output after `folklore ask --peers`
 *
 * Pure function. Deterministic. No I/O.
 */

import { decideContract, type PeerPullTelemetry } from '../domain/peer-telemetry.js';

/** Single-letter codes for the trace line, in scorer order. */
const TRACE_CODE: Record<string, string> = {
  retrieval: 'r',
  freshness: 'f',
  provenance: 'p',
  consensus: 'c',
  signature: 's',
};

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
  const queryLine = ` query    "${truncQuery(t.query)}"`;
  const tookLine = ` took     ${formatMs(t.took_ms)}  (${formatMs(t.took_local_ms)} local · ${formatMs(t.took_merge_ms)} merge)`;
  const dataLine = ` data     ${formatBytes(t.bytes_received)} · ${t.result_count} result${t.result_count === 1 ? '' : 's'} · ${t.distinct_sources} unique source${t.distinct_sources === 1 ? '' : 's'}`;
  const peersLine = ` peers    ${t.peers_responded}/${t.peers_queried} responded · ${t.peers_alive} alive on swarm${
    t.peers_timed_out + t.peers_errored > 0
      ? ` · ${t.peers_timed_out} timeout · ${t.peers_errored} error`
      : ''
  }`;

  const s = t.satisfaction;
  const fitLine = ` fit      ${s.score.toFixed(2)} satisfaction · ${s.fresh_count} fresh · ${s.stale_count} stale · ${s.unsigned_count} unsigned`;

  // Agent contract (RFC-0003) — the explicit breakpoint decision plus
  // the reasoning that produced it, so a deny is traceable. Derived from
  // the satisfaction on the record; the canonical explanation surface
  // across hook / MCP / CLI.
  const c = decideContract(s);
  const actionLine = ` action   ${c.decision} — ${c.recommended_action}`;

  // Trace: observed components only, short codes (keeps the line < 80).
  const traceCells = c.trace
    .filter((row) => row.observed)
    .map((row) => `${TRACE_CODE[row.name] ?? row.name} ${row.value.toFixed(2)}`);
  const traceLine = traceCells.length > 0 ? ` trace    ${traceCells.join(' · ')}` : null;

  // Why / flags — bounded to one line each so the block stays compact.
  const whyLine = s.reasons.length > 0 ? ` why      ${truncQuery(s.reasons.join(' · '), 66)}` : null;
  const flagLine = s.penalties.length > 0 ? ` flags    ${truncQuery(s.penalties.join(' · '), 66)}` : null;
  const shadowLine = c.would_shadow_search ? ` shadow   a verification pass is still advised` : null;

  return [
    HR_TOP, queryLine, tookLine, dataLine, peersLine,
    fitLine, actionLine, traceLine, whyLine, flagLine, shadowLine,
    HR_BOTTOM,
  ].filter((l): l is string => l !== null).join('\n');
};

/**
 * One-line variant for tight contexts (status lines, JSON-line logs).
 */
export const formatTelemetryOneLine = (t: PeerPullTelemetry): string =>
  `peer-pull ${formatMs(t.took_ms)} · ${t.result_count} hits · ${t.peers_responded}/${t.peers_queried} peers · sat=${t.satisfaction.score.toFixed(2)}`;
