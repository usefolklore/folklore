/**
 * codebase — domain types for the structured code graph (Phase 19).
 *
 * Codebase is a first-class DDD aggregate root with its own CodebaseId,
 * separate from RoomId. Rooms attach to codebases via the codebase_rooms
 * join table (M:N) — see src/infrastructure/code-graph.ts for persistence.
 *
 * Phase 19 scope: TypeScript/JavaScript/Python parsing. Rust and Go land
 * in Phase 20 per 19-CONTEXT.md decisions.
 *
 * No classes, no I/O — pure types + pure id derivation helpers.
 */

import { createHash } from 'node:crypto';

// ─────────────────────── id types ─────────────────────────

/** Deterministic 16-char hex id derived from the absolute codebase path. */
export type CodebaseId = string & { readonly __brand: 'CodebaseId' };

/** Language tag — Phase 19 supports only these three. Rust/Go defer to Phase 20. */
export type SupportedLanguage = 'typescript' | 'javascript' | 'python';

// ─────────────────────── node/edge discriminants ──────────

/**
 * 9 node kinds the Phase 19 parser emits. Parameters live inside
 * CodeNode.signature_json, NOT as separate nodes — per 19-CONTEXT.md
 * "Parameters as JSON inside the node, not separate nodes".
 */
export type CodeNodeKind =
  | 'file'
  | 'module'
  | 'class'
  | 'interface'
  | 'function'
  | 'method'
  | 'import'
  | 'export'
  | 'type_alias';

/**
 * 5 edge kinds. `calls` edges carry a confidence level because call
 * graph resolution is best-effort per 19-RESEARCH.md pitfall 4.
 */
export type CodeEdgeKind =
  | 'contains'    // structural hierarchy: file→class, class→method
  | 'imports'     // file→file or file→module
  | 'extends'     // class→class (inheritance)
  | 'implements'  // class→interface (TypeScript implements)
  | 'calls';      // function→function, method→method (best-effort)

/**
 * Call graph confidence per 19-CONTEXT.md:
 *   exact      — resolved to a declared function in the same file or explicit import
 *   heuristic  — name match across files, unproven
 *   unresolved — callee captured but no matching declaration
 */
export type CallConfidence = 'exact' | 'heuristic' | 'unresolved';

// ─────────────────────── signature JSON shape ────────────

/** Structured parameter info stored inside CodeNode.signature_json. */
export interface CodeSignature {
  readonly params: ReadonlyArray<{
    readonly name: string;
    readonly type?: string;
    readonly default?: string;
  }>;
  readonly returns?: string;
}

// ─────────────────────── Codebase aggregate root ─────────

export interface Codebase {
  readonly id: CodebaseId;
  readonly name: string;               // defaults to basename(root_path)
  readonly root_path: string;          // absolute path
  readonly language_summary: string;   // "typescript: 340, python: 28" etc
  readonly indexed_at: string;         // ISO timestamp of last full index
  readonly node_count: number;
  readonly root_sha: string;           // sha256 of concatenated file hashes — quick dirty check
}

// ─────────────────────── CodeNode ─────────────────────────

export interface CodeNode {
  readonly id: string;                 // computeNodeId(...)
  readonly codebase_id: CodebaseId;
  readonly kind: CodeNodeKind;
  readonly name: string;
  readonly file_path: string;          // relative to codebase root
  readonly start_line: number;         // 1-indexed
  readonly start_col: number;          // 0-indexed
  readonly end_line: number;
  readonly end_col: number;
  readonly parent_id?: string;         // for methods inside classes
  readonly language: SupportedLanguage;
  readonly content_hash: string;       // sha256 of enclosing file content
  readonly signature_json?: string;    // JSON-serialized CodeSignature
  readonly extra_json?: string;        // kind-specific: { pattern?: 'Factory'|'Singleton'|... }
}

// ─────────────────────── CodeEdge ─────────────────────────

export interface CodeEdge {
  readonly id: string;                 // computeEdgeId(...)
  readonly codebase_id: CodebaseId;
  readonly source_id: string;
  readonly target_id: string;
  readonly kind: CodeEdgeKind;
  readonly confidence?: CallConfidence;  // required for 'calls' kind, undefined for others
  readonly extra_json?: string;
}

// ─────────────────────── CodebaseRoomLink ───────────────

export interface CodebaseRoomLink {
  readonly codebase_id: CodebaseId;
  readonly room_id: string;            // RoomId from domain/rooms.ts
  readonly attached_at: string;        // ISO timestamp
}

// ─────────────────────── id derivation (pure) ───────────

/**
 * Derive a stable 16-char codebase id from the absolute path.
 * Uses sha256(abs_path).slice(0,16) per 19-CONTEXT.md.
 */
export const computeCodebaseId = (absPath: string): CodebaseId =>
  createHash('sha256').update(absPath).digest('hex').slice(0, 16) as CodebaseId;

/**
 * Derive a stable node id from its position — sha256 of
 * (codebase_id|file_path|kind|name|start_line). Same position +
 * same name in same file = same id across re-indexes.
 */
export const computeNodeId = (
  codebase_id: CodebaseId,
  file_path: string,
  kind: CodeNodeKind,
  name: string,
  start_line: number,
): string =>
  createHash('sha256')
    .update(`${codebase_id}|${file_path}|${kind}|${name}|${start_line}`)
    .digest('hex')
    .slice(0, 32);

/**
 * Derive a stable edge id from (codebase_id, source, target, kind).
 * Same triple = same id, so re-indexing is idempotent.
 */
export const computeEdgeId = (
  codebase_id: CodebaseId,
  source_id: string,
  target_id: string,
  kind: CodeEdgeKind,
): string =>
  createHash('sha256')
    .update(`${codebase_id}|${source_id}|${target_id}|${kind}`)
    .digest('hex')
    .slice(0, 32);
