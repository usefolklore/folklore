# Folklore bootstrap node — a public, always-on libp2p seed peer so fresh
# installs join the federation automatically (FOLKLORE_BOOTSTRAP_PEERS).
#
# It generates its OWN libp2p identity on first boot into the mounted volume
# (FOLKLORE_HOME), so the peerId is stable across restarts and no private key is
# baked into the image or the repo. Capture the peerId after first deploy (see
# README) and publish the multiaddr as the network default.
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends git python3 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# Build folklore from source (the repo is public). Pin to a tag/sha in prod.
RUN git clone --depth 1 https://github.com/usefolklore/folklore.git . \
  && npm ci \
  && npm run build

# Runtime data (identity, peers.json, graph) lives on a mounted volume so the
# peerId persists. Bootstrap config: fixed port, listen on all interfaces.
ENV FOLKLORE_HOME=/data
RUN mkdir -p /data && printf 'peer:\n  port: 4103\n  listen_host: "0.0.0.0"\n  mdns: false\n  upnp: false\ndaemon:\n  interval_seconds: 3600\n' > /data/config.yaml

EXPOSE 4103
# Foreground daemon (it materialises the identity on first run, then listens).
CMD ["node", "dist/cli/index.js", "daemon", "_run"]
