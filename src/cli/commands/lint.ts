/**
 * `wellinformed lint [--room R] [--json]`
 *
 * Scan the graph for hygiene issues and print a report. Non-zero exit
 * if any findings — so the command can be wired into `npm test`-style
 * gates later.
 *
 * Categories and P2P-specific checks are documented in the domain
 * module `src/domain/graph-lint.ts`.
 */

import { join } from 'node:path';
import { runtimePaths } from '../runtime.js';
import { fileGraphRepository } from '../../infrastructure/graph-repository.js';
import { loadSharedRooms } from '../../infrastructure/share-store.js';
import { loadConfig } from '../../infrastructure/config-loader.js';
import { buildPatterns } from '../../domain/sharing.js';
import { lintGraph, type LintReport, type LintOptions } from '../../domain/graph-lint.js';
import { formatError } from '../../domain/errors.js';

interface LintArgs {
  readonly room?: string;
  readonly json: boolean;
}

const parseArgs = (rest: readonly string[]): LintArgs | string => {
  let room: string | undefined;
  let json = false;
  for (let i = 0; i < rest.length; i++) {
    const f = rest[i];
    if (f === '--room') { room = rest[++i]; continue; }
    if (f === '--json') { json = true; continue; }
    return `lint: unknown flag '${f}'`;
  }
  return { room, json };
};

const renderText = (r: LintReport, room?: string): string => {
  const lines: string[] = [];
  const scope = room ? `room '${room}'` : 'whole graph';
  lines.push(`lint: ${scope} — ${r.total_nodes} nodes, ${r.total_edges} edges`);
  if (r.findings.length === 0) {
    lines.push('lint: clean — no findings');
    return lines.join('\n');
  }
  lines.push(`lint: ${r.findings.length} finding(s):`);
  for (const [cat, count] of r.by_category) {
    lines.push(`  ${cat.padEnd(20)} ${count}`);
  }
  lines.push('');
  lines.push('lint: top 20 findings:');
  for (const f of r.findings.slice(0, 20)) {
    const tag = f.node_id ? `${f.node_id.slice(0, 60)}` : '(edge)';
    lines.push(`  [${f.category}] ${tag} — ${f.detail.slice(0, 120)}`);
  }
  if (r.findings.length > 20) {
    lines.push(`  ...and ${r.findings.length - 20} more. use --json for the full list.`);
  }
  return lines.join('\n');
};

export const lint = async (rest: readonly string[]): Promise<number> => {
  const parsed = parseArgs(rest);
  if (typeof parsed === 'string') {
    console.error(parsed);
    return 1;
  }

  const paths = runtimePaths();
  const graphs = fileGraphRepository(join(paths.home, 'graph.json'));

  const graphRes = await graphs.load();
  if (graphRes.isErr()) {
    console.error(`lint: ${formatError(graphRes.error)}`);
    return 1;
  }

  const sharedRoomsRes = await loadSharedRooms(join(paths.home, 'shared-rooms.json'));
  const sharedRooms = sharedRoomsRes.isOk()
    ? new Set(sharedRoomsRes.value.rooms.map((r) => r.name))
    : new Set<string>();

  const cfgRes = await loadConfig(join(paths.home, 'config.yaml'));
  const extras = cfgRes.isOk() ? cfgRes.value.security.secrets_patterns : [];
  const patterns = buildPatterns(extras);

  const opts: LintOptions = {
    room: parsed.room,
    shared_rooms: sharedRooms,
    secret_patterns: patterns,
  };
  const report = lintGraph(graphRes.value, opts);

  if (parsed.json) {
    const jsonReport = {
      total_nodes: report.total_nodes,
      total_edges: report.total_edges,
      findings: report.findings,
      by_category: Object.fromEntries(report.by_category),
    };
    console.log(JSON.stringify(jsonReport, null, 2));
  } else {
    console.log(renderText(report, parsed.room));
  }

  return report.findings.length > 0 ? 2 : 0;
};
