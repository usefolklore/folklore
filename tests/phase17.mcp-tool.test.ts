/**
 * Phase 17: MCP tool — federated_search registration + structural invariants (FED-05).
 *
 * Strategy: HYBRID
 *   - Structural grep on src/mcp/server.ts for tool count, name, description, schema,
 *     and node.stop() invocation (most reliable — tests the source, not a runtime).
 *   - buildMcpServer(fakeRuntime) smoke-test to confirm registration does not throw.
 *
 * We do NOT invoke the federated_search handler here — it spins a real libp2p node
 * which is out of scope for a unit test.  Handler invocation is a UAT concern.
 *
 * Runner: node --import tsx --test tests/phase17.mcp-tool.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { okAsync } from 'neverthrow';

import { buildMcpServer } from '../src/mcp/server.js';
import type { Runtime } from '../src/cli/runtime.js';

// ─────────────────────── fake runtime ─────────────────────────────────────────

/**
 * Minimum Runtime shape that buildMcpServer touches during TOOL REGISTRATION
 * (no handler invocation — handlers are async and never called here).
 */
const buildFakeRuntime = (): Runtime =>
  ({
    paths: {
      home: '/tmp/wellinformed-test',
      graph: '/tmp/wellinformed-test/graph.json',
      vectors: '/tmp/wellinformed-test/vectors.db',
      sources: '/tmp/wellinformed-test/sources.json',
      rooms: '/tmp/wellinformed-test/rooms.json',
      modelCache: '/tmp/wellinformed-test/models',
    },
    graphs: {
      load: () => okAsync({ json: { nodes: [], links: [] }, index: new Map() } as never),
      save: () => okAsync(undefined),
    } as unknown as Runtime['graphs'],
    vectors: {
      upsert: () => okAsync(undefined),
      searchGlobal: () => okAsync([]),
      searchByRoom: () => okAsync([]),
      all: () => okAsync([]),
      size: () => 0,
      close: () => undefined,
    } as unknown as Runtime['vectors'],
    embedder: {
      dim: 384,
      embed: () => okAsync(new Float32Array(384)),
      embedBatch: () => okAsync([]),
    } as unknown as Runtime['embedder'],
    sources: {
      list: () => okAsync([]),
    } as unknown as Runtime['sources'],
    rooms: {
      load: () => okAsync({ rooms: [] }),
      create: () => okAsync({ rooms: [] }),
    } as unknown as Runtime['rooms'],
    http: {} as unknown as Runtime['http'],
    xml: {} as unknown as Runtime['xml'],
    html: {} as unknown as Runtime['html'],
    registry: {} as unknown as Runtime['registry'],
    ingestDeps: {} as unknown as Runtime['ingestDeps'],
    close: () => undefined,
  }) as unknown as Runtime;

// ─────────────────────── tests ─────────────────────────────────────────────────

describe('Phase 17: MCP tool — federated_search registration (FED-05)', () => {
  it('C1: buildMcpServer builds without throwing with a fake runtime', () => {
    const runtime = buildFakeRuntime();
    const server = buildMcpServer(runtime);
    assert.ok(server, 'buildMcpServer must return a truthy McpServer');
  });

  it('C2: server.ts registers exactly 15 tools (14 Phase-17 + 1 code_graph_query Phase-19)', () => {
    const src = readFileSync('src/mcp/server.ts', 'utf8');
    const matches = src.match(/server\.registerTool\(/g);
    assert.ok(matches, 'registerTool calls must exist in server.ts');
    assert.equal(
      matches.length,
      15,
      `expected 15 tools in Phase 19 (14 Phase-17 + 1 code_graph_query), found ${matches.length}`,
    );
  });

  it("C3: 'federated_search' tool is registered by name (FED-05)", () => {
    const src = readFileSync('src/mcp/server.ts', 'utf8');
    assert.ok(
      src.includes("'federated_search'"),
      "server.ts must register 'federated_search' as the 14th MCP tool",
    );
  });

  it('C4: federated_search description discloses PRIVACY (embedding visible to peers)', () => {
    const src = readFileSync('src/mcp/server.ts', 'utf8');
    const startIdx = src.indexOf("'federated_search'");
    assert.ok(startIdx >= 0, "federated_search registration must exist");
    // Description is within 1500 chars of the tool name registration.
    const window = src.slice(startIdx, startIdx + 1500);
    assert.ok(
      /PRIVACY/i.test(window),
      'federated_search description must disclose PRIVACY trade-off ' +
        '(query embedding is correlatable — per CONTEXT.md security decision)',
    );
    assert.ok(
      /embedding/i.test(window),
      'federated_search description must mention embedding to inform callers of the disclosure',
    );
  });

  it('C5: federated_search input schema accepts { query, room?, limit? }', () => {
    const src = readFileSync('src/mcp/server.ts', 'utf8');
    const startIdx = src.indexOf("'federated_search'");
    assert.ok(startIdx >= 0);
    const window = src.slice(startIdx, startIdx + 2000);
    assert.ok(/query:\s*z\.string/.test(window), 'query field must be z.string()');
    assert.ok(
      /room:\s*z\.string\(\)\.optional/.test(window),
      'room must be optional string (room filter for all peers)',
    );
    assert.ok(/limit:\s*z\.number/.test(window), 'limit must be z.number() (top-k results)');
  });

  it('C6: server.ts imports and calls runFederatedSearch (FED-05 wiring)', () => {
    const src = readFileSync('src/mcp/server.ts', 'utf8');
    assert.ok(
      src.includes('runFederatedSearch'),
      'server.ts must import and call runFederatedSearch in the federated_search handler',
    );
  });

  it('C7: federated_search handler calls node.stop() in finally (no libp2p node leak)', () => {
    const src = readFileSync('src/mcp/server.ts', 'utf8');
    const startIdx = src.indexOf("'federated_search'");
    assert.ok(startIdx >= 0);
    // The tool handler spans up to ~5000 chars after the name.
    const window = src.slice(startIdx, startIdx + 5000);
    assert.ok(
      /node\.stop\(\)/.test(window),
      'federated_search handler must call node.stop() in its finally block ' +
        '(Pitfall: short-lived libp2p nodes must be stopped to release TCP port + GC resources)',
    );
  });
});
