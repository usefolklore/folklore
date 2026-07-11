#!/usr/bin/env node
/**
 * Local folklore tracker for the demo — same HTTP contract as the deployed
 * Cloudflare Pages Functions (functions/tracker/*), backed by an in-memory Map
 * instead of KV. It imports the REAL validation from functions/tracker/_common.js
 * so the demo exercises the shipped rules (self-addressed multiaddrs only,
 * peerId/namespace gating, TTL eviction).
 *
 * This lets the demo show tracker-based discovery with zero external infra —
 * in production this same contract runs on usefolklore.com/tracker/*.
 *
 * Usage: node tracker.mjs [port]   (default 8790)
 */
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const {
  PEER_TTL_SECONDS, kvKey, kvPrefix, validNamespace, validPeerId, sanitizeAddrs,
} = await import(resolve(repoRoot, 'functions', 'tracker', '_common.js'));

const port = Number(process.argv[2] ?? 8790);
const store = new Map(); // key -> { value, expiresAt }
const put = (k, v, ttl) => store.set(k, { value: v, expiresAt: Date.now() + ttl * 1000 });
const get = (k) => { const e = store.get(k); if (!e) return null; if (Date.now() > e.expiresAt) { store.delete(k); return null; } return e.value; };
const list = (prefix) => [...store.keys()].filter((k) => k.startsWith(prefix));
const send = (res, status, obj) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };

const listPeers = (ns, exclude) => {
  const peers = [];
  for (const name of list(kvPrefix(ns))) {
    const v = get(name); if (!v) continue;
    const p = JSON.parse(v);
    if (p.peerId === exclude) continue;
    peers.push({ peerId: p.peerId, addrs: p.addrs });
  }
  return peers;
};

createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (req.method === 'POST' && url.pathname === '/tracker/announce') {
    let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => {
      let body; try { body = JSON.parse(raw); } catch { return send(res, 400, { error: 'invalid json' }); }
      const { ns, peerId, addrs } = body ?? {};
      if (!validNamespace(ns)) return send(res, 400, { error: 'invalid ns' });
      if (!validPeerId(peerId)) return send(res, 400, { error: 'invalid peerId' });
      const clean = sanitizeAddrs(addrs, peerId);
      if (clean.length === 0) return send(res, 400, { error: 'no valid self-addressed multiaddrs' });
      put(kvKey(ns, peerId), JSON.stringify({ peerId, addrs: clean, ts: Date.now() }), PEER_TTL_SECONDS);
      return send(res, 200, { ok: true, ttl: PEER_TTL_SECONDS, peers: listPeers(ns, peerId) });
    });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/tracker/peers') {
    const ns = url.searchParams.get('ns');
    if (!validNamespace(ns)) return send(res, 400, { error: 'invalid ns' });
    const peers = listPeers(ns, null);
    return send(res, 200, { ns, count: peers.length, peers });
  }
  send(res, 404, { error: 'not found' });
}).listen(port, () => console.log(`folklore tracker (demo) on http://localhost:${port}`));
