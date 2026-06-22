/**
 * `folklore resume [--workspace W|all] [--limit N] [--json]`
 *
 * Agent-memory RECALL lane. Prints the most recent "where did we leave
 * off" digest(s) captured by `folklore remember` for this workspace —
 * the SessionStart hook injects this as additionalContext so a fresh
 * context window opens already knowing the last goal, decisions, files
 * touched, and open threads instead of starting blind.
 *
 * Reads graph.json directly (no vectors / embedder boot) so it stays
 * fast enough to run on every SessionStart. Every failure path prints
 * nothing and exits 0 so the hook never blocks startup.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { folkloreHome, detectWorkspace } from '../runtime.js';
import { DIGEST_SOURCE_PREFIX } from '../../domain/session-digest.js';

interface ResumeArgs {
  readonly workspace?: string;   // undefined ⇒ all workspaces
  readonly workspaceAll: boolean;
  readonly limit: number;
  readonly json: boolean;
}

interface DigestNode {
  readonly id: string;
  readonly label: string;
  readonly summary: string;
  readonly source_uri: string;
  readonly fetched_at: string;
  readonly workspace?: string;
}

const parseArgs = (rest: readonly string[]): ResumeArgs => {
  let workspace: string | undefined;
  let workspaceAll = false;
  let workspaceExplicit = false;
  let limit = 1;
  let json = false;
  for (let i = 0; i < rest.length; i++) {
    const f = rest[i];
    if (f === '--workspace') { const w = rest[++i]; workspaceExplicit = true; if (w === 'all') workspaceAll = true; else workspace = w; continue; }
    if (f.startsWith('--workspace=')) { const w = f.slice('--workspace='.length); workspaceExplicit = true; if (w === 'all') workspaceAll = true; else workspace = w; continue; }
    if (f === '--limit') { limit = Math.max(1, Number(rest[++i]) || 1); continue; }
    if (f === '--json') { json = true; continue; }
  }
  if (!workspaceExplicit) workspace = detectWorkspace();
  return { workspace, workspaceAll, limit, json };
};

const loadDigestNodes = (): readonly DigestNode[] => {
  try {
    const raw = readFileSync(join(folkloreHome(), 'graph.json'), 'utf8');
    const parsed = JSON.parse(raw) as { nodes?: readonly Record<string, unknown>[] };
    const out: DigestNode[] = [];
    for (const n of parsed.nodes ?? []) {
      const uri = typeof n.source_uri === 'string' ? n.source_uri : '';
      if (!uri.startsWith(DIGEST_SOURCE_PREFIX)) continue;
      out.push({
        id: String(n.id ?? ''),
        label: String(n.label ?? ''),
        summary: String(n.summary ?? ''),
        source_uri: uri,
        fetched_at: String(n.fetched_at ?? ''),
        workspace: typeof n.workspace === 'string' ? n.workspace : undefined,
      });
    }
    return out;
  } catch {
    return [];
  }
};

export const resume = (rest: readonly string[]): number => {
  const args = parseArgs(rest);
  let nodes = loadDigestNodes();

  if (!args.workspaceAll && args.workspace) {
    nodes = nodes.filter((n) => n.workspace === args.workspace);
  }
  nodes = [...nodes].sort((a, b) => b.fetched_at.localeCompare(a.fetched_at)).slice(0, args.limit);

  if (args.json) {
    process.stdout.write(JSON.stringify({ workspace: args.workspace ?? null, count: nodes.length, digests: nodes }) + '\n');
    return 0;
  }

  if (nodes.length === 0) {
    // Silent on the human path — nothing to resume is not an error,
    // and the SessionStart hook should inject nothing rather than noise.
    return 0;
  }

  const blocks = nodes.map((n) => n.summary.trim()).filter((s) => s.length > 0);
  if (blocks.length === 0) return 0;

  console.log('━━ where you left off (folklore session memory) ━━');
  console.log(blocks.join('\n\n---\n\n'));
  return 0;
};
