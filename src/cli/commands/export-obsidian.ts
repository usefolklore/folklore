/**
 * `wellinformed export obsidian [--room R] [--output DIR]`
 *
 * Exports the knowledge graph as an Obsidian vault: one .md file per
 * node with YAML frontmatter + backlinks for edges.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatError } from '../../domain/errors.js';
import { defaultRoom } from '../../domain/rooms.js';
import type { GraphNode, GraphEdge } from '../../domain/graph.js';
import { defaultRuntime, runtimePaths } from '../runtime.js';

const sanitizeFilename = (s: string): string =>
  s.replace(/[<>:"/\\|?*#]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 200);

const nodeToMarkdown = (
  node: GraphNode,
  edges: readonly GraphEdge[],
  nodeById: ReadonlyMap<string, GraphNode>,
): string => {
  const lines: string[] = [];

  // YAML frontmatter
  lines.push('---');
  lines.push(`id: "${node.id}"`);
  lines.push(`room: "${node.room ?? 'unassigned'}"`);
  if (node.wing) lines.push(`wing: "${node.wing}"`);
  if (node.file_type) lines.push(`type: "${node.file_type}"`);
  if (node.source_uri) lines.push(`source: "${node.source_uri}"`);
  if (node.published_at) lines.push(`published: "${node.published_at}"`);
  if (node.fetched_at) lines.push(`fetched: "${node.fetched_at}"`);
  if (node.author) lines.push(`author: "${node.author}"`);
  lines.push('---');
  lines.push('');

  // Title
  lines.push(`# ${node.label}`);
  lines.push('');

  // Source link
  if (node.source_uri) {
    lines.push(`Source: [${node.source_uri}](${node.source_uri})`);
    lines.push('');
  }

  // Connected nodes as backlinks
  const related = edges.filter((e) => e.source === node.id || e.target === node.id);
  if (related.length > 0) {
    lines.push('## Connections');
    lines.push('');
    for (const edge of related) {
      const otherId = edge.source === node.id ? edge.target : edge.source;
      const other = nodeById.get(otherId);
      const otherLabel = other ? sanitizeFilename(other.label) : otherId;
      lines.push(`- [[${otherLabel}]] (${edge.relation}, ${edge.confidence})`);
    }
    lines.push('');
  }

  return lines.join('\n');
};

export const exportObsidian = async (args: readonly string[]): Promise<number> => {
  let room: string | undefined;
  let output: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = (): string => args[++i] ?? '';
    if (a === '--room') room = next();
    else if (a.startsWith('--room=')) room = a.slice('--room='.length);
    else if (a === '--output' || a === '-o') output = next();
    else if (a.startsWith('--output=')) output = a.slice('--output='.length);
  }

  const rt = await defaultRuntime();
  if (rt.isErr()) { console.error(`export: ${formatError(rt.error)}`); return 1; }
  const runtime = rt.value;

  try {
    if (!room) {
      const reg = await runtime.rooms.load();
      if (reg.isOk()) room = defaultRoom(reg.value);
    }

    const graphResult = await runtime.graphs.load();
    if (graphResult.isErr()) { console.error(`export: ${formatError(graphResult.error)}`); return 1; }

    const graph = graphResult.value;
    const nodes = room
      ? graph.json.nodes.filter((n) => n.room === room)
      : [...graph.json.nodes];
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = graph.json.links.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));

    const vaultDir = output ?? join(runtimePaths().home, 'obsidian-vault', room ?? 'all');
    mkdirSync(vaultDir, { recursive: true });

    // Write index
    const indexLines = [`# wellinformed vault — ${room ?? 'all rooms'}`, '', `${nodes.length} nodes, ${edges.length} edges`, ''];
    const byRoom = new Map<string, GraphNode[]>();
    for (const n of nodes) {
      const r = (n.room as string) ?? 'unassigned';
      const arr = byRoom.get(r) ?? [];
      arr.push(n);
      byRoom.set(r, arr);
    }
    for (const [r, ns] of byRoom) {
      indexLines.push(`## ${r} (${ns.length})`);
      for (const n of ns.slice(0, 50)) {
        indexLines.push(`- [[${sanitizeFilename(n.label)}]]`);
      }
      indexLines.push('');
    }
    writeFileSync(join(vaultDir, 'index.md'), indexLines.join('\n'));

    // Write one file per node
    let written = 0;
    for (const node of nodes) {
      const filename = sanitizeFilename(node.label) + '.md';
      const content = nodeToMarkdown(node, edges, graph.nodeById);
      writeFileSync(join(vaultDir, filename), content);
      written++;
    }

    console.log(`Obsidian vault exported to ${vaultDir}`);
    console.log(`${written} notes + index.md`);
    return 0;
  } finally {
    runtime.close();
  }
};
