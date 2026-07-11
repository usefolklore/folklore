# Folklore relay node — a public, always-on circuit-relay-v2 server so peers
# behind CGNAT / symmetric NAT (who can never accept an inbound dial) get a
# reachable /…/p2p-circuit address. Leaf nodes reserve a slot here, advertise
# the relayed address to the tracker, and dcutr upgrades to a direct connection
# whenever the NAT permits; the genuinely-stuck pairs stay relayed. folklore
# payloads are KB-scale, so one modest box relays a large swarm.
#
# Like the bootstrap node, it generates its OWN libp2p identity on first boot
# into the mounted volume, so the peerId is stable across restarts and no key is
# baked into the image. Capture the peerId after first deploy (see README) and
# publish the multiaddr as the network default (FOLKLORE_RELAYS).
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends git python3 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# Build folklore from source (public repo). Pin to a tag/sha in prod.
RUN git clone --depth 1 https://github.com/usefolklore/folklore.git . \
  && npm ci \
  && npm run build

# Runtime data (identity) lives on a mounted volume so the peerId persists.
# Relay config: relay_server on, listen on all interfaces, DHT + tracker off
# (a relay is infrastructure, not a knowledge peer — it doesn't discover or
# hold graph data, it only forwards connections).
ENV FOLKLORE_HOME=/data
RUN mkdir -p /data && printf 'peer:\n  port: 4103\n  listen_host: "0.0.0.0"\n  mdns: false\n  upnp: false\n  relay_server: true\n  dht:\n    enabled: false\n    public: false\n  tracker:\n    url: ""\ndaemon:\n  interval_seconds: 3600\n' > /data/config.yaml

EXPOSE 4103
CMD ["node", "dist/cli/index.js", "daemon", "_run"]
