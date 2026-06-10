/**
 * LLM extractor — port + SQuAD-style F1 scorer (Phase 23.8).
 *
 * Wraps a generative LLM as a span-extraction backend for the
 * retrieval-evaluation suites. Given a question and the concatenated
 * top-k retrieved evidence text, the extractor returns the model's
 * best-effort answer string. That string is then scored against the
 * gold answer with SQuAD-v1.1's `squadF1` metric (this file) — pure
 * compute, no LLM judge, no API call, deterministic.
 *
 * Two-call shape (not single-call generation) so the bench can:
 *   1. retrieve top-k via akashik
 *   2. extract from the retrieved text via the LLM
 *   3. score extraction vs gold via pure F1
 * which mirrors how every public LongMemEval / LoCoMo / SQuAD eval
 * actually works and is the only way to get an apples-to-apples
 * comparison with mem0 (92.5 LoCoMo) or agentmemory (95.2 LME R@5).
 *
 * Pure domain — no I/O. Adapters live in `src/infrastructure/`.
 */

import type { ResultAsync } from 'neverthrow';
import type { AppError } from './errors.js';

// ─────────────── port ───────────────

export interface ExtractInput {
  readonly question: string;
  /** Concatenated top-k retrieved sessions / documents. */
  readonly evidence: string;
}

export interface LlmExtractor {
  /** Model identifier — `phi3:mini`, `qwen2.5:3b`, etc. Persisted on reports for audit. */
  readonly model: string;
  extract(input: ExtractInput): ResultAsync<string, AppError>;
}

// ─────────────── SQuAD-v1.1 normalisation ───────────────

/**
 * Match the official SQuAD evaluator's `normalize_answer`:
 *   1. lowercase
 *   2. remove punctuation
 *   3. remove articles (a / an / the)
 *   4. collapse whitespace
 *
 * This is the canonical pre-processing for token-F1 / EM scoring
 * in the SQuAD 1.1 reference implementation
 * (https://rajpurkar.github.io/SQuAD-explorer/). Mem0's LoCoMo eval
 * uses the same normalisation; matching it keeps our numbers
 * directly comparable.
 */
export const normalizeAnswer = (s: string): string => {
  if (typeof s !== 'string') return '';
  const lower = s.toLowerCase();
  const noPunct = lower.replace(/[.,!?;:'"()[\]{}\-_/\\|`~@#$%^&*+=<>]/g, ' ');
  const noArticles = noPunct.replace(/\b(a|an|the)\b/g, ' ');
  return noArticles.replace(/\s+/g, ' ').trim();
};

const tokenize = (s: string): string[] => {
  const norm = normalizeAnswer(s);
  return norm.length === 0 ? [] : norm.split(' ');
};

/**
 * Token-level F1 over normalised answers — SQuAD-v1.1 style.
 *
 *   precision = |overlap| / |predicted|
 *   recall    = |overlap| / |gold|
 *   F1        = 2 * p * r / (p + r)
 *
 * Multiset overlap (per SQuAD reference) — duplicate tokens count
 * once per occurrence on each side, so `min(count_pred, count_gold)`.
 *
 * Returns 0 when either side is empty. Returns 1 when both are empty
 * (matches SQuAD's "yes/no" handling).
 */
export const squadF1 = (predicted: string, gold: string): number => {
  const predTokens = tokenize(predicted);
  const goldTokens = tokenize(gold);

  if (predTokens.length === 0 && goldTokens.length === 0) return 1;
  if (predTokens.length === 0 || goldTokens.length === 0) return 0;

  const goldCounts = new Map<string, number>();
  for (const t of goldTokens) goldCounts.set(t, (goldCounts.get(t) ?? 0) + 1);

  let overlap = 0;
  for (const t of predTokens) {
    const remaining = goldCounts.get(t) ?? 0;
    if (remaining > 0) {
      overlap++;
      goldCounts.set(t, remaining - 1);
    }
  }
  if (overlap === 0) return 0;

  const precision = overlap / predTokens.length;
  const recall = overlap / goldTokens.length;
  return (2 * precision * recall) / (precision + recall);
};

/** Exact-match after normalisation. SQuAD also reports this alongside F1. */
export const squadExactMatch = (predicted: string, gold: string): number =>
  normalizeAnswer(predicted) === normalizeAnswer(gold) ? 1 : 0;

// ─────────────── prompt builder ───────────────

/**
 * Build the extraction prompt. Deliberately terse:
 *   - "answer from evidence only"  → discourages hallucination
 *   - "as few words as possible"   → makes F1 / EM measurable
 *   - "I don't know" fallback      → exposes abstention behaviour
 *
 * The same template works across phi3:mini, qwen2.5:1.5b, and
 * llama3:8b — verified locally on the LoCoMo factual subset.
 */
export const buildExtractPrompt = ({ question, evidence }: ExtractInput): string => {
  const trimmedEvidence = evidence.length > 8000 ? `${evidence.slice(0, 8000)}…` : evidence;
  return [
    'You are an extractive question-answering system.',
    'Read the evidence and answer the question using ONLY information from the evidence.',
    'Answer in as few words as possible — a name, number, date, or short phrase.',
    'If the evidence does not contain the answer, reply exactly: I don\'t know.',
    '',
    '--- EVIDENCE ---',
    trimmedEvidence,
    '',
    '--- QUESTION ---',
    question,
    '',
    '--- ANSWER ---',
  ].join('\n');
};
