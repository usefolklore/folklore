/**
 * Touch — asymmetric one-shot P2P graph exchange.
 *
 * Contrast with ShareSync (Y.js CRDT, symmetric):
 *
 *               ShareSync                     Touch
 *               ─────────                     ─────
 *   Trust       symmetric (intersection)      asymmetric (pull-only)
 *   Shape       persistent Y.js stream        one-shot request/response
 *   State       .ydoc file per room           stateless on initiator
 *   Scope       incremental CRDT updates      full room snapshot
 *   CLI         `share room X`                `touch <peer> --room X`
 *
 * Touch is the "give me a copy of your notes on topic X" primitive. The
 * responder treats it like `federated_search`: optional, rate-limited,
 * subject to the responder's own share-audit-then-publish policy. If the
 * responder has NOT marked the requested room public, it refuses with
 * `TouchRoomNotShared` and no nodes leave their disk.
 *
 * Wire format is JSON, one request frame + one response frame, length-
 * prefixed via it-length-prefixed. Same framing as `search-sync.ts`.
 *
 * Pre-transmission redaction is mandatory: the responder runs
 * `redactNodes` (secret-gate.ts) over the result set before serialising.
 * A peer who trusts the responder enough to pull their graph still
 * shouldn't receive the responder's OpenAI keys by accident.
 */

import type { GraphNode } from './graph.js';

/** Protocol id registered on the libp2p node. */
export const TOUCH_PROTOCOL_ID = '/akashik/touch/1.0.0' as const;

/**
 * Defense-in-depth cap on the number of nodes returned in a single touch.
 * Prevents pathological "give me everything" responses from eating memory
 * on the initiator. Rooms bigger than this must be paged (future work).
 */
export const TOUCH_MAX_NODES = 5000 as const;

/** Per-peer timeout — touch is larger than search so the budget is bigger. */
export const TOUCH_TIMEOUT_MS = 15_000 as const;

/**
 * Rate limit for the touch responder — touch is expensive relative to
 * search (whole-room read + redaction pass), so default is stricter.
 */
export const TOUCH_DEFAULT_RATE_PER_SEC = 1 as const;
export const TOUCH_DEFAULT_BURST = 3 as const;

/**
 * Initiator → responder — V5 envelope (Phase 24-03, ROOMS-DEL-05).
 *
 * Pre-V5 carried a `room: string` field that selected which room's nodes the
 * responder would return. V5 dropped rooms entirely; the touch primitive now
 * means "give me your N freshest non-private nodes." TOUCH_MAX_NODES still
 * caps the response so a single touch can't blow memory.
 */
export interface TouchRequest {
  readonly type: 'touch';
  readonly protocol_version: 5;
  /** Optional client-supplied max — responder's own cap still applies. */
  readonly max_nodes?: number;
}

/**
 * Responder → initiator — V5 envelope. On a successful exchange the responder
 * populates `nodes` with the redacted, non-private subset; on any refusal path
 * it populates `error` and leaves nodes as an empty array.
 */
export interface TouchResponse {
  readonly type: 'touch-response';
  readonly protocol_version: 5;
  /** Empty when `error` is set. */
  readonly nodes: readonly GraphNode[];
  /** Count of redactions applied across all nodes — audit evidence. */
  readonly redactions_applied: number;
  readonly error?: TouchResponseError;
}

export type TouchResponseError =
  | 'rate-limited'
  | 'too-large'
  | 'protocol-mismatch'
  | 'internal-error';

export const isTouchResponseError = (e: unknown): e is TouchResponseError =>
  e === 'rate-limited' ||
  e === 'too-large' ||
  e === 'protocol-mismatch' ||
  e === 'internal-error';
