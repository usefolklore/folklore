/**
 * Tests for the Codex rollout parser + projector (the secure core of the
 * multi-provider session indexer). Locks: message extraction, malformed-line
 * resilience, private:true (local-only), and — critically — secret redaction
 * of pasted tokens before a transcript entry reaches the embedder.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCodexRollout,
  projectCodexEntry,
  codexSessionNodeId,
} from '../src/infrastructure/sources/codex-sessions.ts';

const rollout = [
  JSON.stringify({ timestamp: '2026-06-16T10:00:00Z', type: 'session_meta', payload: { id: 'sess-1', cwd: '/repo' } }),
  JSON.stringify({ timestamp: '2026-06-16T10:00:01Z', type: 'turn_context', payload: { turn_id: 't1' } }),
  JSON.stringify({ timestamp: '2026-06-16T10:00:02Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'how do I wire a source adapter?' }] } }),
  '{ this is not valid json',
  JSON.stringify({ timestamp: '2026-06-16T10:00:03Z', type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'register it in the source registry.' }] } }),
  JSON.stringify({ timestamp: '2026-06-16T10:00:04Z', type: 'event_msg', payload: { type: 'task_started' } }),
].join('\n');

describe('parseCodexRollout', () => {
  it('extracts message turns with role/text, skips non-message + malformed lines', () => {
    const e = parseCodexRollout(rollout);
    assert.equal(e.length, 2);
    assert.equal(e[0].role, 'user');
    assert.match(e[0].text, /source adapter/);
    assert.equal(e[0].sessionId, 'sess-1');
    assert.equal(e[0].cwd, '/repo');
    assert.equal(e[1].role, 'assistant');
  });

  it('never throws on empty/garbage input', () => {
    assert.deepEqual(parseCodexRollout(''), []);
    assert.deepEqual(parseCodexRollout('not json\n{}\n'), []);
  });
});

describe('projectCodexEntry', () => {
  it('produces a private (local-only) node under the codex-session scheme', () => {
    const [e] = parseCodexRollout(rollout);
    const { node } = projectCodexEntry(e);
    assert.equal((node as { private?: boolean }).private, true, 'session nodes must be local-only');
    assert.equal(node.id, codexSessionNodeId(e.sessionId, e.entryId));
    assert.ok(node.id.startsWith('codex-session://'));
  });

  it('REDACTS a pasted secret from the transcript before indexing', () => {
    const leaky = JSON.stringify({
      type: 'response_item',
      payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'my key is sk-abcdefghij1234567890ZZ use it' }] },
    });
    const meta = JSON.stringify({ type: 'session_meta', payload: { id: 's2', cwd: '/x' } });
    const [e] = parseCodexRollout(`${meta}\n${leaky}`);
    const { node, redactions } = projectCodexEntry(e);
    const blob = JSON.stringify(node);
    assert.ok(!blob.includes('sk-abcdefghij1234567890ZZ'), 'raw secret must not survive into the node');
    assert.ok(blob.includes('[REDACTED:openai-key]'), 'secret should be replaced by the redaction marker');
    assert.ok(redactions.length > 0, 'redaction log must record the hit');
  });
});
