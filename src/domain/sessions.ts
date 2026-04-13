/**
 * Pure domain types + functions for Phase 20 Claude-session ingestion.
 *
 * Every meaningful JSONL line in ~/.claude/projects/<hash>/<session-id>.jsonl
 * projects to exactly one SessionNode. The classifier is total — unrecognised
 * entry kinds return null instead of throwing, so the adapter can walk a
 * transcript end-to-end without per-line try/catch.
 *
 * No I/O. No fs. No classes. No throw. All functions pure.
 */

// ─────────────────────── entry kinds ──────────────────────

export type SessionEntryKind = 'user' | 'assistant' | 'session_start_hook';

/** One meaningful entry from a session JSONL file. */
export interface SessionEntry {
  readonly kind: SessionEntryKind;
  readonly uuid: string;
  readonly parentUuid: string | null;
  readonly sessionId: string;
  readonly timestamp: string;
  readonly cwd: string;
  readonly gitBranch: string | null;
  /** First 200 chars of the rendered body — what gets embedded. */
  readonly summary: string;
  /** Present on assistant entries that include tool_use blocks. */
  readonly toolCalls: readonly ToolCallSummary[];
  /** toolUseID (attachment entries) for cross-linking to assistant turns. */
  readonly toolUseID: string | null;
}

export interface ToolCallSummary {
  readonly tool: string;           // 'Bash' | 'Edit' | 'Write' | 'Read' | 'Grep' | 'Glob' | 'WebFetch' | 'Task'
  readonly target_path?: string;   // file_path for Edit/Write/Read; pattern for Grep/Glob
  readonly command?: string;       // command for Bash, truncated to 200 chars
  readonly exit_code?: number;     // present when attachment carries a completed tool result
}

/**
 * The graph-node projection of a SessionEntry — this is what
 * src/application/session-ingest.ts passes to the ingest pipeline.
 */
export interface SessionNode {
  readonly id: string;                         // "claude-session://<sessionId>/<uuid>"
  readonly label: string;                      // "[user] first 80 chars ..." | "[tool:Bash] npm test" | ...
  readonly room: 'sessions';                   // literal — sessions room is the only target
  readonly source_uri: string;                 // same as id, used as dedup key
  readonly fetched_at: string;                 // ISO-8601
  readonly content_summary: string;            // first 200 chars, after secrets scan
  readonly session_id: string;
  readonly parent_uuid: string | null;
  readonly timestamp: string;
  readonly cwd: string;
  readonly git_branch: string | null;
  readonly entry_kind: SessionEntryKind;
  readonly tool_calls: readonly ToolCallSummary[];
  readonly tool_use_id: string | null;
  /** True when scanNode replaced content with a [BLOCKED: ...] marker. */
  readonly _blocked_by_secret_scan: boolean;
}

/** Per-file incremental ingest state, mirrors peers.json shape pattern. */
export interface SessionFileState {
  readonly mtime: number;
  readonly byteOffset: number;
  readonly lastLineNum: number;
}

export interface SessionState {
  readonly version: 1;
  readonly files: Readonly<Record<string, SessionFileState>>;
}

/** Phase 20 sessions config, read from config.yaml sessions.* */
export interface SessionsConfig {
  /** Daemon tick frequency for the session source (seconds). Default 300. */
  readonly interval_seconds: number;
  /** Retention cutoff (days). Key-signal nodes exempt. Default 30. */
  readonly retention_days: number;
  /** Whether to apply secrets scanner to user messages too. Default true. */
  readonly scan_user_messages: boolean;
}

// ─────────────────────── classifier ───────────────────────

/** Structural shape of a JSONL line as JSON.parse returns it. */
interface RawEntry {
  readonly type?: string;
  readonly uuid?: string;
  readonly parentUuid?: string | null;
  readonly sessionId?: string;
  readonly timestamp?: string;
  readonly cwd?: string;
  readonly gitBranch?: string;
  readonly message?: { readonly role?: string; readonly content?: unknown };
  readonly attachment?: {
    readonly type?: string;
    readonly hookName?: string;
    readonly hookEvent?: string;
    readonly toolUseID?: string;
    readonly content?: string;
    readonly stdout?: string;
    readonly stderr?: string;
    readonly exitCode?: number;
    readonly command?: string;
    readonly durationMs?: number;
  };
}

const truncate = (s: string, n: number): string => (s.length > n ? s.slice(0, n) : s);

const extractAssistantSummary = (content: unknown): string => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const textBlocks = content
      .filter(
        (b): b is { type: string; text: string } =>
          typeof b === 'object' && b !== null && (b as { type: unknown }).type === 'text',
      )
      .map((b) => b.text);
    return textBlocks.join(' ');
  }
  return '';
};

const extractToolCalls = (content: unknown): ToolCallSummary[] => {
  if (!Array.isArray(content)) return [];
  const out: ToolCallSummary[] = [];
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue;
    const b = block as { type?: string; name?: string; input?: Record<string, unknown> };
    if (b.type !== 'tool_use') continue;
    const input = b.input ?? {};
    const summary: ToolCallSummary = {
      tool: b.name ?? 'unknown',
      target_path:
        typeof input.file_path === 'string'
          ? input.file_path
          : typeof input.path === 'string'
            ? input.path
            : typeof input.pattern === 'string'
              ? input.pattern
              : undefined,
      command: typeof input.command === 'string' ? truncate(input.command, 200) : undefined,
    };
    out.push(summary);
  }
  return out;
};

/**
 * Classify a parsed JSONL entry.
 * Returns null for ignored kinds (file-history-snapshot, summary, system, etc.).
 * Total function — never throws.
 */
export const classifyJsonlEntry = (raw: unknown): SessionEntry | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const e = raw as RawEntry;

  // Common required fields
  if (!e.uuid || !e.sessionId || !e.timestamp) return null;
  const base = {
    uuid: e.uuid,
    parentUuid: e.parentUuid ?? null,
    sessionId: e.sessionId,
    timestamp: e.timestamp,
    cwd: e.cwd ?? '',
    gitBranch: e.gitBranch ?? null,
  };

  // User message
  if (e.type === 'user' && e.message?.role === 'user') {
    const body =
      typeof e.message.content === 'string'
        ? e.message.content
        : extractAssistantSummary(e.message.content);
    return {
      ...base,
      kind: 'user',
      summary: truncate(body, 200),
      toolCalls: [],
      toolUseID: null,
    };
  }

  // Assistant message
  if (e.type === 'assistant' && e.message?.role === 'assistant') {
    return {
      ...base,
      kind: 'assistant',
      summary: truncate(extractAssistantSummary(e.message.content), 200),
      toolCalls: extractToolCalls(e.message.content),
      toolUseID: null,
    };
  }

  // Attachment with SessionStart hook — the "what did this session boot with" marker
  if (e.type === 'attachment' && e.attachment?.hookEvent === 'SessionStart') {
    const att = e.attachment;
    const body = `[hook:${att.hookName ?? 'unknown'}] exit=${att.exitCode ?? '?'} ${truncate(att.content ?? '', 150)}`;
    return {
      ...base,
      kind: 'session_start_hook',
      summary: body,
      toolCalls: [],
      toolUseID: att.toolUseID ?? null,
    };
  }

  return null;
};

// ─────────────────────── projection ───────────────────────

export const buildSessionNodeId = (sessionId: string, uuid: string): string =>
  `claude-session://${sessionId}/${uuid}`;

export const sessionNodeLabel = (e: SessionEntry): string => {
  switch (e.kind) {
    case 'user':
      return `[user] ${truncate(e.summary, 80)}`;
    case 'assistant': {
      if (e.toolCalls.length === 0) return `[assistant] ${truncate(e.summary, 80)}`;
      const first = e.toolCalls[0];
      return `[tool:${first.tool}] ${truncate(first.command ?? first.target_path ?? '', 80)}`;
    }
    case 'session_start_hook':
      return `[session-start] ${truncate(e.summary, 80)}`;
  }
};

// ─────────────────────── key-signal classifier ────────────

const GIT_SHA = /\b[0-9a-f]{7,40}\b/;
const API_URL = /https?:\/\/api\./;
const BLOCKED_MARKER = /\[BLOCKED:/;
const COMMIT_PHRASE = /\bcommit\s+[0-9a-f]{7,40}\b/i;

/**
 * True iff this node should survive retention beyond SessionsConfig.retention_days.
 * Key signals: git commit hashes, external API URLs, blocked-secret markers.
 */
export const hasKeySignal = (node: Pick<SessionNode, 'label' | 'content_summary'>): boolean => {
  const haystack = `${node.label}\n${node.content_summary}`;
  if (BLOCKED_MARKER.test(haystack)) return true;
  if (API_URL.test(haystack)) return true;
  if (COMMIT_PHRASE.test(haystack)) return true;
  if (GIT_SHA.test(haystack)) return true;
  return false;
};

/** Expose for tests — projected tool-call list from an already-classified entry. */
export const toolCallSummary = (e: SessionEntry): readonly ToolCallSummary[] => e.toolCalls;
