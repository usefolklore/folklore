#!/usr/bin/env node
/**
 * Show the tracker's peer directory — who has announced themselves to the
 * folklore network. This is the discovery layer: peers register their dial
 * multiaddrs here (pointers only, no data) so others can find them without
 * any manual `peer add`.
 */
const TRACKER = process.env.FOLKLORE_TRACKER_URL || 'http://localhost:8790';
const NS = process.env.FOLKLORE_NS || 'folklore';

const C = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`, bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`, cyan: (s) => `\x1b[36m${s}\x1b[0m`, gray: (s) => `\x1b[90m${s}\x1b[0m`,
};

const res = await fetch(`${TRACKER}/tracker/peers?ns=${encodeURIComponent(NS)}`);
const { count, peers } = await res.json();

console.log();
console.log(`${C.cyan('🛰  tracker')}  ${C.dim(`${TRACKER}  ·  namespace=${NS}`)}`);
console.log(`${C.bold(`${count} peer${count === 1 ? '' : 's'} registered`)} ${C.dim('— found each other with zero peer-add:')}`);
for (const p of peers) {
  const relayed = p.addrs.some((a) => a.includes('p2p-circuit'));
  console.log(`   ${C.green('•')} ${C.bold(p.peerId.slice(0, 16))}…  ${relayed ? C.gray('[reachable via relay]') : C.gray('[direct]')}`);
}
console.log();
