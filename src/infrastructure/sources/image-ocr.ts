/**
 * image_ocr source adapter.
 *
 * Extracts text from images via the Tesseract OCR CLI. If the
 * `tesseract` binary is not installed the adapter returns a single
 * ContentItem noting the missing dependency instead of failing hard,
 * so the ingest pipeline keeps running.
 *
 * Config:
 *   {
 *     path: string           // path to a single image or directory
 *     language?: string      // Tesseract language code (default "eng")
 *   }
 *
 * Supported extensions: .jpg, .jpeg, .png, .webp, .tiff, .bmp
 */

import { readdirSync, statSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, extname, basename } from 'node:path';
import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import type { AppError } from '../../domain/errors.js';
import type { ContentItem } from '../../domain/content.js';
import type { Source, SourceDescriptor } from '../../domain/sources.js';

// ─────────────────────── config ──────────────────────────

interface ImageOcrConfig {
  readonly path: string;
  readonly language: string;
}

const parseConfig = (raw: Readonly<Record<string, unknown>>): ImageOcrConfig | null => {
  const p = raw.path;
  if (typeof p !== 'string' || p.length === 0) return null;
  return {
    path: p,
    language: typeof raw.language === 'string' ? raw.language : 'eng',
  };
};

// ─────────────────────── file discovery ──────────────────

const OCR_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.bmp']);

const collectImages = (target: string): readonly string[] => {
  if (!existsSync(target)) return [];

  const stat = statSync(target);
  if (stat.isFile()) {
    return OCR_EXTENSIONS.has(extname(target).toLowerCase()) ? [target] : [];
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
      } else if (OCR_EXTENSIONS.has(extname(name).toLowerCase())) {
        files.push(full);
      }
    }
  };
  walk(target);
  return files;
};

// ─────────────────────── tesseract probe ─────────────────

const isTesseractAvailable = (): boolean => {
  const result = spawnSync('which', ['tesseract'], { encoding: 'utf8' });
  return result.status === 0 && result.stdout.trim().length > 0;
};

// ─────────────────────── OCR per file ────────────────────

const ocrFile = (filePath: string, language: string): string => {
  const result = spawnSync('tesseract', [filePath, 'stdout', '-l', language], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (result.status !== 0) {
    return `[OCR failed: ${(result.stderr ?? '').trim().slice(0, 200)}]`;
  }
  return result.stdout.trim();
};

// ─────────────────────── source factory ──────────────────

export const imageOcrSource = () =>
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
        // Check for tesseract before processing any files
        if (!isTesseractAvailable()) {
          return okAsync<readonly ContentItem[], AppError>([{
            source_uri: `ocr://${cfg.path}`,
            title: `OCR: ${basename(cfg.path)}`,
            text: 'OCR unavailable \u2014 install tesseract (https://github.com/tesseract-ocr/tesseract)',
            metadata: {
              kind: 'image_ocr',
              file_path: cfg.path,
              available: false,
            },
          }]);
        }

        const files = collectImages(cfg.path);
        if (files.length === 0) {
          return okAsync<readonly ContentItem[], AppError>([{
            source_uri: `ocr://${cfg.path}`,
            title: `OCR: ${basename(cfg.path)}`,
            text: `No supported image files found at path: ${cfg.path}`,
            metadata: { kind: 'image_ocr', file_path: cfg.path, available: true },
          }]);
        }

        const items: readonly ContentItem[] = files.map((filePath) => {
          const text = ocrFile(filePath, cfg.language);
          const filename = basename(filePath);
          return {
            source_uri: `ocr://${filePath}`,
            title: `OCR: ${filename}`,
            text,
            metadata: {
              kind: 'image_ocr',
              file_path: filePath,
              language: cfg.language,
              available: true,
              char_count: text.length,
            },
          };
        });

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
