/**
 * Shadow-receipt store — bounded JSONL persistence for RFC-0003 OQ#5
 * calibration receipts. Append-with-trim so the file can't grow without
 * bound; read-all for the summary report. Local-only (~/.folklore), never
 * sent over the wire — these can contain query text.
 *
 * The single I/O adapter for `ShadowReceipt`; the domain stays pure.
 */

import { appendFileSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { ShadowReceipt } from '../domain/shadow-receipt.js';
import { receiptsToSamples } from '../domain/shadow-receipt.js';
import {
  learnWeights,
  DEFAULT_COMPONENT_WEIGHTS,
  type LearnWeightsResult,
  type LearnWeightsOptions,
} from '../domain/peer-telemetry.js';

const FILE = 'shadow-receipts.jsonl';
const MAX_RECEIPTS = 1000;

const receiptPath = (home: string): string => join(home, FILE);

/**
 * Append one receipt. Trims the file to the last MAX_RECEIPTS lines when
 * it overflows. Swallows I/O errors — telemetry must never break a query.
 */
export const appendShadowReceipt = (home: string, receipt: ShadowReceipt): void => {
  try {
    const path = receiptPath(home);
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, JSON.stringify(receipt) + '\n', 'utf8');
    // Cheap overflow guard: only re-read + trim occasionally (when the
    // line count is a multiple of the cap is impossible to know without
    // reading, so trim whenever the file is comfortably over the cap).
    const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);
    if (lines.length > MAX_RECEIPTS) {
      writeFileSync(path, lines.slice(-MAX_RECEIPTS).join('\n') + '\n', 'utf8');
    }
  } catch {
    /* receipts are best-effort calibration data — never throw */
  }
};

/** Read all receipts (best-effort; malformed lines skipped). */
export const readShadowReceipts = (home: string): ShadowReceipt[] => {
  try {
    const path = receiptPath(home);
    if (!existsSync(path)) return [];
    const out: ShadowReceipt[] = [];
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line) as ShadowReceipt);
      } catch {
        /* skip a corrupt line */
      }
    }
    return out;
  } catch {
    return [];
  }
};

/**
 * Load learned satisfaction weights from the local receipt store.
 *
 * Flag-gated: returns the hand-tuned `DEFAULT_COMPONENT_WEIGHTS` unchanged
 * unless `FOLKLORE_LEARN_WEIGHTS=1` is set, so default behaviour is
 * byte-for-byte identical to today. Even when enabled, the underlying pure
 * `learnWeights` falls back to the constants whenever the labelled signal
 * is too thin / degenerate (see its contract) — so enabling the flag on a
 * cold store is also a no-op until enough receipts are labelled.
 *
 * Best-effort I/O: any read failure degrades to the constant weights.
 */
export const loadLearnedWeights = (
  home: string,
  opts?: LearnWeightsOptions & { readonly enabled?: boolean },
): LearnWeightsResult => {
  const enabled = opts?.enabled ?? process.env.FOLKLORE_LEARN_WEIGHTS === '1';
  if (!enabled) {
    return {
      weights: DEFAULT_COMPONENT_WEIGHTS,
      learned: false,
      fallback_reason: 'FOLKLORE_LEARN_WEIGHTS not enabled',
      samples_used: 0,
    };
  }
  const samples = receiptsToSamples(readShadowReceipts(home));
  return learnWeights(samples, opts);
};
