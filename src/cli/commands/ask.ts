/**
 * `wellinformed ask "<query>" [--room R] [--k N]`
 *
 * Semantic search + formatted context output. Embeds the query, runs
 * k-NN, loads matching nodes from the graph, and prints a structured
 * context block to stdout that a human or LLM can consume.
 */

import { formatError } from '../../domain/errors.js';
import { getNode } from '../../domain/graph.js';
import { searchByRoom, searchGlobal } from '../../application/use-cases.js';
import { defaultRuntime } from '../runtime.js';

interface ParsedArgs {
  readonly query: string;
  readonly room?: string;
  readonly k: number;
}

const parseArgs = (args: readonly string[]): ParsedArgs | string => {
  let query = '';
  let room: string | undefined;
  let k = 5;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = (): string => args[++i] ?? '';
    if (a === '--room') room = next();
    else if (a.startsWith('--room=')) room = a.slice('--room='.length);
    else if (a === '--k' || a === '-k') k = parseInt(next(), 10) || 5;
    else if (a.startsWith('--k=')) k = parseInt(a.slice('--k='.length), 10) || 5;
    else if (!a.startsWith('-')) query = query ? `${query} ${a}` : a;
  }
  if (!query) return 'missing query — usage: wellinformed ask "your question" [--room R] [--k N]';
  return { query, room, k };
};

export const ask = async (args: readonly string[]): Promise<number> => {
  const parsed = parseArgs(args);
  if (typeof parsed === 'string') {
    console.error(`ask: ${parsed}`);
    return 1;
  }

  const rt = await defaultRuntime();
  if (rt.isErr()) {
    console.error(`ask: ${formatError(rt.error)}`);
    return 1;
  }
  const runtime = rt.value;

  try {
    const deps = {
      graphs: runtime.graphs,
      vectors: runtime.vectors,
      embedder: runtime.embedder,
    };

    const matches = parsed.room
      ? await searchByRoom(deps)({ room: parsed.room, text: parsed.query, k: parsed.k })
      : await searchGlobal(deps)({ text: parsed.query, k: parsed.k });

    if (matches.isErr()) {
      console.error(`ask: ${formatError(matches.error)}`);
      return 1;
    }

    if (matches.value.length === 0) {
      console.log('no results found. try a broader query or run `wellinformed trigger` to index content first.');
      return 0;
    }

    const graph = await runtime.graphs.load();
    if (graph.isErr()) {
      console.error(`ask: ${formatError(graph.error)}`);
      return 1;
    }

    console.log(`# wellinformed results for: ${parsed.query}`);
    if (parsed.room) console.log(`room: ${parsed.room}`);
    console.log('');

    for (const m of matches.value) {
      const node = getNode(graph.value, m.node_id);
      if (!node) {
        console.log(`## [${m.node_id}] (not in graph)`);
        continue;
      }
      console.log(`## ${node.label}`);
      console.log(`distance: ${m.distance.toFixed(3)} | room: ${node.room ?? '-'} | wing: ${node.wing ?? '-'}`);
      console.log(`source: ${node.source_uri ?? node.source_file}`);
      if (node.published_at) console.log(`published: ${node.published_at}`);
      if (node.author) console.log(`author: ${node.author}`);
      console.log('');
    }
    return 0;
  } finally {
    runtime.close();
  }
};
