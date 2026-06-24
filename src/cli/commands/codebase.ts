/**
 * `folklore codebase <sub>` — Phase 19 structured code graph management.
 *
 * Subcommands:
 *   index <path> [--name N]   parse a codebase into ~/.folklore/code-graph.db
 *   list [--json]             list all indexed codebases
 *   show <id> [--json]        detail view: node breakdown
 *   reindex <id>              incremental re-index (content-hash diff)
 *   search <query> [--codebase I] [--kind K] [--limit N] [--json]
 *   remove <id>               delete codebase + all nodes + edges
 */

import { resolve } from 'node:path';
import { formatError } from '../../domain/errors.js';
import type { CodebaseId, CodeNodeKind } from '../../domain/codebase.js';
import { openCodeGraph } from '../../infrastructure/code-graph.js';
import { makeParserRegistry } from '../../infrastructure/tree-sitter-parser.js';
import { indexCodebase, reindexCodebase } from '../../application/codebase-indexer.js';
import { runtimePaths } from '../runtime.js';

const VALID_KINDS = new Set<CodeNodeKind>([
  'file', 'module', 'class', 'interface',
  'function', 'method', 'import', 'export', 'type_alias',
]);

// ─────────────────────── helpers ──────────────────────

interface ArgMap {
  readonly positional: readonly string[];
  readonly flags: Readonly<Record<string, string | boolean>>;
}

const parseArgs = (rest: readonly string[]): ArgMap => {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = rest[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
};

// ─────────────────────── index ────────────────────────

const indexSub = async (rest: readonly string[]): Promise<number> => {
  const { positional, flags } = parseArgs(rest);
  if (positional.length === 0) {
    console.error('codebase index: missing <path>. usage: folklore codebase index <path> [--name <name>]');
    return 1;
  }
  const absPath = resolve(positional[0]);
  const name = typeof flags.name === 'string' ? flags.name : undefined;
  const json = flags.json === true;

  const repoRes = await openCodeGraph({ path: runtimePaths().codeGraph });
  if (repoRes.isErr()) {
    console.error(`codebase index: ${formatError(repoRes.error)}`);
    return 1;
  }
  const repo = repoRes.value;

  try {
    const registry = makeParserRegistry();
    const reportRes = await indexCodebase({ repo, registry })({ absPath, name });
    if (reportRes.isErr()) {
      console.error(`codebase index: ${formatError(reportRes.error)}`);
      return 1;
    }
    const r = reportRes.value;
    if (json) {
      console.log(JSON.stringify(r, null, 2));
      return 0;
    }
    console.log(`indexed codebase ${r.name}`);
    console.log(`  id:              ${r.codebase_id}`);
    console.log(`  root:            ${r.root_path}`);
    console.log(`  indexed files:   ${r.indexed_files}`);
    console.log(`  skipped files:   ${r.skipped_files}`);
    if (r.parse_errors > 0) {
      console.log(`  parse errors:    ${r.parse_errors} (skipped, non-fatal)`);
    }
    console.log(`  nodes:           ${r.node_count}`);
    console.log(`  edges:           ${r.edge_count}`);
    console.log(`  languages:       ${Object.entries(r.by_language).map(([l, n]) => `${l}:${n}`).join(', ')}`);
    console.log(`  by kind:         ${Object.entries(r.by_kind).map(([k, n]) => `${k}:${n}`).join(', ')}`);
    console.log(`  call confidence: exact=${r.call_confidence.exact} heuristic=${r.call_confidence.heuristic} unresolved=${r.call_confidence.unresolved}`);
    return 0;
  } finally {
    repo.close();
  }
};

// ─────────────────────── list ─────────────────────────

const listSub = async (rest: readonly string[]): Promise<number> => {
  const { flags } = parseArgs(rest);
  const json = flags.json === true;

  const repoRes = await openCodeGraph({ path: runtimePaths().codeGraph });
  if (repoRes.isErr()) {
    console.error(`codebase list: ${formatError(repoRes.error)}`);
    return 1;
  }
  const repo = repoRes.value;

  try {
    const res = await repo.listCodebases();
    if (res.isErr()) {
      console.error(`codebase list: ${formatError(res.error)}`);
      return 1;
    }
    const codebases = res.value;
    if (json) {
      console.log(JSON.stringify({ count: codebases.length, codebases }, null, 2));
      return 0;
    }
    if (codebases.length === 0) {
      console.log('no indexed codebases. try `folklore codebase index <path>`.');
      return 0;
    }
    console.log(`indexed codebases (${codebases.length}):\n`);
    for (const cb of codebases) {
      console.log(`  ${cb.id}  ${cb.name}`);
      console.log(`    root:       ${cb.root_path}`);
      console.log(`    languages:  ${cb.language_summary}`);
      console.log(`    nodes:      ${cb.node_count}`);
      console.log(`    indexed_at: ${cb.indexed_at}`);
      console.log('');
    }
    return 0;
  } finally {
    repo.close();
  }
};

// ─────────────────────── show ─────────────────────────

const showSub = async (rest: readonly string[]): Promise<number> => {
  const { positional, flags } = parseArgs(rest);
  if (positional.length === 0) {
    console.error('codebase show: missing <id>. usage: folklore codebase show <id>');
    return 1;
  }
  const id = positional[0] as CodebaseId;
  const json = flags.json === true;

  const repoRes = await openCodeGraph({ path: runtimePaths().codeGraph });
  if (repoRes.isErr()) {
    console.error(`codebase show: ${formatError(repoRes.error)}`);
    return 1;
  }
  const repo = repoRes.value;

  try {
    const cbRes = await repo.getCodebase(id);
    if (cbRes.isErr()) {
      console.error(`codebase show: ${formatError(cbRes.error)}`);
      return 1;
    }
    if (cbRes.value === null) {
      console.error(`codebase show: codebase '${id}' not found`);
      return 1;
    }
    const cb = cbRes.value;

    if (json) {
      console.log(JSON.stringify({ codebase: cb }, null, 2));
      return 0;
    }
    console.log(`codebase ${cb.name} (${cb.id})`);
    console.log(`  root:       ${cb.root_path}`);
    console.log(`  languages:  ${cb.language_summary}`);
    console.log(`  node count: ${cb.node_count}`);
    console.log(`  root sha:   ${cb.root_sha.slice(0, 16)}...`);
    console.log(`  indexed at: ${cb.indexed_at}`);
    return 0;
  } finally {
    repo.close();
  }
};

// ─────────────────────── reindex ──────────────────────

const reindexSub = async (rest: readonly string[]): Promise<number> => {
  const { positional, flags } = parseArgs(rest);
  if (positional.length === 0) {
    console.error('codebase reindex: missing <id>. usage: folklore codebase reindex <id>');
    return 1;
  }
  const id = positional[0] as CodebaseId;
  const json = flags.json === true;

  const repoRes = await openCodeGraph({ path: runtimePaths().codeGraph });
  if (repoRes.isErr()) {
    console.error(`codebase reindex: ${formatError(repoRes.error)}`);
    return 1;
  }
  const repo = repoRes.value;

  try {
    const registry = makeParserRegistry();
    const reportRes = await reindexCodebase({ repo, registry })(id);
    if (reportRes.isErr()) {
      console.error(`codebase reindex: ${formatError(reportRes.error)}`);
      return 1;
    }
    const r = reportRes.value;
    if (json) {
      console.log(JSON.stringify(r, null, 2));
      return 0;
    }
    console.log(`reindexed codebase ${r.name}`);
    console.log(`  changed files:   ${r.indexed_files}`);
    console.log(`  unchanged files: ${r.unchanged_files}`);
    console.log(`  skipped files:   ${r.skipped_files}`);
    if (r.parse_errors > 0) {
      console.log(`  parse errors:    ${r.parse_errors} (skipped, non-fatal)`);
    }
    console.log(`  nodes total:     ${r.node_count}`);
    console.log(`  edges total:     ${r.edge_count}`);
    return 0;
  } finally {
    repo.close();
  }
};

// ─────────────────────── search ───────────────────────

const searchSub = async (rest: readonly string[]): Promise<number> => {
  const { positional, flags } = parseArgs(rest);
  if (positional.length === 0) {
    console.error('codebase search: missing <query>. usage: folklore codebase search <query> [--codebase <id>] [--kind <kind>]');
    return 1;
  }
  const query = positional.join(' ');
  const codebaseId = typeof flags.codebase === 'string' ? (flags.codebase as CodebaseId) : undefined;
  const kindRaw = typeof flags.kind === 'string' ? flags.kind : undefined;
  if (kindRaw && !VALID_KINDS.has(kindRaw as CodeNodeKind)) {
    console.error(`codebase search: invalid kind '${kindRaw}'. valid: ${Array.from(VALID_KINDS).join(', ')}`);
    return 1;
  }
  const kind = kindRaw as CodeNodeKind | undefined;
  const limit = typeof flags.limit === 'string' ? parseInt(flags.limit, 10) : 20;
  const json = flags.json === true;

  const repoRes = await openCodeGraph({ path: runtimePaths().codeGraph });
  if (repoRes.isErr()) {
    console.error(`codebase search: ${formatError(repoRes.error)}`);
    return 1;
  }
  const repo = repoRes.value;
  try {
    const res = await repo.searchNodes({
      codebase_id: codebaseId,
      kind,
      // M5 — escape LIKE metacharacters so `%`/`_` in the query match literally
      // (searchNodes pairs this with ESCAPE '\'); mirrors the MCP server path.
      name_pattern: `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`,
      limit,
    });
    if (res.isErr()) {
      console.error(`codebase search: ${formatError(res.error)}`);
      return 1;
    }
    if (json) {
      console.log(JSON.stringify({ count: res.value.length, nodes: res.value }, null, 2));
      return 0;
    }
    if (res.value.length === 0) {
      console.log(`no matches for '${query}'`);
      return 0;
    }
    console.log(`found ${res.value.length} matches:`);
    for (const n of res.value) {
      console.log(`  [${n.kind}] ${n.name}  ${n.file_path}:${n.start_line}:${n.start_col}`);
    }
    return 0;
  } finally {
    repo.close();
  }
};

// ─────────────────────── remove ───────────────────────

const removeSub = async (rest: readonly string[]): Promise<number> => {
  const { positional } = parseArgs(rest);
  if (positional.length === 0) {
    console.error('codebase remove: missing <id>. usage: folklore codebase remove <id>');
    return 1;
  }
  const id = positional[0] as CodebaseId;

  const repoRes = await openCodeGraph({ path: runtimePaths().codeGraph });
  if (repoRes.isErr()) {
    console.error(`codebase remove: ${formatError(repoRes.error)}`);
    return 1;
  }
  const repo = repoRes.value;
  try {
    const res = await repo.deleteCodebase(id);
    if (res.isErr()) {
      console.error(`codebase remove: ${formatError(res.error)}`);
      return 1;
    }
    console.log(`removed codebase ${id}`);
    return 0;
  } finally {
    repo.close();
  }
};

// ─────────────────────── usage ────────────────────────

const USAGE = `usage: folklore codebase <index|list|show|reindex|search|remove>

subcommands:
  index <path> [--name N] [--json]     parse a codebase into ~/.folklore/code-graph.db
  list [--json]                         list all indexed codebases
  show <id> [--json]                    detail view: breakdown
  reindex <id> [--json]                 incremental re-index (content hash diff)
  search <query> [--codebase <id>] [--kind <kind>] [--limit <n>] [--json]
  remove <id>                           delete the codebase entirely`;

// ─────────────────────── entry ────────────────────────

export const codebase = async (args: string[]): Promise<number> => {
  const [sub, ...rest] = args;
  switch (sub) {
    case 'index':   return indexSub(rest);
    case 'list':    return listSub(rest);
    case 'show':    return showSub(rest);
    case 'reindex': return reindexSub(rest);
    case 'search':  return searchSub(rest);
    case 'remove':  return removeSub(rest);
    default:
      console.error(sub ? `codebase: unknown subcommand '${sub}'` : 'codebase: missing subcommand');
      console.error(USAGE);
      return 1;
  }
};
