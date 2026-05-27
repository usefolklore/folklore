/**
 * `wellinformed export obsidian [--workspace W] [--output DIR]`
 *
 * V5 (Phase 24): exports the global graph (or workspace-filtered
 * slice) as an Obsidian vault: one .md file per node with YAML
 * frontmatter + backlinks for edges.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatError } from '../../domain/errors.js';
import type { GraphNode, GraphEdge } from '../../domain/graph.js';
import { defaultRuntime, runtimePaths, detectWorkspace } from '../runtime.js';

const sanitizeFilename = (s: string): string =>
  s.replace(/[<>:"/\\|?*#]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 200);

const nodeToMarkdown = (
  node: GraphNode,
  edges: readonly GraphEdge[],
  nodeById: ReadonlyMap<string, GraphNode>,
): string => {
  const lines: string[] = [];

  lines.push('---');
  lines.push(`id: "${node.id}"`);
  if (node.workspace) lines.push(`workspace: "${node.workspace}"`);
  if (node.private === true) lines.push(`private: true`);
  if (node.wing) lines.push(`wing: "${node.wing}"`);
  if (node.file_type) lines.push(`type: "${node.file_type}"`);
  if (node.source_uri) lines.push(`source: "${node.source_uri}"`);
  if (node.published_at) lines.push(`published: "${node.published_at}"`);
  if (node.fetched_at) lines.push(`fetched: "${node.fetched_at}"`);
  if (node.author) lines.push(`author: "${node.author}"`);
  lines.push('---');
  lines.push('');

  lines.push(`# ${node.label}`);
  lines.push('');

  if (node.source_uri) {
    lines.push(`Source: [${node.source_uri}](${node.source_uri})`);
    lines.push('');
  }

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
  let workspaceFlag: string | undefined;
  let workspaceExplicit = false;
  let output: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = (): string => args[++i] ?? '';
    if (a === '--workspace') { workspaceFlag = next(); workspaceExplicit = true; }
    else if (a.startsWith('--workspace=')) { workspaceFlag = a.slice('--workspace='.length); workspaceExplicit = true; }
    else if (a === '--output' || a === '-o') output = next();
    else if (a.startsWith('--output=')) output = a.slice('--output='.length);
    else if (a === '--room' || a.startsWith('--room=')) {
      console.error('export: --room is removed in V5 (ignored). Use --workspace.');
      if (a === '--room') i++;
    }
  }
  let workspace: string | undefined;
  if (workspaceExplicit) {
    workspace = workspaceFlag === 'all' ? undefined : (workspaceFlag || undefined);
  } else {
    workspace = detectWorkspace();
  }

  const rt = await defaultRuntime();
  if (rt.isErr()) { console.error(`export: ${formatError(rt.error)}`); return 1; }
  const runtime = rt.value;

  try {
    const graphResult = await runtime.graphs.load();
    if (graphResult.isErr()) { console.error(`export: ${formatError(graphResult.error)}`); return 1; }

    const graph = graphResult.value;
    const nodes = workspace
      ? graph.json.nodes.filter((n) => n.workspace === workspace)
      : [...graph.json.nodes];
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = graph.json.links.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));

    const vaultDir = output ?? join(runtimePaths().home, 'obsidian-vault', workspace ?? 'all');
    mkdirSync(vaultDir, { recursive: true });

    const indexLines = [`# wellinformed vault — ${workspace ?? 'all workspaces'}`, '', `${nodes.length} nodes, ${edges.length} edges`, ''];
    const byWorkspace = new Map<string, GraphNode[]>();
    for (const n of nodes) {
      const ws = typeof n.workspace === 'string' ? n.workspace : 'unassigned';
      const arr = byWorkspace.get(ws) ?? [];
      arr.push(n);
      byWorkspace.set(ws, arr);
    }
    for (const [ws, ns] of byWorkspace) {
      indexLines.push(`## ${ws} (${ns.length})`);
      for (const n of ns.slice(0, 50)) {
        indexLines.push(`- [[${sanitizeFilename(n.label)}]]`);
      }
      indexLines.push('');
    }
    writeFileSync(join(vaultDir, 'index.md'), indexLines.join('\n'));

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
