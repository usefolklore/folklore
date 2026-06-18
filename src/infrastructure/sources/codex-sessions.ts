/**
 * codex-sessions — parse OpenAI Codex CLI rollout transcripts into graph nodes.
 *
 * Codex stores each session as a rollout JSONL under
 * ~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl, one record per line:
 *   { timestamp, type, payload }
 * where `type: "session_meta"` carries {id, cwd, ...} and `type:
 * "response_item"` with `payload.type === "message"` carries the actual
 * conversation turns ({ role, content: [{ type, text }] }).
 *
 * This is the secure, pure core of the generic multi-provider session indexer
 * (decision: local-only / private:true, secret-scanned). It:
 *   - parses a rollout file → normalized entries (role + text + ids),
 *   - projects each to a GraphNode under the `codex-session://` scheme,
 *   - REDACTS secrets from every string field (transcripts carry pasted API
 *     keys / tokens — a hard requirement, even local-only), and
 *   - stamps `private: true` so the node never federates.
 *
 * Pure + deterministic; no I/O here (the source-adapter wiring reads files and
 * feeds `content` strings in). Registry + daemon wiring is the next step.
 */

import { createHash } from 'node:crypto';
import type { GraphNode } from '../../domain/graph.js';
import { buildPatterns } from '../../domain/sharing.js';
import { redactNode, type Redaction } from '../../domain/secret-gate.js';

export interface CodexEntry {
  readonly sessionId: string;
  readonly entryId: string; // sessionId + line index — stable within a file
  readonly role: string; // user | assistant | developer | system | tool
  readonly text: string;
  readonly timestamp: string | null;
  readonly cwd: string | null;
}

/** Deterministic node id for a Codex transcript entry. */
export const codexSessionNodeId = (sessionId: string, entryId: string): string =>
  `codex-session://${sessionId}/${createHash('sha256').update(entryId).digest('hex').slice(0, 12)}`;

const textOfContent = (content: unknown): string => {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
        return (part as { text: string }).text;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
};

/**
 * Parse a Codex rollout JSONL string into normalized conversation entries.
 * Only `response_item` records of `payload.type === "message"` with non-empty
 * text are kept; session_meta supplies the session id + cwd. Malformed lines
 * are skipped (never throw — a corrupt transcript must not break ingest).
 */
export const parseCodexRollout = (content: string): readonly CodexEntry[] => {
  const entries: CodexEntry[] = [];
  let sessionId = '';
  let cwd: string | null = null;
  let line = 0;
  for (const raw of content.split('\n')) {
    line++;
    if (!raw.trim()) continue;
    let rec: { timestamp?: unknown; type?: unknown; payload?: unknown };
    try {
      rec = JSON.parse(raw);
    } catch {
      continue;
    }
    const payload = (rec.payload ?? {}) as Record<string, unknown>;
    if (rec.type === 'session_meta') {
      if (typeof payload.id === 'string') sessionId = payload.id;
      if (typeof payload.cwd === 'string') cwd = payload.cwd;
      continue;
    }
    if (rec.type !== 'response_item' || payload.type !== 'message') continue;
    const role = typeof payload.role === 'string' ? payload.role : 'unknown';
    // Only index the actual conversation (user questions + assistant reasoning).
    // Skip developer/system/tool turns — those are permissions boilerplate +
    // tool plumbing, not knowledge worth retrieving.
    if (role !== 'user' && role !== 'assistant') continue;
    const text = textOfContent(payload.content);
    if (!text) continue;
    entries.push({
      sessionId: sessionId || 'unknown',
      entryId: `${sessionId || 'unknown'}#${line}`,
      role,
      text,
      timestamp: typeof rec.timestamp === 'string' ? rec.timestamp : null,
      cwd,
    });
  }
  return entries;
};

export interface ProjectedCodexNode {
  readonly node: GraphNode;
  readonly redactions: readonly Redaction[];
}

/**
 * Project a Codex entry to a private, secret-redacted GraphNode. The label and
 * a bounded content excerpt are redacted against the shared secret patterns
 * before they ever reach the embedder / vector store. `private: true` — these
 * never federate (the chosen sharing policy for session transcripts).
 */
export const projectCodexEntry = (
  entry: CodexEntry,
  patterns: ReturnType<typeof buildPatterns> = buildPatterns(),
  fetchedAt: string = new Date(0).toISOString(),
): ProjectedCodexNode => {
  const id = codexSessionNodeId(entry.sessionId, entry.entryId);
  const excerpt = entry.text.slice(0, 2000);
  const raw = {
    id,
    label: `codex ${entry.role}: ${entry.text.slice(0, 80).replace(/\s+/g, ' ')}`,
    file_type: 'document' as const,
    source_file: id,
    source_uri: id,
    fetched_at: entry.timestamp ?? fetchedAt,
    private: true, // session transcripts are local-only — never federate
    kind: 'codex_session',
    session_id: entry.sessionId,
    entry_role: entry.role,
    cwd: entry.cwd ?? '',
    content_summary: excerpt,
  } as unknown as GraphNode;
  return redactNode(raw, patterns);
};
