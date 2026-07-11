# Network demo — discovery through a tracker

How folklore peers **find each other with zero configuration**: no `peer add`,
no LAN, no public DHT. Each node is pointed at one tracker URL; the tracker is a
BitTorrent-style rendezvous that holds peer pointers (dial multiaddrs) and
nothing else. Once two peers discover each other there, their public traces
share-sync automatically — so a question one peer researched is instantly
answerable by the other.

![network demo](network.gif)

- **tracker** — the rendezvous (peer directory). In production it runs on
  `usefolklore.com/tracker/*` (Cloudflare Pages Functions, `functions/tracker/`);
  this demo runs the identical contract locally so it's self-contained.
- **alice** — a peer who already ground out an inference trace.
- **bob** — empty graph. Started with only a tracker URL, he finds alice, and
  alice's trace reaches his graph over the tracker-established link.

## Run it

```bash
cd examples/network
bash setup.sh          # start the tracker + alice (with a trace) + bob, all via the tracker
./peers                # the tracker directory: both auto-registered, zero peer-add
./resolve 'how do I fix the tokio spawn Send + static error sharing an Rc across await?'
bash teardown.sh       # stop everything, remove demo homes
```

## What's real here

Not mocked. `tracker.mjs` imports the **real validation** from
`functions/tracker/_common.js` (the same code that runs on Cloudflare), so
announces are gated exactly as in production — self-addressed multiaddrs only,
peerId/namespace checks, TTL eviction. `./peers` shows the actual tracker
directory; `./resolve` calls the real engine.

`alice/config.yaml` and `bob/config.yaml` contain **no `peers` list** — only a
`tracker.url`. Discovery is 100% the tracker. `mdns` and the DHT are off.

The demo is scoped for determinism: loopback, a local tracker, and alice's
daemon is warmed off-camera (a daemon lazy-loads its embedder + graph on first
use). Everything else is the real path.

## How this relates to the other demos

- [`../federation/`](../federation/) — the **resolve** half: one peer actively
  pulls another's trace over P2P (signature-verified), with `peer add`.
- **this demo** — the **discovery** half: peers find each other through the
  tracker with no `peer add`, and knowledge propagates automatically.
- Deployment of the tracker + a NAT relay: `functions/tracker/` and
  `deploy/relay/`.

## Files

| File | Role |
| --- | --- |
| `tracker.mjs` | local tracker (real validation, in-memory store) |
| `peers` / `peers.mjs` | pretty-print the tracker's peer directory |
| `resolve` / `resolve.mjs` | bob's resolver — renders the network answer |
| `setup.sh` / `teardown.sh` | stand up / tear down the two-peer network |
| `demo.tape` | VHS script that records the GIF |
