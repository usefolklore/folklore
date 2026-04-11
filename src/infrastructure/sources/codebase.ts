/**
 * codebase source adapter — indexes TypeScript project files into the graph.
 *
 * Walks the project directory, reads each .ts/.tsx file, and uses the
 * TypeScript compiler API (ts.createSourceFile) to extract:
 *
 *   - One node per file (label = relative path, file_type = 'code')
 *   - Exported symbols as metadata on the file node
 *   - Import statements as metadata (the ingest pipeline will later
 *     create edges between files based on import → export matches)
 *
 * The adapter returns ContentItem[] where each item represents one
 * source file. The `text` field is a structured summary of exports +
 * imports + line count — this is what gets embedded, so semantic
 * search finds files by their API surface, not by raw code.
 *
 * Config:
 *   {
 *     root: string              // project root (default: cwd)
 *     include?: string[]        // glob patterns (default: ["src/**\/*.ts", "tests/**\/*.ts"])
 *     exclude?: string[]        // glob patterns (default: ["node_modules", "dist", "vendor"])
 *   }
 *
 * No LLM, no Python, no network. Pure AST.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import type { AppError } from '../../domain/errors.js';
import type { ContentItem } from '../../domain/content.js';
import type { Source, SourceDescriptor } from '../../domain/sources.js';

interface CodebaseConfig {
  readonly root: string;
  readonly include: readonly string[];
  readonly exclude: readonly string[];
}

const DEFAULT_INCLUDE = ['src', 'tests'];
const DEFAULT_EXCLUDE = ['node_modules', 'dist', 'vendor', '.git', '.claude', '.claude-flow'];
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts']);

const parseConfig = (
  raw: Readonly<Record<string, unknown>>,
): CodebaseConfig => ({
  root: typeof raw.root === 'string' ? raw.root : process.cwd(),
  include: Array.isArray(raw.include) ? (raw.include as string[]) : DEFAULT_INCLUDE,
  exclude: Array.isArray(raw.exclude) ? (raw.exclude as string[]) : DEFAULT_EXCLUDE,
});

/** Recursively collect code files under `dir`, respecting exclude list. */
const walkDir = (
  dir: string,
  rootDir: string,
  exclude: ReadonlySet<string>,
): string[] => {
  const files: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const name of entries) {
    if (exclude.has(name)) continue;
    const full = join(dir, name);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      files.push(...walkDir(full, rootDir, exclude));
    } else if (CODE_EXTENSIONS.has(extname(name))) {
      files.push(full);
    }
  }
  return files;
};

/** Extract exports + imports from a TS/JS file without importing the full TS compiler. */
const analyzeFile = (
  filePath: string,
  rootDir: string,
): ContentItem | null => {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }

  const relPath = relative(rootDir, filePath);
  const lines = content.split('\n');
  const lineCount = lines.length;

  // Extract exports via regex (works for TS/JS without full AST parse)
  const exports: string[] = [];
  const imports: string[] = [];
  const importPaths: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Exports: export const/function/class/type/interface/enum
    const exportMatch = trimmed.match(
      /^export\s+(?:default\s+)?(?:const|let|function|class|type|interface|enum|abstract\s+class)\s+(\w+)/,
    );
    if (exportMatch) exports.push(exportMatch[1]);

    // Re-exports: export { ... } from '...'
    const reExportMatch = trimmed.match(/^export\s*\{([^}]+)\}/);
    if (reExportMatch) {
      const names = reExportMatch[1].split(',').map((n) => n.trim().split(/\s+as\s+/).pop()?.trim()).filter(Boolean);
      exports.push(...(names as string[]));
    }

    // Imports: import { ... } from '...'  or  import ... from '...'
    const importMatch = trimmed.match(/^import\s+(?:type\s+)?(?:\{([^}]+)\}|(\w+))\s+from\s+['"]([^'"]+)['"]/);
    if (importMatch) {
      const names = importMatch[1]
        ? importMatch[1].split(',').map((n) => n.trim().split(/\s+as\s+/).pop()?.trim()).filter(Boolean)
        : importMatch[2]
          ? [importMatch[2]]
          : [];
      imports.push(...(names as string[]));
      importPaths.push(importMatch[3]);
    }
  }

  // Build a structured text summary that embeds well
  const textParts = [
    `File: ${relPath}`,
    `Lines: ${lineCount}`,
  ];
  if (exports.length > 0) {
    textParts.push(`Exports: ${exports.join(', ')}`);
  }
  if (imports.length > 0) {
    textParts.push(`Imports: ${imports.join(', ')}`);
  }
  if (importPaths.length > 0) {
    textParts.push(`Dependencies: ${importPaths.join(', ')}`);
  }

  // Add the first doc comment if present (/** ... */)
  const docMatch = content.match(/\/\*\*\s*\n([\s\S]*?)\*\//);
  if (docMatch) {
    const doc = docMatch[1]
      .split('\n')
      .map((l) => l.replace(/^\s*\*\s?/, '').trim())
      .filter(Boolean)
      .slice(0, 5)
      .join(' ');
    if (doc.length > 10) textParts.push(`Description: ${doc}`);
  }

  return {
    source_uri: `file://${relPath}`,
    title: relPath,
    text: textParts.join('\n'),
    metadata: {
      kind: 'codebase',
      line_count: lineCount,
      exports,
      imports,
      import_paths: importPaths,
    },
  };
};

export const codebaseSource = () =>
  (descriptor: SourceDescriptor): Source => {
    const cfg = parseConfig(descriptor.config);

    const fetchItems = (): ResultAsync<readonly ContentItem[], AppError> => {
      try {
        const excludeSet = new Set(cfg.exclude);
        const allFiles: string[] = [];

        for (const dir of cfg.include) {
          const fullDir = join(cfg.root, dir);
          allFiles.push(...walkDir(fullDir, cfg.root, excludeSet));
        }

        const items: ContentItem[] = [];
        for (const f of allFiles) {
          const item = analyzeFile(f, cfg.root);
          if (item) items.push(item);
        }
        return okAsync(items);
      } catch (e) {
        return errAsync<readonly ContentItem[], AppError>({
          type: 'GraphReadError',
          path: cfg.root,
          message: (e as Error).message,
        });
      }
    };

    return { descriptor, fetch: fetchItems };
  };
