/**
 * `wellinformed peers rep [<peer-id>] [--subject <key>] [--json]`
 *
 * Inspect the local peer-reputation database. Two surfaces:
 *
 *   - default (no peer-id) — list every peer with their top-3
 *     subjects + rank-at-now scores. Useful for "who do I trust on
 *     what" at a glance.
 *
 *   - with `<peer-id>` — drill into one peer: every subject they
 *     have observations on, plus reviewer breakdown.
 *
 *   - with `--subject <key>` — peers ranked by their score on that
 *     specific subject. Closes the inverse query (\"who knows
 *     lemlist?\").
 *
 * Output: human table by default, `--json` for programmatic
 * consumers (CI tooling, the future `wellinformed audit export`).
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { formatError } from '../../domain/errors.js';
import {
  loadPeerReputation,
} from '../../infrastructure/peer-reputation-store.js';
import {
  peerRankAt,
  type SubjectAggregate,
} from '../../domain/peer-reputation.js';
import { loadOrCreateIdentity } from '../../infrastructure/peer-transport.js';

const wellinformedHomeDir = (): string =>
  process.env.WELLINFORMED_HOME ?? join(homedir(), '.wellinformed');

interface ParsedArgs {
  readonly peerId?: string;
  readonly subjectKey?: string;
  readonly json: boolean;
}

const parseArgs = (args: readonly string[]): ParsedArgs => {
  let peerId: string | undefined;
  let subjectKey: string | undefined;
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') json = true;
    else if (a === '--subject') subjectKey = args[++i];
    else if (a.startsWith('--subject=')) subjectKey = a.slice('--subject='.length);
    else if (!a.startsWith('-')) peerId = a;
  }
  return { peerId, subjectKey, json };
};

// ─────────────── inspect helpers ──────────

interface PeerRow {
  readonly peer_id: string;
  readonly subjects: Array<{
    readonly key: string;
    readonly label: string;
    readonly kind: string;
    readonly posterior_mean: number;
    readonly confidence: number;
    readonly rank_at_now: number;
    readonly observations: number;
    readonly last_answer_at: string;
  }>;
}

const buildPeerRows = (
  subjects: Record<string, SubjectAggregate>,
  now: string,
): readonly PeerRow[] => {
  const byPeer = new Map<string, PeerRow['subjects'][number][]>();
  for (const [, agg] of Object.entries(subjects)) {
    for (const [peerId, score] of Object.entries(agg.peer_scores)) {
      const rankNow = peerRankAt(score, now, 0);
      const item = {
        key: agg.key,
        label: agg.label,
        kind: agg.kind,
        posterior_mean: score.posterior_mean,
        confidence: score.confidence,
        rank_at_now: rankNow,
        observations: score.raw_review_count,
        last_answer_at: score.last_answer_at,
      };
      const arr = byPeer.get(peerId);
      if (arr) arr.push(item);
      else byPeer.set(peerId, [item]);
    }
  }
  return Array.from(byPeer.entries()).map(([peer_id, items]) => ({
    peer_id,
    subjects: items.sort((a, b) => b.rank_at_now - a.rank_at_now),
  }));
};

const buildPeersBySubject = (
  agg: SubjectAggregate,
  now: string,
): Array<{
  readonly peer_id: string;
  readonly posterior_mean: number;
  readonly confidence: number;
  readonly rank_at_now: number;
  readonly observations: number;
}> =>
  Object.entries(agg.peer_scores)
    .map(([peer_id, score]) => ({
      peer_id,
      posterior_mean: score.posterior_mean,
      confidence: score.confidence,
      rank_at_now: peerRankAt(score, now, 0),
      observations: score.raw_review_count,
    }))
    .sort((a, b) => b.rank_at_now - a.rank_at_now);

// ─────────────── renderers ────────────────

const truncatePeer = (id: string): string =>
  id.length <= 22 ? id : `${id.slice(0, 12)}…${id.slice(-4)}`;

const renderAllJson = (rows: readonly PeerRow[]): void => {
  console.log(JSON.stringify({ peers: rows }, null, 2));
};

const renderAllHuman = (rows: readonly PeerRow[]): void => {
  if (rows.length === 0) {
    console.log('no peer reputation data yet — needs at least one federated ask with `wellinformed ask --peers`.');
    return;
  }
  console.log(`peer reputation — ${rows.length} peer${rows.length === 1 ? '' : 's'} known`);
  console.log('');
  for (const row of rows) {
    console.log(`peer  ${truncatePeer(row.peer_id)}`);
    const top = row.subjects.slice(0, 3);
    for (const s of top) {
      const ageStr = ageBadge(s.last_answer_at);
      console.log(
        `  ${s.label.padEnd(34)}  rank=${s.rank_at_now.toFixed(3)}  post=${s.posterior_mean.toFixed(2)}  conf=${s.confidence.toFixed(2)}  n=${s.observations}${ageStr}`,
      );
    }
    if (row.subjects.length > 3) {
      console.log(`  … +${row.subjects.length - 3} more subject${row.subjects.length - 3 === 1 ? '' : 's'}`);
    }
    console.log('');
  }
};

const renderOnePeerHuman = (row: PeerRow): void => {
  console.log(`peer  ${row.peer_id}`);
  console.log('');
  if (row.subjects.length === 0) {
    console.log('no subject observations.');
    return;
  }
  console.log(`subject                              kind   rank    post  conf  n   last`);
  console.log(`──────────────────────────────────── ─────  ──────  ────  ────  ──  ─────`);
  for (const s of row.subjects) {
    const ageStr = ageBadge(s.last_answer_at);
    console.log(
      `${s.label.padEnd(36)} ${s.kind.padEnd(6)} ${s.rank_at_now.toFixed(3)}   ${s.posterior_mean.toFixed(2)}  ${s.confidence.toFixed(2)}  ${String(s.observations).padStart(2)} ${ageStr.trim()}`,
    );
  }
};

const renderBySubjectHuman = (
  subjectLabel: string,
  rows: ReturnType<typeof buildPeersBySubject>,
): void => {
  console.log(`subject  ${subjectLabel}`);
  console.log('');
  if (rows.length === 0) {
    console.log('no peers have answered on this subject yet.');
    return;
  }
  console.log(`peer                                 rank    post  conf  n`);
  console.log(`────────────────────────────────────  ──────  ────  ────  ──`);
  for (const r of rows) {
    console.log(
      `${truncatePeer(r.peer_id).padEnd(36)} ${r.rank_at_now.toFixed(3)}   ${r.posterior_mean.toFixed(2)}  ${r.confidence.toFixed(2)}  ${r.observations}`,
    );
  }
};

const ageBadge = (iso: string): string => {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return '';
  const days = (Date.now() - parsed) / 86_400_000;
  if (days < 1) return ' · today';
  if (days < 14) return ` · ${Math.round(days)}d`;
  if (days < 90) return ` · ${Math.round(days / 7)}w`;
  return ` · ${Math.round(days / 30)}mo`;
};

// ─────────────── usage + entry ────────────

const USAGE = `usage: wellinformed peers rep [<peer-id>] [--subject <key>] [--json]

  default                        list every peer + top-3 subjects
  <peer-id>                      drill into one peer
  --subject <entity:foo|room:r>  rank peers by score on this subject
  --json                         machine-readable output`;

export const peersRep = async (args: readonly string[]): Promise<number> => {
  if (args.includes('--help') || args.includes('-h') || args.includes('help')) {
    console.log(USAGE);
    return 0;
  }
  const parsed = parseArgs(args);
  const home = wellinformedHomeDir();

  // Need the local peer id to load the file (it's in the header).
  // Use the libp2p identity for that — same one buildPeerPullTelemetry
  // uses for telemetry attribution.
  const identityPath = join(home, 'peer-identity.json');
  const idRes = await loadOrCreateIdentity(identityPath);
  if (idRes.isErr()) {
    console.error(`peers rep: ${formatError(idRes.error)}`);
    return 1;
  }
  const localPeerId = idRes.value.peerId;

  const fileRes = await loadPeerReputation(home, localPeerId);
  if (fileRes.isErr()) {
    console.error(`peers rep: ${fileRes.error.type}: ${'message' in fileRes.error ? fileRes.error.message : ''}`);
    return 1;
  }
  const file = fileRes.value;
  const subjects = file.subjects as Record<string, SubjectAggregate>;
  const now = new Date().toISOString();

  // ── --subject mode ─────────────────────
  if (parsed.subjectKey) {
    const agg = subjects[parsed.subjectKey];
    if (parsed.json) {
      console.log(JSON.stringify({
        subject: parsed.subjectKey,
        peers: agg ? buildPeersBySubject(agg, now) : [],
      }, null, 2));
      return 0;
    }
    if (!agg) {
      console.log(`no observations on subject '${parsed.subjectKey}'.`);
      return 0;
    }
    renderBySubjectHuman(agg.label, buildPeersBySubject(agg, now));
    return 0;
  }

  // ── per-peer drill or full table ──────
  const rows = buildPeerRows(subjects, now);

  if (parsed.peerId) {
    const row = rows.find((r) => r.peer_id === parsed.peerId);
    if (parsed.json) {
      console.log(JSON.stringify(row ?? { peer_id: parsed.peerId, subjects: [] }, null, 2));
      return 0;
    }
    if (!row) {
      console.log(`no observations for peer '${parsed.peerId}'.`);
      return 0;
    }
    renderOnePeerHuman(row);
    return 0;
  }

  if (parsed.json) {
    renderAllJson(rows);
  } else {
    renderAllHuman(rows);
  }
  return 0;
};

