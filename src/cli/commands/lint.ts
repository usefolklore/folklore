/**
 * `wellinformed lint [--json]`
 *
 * Scan the graph for hygiene issues and print a report. Non-zero exit
 * if any findings — so the command can be wired into `npm test`-style
 * gates later.
 *
 * V5 (Phase 24): the shared-rooms.json consistency check is gone
 * (rooms deleted). The lint pass now focuses on:
 *
 *   - private-flag consistency (every node should have `private`
 *     stamped as a boolean — `undefined` is a v4-migration smell)
 *   - workspace-tag sanity (slugs only — no whitespace/uppercase)
 *   - secret-pattern smoke check via the existing buildPatterns set
 */

import { join } from 'node:path';
import { runtimePaths } from '../runtime.js';
import { fileGraphRepository } from '../../infrastructure/graph-repository.js';
import { loadConfig } from '../../infrastructure/config-loader.js';
import { buildPatterns } from '../../domain/sharing.js';
import { lintGraph, type LintReport, type LintOptions } from '../../domain/graph-lint.js';
import { formatError } from '../../domain/errors.js';

interface LintArgs {
  readonly json: boolean;
}

const parseArgs = (rest: readonly string[]): LintArgs | string => {
  let json = false;
  for (let i = 0; i < rest.length; i++) {
    const f = rest[i];
    if (f === '--json') { json = true; continue; }
    if (f === '--room' || f.startsWith('--room=')) {
      console.error('lint: --room is removed in V5 (ignored).');
      if (f === '--room') i++;
      continue;
    }
    return `lint: unknown flag '${f}'`;
  }
  return { json };
};

const renderText = (r: LintReport): string => {
  const lines: string[] = [];
  lines.push(`lint: whole graph — ${r.total_nodes} nodes, ${r.total_edges} edges`);
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

  const cfgRes = await loadConfig(join(paths.home, 'config.yaml'));
  const extras = cfgRes.isOk() ? cfgRes.value.security.secrets_patterns : [];
  const patterns = buildPatterns(extras);

  const opts: LintOptions = {
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
    console.log(renderText(report));
  }

  return report.findings.length > 0 ? 2 : 0;
};
