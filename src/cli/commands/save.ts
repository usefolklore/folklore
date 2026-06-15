/**
 * `folklore save --label X [--type T] [--text Y] [--private] [--workspace W]`
 *
 * Port of claude-obsidian's `/save` skill — file the current answer,
 * insight, or decision as a typed node that outlives chat history.
 *
 * V5 (Phase 24): no --room. Two new optional flags:
 *   --private             stamp `private: true` on the node (default false)
 *   --workspace <slug>    override the cwd-detected workspace tag
 *
 * Without --text, body is read from stdin — pipe Claude's response in:
 *
 *   folklore save --type concept --label "Touch primitive" \
 *     --text "Asymmetric P2P pull replacing symmetric Y.js intersection rule"
 *
 *   echo "long body..." | folklore save --type synthesis --label "..."
 *
 * Node IDs are deterministic — `<type>://YYYY-MM-DD/<slug>` — so saving
 * the same title twice in one day idempotently updates the existing node.
 */

import { readFileSync } from 'node:fs';
import { defaultRuntime, detectWorkspace } from '../runtime.js';
import { indexNode } from '../../application/use-cases.js';
import { formatErrorWithHint } from '../../domain/errors.js';
import {
  NOTE_TYPES,
  type NoteType,
  isNoteType,
  nodeFromSave,
} from '../../domain/save-note.js';

interface SaveArgs {
  readonly type: NoteType;
  readonly label: string;
  readonly text?: string;
  readonly sourceUri?: string;
  readonly private: boolean;
  readonly workspace?: string;
}

const parseArgs = (rest: readonly string[]): SaveArgs | string => {
  let type: NoteType = 'synthesis';
  let label: string | undefined;
  let text: string | undefined;
  let sourceUri: string | undefined;
  let isPrivate = false;
  let workspaceFlag: string | undefined;
  let workspaceExplicit = false;
  for (let i = 0; i < rest.length; i++) {
    const f = rest[i];
    if (f === '--type') {
      const t = rest[++i];
      if (!isNoteType(t)) return `save: --type must be one of ${[...NOTE_TYPES].join('|')}`;
      type = t;
      continue;
    }
    if (f === '--label')      { label = rest[++i]; continue; }
    if (f === '--text')       { text = rest[++i]; continue; }
    if (f === '--source-uri') { sourceUri = rest[++i]; continue; }
    if (f === '--private')    { isPrivate = true; continue; }
    if (f === '--workspace')  { workspaceFlag = rest[++i]; workspaceExplicit = true; continue; }
    if (f.startsWith('--workspace=')) { workspaceFlag = f.slice('--workspace='.length); workspaceExplicit = true; continue; }
    if (f === '--room' || f.startsWith('--room=')) {
      return `save: --room is removed in V5. Use --private to keep this node local, --workspace <slug> to override the cwd-detected tag.`;
    }
    return `save: unknown flag '${f}'`;
  }
  if (!label) return 'save: --label is required';

  let workspace: string | undefined;
  if (workspaceExplicit) {
    workspace = workspaceFlag === 'all' ? undefined : (workspaceFlag || undefined);
  } else {
    workspace = detectWorkspace();
  }
  return { type, label, text, sourceUri, private: isPrivate, workspace };
};

const readStdinIfPiped = (): string => {
  if (process.stdin.isTTY) return '';
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
};

export const save = async (rest: readonly string[]): Promise<number> => {
  const parsed = parseArgs(rest);
  if (typeof parsed === 'string') {
    console.error(parsed);
    return 1;
  }

  const body = parsed.text ?? readStdinIfPiped();

  const rtRes = await defaultRuntime();
  if (rtRes.isErr()) {
    console.error(`save: ${formatErrorWithHint(rtRes.error)}`);
    return 1;
  }
  const runtime = rtRes.value;

  try {
    const node = nodeFromSave({
      type: parsed.type,
      label: parsed.label,
      body,
      sourceUri: parsed.sourceUri,
      private: parsed.private,
      workspace: parsed.workspace,
    });
    const text = body.length > 0 ? `${parsed.label}\n\n${body}` : parsed.label;

    const deps = {
      graphs: runtime.graphs,
      vectors: runtime.vectors,
      embedder: runtime.embedder,
      githubUser: runtime.githubUser,
    };

    const indexed = await indexNode(deps)({ node, text });
    if (indexed.isErr()) {
      console.error(`save: ${formatErrorWithHint(indexed.error)}`);
      return 1;
    }

    const flag = parsed.private ? ' [private]' : '';
    const ws = parsed.workspace ? ` workspace=${parsed.workspace}` : '';
    console.log(`save: filed ${parsed.type} node${flag}${ws}`);
    console.log(`  id:    ${node.id}`);
    console.log(`  label: ${parsed.label}`);
    console.log(`  body:  ${body.length} chars (${body.length > 0 ? 'embedded' : 'title-only, label embedded'})`);
    return 0;
  } finally {
    runtime.close();
  }
};
