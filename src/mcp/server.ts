/**
 * wellinformed MCP server — exposes the knowledge graph to Claude Code.
 *
 * Spawned by `wellinformed mcp start` or by Claude Code itself via
 * the `.claude-plugin/plugin.json` manifest. Speaks the Model Context
 * Protocol over stdio (JSON-RPC).
 *
 * Tools exposed:
 *
 *   search         Room-scoped semantic search
 *   ask            Semantic search + assembled context block
 *   get_node       Retrieve a single node by id
 *   get_neighbors  Direct neighbors of a node
 *   list_rooms     All distinct rooms in the graph
 *   find_tunnels   Cross-room similarity pairs
 *   sources_list   Show configured source descriptors
 *   trigger_room   Run one ingest iteration for a room
 *
 * Each tool handler delegates to the application layer's use cases
 * (which compose domain logic + infrastructure adapters). Errors are
 * returned as MCP error content — never thrown.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { formatError } from '../domain/errors.js';
import {
  type Graph,
  getNode,
  hasNode,
  neighbors,
  size,
} from '../domain/graph.js';
import {
  searchByRoom,
  searchGlobal,
  findTunnels,
} from '../application/use-cases.js';
import { triggerRoom } from '../application/ingest.js';
import type { Runtime } from '../cli/runtime.js';

/**
 * Build and register all tools on a McpServer instance. Returns the
 * server so the caller can connect it to any transport (stdio for
 * production, InMemoryTransport for tests).
 */
export const buildMcpServer = (runtime: Runtime): McpServer => {
  const server = new McpServer(
    { name: 'wellinformed', version: '0.0.1' },
    { capabilities: { tools: {} } },
  );

  const deps = {
    graphs: runtime.graphs,
    vectors: runtime.vectors,
    embedder: runtime.embedder,
  };

  // ─────────────── search ───────────────

  server.registerTool(
    'search',
    {
      description:
        'Semantic search over the wellinformed knowledge graph. Returns the top-k matches ordered by distance. Optionally filter by room.',
      inputSchema: {
        query: z.string().describe('The natural-language search query'),
        room: z.string().optional().describe('Restrict results to this room (e.g. "homelab")'),
        k: z.number().int().min(1).max(100).default(5).describe('Number of results to return'),
      },
    },
    async ({ query, room, k }) => {
      const result = room
        ? await searchByRoom(deps)({ room, text: query, k })
        : await searchGlobal(deps)({ text: query, k });
      if (result.isErr()) return errText(result.error);
      return okJson(result.value);
    },
  );

  // ─────────────── ask ──────────────────

  server.registerTool(
    'ask',
    {
      description:
        'Semantic search + context assembly. Returns a text block suitable for feeding to an LLM as supporting context for the query. Cite the source_uri fields when using this context.',
      inputSchema: {
        query: z.string().describe('The question or topic'),
        room: z.string().optional().describe('Restrict to this room'),
        k: z.number().int().min(1).max(20).default(5),
      },
    },
    async ({ query, room, k }) => {
      const matches = room
        ? await searchByRoom(deps)({ room, text: query, k })
        : await searchGlobal(deps)({ text: query, k });
      if (matches.isErr()) return errText(matches.error);

      const graph = await runtime.graphs.load();
      if (graph.isErr()) return errText(graph.error);

      const blocks = matches.value.map((m) => {
        const node = getNode(graph.value, m.node_id);
        if (!node) return `[node ${m.node_id} not found in graph]`;
        return [
          `## ${node.label}`,
          `room: ${node.room ?? 'unassigned'} | wing: ${node.wing ?? '-'} | distance: ${m.distance.toFixed(3)}`,
          `source: ${node.source_uri ?? '-'}`,
          `published: ${node.published_at ?? node.fetched_at ?? '-'}`,
          '',
          String(node.source_file),
        ].join('\n');
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: `# wellinformed context for: ${query}\n\n${blocks.join('\n\n---\n\n')}`,
          },
        ],
      };
    },
  );

  // ─────────────── get_node ─────────────

  server.registerTool(
    'get_node',
    {
      description: 'Retrieve the full attributes of a single graph node by its ID.',
      inputSchema: {
        node_id: z.string().describe('The exact node ID (e.g. "https://example.com/article")'),
      },
    },
    async ({ node_id }) => {
      const graph = await runtime.graphs.load();
      if (graph.isErr()) return errText(graph.error);
      const node = getNode(graph.value, node_id);
      if (!node) return errText({ type: 'NodeNotFound' as const, node_id });
      return okJson(node);
    },
  );

  // ─────────────── get_neighbors ────────

  server.registerTool(
    'get_neighbors',
    {
      description: 'Get all direct neighbors of a node, including edge details.',
      inputSchema: {
        node_id: z.string().describe('The node ID to explore from'),
      },
    },
    async ({ node_id }) => {
      const graph = await runtime.graphs.load();
      if (graph.isErr()) return errText(graph.error);
      if (!hasNode(graph.value, node_id)) {
        return errText({ type: 'NodeNotFound' as const, node_id });
      }
      const neigh = neighbors(graph.value, node_id);
      const edges = graph.value.json.links.filter(
        (e) =>
          (e.source === node_id && neigh.some((n) => n.id === e.target)) ||
          (e.target === node_id && neigh.some((n) => n.id === e.source)),
      );
      return okJson({ node_id, neighbors: neigh, edges });
    },
  );

  // ─────────────── list_rooms ───────────

  server.registerTool(
    'list_rooms',
    {
      description:
        'List all distinct rooms in the knowledge graph, with node counts and a sample of labels per room.',
    },
    async () => {
      const graph = await runtime.graphs.load();
      if (graph.isErr()) return errText(graph.error);
      const rooms = roomSummary(graph.value);
      return okJson(rooms);
    },
  );

  // ─────────────── find_tunnels ─────────

  server.registerTool(
    'find_tunnels',
    {
      description:
        'Find cross-room tunnel candidates — pairs of nodes from different rooms with high semantic similarity. Lower distance = more similar.',
      inputSchema: {
        threshold: z
          .number()
          .min(0)
          .max(2)
          .default(0.6)
          .describe('Maximum L2 distance to consider (lower = stricter)'),
        room: z.string().optional().describe('Only look for tunnels that connect TO this room'),
      },
    },
    async ({ threshold, room }) => {
      const result = await findTunnels(deps)({ threshold, restrictToRoom: room });
      if (result.isErr()) return errText(result.error);
      return okJson(result.value);
    },
  );

  // ─────────────── sources_list ─────────

  server.registerTool(
    'sources_list',
    {
      description: 'List all configured source descriptors from sources.json.',
    },
    async () => {
      const result = await runtime.sources.list();
      if (result.isErr()) return errText(result.error);
      return okJson(result.value);
    },
  );

  // ─────────────── trigger_room ─────────

  server.registerTool(
    'trigger_room',
    {
      description:
        'Run one ingest iteration for a room: fetch from all enabled sources, chunk, embed, and upsert into the graph. Returns a run report.',
      inputSchema: {
        room: z.string().describe('The room to trigger (e.g. "homelab")'),
      },
    },
    async ({ room }) => {
      const result = await triggerRoom(runtime.ingestDeps)(room);
      if (result.isErr()) return errText(result.error);
      return okJson(result.value);
    },
  );

  // ─────────────── graph_stats ──────────

  server.registerTool(
    'graph_stats',
    {
      description: 'Summary statistics: node count, edge count, rooms, vector index size.',
    },
    async () => {
      const graph = await runtime.graphs.load();
      if (graph.isErr()) return errText(graph.error);
      const s = size(graph.value);
      const rooms = roomSummary(graph.value);
      return okJson({
        nodes: s.nodes,
        edges: s.edges,
        rooms: rooms.length,
        vectors: runtime.vectors.size(),
        room_detail: rooms,
      });
    },
  );

  // ─────────────── room_create ───────────

  server.registerTool(
    'room_create',
    {
      description:
        'Create a new room in the registry. Rooms partition the knowledge graph by research domain.',
      inputSchema: {
        name: z.string().describe('Human-friendly room name (e.g. "homelab")'),
        description: z.string().optional().describe('One-line description of the room'),
        keywords: z.array(z.string()).optional().describe('Topic keywords for source suggestion'),
      },
    },
    async ({ name, description, keywords }) => {
      const { slugifyRoomName } = await import('../domain/rooms.js');
      const id = slugifyRoomName(name);
      const room = {
        id,
        name,
        description: description ?? `Research room for ${name}`,
        keywords: keywords ?? [],
        created_at: new Date().toISOString(),
      };
      const result = await runtime.rooms.create(room);
      if (result.isErr()) return errText(result.error);
      return okJson({ created: room, registry: result.value });
    },
  );

  // ─────────────── room_list ────────────

  server.registerTool(
    'room_list',
    {
      description: 'List all rooms in the registry with their metadata and which is default.',
    },
    async () => {
      const result = await runtime.rooms.load();
      if (result.isErr()) return errText(result.error);
      return okJson(result.value);
    },
  );

  return server;
};

/** Start the MCP server over stdio. Production entrypoint. Runs until stdin closes. */
export const startMcpServer = async (runtime: Runtime): Promise<void> => {
  const server = buildMcpServer(runtime);
  const transport = new StdioServerTransport();
  await server.connect(transport);
};

// ─────────────── helpers ────────────────

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

const okJson = (data: unknown): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
});

const errText = (error: unknown): ToolResult => ({
  content: [
    {
      type: 'text',
      text:
        typeof error === 'object' && error !== null && 'type' in error
          ? formatError(error as Parameters<typeof formatError>[0])
          : String(error),
    },
  ],
  isError: true,
});

/** Aggregate rooms from the graph. */
const roomSummary = (
  graph: Graph,
): readonly { room: string; count: number; sample: string[] }[] => {
  const map = new Map<string, { count: number; sample: string[] }>();
  for (const n of graph.json.nodes) {
    const room = (n.room as string) ?? 'unassigned';
    const entry = map.get(room) ?? { count: 0, sample: [] };
    entry.count++;
    if (entry.sample.length < 3) entry.sample.push(n.label);
    map.set(room, entry);
  }
  return Array.from(map.entries())
    .map(([room, data]) => ({ room, ...data }))
    .sort((a, b) => b.count - a.count);
};
