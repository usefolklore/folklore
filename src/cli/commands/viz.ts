/**
 * `folklore viz [--workspace W|all] [--output FILE]`
 *
 * Generates an interactive HTML graph visualization by shelling out
 * to graphify's Python sidecar for Leiden clustering + vis.js export.
 *
 * V5 (Phase 24): no per-room view. Use --workspace W to render only
 * nodes tagged with that workspace; --workspace all (or absence in
 * non-git cwd) renders the whole graph.
 *
 * Falls back to a simple self-contained HTML visualization if
 * graphify's Python export fails.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { formatError } from '../../domain/errors.js';
import { defaultRuntime, runtimePaths, detectWorkspace } from '../runtime.js';

const fallbackHtml = (graphJson: string, title: string): string => `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>folklore — ${title}</title>
<script src="https://unpkg.com/vis-network@9.1.9/standalone/umd/vis-network.min.js"></script>
<style>body{margin:0;background:#0c0c14;color:#fafafa;font-family:sans-serif}
#graph{width:100vw;height:100vh}#info{position:fixed;top:12px;left:12px;font-size:13px;opacity:0.7}</style>
</head><body>
<div id="info">folklore — ${title}</div>
<div id="graph"></div>
<script>
const raw = ${graphJson};
const nodes = new vis.DataSet(raw.nodes.map(n => ({
  id: n.id, label: n.label || n.id,
  color: n.workspace ? '#34d399' : '#38bdf8',
  title: [n.source_uri, n.workspace, n.file_type].filter(Boolean).join('\\n')
})));
const edges = new vis.DataSet((raw.links||raw.edges||[]).map((e,i) => ({
  id: i, from: e.source, to: e.target, label: e.relation || '',
  color: {color:'#444',highlight:'#34d399'}, arrows: ''
})));
new vis.Network(document.getElementById('graph'), {nodes, edges}, {
  physics: {solver:'forceAtlas2Based', forceAtlas2Based:{gravitationalConstant:-30}},
  nodes: {shape:'dot',size:8,font:{color:'#ccc',size:10}},
  edges: {font:{color:'#666',size:8}, smooth:{type:'continuous'}}
});
</script></body></html>`;

export const viz = async (args: readonly string[]): Promise<number> => {
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
  }
  let workspace: string | undefined;
  if (workspaceExplicit) {
    workspace = workspaceFlag === 'all' ? undefined : (workspaceFlag || undefined);
  } else {
    workspace = detectWorkspace();
  }

  const rt = await defaultRuntime();
  if (rt.isErr()) { console.error(`viz: ${formatError(rt.error)}`); return 1; }
  const runtime = rt.value;

  try {
    const graphResult = await runtime.graphs.load();
    if (graphResult.isErr()) { console.error(`viz: ${formatError(graphResult.error)}`); return 1; }

    const graph = graphResult.value;
    const filteredJson = workspace
      ? (() => {
          const matchingNodes = graph.json.nodes.filter((n) => n.workspace === workspace);
          const nodeIds = new Set(matchingNodes.map((n) => n.id));
          return {
            ...graph.json,
            nodes: matchingNodes,
            links: graph.json.links.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target)),
          };
        })()
      : graph.json;

    // Try graphify Python sidecar first
    const paths = runtimePaths();
    const venvPy = join(paths.home, 'venv', 'bin', 'python');
    const graphifyExport = join(process.cwd(), 'vendor', 'graphify', 'graphify', 'export.py');

    let html: string;
    if (existsSync(venvPy) && existsSync(graphifyExport)) {
      const tmpGraph = join(paths.home, 'viz-tmp-graph.json');
      const tmpOut = join(paths.home, 'viz-tmp-out');
      mkdirSync(tmpOut, { recursive: true });
      writeFileSync(tmpGraph, JSON.stringify(filteredJson, null, 2));

      const result = spawnSync(venvPy, [
        '-c',
        `import json; from graphify.export import to_html; from graphify.cluster import cluster; from graphify.build import build_from_json; from graphify.analyze import analyze;
g = build_from_json(json.load(open("${tmpGraph}")))
try:
    cluster(g)
except: pass
communities = {}
for nid, d in g.nodes(data=True):
    cid = d.get("community")
    if cid is not None: communities.setdefault(int(cid), []).append(nid)
to_html(g, communities, "${tmpOut}/graph.html")
print("OK")`,
      ], { encoding: 'utf8', timeout: 30000 });

      const htmlPath = join(tmpOut, 'graph.html');
      if (result.status === 0 && existsSync(htmlPath)) {
        html = readFileSync(htmlPath, 'utf8');
        console.log('Generated via graphify (Leiden clustering + vis.js)');
      } else {
        console.log('Graphify export failed, using fallback renderer');
        html = fallbackHtml(JSON.stringify(filteredJson), workspace ?? 'all workspaces');
      }
    } else {
      html = fallbackHtml(JSON.stringify(filteredJson), workspace ?? 'all workspaces');
    }

    const outPath = output ?? join(paths.home, 'graph.html');
    writeFileSync(outPath, html);
    console.log(`Graph visualization written to ${outPath}`);
    console.log(`Nodes: ${filteredJson.nodes.length} | Edges: ${filteredJson.links.length}`);

    try {
      const { exec } = await import('node:child_process');
      const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      exec(`${cmd} "${outPath}"`);
    } catch { /* manual open */ }

    return 0;
  } finally {
    runtime.close();
  }
};
