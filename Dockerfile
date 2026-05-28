FROM node:22-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .
RUN npm run build
RUN bash scripts/bootstrap.sh

ENV AKASHIK_HOME=/data
VOLUME /data

ENTRYPOINT ["node", "bin/akashik.js"]
CMD ["daemon", "start"]
