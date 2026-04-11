/**
 * Phase 6 acceptance test — daemon tick + discovery.
 *
 * Exercises:
 *   1. runOneTick runs triggerRoom for each room and writes reports
 *   2. PID file management (write, read, remove, isRunning)
 *   3. discover suggests sources matching room keywords
 *   4. config loader reads YAML with defaults
 */

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

import { fileGraphRepository } from '../src/infrastructure/graph-repository.js';
import { openSqliteVectorIndex } from '../src/infrastructure/vector-index.js';
import { fixtureEmbedder } from '../src/infrastructure/embedders.js';
import { httpFetcher } from '../src/infrastructure/http/fetcher.js';
import { xmlParser } from '../src/infrastructure/parsers/xml-parser.js';
import { readabilityExtractor } from '../src/infrastructure/parsers/html-extractor.js';
import { sourceRegistry } from '../src/infrastructure/sources/registry.js';
import { fileSourcesConfig } from '../src/infrastructure/sources-config.js';
import { fileRoomsConfig } from '../src/infrastructure/rooms-config.js';
import type { IngestDeps } from '../src/application/ingest.js';
import { runOneTick, writePid, readPid, removePid, type DaemonDeps } from '../src/daemon/loop.js';
import { loadConfig } from '../src/infrastructure/config-loader.js';
import { discover } from '../src/application/discover.js';

// ─────────────── fixtures ────────────────

const rssFixture = (): string => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Homelab Weekly</title>
    <item>
      <title>Mikrotik CHR explained</title>
      <link>https://example.com/homelab/mikrotik</link>
      <description>RouterOS in VMs with licensing tiers.</description>
    </item>
    <item>
      <title>10GbE DAC guide</title>
      <link>https://example.com/homelab/10gbe</link>
      <description>DAC cables vs fibre for homelab switching.</description>
    </item>
  </channel>
</rss>`;

// ─────────────── PID management ─────────

test('daemon: PID file write/read/remove cycle', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'wi-pid-'));
  try {
    assert.equal(readPid(tmp), null);
    writePid(tmp);
    const pid = readPid(tmp);
    assert.equal(pid, process.pid);
    removePid(tmp);
    assert.equal(readPid(tmp), null);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ─────────────── config loader ──────────

test('config: loads YAML with defaults', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'wi-cfg-'));
  try {
    // No config file → all defaults
    const defaults = (await loadConfig(join(tmp, 'config.yaml')))._unsafeUnwrap();
    assert.equal(defaults.daemon.interval_seconds, 86400);
    assert.equal(defaults.daemon.round_robin_rooms, true);
    assert.equal(defaults.tunnels.enabled, true);

    // Partial config → overrides + defaults
    writeFileSync(
      join(tmp, 'config.yaml'),
      'daemon:\n  interval_seconds: 3600\n  round_robin_rooms: false\n',
    );
    const partial = (await loadConfig(join(tmp, 'config.yaml')))._unsafeUnwrap();
    assert.equal(partial.daemon.interval_seconds, 3600);
    assert.equal(partial.daemon.round_robin_rooms, false);
    assert.equal(partial.daemon.max_parallel_sources, 8, 'unset field falls back to default');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ─────────────── one daemon tick ────────

test('daemon: runOneTick triggers rooms and writes reports', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'wi-daemon-'));
  const feedPath = join(tmp, 'feed.xml');
  writeFileSync(feedPath, rssFixture());

  try {
    const graphs = fileGraphRepository(join(tmp, 'graph.json'));
    const vectors = (await openSqliteVectorIndex({ path: join(tmp, 'vectors.db') }))._unsafeUnwrap();
    const embedder = fixtureEmbedder();
    const sources = fileSourcesConfig(join(tmp, 'sources.json'));
    const rooms = fileRoomsConfig(join(tmp, 'rooms.json'));
    const http = httpFetcher();
    const xml = xmlParser();
    const html = readabilityExtractor();
    const reg = sourceRegistry({ http, xml, html });
    const ingestDeps: IngestDeps = { graphs, vectors, embedder, sources, registry: reg };

    // Create a room + source
    (await rooms.create({
      id: 'homelab',
      name: 'Homelab',
      description: 'Home lab infra',
      keywords: ['proxmox', 'mikrotik'],
      created_at: '2026-04-11T00:00:00Z',
    }))._unsafeUnwrap();
    (await sources.add({
      id: 'homelab-weekly',
      kind: 'generic_rss',
      room: 'homelab',
      enabled: true,
      config: { feed_url: pathToFileURL(feedPath).toString(), max_items: 5 },
    }))._unsafeUnwrap();

    const daemonDeps: DaemonDeps = {
      ingestDeps,
      rooms,
      graphs,
      vectors,
      sources,
      config: {
        interval_seconds: 1,
        max_parallel_sources: 8,
        discovery_cadence: 5,
        round_robin_rooms: false,
      },
      homePath: tmp,
    };

    const tick = (await runOneTick(daemonDeps))._unsafeUnwrap();

    // Should have processed one room
    assert.equal(tick.rooms.length, 1);
    assert.equal(tick.rooms[0].room, 'homelab');
    assert.ok(tick.rooms[0].runs[0].items_new >= 2, `expected >= 2 new items, got ${tick.rooms[0].runs[0].items_new}`);

    // Report should have been written
    assert.ok(tick.reports_written.length >= 1, 'should write at least one report');
    assert.ok(existsSync(tick.reports_written[0]), `report file should exist: ${tick.reports_written[0]}`);
    const reportContent = readFileSync(tick.reports_written[0], 'utf8');
    assert.ok(reportContent.includes('Mikrotik'));

    // Daemon log should exist
    const logContent = readFileSync(join(tmp, 'daemon.log'), 'utf8');
    assert.ok(logContent.includes('tick: room=homelab'));

    vectors.close();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ─────────────── discovery ──────────────

test('discover: suggests sources matching room keywords', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'wi-discover-'));
  try {
    const rooms = fileRoomsConfig(join(tmp, 'rooms.json'));
    const sources = fileSourcesConfig(join(tmp, 'sources.json'));

    // Create a room with keywords matching known feeds
    (await rooms.create({
      id: 'ml-research',
      name: 'ML Research',
      description: 'Machine learning papers and tools',
      keywords: ['ai', 'ml', 'llm', 'embeddings'],
      created_at: '2026-04-11T00:00:00Z',
    }))._unsafeUnwrap();

    const suggestions = (await discover({ rooms, sources })('ml-research'))._unsafeUnwrap();
    assert.ok(suggestions.length >= 2, `expected >= 2 suggestions, got ${suggestions.length}`);

    // Should suggest arxiv and hn at minimum
    const kinds = suggestions.map((s) => s.descriptor.kind);
    assert.ok(kinds.includes('arxiv'), 'should suggest arxiv');
    assert.ok(kinds.includes('hn_algolia'), 'should suggest hn_algolia');

    // Should suggest matching RSS feeds
    const rssNames = suggestions
      .filter((s) => s.descriptor.kind === 'generic_rss')
      .map((s) => s.descriptor.id);
    assert.ok(rssNames.length >= 1, `expected >= 1 RSS suggestion, got ${rssNames.length}`);

    // Every suggestion should have a reason
    for (const s of suggestions) {
      assert.ok(s.reason.length > 0, `suggestion ${s.descriptor.id} should have a reason`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
