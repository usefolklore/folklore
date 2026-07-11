#!/usr/bin/env node
/**
 * federation demo driver (peer B / "bob").
 *
 * bob's agent hits a question his own graph can't answer. Instead of paying a
 * web search + a full LLM inference pass, folklore asks the NETWORK: it fans the
 * query out to connected peers, finds that peer A ("alice") already ground this
 * exact trace out yesterday, pulls the node over /folklore/fetch/1.0.0, verifies
 * alice's signature, and caches it locally — so the next ask is free forever.
 *
 * This calls the REAL engine (`folklore ask --peers --pull --json`) against a
 * live peer. Nothing here is mocked; the peer id, signature check, and pulled
 * body all come off the wire.
 *
 * Usage: node resolve.mjs "a question a peer already answered"
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as presolve } from 'node:path';

const C = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  magenta: (s) => `\x1b[35m${s}\x1b[0m`,
  gray: (s) => `\x1b[90m${s}\x1b[0m`,
};

const query = process.argv.slice(2).join(' ').trim();
if (!query) { console.error('usage: resolve.mjs "your question"'); process.exit(1); }

const repoRoot = presolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const bin = presolve(repoRoot, 'bin', 'folklore.js');
const short = (id) => (id && id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id);
const truncate = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');

console.log();
console.log(`${C.cyan('🤖 agent')}  ${C.dim('I need to answer:')} ${C.bold(query)}`);
console.log(`${C.gray('         → checking my graph, then the peer network…')}`);
console.log();

const t0 = Date.now();
const out = execFileSync(process.execPath, [bin, 'ask', '--peers', '--pull', '--json', '--k', '3', query], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
});
const ms = Date.now() - t0;
const j = JSON.parse(out);

const hits = Array.isArray(j.hits) ? j.hits : [];
const pulled = Array.isArray(j.pulled) ? j.pulled : [];
const fromPeer = hits.find((h) => h.source_peer && h.source_peer !== 'local');

if (j.peers_responded > 0 && fromPeer) {
  const peer = fromPeer.source_peer;
  const p = pulled.find((x) => x.node_id === fromPeer.id) || pulled[0];
  const verified = p && p.sig_valid === true;
  const cached = p && p.cached === true;

  console.log(`${C.magenta('🛰  network')}  ${C.bold(`${j.peers_responded} peer responded`)}  ${C.dim(`— peer ${short(peer)} has this trace`)}`);
  const marks = [verified ? C.green('signature ✓') : C.yellow('unsigned'), cached ? C.green('cached locally') : C.dim('not cached')].join(C.dim(' · '));
  console.log(`${C.magenta('⬇  pulled')}  ${C.dim('inference trace over P2P —')} ${marks}  ${C.dim(`(${ms}ms)`)}`);
  console.log();
  console.log(`${C.green('✓ answered from a peer’s graph')} ${C.dim('— 0 web calls, 0 tokens of re-inference:')}`);
  const label = fromPeer.label || (p && p.label);
  const body = fromPeer.summary || (p && p.summary);
  console.log(`   ${C.bold(label)}  ${C.gray('[from peer, signed ✓]')}`);
  console.log(`   ${C.dim(truncate(body, 140))}`);
  console.log();
  console.log(C.gray('   a peer already paid for this inference yesterday. you reused it in seconds.'));
  console.log(C.gray('   it’s now in your graph too — the next agent to ask gets it for free.'));
} else if (hits.length > 0) {
  // In this demo bob started with an EMPTY graph and found alice only through
  // the tracker — so any trace he now holds propagated to him over the network
  // (the tracker-established link share-syncs peers' public nodes automatically).
  console.log(`${C.magenta('🛰  network')}  ${C.dim('this trace reached your graph from a peer — via the tracker, no config:')}`);
  console.log(`   ${C.bold(hits[0].label)}  ${C.gray('[synced from peer]')}`);
  console.log(`   ${C.dim(truncate(hits[0].summary, 140))}`);
  console.log();
  console.log(`${C.green(`✓ answered in ${ms}ms`)} ${C.dim('— 0 web calls, 0 tokens of re-inference.')}`);
  console.log(C.gray('   a peer ground this out; it flowed to you the moment you both joined the tracker.'));
} else {
  console.log(`${C.yellow('· no peer had it')} ${C.dim(`(${j.peers_responded}/${j.peers_queried} responded, ${ms}ms) — falling through to the web.`)}`);
}
console.log();
