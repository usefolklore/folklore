/**
 * `wellinformed save --room R [--type T] --label X [--text Y]`
 *
 * Port of claude-obsidian's `/save` skill — file the current answer,
 * insight, or decision as a typed node that outlives chat history.
 * Pure domain logic lives in src/domain/save-note.ts; this file is the
 * thin CLI glue.
 *
 * Without --text, body is read from stdin — pipe Claude's response in:
 *
 *   wellinformed save --room project --type concept --label "Touch primitive" \
 *     --text "Asymmetric P2P pull replacing symmetric Y.js intersection rule"
 *
 *   echo "long body..." | wellinformed save --room project --type synthesis --label "..."
 *
 * Node IDs are deterministic — `<type>://YYYY-MM-DD/<slug>` — so saving
 * the same title twice in one day idempotently updates the existing node.
 */

import { readFileSync } from 'node:fs';
import { defaultRuntime } from '../runtime.js';
import { indexNode } from '../../application/use-cases.js';
import { formatError } from '../../domain/errors.js';
import {
  NOTE_TYPES,
  type NoteType,
  isNoteType,
  nodeFromSave,
} from '../../domain/save-note.js';

interface SaveArgs {
  readonly room: string;
  readonly type: NoteType;
  readonly label: string;
  readonly text?: string;
  readonly sourceUri?: string;
}

const parseArgs = (rest: readonly string[]): SaveArgs | string => {
  let room: string | undefined;
  let type: NoteType = 'synthesis';
  let label: string | undefined;
  let text: string | undefined;
  let sourceUri: string | undefined;
  for (let i = 0; i < rest.length; i++) {
    const f = rest[i];
    if (f === '--room')       { room = rest[++i]; continue; }
    if (f === '--type')       {
      const t = rest[++i];
      if (!isNoteType(t)) return `save: --type must be one of ${[...NOTE_TYPES].join('|')}`;
      type = t;
      continue;
    }
    if (f === '--label')      { label = rest[++i]; continue; }
    if (f === '--text')       { text = rest[++i]; continue; }
    if (f === '--source-uri') { sourceUri = rest[++i]; continue; }
    return `save: unknown flag '${f}'`;
  }
  if (!room) return 'save: --room is required';
  if (!label) return 'save: --label is required';
  return { room, type, label, text, sourceUri };
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
    console.error(`save: ${formatError(rtRes.error)}`);
    return 1;
  }
  const runtime = rtRes.value;

  try {
    const node = nodeFromSave({
      type: parsed.type,
      label: parsed.label,
      room: parsed.room,
      body,
      sourceUri: parsed.sourceUri,
    });
    // Body is the semantic payload when present; otherwise fall back to
    // the label so every saved node is at least title-indexed. Without
    // this, title-only stubs would never surface from vector search.
    const text = body.length > 0 ? `${parsed.label}\n\n${body}` : parsed.label;

    const deps = {
      graphs: runtime.graphs,
      vectors: runtime.vectors,
      embedder: runtime.embedder,
    };

    const indexed = await indexNode(deps)({ node, text, room: parsed.room });
    if (indexed.isErr()) {
      console.error(`save: ${formatError(indexed.error)}`);
      return 1;
    }

    console.log(`save: filed ${parsed.type} node in room '${parsed.room}'`);
    console.log(`  id:    ${node.id}`);
    console.log(`  label: ${parsed.label}`);
    console.log(`  body:  ${body.length} chars (${body.length > 0 ? 'embedded' : 'title-only, label embedded'})`);
    return 0;
  } finally {
    runtime.close();
  }
};
