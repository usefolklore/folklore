/**
 * `folklore remember --transcript <path> [--workspace W] [--min-new N] [--force]`
 *
 * Agent-memory CAPTURE lane. Reads the ACTIVE session's own transcript
 * (the JSONL file Claude Code already writes — no API, no model call),
 * distills it into a single "where did we leave off" digest, and saves
 * it as ONE embedded `decision` node via the same indexNode path as
 * `folklore save`.
 *
 * The node id is deterministic per (day, workspace, session) — so the
 * Stop / PreCompact / SessionEnd hooks all UPDATE the same node in
 * place (mem0-style consolidation) instead of spamming the graph.
 *
 * Debounce: a tiny per-session state file records how many transcript
 * entries were present at the last capture. A new capture is skipped
 * when the transcript grew by fewer than --min-new entries (default 6),
 * unless --force is passed (PreCompact / SessionEnd force; Stop does not).
 *
 * Every failure path is soft — a missing/short/garbage transcript exits
 * 0 with a one-line note so the hook never blocks the session.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { defaultRuntime, detectWorkspace, folkloreHome } from '../runtime.js';
import { indexNode } from '../../application/use-cases.js';
import { formatErrorWithHint } from '../../domain/errors.js';
import { nodeFromSave } from '../../domain/save-note.js';
import { loadConfig } from '../../infrastructure/config-loader.js';
import { buildPatterns } from '../../domain/sharing.js';
import { redactNode } from '../../domain/secret-gate.js';
import {
  parseTranscript,
  distillSession,
  renderDigest,
  isDigestEmpty,
  digestLabel,
  digestSourceUri,
} from '../../domain/session-digest.js';

interface RememberArgs {
  readonly transcript: string;
  readonly workspace?: string;
  readonly minNew: number;
  readonly force: boolean;
}

const parseArgs = (rest: readonly string[]): RememberArgs | string => {
  let transcript: string | undefined;
  let workspace: string | undefined;
  let workspaceExplicit = false;
  let minNew = 6;
  let force = false;
  for (let i = 0; i < rest.length; i++) {
    const f = rest[i];
    if (f === '--transcript') { transcript = rest[++i]; continue; }
    if (f.startsWith('--transcript=')) { transcript = f.slice('--transcript='.length); continue; }
    if (f === '--workspace') { workspace = rest[++i]; workspaceExplicit = true; continue; }
    if (f.startsWith('--workspace=')) { workspace = f.slice('--workspace='.length); workspaceExplicit = true; continue; }
    if (f === '--min-new') { minNew = Number(rest[++i]) || 0; continue; }
    if (f === '--force') { force = true; continue; }
    return `remember: unknown flag '${f}'`;
  }
  if (!transcript) return 'remember: --transcript <path> is required';
  const ws = workspaceExplicit ? (workspace || undefined) : detectWorkspace();
  return { transcript, workspace: ws, minNew, force };
};

// ── per-session debounce state ────────────────────────────
interface CaptureState { readonly [sessionId: string]: number }

const statePath = (): string => join(folkloreHome(), 'memory-capture-state.json');

const readState = (): CaptureState => {
  try {
    return JSON.parse(readFileSync(statePath(), 'utf8')) as CaptureState;
  } catch {
    return {};
  }
};

const writeState = (next: CaptureState): void => {
  try {
    const home = folkloreHome();
    if (!existsSync(home)) mkdirSync(home, { recursive: true });
    const tmp = statePath() + '.tmp';
    writeFileSync(tmp, JSON.stringify(next));
    renameSync(tmp, statePath()); // atomic-ish replace
  } catch {
    /* benign — debounce state is best-effort */
  }
};

export const remember = async (rest: readonly string[]): Promise<number> => {
  const parsed = parseArgs(rest);
  if (typeof parsed === 'string') {
    console.error(parsed);
    return 1;
  }

  let jsonl: string;
  try {
    jsonl = readFileSync(parsed.transcript, 'utf8');
  } catch {
    console.error(`remember: transcript not readable: ${parsed.transcript}`);
    return 0; // soft — never block the hook
  }

  const entries = parseTranscript(jsonl);
  if (entries.length === 0) {
    console.log('remember: transcript has no usable turns yet — skipping.');
    return 0;
  }

  const digest = distillSession(entries);
  if (isDigestEmpty(digest)) {
    console.log('remember: nothing worth remembering yet — skipping.');
    return 0;
  }

  // Debounce on transcript growth unless forced.
  const sid = digest.sessionId ?? 'nosession';
  const state = readState();
  const lastCount = state[sid] ?? 0;
  if (!parsed.force && entries.length - lastCount < parsed.minNew) {
    console.log(
      `remember: only ${entries.length - lastCount} new turns since last capture (< ${parsed.minNew}) — skipping. Pass --force to override.`,
    );
    return 0;
  }

  const workspace = parsed.workspace ?? (digest.workspace
    ? digest.workspace.split('/').filter(Boolean).pop()
    : undefined);
  const label = digestLabel(digest);
  const body = renderDigest(digest);
  const sourceUri = digestSourceUri(digest);

  const rtRes = await defaultRuntime();
  if (rtRes.isErr()) {
    console.error(`remember: ${formatErrorWithHint(rtRes.error)}`);
    return 0; // soft
  }
  const runtime = rtRes.value;

  try {
    const rawNode = nodeFromSave({
      type: 'decision',
      label,
      body,
      sourceUri,
      private: true, // session memory never federates
      workspace,
    });

    // Redact secrets BEFORE the node is embedded or written to the
    // graph. A transcript can contain a pasted API key; the digest is
    // private (never federates) but is injected back into context at
    // SessionStart, so a leak would resurface in plaintext. Redact the
    // node's string fields and re-derive the embed text from the
    // cleaned label + summary so the vector never indexes the secret.
    const cfgRes = await loadConfig(join(folkloreHome(), 'config.yaml'));
    const patterns = buildPatterns(cfgRes.isOk() ? cfgRes.value.security.secrets_patterns : []);
    const { node, redactions } = redactNode(rawNode, patterns);
    const cleanBody = typeof node.summary === 'string' ? node.summary : body;
    const text = `${node.label}\n\n${cleanBody}`;

    const indexed = await indexNode({
      graphs: runtime.graphs,
      vectors: runtime.vectors,
      embedder: runtime.embedder,
      githubUser: runtime.githubUser,
    })({ node, text });
    if (indexed.isErr()) {
      console.error(`remember: ${formatErrorWithHint(indexed.error)}`);
      return 0; // soft
    }

    writeState({ ...state, [sid]: entries.length });

    const ws = workspace ? ` workspace=${workspace}` : '';
    const red = redactions.length > 0 ? ` · redacted=${redactions.reduce((s, r) => s + r.count, 0)}` : '';
    console.log(`remember: captured session digest${ws}`);
    console.log(`  id:       ${node.id}`);
    console.log(`  turns:    ${digest.userTurns}u/${digest.assistantTurns}a · files=${digest.filesTouched.length} · decisions=${digest.decisions.length} · open=${digest.openThreads.length}${red}`);
    return 0;
  } finally {
    runtime.close();
  }
};
