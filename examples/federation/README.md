# Federation demo

The core of folklore: **the network resolves inference traces for you.**

![federation demo](federation.gif)

Two peers on loopback:

- **alice** — a peer who already debugged something yesterday and paid the tokens for it.
  Her daemon serves that trace over P2P.
- **bob** — you. Empty graph. When his agent hits the same question, folklore fans the
  query across connected peers, finds alice's trace, pulls it over
  `/folklore/fetch/1.0.0`, **verifies alice's signature**, and caches it locally — in
  ~1.3s, with zero web calls and zero re-inference. Ask again and it's bob's now,
  answered from his own graph. The knowledge compounded.

## Run it

```bash
cd examples/federation
bash setup.sh        # stand up alice's daemon + trace, dial bob to her (warms the path)
./resolve 'how do I fix the tokio spawn Send + static error sharing an Rc across await?'
./resolve 'how do I fix the tokio spawn Send + static error sharing an Rc across await?'   # 2nd time: local
bash teardown.sh     # stop alice's daemon, remove demo homes
```

## What's real here

Nothing is mocked. `resolve.mjs` calls the actual engine
(`folklore ask --peers --pull --json`) against a **live libp2p peer**. The peer id, the
`/folklore/fetch/1.0.0` transfer, the Ed25519 signature verification, and the pulled
node body all come off the wire. `source_peer` in the output is alice's real peer id;
`sig_valid: true` is a real attestation check; `cached: true` means the node is now in
bob's graph.

The demo is scoped for determinism, not faked:

- **Loopback + direct dial.** `setup.sh` disables the public IPFS DHT (`dht.public:
  false`) and mDNS, and dials alice by explicit multiaddr. In the wild, peers discover
  each other via the DHT / bootstrap peers instead.
- **Warm-up is paid off-camera.** A daemon lazy-loads its embedder + graph on the first
  P2P search (~50s cold). `setup.sh` fires one throwaway query to warm alice, then wipes
  bob's copy so the recorded resolve is a genuine fresh pull at the warm ~1.3s latency.

## Re-record the GIF

```bash
cd examples/federation
bash setup.sh
vhs demo.tape        # writes federation.gif
bash teardown.sh
```

Requires [`vhs`](https://github.com/charmbracelet/vhs) (`brew install vhs`).

## Files

| File | Role |
| --- | --- |
| `resolve.mjs` | bob's driver — asks the network, renders the peer-pull resolution |
| `resolve` | launcher that pins bob's `FOLKLORE_HOME` |
| `setup.sh` | stands up the two-peer network (alice daemon + trace, bob dials alice, warms the path) |
| `teardown.sh` | stops alice's daemon and removes the demo homes |
| `demo.tape` | VHS script that records the GIF |
