/**
 * audio_transcript source adapter.
 *
 * Transcribes audio files using the Whisper CLI (OpenAI whisper or
 * whisper.cpp). If neither binary is found the adapter returns a
 * single ContentItem noting the missing dependency.
 *
 * Config:
 *   {
 *     path: string   // path to a single audio file or directory
 *   }
 *
 * Supported extensions: .mp3, .wav, .m4a, .ogg
 */

import { readdirSync, statSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, extname, basename } from 'node:path';
import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import type { AppError } from '../../domain/errors.js';
import type { ContentItem } from '../../domain/content.js';
import type { Source, SourceDescriptor } from '../../domain/sources.js';

// ─────────────────────── config ──────────────────────────

interface AudioTranscriptConfig {
  readonly path: string;
}

const parseConfig = (raw: Readonly<Record<string, unknown>>): AudioTranscriptConfig | null => {
  const p = raw.path;
  if (typeof p !== 'string' || p.length === 0) return null;
  return { path: p };
};

// ─────────────────────── file discovery ──────────────────

const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.ogg']);

const collectAudioFiles = (target: string): readonly string[] => {
  if (!existsSync(target)) return [];

  const stat = statSync(target);
  if (stat.isFile()) {
    return AUDIO_EXTENSIONS.has(extname(target).toLowerCase()) ? [target] : [];
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
      } else if (AUDIO_EXTENSIONS.has(extname(name).toLowerCase())) {
        files.push(full);
      }
    }
  };
  walk(target);
  return files;
};

// ─────────────────────── whisper probe ───────────────────

type WhisperBinary = 'whisper' | 'whisper.cpp' | null;

const detectWhisper = (): WhisperBinary => {
  // Check for Python whisper first (OpenAI's original)
  const whisper = spawnSync('which', ['whisper'], { encoding: 'utf8' });
  if (whisper.status === 0 && whisper.stdout.trim().length > 0) return 'whisper';

  // Check for whisper.cpp (C++ port, often installed as `whisper-cpp` or `main`)
  const whisperCpp = spawnSync('which', ['whisper-cpp'], { encoding: 'utf8' });
  if (whisperCpp.status === 0 && whisperCpp.stdout.trim().length > 0) return 'whisper.cpp';

  return null;
};

// ─────────────────────── transcription ───────────────────

const transcribeFile = (filePath: string, binary: WhisperBinary): string => {
  if (!binary) return '';

  if (binary === 'whisper') {
    // OpenAI whisper CLI: whisper <file> --output_format txt --output_dir /tmp
    // Capture stdout which includes the transcript
    const result = spawnSync(
      'whisper',
      [filePath, '--output_format', 'txt', '--output_dir', '/dev/stdout'],
      { encoding: 'utf8', timeout: 120_000 },
    );
    // whisper writes to stdout during processing
    const output = (result.stdout ?? '').trim();
    if (result.status !== 0 && output.length === 0) {
      return `[Transcription failed: ${(result.stderr ?? '').trim().slice(0, 200)}]`;
    }
    return output;
  }

  // whisper.cpp: whisper-cpp -f <file>
  const result = spawnSync('whisper-cpp', ['-f', filePath], {
    encoding: 'utf8',
    timeout: 120_000,
  });
  if (result.status !== 0) {
    return `[Transcription failed: ${(result.stderr ?? '').trim().slice(0, 200)}]`;
  }
  return (result.stdout ?? '').trim();
};

// ─────────────────────── source factory ──────────────────

export const audioTranscriptSource = () =>
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
        const binary = detectWhisper();

        if (!binary) {
          return okAsync<readonly ContentItem[], AppError>([{
            source_uri: `audio://${cfg.path}`,
            title: `Transcript: ${basename(cfg.path)}`,
            text: 'Transcription unavailable \u2014 install whisper (https://github.com/openai/whisper) or whisper.cpp (https://github.com/ggerganov/whisper.cpp)',
            metadata: {
              kind: 'audio_transcript',
              file_path: cfg.path,
              available: false,
            },
          }]);
        }

        const files = collectAudioFiles(cfg.path);
        if (files.length === 0) {
          return okAsync<readonly ContentItem[], AppError>([{
            source_uri: `audio://${cfg.path}`,
            title: `Transcript: ${basename(cfg.path)}`,
            text: `No supported audio files found at path: ${cfg.path}`,
            metadata: { kind: 'audio_transcript', file_path: cfg.path, available: true },
          }]);
        }

        const items: readonly ContentItem[] = files.map((filePath) => {
          const text = transcribeFile(filePath, binary);
          const filename = basename(filePath);
          return {
            source_uri: `audio://${filePath}`,
            title: `Transcript: ${filename}`,
            text,
            metadata: {
              kind: 'audio_transcript',
              file_path: filePath,
              binary,
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
