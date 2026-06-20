# Folklore bootstrap node

A public, always-on libp2p seed peer. Fresh installs dial it (via
`FOLKLORE_BOOTSTRAP_PEERS` / `config.yaml peer.dht.bootstrap_peers`) and join the
federation automatically — this is what makes "compounds across peers"
present-tense true. Federation is already default-on in the client; it just needs
a node to reach.

## Status
- A local node is already running on the maintainer's machine (LAN-reachable,
  identity `12D3KooWEWD7YCu4RH9bbWQd3z8xUyDa2Lqzf5umvscQs4LbaHKa`) — fine for
  LAN/dev, but NAT'd, so NOT a public bootstrap. Production needs a public host.
- This dir deploys that public host. It generates its OWN stable identity on the
  volume (no private key in the image or repo).

## Deploy (Fly.io — easiest public, always-on, raw-TCP)
```bash
cd deploy/bootstrap
fly apps create folklore-bootstrap
fly volumes create folklore_data --size 1 --region iad
fly deploy
```
Any Docker host works too (VPS, etc.): `docker build -t folklore-bootstrap . &&
docker run -p 4103:4103 -v folklore_data:/data folklore-bootstrap`.

## After first deploy — capture the peerId, publish the multiaddr
```bash
# peerId the node generated on the volume:
fly ssh console -C "node /app/dist/cli/index.js identity" | grep -i peer
# or from the boot log:
fly logs | grep "p2p listening"     # -> /ip4/.../tcp/4103/p2p/<PEER_ID>
```
Then make it the network default (one of):
- DNS: point `seed.usefolklore.sh` at the Fly app, and publish
  `FOLKLORE_BOOTSTRAP_PEERS="/dns4/seed.usefolklore.sh/tcp/4103/p2p/<PEER_ID>"`.
- Or commit it as the shipped default in `config.example.yaml`
  (`peer.dht.bootstrap_peers`) and the installer env, so every install joins with
  no setup.

## Verify federation end-to-end
```bash
# On any second machine with folklore installed:
export FOLKLORE_BOOTSTRAP_PEERS="/dns4/seed.usefolklore.sh/tcp/4103/p2p/<PEER_ID>"
folklore daemon start
folklore peer list        # should show the bootstrap node within ~30s
```

## Notes
- The node runs the full daemon (it also fetches its own sources); for a
  pure seed you can ignore its graph — peers only use it for discovery + sync.
- Keep the volume: it holds the identity. Losing it changes the peerId and breaks
  the published multiaddr.
- Security: the node accepts inbound peer connections on 4103. That's the point;
  private/session nodes still never federate (secret-scan + `private:true` gates).
