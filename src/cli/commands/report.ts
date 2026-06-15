/**
 * `folklore report [--workspace W|all] [--since DATE] [--no-save]`
 *
 * Generates a markdown report from the current graph state and
 * optionally persists it to ~/.folklore/reports/<date>.md.
 *
 * V5 (Phase 24): no per-room reports. The report covers the global
 * graph. --workspace W|all is accepted for future workspace-scoped
 * reports; currently it only affects the file-system path so reports
 * from different workspaces don't collide.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatError } from '../../domain/errors.js';
import { generateReport, renderReport } from '../../application/report.js';
import { defaultRuntime, detectWorkspace } from '../runtime.js';

interface ParsedArgs {
  readonly workspace?: string;
  readonly since?: string;
  readonly save: boolean;
}

const parseArgs = (args: readonly string[]): ParsedArgs => {
  let workspaceFlag: string | undefined;
  let workspaceExplicit = false;
  let since: string | undefined;
  let save = true;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = (): string => args[++i] ?? '';
    if (a === '--workspace') { workspaceFlag = next(); workspaceExplicit = true; }
    else if (a.startsWith('--workspace=')) { workspaceFlag = a.slice('--workspace='.length); workspaceExplicit = true; }
    else if (a === '--since') since = next();
    else if (a.startsWith('--since=')) since = a.slice('--since='.length);
    else if (a === '--no-save') save = false;
  }
  let workspace: string | undefined;
  if (workspaceExplicit) {
    workspace = workspaceFlag === 'all' ? undefined : (workspaceFlag || undefined);
  } else {
    workspace = detectWorkspace();
  }
  return { workspace, since, save };
};

export const report = async (args: readonly string[]): Promise<number> => {
  const parsed = parseArgs(args);

  const rt = await defaultRuntime();
  if (rt.isErr()) {
    console.error(`report: ${formatError(rt.error)}`);
    return 1;
  }
  const runtime = rt.value;

  try {
    const deps = {
      graphs: runtime.graphs,
      vectors: runtime.vectors,
      sources: runtime.sources,
    };

    const result = await generateReport(deps)({ since: parsed.since });
    if (result.isErr()) {
      console.error(`report: ${formatError(result.error)}`);
      return 1;
    }

    const markdown = renderReport(result.value);
    console.log(markdown);

    if (parsed.save) {
      // Reports land under reports/<workspace>/ when a workspace is in
      // play, otherwise the flat reports/ directory.
      const reportDir = parsed.workspace
        ? join(runtime.paths.home, 'reports', parsed.workspace)
        : join(runtime.paths.home, 'reports');
      mkdirSync(reportDir, { recursive: true });
      const date = result.value.generated_at.slice(0, 10);
      const filePath = join(reportDir, `${date}.md`);
      writeFileSync(filePath, markdown);
      console.log(`\nsaved to ${filePath}`);
    }

    return 0;
  } finally {
    runtime.close();
  }
};
