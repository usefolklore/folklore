/**
 * `wellinformed dashboard [--port N]`
 *
 * Starts a localhost HTTP server serving a browser-based graph
 * visualization with search, room filter, and node inspector.
 *
 * DASH-01..06: Closes the mcp-memory-service web dashboard gap.
 *
 * The dashboard is a single self-contained HTML page served from
 * memory — no build step, no static files. vis.js loaded from CDN.
 * Graph data served via /api/graph endpoint. Search via /api/search.
 */

import { createServer } from 'node:http';
import { formatError } from '../../domain/errors.js';
import { defaultRuntime } from '../runtime.js';

const DEFAULT_PORT = 3737;

const dashboardHtml = (port: number): string => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>wellinformed dashboard</title>
<script src="https://unpkg.com/vis-network@9.1.9/standalone/umd/vis-network.min.js"></script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0c0c14;color:#f0f0f5;font-family:'Inter',-apple-system,sans-serif;display:flex;height:100vh;overflow:hidden}
#sidebar{width:320px;background:#141420;border-right:1px solid rgba(255,255,255,.06);display:flex;flex-direction:column;overflow:hidden}
#graph{flex:1;background:#0c0c14}
.panel{padding:16px;border-bottom:1px solid rgba(255,255,255,.06)}
h2{font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:10px}
#search{width:100%;background:#0c0c14;border:1px solid rgba(255,255,255,.1);color:#f0f0f5;padding:8px 12px;border-radius:8px;font-size:13px;outline:none}
#search:focus{border-color:#34d399}
#stats{font-size:12px;color:#6b7280;line-height:1.8}
#stats .val{color:#34d399;font-weight:600}
#rooms{list-style:none;font-size:12px}
#rooms li{padding:4px 8px;cursor:pointer;border-radius:4px;margin:2px 0;display:flex;justify-content:space-between}
#rooms li:hover{background:rgba(52,211,153,.08)}
#rooms li.active{background:rgba(52,211,153,.15);color:#34d399}
#rooms .count{color:#6b7280;font-size:11px}
#inspector{flex:1;overflow-y:auto;padding:16px;font-size:12px;line-height:1.7}
#inspector .field{margin-bottom:6px}
#inspector .key{color:#9ca3af}
#inspector .value{color:#f0f0f5;word-break:break-all}
#inspector a{color:#34d399;text-decoration:none}
#inspector a:hover{text-decoration:underline}
#neighbors{margin-top:12px}
#neighbors .edge{padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04);cursor:pointer}
#neighbors .edge:hover{color:#34d399}
.logo{font-size:15px;font-weight:700;color:#34d399;padding:16px;border-bottom:1px solid rgba(255,255,255,.06)}
#search-results{max-height:200px;overflow-y:auto;padding:0 16px}
#search-results .result{padding:6px 8px;cursor:pointer;border-radius:4px;font-size:12px;margin:2px 0}
#search-results .result:hover{background:rgba(52,211,153,.08)}
#search-results .dist{color:#6b7280;font-size:11px;margin-left:8px}
</style>
</head>
<body>
<div id="sidebar">
  <div class="logo">wellinformed</div>
  <div class="panel">
    <h2>Search</h2>
    <input id="search" placeholder="Semantic search..." />
    <div id="search-results"></div>
  </div>
  <div class="panel">
    <h2>Stats</h2>
    <div id="stats">Loading...</div>
  </div>
  <div class="panel">
    <h2>Rooms</h2>
    <ul id="rooms"></ul>
  </div>
  <div id="inspector">
    <div style="color:#6b7280;font-style:italic">Click a node to inspect</div>
  </div>
</div>
<div id="graph"></div>
<script>
const API = 'http://localhost:${port}/api';
const COLORS = ['#34d399','#38bdf8','#f59e0b','#fb7185','#a78bfa','#22d3ee','#f472b6','#84cc16'];
let network, allNodes, allEdges, currentRoom = null, graphData = null;

async function loadGraph() {
  const res = await fetch(API + '/graph');
  graphData = await res.json();
  renderGraph(graphData);
  renderStats(graphData);
  renderRooms(graphData);
}

function renderGraph(data) {
  const rooms = [...new Set(data.nodes.map(n => n.room || 'none'))];
  const roomColor = {};
  rooms.forEach((r,i) => roomColor[r] = COLORS[i % COLORS.length]);

  const filtered = currentRoom
    ? data.nodes.filter(n => (n.room||'none') === currentRoom)
    : data.nodes;
  const nodeIds = new Set(filtered.map(n => n.id));

  allNodes = new vis.DataSet(filtered.map(n => ({
    id: n.id, label: (n.label||n.id).slice(0,40),
    color: { background: roomColor[n.room||'none'], border: roomColor[n.room||'none'] },
    title: n.label
  })));
  allEdges = new vis.DataSet((data.links||[])
    .filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
    .map((e,i) => ({
      id: i, from: e.source, to: e.target,
      color: {color:'#333',highlight:'#34d399'}, arrows: ''
    })));

  if (network) network.destroy();
  network = new vis.Network(document.getElementById('graph'),
    {nodes: allNodes, edges: allEdges},
    {physics:{solver:'forceAtlas2Based',forceAtlas2Based:{gravitationalConstant:-20}},
     nodes:{shape:'dot',size:6,font:{color:'#ccc',size:9}},
     edges:{smooth:{type:'continuous'}}});

  network.on('click', function(params) {
    if (params.nodes.length > 0) inspectNode(params.nodes[0]);
  });
}

function renderStats(data) {
  const rooms = new Set(data.nodes.map(n => n.room)).size;
  document.getElementById('stats').innerHTML =
    '<div>Nodes: <span class="val">' + data.nodes.length + '</span></div>' +
    '<div>Edges: <span class="val">' + (data.links||[]).length + '</span></div>' +
    '<div>Rooms: <span class="val">' + rooms + '</span></div>';
}

function renderRooms(data) {
  const counts = {};
  data.nodes.forEach(n => { const r = n.room||'none'; counts[r] = (counts[r]||0)+1; });
  const ul = document.getElementById('rooms');
  ul.innerHTML = '<li class="' + (!currentRoom?'active':'') + '" onclick="filterRoom(null)">All <span class="count">' + data.nodes.length + '</span></li>';
  Object.entries(counts).sort((a,b)=>b[1]-a[1]).forEach(([r,c]) => {
    ul.innerHTML += '<li class="' + (currentRoom===r?'active':'') + '" onclick="filterRoom(\\'' + r + '\\')">' + r + ' <span class="count">' + c + '</span></li>';
  });
}

function filterRoom(room) {
  currentRoom = room;
  renderGraph(graphData);
  renderRooms(graphData);
}

function inspectNode(id) {
  const node = graphData.nodes.find(n => n.id === id);
  if (!node) return;
  const el = document.getElementById('inspector');
  let html = '<h2>Node</h2>';
  const fields = ['id','label','room','wing','file_type','source_uri','source_file','fetched_at','published_at','author','kind','content_sha256'];
  for (const f of fields) {
    if (node[f]) {
      const val = String(node[f]);
      const display = f === 'source_uri' && val.startsWith('http')
        ? '<a href="' + val + '" target="_blank">' + val + '</a>'
        : val;
      html += '<div class="field"><span class="key">' + f + ':</span> <span class="value">' + display + '</span></div>';
    }
  }
  // Neighbors
  const edges = (graphData.links||[]).filter(e => e.source === id || e.target === id);
  if (edges.length > 0) {
    html += '<div id="neighbors"><h2 style="margin-top:12px">Neighbors (' + edges.length + ')</h2>';
    for (const e of edges) {
      const otherId = e.source === id ? e.target : e.source;
      const other = graphData.nodes.find(n => n.id === otherId);
      html += '<div class="edge" onclick="inspectNode(\\'' + otherId.replace(/'/g,"\\\\'") + '\\')">' +
        (other ? other.label : otherId).slice(0,50) + ' <span style="color:#6b7280">[' + (e.relation||'') + ']</span></div>';
    }
    html += '</div>';
  }
  el.innerHTML = html;
  if (network) network.selectNodes([id]);
}

// Search
let searchTimeout;
document.getElementById('search').addEventListener('input', function() {
  clearTimeout(searchTimeout);
  const q = this.value.trim();
  if (q.length < 2) { document.getElementById('search-results').innerHTML = ''; return; }
  searchTimeout = setTimeout(async () => {
    const room = currentRoom || '';
    const res = await fetch(API + '/search?q=' + encodeURIComponent(q) + '&room=' + room + '&k=8');
    const results = await res.json();
    const el = document.getElementById('search-results');
    if (!results.length) { el.innerHTML = '<div style="padding:8px;color:#6b7280">No results</div>'; return; }
    el.innerHTML = results.map(r =>
      '<div class="result" onclick="inspectNode(\\'' + r.node_id.replace(/'/g,"\\\\'") + '\\')">' +
      (r.node_id.split('/').pop() || r.node_id).slice(0,40) +
      '<span class="dist">' + r.distance.toFixed(3) + '</span></div>'
    ).join('');
    // Highlight in graph
    if (network) network.selectNodes(results.map(r => r.node_id));
  }, 300);
});

// Auto-refresh
setInterval(loadGraph, 30000);
loadGraph();
</script>
</body>
</html>`;

export const dashboard = async (args: readonly string[]): Promise<number> => {
  let port = DEFAULT_PORT;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port') port = parseInt(args[++i] ?? String(DEFAULT_PORT), 10);
    else if (args[i]?.startsWith('--port=')) port = parseInt(args[i].slice(7), 10);
  }

  const rt = await defaultRuntime();
  if (rt.isErr()) { console.error(`dashboard: ${formatError(rt.error)}`); return 1; }
  const runtime = rt.value;

  const html = dashboardHtml(port);

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);

    if (url.pathname === '/api/graph') {
      const graph = await runtime.graphs.load();
      if (graph.isErr()) { res.writeHead(500); res.end('error'); return; }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(graph.value.json));
      return;
    }

    if (url.pathname === '/api/search') {
      const q = url.searchParams.get('q') ?? '';
      const room = url.searchParams.get('room') ?? '';
      const k = parseInt(url.searchParams.get('k') ?? '5', 10);

      const { searchByRoom, searchGlobal } = await import('../../application/use-cases.js');
      const searchDeps = { graphs: runtime.graphs, vectors: runtime.vectors, embedder: runtime.embedder };
      const result = room
        ? await searchByRoom(searchDeps)({ room, text: q, k })
        : await searchGlobal(searchDeps)({ text: q, k });

      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(result.isOk() ? result.value : []));
      return;
    }

    // Serve dashboard HTML
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  });

  server.listen(port, () => {
    console.log(`wellinformed dashboard running at http://localhost:${port}`);
    console.log('Press Ctrl+C to stop');
  });

  // Open browser
  try {
    const { exec } = await import('node:child_process');
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    exec(`${cmd} http://localhost:${port}`);
  } catch { /* manual open */ }

  await new Promise<void>((resolve) => {
    process.on('SIGINT', () => { server.close(); runtime.close(); resolve(); });
  });
  return 0;
};
