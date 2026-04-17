/**
 * Remote node validator — the single trust boundary for nodes arriving
 * from untrusted peers (touch initiator, share-sync CRDT apply).
 *
 * Closes attack surfaces from docs/p2p-threat-model.md:
 *   AS-1 — prototype pollution:      reject __proto__ / constructor / prototype keys
 *   AS-2 — malformed GraphNode:      enforce field whitelist + type checks + size caps
 *   AS-6 — SSRF via source_uri:      allow-list schemes, reject file:// and private IPs
 *   AS-7 — Y.js gadget chain:        same validation applied to CRDT-materialised nodes
 *
 * Design:
 *   - Pure, functional, no I/O — domain-layer predicate.
 *   - Returns Result<GraphNode, ValidationFailure> — caller decides whether
 *     to drop the single node or abort the whole batch.
 *   - Copy-on-validate: produces a NEW node with only allow-listed keys
 *     and sanitised values. The returned node is safe to feed into
 *     upsertNode without further checks.
 *
 * The allow list is derived from GraphifyNodeCore + WellinformedNodeFields
 * plus a small set of permitted "extra" keys that legitimate adapters set.
 * Any other key — including `__proto__`, function properties, and
 * adapter-specific fields we haven't audited — is dropped silently.
 */

import { err, ok, type Result } from 'neverthrow';
import type { GraphNode } from './graph.js';

// ─────────────────────── constants ─────────────────────────

/** Upper bound on node label length — 8 KB of UTF-16 ≈ 8000 characters. */
const MAX_LABEL_LEN = 8192 as const;
/** Upper bound on source_uri / file paths. */
const MAX_URI_LEN = 2048 as const;
/** Upper bound on any other allow-listed string field. */
const MAX_GENERIC_STRING_LEN = 1024 as const;
/** Total JSON-serialised node size ceiling — defence in depth. */
const MAX_NODE_SERIALISED_BYTES = 65_536;

/**
 * file_type is an enumerated discriminator from graphify — anything else
 * means the node didn't come from a trusted adapter and must be refused.
 */
const ALLOWED_FILE_TYPES = new Set<GraphNode['file_type']>([
  'code',
  'document',
  'paper',
  'image',
  'rationale',
]);

/**
 * URI schemes that are safe to eventually re-fetch. file:// is banned
 * outright — it lets a peer read our local filesystem via the ingest
 * pipeline. gopher/ftp/data are banned because they are unused and
 * can be SSRF vectors.
 */
/**
 * Allow-listed URI schemes. Two categories:
 *   - Network-fetchable (NETWORK_SCHEMES below): http, https — real
 *     URLs that can trigger an outbound fetch. Must pass URL() parse
 *     and the BLOCKED_HOST_PREFIXES SSRF gate.
 *   - Opaque internal (OPAQUE_INTERNAL_PREFIXES): references used by
 *     specific adapters. arxiv://<id>, p2p://<peer>, git://<hash>,
 *     npm://<pkg>, websearch:<query>, claude-session://<sid>, and
 *     file-uri:<path> never trigger a network fetch on their own. They
 *     may not be URL()-parseable (git hashes have no authority) so we
 *     bypass the URL parse path and only check length + control chars.
 *
 * Adding a new internal scheme? Append the `<scheme>:` prefix here —
 * this set is the single source of truth for both validateUri fast-path
 * and scheme-allow checks.
 */
const NETWORK_SCHEMES = new Set<string>(['http:', 'https:']);

const OPAQUE_INTERNAL_PREFIXES = [
  'arxiv:',
  'p2p:',
  'git:',
  'npm:',
  'websearch:',
  'claude-session:',
  'file-uri:',
] as const;

const isOpaqueInternalUri = (raw: string): boolean =>
  OPAQUE_INTERNAL_PREFIXES.some((p) => raw.startsWith(p));

const ALLOWED_URI_SCHEMES = NETWORK_SCHEMES;

/**
 * Private / link-local / loopback IP prefixes. If a peer hands us a
 * source_uri pointing at one of these, the ingest path would pivot the
 * request to the peer's LAN / cloud metadata services.
 */
const BLOCKED_HOST_PREFIXES = [
  '127.',
  '10.',
  '192.168.',
  '169.254.', // link-local + AWS IMDS
  '0.',
  '::1',
  'localhost',
  'metadata.google.internal',
  'metadata.',
];

/**
 * Keys from the GraphNode structural type plus optional extras that
 * legitimate adapters are allowed to set. Anything not in this set is
 * stripped — that includes __proto__, constructor, prototype, toJSON,
 * toString, etc. Prototype-pollution defence is just "copy only these".
 */
const ALLOWED_KEYS = new Set<string>([
  // GraphifyNodeCore (required)
  'id',
  'label',
  'file_type',
  'source_file',
  // WellinformedNodeFields (optional)
  'room',
  'wing',
  'source_uri',
  'fetched_at',
  'embedding_id',
  // Known adapter-set extras that are safe to round-trip (additive)
  'published',
  'tags',
  'summary',
  'title',
  'author',
  'authors',
  'chunk_index',
  'chunk_of',
  'language',
  'word_count',
  'content_hash',
]);

// ─────────────────────── result type ───────────────────────

export type ValidationFailure =
  | { readonly kind: 'MissingRequiredField'; readonly field: string }
  | { readonly kind: 'InvalidFieldType'; readonly field: string; readonly expected: string }
  | { readonly kind: 'StringTooLong'; readonly field: string; readonly limit: number }
  | { readonly kind: 'FileTypeNotAllowed'; readonly got: string }
  | { readonly kind: 'UriSchemeNotAllowed'; readonly scheme: string }
  | { readonly kind: 'UriHostBlocked'; readonly host: string }
  | { readonly kind: 'UriMalformed'; readonly uri: string; readonly message: string }
  | { readonly kind: 'SerialisedNodeTooLarge'; readonly bytes: number }
  | { readonly kind: 'ControlCharacterInString'; readonly field: string };

// ─────────────────────── predicates ────────────────────────

/** Detect NUL bytes and < 0x20 control characters outside tab / newline. */
const containsControlChar = (s: string): boolean => {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0) return true;
    if (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) return true;
  }
  return false;
};

const isPlainString = (v: unknown, max: number, field: string): Result<string, ValidationFailure> => {
  if (typeof v !== 'string') {
    return err({ kind: 'InvalidFieldType', field, expected: 'string' });
  }
  if (v.length > max) {
    return err({ kind: 'StringTooLong', field, limit: max });
  }
  if (containsControlChar(v)) {
    return err({ kind: 'ControlCharacterInString', field });
  }
  return ok(v);
};

const validateUri = (raw: string): Result<string, ValidationFailure> => {
  if (raw.length > MAX_URI_LEN) {
    return err({ kind: 'StringTooLong', field: 'source_uri', limit: MAX_URI_LEN });
  }
  // Opaque internal schemes: identifiers, not URL targets. Skip URL()
  // parse — these don't always have an authority component.
  if (isOpaqueInternalUri(raw)) return ok(raw);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch (e) {
    return err({ kind: 'UriMalformed', uri: raw, message: (e as Error).message });
  }
  if (!ALLOWED_URI_SCHEMES.has(parsed.protocol)) {
    return err({ kind: 'UriSchemeNotAllowed', scheme: parsed.protocol });
  }
  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_HOST_PREFIXES.some((p) => host === p || host.startsWith(p))) {
    return err({ kind: 'UriHostBlocked', host });
  }
  return ok(raw);
};

// ─────────────────────── entry point ───────────────────────

/**
 * Validate a single untrusted node. Returns a *new* node containing only
 * allow-listed keys with validated values. The returned node is safe to
 * pass to upsertNode.
 *
 * The validator is deliberately strict: an unknown extra field is dropped
 * silently (not an error). We prefer "accept a de-featured node" over
 * "reject the whole touch batch" because losing a tag is recoverable
 * while losing the node isn't.
 *
 * Hard errors are reserved for: missing required field, wrong type on
 * required field, string length overflow, forbidden file_type / URI
 * scheme / URI host. These are attack-shaped, not mistake-shaped.
 */
export const validateRemoteNode = (raw: unknown): Result<GraphNode, ValidationFailure> => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return err({ kind: 'InvalidFieldType', field: '<root>', expected: 'object' });
  }
  // Size gate BEFORE any further walk — a 100 MB label would otherwise
  // blow the string validator's time budget.
  let serialised: string;
  try {
    serialised = JSON.stringify(raw);
  } catch {
    return err({ kind: 'InvalidFieldType', field: '<root>', expected: 'JSON-serialisable object' });
  }
  if (serialised.length > MAX_NODE_SERIALISED_BYTES) {
    return err({ kind: 'SerialisedNodeTooLarge', bytes: serialised.length });
  }

  const src = raw as Record<string, unknown>;

  // Required fields from GraphifyNodeCore
  const idRes = isPlainString(src.id, MAX_URI_LEN, 'id');
  if (idRes.isErr()) return err(idRes.error);
  const labelRes = isPlainString(src.label, MAX_LABEL_LEN, 'label');
  if (labelRes.isErr()) return err(labelRes.error);
  const sourceFileRes = isPlainString(src.source_file, MAX_URI_LEN, 'source_file');
  if (sourceFileRes.isErr()) return err(sourceFileRes.error);

  const fileType = src.file_type;
  if (typeof fileType !== 'string') {
    return err({ kind: 'InvalidFieldType', field: 'file_type', expected: 'string' });
  }
  if (!ALLOWED_FILE_TYPES.has(fileType as GraphNode['file_type'])) {
    return err({ kind: 'FileTypeNotAllowed', got: fileType });
  }

  // source_uri is the one extra field with its own URL-safety rules.
  let sourceUri: string | undefined;
  if (typeof src.source_uri === 'string') {
    const r = validateUri(src.source_uri);
    if (r.isErr()) return err(r.error);
    sourceUri = r.value;
  }

  // Build the sanitised copy — only allow-listed keys pass.
  const out: Record<string, unknown> = {
    id: idRes.value,
    label: labelRes.value,
    file_type: fileType,
    source_file: sourceFileRes.value,
  };
  if (sourceUri !== undefined) out.source_uri = sourceUri;

  for (const key of Object.keys(src)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    if (key in out) continue; // already copied above
    const v = src[key];
    if (typeof v === 'string') {
      const r = isPlainString(v, MAX_GENERIC_STRING_LEN, key);
      if (r.isErr()) return err(r.error);
      out[key] = r.value;
      continue;
    }
    // Allow primitives + arrays of primitives through verbatim.
    if (typeof v === 'number' || typeof v === 'boolean' || v === null) {
      out[key] = v;
      continue;
    }
    if (Array.isArray(v) && v.every((e) => typeof e === 'string' || typeof e === 'number' || typeof e === 'boolean')) {
      out[key] = v;
      continue;
    }
    // Objects (nested structures) are stripped — safest default until a
    // specific adapter field needs them.
  }

  return ok(out as GraphNode);
};

/**
 * Batch validate — drops nodes that fail individually, returns the
 * survivors plus the failure log for audit. Callers that need "all or
 * nothing" should call `validateRemoteNode` directly in a loop.
 */
export const validateRemoteNodes = (
  raws: readonly unknown[],
): {
  readonly accepted: readonly GraphNode[];
  readonly rejected: ReadonlyArray<{ readonly index: number; readonly failure: ValidationFailure }>;
} => {
  const accepted: GraphNode[] = [];
  const rejected: Array<{ index: number; failure: ValidationFailure }> = [];
  raws.forEach((raw, index) => {
    const r = validateRemoteNode(raw);
    if (r.isOk()) accepted.push(r.value);
    else rejected.push({ index, failure: r.error });
  });
  return { accepted, rejected };
};
