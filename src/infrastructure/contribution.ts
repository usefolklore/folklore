/**
 * Contribution ledger — how much this node has GIVEN to the swarm.
 *
 * Every time a peer's search or fetch is served real inference off this node's
 * graph, it's recorded here: a monotonic reputation score, a running total, the
 * set of distinct peers helped, and a rolling feed of the most recent serves
 * (for the "you just answered peer X" notification). Read by the statusline so
 * the count climbs live in the Claude Code status bar as your node earns its
 * keep in the network.
 *
 * Best-effort and side-effect-only: a failure here must NEVER break a serve, so
 * every operation is wrapped and swallowed (mirrors the responders' log-and-
 * continue ethos). Distinct from peers-rep.ts, which tracks the reputation of
 * OTHER peers (inbound trust); this is our OUTBOUND contribution.
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface Contribution {
  /** Total requests served (searches + fetches) — the reputation score. */
  readonly reputation: number;
  readonly served_searches: number;
  readonly served_fetches: number;
  /** Distinct peer ids this node has helped. */
  readonly peers_helped: readonly string[];
  readonly last_served_at?: string;
  readonly last_served_peer?: string;
}

export interface ServedEvent {
  readonly peer: string;
  readonly kind: 'search' | 'fetch';
  /** Number of matches / nodes actually served. 0 = nothing served, not counted. */
  readonly count: number;
  /** Node ids this peer pulled from your tree — surfaced in the live feed. */
  readonly nodes?: readonly string[];
}

const CONTRIB_FILE = 'contribution.json';
const FEED_FILE = 'served-feed.jsonl';
/** Keep the feed bounded — the statusline only shows the latest anyway. */
const FEED_MAX_LINE_BYTES = 512;

const empty = (): Contribution => ({
  reputation: 0,
  served_searches: 0,
  served_fetches: 0,
  peers_helped: [],
});

export const readContribution = (home: string): Contribution => {
  try {
    const raw = JSON.parse(readFileSync(join(home, CONTRIB_FILE), 'utf8')) as Partial<Contribution>;
    return { ...empty(), ...raw, peers_helped: Array.isArray(raw.peers_helped) ? raw.peers_helped : [] };
  } catch {
    return empty();
  }
};

/**
 * Record that we served a peer. Only counts when `count > 0` (an empty response
 * isn't a contribution). Increments the score, tracks the distinct peer, stamps
 * the last-served fields, and appends a feed line for the notification surface.
 */
export const recordServed = (home: string, ev: ServedEvent): void => {
  if (!ev.peer || ev.count <= 0) return;
  try {
    if (!existsSync(home)) mkdirSync(home, { recursive: true });
    const cur = readContribution(home);
    const helped = cur.peers_helped.includes(ev.peer)
      ? cur.peers_helped
      : [...cur.peers_helped, ev.peer];
    const at = new Date().toISOString();
    const next: Contribution = {
      reputation: cur.reputation + 1,
      served_searches: cur.served_searches + (ev.kind === 'search' ? 1 : 0),
      served_fetches: cur.served_fetches + (ev.kind === 'fetch' ? 1 : 0),
      peers_helped: helped,
      last_served_at: at,
      last_served_peer: ev.peer,
    };
    writeFileSync(join(home, CONTRIB_FILE), JSON.stringify(next));
    // Cap the node list so the feed line stays bounded; the live view only
    // needs a representative id or two per request.
    const nodes = (ev.nodes ?? []).slice(0, 3);
    const line = JSON.stringify({ ts: at, peer: ev.peer, kind: ev.kind, count: ev.count, nodes });
    if (line.length <= FEED_MAX_LINE_BYTES) appendFileSync(join(home, FEED_FILE), line + '\n');
  } catch {
    /* observability must never break a serve */
  }
};
