/**
 * tree-sitter-parser.ts — infrastructure adapter wrapping tree-sitter
 * for Phase 19 structured code indexing.
 *
 * CRITICAL: tree-sitter and its grammar packages are CommonJS. wellinformed
 * is an ESM module ("type": "module" in package.json). We use createRequire
 * to load them — a TypeScript `import TreeSitter from 'tree-sitter'` works
 * at build time but blows up at runtime on ESM/CJS interop. See 19-RESEARCH.md
 * pitfall 1 + tree-sitter GitHub issues for the canonical workaround.
 *
 * Parser instances are reused per language — creating a new TreeSitter.Parser
 * costs ~50ms; parsing a 200-line TypeScript file costs ~1-5ms. For a 1000-file
 * monorepo, reusing the parser saves ~50s of startup overhead (pitfall 1 in
 * 19-RESEARCH.md).
 *
 * This file is a pure transform over (file path, source bytes) → CodeNode[].
 * Call graph resolution is NOT performed here — it's a two-pass indexer
 * concern handled in src/application/codebase-indexer.ts (pitfall 4).
 */

import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { extname, relative } from 'node:path';
import { Result, ok, err } from 'neverthrow';
import { CodebaseError } from '../domain/errors.js';
import {
  type CodebaseId,
  type CodeEdge,
  type CodeEdgeKind,
  type CodeNode,
  type CodeNodeKind,
  type SupportedLanguage,
  computeEdgeId,
  computeNodeId,
} from '../domain/codebase.js';

// tree-sitter is CommonJS — can't import directly from an ESM module.
const requireCJS = createRequire(import.meta.url);

// Opaque native type — tree-sitter ships without TS types in 0.21.x, so we treat
// Parser + Language + SyntaxNode as loosely-typed interop boundaries.
type TsParser = {
  setLanguage(lang: unknown): void;
  parse(source: string): { rootNode: TsSyntaxNode };
};

type TsSyntaxNode = {
  type: string;
  text: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  childForFieldName(name: string): TsSyntaxNode | null;
  children: TsSyntaxNode[];
  namedChildren: TsSyntaxNode[];
};

// ─────────────────────── grammar loader ───────────────────

/** Lazily load and cache one TsParser per supported language. */
export interface ParserRegistry {
  /** Return a Parser configured for this language; creates on first call, reuses afterwards. */
  getParser(lang: SupportedLanguage): Result<TsParser, CodebaseError>;
}

export const makeParserRegistry = (): ParserRegistry => {
  const cache = new Map<SupportedLanguage, TsParser>();

  const load = (lang: SupportedLanguage): Result<TsParser, CodebaseError> => {
    const existing = cache.get(lang);
    if (existing) return ok(existing);

    try {
      // tree-sitter-typescript exports TWO grammars — typescript + tsx.
      // We use `.typescript` for both .ts and .js (TS grammar is a superset of JS).
      // tree-sitter-python exports the grammar as the default module.
      const TreeSitterCtor = requireCJS('tree-sitter') as new () => TsParser;
      let grammar: unknown;
      if (lang === 'typescript' || lang === 'javascript') {
        const mod = requireCJS('tree-sitter-typescript') as { typescript: unknown; tsx: unknown };
        grammar = mod.typescript;
      } else if (lang === 'python') {
        grammar = requireCJS('tree-sitter-python');
      } else {
        return err(
          CodebaseError.grammarMissingError(lang, `no grammar registered for language '${lang}'`),
        );
      }
      const parser = new TreeSitterCtor();
      parser.setLanguage(grammar);
      cache.set(lang, parser);
      return ok(parser);
    } catch (e) {
      return err(
        CodebaseError.grammarMissingError(lang, (e as Error).message),
      );
    }
  };

  return { getParser: load };
};

// ─────────────────────── language detection ──────────────

/** Map a file extension to a SupportedLanguage, or null if unsupported. */
export const detectLanguage = (filePath: string): SupportedLanguage | null => {
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case '.ts':
    case '.tsx':
    case '.mts':
    case '.cts':
      return 'typescript';
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs':
      return 'javascript';
    case '.py':
      return 'python';
    default:
      return null;
  }
};

// ─────────────────────── AST kind maps ───────────────────

/**
 * Map tree-sitter node types to CodeNodeKind. Keys are the `node.type`
 * string from the grammar's node-types.json. Verified against the
 * tree-sitter-typescript grammar (19-RESEARCH.md lines 503-511).
 */
const TS_KIND_MAP: Readonly<Record<string, CodeNodeKind>> = {
  function_declaration:       'function',
  arrow_function:             'function',  // lambdas treated as functions
  function_expression:        'function',
  method_definition:          'method',
  class_declaration:          'class',
  abstract_class_declaration: 'class',
  interface_declaration:      'interface',
  type_alias_declaration:     'type_alias',
  import_statement:           'import',
  export_statement:           'export',
};

const PY_KIND_MAP: Readonly<Record<string, CodeNodeKind>> = {
  function_definition:   'function',
  class_definition:      'class',
  import_statement:      'import',
  import_from_statement: 'import',
};

/** Select the correct KIND_MAP for a language. */
const kindMapFor = (lang: SupportedLanguage): Readonly<Record<string, CodeNodeKind>> =>
  lang === 'python' ? PY_KIND_MAP : TS_KIND_MAP;

// ─────────────────────── design pattern heuristic ────────

/** Phase 19 zero-dep heuristic — ~30% coverage. Full detection deferred to Phase 20. */
const PATTERN_NAME_REGEX = /(Factory|Singleton|Observer|Subject|Builder|Adapter)$/;

const detectPatternByName = (name: string): string | null => {
  const m = name.match(PATTERN_NAME_REGEX);
  if (!m) return null;
  if (m[1] === 'Subject') return 'Observer';
  return m[1];
};

/** Additional Singleton heuristic: class contains a `getInstance` method. */
const detectSingletonByGetInstance = (classNode: TsSyntaxNode): boolean => {
  for (const child of classNode.namedChildren ?? []) {
    if (child.type !== 'class_body') continue;
    for (const member of child.namedChildren ?? []) {
      if (member.type !== 'method_definition') continue;
      const nameNode = member.childForFieldName('name');
      if (nameNode?.text === 'getInstance') return true;
    }
  }
  return false;
};

// ─────────────────────── pending call record ────────────

/**
 * A call site captured during parse pass 1. Indexer's pass 2 resolves
 * callee_name against the name→nodeId map to produce a `calls` CodeEdge
 * with confidence. See 19-CONTEXT.md call graph confidence levels.
 */
export interface PendingCall {
  readonly codebase_id: CodebaseId;
  readonly source_id: string;      // caller node id (resolved in pass 1)
  readonly callee_name: string;    // syntactic callee identifier
  readonly file_path: string;      // for same-file resolution priority
}

// ─────────────────────── parse output ────────────────────

export interface ParseOutput {
  readonly nodes: readonly CodeNode[];
  /** Non-call edges (contains/imports/extends/implements) are resolved in pass 1. */
  readonly edges: readonly CodeEdge[];
  /** Call edges deferred to pass 2 (see PendingCall). */
  readonly callsPending: readonly PendingCall[];
}

// ─────────────────────── parseFile ───────────────────────

/**
 * Parse one file into CodeNode[], structural CodeEdge[], and PendingCall[].
 * Pure-ish: no I/O beyond tree-sitter, no DB writes, no throws.
 */
export const parseFile = (
  registry: ParserRegistry,
  absFilePath: string,
  rootPath: string,
  codebaseId: CodebaseId,
  contentBytes: Buffer,
): Result<ParseOutput, CodebaseError> => {
  const lang = detectLanguage(absFilePath);
  if (lang === null) {
    return ok({ nodes: [], edges: [], callsPending: [] });
  }

  const parserResult = registry.getParser(lang);
  if (parserResult.isErr()) return err(parserResult.error);
  const parser = parserResult.value;

  // Content hash computed ONCE per file and stamped on every node from this file.
  // sha256(fileBytes) is the dirty-check key — mtime is unreliable across git ops.
  const contentHash = createHash('sha256').update(contentBytes).digest('hex');
  const relPath = relative(rootPath, absFilePath);
  const source = contentBytes.toString('utf8');

  let tree: { rootNode: TsSyntaxNode };
  try {
    tree = parser.parse(source);
  } catch (e) {
    return err(CodebaseError.parseError(relPath, (e as Error).message));
  }

  const nodes: CodeNode[] = [];
  const edges: CodeEdge[] = [];
  const callsPending: PendingCall[] = [];

  // 1) Emit the file node itself
  const fileNodeId = computeNodeId(codebaseId, relPath, 'file', relPath, 1);
  nodes.push({
    id: fileNodeId,
    codebase_id: codebaseId,
    kind: 'file',
    name: relPath,
    file_path: relPath,
    start_line: 1,
    start_col: 0,
    end_line: tree.rootNode.endPosition.row + 1,
    end_col: tree.rootNode.endPosition.column,
    language: lang,
    content_hash: contentHash,
  });

  const kindMap = kindMapFor(lang);

  // 2) Walk the AST
  // parentSyntaxNode is tracked so arrow_function nodes can look up their
  // enclosing variable_declarator name (`const foo = () => {}` should emit
  // a function named `foo`, not `<anonymous>`).
  const walk = (
    node: TsSyntaxNode,
    parentId: string,
    parentSyntaxNode: TsSyntaxNode | null,
  ): void => {
    const mapped: CodeNodeKind | undefined = kindMap[node.type];

    // Capture call sites regardless of whether the surrounding node was mapped.
    // call_expression (TS/JS) or call (Python) — callee is first-named child
    // or named `function` field.
    if (node.type === 'call_expression' || node.type === 'call') {
      const functionField = node.childForFieldName('function');
      const calleeNode = functionField ?? node.namedChildren[0] ?? null;
      if (calleeNode) {
        // For simple identifier calls (foo()) the text IS the name.
        // For member calls (obj.foo()) we still capture `foo` as a heuristic.
        const calleeText = calleeNode.text;
        const lastDot = calleeText.lastIndexOf('.');
        const calleeName = lastDot >= 0 ? calleeText.slice(lastDot + 1) : calleeText;
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(calleeName)) {
          callsPending.push({
            codebase_id: codebaseId,
            source_id: parentId,
            callee_name: calleeName,
            file_path: relPath,
          });
        }
      }
    }

    if (mapped) {
      let nameNode = node.childForFieldName('name');
      // Arrow functions carry no name field — look up the enclosing
      // variable_declarator ('const foo = () => {}') or pair (Python dict lambdas).
      // Without this, all arrow functions become `<anonymous>` which breaks
      // `codebase search createNode` on files that export arrow functions.
      if (!nameNode && node.type === 'arrow_function' && parentSyntaxNode?.type === 'variable_declarator') {
        nameNode = parentSyntaxNode.childForFieldName('name') ?? null;
      }
      const name = nameNode?.text ?? '<anonymous>';
      const lineNum = node.startPosition.row + 1;
      const nodeId = computeNodeId(codebaseId, relPath, mapped, name, lineNum);

      // Signature JSON for function/method — params + return type
      let signatureJson: string | undefined;
      if (mapped === 'function' || mapped === 'method') {
        const paramsField = node.childForFieldName('parameters');
        const returnField = node.childForFieldName('return_type');
        const params = paramsField?.namedChildren ?? [];
        signatureJson = JSON.stringify({
          params: params.map((p) => ({ name: p.text })),
          returns: returnField?.text,
        });
      }

      // Pattern detection for class nodes (trivial naming heuristic, Phase 19 scope)
      let extraJson: string | undefined;
      if (mapped === 'class') {
        const byName = detectPatternByName(name);
        const isSingleton = detectSingletonByGetInstance(node);
        // Singleton heuristic (getInstance) takes precedence over name-based detection
        const pattern = isSingleton ? 'Singleton' : byName;
        if (pattern) extraJson = JSON.stringify({ pattern });
      }

      nodes.push({
        id: nodeId,
        codebase_id: codebaseId,
        kind: mapped,
        name,
        file_path: relPath,
        start_line: lineNum,
        start_col: node.startPosition.column,
        end_line: node.endPosition.row + 1,
        end_col: node.endPosition.column,
        parent_id: parentId,
        language: lang,
        content_hash: contentHash,
        signature_json: signatureJson,
        extra_json: extraJson,
      });

      // Structural 'contains' edge: parent → this node
      edges.push({
        id: computeEdgeId(codebaseId, parentId, nodeId, 'contains'),
        codebase_id: codebaseId,
        source_id: parentId,
        target_id: nodeId,
        kind: 'contains',
      });

      // extends / implements for class_declaration nodes (TypeScript)
      if (mapped === 'class') {
        const heritage = node.namedChildren?.find((c) => c.type === 'class_heritage');
        if (heritage) {
          for (const clause of heritage.namedChildren) {
            const clauseKind: CodeEdgeKind | null =
              clause.type === 'extends_clause' ? 'extends' :
              clause.type === 'implements_clause' ? 'implements' : null;
            if (!clauseKind) continue;
            for (const ref of clause.namedChildren) {
              const targetName = ref.text;
              // target id synthesized from the supertype name — resolved lazily
              // by treating it as an external reference. The indexer's pass 2
              // may re-link these to local class nodes when names match.
              const synthesizedTargetId = computeNodeId(codebaseId, relPath, 'class', targetName, 0);
              edges.push({
                id: computeEdgeId(codebaseId, nodeId, synthesizedTargetId, clauseKind),
                codebase_id: codebaseId,
                source_id: nodeId,
                target_id: synthesizedTargetId,
                kind: clauseKind,
                confidence: 'heuristic',
              });
            }
          }
        }
      }

      // Recurse into the body of class/function nodes so methods + nested calls
      // know their parent
      for (const child of node.children) walk(child, nodeId, node);
      return;
    }

    // Unmapped node — recurse with same parentId
    for (const child of node.children) walk(child, parentId, node);
  };

  walk(tree.rootNode, fileNodeId, null);

  return ok({ nodes, edges, callsPending });
};
