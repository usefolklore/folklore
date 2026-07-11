/**
 * Tracker client — HTTP rendezvous, the BitTorrent-tracker / eDonkey-server
 * model for first contact.
 *
 * A folklore node announces its dial multiaddrs to a tiny stateless HTTP
 * tracker (a Cloudflare Pages Function, see functions/tracker/) and reads back
 * the current peer set for its namespace. The tracker holds *pointers only* —
 * peerId + multiaddrs, TTL-evicted — never any graph data. Search + fetch stay
 * peer-to-peer over libp2p. This replaces "join the public IPFS DHT" as the
 * default way peers find each other: one HTTPS round trip, no global DHT walk.
 *
 * Pure I/O, no libp2p types — the dial loop lives in tracker-rendezvous.ts.
 */
import { ResultAsync } from 'neverthrow';

export interface TrackerPeer {
  readonly peerId: string;
  readonly addrs: readonly string[];
}

export interface AnnounceResponse {
  readonly ok: boolean;
  readonly ttl: number;
  readonly peers: readonly TrackerPeer[];
}

const DEFAULT_TIMEOUT_MS = 4000;
export const DEFAULT_NAMESPACE = 'folklore';

/** Strip a trailing slash so `${base}/tracker/...` never doubles up. */
const normalizeBase = (url: string): string => url.replace(/\/+$/, '');

const isPeerArray = (v: unknown): v is TrackerPeer[] =>
  Array.isArray(v) &&
  v.every(
    (p) =>
      typeof p === 'object' &&
      p !== null &&
      typeof (p as TrackerPeer).peerId === 'string' &&
      Array.isArray((p as TrackerPeer).addrs),
  );

/**
 * Announce our dial addrs and read back the rest of the swarm. `announce`
 * doubles as fetch — the tracker returns the current peer list in the same
 * response (one round trip, matching a tracker announce/response).
 */
export const announce = (
  trackerUrl: string,
  namespace: string,
  peerId: string,
  addrs: readonly string[],
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): ResultAsync<AnnounceResponse, Error> =>
  ResultAsync.fromPromise(
    (async () => {
      const res = await fetch(`${normalizeBase(trackerUrl)}/tracker/announce`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ns: namespace, peerId, addrs }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`tracker announce HTTP ${res.status}`);
      const body = (await res.json()) as Partial<AnnounceResponse>;
      const peers = isPeerArray(body.peers) ? body.peers : [];
      return { ok: body.ok === true, ttl: typeof body.ttl === 'number' ? body.ttl : 0, peers };
    })(),
    (e) => (e instanceof Error ? e : new Error(String(e))),
  );

/** Read-only peer directory for a namespace (discover without announcing). */
export const fetchPeers = (
  trackerUrl: string,
  namespace: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): ResultAsync<readonly TrackerPeer[], Error> =>
  ResultAsync.fromPromise(
    (async () => {
      const url = `${normalizeBase(trackerUrl)}/tracker/peers?ns=${encodeURIComponent(namespace)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error(`tracker peers HTTP ${res.status}`);
      const body = (await res.json()) as { peers?: unknown };
      return isPeerArray(body.peers) ? body.peers : [];
    })(),
    (e) => (e instanceof Error ? e : new Error(String(e))),
  );
