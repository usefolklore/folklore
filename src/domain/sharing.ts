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
 *   - `embedding_vector` (raw float arrays) — see SEC-03 design note below
 *   - raw text / content fields (always excluded at this boundary)
 *
 * SEC-03 design note — why embedding_id, not embedding_vector:
 * The project requirements originally listed "embedding vector" as shareable.
 * Phase 15 ships `embedding_id` (a reference) instead of the raw float array
 * after review: embedding-inversion attacks can recover approximate source
 * text from sentence-transformer vectors (see Morris et al. 2023, "Text
 * Embeddings Reveal Almost As Much As Text"). Sharing the vector would make
 * the metadata boundary porous. Cross-peer semantic search (Phase 17) must
 * re-embed from source_uri + label on the receiving side, not trust imported
 * vectors. REQUIREMENTS.md SEC-03 has been updated to reflect this choice.
 */
/**
 * V5 (Phase 24): no `room` field. Sharing is per-node via the
 * `private: boolean` gate enforced upstream of `scanNode`.
 * V5.1 (Phase 26): `github_user` rides along so receiving peers can
 * pin the claimed handle against their peer-labels.json mapping.
 */
export interface ShareableNode {
  readonly id: string;
  readonly label: string;
  readonly embedding_id?: string;
  readonly source_uri?: string;
  readonly fetched_at?: string;
  /**
   * Phase 26 — verified GitHub handle of the author. Stamped at write
   * time by `indexNode` from ~/.folklore/linked-accounts.json. Travels
   * over the wire so peers can pin the claimed handle against their
   * peer-labels.json mapping via VerifyShareableOptions.expectedGithubUser.
   */
  readonly github_user?: string;
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
 * 14 built-in secret patterns. All use the 'g' flag — callers MUST
 * reset re.lastIndex = 0 before each test() invocation.
 *
 * Pattern hardening notes:
 *   - bearer-token now anchors to JWT shape (ey[JK]... . ... . ...)
 *     to avoid flagging research notes that merely mention "Bearer tokens"
 *   - private-key-block covers RSA/EC/OPENSSH/PGP/ENCRYPTED/DSA headers
 *   - google-api-key, slack-token, github-pat-fine added per review feedback
 */
const BUILT_IN_PATTERNS: ReadonlyArray<{ readonly name: string; readonly re: RegExp }> =
  Object.freeze([
    { name: 'openai-key',        re: /sk-[a-zA-Z0-9]{20,}/g },
    { name: 'github-token',      re: /ghp_[a-zA-Z0-9]{36}/g },
    { name: 'github-oauth',      re: /gho_[a-zA-Z0-9]{36}/g },
    { name: 'github-pat-fine',   re: /github_pat_[A-Za-z0-9_]{82}/g },
    { name: 'aws-key-id',        re: /AKIA[0-9A-Z]{16}/g },
    { name: 'stripe-live',       re: /sk_live_[a-zA-Z0-9]{24}/g },
    { name: 'bearer-token',      re: /Bearer\s+ey[JK][A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g },
    { name: 'google-api-key',    re: /AIza[0-9A-Za-z_-]{35}/g },
    { name: 'slack-token',       re: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
    { name: 'private-key-block', re: /-----BEGIN (RSA |EC |OPENSSH |PGP |ENCRYPTED |DSA )?PRIVATE KEY-----/g },
    { name: 'password-kv',       re: /password\s*[=:]\s*\S{6,}/gi },
    { name: 'api-key-kv',        re: /api[_-]?key\s*[=:]\s*["']?[a-zA-Z0-9._-]{10,}/gi },
    { name: 'env-token',         re: /[A-Z_]{3,}_TOKEN=[^\s"']{8,}/g },
    { name: 'env-secret',        re: /[A-Z_]{3,}_SECRET=[^\s"']{8,}/g },
    // Defense-in-depth additions (privacy critique): more vendors + a
    // vendor-agnostic secret-keyed-assignment catch. All precise (no entropy
    // heuristic, so legit high-entropy content in shared notes isn't mangled).
    { name: 'gitlab-pat',        re: /glpat-[A-Za-z0-9_-]{20}/g },
    { name: 'jwt',               re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
    { name: 'npm-token',         re: /npm_[A-Za-z0-9]{36}/g },
    { name: 'sendgrid-key',      re: /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/g },
    { name: 'stripe-restricted', re: /rk_live_[a-zA-Z0-9]{24}/g },
    { name: 'slack-webhook',     re: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/]+/g },
    { name: 'basic-auth-url',    re: /https?:\/\/[^\s:@/]+:[^\s:@/]+@[^\s]+/g },
    // Vendor-agnostic: a secret-named key assigned a credential-shaped value.
    { name: 'secret-assignment', re: /(?:client_secret|secret_key|access_token|refresh_token|private_token|auth_token|session_token|app_secret)\s*[=:]\s*["']?[A-Za-z0-9._\-+/]{12,}/gi },
  ]);

/**
 * Fields of ShareableNode that are scanned for secrets.
 * Includes id/room/embedding_id defensively — those fields are rare
 * sources of leaks but cheap to scan, and a user-derived id could
 * accidentally contain token-shaped content.
 */
const SCANNABLE_FIELDS: ReadonlyArray<keyof ShareableNode> = [
  'id',
  'label',
  'source_uri',
  'fetched_at',
  'embedding_id',
];

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
    embedding_id: node.embedding_id,
    source_uri: node.source_uri,
    fetched_at: node.fetched_at,
    github_user: node.github_user,
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
 * Audit a list of nodes for sharing safety.
 * Partitions nodes into allowed (clean) and blocked (flagged) buckets.
 * Preserves order — allowed nodes maintain their original sequence.
 *
 * V5 (Phase 24): renamed from `auditRoom` — the input is now any
 * GraphNode list, not a room-scoped one. Callers gate on
 * `node.private === false` before invoking this helper.
 */
export const auditNodes = (
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

/**
 * @deprecated V5 — back-compat alias for `auditNodes`. Will be removed
 * in a follow-up wave.
 */
export const auditRoom = auditNodes;
