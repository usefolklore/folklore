/**
 * `wellinformed recall <name> [--room R] [--k N] [--json]`
 *
 * Entity-first lookup. Resolves <name> against the entity registry,
 * traverses every `mentions` edge, returns ranked source chunks
 * across every room.
 *
 * The contrast with `ask`: ask runs a vector search over the
 * embedding space; recall runs a graph traversal from a known
 * entity. For a query like "lemlist" — a brand name that doesn't
 * embed especially well — recall is the right channel. For a
 * query like "how to do hybrid retrieval" — semantic — ask still
 * wins.
 */

import { recall } from '../../application/recall.js';
import { defaultRuntime } from '../runtime.js';
import { formatError } from '../../domain/errors.js';

interface ParsedArgs {
  readonly query: string;
  readonly room?: string;
  readonly k: number;
  readonly json: boolean;
}

const parseArgs = (args: readonly string[]): ParsedArgs | string => {
  let query = '';
  let room: string | undefined;
  let k = 20;
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = (): string => args[++i] ?? '';
    if (a === '--room') room = next();
    else if (a.startsWith('--room=')) room = a.slice('--room='.length);
    else if (a === '--k' || a === '-k') k = parseInt(next(), 10) || 20;
    else if (a.startsWith('--k=')) k = parseInt(a.slice('--k='.length), 10) || 20;
    else if (a === '--json') json = true;
    else if (!a.startsWith('-')) query = query ? `${query} ${a}` : a;
  }
  if (!query) return 'missing name — usage: wellinformed recall <name> [--room R] [--k N] [--json]';
  return { query, room, k, json };
};

export const recallCmd = async (args: readonly string[]): Promise<number> => {
  if (args.includes('--help') || args.includes('-h') || args.includes('help')) {
    console.log(`usage: wellinformed recall <name> [--room R] [--k N] [--json]

Entity-first lookup. Resolves <name> against the entity registry
(\`wellinformed entity add ...\`) plus heuristic auto-detected
entities, then walks every \`mentions\` edge in the graph to
return chunks that reference it across every room.

flags:
  --room R   restrict to a single room
  --k N      max results (default 20)
  --json     machine-readable output`);
    return 0;
  }

  const parsed = parseArgs(args);
  if (typeof parsed === 'string') {
    console.error(`recall: ${parsed}`);
    return 1;
  }

  const rt = await defaultRuntime();
  if (rt.isErr()) {
    console.error(`recall: ${formatError(rt.error)}`);
    return 1;
  }
  const runtime = rt.value;
  try {
    const graphRes = await runtime.graphs.load();
    if (graphRes.isErr()) {
      console.error(`recall: graph load failed: ${formatError(graphRes.error)}`);
      return 1;
    }
    return await runRecall(runtime, graphRes.value, parsed);
  } finally {
    runtime.close();
  }
};

const runRecall = async (
  runtime: import('../runtime.js').Runtime,
  graph: import('../../domain/graph.js').Graph,
  parsed: { readonly query: string; readonly room?: string; readonly k: number; readonly json: boolean },
): Promise<number> => {
  const result = recall(
    { registry: runtime.entityRegistry, graph },
    { query: parsed.query, limit: parsed.k, room: parsed.room },
  );

  if (result.isErr()) {
    if (result.error.type === 'EntityNotFound') {
      if (parsed.json) {
        console.log(JSON.stringify({ query: parsed.query, found: false, hits: [] }));
        return 0;
      }
      console.log(`no entity registered for "${parsed.query}".`);
      console.log(`  register one with: wellinformed entity add "${parsed.query}"`);
      console.log(`  or run an ingest — heuristic detection picks up CamelCase identifiers`);
      console.log(`  and URL hosts automatically.`);
      return 0;
    }
    console.error(`recall: ${result.error.message}`);
    return 1;
  }

  const { entity, hits, total } = result.value;

  if (parsed.json) {
    console.log(JSON.stringify({
      query: parsed.query,
      entity: {
        id: entity.id,
        label: entity.label,
        type: entity.type,
        aliases: entity.aliases,
        mention_count: entity.mention_count,
        first_seen: entity.first_seen,
        last_seen: entity.last_seen,
      },
      total,
      hits,
    }));
    return 0;
  }

  console.log(`# wellinformed recall: ${entity.label}`);
  console.log(`entity:  ${entity.id}`);
  console.log(`type:    ${entity.type}`);
  console.log(`aliases: ${entity.aliases.join(', ')}`);
  console.log(`mentions: ${total} (showing ${hits.length})`);
  if (parsed.room) console.log(`room:    ${parsed.room}`);
  console.log('');

  if (hits.length === 0) {
    console.log('no chunks reference this entity yet — heuristics may not have caught it,');
    console.log('or no ingest has run since registration. try `wellinformed trigger`.');
    return 0;
  }

  const renderAge = (d?: number): string => {
    if (d === undefined) return 'age:?';
    if (d < 1) return 'today';
    if (d < 14) return `${Math.round(d)}d`;
    if (d < 90) return `${Math.round(d / 7)}w`;
    return `${Math.round(d / 30)}mo`;
  };

  for (const h of hits) {
    console.log(`## ${h.label}`);
    console.log(`room: ${h.room ?? '-'} | ${renderAge(h.age_days)} | surface: "${h.surface}"`);
    if (h.source_uri) console.log(`source: ${h.source_uri}`);
    if (h.summary) {
      const snippet = h.summary.replace(/\s+/g, ' ').slice(0, 320);
      console.log('');
      console.log(snippet);
    }
    console.log('');
  }
  return 0;
};
