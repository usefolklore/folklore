/**
 * Telegram command router — natural language commands from phone.
 *
 * V5: no rooms vocabulary. The bot writes to the global graph without
 * a room tag. Workspace pre-filter (a node-level attribute) is not
 * meaningful here — Telegram has no cwd to derive a workspace from.
 *
 * Supported: ask, report, trigger, status, help
 * Syntax: "ask embeddings" or just "embeddings" (inferred as ask)
 */

import { formatError } from '../domain/errors.js';
import { searchGlobal } from '../application/use-cases.js';
import { generateReport, renderReport } from '../application/report.js';
import { ingestSource } from '../application/ingest.js';
import { isEnabled } from '../domain/sources.js';
import type { Runtime } from '../cli/runtime.js';

const COMMANDS: Record<string, (runtime: Runtime, args: string) => Promise<string>> = {
  ask: handleAsk,
  report: handleReport,
  trigger: handleTrigger,
  status: handleStatus,
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

  // V5: global search only — Telegram has no workspace context.
  const results = await searchGlobal(deps)({ text: query, k: 5 });
  if (results.isErr()) return `Error: ${formatError(results.error)}`;
  if (results.value.length === 0) return 'No results found. Try `trigger` to fetch fresh content.';

  const lines = [`*Results for:* ${query}\n`];
  for (const m of results.value.slice(0, 5)) {
    lines.push(`• *${m.node_id.split('/').pop() || m.node_id}*`);
    lines.push(`  distance: ${m.distance.toFixed(3)}`);
  }
  return lines.join('\n');
}

async function handleReport(runtime: Runtime, _args: string): Promise<string> {
  // V5: reports are global. The `args` slot is reserved for future
  // filters (entity, time range) once those land.
  void _args;
  const deps = { graphs: runtime.graphs, vectors: runtime.vectors, sources: runtime.sources };
  const data = await generateReport(deps)({});
  if (data.isErr()) return `Error: ${formatError(data.error)}`;

  const md = renderReport(data.value);
  return md.length > 4000 ? md.slice(0, 3997) + '...' : md;
}

async function handleTrigger(runtime: Runtime, _args: string): Promise<string> {
  // V5: trigger fans out across every enabled source flat. No
  // per-room scoping.
  void _args;
  const listed = await runtime.sources.list();
  if (listed.isErr()) return `Error: ${formatError(listed.error)}`;
  const descriptors = listed.value.filter(isEnabled);
  const built = runtime.registry.buildAll(descriptors);
  const ingest = ingestSource(runtime.ingestDeps);

  const lines = [`*Triggered ${built.sources.length} source(s)*\n`];
  for (const source of built.sources) {
    const r = await ingest(source);
    if (r.isErr()) {
      lines.push(`✗ ${source.descriptor.id}: ${formatError(r.error)}`);
      continue;
    }
    lines.push(`✓ ${source.descriptor.id}: ${r.value.items_new} new, ${r.value.items_skipped} skipped`);
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

  return [
    '*akashik status*',
    `Nodes: ${nodes}`,
    `Edges: ${edges}`,
    `Vectors: ${vectors}`,
    `Sources: ${sources}`,
  ].join('\n');
}

async function handleHelp(_runtime: Runtime, _args: string): Promise<string> {
  return [
    '*akashik commands:*',
    '• `ask <query>` — search the knowledge graph',
    '• `report` — generate a report',
    '• `trigger` — fetch + index all sources',
    '• `status` — graph stats',
    '• Send any URL to auto-ingest it',
    '• Or just type a question to search',
  ].join('\n');
}
