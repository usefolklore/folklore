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

import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { formatError } from '../domain/errors.js';
import { openCodeGraph } from '../infrastructure/code-graph.js';
import type { CodeNodeKind } from '../domain/codebase.js';
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
  indexNode,
} from '../application/use-cases.js';
import {
  nodeFromQuestion,
  nodeFromAnswer,
  listQuestions,
  listAnswers,
  isQuestionId,
  rankAnswerable,
  questionsAnsweredBy,
  type AnswerabilityInput,
} from '../domain/oracle.js';
import { triggerRoom } from '../application/ingest.js';
import { runFederatedSearch } from '../application/federated-search.js';
import { loadOrCreateIdentity, createNode, dialAndTag } from '../infrastructure/peer-transport.js';
import { loadPeers } from '../infrastructure/peer-store.js';
import { loadConfig } from '../infrastructure/config-loader.js';
import { wellinformedHome } from '../cli/runtime.js';
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

  // ─────────────── federated_search ─────

  server.registerTool(
    'federated_search',
    {
      description:
        'Search the P2P network — queries the local knowledge graph AND all connected peers\' shared rooms. ' +
        'Returns results annotated with _source_peer (null = local, peerId string = remote). ' +
        'Also surfaces cross-room tunnels found in the merged result set. ' +
        'PRIVACY NOTE: connected peers see your query embedding (a 384-dim float32 vector) and optional room filter — not the raw query text. ' +
        'Embeddings are not plaintext but are partially correlatable. Private Information Retrieval (PIR) is a v3 feature. ' +
        'When no peers are connected, returns local results with peers_queried: 0 (no error).',
      inputSchema: {
        query: z.string().describe('The natural-language search query'),
        room: z.string().optional().describe('Restrict to this room on all peers'),
        limit: z.number().int().min(1).max(50).default(5).describe('Number of results to return'),
      },
    },
    async ({ query, room, limit }) => {
      // 1. Embed locally
      const embedRes = await runtime.embedder.embed(query);
      if (embedRes.isErr()) return errText(embedRes.error);

      // 2. Spin a short-lived libp2p node for this query
      const identityPath = join(wellinformedHome(), 'peer-identity.json');
      const peersPath = join(wellinformedHome(), 'peers.json');
      const configPath = join(wellinformedHome(), 'config.yaml');

      const cfgRes = await loadConfig(configPath);
      if (cfgRes.isErr()) return errText(cfgRes.error);

      const idRes = await loadOrCreateIdentity(identityPath);
      if (idRes.isErr()) return errText(idRes.error);

      const nodeRes = await createNode(idRes.value, {
        listenPort: 0,
        listenHost: '127.0.0.1',
        mdns: cfgRes.value.peer.mdns,
        dhtEnabled: cfgRes.value.peer.dht.enabled,
        peersPath,
      });
      if (nodeRes.isErr()) return errText(nodeRes.error);
      const node = nodeRes.value;

      try {
        // 3. Best-effort dial of known peers so fan-out has targets
        const peersRes = await loadPeers(peersPath);
        if (peersRes.isOk()) {
          await Promise.all(
            peersRes.value.peers.map(async (p) => {
              for (const addr of p.addrs) {
                try {
                  await dialAndTag(node, addr);
                  break;
                } catch {
                  /* next */
                }
              }
            }),
          );
        }

        // 4. Run federated search
        const result = await runFederatedSearch(
          { node, vectorIndex: runtime.vectors },
          { embedding: embedRes.value, k: limit, room },
        );

        return okJson({
          query,
          room: room ?? null,
          peers_queried: result.peers_queried,
          peers_responded: result.peers_responded,
          peers_timed_out: result.peers_timed_out,
          peers_errored: result.peers_errored,
          matches: result.matches,
          tunnels: result.tunnels,
        });
      } finally {
        try {
          await node.stop();
        } catch {
          /* benign */
        }
      }
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

  // ─────────────── deep_search (multi-hop) ─────

  server.registerTool(
    'deep_search',
    {
      description:
        'Multi-hop graph search — like Cognee\'s chain-of-thought traversal. Searches semantically, then expands via graph neighbors, then re-ranks. Finds connections that flat k-NN misses.',
      inputSchema: {
        query: z.string().describe('The search query'),
        room: z.string().optional().describe('Room filter'),
        k: z.number().int().min(1).max(20).default(5),
        hops: z.number().int().min(1).max(3).default(2).describe('Graph expansion depth'),
      },
    },
    async ({ query, room, k, hops }) => {
      // Hop 1: semantic search
      const initial = room
        ? await searchByRoom(deps)({ room, text: query, k })
        : await searchGlobal(deps)({ text: query, k });
      if (initial.isErr()) return errText(initial.error);

      const graph = await runtime.graphs.load();
      if (graph.isErr()) return errText(graph.error);

      // Hop 2+: expand via graph neighbors
      const seen = new Set(initial.value.map((m) => m.node_id));
      const expanded: Array<{ node_id: string; distance: number; hop: number; via: string }> = [];

      for (const match of initial.value) {
        expanded.push({ node_id: match.node_id, distance: match.distance, hop: 0, via: 'semantic' });
        if (hops >= 1) {
          const neigh = neighbors(graph.value, match.node_id);
          for (const n of neigh) {
            if (!seen.has(n.id)) {
              seen.add(n.id);
              expanded.push({ node_id: n.id, distance: match.distance + 0.1, hop: 1, via: match.node_id });
            }
          }
        }
      }

      // Hop 3: neighbors of neighbors
      if (hops >= 2) {
        const hop1Nodes = expanded.filter((e) => e.hop === 1);
        for (const h1 of hop1Nodes.slice(0, 10)) {
          const neigh2 = neighbors(graph.value, h1.node_id);
          for (const n of neigh2) {
            if (!seen.has(n.id)) {
              seen.add(n.id);
              expanded.push({ node_id: n.id, distance: h1.distance + 0.1, hop: 2, via: h1.node_id });
            }
          }
        }
      }

      // Re-rank by distance and build rich results
      const sorted = expanded.sort((a, b) => a.distance - b.distance).slice(0, k * 2);
      const results = sorted.map((e) => {
        const node = getNode(graph.value, e.node_id);
        return {
          node_id: e.node_id,
          label: node?.label ?? e.node_id,
          room: node?.room ?? 'unknown',
          source_uri: node?.source_uri ?? node?.source_file,
          distance: e.distance,
          hop: e.hop,
          via: e.via,
        };
      });

      return okJson({
        query,
        hops,
        total_explored: seen.size,
        results: results.slice(0, k),
      });
    },
  );

  // ─────────────── discover_loop ─────────

  server.registerTool(
    'discover_loop',
    {
      description:
        'Recursive source expansion. Discovers new sources from room keywords, indexes them, extracts new keywords from the content, discovers more. Repeats until no new sources found or max iterations hit.',
      inputSchema: {
        room: z.string().describe('The room to expand'),
        max_iterations: z.number().int().min(1).max(10).default(3),
      },
    },
    async ({ room, max_iterations }) => {
      const { discoveryLoop } = await import('../application/discovery-loop.js');
      const deps = {
        ingestDeps: runtime.ingestDeps,
        rooms: runtime.rooms,
        sources: runtime.sources,
      };
      const result = await discoveryLoop(deps)(room, { maxIterations: max_iterations });
      if (result.isErr()) return errText(result.error);
      return okJson(result.value);
    },
  );

  // ─────────────── code_graph_query ─────────
  // Phase 19 — 15th MCP tool. Queries ~/.wellinformed/code-graph.db independently
  // of the research graph. Claude calls this when the task is code-structural
  // (find all functions named X, list all classes in codebase Y, etc.).

  server.registerTool(
    'code_graph_query',
    {
      description:
        'Query the structured code graph (Phase 19). Returns code nodes (classes, functions, methods, interfaces, types, imports, exports) from indexed codebases. SEPARATE from `search` / `ask` — those query research content (ArXiv, HN, RSS, etc.). This tool queries the structured code graph stored in ~/.wellinformed/code-graph.db, built by `wellinformed codebase index <path>`. Supports filtering by codebase id, node kind, and name substring.',
      inputSchema: {
        codebase_id: z
          .string()
          .optional()
          .describe('Restrict to a single codebase id (16-char hex). Omit to search all indexed codebases.'),
        kind: z
          .enum([
            'file',
            'module',
            'class',
            'interface',
            'function',
            'method',
            'import',
            'export',
            'type_alias',
          ])
          .optional()
          .describe('Restrict to one node kind. Omit to return all kinds.'),
        name_pattern: z
          .string()
          .optional()
          .describe('Substring match on the node name (wrapped in SQL LIKE %...%). Omit for no name filter.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .default(20)
          .describe('Maximum number of code nodes to return (1-200).'),
      },
    },
    async ({ codebase_id, kind, name_pattern, limit }) => {
      const repoRes = await openCodeGraph({ path: runtime.paths.codeGraph });
      if (repoRes.isErr()) return errText(repoRes.error);
      const repo = repoRes.value;
      try {
        const res = await repo.searchNodes({
          codebase_id: codebase_id as undefined | (string & { __brand: 'CodebaseId' }),
          kind: kind as CodeNodeKind | undefined,
          name_pattern: name_pattern ? `%${name_pattern}%` : undefined,
          limit,
        });
        if (res.isErr()) return errText(res.error);
        return okJson({
          count: res.value.length,
          nodes: res.value,
        });
      } finally {
        repo.close();
      }
    },
  );

  // ─────────────── recent_sessions ─────────
  // Phase 20 — 16th MCP tool. Returns structured rollups of recent Claude
  // Code sessions from the local `sessions` room so the agent can recover
  // context across restarts. The `sessions` room is NEVER shared over
  // libp2p — session data stays local.

  server.registerTool(
    'recent_sessions',
    {
      description:
        'Return structured rollups of recent Claude Code sessions from the local `sessions` room. ' +
        'Each rollup contains {id, started_at, duration_ms, tool_calls, files_touched, ' +
        'final_assistant_message, git_branch, node_count}. ' +
        'Use this tool at the start of a new session to recover what the previous session was doing. ' +
        'The `sessions` room is NEVER shared over libp2p — session data stays local.',
      inputSchema: {
        hours: z
          .number()
          .int()
          .min(1)
          .max(168)
          .default(24)
          .describe('Look-back window in hours (1-168, default 24)'),
        project: z
          .string()
          .optional()
          .describe('Filter sessions whose cwd contains this substring'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe('Maximum number of sessions to return (default 10)'),
      },
    },
    async ({ hours, project, limit }) => {
      const graphRes = await runtime.graphs.load();
      if (graphRes.isErr()) return errText(graphRes.error);
      const { nodesInRoom: nodesInRoomFn } = await import('../domain/graph.js');
      const { rollupSessions } = await import('../cli/commands/recent-sessions.js');
      const nodes = nodesInRoomFn(graphRes.value, 'sessions');
      const cutoffMs = Date.now() - hours * 60 * 60 * 1000;
      const rollups = rollupSessions(nodes, cutoffMs, project).slice(0, limit);
      return okJson({ count: rollups.length, sessions: rollups });
    },
  );

  // ─────────────── oracle_ask ─────────────
  // Layer A of the peer-discovery stack — post a question to the oracle
  // system room. Every connected peer picks it up via their next
  // `touch oracle`. Returns the new question id so the caller can
  // poll back with oracle_answers.

  server.registerTool(
    'oracle_ask',
    {
      description:
        'Post a new question to the oracle system room. The question propagates ' +
        'to all connected peers via the existing touch + CRDT sync (no new ' +
        'wire protocol). Peers can answer with oracle_answer. Returns the ' +
        'question id (`oracle-question:<uuid>`). Use this when you want the ' +
        'broader federation of wellinformed peers to help answer a question ' +
        'your local graph cannot.',
      inputSchema: {
        text: z.string().min(1).max(8000).describe('The question body'),
        label: z
          .string()
          .optional()
          .describe('Optional short title; auto-derived from text if omitted'),
      },
    },
    async ({ text, label }) => {
      const askedByRes = await loadOrCreateIdentity(
        join(wellinformedHome(), 'peer-identity.json'),
      );
      const askedBy = askedByRes.isOk() ? askedByRes.value.peerId : 'local';
      const node = nodeFromQuestion({ text, askedBy, label });
      const res = await indexNode(deps)({ node, text, room: 'oracle' });
      if (res.isErr()) return errText(res.error);
      return okJson({
        question_id: node.id,
        asked_by: askedBy,
        status: 'open',
        posted_at: node.fetched_at,
      });
    },
  );

  // ─────────────── oracle_answer ──────────
  // Post an answer linked to a question id. Answer propagates the same
  // way. Confidence is a self-assessed [0..1] score the asker's client
  // can use for ranking.

  server.registerTool(
    'oracle_answer',
    {
      description:
        'Post an answer to an existing oracle question. Links to the question ' +
        'via question_id and propagates to all peers. Confidence is your ' +
        'self-assessed certainty in the answer — used by the asker to rank.',
      inputSchema: {
        question_id: z
          .string()
          .describe('The question id (e.g. `oracle-question:<uuid>`)'),
        text: z.string().min(1).max(8000).describe('The answer body'),
        confidence: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe('Self-assessed confidence 0..1 (optional)'),
      },
    },
    async ({ question_id, text, confidence }) => {
      if (!isQuestionId(question_id)) {
        return errText(
          `oracle_answer: '${question_id}' does not look like a question id (expected 'oracle-question:...')`,
        );
      }
      const answeredByRes = await loadOrCreateIdentity(
        join(wellinformedHome(), 'peer-identity.json'),
      );
      const answeredBy = answeredByRes.isOk() ? answeredByRes.value.peerId : 'local';
      const node = nodeFromAnswer({
        questionId: question_id,
        text,
        answeredBy,
        confidence,
      });
      const res = await indexNode(deps)({ node, text, room: 'oracle' });
      if (res.isErr()) return errText(res.error);
      return okJson({
        answer_id: node.id,
        question_id,
        answered_by: answeredBy,
        confidence: confidence ?? null,
        posted_at: node.fetched_at,
      });
    },
  );

  // ─────────────── list_open_questions ─────
  // Surface the oracle room so an agent can see what's waiting for an
  // answer. Newest-first. Includes answer counts so the agent can
  // prioritise unanswered ones.

  server.registerTool(
    'list_open_questions',
    {
      description:
        'List open questions in the oracle room — questions peers (including ' +
        'you) have posted and are awaiting answers for. Newest-first. Each ' +
        'entry has {id, label, text, asked_by, status, fetched_at, ' +
        'answer_count}. Use this before answering to see what the network ' +
        'is asking.',
      inputSchema: {
        status: z
          .enum(['open', 'answered', 'closed'])
          .optional()
          .describe('Filter by status; default returns all'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe('Max questions to return (default 20)'),
      },
    },
    async ({ status, limit }) => {
      const graphRes = await runtime.graphs.load();
      if (graphRes.isErr()) return errText(graphRes.error);
      const questions = listQuestions(graphRes.value.json.nodes, { status }).slice(0, limit);
      return okJson({
        count: questions.length,
        questions: questions.map((q) => ({
          id: q.id,
          label: q.label,
          text: q.text,
          asked_by: q.askedBy,
          status: q.status,
          fetched_at: q.fetchedAt,
          answer_count: q.answerCount,
        })),
      });
    },
  );

  // ─────────────── oracle_answerable ──────
  // "Which open external questions could this peer plausibly answer?"
  // For each open question not asked by self, run semantic search on
  // the local graph and surface the top hits. Claude picks from this
  // list, composes a real answer from the cited nodes, and posts via
  // oracle_answer. Keeps the LLM as the answerer, graph as the
  // matchmaker — no blind auto-answering.

  server.registerTool(
    'oracle_answerable',
    {
      description:
        'Return open oracle questions this peer could plausibly answer from its ' +
        'local graph. For each external question, returns the top semantic ' +
        'matches on this peer\'s graph + a suggested confidence. Skips ' +
        'questions you asked and questions you already answered. Sorted by ' +
        'best-hit distance (closest match first). Use this to decide what to ' +
        'oracle_answer next.',
      inputSchema: {
        threshold: z
          .number()
          .min(0)
          .max(2)
          .default(1.0)
          .describe('Max semantic distance for "answerable" (default 1.0 = cosine-ish threshold)'),
        k: z
          .number()
          .int()
          .min(1)
          .max(10)
          .default(3)
          .describe('Top-k local graph hits to return per question'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe('Max answerable questions to return'),
      },
    },
    async ({ threshold, k, limit }) => {
      const selfRes = await loadOrCreateIdentity(join(wellinformedHome(), 'peer-identity.json'));
      const selfPeerId = selfRes.isOk() ? selfRes.value.peerId : 'local';

      const graphRes = await runtime.graphs.load();
      if (graphRes.isErr()) return errText(graphRes.error);
      const allNodes = graphRes.value.json.nodes;

      const openQuestions = listQuestions(allNodes, { status: 'open' });
      const alreadyAnswered = questionsAnsweredBy(allNodes, selfPeerId);

      // Run semantic search for each external open question. Exclude
      // oracle-room hits so we don't match questions against other
      // questions/answers — we want the underlying knowledge, not the
      // bulletin-board traffic.
      const inputs: AnswerabilityInput[] = [];
      for (const q of openQuestions) {
        if (q.askedBy === selfPeerId) continue;
        if (alreadyAnswered.has(q.id)) continue;
        const matches = await searchGlobal(deps)({ text: q.text, k });
        if (matches.isErr()) continue;
        const hits = matches.value
          .map((m) => {
            const node = getNode(graphRes.value, m.node_id);
            return { nodeId: m.node_id, distance: m.distance, room: node?.room };
          })
          .filter((h) => h.room !== 'oracle')
          .map((h) => ({ nodeId: h.nodeId, distance: h.distance }));
        inputs.push({ question: q, hits });
      }

      const ranked = rankAnswerable(inputs, selfPeerId, alreadyAnswered, threshold)
        .slice(0, limit);

      return okJson({
        self_peer_id: selfPeerId,
        threshold,
        count: ranked.length,
        items: ranked.map((r) => ({
          question: {
            id: r.question.id,
            label: r.question.label,
            text: r.question.text,
            asked_by: r.question.askedBy,
            fetched_at: r.question.fetchedAt,
          },
          top_hits: r.topHits.map((h) => {
            const node = getNode(graphRes.value, h.nodeId);
            return {
              node_id: h.nodeId,
              distance: Number(h.distance.toFixed(4)),
              label: node?.label ?? null,
              room: node?.room ?? null,
              source_uri: node?.source_uri ?? null,
            };
          }),
          suggested_confidence: Number(r.suggestedConfidence.toFixed(2)),
        })),
      });
    },
  );

  // ─────────────── oracle_answers ──────────
  // Fetch all answers for a given question, confidence-ranked then
  // recency-ranked. Pair with oracle_ask to complete the Q→A loop
  // from inside a Claude conversation.

  server.registerTool(
    'oracle_answers',
    {
      description:
        'Fetch all answers for a given oracle question. Sorted by confidence ' +
        '(DESC) then recency (DESC). Each entry has {id, question_id, text, ' +
        'answered_by, confidence, fetched_at}. Use after oracle_ask to poll ' +
        'for responses.',
      inputSchema: {
        question_id: z.string().describe('The oracle-question:<uuid> to fetch answers for'),
      },
    },
    async ({ question_id }) => {
      const graphRes = await runtime.graphs.load();
      if (graphRes.isErr()) return errText(graphRes.error);
      const answers = listAnswers(graphRes.value.json.nodes, question_id);
      return okJson({
        question_id,
        count: answers.length,
        answers: answers.map((a) => ({
          id: a.id,
          question_id: a.questionId,
          text: a.text,
          answered_by: a.answeredBy,
          confidence: a.confidence ?? null,
          fetched_at: a.fetchedAt,
        })),
      });
    },
  );

  return server;
};

/** Start the MCP server over stdio. Production entrypoint. Runs until stdin closes. */
export const startMcpServer = async (runtime: Runtime): Promise<void> => {
  const server = buildMcpServer(runtime);
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Keep the process alive until the transport closes (stdin EOF / SIGTERM).
  // Without this, main().then(code => process.exit(code)) kills the process
  // immediately after connect() resolves — before any messages are processed.
  await new Promise<void>((resolve) => {
    transport.onclose = resolve;
  });
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
