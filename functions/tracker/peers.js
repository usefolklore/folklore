/**
 * GET /tracker/peers?ns=<namespace>
 *
 * Read-only peer directory for a namespace. Used by nodes that only want to
 * discover (leaf / query-only) without announcing a dial address of their own.
 *
 * Binding required: TRACKER_KV (Workers KV namespace).
 */
import {
  MAX_PEERS_RETURNED,
  json,
  kvPrefix,
  validNamespace,
} from './_common.js';

export const onRequestGet = async (context) => {
  const { request, env } = context;
  if (!env.TRACKER_KV) return json({ error: 'tracker KV not bound' }, 500);

  const ns = new URL(request.url).searchParams.get('ns');
  if (!validNamespace(ns)) return json({ error: 'invalid ns' }, 400);

  const { keys } = await env.TRACKER_KV.list({ prefix: kvPrefix(ns), limit: 1000 });
  const peers = [];
  for (const k of keys) {
    if (peers.length >= MAX_PEERS_RETURNED) break;
    const val = await env.TRACKER_KV.get(k.name);
    if (!val) continue;
    try {
      const p = JSON.parse(val);
      peers.push({ peerId: p.peerId, addrs: p.addrs });
    } catch {
      /* skip malformed */
    }
  }
  return json({ ns, count: peers.length, peers });
};
