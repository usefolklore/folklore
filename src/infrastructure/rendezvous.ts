// Public-DHT rendezvous (DISC-04). When `peer.dht.public` is on, folklore joins
// the public IPFS Amino DHT (protocol /ipfs/kad/1.0.0, wired in peer-transport).
// Being on that DHT only gives peer *routing* — finding a peer once you know its
// id. To DISCOVER other folklore peers among millions of unrelated IPFS nodes we
// use the standard content-routing rendezvous trick: every folklore node
// `provide()`s a single deterministic CID and `findProviders()` the same CID.
// The providers of that CID ARE the folklore network, so a brand-new node finds
// its first peers with ZERO folklore-owned infrastructure — no central seed, no
// bootstrap node we have to run. After first contact, normal peer-exchange takes
// over and the rendezvous is just a periodic refresh.
//
// This file is intentionally side-effect-light and dependency-injected so the
// tick is unit-testable against a mock DHT (see tests/rendezvous.test.ts).
import { CID } from 'multiformats/cid';
import { sha256 } from 'multiformats/hashes/sha2';
import * as raw from 'multiformats/codecs/raw';
import type { Libp2p, PeerId, PeerInfo } from '@libp2p/interface';

/** Namespace hashed into the rendezvous CID. Bumping the version segment forks
 * the discovery network (v5 matches the federation wire-protocol version). */
const RENDEZVOUS_NAMESPACE = 'folklore/federation/v5';

/** Default refresh cadence ONCE peers are connected. Provider records on the
 * Amino DHT expire on the order of a day; 5 min keeps discovery responsive for
 * fresh nodes without spamming. */
export const RENDEZVOUS_INTERVAL_MS = 5 * 60_000;

/** Search cadence while the node has ZERO peers. A fresh node must not wait the
 * full steady interval to make first contact — it retries fast, then backs off
 * exponentially up to a cap so an offline node doesn't spin the DHT. */
export const RENDEZVOUS_SEARCH_INTERVAL_MS = 15_000;
export const RENDEZVOUS_SEARCH_BACKOFF_MAX_MS = 2 * 60_000;

/** L-2 — max fresh peers dialed per rendezvous round. Bounds the Sybil
 * dial-amplifier on the fixed, publicly-computable rendezvous CID. */
export const MAX_DIALS_PER_ROUND = Number(process.env.FOLKLORE_RENDEZVOUS_MAX_DIALS ?? 8);

export interface RendezvousCadence {
  /** Refresh interval once at least one peer is connected. */
  readonly steadyMs: number;
  /** Base retry interval while peerless (search mode). */
  readonly searchMs: number;
  /** Cap on the exponentially-backed-off search retry. */
  readonly backoffMaxMs: number;
}

/**
 * Next delay before the following rendezvous round. Pure + total so the
 * search-until-found schedule is unit-tested without timers:
 *   - peers connected      → steady refresh (relax)
 *   - peerless, round N     → searchMs · 2^N, capped at backoffMaxMs
 * `emptyRounds` is the count of consecutive peerless rounds so far (0 on the
 * first peerless round → searchMs exactly).
 */
export const nextRendezvousDelay = (
  peerCount: number,
  emptyRounds: number,
  cadence: RendezvousCadence,
): number => {
  if (peerCount > 0) return cadence.steadyMs;
  const factor = 2 ** Math.max(0, emptyRounds);
  return Math.min(cadence.searchMs * factor, cadence.backoffMaxMs);
};

/** The single CID every folklore node provides + queries on the public DHT.
 * Pure and stable: same namespace → same CID on every node, forever, so two
 * nodes that never met still rendezvous on the same key. */
export const folkloreRendezvousCid = async (): Promise<CID> => {
  const digest = await sha256.digest(new TextEncoder().encode(RENDEZVOUS_NAMESPACE));
  return CID.createV1(raw.code, digest);
};

/** Minimal slice of the kad-dht service the rendezvous needs. Both methods are
 * async-iterable query streams; we drain `provide` and read provider events off
 * `findProviders`. Typed structurally so a mock satisfies it in tests. */
export interface RendezvousDht {
  provide(key: CID): AsyncIterable<unknown>;
  findProviders(key: CID): AsyncIterable<{ readonly name?: string; readonly providers?: readonly PeerInfo[] }>;
}

/** The node surface the rendezvous drives. A structural subset of Libp2p so the
 * tick is testable without standing up a real libp2p node. */
export type RendezvousNode = Pick<Libp2p, 'dial' | 'peerId' | 'getPeers'> & {
  readonly services: { readonly dht?: RendezvousDht };
};

export interface RendezvousDeps {
  readonly node: RendezvousNode;
  readonly log: (msg: string) => void;
  /** Steady refresh cadence once peers are connected (tests use a short value). */
  readonly intervalMs?: number;
  /** Fast retry cadence while the node is peerless (search mode). */
  readonly searchIntervalMs?: number;
  /** Cap on the backed-off search retry. */
  readonly searchBackoffMaxMs?: number;
}

export interface RendezvousHandle {
  readonly stop: () => void;
}

/** One rendezvous round: announce ourselves, then dial any not-yet-connected
 * folklore peers the DHT returns. Best-effort throughout — a failed provide or a
 * dead provider never throws; it's logged and the loop continues. Returns the
 * number of peers newly dialed (for logging / tests). */
export const rendezvousTick = async (deps: RendezvousDeps, cid: CID): Promise<number> => {
  const dht = deps.node.services.dht;
  if (!dht) return 0;
  const self: PeerId = deps.node.peerId;

  // Announce: drain the provide() query stream so the provider record actually
  // lands on the closest DHT servers.
  try {
    for await (const _evt of dht.provide(cid)) { /* drain */ }
  } catch (e) {
    deps.log(`rendezvous: provide failed (${(e as Error).message})`);
  }

  // Discover + dial. Skip ourselves and peers we're already connected to.
  const connected = new Set(deps.node.getPeers().map((p) => p.toString()));
  let dialed = 0;
  try {
    // L-2 — cap dials per round. The CID is a fixed constant any party can
    // compute, so an attacker can flood the provider set with Sybil peerIds;
    // dialing every returned provider is an unbounded outbound-dial amplifier
    // each tick. Stop after MAX_DIALS_PER_ROUND fresh dials.
    outer: for await (const evt of dht.findProviders(cid)) {
      for (const provider of evt.providers ?? []) {
        if (dialed >= MAX_DIALS_PER_ROUND) break outer;
        const id = provider.id.toString();
        if (provider.id.equals(self) || connected.has(id)) continue;
        connected.add(id);
        try {
          await deps.node.dial(provider.id);
          dialed += 1;
          deps.log(`rendezvous: dialed folklore peer ${id}`);
        } catch (e) {
          deps.log(`rendezvous: dial ${id} failed (${(e as Error).message})`);
        }
      }
    }
  } catch (e) {
    deps.log(`rendezvous: findProviders failed (${(e as Error).message})`);
  }
  return dialed;
};

/** Start the periodic rendezvous loop. Self-scheduling via setTimeout (not
 * setInterval) so a slow DHT round can never overlap itself. `unref()` keeps the
 * timer from pinning the daemon's event loop. Returns a stop handle wired into
 * the daemon cleanup. */
export const startRendezvous = (deps: RendezvousDeps): RendezvousHandle => {
  const cadence: RendezvousCadence = {
    steadyMs: deps.intervalMs ?? RENDEZVOUS_INTERVAL_MS,
    searchMs: deps.searchIntervalMs ?? RENDEZVOUS_SEARCH_INTERVAL_MS,
    backoffMaxMs: deps.searchBackoffMaxMs ?? RENDEZVOUS_SEARCH_BACKOFF_MAX_MS,
  };
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let emptyRounds = 0;
  const cidPromise = folkloreRendezvousCid();

  const loop = async (): Promise<void> => {
    if (stopped) return;
    try {
      await rendezvousTick(deps, await cidPromise);
    } catch (e) {
      deps.log(`rendezvous: tick error (${(e as Error).message})`);
    }
    if (stopped) return;

    // Adaptive schedule: keep searching FAST until first contact, then relax
    // to the steady refresh. `getPeers()` reflects live connections after the
    // tick's dials, so the cadence reacts to whether we actually found anyone.
    const peerCount = deps.node.getPeers().length;
    emptyRounds = peerCount > 0 ? 0 : emptyRounds + 1;
    const delay = nextRendezvousDelay(peerCount, emptyRounds - 1, cadence);
    if (peerCount === 0) {
      deps.log(`rendezvous: no peers yet — searching again in ${Math.round(delay / 1000)}s (attempt ${emptyRounds})`);
    }
    timer = setTimeout(() => { void loop(); }, delay);
    timer.unref?.();
  };

  void loop();
  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
};
