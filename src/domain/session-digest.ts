/**
 * session-digest — pure, heuristic distillation of a Claude Code
 * transcript into a compact "where did we leave off" memory.
 *
 * This is the synthesis layer the raw session-ingest pipeline lacks:
 * instead of one graph node per transcript turn, `distillSession`
 * folds a whole session into a single structured digest (last goal,
 * decisions, files touched, open threads, errors, commits) that the
 * `remember` command saves as ONE embedded `decision` node, and the
 * `resume` command reads back at SessionStart.
 *
 * No API, no model call — the distillation is regex/heuristic over the
 * ACTIVE session's own transcript (the file Claude Code already writes
 * to disk). It reuses the tested `classifyJsonlEntry` parser, so the
 * transcript format is never re-implemented here.
 *
 * No I/O. No fs. No classes. No throw. All functions pure and total.
 */

import { classifyJsonlEntry, type SessionEntry } from './sessions.js';

// ─────────────────────── digest shape ─────────────────────

export interface SessionDigest {
  readonly sessionId: string | null;
  readonly workspace: string | null;
  readonly gitBranch: string | null;
  readonly firstTs: string | null;
  readonly lastTs: string | null;
  readonly userTurns: number;
  readonly assistantTurns: number;
  readonly lastUserGoal: string | null;
  readonly decisions: readonly string[];
  readonly filesTouched: readonly string[];
  readonly commands: readonly string[];
  readonly commits: readonly string[];
  readonly openThreads: readonly string[];
  readonly errors: readonly string[];
}

// ─────────────────────── parsing ──────────────────────────

/**
 * Parse a raw transcript JSONL string into the classified entries the
 * distiller consumes. Unrecognised / metadata lines drop to null and
 * are filtered. Total — never throws on malformed JSON.
 */
export const parseTranscript = (jsonl: string): readonly SessionEntry[] => {
  const out: SessionEntry[] = [];
  for (const line of jsonl.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const entry = classifyJsonlEntry(raw);
    if (entry) out.push(entry);
  }
  return out;
};

// ─────────────────────── heuristics ───────────────────────

// Sentence-level cues that a turn states a CHOICE worth remembering.
const DECISION_CUE =
  /\b(?:decided|chose|choosing|going with|went with|the fix is|root cause|because|instead of|rather than|switched to|will use|reuse|reusing|no new dep|the plan is|approach is|let's|i'll)\b/i;

// Cues that something remains UNFINISHED.
const OPEN_CUE =
  /\b(?:todo|next step|next:|still need|remaining|left to do|blocked on|not yet|follow.?up|need to|should still|haven't|have not|outstanding|tbd)\b/i;

// Cues that an ERROR / failure was hit.
const ERROR_CUE =
  /\b(?:error|failed|failing|exception|stack trace|broke|broken|cannot|could not|does not work|doesn't work|regression|red test|tsc error)\b/i;

// Tools whose target_path is a file the session edited.
const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit', 'str_replace', 'create_file']);

// git commit SHA mentioned in prose or a bash command.
const COMMIT_RE = /\bcommit\s+([0-9a-f]{7,40})\b/i;
const GIT_COMMIT_CMD = /\bgit\s+commit\b/i;

const clean = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Push `value` if non-empty and not already present (cap at `max`). */
const pushUnique = (acc: string[], value: string, max: number): void => {
  const v = clean(value);
  if (v.length === 0) return;
  if (acc.length >= max) return;
  if (acc.some((x) => x.toLowerCase() === v.toLowerCase())) return;
  acc.push(v);
};

const MAX_DECISIONS = 8;
const MAX_FILES = 25;
const MAX_COMMANDS = 12;
const MAX_OPEN = 8;
const MAX_ERRORS = 5;
const MAX_COMMITS = 8;

/**
 * Fold a list of classified session entries into a single digest.
 * Total — an empty list yields an all-empty digest (callers decide
 * whether an empty digest is worth persisting via `isDigestEmpty`).
 */
export const distillSession = (entries: readonly SessionEntry[]): SessionDigest => {
  const decisions: string[] = [];
  // Files are collected in touch order (with repeats); on overflow we
  // keep the MOST-RECENTLY touched, since that is what a resumed session
  // needs — not the first files opened. Deduped + tail-clamped at the end.
  const filesOrdered: string[] = [];
  const commands: string[] = [];
  const commits: string[] = [];
  const openThreads: string[] = [];
  const errors: string[] = [];

  let sessionId: string | null = null;
  let workspace: string | null = null;
  let gitBranch: string | null = null;
  let firstTs: string | null = null;
  let lastTs: string | null = null;
  let userTurns = 0;
  let assistantTurns = 0;
  let lastUserGoal: string | null = null;

  for (const e of entries) {
    if (!sessionId && e.sessionId) sessionId = e.sessionId;
    if (!workspace && e.cwd) workspace = e.cwd;
    if (e.gitBranch) gitBranch = e.gitBranch;
    if (e.timestamp) {
      if (!firstTs) firstTs = e.timestamp;
      lastTs = e.timestamp;
    }

    if (e.kind === 'user') {
      userTurns += 1;
      const g = clean(e.summary);
      if (g.length > 0) lastUserGoal = g;
      continue;
    }

    if (e.kind === 'assistant') {
      assistantTurns += 1;
      const text = e.summary;
      if (DECISION_CUE.test(text)) pushUnique(decisions, text, MAX_DECISIONS);
      if (OPEN_CUE.test(text)) pushUnique(openThreads, text, MAX_OPEN);
      if (ERROR_CUE.test(text)) pushUnique(errors, text, MAX_ERRORS);
      const commitMatch = text.match(COMMIT_RE);
      if (commitMatch) pushUnique(commits, commitMatch[1], MAX_COMMITS);

      for (const tc of e.toolCalls) {
        if (EDIT_TOOLS.has(tc.tool) && tc.target_path) {
          const f = clean(tc.target_path);
          if (f.length > 0) filesOrdered.push(f);
        }
        if (tc.tool === 'Bash' && tc.command) {
          const cmd = clean(tc.command);
          if (GIT_COMMIT_CMD.test(cmd)) pushUnique(commands, cmd, MAX_COMMANDS);
          const m = cmd.match(COMMIT_RE);
          if (m) pushUnique(commits, m[1], MAX_COMMITS);
        }
      }
    }
  }

  // Dedup keeping LAST occurrence (most-recent touch wins its slot),
  // then clamp to the most-recent MAX_FILES.
  const lastIndex = new Map<string, number>();
  filesOrdered.forEach((f, i) => lastIndex.set(f, i));
  const filesTouched = [...lastIndex.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([f]) => f)
    .slice(-MAX_FILES);

  return {
    sessionId,
    workspace,
    gitBranch,
    firstTs,
    lastTs,
    userTurns,
    assistantTurns,
    lastUserGoal,
    decisions,
    filesTouched,
    commands,
    commits,
    openThreads,
    errors,
  };
};

/**
 * A digest is "empty" (not worth persisting) when it carries no goal,
 * no decisions, no files, and no open threads — i.e. nothing a future
 * session could resume from.
 */
export const isDigestEmpty = (d: SessionDigest): boolean =>
  d.lastUserGoal === null &&
  d.decisions.length === 0 &&
  d.filesTouched.length === 0 &&
  d.openThreads.length === 0 &&
  d.commits.length === 0;

// ─────────────────────── rendering ────────────────────────

const section = (title: string, items: readonly string[], bullet = '- '): string[] =>
  items.length === 0 ? [] : [``, `## ${title}`, ...items.map((i) => `${bullet}${i}`)];

/**
 * Render a digest to compact markdown — the body that gets embedded
 * and shown at SessionStart. Bounded by the per-section caps applied
 * during distillation.
 */
export const renderDigest = (d: SessionDigest): string => {
  const turns = `${d.userTurns} user / ${d.assistantTurns} assistant turns`;
  const lines: string[] = [
    `# Session memory — ${d.workspace ?? 'unknown'} (${turns})`,
  ];
  if (d.gitBranch) lines.push(`branch: ${d.gitBranch}`);
  if (d.lastTs) lines.push(`last active: ${d.lastTs}`);
  if (d.lastUserGoal) lines.push(``, `Last goal: ${d.lastUserGoal}`);

  lines.push(...section('Decisions', d.decisions));
  lines.push(...section('Files touched', d.filesTouched));
  lines.push(...section('Open threads', d.openThreads));
  lines.push(...section('Errors hit', d.errors));
  lines.push(...section('Commits', d.commits));
  lines.push(...section('Commands', d.commands));

  return lines.join('\n');
};

/** A stable label slug per session so same-day re-captures update in place. */
export const digestLabel = (d: SessionDigest): string => {
  const ws = d.workspace ? d.workspace.split('/').filter(Boolean).pop() ?? 'session' : 'session';
  const sid = d.sessionId ? d.sessionId.slice(0, 8) : 'nosession';
  return `Session memory · ${ws} · ${sid}`;
};

/** Source-uri scheme that marks a node as an agent-memory digest. */
export const DIGEST_SOURCE_PREFIX = 'memory:session/' as const;

export const digestSourceUri = (d: SessionDigest): string =>
  `${DIGEST_SOURCE_PREFIX}${d.sessionId ?? 'nosession'}`;
