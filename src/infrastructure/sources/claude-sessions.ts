/**
 * claude_sessions source adapter — walks ~/.claude/projects/**\/*.jsonl and
 * incrementally ingests every session transcript into the `sessions` room.
 *
 * Key constraints (Phase 20 CONTEXT.md):
 *   - Current-session skip (belt-and-suspenders):
 *       1. Env var: CLAUDE_SESSION_ID set and basename matches → skip
 *       2. mtime guard: file mtime within 5 s of now → skip
 *     Both guards must be in place; the env var is not always set.
 *   - Partial-line buffering: last line without trailing \n is NOT parsed
 *     this tick — byteOffset advances only past complete lines.
 *   - Secrets scan runs BEFORE emitting — matched content is redacted
 *     (replaced with [BLOCKED: <name>]), NOT dropped. Node is still indexed.
 *   - Incremental: per-file byteOffset tracked in sessions-state.json.
 *     mutateSessionsState is called ONCE per tick (not once per file).
 *   - No throw, no class, all neverthrow. Non-fatal errors logged to stderr.
 */

import { readdirSync, statSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename, extname } from 'node:path';
import { ResultAsync, okAsync } from 'neverthrow';
import type { AppError } from '../../domain/errors.js';
import { SessionError as SE } from '../../domain/errors.js';
import type { ContentItem } from '../../domain/content.js';
import type { Source, SourceDescriptor } from '../../domain/sources.js';
import type { GraphNode } from '../../domain/graph.js';
import {
  classifyJsonlEntry,
  buildSessionNodeId,
  sessionNodeLabel,
  type SessionEntry,
  type SessionNode,
  type SessionFileState,
} from '../../domain/sessions.js';
import { scanNode, buildPatterns } from '../../domain/sharing.js';
import {
  loadSessionsState,
  mutateSessionsState,
  updateFileState,
} from '../sessions-state.js';

// ─────────────────────── constants ────────────────────────

/** Files modified within this window of now() are the active session — skip them. */
const CURRENT_SESSION_SKIP_MS = 5_000;

const BLOCKED_PREFIX = '[BLOCKED: ';

// ─────────────────────── deps + config ────────────────────

export interface ClaudeSessionsDeps {
  /** ~/.wellinformed directory — state file is written here. */
  readonly homePath: string;
  /** Compiled secret patterns from buildPatterns(). */
  readonly patterns: ReturnType<typeof buildPatterns>;
  /** Whether to apply secrets scanner to user messages (default true). */
  readonly scanUserMessages: boolean;
  /** Injectable clock — defaults to Date.now; override in tests for determinism. */
  readonly nowMs: () => number;
}

interface ClaudeSessionsConfig {
  /** Root directory to walk for *.jsonl files. Default: ~/.claude/projects */
  readonly claude_projects_path: string;
}

const parseConfig = (raw: Readonly<Record<string, unknown>>): ClaudeSessionsConfig => ({
  claude_projects_path:
    typeof raw.claude_projects_path === 'string'
      ? raw.claude_projects_path
      : join(homedir(), '.claude', 'projects'),
});

// ─────────────────────── file discovery ───────────────────

/** Recursively collect all *.jsonl files under dir, skipping common noise dirs. */
const walkJsonl = (dir: string): string[] => {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === '.git' || name === 'dist') continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      out.push(...walkJsonl(full));
    } else if (extname(name) === '.jsonl') {
      out.push(full);
    }
  }
  return out;
};

// ─────────────────────── current-session guard ────────────

/**
 * Returns true if this file should be skipped this tick.
 *
 * Belt-and-suspenders:
 *   1. Env guard: CLAUDE_SESSION_ID is set and basename matches → skip.
 *      (handles instant-flush sessions where mtime may already be old)
 *   2. mtime guard: file was modified within 5 s of now → skip.
 *      (handles sessions without CLAUDE_SESSION_ID set)
 */
const isCurrentSession = (
  filePath: string,
  mtimeMs: number,
  nowMs: number,
  currentSessionId: string | null,
): boolean => {
  if (currentSessionId !== null) {
    const base = basename(filePath, '.jsonl');
    if (base === currentSessionId) return true;
  }
  if (nowMs - mtimeMs < CURRENT_SESSION_SKIP_MS) return true;
  return false;
};

// ─────────────────────── incremental tail read ────────────

/**
 * Read the tail of a JSONL file starting at byteOffset.
 *
 * Returns only complete lines (those ending with \n). Any trailing partial
 * line (no trailing newline) is deferred to the next tick. byteOffset is
 * advanced by the sum of (complete line bytes + 1 for the newline) ONLY —
 * never by the total file size, so the next tick re-reads any partial bytes.
 */
const readTail = (
  filePath: string,
  byteOffset: number,
): { readonly lines: readonly string[]; readonly newByteOffset: number } => {
  const buf = readFileSync(filePath);
  if (byteOffset >= buf.length) return { lines: [], newByteOffset: byteOffset };
  const tail = buf.slice(byteOffset).toString('utf8');
  const parts = tail.split('\n');
  // If the last element is non-empty the tail ended without \n — it is a
  // partial line. Defer it. If it is empty the tail ended with \n — all good.
  const lastIsPartial = parts[parts.length - 1].length > 0;
  const complete = lastIsPartial ? parts.slice(0, -1) : parts.slice(0, -1);
  // Advance only by the bytes of complete lines (each line + its \n delimiter).
  let consumed = 0;
  for (const line of complete) consumed += Buffer.byteLength(line, 'utf8') + 1;
  return { lines: complete, newByteOffset: byteOffset + consumed };
};

// ─────────────────────── secrets scan + projection ────────

/**
 * Project a classified SessionEntry to a SessionNode.
 *
 * Applies the secrets scanner (Phase 15 scanNode) to both the label/id/room
 * fields (via canonical scanNode) AND the content_summary text (direct
 * pattern match against baseSummary — the real leak surface for pasted keys).
 *
 * On any match: content_summary is replaced with [BLOCKED: <name>] and
 * _blocked_by_secret_scan is set to true. The node is NOT dropped.
 * If scanUserMessages is false and entry.kind is 'user', scanning is skipped.
 */
const projectEntry = (
  entry: SessionEntry,
  patterns: ReturnType<typeof buildPatterns>,
  scanUserMessages: boolean,
  fetchedAt: string,
): SessionNode => {
  const nodeId = buildSessionNodeId(entry.sessionId, entry.uuid);
  const label = sessionNodeLabel(entry);
  const baseSummary = entry.summary;

  const shouldScan = entry.kind !== 'user' || scanUserMessages;
  let contentSummary = baseSummary;
  let blocked = false;

  if (shouldScan) {
    // Scan baseSummary directly — patterns must have lastIndex reset before each test.
    for (const { name, re } of patterns) {
      re.lastIndex = 0;
      if (re.test(baseSummary)) {
        contentSummary = `${BLOCKED_PREFIX}${name}]`;
        blocked = true;
        break;
      }
    }

    if (!blocked) {
      // Also run canonical scanNode on the graph-shaped node so id/label/room/source_uri get checked.
      const graphNodeShaped: GraphNode = {
        id: nodeId,
        label,
        room: 'sessions',
        source_uri: nodeId,
        fetched_at: fetchedAt,
        // GraphNode requires file_type + source_file (graphify fields).
        // scanNode only reads id/label/room/source_uri/fetched_at/embedding_id.
        // Supply minimal valid values so the type check passes.
        file_type: 'document',
        source_file: '',
      };
      const check = scanNode(graphNodeShaped, patterns);
      if (check.isErr()) {
        contentSummary = `${BLOCKED_PREFIX}${check.error.matches[0].patternName}]`;
        blocked = true;
      }
    }
  }

  return {
    id: nodeId,
    label,
    room: 'sessions',
    source_uri: nodeId,
    fetched_at: fetchedAt,
    content_summary: contentSummary,
    session_id: entry.sessionId,
    parent_uuid: entry.parentUuid,
    timestamp: entry.timestamp,
    cwd: entry.cwd,
    git_branch: entry.gitBranch,
    entry_kind: entry.kind,
    tool_calls: entry.toolCalls,
    tool_use_id: entry.toolUseID,
    _blocked_by_secret_scan: blocked,
  };
};

/** Map a SessionNode to a ContentItem for the standard ingest pipeline. */
const toContentItem = (node: SessionNode): ContentItem => ({
  source_uri: node.id,
  title: node.label,
  text: JSON.stringify({
    summary: node.content_summary,
    tool_calls: node.tool_calls,
    cwd: node.cwd,
    git_branch: node.git_branch,
    timestamp: node.timestamp,
  }),
  published_at: node.timestamp,
  metadata: {
    kind: 'claude_sessions',
    session_id: node.session_id,
    parent_uuid: node.parent_uuid,
    entry_kind: node.entry_kind,
    _blocked_by_secret_scan: node._blocked_by_secret_scan,
    git_branch: node.git_branch ?? '',
    cwd: node.cwd,
  },
});

// ─────────────────────── adapter factory ──────────────────

/**
 * Factory that produces a Source for the claude_sessions kind.
 *
 * Usage:
 *   claudeSessionsSource(deps)(descriptor)
 *
 * On each tick:
 *   1. Walk claude_projects_path for *.jsonl files
 *   2. Skip current session (belt-and-suspenders: env var + mtime guard)
 *   3. Read tail from stored byteOffset (partial lines deferred)
 *   4. Parse complete lines, classify entries, project + secrets-scan
 *   5. Accumulate updates map, then write state ONCE via mutateSessionsState
 *   6. Return all ContentItems
 */
export const claudeSessionsSource =
  (deps: ClaudeSessionsDeps) =>
  (descriptor: SourceDescriptor): Source => {
    const cfg = parseConfig(descriptor.config);
    const statePath = join(deps.homePath, 'sessions-state.json');
    // Snapshot the env var once per adapter lifetime — it does not change mid-process.
    const currentSessionId = process.env['CLAUDE_SESSION_ID'] ?? null;

    const fetchItems = (): ResultAsync<readonly ContentItem[], AppError> =>
      loadSessionsState(statePath).andThen((state) => {
        const now = deps.nowMs();
        const fetchedAt = new Date(now).toISOString();
        const files = walkJsonl(cfg.claude_projects_path);
        const items: ContentItem[] = [];
        const updates: Record<string, SessionFileState> = {};

        for (const file of files) {
          let st;
          try {
            st = statSync(file);
          } catch {
            // File disappeared between walk and stat — skip silently
            continue;
          }
          const mtimeMs = st.mtimeMs;

          // Belt-and-suspenders: skip current session file on both guards
          if (isCurrentSession(file, mtimeMs, now, currentSessionId)) continue;

          const prior = state.files[file];
          // If file shrank (rotation) or mtime went backwards, restart from 0
          const startOffset =
            prior && prior.mtime <= mtimeMs && prior.byteOffset <= st.size
              ? prior.byteOffset
              : 0;
          const startLineNum = prior?.lastLineNum ?? 0;

          let tail: ReturnType<typeof readTail>;
          try {
            tail = readTail(file, startOffset);
          } catch (e) {
            console.error(
              `[claude-sessions] file read error ${file}: ${(e as Error).message}`,
            );
            continue;
          }

          let lineIndex = 0;
          for (const line of tail.lines) {
            lineIndex++;
            if (line.trim().length === 0) continue;
            let raw: unknown;
            try {
              raw = JSON.parse(line);
            } catch (e) {
              console.error(
                `[claude-sessions] JSONL parse error ${file}:${startLineNum + lineIndex}: ${(e as Error).message}`,
              );
              continue;
            }
            const entry = classifyJsonlEntry(raw);
            if (!entry) continue;
            const node = projectEntry(entry, deps.patterns, deps.scanUserMessages, fetchedAt);
            items.push(toContentItem(node));
          }

          updates[file] = {
            mtime: mtimeMs,
            byteOffset: tail.newByteOffset,
            lastLineNum: startLineNum + tail.lines.length,
          };
        }

        // Write state ONCE per tick (not once per file) — N files = 1 round trip
        if (Object.keys(updates).length === 0) {
          return okAsync<readonly ContentItem[], AppError>(items);
        }

        return mutateSessionsState(statePath, (current) => {
          let next = current;
          for (const [filePath, fileState] of Object.entries(updates)) {
            next = updateFileState(next, filePath, fileState);
          }
          return next;
        })
          .map((): readonly ContentItem[] => items)
          .mapErr((e): AppError => e);
      });

    return { descriptor, fetch: fetchItems };
  };

// Re-export SE for callers that need to construct SessionError values
export { SE as SessionError };
