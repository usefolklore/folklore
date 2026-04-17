/**
 * `wellinformed oracle <sub>` — peer-to-peer Q&A via the oracle system room.
 *
 * Subcommands:
 *   ask "<text>"            post a question to the oracle room; peers see it on next touch
 *   answer <qid> "<text>"   post an answer linked to a question id
 *   list [--status open]    show questions, newest-first
 *   show <qid>              show a question plus its answers (confidence-ranked)
 *
 * All questions and answers propagate via the existing touch + CRDT
 * surface — no new wire protocol, no new rate limiter. The validator
 * already gates inbound oracle nodes; secret-gate already redacts them.
 */

import { formatError } from '../../domain/errors.js';
import { indexNode } from '../../application/use-cases.js';
import { defaultRuntime } from '../runtime.js';
import {
  nodeFromQuestion,
  nodeFromAnswer,
  listQuestions,
  listAnswers,
  isQuestionId,
  rankAnswerable,
  questionsAnsweredBy,
  type AnswerabilityInput,
  type QuestionStatus,
} from '../../domain/oracle.js';
import { searchGlobal } from '../../application/use-cases.js';
import { getNode } from '../../domain/graph.js';
import { loadOrCreateIdentity } from '../../infrastructure/peer-transport.js';
import { join } from 'node:path';

const ORACLE_ROOM = 'oracle';

const localPeerId = async (homePath: string): Promise<string> => {
  // Re-use the same identity file libp2p uses so answers are attributable
  // to the same peer the rest of the stack knows. Fall back to 'local'
  // for offline use.
  const res = await loadOrCreateIdentity(join(homePath, 'peer-identity.json'));
  return res.isOk() ? res.value.peerId : 'local';
};

// ─────────────────────── ask ──────────────────────────────

const ask = async (rest: readonly string[]): Promise<number> => {
  const text = rest.join(' ').trim();
  if (!text) {
    console.error('oracle ask: missing question — usage: wellinformed oracle ask "your question"');
    return 1;
  }
  const rt = await defaultRuntime();
  if (rt.isErr()) {
    console.error(`oracle ask: ${formatError(rt.error)}`);
    return 1;
  }
  const runtime = rt.value;
  try {
    const askedBy = await localPeerId(runtime.paths.home);
    const node = nodeFromQuestion({ text, askedBy });
    const res = await indexNode({
      graphs: runtime.graphs,
      vectors: runtime.vectors,
      embedder: runtime.embedder,
    })({ node, text, room: ORACLE_ROOM });
    if (res.isErr()) {
      console.error(`oracle ask: ${formatError(res.error)}`);
      return 1;
    }
    console.log(`oracle ask: posted`);
    console.log(`  id:     ${node.id}`);
    console.log(`  asked:  ${askedBy}`);
    console.log('  peers will see it on their next touch of `oracle`.');
    return 0;
  } finally {
    runtime.close();
  }
};

// ─────────────────────── answer ───────────────────────────

const answer = async (rest: readonly string[]): Promise<number> => {
  const [qid, ...textParts] = rest;
  let confidence: number | undefined;
  // Strip an optional --confidence N flag from textParts
  const textTokens: string[] = [];
  for (let i = 0; i < textParts.length; i++) {
    if (textParts[i] === '--confidence' && i + 1 < textParts.length) {
      const n = Number(textParts[++i]);
      if (Number.isFinite(n)) confidence = n;
      continue;
    }
    textTokens.push(textParts[i]);
  }
  const text = textTokens.join(' ').trim();
  if (!qid || !text) {
    console.error('oracle answer: usage: wellinformed oracle answer <question-id> "your answer" [--confidence 0.7]');
    return 1;
  }
  if (!isQuestionId(qid)) {
    console.error(`oracle answer: '${qid}' does not look like a question id (expected 'oracle-question:...')`);
    return 1;
  }
  const rt = await defaultRuntime();
  if (rt.isErr()) {
    console.error(`oracle answer: ${formatError(rt.error)}`);
    return 1;
  }
  const runtime = rt.value;
  try {
    const answeredBy = await localPeerId(runtime.paths.home);
    const node = nodeFromAnswer({ questionId: qid, text, answeredBy, confidence });
    const res = await indexNode({
      graphs: runtime.graphs,
      vectors: runtime.vectors,
      embedder: runtime.embedder,
    })({ node, text, room: ORACLE_ROOM });
    if (res.isErr()) {
      console.error(`oracle answer: ${formatError(res.error)}`);
      return 1;
    }
    console.log(`oracle answer: posted`);
    console.log(`  id:       ${node.id}`);
    console.log(`  to:       ${qid}`);
    console.log(`  from:     ${answeredBy}`);
    if (confidence !== undefined) console.log(`  confidence: ${confidence.toFixed(2)}`);
    return 0;
  } finally {
    runtime.close();
  }
};

// ─────────────────────── list ─────────────────────────────

const list = async (rest: readonly string[]): Promise<number> => {
  let status: QuestionStatus | undefined;
  let jsonOut = false;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--status' && i + 1 < rest.length) {
      const s = rest[++i];
      if (s === 'open' || s === 'answered' || s === 'closed') status = s;
    } else if (rest[i] === '--json') {
      jsonOut = true;
    }
  }
  const rt = await defaultRuntime();
  if (rt.isErr()) {
    console.error(`oracle list: ${formatError(rt.error)}`);
    return 1;
  }
  const runtime = rt.value;
  try {
    const graph = await runtime.graphs.load();
    if (graph.isErr()) {
      console.error(`oracle list: ${formatError(graph.error)}`);
      return 1;
    }
    const questions = listQuestions(graph.value.json.nodes, { status });
    if (jsonOut) {
      console.log(JSON.stringify({ questions }, null, 2));
      return 0;
    }
    if (questions.length === 0) {
      console.log('oracle list: no questions yet.');
      return 0;
    }
    for (const q of questions) {
      console.log(`• ${q.label}`);
      console.log(`    ${q.id}  [${q.status}]  asked_by=${q.askedBy}  answers=${q.answerCount}  ${q.fetchedAt}`);
    }
    return 0;
  } finally {
    runtime.close();
  }
};

// ─────────────────────── show ─────────────────────────────

const show = async (rest: readonly string[]): Promise<number> => {
  const [qid] = rest;
  if (!qid) {
    console.error('oracle show: missing question id — usage: wellinformed oracle show <qid>');
    return 1;
  }
  const rt = await defaultRuntime();
  if (rt.isErr()) {
    console.error(`oracle show: ${formatError(rt.error)}`);
    return 1;
  }
  const runtime = rt.value;
  try {
    const graph = await runtime.graphs.load();
    if (graph.isErr()) {
      console.error(`oracle show: ${formatError(graph.error)}`);
      return 1;
    }
    const all = graph.value.json.nodes;
    const qNode = all.find((n) => n.id === qid);
    if (!qNode || qNode.oracle_kind !== 'question') {
      console.error(`oracle show: question not found: ${qid}`);
      return 1;
    }
    console.log(`${qNode.label}`);
    console.log(`  id:     ${qNode.id}`);
    console.log(`  asked:  ${String(qNode.asked_by ?? '?')}`);
    console.log(`  status: ${String(qNode.status ?? 'open')}`);
    console.log(`  at:     ${String(qNode.fetched_at ?? '')}`);
    if (qNode.summary) {
      console.log('');
      console.log(String(qNode.summary));
    }

    const answers = listAnswers(all, qid);
    console.log('');
    if (answers.length === 0) {
      console.log('(no answers yet)');
      return 0;
    }
    console.log(`Answers (${answers.length}, confidence-ranked):`);
    for (const a of answers) {
      const conf = a.confidence === undefined ? '?' : a.confidence.toFixed(2);
      console.log(`  [conf=${conf}] by ${a.answeredBy}  ${a.fetchedAt}`);
      console.log(`    ${a.text}`);
    }
    return 0;
  } finally {
    runtime.close();
  }
};

// ─────────────────────── answerable ────────────────────────

const answerable = async (rest: readonly string[]): Promise<number> => {
  let threshold = 1.0;
  let k = 3;
  let limit = 10;
  let jsonOut = false;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--threshold' && i + 1 < rest.length) {
      const n = Number(rest[++i]);
      if (Number.isFinite(n)) threshold = n;
    } else if (rest[i] === '--k' && i + 1 < rest.length) {
      const n = Number(rest[++i]);
      if (Number.isFinite(n) && n >= 1) k = Math.min(10, Math.floor(n));
    } else if (rest[i] === '--limit' && i + 1 < rest.length) {
      const n = Number(rest[++i]);
      if (Number.isFinite(n) && n >= 1) limit = Math.min(50, Math.floor(n));
    } else if (rest[i] === '--json') {
      jsonOut = true;
    }
  }

  const rt = await defaultRuntime();
  if (rt.isErr()) {
    console.error(`oracle answerable: ${formatError(rt.error)}`);
    return 1;
  }
  const runtime = rt.value;
  try {
    const selfPeerId = await localPeerId(runtime.paths.home);
    const graph = await runtime.graphs.load();
    if (graph.isErr()) {
      console.error(`oracle answerable: ${formatError(graph.error)}`);
      return 1;
    }
    const all = graph.value.json.nodes;
    const openQuestions = listQuestions(all, { status: 'open' });
    const alreadyAnswered = questionsAnsweredBy(all, selfPeerId);

    const deps = {
      graphs: runtime.graphs,
      vectors: runtime.vectors,
      embedder: runtime.embedder,
    };

    // Run a semantic search per external open question; filter oracle
    // hits so we don't match bulletin-board traffic against itself.
    const inputs: AnswerabilityInput[] = [];
    for (const q of openQuestions) {
      if (q.askedBy === selfPeerId) continue;
      if (alreadyAnswered.has(q.id)) continue;
      const matches = await searchGlobal(deps)({ text: q.text, k });
      if (matches.isErr()) continue;
      const hits = matches.value
        .map((m) => ({
          nodeId: m.node_id,
          distance: m.distance,
          node: getNode(graph.value, m.node_id),
        }))
        .filter((h) => h.node?.room !== 'oracle')
        .map((h) => ({ nodeId: h.nodeId, distance: h.distance }));
      inputs.push({ question: q, hits });
    }

    const ranked = rankAnswerable(inputs, selfPeerId, alreadyAnswered, threshold).slice(0, limit);

    if (jsonOut) {
      console.log(JSON.stringify({
        self_peer_id: selfPeerId,
        threshold,
        count: ranked.length,
        items: ranked.map((r) => ({
          question: r.question,
          top_hits: r.topHits,
          suggested_confidence: r.suggestedConfidence,
        })),
      }, null, 2));
      return 0;
    }

    if (ranked.length === 0) {
      console.log('oracle answerable: no external open questions your graph can plausibly answer.');
      return 0;
    }
    console.log(`oracle answerable: ${ranked.length} question(s) your graph can plausibly answer`);
    console.log('');
    for (const r of ranked) {
      console.log(`• ${r.question.label}`);
      console.log(`    ${r.question.id}  asked_by=${r.question.askedBy}  suggested_confidence=${r.suggestedConfidence.toFixed(2)}`);
      for (const h of r.topHits) {
        const node = getNode(graph.value, h.nodeId);
        console.log(`    ↳ d=${h.distance.toFixed(3)} ${node?.label ?? h.nodeId} [${node?.room ?? '?'}]`);
      }
      console.log('');
    }
    return 0;
  } finally {
    runtime.close();
  }
};

// ─────────────────────── entry ────────────────────────────

const USAGE = `usage: wellinformed oracle <ask|answer|list|show|answerable>

subcommands:
  ask "<text>"               post a new question
  answer <qid> "<text>" [--confidence N]
                             post an answer linked to a question id
  list [--status <open|answered|closed>] [--json]
                             show questions, newest-first
  show <qid>                 show a question and its answers (confidence-ranked)
  answerable [--threshold N] [--k N] [--limit N] [--json]
                             list external open questions your graph could
                             plausibly answer (best-match first)

Oracle questions/answers propagate to peers via the existing \`touch oracle\`
surface. Run \`wellinformed daemon start\` (or ensure peers are connected)
so the CRDT sync fans your post out in near-real-time.`;

export const oracle = async (args: readonly string[]): Promise<number> => {
  const [sub, ...rest] = args;
  switch (sub) {
    case 'ask':        return ask(rest);
    case 'answer':     return answer(rest);
    case 'list':       return list(rest);
    case 'show':       return show(rest);
    case 'answerable': return answerable(rest);
    default:
      console.error(sub ? `oracle: unknown subcommand '${sub}'` : 'oracle: missing subcommand');
      console.error(USAGE);
      return 1;
  }
};
