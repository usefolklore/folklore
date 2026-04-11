/**
 * pdf_text source adapter.
 *
 * Extracts text from PDF files. Primary strategy: spawn `pdftotext`
 * from poppler-utils (widely installed on Linux/macOS via homebrew).
 * Fallback: read raw bytes and extract ASCII text between PDF stream
 * markers — crude but functional for simple text-based PDFs.
 *
 * Config:
 *   {
 *     path: string            // path to a single PDF file or directory
 *     max_pages?: number      // limit pages via pdftotext -l flag (default: all)
 *   }
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, extname, basename } from 'node:path';
import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import type { AppError } from '../../domain/errors.js';
import type { ContentItem } from '../../domain/content.js';
import type { Source, SourceDescriptor } from '../../domain/sources.js';

// ─────────────────────── config ──────────────────────────

interface PdfTextConfig {
  readonly path: string;
  readonly max_pages?: number;
}

const parseConfig = (raw: Readonly<Record<string, unknown>>): PdfTextConfig | null => {
  const p = raw.path;
  if (typeof p !== 'string' || p.length === 0) return null;
  return {
    path: p,
    max_pages: typeof raw.max_pages === 'number' && raw.max_pages > 0 ? raw.max_pages : undefined,
  };
};

// ─────────────────────── file discovery ──────────────────

const collectPdfs = (target: string): readonly string[] => {
  if (!existsSync(target)) return [];

  const stat = statSync(target);
  if (stat.isFile()) {
    return extname(target).toLowerCase() === '.pdf' ? [target] : [];
  }

  if (!stat.isDirectory()) return [];

  const files: string[] = [];
  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name.startsWith('.')) continue;
      const full = join(dir, name);
      let s;
      try {
        s = statSync(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) {
        walk(full);
      } else if (extname(name).toLowerCase() === '.pdf') {
        files.push(full);
      }
    }
  };
  walk(target);
  return files;
};

// ─────────────────────── pdftotext probe ─────────────────

const isPdftotextAvailable = (): boolean => {
  const result = spawnSync('which', ['pdftotext'], { encoding: 'utf8' });
  return result.status === 0 && result.stdout.trim().length > 0;
};

// ─────────────────────── extraction strategies ───────────

/**
 * Primary: use `pdftotext` from poppler-utils.
 * `pdftotext <file> -` writes to stdout.
 */
const extractViaPdftotext = (filePath: string, maxPages?: number): string => {
  const args: string[] = [];
  if (maxPages !== undefined) {
    args.push('-l', String(maxPages));
  }
  args.push(filePath, '-');

  const result = spawnSync('pdftotext', args, {
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (result.status !== 0) {
    return `[pdftotext failed: ${(result.stderr ?? '').trim().slice(0, 200)}]`;
  }
  return (result.stdout ?? '').trim();
};

/**
 * Fallback: read raw PDF bytes and extract printable ASCII between
 * `stream` and `endstream` markers. This is intentionally crude —
 * it works for simple text-only PDFs and gives *something* for others.
 */
const extractViaRawBytes = (filePath: string): string => {
  let buf: Buffer;
  try {
    buf = readFileSync(filePath);
  } catch {
    return '[Unable to read PDF file]';
  }

  const content = buf.toString('latin1');
  const chunks: string[] = [];

  // Strategy 1: extract text between BT (begin text) and ET (end text) operators
  const btEtRegex = /BT\s([\s\S]*?)ET/g;
  let match: RegExpExecArray | null;
  while ((match = btEtRegex.exec(content)) !== null) {
    const block = match[1];
    // Extract text from Tj and TJ operators
    const tjRegex = /\(([^)]*)\)\s*Tj/g;
    let tjMatch: RegExpExecArray | null;
    while ((tjMatch = tjRegex.exec(block)) !== null) {
      const decoded = tjMatch[1].replace(/\\([nrt\\()])/g, (_m, c: string) => {
        const escapes: Record<string, string> = { n: '\n', r: '\r', t: '\t', '\\': '\\', '(': '(', ')': ')' };
        return escapes[c] ?? c;
      });
      if (decoded.trim().length > 0) chunks.push(decoded.trim());
    }
    // TJ array: [(text) kerning (text) ...]
    const tjArrayRegex = /\[([^\]]+)\]\s*TJ/g;
    let tjArrMatch: RegExpExecArray | null;
    while ((tjArrMatch = tjArrayRegex.exec(block)) !== null) {
      const inner = tjArrMatch[1];
      const parts: string[] = [];
      const partRegex = /\(([^)]*)\)/g;
      let partMatch: RegExpExecArray | null;
      while ((partMatch = partRegex.exec(inner)) !== null) {
        parts.push(partMatch[1]);
      }
      const joined = parts.join('').trim();
      if (joined.length > 0) chunks.push(joined);
    }
  }

  // Strategy 2: if BT/ET gave nothing, try stream/endstream
  if (chunks.length === 0) {
    const streamRegex = /stream\r?\n([\s\S]*?)endstream/g;
    let streamMatch: RegExpExecArray | null;
    while ((streamMatch = streamRegex.exec(content)) !== null) {
      // Filter to printable ASCII runs of reasonable length
      const printable = streamMatch[1].replace(/[^\x20-\x7E\n\r\t]/g, ' ');
      const cleaned = printable.replace(/\s{3,}/g, ' ').trim();
      if (cleaned.length > 20) chunks.push(cleaned);
    }
  }

  if (chunks.length === 0) {
    return '[No extractable text found in PDF]';
  }

  return chunks.join('\n');
};

// ─────────────────────── content builder ─────────────────

const extractPdfText = (filePath: string, usePdftotext: boolean, maxPages?: number): ContentItem => {
  const filename = basename(filePath);
  const text = usePdftotext
    ? extractViaPdftotext(filePath, maxPages)
    : extractViaRawBytes(filePath);

  return {
    source_uri: `pdf://${filePath}`,
    title: `PDF: ${filename}`,
    text,
    metadata: {
      kind: 'pdf_text',
      file_path: filePath,
      extraction_method: usePdftotext ? 'pdftotext' : 'raw_bytes',
      char_count: text.length,
      ...(maxPages !== undefined ? { max_pages: maxPages } : {}),
    },
  };
};

// ─────────────────────── source factory ──────────────────

export const pdfTextSource = () =>
  (descriptor: SourceDescriptor): Source => {
    const cfg = parseConfig(descriptor.config);

    const fetchItems = (): ResultAsync<readonly ContentItem[], AppError> => {
      if (!cfg) {
        return errAsync<readonly ContentItem[], AppError>({
          type: 'InvalidNode',
          field: 'config.path',
          node_id: descriptor.id,
        });
      }

      try {
        const files = collectPdfs(cfg.path);
        if (files.length === 0) {
          return okAsync<readonly ContentItem[], AppError>([{
            source_uri: `pdf://${cfg.path}`,
            title: `PDF: ${basename(cfg.path)}`,
            text: `No PDF files found at path: ${cfg.path}`,
            metadata: { kind: 'pdf_text', file_path: cfg.path },
          }]);
        }

        const usePdftotext = isPdftotextAvailable();
        const items = files.map((filePath) => extractPdfText(filePath, usePdftotext, cfg.max_pages));
        return okAsync(items);
      } catch (e) {
        return errAsync<readonly ContentItem[], AppError>({
          type: 'GraphReadError',
          path: cfg.path,
          message: (e as Error).message,
        });
      }
    };

    return { descriptor, fetch: fetchItems };
  };
