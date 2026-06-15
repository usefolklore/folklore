/**
 * `folklore index [--workspace W] [--root DIR]`
 *
 * Index the current project into the knowledge graph: source files,
 * package.json dependencies, git submodules, and recent git history.
 *
 * V5 (Phase 24): no --room. Optional `--workspace W` tags every
 * indexed node with the slug; absent the flag, `detectWorkspace(cwd)`
 * runs against the project root.
 *
 * This command creates ephemeral source descriptors for the four
 * project-indexing adapters (codebase, package_deps, git_submodules,
 * git_log), runs them through the ingest pipeline, and reports
 * what was indexed. The descriptors are NOT persisted to sources.json
 * — they're derived from the working directory each time.
 */

import { basename } from 'node:path';
import { formatError } from '../../domain/errors.js';
import type { SourceDescriptor } from '../../domain/sources.js';
import { ingestSource } from '../../application/ingest.js';
import { defaultRuntime, detectWorkspace } from '../runtime.js';

/** Slugify a basename to a workspace-safe slug. */
const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63) || 'unnamed';

interface ParsedArgs {
  readonly workspace?: string;
  readonly root: string;
  readonly includeDev: boolean;
  readonly maxCommits: number;
}

const parseArgs = (args: readonly string[]): ParsedArgs => {
  let workspaceFlag: string | undefined;
  let workspaceExplicit = false;
  let root = process.cwd();
  let includeDev = true;
  let maxCommits = 50;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = (): string => args[++i] ?? '';
    if (a === '--workspace') { workspaceFlag = next(); workspaceExplicit = true; }
    else if (a.startsWith('--workspace=')) { workspaceFlag = a.slice('--workspace='.length); workspaceExplicit = true; }
    else if (a === '--root') root = next();
    else if (a.startsWith('--root=')) root = a.slice('--root='.length);
    else if (a === '--include-dev') includeDev = true;
    else if (a === '--no-dev') includeDev = false;
    else if (a === '--max-commits') maxCommits = parseInt(next(), 10) || 50;
    else if (a === '--room' || a.startsWith('--room=')) {
      console.error('index: --room is removed in V5 (ignored). Use --workspace instead.');
      if (a === '--room') i++;
    }
  }
  let workspace: string | undefined;
  if (workspaceExplicit) {
    workspace = workspaceFlag || undefined;
  } else {
    // Try git toplevel of the project root, fall back to basename slug.
    workspace = detectWorkspace(root) ?? slugify(basename(root));
  }
  return { workspace, root, includeDev, maxCommits };
};

export const indexProject = async (args: readonly string[]): Promise<number> => {
  const parsed = parseArgs(args);

  const rt = await defaultRuntime();
  if (rt.isErr()) {
    console.error(`index: ${formatError(rt.error)}`);
    return 1;
  }
  const runtime = rt.value;

  try {
    const workspace = parsed.workspace ?? slugify(basename(parsed.root));
    const idPrefix = workspace;

    // Build project-indexing descriptors (ephemeral, not saved).
    // V5: descriptors omit the deprecated `room` field; ingest tags
    // nodes via the source-adapter's own logic.
    const descriptors: SourceDescriptor[] = [
      {
        id: `${idPrefix}-codebase`,
        kind: 'codebase',
        enabled: true,
        config: { root: parsed.root, workspace },
      },
      {
        id: `${idPrefix}-deps`,
        kind: 'package_deps',
        enabled: true,
        config: { root: parsed.root, include_dev: parsed.includeDev, workspace },
      },
      {
        id: `${idPrefix}-submodules`,
        kind: 'git_submodules',
        enabled: true,
        config: { root: parsed.root, workspace },
      },
      {
        id: `${idPrefix}-git`,
        kind: 'git_log',
        enabled: true,
        config: { root: parsed.root, max_commits: parsed.maxCommits, workspace },
      },
    ];

    console.log(`indexing project at ${parsed.root} → workspace=${workspace}\n`);

    const ingest = ingestSource(runtime.ingestDeps);
    let totalNew = 0;
    let totalSkipped = 0;
    let hadError = false;

    for (const desc of descriptors) {
      const { sources: srcs, errors } = runtime.registry.buildAll([desc]);
      if (errors.length > 0 || srcs.length === 0) {
        console.error(`  [fail] ${desc.kind.padEnd(16)} — ${errors.map(formatError).join('; ')}`);
        hadError = true;
        continue;
      }
      const result = await ingest(srcs[0]);
      if (result.isErr()) {
        console.error(`  [fail] ${desc.kind.padEnd(16)} — ${formatError(result.error)}`);
        hadError = true;
        continue;
      }
      const run = result.value;
      console.log(
        `  [ ok ] ${desc.kind.padEnd(16)} seen=${String(run.items_seen).padStart(3)} new=${String(run.items_new).padStart(3)} skip=${String(run.items_skipped).padStart(3)}`,
      );
      totalNew += run.items_new;
      totalSkipped += run.items_skipped;
    }

    console.log(`\ntotal: ${totalNew} new, ${totalSkipped} skipped`);
    return hadError ? 1 : 0;
  } finally {
    runtime.close();
  }
};
