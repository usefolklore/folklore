/**
 * codebase-indexer.ts — application use case for Phase 19 code graph indexing.
 *
 * Walks a project directory, parses supported files via tree-sitter-parser,
 * resolves the call graph in a second pass, and writes everything to
 * code-graph.db via CodeGraphRepository.
 *
 * Two-pass call graph resolution is explicit per 19-RESEARCH.md pitfall 4 —
 * single-pass resolution produces false edges because callees may be declared
 * after callers in the same scan.
 *
 * Content hash is the dirty-check key. mtime is unreliable across git ops
 * (see 19-RESEARCH.md anti-patterns). sha256(fileBytes) is stored per node;
 * reindex compares against the current bytes.
 */

import { readFile, stat } from 'node:fs/promises';
import { readdirSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { CodebaseError } from '../domain/errors.js';
import {
  type CallConfidence,
  type Codebase,
  type CodeEdge,
  type CodeNode,
  type CodebaseId,
  type SupportedLanguage,
  computeCodebaseId,
  computeEdgeId,
  computeNodeId,
} from '../domain/codebase.js';
import type { CodeGraphRepository } from '../infrastructure/code-graph.js';
import {
  type PendingCall,
  type ParserRegistry,
  detectLanguage,
  parseFile,
} from '../infrastructure/tree-sitter-parser.js';

// ─────────────────────── deps ────────────────────────────

export interface IndexerDeps {
  readonly repo: CodeGraphRepository;
  readonly registry: ParserRegistry;
}

// ─────────────────────── report ──────────────────────────

export interface IndexReport {
  readonly codebase_id: CodebaseId;
  readonly name: string;
  readonly root_path: string;
  readonly indexed_files: number;
  readonly skipped_files: number;      // unsupported extensions
  readonly unchanged_files: number;    // incremental reindex only — hash matched
  readonly parse_errors: number;       // files that failed to parse — logged, not thrown
  readonly node_count: number;
  readonly edge_count: number;
  readonly by_kind: Readonly<Record<string, number>>;
  readonly by_language: Readonly<Record<string, number>>;
  readonly call_confidence: Readonly<Record<CallConfidence, number>>;
}

// ─────────────────────── exclude list ────────────────────

/**
 * Directory names excluded from file walk. Mirrors the shallow indexer's
 * DEFAULT_EXCLUDE in src/infrastructure/sources/codebase.ts plus extras
 * that are noise for structured code analysis.
 */
const DEFAULT_EXCLUDE = new Set<string>([
  // JS/TS
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  // Python
  '.venv',
  'venv',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  'site-packages',
  // Rust
  'target',
  // Go
  'bin',
  'pkg',
  // tooling + vcs
  'vendor',
  '.git',
  '.svn',
  '.hg',
  '.claude',
  '.claude-flow',
  '.planning',
  '.idea',
  '.vscode',
  '.cache',
  '.turbo',
  '.parcel-cache',
  '.yarn',
  '.pnpm-store',
]);

// ─────────────────────── file walk ───────────────────────

/** Recursively collect all files under `root`, respecting the exclude list. */
const walkFiles = (root: string): string[] => {
  const out: string[] = [];
  const recurse = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (DEFAULT_EXCLUDE.has(name)) continue;
      const full = join(dir, name);
      let s;
      try {
        s = statSync(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) recurse(full);
      else if (s.isFile()) out.push(full);
    }
  };
  recurse(root);
  return out;
};

// ─────────────────────── index (full) ────────────────────

export interface IndexCodebaseOpts {
  readonly absPath: string;
  readonly name?: string;
}

/**
 * Full index: parse every supported file in the directory tree and write
 * all nodes + edges to code-graph.db. Returns an IndexReport with counts.
 *
 * Validates that absPath exists and is a directory before walking.
 * Unsupported file extensions are silently counted as skipped_files.
 */
export const indexCodebase =
  (deps: IndexerDeps) =>
  (opts: IndexCodebaseOpts): ResultAsync<IndexReport, CodebaseError> => {
    const { absPath } = opts;
    const name = opts.name ?? basename(absPath);
    const codebaseId = computeCodebaseId(absPath);

    return ResultAsync.fromPromise(
      stat(absPath),
      (e) => CodebaseError.invalidPath(absPath, (e as Error).message),
    )
      .andThen((s) => {
        if (!s.isDirectory()) {
          return errAsync<readonly string[], CodebaseError>(
            CodebaseError.invalidPath(absPath, 'not a directory'),
          );
        }
        return okAsync<readonly string[], CodebaseError>(walkFiles(absPath));
      })
      .andThen((files) =>
        runIndex(deps, { codebaseId, name, rootPath: absPath, files, reindexMode: false }),
      );
  };

// ─────────────────────── reindex (incremental) ──────────

/**
 * Incremental reindex: look up the Codebase record, walk the file tree,
 * skip files where sha256(currentBytes) === stored content_hash, and
 * re-parse + upsert only changed files.
 *
 * Unchanged files produce zero new nodes — their hashes already in code_nodes
 * are not touched. Deleted files are not removed (a future `codebase prune`
 * command handles that).
 */
export const reindexCodebase =
  (deps: IndexerDeps) =>
  (codebaseId: CodebaseId): ResultAsync<IndexReport, CodebaseError> =>
    deps.repo.getCodebase(codebaseId).andThen((cb) => {
      if (cb === null) return errAsync(CodebaseError.notFound(codebaseId));
      const files = walkFiles(cb.root_path);
      return runIndex(deps, {
        codebaseId,
        name: cb.name,
        rootPath: cb.root_path,
        files,
        reindexMode: true,
      });
    });

// ─────────────────────── core runner ─────────────────────

interface RunIndexOpts {
  readonly codebaseId: CodebaseId;
  readonly name: string;
  readonly rootPath: string;
  readonly files: readonly string[];
  readonly reindexMode: boolean;
}

/**
 * Core indexing runner shared by both indexCodebase and reindexCodebase.
 *
 * PASS 1: for each file — check hash (reindex mode), parse via tree-sitter,
 *   accumulate nodes + structural edges + pending call sites.
 *
 * PASS 2: build nameToNodes map (function/method name → CodeNode[]) across
 *   ALL parsed nodes, then resolve each PendingCall with confidence:
 *     0 candidates  → 'unresolved' (synthetic external target)
 *     1 candidate   → 'exact'
 *     N candidates  → 'heuristic' (prefer same-file candidate)
 *
 * Two-pass approach is mandatory per 19-RESEARCH.md pitfall 4 — callees
 * may be declared later in the same scan than their callers.
 */
const runIndex = (
  deps: IndexerDeps,
  opts: RunIndexOpts,
): ResultAsync<IndexReport, CodebaseError> =>
  ResultAsync.fromPromise(
    (async (): Promise<IndexReport> => {
      const allNodes: CodeNode[] = [];
      const allEdges: CodeEdge[] = [];
      const allCalls: PendingCall[] = [];
      const byKind: Record<string, number> = {};
      const byLanguage: Record<string, number> = {};
      const callConfidence: Record<CallConfidence, number> = {
        exact: 0,
        heuristic: 0,
        unresolved: 0,
      };
      let indexedFiles = 0;
      let skippedFiles = 0;
      let unchangedFiles = 0;
      let parseErrors = 0;
      const parseErrorSamples: string[] = [];
      const fileHashes: string[] = [];

      // ── PASS 1: parse every changed file ──────────────────────────────────
      for (const abs of opts.files) {
        const lang = detectLanguage(abs);
        if (lang === null) {
          skippedFiles++;
          continue;
        }

        const buf = await readFile(abs);
        const curHash = createHash('sha256').update(buf).digest('hex');
        fileHashes.push(curHash);
        const relPath = relative(opts.rootPath, abs);

        if (opts.reindexMode) {
          // Skip unchanged files — compare current hash against the stored hash
          // in code_nodes for this file. getFileHash returns the content_hash
          // from the first node of this file (all nodes share the same file hash).
          const priorRes = await deps.repo.getFileHash(opts.codebaseId, relPath);
          if (priorRes.isErr()) throw new Error(`dbReadError: ${priorRes.error.type}`);
          if (priorRes.value === curHash) {
            unchangedFiles++;
            continue;
          }
        }

        const parseRes = parseFile(deps.registry, abs, opts.rootPath, opts.codebaseId, buf);
        if (parseRes.isErr()) {
          // Parse errors are NON-FATAL — tree-sitter grammars don't cover every
          // language feature in every version (e.g. bleeding-edge TS syntax).
          // Log + skip + continue so a single unparseable file doesn't abort
          // an otherwise valid index pass.
          parseErrors++;
          if (parseErrorSamples.length < 5) {
            parseErrorSamples.push(`${relPath} (${parseRes.error.type})`);
          }
          continue;
        }
        const { nodes, edges, callsPending } = parseRes.value;
        allNodes.push(...nodes);
        allEdges.push(...edges);
        allCalls.push(...callsPending);
        indexedFiles++;

        for (const n of nodes) {
          byKind[n.kind] = (byKind[n.kind] ?? 0) + 1;
          // File node has the same language as the source; others do too.
          const langKey = n.language as SupportedLanguage;
          byLanguage[langKey] = (byLanguage[langKey] ?? 0) + 1;
        }
      }

      // ── PASS 2: resolve call graph ─────────────────────────────────────────
      // Build a name → CodeNode[] map from all FUNCTION + METHOD nodes parsed.
      // This must happen AFTER all files are scanned (cross-file callees).
      const nameToNodes = new Map<string, CodeNode[]>();
      for (const n of allNodes) {
        if (n.kind !== 'function' && n.kind !== 'method') continue;
        const arr = nameToNodes.get(n.name) ?? [];
        arr.push(n);
        nameToNodes.set(n.name, arr);
      }

      for (const call of allCalls) {
        const candidates = nameToNodes.get(call.callee_name) ?? [];
        let targetId: string;
        let confidence: CallConfidence;

        if (candidates.length === 0) {
          // No matching declaration found anywhere — still emit so the edge
          // row exists and can be queried / visualised.
          confidence = 'unresolved';
          targetId = computeNodeId(call.codebase_id, '<external>', 'function', call.callee_name, 0);
        } else if (candidates.length === 1) {
          // Unique match: exact regardless of which file it lives in.
          confidence = 'exact';
          targetId = candidates[0].id;
        } else {
          // Multiple candidates: prefer same-file match, fall back to first.
          confidence = 'heuristic';
          const sameFile = candidates.find((c) => c.file_path === call.file_path);
          targetId = (sameFile ?? candidates[0]).id;
        }

        callConfidence[confidence]++;
        allEdges.push({
          id: computeEdgeId(call.codebase_id, call.source_id, targetId, 'calls'),
          codebase_id: call.codebase_id,
          source_id: call.source_id,
          target_id: targetId,
          kind: 'calls',
          confidence,
        });
      }

      // ── Persist Codebase → nodes → edges ───────────────────────────────────
      // root_sha is a quick dirty-check across the whole codebase root.
      const rootSha = createHash('sha256').update(fileHashes.join('\n')).digest('hex');
      const codebase: Codebase = {
        id: opts.codebaseId,
        name: opts.name,
        root_path: opts.rootPath,
        language_summary: Object.entries(byLanguage)
          .map(([l, n]) => `${l}:${n}`)
          .join(', '),
        indexed_at: new Date().toISOString(),
        node_count: allNodes.length,
        root_sha: rootSha,
      };

      const cbRes = await deps.repo.upsertCodebase(codebase);
      if (cbRes.isErr()) throw new Error(`codebases upsert: ${cbRes.error.type}`);

      const nRes = await deps.repo.upsertNodes(allNodes);
      if (nRes.isErr()) throw new Error(`nodes upsert: ${nRes.error.type}`);

      const eRes = await deps.repo.upsertEdges(allEdges);
      if (eRes.isErr()) throw new Error(`edges upsert: ${eRes.error.type}`);

      if (parseErrors > 0) {
        // Surface a short sample to stderr — indexing continues, user gets the diagnostic
        process.stderr.write(
          `wellinformed codebase: ${parseErrors} file(s) skipped due to parse errors (e.g. ${parseErrorSamples.join(', ')})\n`,
        );
      }

      return {
        codebase_id: opts.codebaseId,
        name: opts.name,
        root_path: opts.rootPath,
        indexed_files: indexedFiles,
        skipped_files: skippedFiles,
        unchanged_files: unchangedFiles,
        parse_errors: parseErrors,
        node_count: allNodes.length,
        edge_count: allEdges.length,
        by_kind: byKind,
        by_language: byLanguage,
        call_confidence: callConfidence,
      };
    })(),
    (e) => CodebaseError.dbWriteError('codebase_index', (e as Error).message),
  );
