/**
 * POST /tracker/announce
 *
 * Body: { ns: string, peerId: string, addrs: string[] }
 * Writes the peer's pointer to KV (TTL-bounded) and returns the current peer
 * list for that namespace — announce doubles as fetch, saving a round trip
 * (same shape as a BitTorrent tracker announce response).
 *
 * Binding required: TRACKER_KV (Workers KV namespace).
 */
import {
  PEER_TTL_SECONDS,
  MAX_BODY_BYTES,
  MAX_PEERS_RETURNED,
  json,
  kvKey,
  kvPrefix,
  validNamespace,
  validPeerId,
  sanitizeAddrs,
} from './_common.js';

export const onRequestOptions = () =>
  new Response(null, {
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '86400',
    },
  });

export const onRequestPost = async (context) => {
  const { request, env } = context;
  if (!env.TRACKER_KV) return json({ error: 'tracker KV not bound' }, 500);

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: 'body too large' }, 413);

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  const { ns, peerId, addrs } = body ?? {};
  if (!validNamespace(ns)) return json({ error: 'invalid ns' }, 400);
  if (!validPeerId(peerId)) return json({ error: 'invalid peerId' }, 400);

  const clean = sanitizeAddrs(addrs, peerId);
  if (clean.length === 0) return json({ error: 'no valid self-addressed multiaddrs' }, 400);

  const now = Date.now();
  await env.TRACKER_KV.put(
    kvKey(ns, peerId),
    JSON.stringify({ peerId, addrs: clean, ts: now }),
    { expirationTtl: PEER_TTL_SECONDS },
  );

  // Return the rest of the swarm (excluding the announcer).
  const peers = await listPeers(env.TRACKER_KV, ns, peerId);
  return json({ ok: true, ttl: PEER_TTL_SECONDS, peers });
};

const listPeers = async (kv, ns, excludePeerId) => {
  const { keys } = await kv.list({ prefix: kvPrefix(ns), limit: 1000 });
  const peers = [];
  for (const k of keys) {
    if (peers.length >= MAX_PEERS_RETURNED) break;
    const val = await kv.get(k.name);
    if (!val) continue;
    try {
      const p = JSON.parse(val);
      if (p.peerId === excludePeerId) continue;
      peers.push({ peerId: p.peerId, addrs: p.addrs });
    } catch {
      /* skip malformed */
    }
  }
  return peers;
};
