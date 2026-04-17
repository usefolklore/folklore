/**
 * oracle — peer-to-peer Q&A bulletin board.
 *
 * Questions and answers live as GraphNodes in the `oracle` system room.
 * Propagation is free: the existing touch + CRDT sync distributes them
 * to peers, the existing remote-node validator gates them at the trust
 * boundary, the secret-gate redacts them, the virtual-room membership
 * in system-rooms.ts auto-includes them on every peer without opt-in.
 *
 * The oracle "protocol" is therefore entirely a data shape — no new
 * libp2p handler, no new wire format, no new rate limiter. That's the
 * win: async query distribution at zero protocol cost.
 *
 * Node shapes:
 *
 *   Question
 *     id:           oracle-question:<uuid>
 *     source_uri:   oracle-question:<uuid>
 *     file_type:    'document'
 *     room:         'oracle' (physical room = system room name is fine)
 *     label:        short title (first 120 chars of text)
 *     summary:      full question body
 *     oracle_kind:  'question'
 *     asked_by:     <peer-id-string>
 *     status:       'open' | 'answered' | 'closed'
 *     fetched_at:   ISO
 *
 *   Answer
 *     id:           oracle-answer:<uuid>
 *     source_uri:   oracle-answer:<uuid>
 *     file_type:    'rationale'
 *     room:         'oracle'
 *     label:        first 120 chars of answer body
 *     summary:      full answer body
 *     oracle_kind:  'answer'
 *     question_id:  <oracle-question:xxx> this answer is for
 *     answered_by:  <peer-id-string>
 *     confidence:   number in [0,1] — subjective self-assessment
 *     fetched_at:   ISO
 *
 * The question_id on an answer node is the relation. Graph edges can
 * also be added for richer traversal (existing `relation: 'answers'`
 * edge), but the question_id stays on the answer node itself so peers
 * can match answers to questions without also receiving the edge.
 *
 * Deterministic IDs (v5-style UUID from text + asker+timestamp) would
 * be nice but random is sufficient for now — collision probability is
 * negligible, and deterministic IDs introduce a replay surface.
 */

import type { GraphNode } from './graph.js';
import { randomUUID } from 'node:crypto';

export type QuestionStatus = 'open' | 'answered' | 'closed';

export interface QuestionInput {
  readonly text: string;
  readonly askedBy: string;
  readonly label?: string;
  readonly date?: Date;
}

export interface AnswerInput {
  readonly questionId: string;
  readonly text: string;
  readonly answeredBy: string;
  readonly confidence?: number;
  readonly date?: Date;
}

const QUESTION_PREFIX = 'oracle-question:';
const ANSWER_PREFIX = 'oracle-answer:';
const LABEL_MAX = 120;
const SUMMARY_MAX = 8000;

const clampLabel = (text: string): string => {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  return trimmed.length > LABEL_MAX ? `${trimmed.slice(0, LABEL_MAX - 1)}…` : trimmed;
};

const clampSummary = (text: string): string => text.slice(0, SUMMARY_MAX);

export const newQuestionId = (): string => `${QUESTION_PREFIX}${randomUUID()}`;
export const newAnswerId = (): string => `${ANSWER_PREFIX}${randomUUID()}`;

export const isQuestionId = (id: string): boolean => id.startsWith(QUESTION_PREFIX);
export const isAnswerId = (id: string): boolean => id.startsWith(ANSWER_PREFIX);

export const nodeFromQuestion = (i: QuestionInput): GraphNode => {
  const id = newQuestionId();
  const now = (i.date ?? new Date()).toISOString();
  return {
    id,
    label: clampLabel(i.label ?? i.text),
    file_type: 'document',
    source_file: 'wellinformed:oracle',
    source_uri: id,
    room: 'oracle',
    fetched_at: now,
    embedding_id: id,
    summary: clampSummary(i.text),
    oracle_kind: 'question',
    asked_by: i.askedBy,
    status: 'open',
  } as GraphNode;
};

export const nodeFromAnswer = (i: AnswerInput): GraphNode => {
  const id = newAnswerId();
  const now = (i.date ?? new Date()).toISOString();
  const conf = typeof i.confidence === 'number'
    ? Math.max(0, Math.min(1, i.confidence))
    : undefined;
  const out: Record<string, unknown> = {
    id,
    label: clampLabel(i.text),
    file_type: 'rationale',
    source_file: 'wellinformed:oracle',
    source_uri: id,
    room: 'oracle',
    fetched_at: now,
    embedding_id: id,
    summary: clampSummary(i.text),
    oracle_kind: 'answer',
    question_id: i.questionId,
    answered_by: i.answeredBy,
  };
  if (conf !== undefined) out.confidence = conf;
  return out as GraphNode;
};

// ─────────────────────── queries ──────────────────────────

export interface QuestionView {
  readonly id: string;
  readonly label: string;
  readonly text: string;
  readonly askedBy: string;
  readonly status: QuestionStatus;
  readonly fetchedAt: string;
  readonly answerCount: number;
}

export interface AnswerView {
  readonly id: string;
  readonly questionId: string;
  readonly text: string;
  readonly answeredBy: string;
  readonly confidence: number | undefined;
  readonly fetchedAt: string;
}

const coerceString = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const coerceStatus = (v: unknown): QuestionStatus =>
  v === 'answered' || v === 'closed' ? v : 'open';
const coerceConfidence = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

export const questionFromNode = (n: GraphNode, answerCount = 0): QuestionView | undefined => {
  if (n.oracle_kind !== 'question') return undefined;
  const askedBy = coerceString(n.asked_by);
  if (!askedBy) return undefined;
  return {
    id: n.id,
    label: n.label,
    text: coerceString(n.summary) ?? n.label,
    askedBy,
    status: coerceStatus(n.status),
    fetchedAt: coerceString(n.fetched_at) ?? '',
    answerCount,
  };
};

export const answerFromNode = (n: GraphNode): AnswerView | undefined => {
  if (n.oracle_kind !== 'answer') return undefined;
  const questionId = coerceString(n.question_id);
  const answeredBy = coerceString(n.answered_by);
  if (!questionId || !answeredBy) return undefined;
  return {
    id: n.id,
    questionId,
    text: coerceString(n.summary) ?? n.label,
    answeredBy,
    confidence: coerceConfidence(n.confidence),
    fetchedAt: coerceString(n.fetched_at) ?? '',
  };
};

export const listQuestions = (
  nodes: readonly GraphNode[],
  opts: { readonly status?: QuestionStatus } = {},
): readonly QuestionView[] => {
  // Count answers per question_id in one pass
  const answers = new Map<string, number>();
  for (const n of nodes) {
    if (n.oracle_kind !== 'answer') continue;
    const qid = coerceString(n.question_id);
    if (!qid) continue;
    answers.set(qid, (answers.get(qid) ?? 0) + 1);
  }
  const out: QuestionView[] = [];
  for (const n of nodes) {
    const view = questionFromNode(n, answers.get(n.id) ?? 0);
    if (!view) continue;
    if (opts.status && view.status !== opts.status) continue;
    out.push(view);
  }
  // newest first
  return out.sort((a, b) => (b.fetchedAt ?? '').localeCompare(a.fetchedAt ?? ''));
};

export const listAnswers = (
  nodes: readonly GraphNode[],
  questionId: string,
): readonly AnswerView[] => {
  const out: AnswerView[] = [];
  for (const n of nodes) {
    const view = answerFromNode(n);
    if (!view || view.questionId !== questionId) continue;
    out.push(view);
  }
  // highest confidence first, then newest
  return out.sort((a, b) => {
    const cA = a.confidence ?? -1;
    const cB = b.confidence ?? -1;
    if (cB !== cA) return cB - cA;
    return (b.fetchedAt ?? '').localeCompare(a.fetchedAt ?? '');
  });
};

// ─────────────────────── answerability ─────────────────────

/**
 * "Which open external questions could this peer plausibly answer from
 * its local graph?"
 *
 * Pure filtering — takes already-computed semantic-search hits as
 * input so this module stays I/O-free. The application layer runs
 * the searches; this function partitions the results into a ranked
 * answerable list.
 *
 *   - Skip questions asked by `selfPeerId` (no self-answering).
 *   - Skip questions whose best hit is beyond `threshold` distance
 *     (irrelevant — not worth flagging as answerable).
 *   - Skip questions that already have an answer from `selfPeerId`
 *     (idempotency — don't flag as pending what we already answered).
 *   - Sort by best-hit distance ASC (closest match first = most
 *     confident answerability).
 */
export interface AnswerabilityHit {
  readonly nodeId: string;
  readonly distance: number;
}

export interface AnswerableItem {
  readonly question: QuestionView;
  readonly topHits: readonly AnswerabilityHit[];
  /**
   * Heuristic confidence in [0..1] derived from best-hit distance:
   *   suggestedConfidence = max(0, 1 - bestDistance).
   * The asker can override; this is just a starting point for the
   * `oracle_answer` confidence field.
   */
  readonly suggestedConfidence: number;
}

export interface AnswerabilityInput {
  readonly question: QuestionView;
  readonly hits: readonly AnswerabilityHit[];
}

export const rankAnswerable = (
  inputs: readonly AnswerabilityInput[],
  selfPeerId: string,
  alreadyAnsweredByMe: ReadonlySet<string>,
  threshold: number,
): readonly AnswerableItem[] => {
  const out: AnswerableItem[] = [];
  for (const i of inputs) {
    if (i.question.askedBy === selfPeerId) continue;
    if (alreadyAnsweredByMe.has(i.question.id)) continue;
    if (i.hits.length === 0) continue;
    const best = i.hits[0];
    if (!(best.distance <= threshold)) continue;
    out.push({
      question: i.question,
      topHits: i.hits,
      suggestedConfidence: Math.max(0, Math.min(1, 1 - best.distance)),
    });
  }
  return out.sort((a, b) => {
    const dA = a.topHits[0]?.distance ?? Infinity;
    const dB = b.topHits[0]?.distance ?? Infinity;
    return dA - dB;
  });
};

/**
 * From the graph, collect the set of question ids the given peer has
 * already answered. Used by rankAnswerable to skip already-answered
 * questions (idempotency on self).
 */
export const questionsAnsweredBy = (
  nodes: readonly GraphNode[],
  peerId: string,
): ReadonlySet<string> => {
  const out = new Set<string>();
  for (const n of nodes) {
    const view = answerFromNode(n);
    if (!view) continue;
    if (view.answeredBy === peerId) out.add(view.questionId);
  }
  return out;
};
