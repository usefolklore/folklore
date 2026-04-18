/**
 * Network telemetry event taxonomy — pure domain.
 *
 * Every observable behavior on a wellinformed node is one of these
 * events. Each carries a deterministic `kind` discriminator + payload
 * fields needed to reconstruct what happened. No mutable state, no
 * I/O — emission lives in the infrastructure layer (log-store.ts).
 *
 * Design constraints:
 *   - User DID NEVER appears in plaintext at this layer (privacy-first
 *     P2P). The `did_hash` field stores SHA-256(DID || event-day) — a
 *     daily-rotating tag that lets operators correlate events for one
 *     user within a day without ever logging the actual DID. Cross-day
 *     correlation is impossible without the original DID.
 *   - Free-form text payloads are truncated to 200 chars + scanned for
 *     secrets (the existing scanner from src/domain/secret-gate.ts is
 *     applied at the infrastructure boundary before write).
 *   - Each event embeds a v1 schema version so future additions can
 *     extend without breaking parsers.
 */

import { createHash } from 'node:crypto';

// ─────────────────────── kinds ────────────────────────────────────

/**
 * The full event-kind enumeration. Adding a new kind requires:
 *   1. Add a literal here.
 *   2. Add a typed event variant in `LogEvent`.
 *   3. Add a `fmtEvent` case for human-readable rendering.
 *   4. Bump the schema version when adding fields to existing kinds
 *      (additive only — never remove or rename).
 */
export type EventKind =
  | 'peer.dial'
  | 'peer.connected'
  | 'peer.disconnected'
  | 'peer.dial_failed'
  | 'search.inbound'
  | 'search.outbound'
  | 'search.timeout'
  | 'search.unauthorized'
  | 'search.rate_limited'
  | 'envelope.verify_failed'
  | 'envelope.signed'
  | 'share.update_received'
  | 'share.update_sent'
  | 'share.update_rejected'
  | 'touch.requested'
  | 'touch.responded'
  | 'identity.created'
  | 'identity.rotated'
  | 'update.checked'
  | 'update.installed'
  | 'update.failed'
  | 'log.shipped'
  | 'log.shipping_failed';

// ─────────────────────── shape ────────────────────────────────────

/** Common fields on every event. */
export interface EventBase {
  readonly schema: 1;
  readonly ts: string;            // ISO-8601 UTC
  readonly kind: EventKind;
  /** SHA-256(user_did || event-day-UTC) prefix [0..16) — daily rotating tag. */
  readonly did_hash: string | null;
  /** Optional free-form correlation id (request id, room id, etc.). */
  readonly cid?: string;
}

export type LogEvent =
  | (EventBase & { kind: 'peer.dial';                addr: string })
  | (EventBase & { kind: 'peer.connected';           peer_id: string })
  | (EventBase & { kind: 'peer.disconnected';        peer_id: string; reason?: string })
  | (EventBase & { kind: 'peer.dial_failed';         addr: string; error: string })
  | (EventBase & { kind: 'search.inbound';           peer_id: string; room?: string; k: number })
  | (EventBase & { kind: 'search.outbound';          peer_id: string; room?: string; k: number; ms: number })
  | (EventBase & { kind: 'search.timeout';           peer_id: string; ms: number })
  | (EventBase & { kind: 'search.unauthorized';      peer_id: string; room: string })
  | (EventBase & { kind: 'search.rate_limited';      peer_id: string })
  | (EventBase & { kind: 'envelope.verify_failed';   reason: string; signer_did_hash?: string })
  | (EventBase & { kind: 'envelope.signed';          payload_kind: string })
  | (EventBase & { kind: 'share.update_received';    peer_id: string; room: string; bytes: number })
  | (EventBase & { kind: 'share.update_sent';        peer_id: string; room: string; bytes: number })
  | (EventBase & { kind: 'share.update_rejected';    peer_id: string; room: string; reason: string })
  | (EventBase & { kind: 'touch.requested';          peer_id: string; room: string })
  | (EventBase & { kind: 'touch.responded';          peer_id: string; room: string; node_count: number })
  | (EventBase & { kind: 'identity.created' })
  | (EventBase & { kind: 'identity.rotated' })
  | (EventBase & { kind: 'update.checked';           current_version: string; latest_version: string })
  | (EventBase & { kind: 'update.installed';         from_version: string; to_version: string })
  | (EventBase & { kind: 'update.failed';            attempted_version: string; error: string })
  | (EventBase & { kind: 'log.shipped';              endpoint: string; events: number; bytes: number })
  | (EventBase & { kind: 'log.shipping_failed';      endpoint: string; error: string });

// ─────────────────────── builders + util ──────────────────────────

/**
 * Compute the daily-rotating did_hash for a user DID. Returns 16 hex
 * chars — enough for collision-resistant intra-day correlation, short
 * enough to keep log lines compact.
 *
 *   did_hash = sha256( did || ":" || YYYY-MM-DD ).hex()[0..16]
 *
 * The day is the UTC date of the event timestamp. Daily rotation
 * means an attacker comparing logs from different days cannot link
 * the same user across days even if they observe the hash.
 */
export const computeDidHash = (did: string, atIso: string): string => {
  const day = atIso.slice(0, 10); // YYYY-MM-DD
  const h = createHash('sha256').update(`${did}:${day}`).digest('hex');
  return h.slice(0, 16);
};

/** Convenience: build an event with the boilerplate filled in. */
export const buildEvent = <K extends EventKind>(
  kind: K,
  fields: Omit<Extract<LogEvent, { kind: K }>, 'schema' | 'ts' | 'kind' | 'did_hash'> & {
    did?: string;
    ts?: string;
    cid?: string;
  },
): Extract<LogEvent, { kind: K }> => {
  const ts = fields.ts ?? new Date().toISOString();
  const did_hash = fields.did ? computeDidHash(fields.did, ts) : null;
  // Strip the meta fields before merging
  const { did: _did, ts: _ts, cid, ...payload } = fields as Record<string, unknown> & { did?: string; ts?: string; cid?: string };
  void _did; void _ts;
  return {
    schema: 1,
    ts,
    kind,
    did_hash,
    ...(cid !== undefined ? { cid } : {}),
    ...payload,
  } as Extract<LogEvent, { kind: K }>;
};

// ─────────────────────── rendering ────────────────────────────────

/**
 * One-line human-readable rendering for `wellinformed logs tail`.
 * Format: `<ts>  <kind>  <key=value> ...`
 */
export const fmtEvent = (e: LogEvent): string => {
  const head = `${e.ts}  ${e.kind.padEnd(28)}`;
  const tag = e.did_hash ? `did=${e.did_hash} ` : '';
  switch (e.kind) {
    case 'peer.dial':              return `${head}${tag}addr=${e.addr}`;
    case 'peer.connected':         return `${head}${tag}peer=${e.peer_id}`;
    case 'peer.disconnected':      return `${head}${tag}peer=${e.peer_id} reason=${e.reason ?? '?'}`;
    case 'peer.dial_failed':       return `${head}${tag}addr=${e.addr} error=${e.error}`;
    case 'search.inbound':         return `${head}${tag}peer=${e.peer_id} room=${e.room ?? '*'} k=${e.k}`;
    case 'search.outbound':        return `${head}${tag}peer=${e.peer_id} room=${e.room ?? '*'} k=${e.k} ms=${e.ms}`;
    case 'search.timeout':         return `${head}${tag}peer=${e.peer_id} ms=${e.ms}`;
    case 'search.unauthorized':    return `${head}${tag}peer=${e.peer_id} room=${e.room}`;
    case 'search.rate_limited':    return `${head}${tag}peer=${e.peer_id}`;
    case 'envelope.verify_failed': return `${head}${tag}reason=${e.reason}${e.signer_did_hash ? ' signer=' + e.signer_did_hash : ''}`;
    case 'envelope.signed':        return `${head}${tag}payload=${e.payload_kind}`;
    case 'share.update_received':  return `${head}${tag}peer=${e.peer_id} room=${e.room} bytes=${e.bytes}`;
    case 'share.update_sent':      return `${head}${tag}peer=${e.peer_id} room=${e.room} bytes=${e.bytes}`;
    case 'share.update_rejected':  return `${head}${tag}peer=${e.peer_id} room=${e.room} reason=${e.reason}`;
    case 'touch.requested':        return `${head}${tag}peer=${e.peer_id} room=${e.room}`;
    case 'touch.responded':        return `${head}${tag}peer=${e.peer_id} room=${e.room} nodes=${e.node_count}`;
    case 'identity.created':       return `${head}${tag}`;
    case 'identity.rotated':       return `${head}${tag}`;
    case 'update.checked':         return `${head}${tag}current=${e.current_version} latest=${e.latest_version}`;
    case 'update.installed':       return `${head}${tag}from=${e.from_version} to=${e.to_version}`;
    case 'update.failed':          return `${head}${tag}attempted=${e.attempted_version} error=${e.error}`;
    case 'log.shipped':            return `${head}${tag}endpoint=${e.endpoint} events=${e.events} bytes=${e.bytes}`;
    case 'log.shipping_failed':    return `${head}${tag}endpoint=${e.endpoint} error=${e.error}`;
  }
};
