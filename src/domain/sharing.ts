/**
 * Pure domain functions for the sharing security boundary.
 *
 * `scanNode` projects a GraphNode → ShareableNode while checking every
 * scannable field against the secrets pattern set. A node that matches
 * any pattern is hard-blocked: the function returns err(ScanError)
 * with full match details — callers cannot override this (SEC-02).
 *
 * `auditRoom` applies `scanNode` across a list of nodes and partitions
 * the result into allowed / blocked buckets (used by `share audit` CLI).
 *
 * `buildPatterns` composes the 10 built-in patterns with any extra
 * patterns supplied via config.yaml (SecurityConfig.secrets_patterns).
 *
 * Design constraints
 * ------------------
 * - ShareableNode deliberately excludes `file_type` and `source_file`
 *   (SEC-03: metadata boundary — those fields reveal local filesystem
 *   paths and internal classification that peers must not receive).
 * - Every regex uses the 'g' flag. CRITICAL: re.lastIndex MUST be reset
 *   to 0 before each `.test()` call, otherwise stateful global regexes
 *   will produce false-negatives on consecutive calls.
 * - No I/O, no classes, no throws — pure functions throughout.
 */

import { Result, err, ok } from 'neverthrow';
import type { GraphNode } from './graph.js';
import type { ScanError, ScanMatch } from './errors.js';
import { ScanError as SE } from './errors.js';

// ─────────────────────── types ────────────────────────────

/**
 * The subset of GraphNode fields that are safe to share with peers.
 *
 * Intentionally excludes:
 *   - `file_type`   (SEC-03: reveals internal classification)
 *   - `source_file` (SEC-03: reveals local filesystem paths)
 *   - raw text / content fields (always excluded at this boundary)
 */
export interface ShareableNode {
  readonly id: string;
  readonly label: string;
  readonly room: string;
  readonly embedding_id?: string;
  readonly source_uri?: string;
  readonly fetched_at?: string;
}

export interface AuditResult {
  readonly allowed: readonly ShareableNode[];
  readonly blocked: ReadonlyArray<{
    readonly nodeId: string;
    readonly matches: readonly ScanMatch[];
  }>;
}

// ─────────────────────── patterns ─────────────────────────

/**
 * 10 built-in secret patterns. All use the 'g' flag — callers MUST
 * reset re.lastIndex = 0 before each test() invocation.
 */
const BUILT_IN_PATTERNS: ReadonlyArray<{ readonly name: string; readonly re: RegExp }> =
  Object.freeze([
    { name: 'openai-key',   re: /sk-[a-zA-Z0-9]{20,}/g },
    { name: 'github-token', re: /ghp_[a-zA-Z0-9]{36}/g },
    { name: 'github-oauth', re: /gho_[a-zA-Z0-9]{36}/g },
    { name: 'aws-key-id',   re: /AKIA[0-9A-Z]{16}/g },
    { name: 'stripe-live',  re: /sk_live_[a-zA-Z0-9]{24}/g },
    { name: 'bearer-token', re: /Bearer\s+[a-zA-Z0-9._-]{20,}/g },
    { name: 'password-kv',  re: /password\s*[=:]\s*\S{6,}/gi },
    { name: 'api-key-kv',   re: /api[_-]?key\s*[=:]\s*["']?[a-zA-Z0-9._-]{10,}/gi },
    { name: 'env-token',    re: /[A-Z_]{3,}_TOKEN=[^\s"']{8,}/g },
    { name: 'env-secret',   re: /[A-Z_]{3,}_SECRET=[^\s"']{8,}/g },
  ]);

/** Fields of ShareableNode that are scanned for secrets. */
const SCANNABLE_FIELDS: ReadonlyArray<keyof ShareableNode> = ['label', 'source_uri', 'fetched_at'];

// ─────────────────────── public API ───────────────────────

/**
 * Compose the full pattern set from built-ins plus any extras.
 * Extras come from `SecurityConfig.secrets_patterns` in config.yaml.
 * Returns a new array — BUILT_IN_PATTERNS is never mutated.
 */
export const buildPatterns = (
  extras: ReadonlyArray<{ readonly name: string; readonly pattern: string }> = [],
): ReadonlyArray<{ readonly name: string; readonly re: RegExp }> => [
  ...BUILT_IN_PATTERNS,
  ...extras.map(({ name, pattern }) => ({ name, re: new RegExp(pattern, 'g') })),
];

/**
 * Project a GraphNode to ShareableNode, scanning every string field
 * against the supplied patterns.
 *
 * Returns ok(ShareableNode) if no secrets detected.
 * Returns err(ScanError) if any pattern matches — the node is hard-blocked.
 */
export const scanNode = (
  node: GraphNode,
  patterns: ReturnType<typeof buildPatterns>,
): Result<ShareableNode, ScanError> => {
  const shareable: ShareableNode = {
    id: node.id,
    label: node.label,
    room: node.room ?? '',
    embedding_id: node.embedding_id,
    source_uri: node.source_uri,
    fetched_at: node.fetched_at,
  };

  const matches: ScanMatch[] = [];

  for (const field of SCANNABLE_FIELDS) {
    const value = shareable[field];
    if (typeof value !== 'string') continue;

    for (const { name, re } of patterns) {
      // CRITICAL: reset lastIndex before every test() call.
      // Global regexes are stateful — forgetting this causes false-negatives
      // when the same regex object is reused across multiple test() calls.
      re.lastIndex = 0;
      if (re.test(value)) matches.push({ field, patternName: name });
    }
  }

  return matches.length > 0
    ? err(SE.secretDetected(node.id, matches))
    : ok(shareable);
};

/**
 * Audit an entire room's worth of nodes for sharing safety.
 * Partitions nodes into allowed (clean) and blocked (flagged) buckets.
 * Preserves order — allowed nodes maintain their original sequence.
 */
export const auditRoom = (
  nodes: readonly GraphNode[],
  patterns: ReturnType<typeof buildPatterns>,
): AuditResult => {
  const allowed: ShareableNode[] = [];
  const blocked: Array<{ nodeId: string; matches: ScanMatch[] }> = [];

  for (const node of nodes) {
    const result = scanNode(node, patterns);
    if (result.isOk()) {
      allowed.push(result.value);
    } else {
      blocked.push({ nodeId: node.id, matches: [...result.error.matches] });
    }
  }

  return { allowed, blocked };
};
