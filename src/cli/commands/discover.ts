/**
 * `wellinformed discover [--workspace W|all] [--auto]`
 *
 * V5 stub (Phase 24). Source-suggestion engine was room-keyword-driven;
 * with rooms deleted, this command returns an empty suggestion list
 * and prints a helpful deferred-feature message. The discover use
 * case (application/discover.ts) is a stub returning [] until a
 * replacement primitive is designed in Phase 25+.
 *
 * --workspace W|all is accepted for forward-compat with the read-side
 * CLI vocabulary; it has no effect today.
 */

import { discover } from '../../application/discover.js';
import { fileSourcesConfig } from '../../infrastructure/sources-config.js';
import { runtimePaths, detectWorkspace } from '../runtime.js';
import { formatError } from '../../domain/errors.js';

interface ParsedArgs {
  readonly workspace?: string;
  readonly auto: boolean;
}

const parseArgs = (args: readonly string[]): ParsedArgs => {
  let workspaceFlag: string | undefined;
  let workspaceExplicit = false;
  let auto = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = (): string => args[++i] ?? '';
    if (a === '--workspace') { workspaceFlag = next(); workspaceExplicit = true; }
    else if (a.startsWith('--workspace=')) { workspaceFlag = a.slice('--workspace='.length); workspaceExplicit = true; }
    else if (a === '--auto') auto = true;
  }
  let workspace: string | undefined;
  if (workspaceExplicit) {
    workspace = workspaceFlag === 'all' ? undefined : (workspaceFlag || undefined);
  } else {
    workspace = detectWorkspace();
  }
  return { workspace, auto };
};

export const discoverCmd = async (args: readonly string[]): Promise<number> => {
  const parsed = parseArgs(args);
  const paths = runtimePaths();
  const sources = fileSourcesConfig(paths.sources);

  const deps = { sources };
  const result = await discover(deps)();
  if (result.isErr()) {
    console.error(`discover: ${formatError(result.error)}`);
    return 1;
  }

  const suggestions = result.value;
  if (suggestions.length === 0) {
    console.log('discover: no suggestions.');
    console.log('');
    console.log('  Note: the per-room keyword discovery engine was removed in Phase 24');
    console.log('  along with the room abstraction. A replacement (workspace-keyword');
    console.log('  index or source-affinity graph) is deferred to Phase 25+.');
    if (parsed.workspace) console.log(`  workspace: ${parsed.workspace}`);
    if (parsed.auto) console.log('  (--auto is a no-op without suggestions)');
    return 0;
  }

  // Forward-compat path — keeps the rendering shape ready for a future
  // suggestion engine. Currently unreachable.
  console.log(`${suggestions.length} suggestion(s):\n`);
  for (const s of suggestions) {
    console.log(`  ${s.descriptor.id} (${s.descriptor.kind})`);
    console.log(`    reason: ${s.reason}`);
    console.log(`    config: ${JSON.stringify(s.descriptor.config)}`);
    console.log('');
  }
  return 0;
};
