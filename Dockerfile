FROM node:22-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
# Full install, not --omit=dev: `npm run build` below needs tsc, a devDependency.
# Omitting dev deps here is what broke the image with `tsc: not found`.
RUN npm ci

COPY . .
RUN npm run build
RUN bash scripts/bootstrap.sh

ENV FOLKLORE_HOME=/data
VOLUME /data

ENTRYPOINT ["node", "bin/folklore.js"]
CMD ["daemon", "start"]
