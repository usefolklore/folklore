/**
 * `wellinformed viz [--room R] [--output FILE]`
 *
 * Generates an interactive HTML graph visualization by shelling out
 * to graphify's Python sidecar for Leiden clustering + vis.js export.
 *
 * If graphify's export fails (no venv, missing deps), falls back to
 * a simple self-contained HTML visualization using the raw graph.json.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { formatError } from '../../domain/errors.js';
import { defaultRoom } from '../../domain/rooms.js';
import { defaultRuntime, runtimePaths } from '../runtime.js';

const fallbackHtml = (graphJson: string, title: string): string => `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>wellinformed — ${title}</title>
<script src="https://unpkg.com/vis-network@9.1.9/standalone/umd/vis-network.min.js"></script>
<style>body{margin:0;background:#0c0c14;color:#fafafa;font-family:sans-serif}
#graph{width:100vw;height:100vh}#info{position:fixed;top:12px;left:12px;font-size:13px;opacity:0.7}</style>
</head><body>
<div id="info">wellinformed — ${title}</div>
<div id="graph"></div>
<script>
const raw = ${graphJson};
const nodes = new vis.DataSet(raw.nodes.map(n => ({
  id: n.id, label: n.label || n.id,
  color: n.room === raw.nodes[0]?.room ? '#34d399' : '#38bdf8',
  title: [n.source_uri, n.room, n.file_type].filter(Boolean).join('\\n')
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
  if (rt.isErr()) { console.error(`viz: ${formatError(rt.error)}`); return 1; }
  const runtime = rt.value;

  try {
    if (!room) {
      const reg = await runtime.rooms.load();
      if (reg.isOk()) room = defaultRoom(reg.value);
    }

    const graphResult = await runtime.graphs.load();
    if (graphResult.isErr()) { console.error(`viz: ${formatError(graphResult.error)}`); return 1; }

    const graph = graphResult.value;
    const filteredJson = room
      ? {
          ...graph.json,
          nodes: graph.json.nodes.filter((n) => n.room === room),
          links: graph.json.links.filter((e) => {
            const nodeIds = new Set(graph.json.nodes.filter((n) => n.room === room).map((n) => n.id));
            return nodeIds.has(e.source) && nodeIds.has(e.target);
          }),
        }
      : graph.json;

    // Try graphify Python sidecar first
    const paths = runtimePaths();
    const venvPy = join(paths.home, 'venv', 'bin', 'python');
    const graphifyExport = join(process.cwd(), 'vendor', 'graphify', 'graphify', 'export.py');

    let html: string;
    if (existsSync(venvPy) && existsSync(graphifyExport)) {
      // Write temp graph.json for graphify
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
        html = fallbackHtml(JSON.stringify(filteredJson), room ?? 'all rooms');
      }
    } else {
      html = fallbackHtml(JSON.stringify(filteredJson), room ?? 'all rooms');
    }

    const outPath = output ?? join(paths.home, 'graph.html');
    writeFileSync(outPath, html);
    console.log(`Graph visualization written to ${outPath}`);
    console.log(`Nodes: ${filteredJson.nodes.length} | Edges: ${filteredJson.links.length}`);

    // Try to open in browser
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
