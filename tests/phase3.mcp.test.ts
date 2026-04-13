/**
 * Phase 3 acceptance test — MCP server via in-memory transport.
 *
 * Uses the SDK's InMemoryTransport to talk to the MCP server
 * in-process — no child process, no stdio framing, no timeouts
 * from process spawn. Verifies:
 *
 *   1. 9 tools registered
 *   2. graph_stats on empty graph → zeros
 *   3. trigger_room seeds data from a file:// RSS fixture
 *   4. search returns the seeded items in the correct room
 *   5. get_node returns the correct node attributes
 *   6. list_rooms shows the room
 *   7. graph_stats shows non-zero counts after seeding
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { fileGraphRepository } from '../src/infrastructure/graph-repository.js';
import { openSqliteVectorIndex } from '../src/infrastructure/vector-index.js';
import { fixtureEmbedder } from '../src/infrastructure/embedders.js';
import { httpFetcher } from '../src/infrastructure/http/fetcher.js';
import { xmlParser } from '../src/infrastructure/parsers/xml-parser.js';
import { readabilityExtractor } from '../src/infrastructure/parsers/html-extractor.js';
import { sourceRegistry } from '../src/infrastructure/sources/registry.js';
import { fileSourcesConfig } from '../src/infrastructure/sources-config.js';
import type { Runtime } from '../src/cli/runtime.js';
import type { IngestDeps } from '../src/application/ingest.js';
import { startMcpServer } from '../src/mcp/server.js';

// ─────────────── fixture ────────────────

const rssFixture = (): string => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Homelab Weekly</title>
    <item>
      <title>Mikrotik CHR licensing explained</title>
      <link>https://example.com/homelab/mikrotik-chr</link>
      <description>Mikrotik CHR runs RouterOS in VMs. The free tier caps you at 1 Mbps upload. A perpetual license removes the cap and also unlocks TR-069 remote management.</description>
      <pubDate>Tue, 01 Apr 2026 10:00:00 GMT</pubDate>
    </item>
    <item>
      <title>10GbE DAC vs fibre cost analysis</title>
      <link>https://example.com/homelab/10gbe</link>
      <description>DAC cables are cheaper per port but capped at 7m. Fibre costs 2x but scales to 300m for most homelabs the DAC break-even is at 2-3 ports.</description>
      <pubDate>Wed, 02 Apr 2026 10:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>
`;

// ─────────────── helper: build runtime from tmp dir ──────

const buildTestRuntime = async (
  tmp: string,
): Promise<Runtime> => {
  const graphs = fileGraphRepository(join(tmp, 'graph.json'));
  const vectors = (await openSqliteVectorIndex({ path: join(tmp, 'vectors.db') }))._unsafeUnwrap();
  const embedder = fixtureEmbedder();
  const sources = fileSourcesConfig(join(tmp, 'sources.json'));
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
  return {
    paths: {
      home: tmp,
      graph: join(tmp, 'graph.json'),
      vectors: join(tmp, 'vectors.db'),
      sources: join(tmp, 'sources.json'),
      modelCache: join(tmp, 'models'),
    },
    graphs,
    vectors,
    embedder,
    sources,
    http,
    xml,
    html,
    registry,
    ingestDeps,
    close: () => vectors.close(),
  };
};

// ─────────────── helper: connect MCP client ─────────────

const connectClient = async (runtime: Runtime): Promise<Client> => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  // startMcpServer creates a McpServer internally and connects it.
  // We need direct access to the McpServer to wire the transport.
  // Instead, let's import and build the server tools here, then
  // connect both sides.
  //
  // Actually — startMcpServer calls server.connect(transport).
  // We can't use it because it hardcodes StdioServerTransport.
  // Instead, we replicate the registration inline. This is slightly
  // duplicative but it's the test — the real entrypoint is still
  // `startMcpServer` which the CLI uses.
  //
  // For a cleaner approach, refactor startMcpServer to accept a
  // Transport. For now, inline is fine.
  void runtime; // we'll use runtime via the server builder below
  void serverTransport;

  // Just use the actual server function but inject the transport.
  // Let's refactor startMcpServer to accept an optional transport.
  // ... Actually that's too invasive for the test. Let me just build
  // the server here using the same tools.

  const client = new Client({ name: 'test', version: '0.0.1' });
  await client.connect(clientTransport);
  return client;
};

// OK — instead of that complexity, let me refactor the server to
// accept an optional transport, making it testable. This is a single
// small change.

test('phase 3: MCP server — 9 tools + search integration (in-memory transport)', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'wellinformed-phase3-'));
  const feedPath = join(tmp, 'feed.xml');
  writeFileSync(feedPath, rssFixture());
  const feedUrl = pathToFileURL(feedPath).toString();

  // Seed sources.json
  writeFileSync(
    join(tmp, 'sources.json'),
    JSON.stringify([
      {
        id: 'homelab-weekly',
        kind: 'generic_rss',
        room: 'homelab',
        enabled: true,
        config: { feed_url: feedUrl, max_items: 5 },
      },
    ]),
  );

  const runtime = await buildTestRuntime(tmp);

  try {
    // Wire the in-memory transport pair
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    // Import the server builder and pass the in-memory transport
    const { buildMcpServer } = await import('../src/mcp/server.js');
    const mcpServer = buildMcpServer(runtime);
    await mcpServer.connect(serverTransport);

    const client = new Client({ name: 'test', version: '0.0.1' });
    await client.connect(clientTransport);

    // 1. list tools
    const toolsResult = await client.listTools();
    const toolNames = toolsResult.tools.map((t) => t.name).sort();
    assert.ok(toolsResult.tools.length >= 9, `expected >= 9 tools, got ${toolsResult.tools.length}: ${toolNames.join(',')}`);
    for (const name of [
      'search', 'ask', 'get_node', 'get_neighbors', 'list_rooms',
      'find_tunnels', 'sources_list', 'trigger_room', 'graph_stats',
    ]) {
      assert.ok(toolNames.includes(name), `tool '${name}' must be registered`);
    }

    // 2. graph_stats on empty graph
    const emptyStats = await client.callTool({ name: 'graph_stats', arguments: {} });
    const stats = JSON.parse((emptyStats.content as { type: string; text: string }[])[0].text);
    assert.equal(stats.nodes, 0);

    // 3. trigger_room to seed data
    const triggerResult = await client.callTool({ name: 'trigger_room', arguments: { room: 'homelab' } });
    const trigger = JSON.parse((triggerResult.content as { type: string; text: string }[])[0].text);
    assert.equal(trigger.room, 'homelab');
    assert.ok(trigger.runs[0].items_new >= 2, `expected >= 2 new items, got ${trigger.runs[0].items_new}`);

    // 4. search for mikrotik
    const searchResult = await client.callTool({
      name: 'search',
      arguments: { query: 'Mikrotik CHR licensing', room: 'homelab', k: 3 },
    });
    const matches = JSON.parse((searchResult.content as { type: string; text: string }[])[0].text);
    assert.ok(Array.isArray(matches));
    assert.ok(matches.length >= 1, 'search should find at least 1 result');
    assert.ok(
      matches.some((m: { node_id: string }) => m.node_id.includes('mikrotik')),
      'search should contain a mikrotik node',
    );

    // 5. get_node
    const nodeId = matches[0].node_id;
    const nodeResult = await client.callTool({ name: 'get_node', arguments: { node_id: nodeId } });
    const node = JSON.parse((nodeResult.content as { type: string; text: string }[])[0].text);
    assert.equal(node.room, 'homelab');
    assert.ok(node.source_uri);

    // 6. list_rooms
    const roomsResult = await client.callTool({ name: 'list_rooms', arguments: {} });
    const rooms = JSON.parse((roomsResult.content as { type: string; text: string }[])[0].text);
    assert.ok(rooms.some((r: { room: string }) => r.room === 'homelab'));

    // 7. graph_stats after seeding — non-zero
    const fullStats = await client.callTool({ name: 'graph_stats', arguments: {} });
    const full = JSON.parse((fullStats.content as { type: string; text: string }[])[0].text);
    assert.ok(full.nodes >= 2, `expected >= 2 nodes, got ${full.nodes}`);
    assert.ok(full.vectors >= 2, `expected >= 2 vectors, got ${full.vectors}`);

    await client.close();
    await mcpServer.close();
  } finally {
    runtime.close();
    rmSync(tmp, { recursive: true, force: true });
  }
});
