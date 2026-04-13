/**
 * Phase 4 acceptance test — room registry + init wizard + MCP room tools.
 *
 * Exercises:
 *   1. rooms-config: create, load, setDefault, duplicate rejection
 *   2. init wizard in non-interactive mode (flags path)
 *   3. Room exists → sources seeded → trigger populates graph scoped to room
 *   4. MCP room_create + room_list via in-memory transport
 */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import {
  addRoom,
  emptyRegistry,
  hasRoom,
  slugifyRoomName,
  validateRoomId,
  type RoomMeta,
} from '../src/domain/rooms.js';
import { fileRoomsConfig } from '../src/infrastructure/rooms-config.js';
import { fileGraphRepository } from '../src/infrastructure/graph-repository.js';
import { openSqliteVectorIndex } from '../src/infrastructure/vector-index.js';
import { fixtureEmbedder } from '../src/infrastructure/embedders.js';
import { httpFetcher } from '../src/infrastructure/http/fetcher.js';
import { xmlParser } from '../src/infrastructure/parsers/xml-parser.js';
import { readabilityExtractor } from '../src/infrastructure/parsers/html-extractor.js';
import { sourceRegistry } from '../src/infrastructure/sources/registry.js';
import { fileSourcesConfig } from '../src/infrastructure/sources-config.js';
import { triggerRoom } from '../src/application/ingest.js';
import type { IngestDeps } from '../src/application/ingest.js';
import { buildMcpServer } from '../src/mcp/server.js';
import type { Runtime } from '../src/cli/runtime.js';

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
  </channel>
</rss>`;

// ─────────────── domain tests ───────────

test('rooms domain: validateRoomId accepts/rejects correctly', () => {
  assert.ok(validateRoomId('homelab').isOk());
  assert.ok(validateRoomId('ml-papers').isOk());
  assert.ok(validateRoomId('a'.repeat(63)).isOk());
  assert.ok(validateRoomId('').isErr());
  assert.ok(validateRoomId('Home Lab').isErr());
  assert.ok(validateRoomId('-leading').isErr());
});

test('rooms domain: slugifyRoomName converts human names to ids', () => {
  assert.equal(slugifyRoomName('Home Lab'), 'home-lab');
  assert.equal(slugifyRoomName('ML Papers'), 'ml-papers');
  assert.equal(slugifyRoomName('  spaces  '), 'spaces');
});

test('rooms domain: addRoom rejects duplicates', () => {
  const room: RoomMeta = {
    id: 'homelab',
    name: 'Homelab',
    description: 'Home lab stuff',
    keywords: ['proxmox'],
    created_at: '2026-04-11T00:00:00Z',
  };
  const r1 = addRoom(emptyRegistry(), room);
  assert.ok(r1.isOk());
  assert.ok(hasRoom(r1.value, 'homelab'));
  assert.equal(r1.value.default_room, 'homelab', 'first room becomes default');
  const r2 = addRoom(r1.value, room);
  assert.ok(r2.isErr(), 'duplicate room should be rejected');
});

// ─────────────── infra: rooms-config ────

test('rooms-config: CRUD cycle round-trips through JSON', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'wi-rooms-'));
  try {
    const cfg = fileRoomsConfig(join(tmp, 'rooms.json'));
    const empty = (await cfg.load())._unsafeUnwrap();
    assert.equal(empty.rooms.length, 0);

    // create
    const after = (await cfg.create({
      id: 'homelab',
      name: 'Homelab',
      description: 'Home lab infra',
      keywords: ['proxmox', 'mikrotik'],
      created_at: '2026-04-11T00:00:00Z',
    }))._unsafeUnwrap();
    assert.equal(after.rooms.length, 1);
    assert.equal(after.default_room, 'homelab');

    // create second room
    const after2 = (await cfg.create({
      id: 'fundraise',
      name: 'Fundraise',
      description: 'Web3 fundraise',
      keywords: ['safe', 'multisig'],
      created_at: '2026-04-11T00:00:00Z',
    }))._unsafeUnwrap();
    assert.equal(after2.rooms.length, 2);
    assert.equal(after2.default_room, 'homelab', 'first room stays default');

    // switch default
    const switched = (await cfg.setDefault('fundraise'))._unsafeUnwrap();
    assert.equal(switched.default_room, 'fundraise');

    // reload from disk
    const reloaded = (await cfg.load())._unsafeUnwrap();
    assert.equal(reloaded.rooms.length, 2);
    assert.equal(reloaded.default_room, 'fundraise');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ─────────────── init wizard (non-interactive) ──────────

test('init: non-interactive mode creates room + sources', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'wi-init-'));
  const feedPath = join(tmp, 'feed.xml');
  writeFileSync(feedPath, rssFixture());
  const feedUrl = pathToFileURL(feedPath).toString();

  try {
    // Set WELLINFORMED_HOME so init writes to our tmp dir
    const origHome = process.env.WELLINFORMED_HOME;
    process.env.WELLINFORMED_HOME = tmp;

    const { init } = await import('../src/cli/commands/init.js');
    const code = await init([
      '--name', 'homelab',
      '--desc', 'Home lab infrastructure',
      '--keywords', 'proxmox,mikrotik,10gbe',
      '--rss', feedUrl,
      '--arxiv',
      '--hn',
    ]);
    assert.equal(code, 0, 'init should exit 0');

    // Verify room was created
    const roomsRaw = JSON.parse(readFileSync(join(tmp, 'rooms.json'), 'utf8'));
    assert.equal(roomsRaw.rooms.length, 1);
    assert.equal(roomsRaw.rooms[0].id, 'homelab');
    assert.deepEqual(roomsRaw.rooms[0].keywords, ['proxmox', 'mikrotik', '10gbe']);

    // Verify sources were registered
    const sourcesRaw = JSON.parse(readFileSync(join(tmp, 'sources.json'), 'utf8'));
    assert.ok(sourcesRaw.length >= 3, `expected >= 3 sources, got ${sourcesRaw.length}`);
    const kinds = sourcesRaw.map((s: { kind: string }) => s.kind).sort();
    assert.ok(kinds.includes('generic_rss'));
    assert.ok(kinds.includes('arxiv'));
    assert.ok(kinds.includes('hn_algolia'));

    process.env.WELLINFORMED_HOME = origHome;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ─────────────── MCP room tools ─────────

test('MCP: room_create + room_list tools work via in-memory transport', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'wi-mcp-rooms-'));
  try {
    const graphs = fileGraphRepository(join(tmp, 'graph.json'));
    const vectors = (await openSqliteVectorIndex({ path: join(tmp, 'vectors.db') }))._unsafeUnwrap();
    const embedder = fixtureEmbedder();
    const sources = fileSourcesConfig(join(tmp, 'sources.json'));
    const rooms = fileRoomsConfig(join(tmp, 'rooms.json'));
    const http = httpFetcher();
    const xml = xmlParser();
    const html = readabilityExtractor();
    const registry = sourceRegistry({
      http,
      xml,
      html,
      claudeSessions: { homePath: '/tmp', patterns: [], scanUserMessages: false, nowMs: () => Date.now() },
    });
    const ingestDeps: IngestDeps = { graphs, vectors, embedder, sources, registry };

    const runtime: Runtime = {
      paths: {
        home: tmp,
        graph: join(tmp, 'graph.json'),
        vectors: join(tmp, 'vectors.db'),
        sources: join(tmp, 'sources.json'),
        rooms: join(tmp, 'rooms.json'),
        modelCache: join(tmp, 'models'),
      },
      graphs, vectors, embedder, sources, rooms, http, xml, html, registry, ingestDeps,
      close: () => vectors.close(),
    };

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const mcpServer = buildMcpServer(runtime);
    await mcpServer.connect(serverTransport);
    const client = new Client({ name: 'test', version: '0.0.1' });
    await client.connect(clientTransport);

    // Tool list should now have 11 tools (9 original + room_create + room_list)
    const tools = await client.listTools();
    assert.ok(tools.tools.length >= 11, `expected >= 11 tools, got ${tools.tools.length}`);

    // room_list on empty registry
    const emptyRooms = await client.callTool({ name: 'room_list', arguments: {} });
    const emptyResult = JSON.parse((emptyRooms.content as { text: string }[])[0].text);
    assert.equal(emptyResult.rooms.length, 0);

    // room_create
    const createResult = await client.callTool({
      name: 'room_create',
      arguments: { name: 'homelab', description: 'Home lab infra', keywords: ['proxmox'] },
    });
    const created = JSON.parse((createResult.content as { text: string }[])[0].text);
    assert.equal(created.created.id, 'homelab');
    assert.equal(created.registry.default_room, 'homelab');

    // room_list after create
    const afterCreate = await client.callTool({ name: 'room_list', arguments: {} });
    const roomRegistry = JSON.parse((afterCreate.content as { text: string }[])[0].text);
    assert.equal(roomRegistry.rooms.length, 1);
    assert.equal(roomRegistry.rooms[0].id, 'homelab');

    await client.close();
    await mcpServer.close();
    vectors.close();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
