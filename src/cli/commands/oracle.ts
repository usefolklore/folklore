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
import { getNode, type GraphNode } from '../../domain/graph.js';
import { loadOrCreateIdentity, createNode, dialAndTag } from '../../infrastructure/peer-transport.js';
import { loadPeers } from '../../infrastructure/peer-store.js';
import { loadConfig } from '../../infrastructure/config-loader.js';
import { publishQuestion, publishAnswer } from '../../infrastructure/oracle-gossip.js';
import { wellinformedHome } from '../runtime.js';
import { join } from 'node:path';

const ORACLE_ROOM = 'oracle';

const localPeerId = async (homePath: string): Promise<string> => {
  // Re-use the same identity file libp2p uses so answers are attributable
  // to the same peer the rest of the stack knows. Fall back to 'local'
  // for offline use.
  const res = await loadOrCreateIdentity(join(homePath, 'peer-identity.json'));
  return res.isOk() ? res.value.peerId : 'local';
};

// ─────────────────────── live publish helper ────────────────

/**
 * Spin up a short-lived libp2p node, dial every known peer plus every
 * configured relay, publish one oracle message over pubsub, stop.
 * Mirrors the ask --peers pattern. Returns a non-zero code on hard
 * failure; a zero publish-to-zero-peers is still a success (offline-
 * tolerant, same as Layer A's write-now-propagate-later model).
 */
const liveBroadcast = async (
  kind: 'question' | 'answer',
  node: GraphNode,
): Promise<number> => {
  const homePath = wellinformedHome();
  const idRes = await loadOrCreateIdentity(join(homePath, 'peer-identity.json'));
  if (idRes.isErr()) {
    console.error(`oracle --live: identity: ${formatError(idRes.error)}`);
    return 1;
  }
  const cfgRes = await loadConfig(join(homePath, 'config.yaml'));
  if (cfgRes.isErr()) {
    console.error(`oracle --live: config: ${formatError(cfgRes.error)}`);
    return 1;
  }

  // Ephemeral node — listen on a random port, outbound-focused.
  const nodeRes = await createNode(idRes.value, {
    listenPort: 0,
    listenHost: '127.0.0.1',
    upnp: false,
  });
  if (nodeRes.isErr()) {
    console.error(`oracle --live: libp2p: ${formatError(nodeRes.error)}`);
    return 1;
  }
  const libp2p = nodeRes.value;

  try {
    // Subscribe to the topic BEFORE dialing — floodsub only forwards to
    // peers it has seen subscribed. Without subscribing on our side,
    // the dialed peers may not immediately know we're a subscriber and
    // may drop our publish.
    const pubsub = (libp2p.services as Record<string, unknown>).pubsub as {
      subscribe: (t: string) => void;
    };
    pubsub.subscribe('/wellinformed/oracle/1.0.0');

    // Dial known peers + configured relays so the pubsub graph has
    // reach. Failures are non-fatal per peer.
    let dialed = 0;
    const peersRes = await loadPeers(join(homePath, 'peers.json'));
    if (peersRes.isOk()) {
      for (const p of peersRes.value.peers) {
        for (const addr of p.addrs) {
          try {
            await dialAndTag(libp2p, addr);
            dialed++;
            break;
          } catch { /* try next addr */ }
        }
      }
    }
    for (const relay of cfgRes.value.peer.relays) {
      try { await dialAndTag(libp2p, relay); dialed++; } catch { /* non-fatal */ }
    }

    // Tiny settle window so floodsub's subscription-meta handshake can
    // complete before we publish. 200 ms is generous for 127.0.0.1
    // pubsub; slower on real networks but still bounded.
    await new Promise<void>((r) => setTimeout(r, 200));

    const publishRes = kind === 'question'
      ? await publishQuestion(libp2p, node)
      : await publishAnswer(libp2p, node);
    if (publishRes.isErr()) {
      console.error(`oracle --live: publish: ${formatError(publishRes.error)}`);
      return 1;
    }
    console.log(`  live:   published to /wellinformed/oracle/1.0.0 (${dialed} peer(s) dialed)`);
    return 0;
  } finally {
    try { await libp2p.stop(); } catch { /* ignore */ }
  }
};

// ─────────────────────── ask ──────────────────────────────

const ask = async (rest: readonly string[]): Promise<number> => {
  let live = false;
  const textTokens: string[] = [];
  for (const t of rest) {
    if (t === '--live') { live = true; continue; }
    textTokens.push(t);
  }
  const text = textTokens.join(' ').trim();
  if (!text) {
    console.error('oracle ask: missing question — usage: wellinformed oracle ask "your question" [--live]');
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
    console.log(live
      ? '  peers subscribed to /wellinformed/oracle/1.0.0 get it now; others on next touch.'
      : '  peers will see it on their next touch of `oracle`.');
    if (live) {
      const rc = await liveBroadcast('question', node);
      if (rc !== 0) return rc;
    }
    return 0;
  } finally {
    runtime.close();
  }
};

// ─────────────────────── answer ───────────────────────────

const answer = async (rest: readonly string[]): Promise<number> => {
  const [qid, ...textParts] = rest;
  let confidence: number | undefined;
  let live = false;
  // Strip --confidence / --live flags from textParts
  const textTokens: string[] = [];
  for (let i = 0; i < textParts.length; i++) {
    if (textParts[i] === '--confidence' && i + 1 < textParts.length) {
      const n = Number(textParts[++i]);
      if (Number.isFinite(n)) confidence = n;
      continue;
    }
    if (textParts[i] === '--live') { live = true; continue; }
    textTokens.push(textParts[i]);
  }
  const text = textTokens.join(' ').trim();
  if (!qid || !text) {
    console.error('oracle answer: usage: wellinformed oracle answer <question-id> "your answer" [--confidence 0.7] [--live]');
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
    if (live) {
      const rc = await liveBroadcast('answer', node);
      if (rc !== 0) return rc;
    }
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
  ask "<text>" [--live]      post a new question (--live also publishes
                             over libp2p pubsub for real-time fan-out)
  answer <qid> "<text>" [--confidence N] [--live]
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
