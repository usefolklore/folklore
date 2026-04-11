/**
 * Telegram command router — natural language commands from phone.
 *
 * Supported: ask, report, trigger, status, rooms
 * Syntax: "ask embeddings" or just "embeddings" (inferred as ask)
 */

import { formatError } from '../domain/errors.js';
import { defaultRoom } from '../domain/rooms.js';
import { searchByRoom, searchGlobal } from '../application/use-cases.js';
import { generateReport, renderReport } from '../application/report.js';
import { triggerRoom } from '../application/ingest.js';
import type { Runtime } from '../cli/runtime.js';

const COMMANDS: Record<string, (runtime: Runtime, args: string) => Promise<string>> = {
  ask: handleAsk,
  report: handleReport,
  trigger: handleTrigger,
  status: handleStatus,
  rooms: handleRooms,
  help: handleHelp,
};

export const handleCommand = async (
  runtime: Runtime,
  text: string,
): Promise<string> => {
  const trimmed = text.trim();
  const parts = trimmed.split(/\s+/);
  const cmd = parts[0].toLowerCase().replace(/^\//, '');
  const args = parts.slice(1).join(' ');

  const handler = COMMANDS[cmd];
  if (handler) return handler(runtime, args);

  // No explicit command — treat as an implicit "ask"
  if (trimmed.length > 2) return handleAsk(runtime, trimmed);

  return handleHelp(runtime, '');
};

async function handleAsk(runtime: Runtime, query: string): Promise<string> {
  if (!query) return 'What do you want to search for?';
  const deps = { graphs: runtime.graphs, vectors: runtime.vectors, embedder: runtime.embedder };

  const reg = await runtime.rooms.load();
  const room = reg.isOk() ? defaultRoom(reg.value) : undefined;
  const results = room
    ? await searchByRoom(deps)({ room, text: query, k: 5 })
    : await searchGlobal(deps)({ text: query, k: 5 });

  if (results.isErr()) return `Error: ${formatError(results.error)}`;
  if (results.value.length === 0) return 'No results found. Try `trigger` to fetch fresh content.';

  const lines = [`*Results for:* ${query}\n`];
  for (const m of results.value.slice(0, 5)) {
    lines.push(`• *${m.node_id.split('/').pop() || m.node_id}*`);
    lines.push(`  distance: ${m.distance.toFixed(3)} | room: ${m.room}`);
  }
  return lines.join('\n');
}

async function handleReport(runtime: Runtime, args: string): Promise<string> {
  const reg = await runtime.rooms.load();
  const room = args.trim() || (reg.isOk() ? defaultRoom(reg.value) : undefined);
  if (!room) return 'No room specified and no default room set.';

  const deps = { graphs: runtime.graphs, vectors: runtime.vectors, sources: runtime.sources };
  const data = await generateReport(deps)({ room });
  if (data.isErr()) return `Error: ${formatError(data.error)}`;

  const md = renderReport(data.value);
  return md.length > 4000 ? md.slice(0, 3997) + '...' : md;
}

async function handleTrigger(runtime: Runtime, args: string): Promise<string> {
  const reg = await runtime.rooms.load();
  const room = args.trim() || (reg.isOk() ? defaultRoom(reg.value) : undefined);
  if (!room) return 'No room specified and no default room set.';

  const result = await triggerRoom(runtime.ingestDeps)(room);
  if (result.isErr()) return `Error: ${formatError(result.error)}`;

  const run = result.value;
  const lines = [`*Triggered room:* ${room}\n`];
  for (const r of run.runs) {
    const icon = r.error ? '✗' : '✓';
    lines.push(`${icon} ${r.source_id}: ${r.items_new} new, ${r.items_skipped} skipped`);
  }
  return lines.join('\n');
}

async function handleStatus(runtime: Runtime, _args: string): Promise<string> {
  const graphResult = await runtime.graphs.load();
  const nodes = graphResult.isOk() ? graphResult.value.json.nodes.length : 0;
  const edges = graphResult.isOk() ? graphResult.value.json.links.length : 0;
  const vectors = runtime.vectors.size();
  const sourcesResult = await runtime.sources.list();
  const sources = sourcesResult.isOk() ? sourcesResult.value.length : 0;
  const roomsResult = await runtime.rooms.load();
  const roomCount = roomsResult.isOk() ? roomsResult.value.rooms.length : 0;

  return [
    '*wellinformed status*',
    `Nodes: ${nodes}`,
    `Edges: ${edges}`,
    `Vectors: ${vectors}`,
    `Sources: ${sources}`,
    `Rooms: ${roomCount}`,
  ].join('\n');
}

async function handleRooms(runtime: Runtime, _args: string): Promise<string> {
  const reg = await runtime.rooms.load();
  if (reg.isErr()) return `Error: ${formatError(reg.error)}`;
  if (reg.value.rooms.length === 0) return 'No rooms configured.';

  const lines = ['*Rooms:*\n'];
  for (const r of reg.value.rooms) {
    const marker = r.id === reg.value.default_room ? ' ★' : '';
    lines.push(`• \`${r.id}\`${marker} — ${r.description}`);
  }
  return lines.join('\n');
}

async function handleHelp(_runtime: Runtime, _args: string): Promise<string> {
  return [
    '*wellinformed commands:*',
    '• `ask <query>` — search the knowledge graph',
    '• `report [room]` — generate a report',
    '• `trigger [room]` — fetch + index sources',
    '• `status` — graph stats',
    '• `rooms` — list rooms',
    '• Send any URL to auto-ingest it',
    '• Or just type a question to search',
  ].join('\n');
}
