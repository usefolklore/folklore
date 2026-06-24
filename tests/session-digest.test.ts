/**
 * Unit tests — session-digest distiller (agent-memory capture lane).
 *
 * Pure-domain tests over synthetic SessionEntry fixtures + a raw
 * JSONL parse path. Locks:
 *   - decisions/open-threads/errors extracted by cue
 *   - files-touched pulled from Edit/Write tool calls (full path)
 *   - commits pulled from prose and `git commit` bash commands
 *   - last user goal = the most recent user turn
 *   - empty transcript → empty digest (isDigestEmpty true)
 *   - per-section caps hold (no unbounded growth)
 *   - parseTranscript drops metadata/malformed lines, keeps turns
 *   - digestLabel stable per (workspace, session) for idempotent update
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  distillSession,
  isDigestEmpty,
  renderDigest,
  parseTranscript,
  digestLabel,
  digestSourceUri,
  DIGEST_SOURCE_PREFIX,
  type SessionDigest,
} from '../src/domain/session-digest.ts';
import type { SessionEntry, ToolCallSummary } from '../src/domain/sessions.ts';

const user = (summary: string, ts = '2026-06-21T10:00:00Z'): SessionEntry => ({
  kind: 'user',
  uuid: `u-${summary.slice(0, 6)}`,
  parentUuid: null,
  sessionId: 'sess-abc12345',
  timestamp: ts,
  cwd: '/Users/dev/personal/folklore',
  gitBranch: 'main',
  summary,
  toolCalls: [],
  toolUseID: null,
});

const assistant = (
  summary: string,
  toolCalls: readonly ToolCallSummary[] = [],
  ts = '2026-06-21T10:01:00Z',
): SessionEntry => ({
  kind: 'assistant',
  uuid: `a-${summary.slice(0, 6)}`,
  parentUuid: null,
  sessionId: 'sess-abc12345',
  timestamp: ts,
  cwd: '/Users/dev/personal/folklore',
  gitBranch: 'main',
  summary,
  toolCalls,
  toolUseID: null,
});

test('distill: extracts decisions, files, open threads, errors, last goal', () => {
  const entries: SessionEntry[] = [
    user('add a memory layer so agents survive context clears'),
    assistant("I'll reuse folklore's graph instead of bolting on mem0", [
      { tool: 'Edit', target_path: 'src/domain/session-digest.ts' },
      { tool: 'Write', target_path: 'tests/session-digest.test.ts' },
    ]),
    assistant('the fix is to wire the Stop hook because it was empty', [
      { tool: 'Bash', command: 'npm test' },
    ]),
    assistant('TODO: still need to wire settings.json for PreCompact'),
    assistant('tsc failed with a type error on the digest field'),
    user('go ahead and finish it'),
  ];

  const d = distillSession(entries);

  assert.equal(d.sessionId, 'sess-abc12345');
  assert.equal(d.workspace, '/Users/dev/personal/folklore');
  assert.equal(d.gitBranch, 'main');
  assert.equal(d.userTurns, 2);
  assert.equal(d.assistantTurns, 4);
  assert.equal(d.lastUserGoal, 'go ahead and finish it');

  assert.ok(d.decisions.some((x) => x.includes('reuse')), 'reuse decision captured');
  assert.ok(d.decisions.some((x) => x.includes('the fix is')), 'fix decision captured');
  assert.deepEqual(
    [...d.filesTouched].sort(),
    ['src/domain/session-digest.ts', 'tests/session-digest.test.ts'],
  );
  assert.ok(d.openThreads.some((x) => x.includes('settings.json')), 'open thread captured');
  assert.ok(d.errors.some((x) => x.includes('tsc failed')), 'error captured');
  assert.ok(!isDigestEmpty(d));
});

test('distill: pulls commit SHAs from prose and git commit commands', () => {
  const entries: SessionEntry[] = [
    user('ship it'),
    assistant('landed in commit a1b2c3d4 with the digest', [
      { tool: 'Bash', command: 'git commit -m "feat: memory" && echo done' },
    ]),
    assistant('also commit deadbeef9 for the hook wiring'),
  ];
  const d = distillSession(entries);
  assert.ok(d.commits.includes('a1b2c3d4'), 'prose commit sha');
  assert.ok(d.commits.includes('deadbeef9'), 'second commit sha');
  assert.ok(d.commands.some((c) => c.startsWith('git commit')), 'git commit command captured');
});

test('distill: empty transcript yields an empty digest', () => {
  const d = distillSession([]);
  assert.ok(isDigestEmpty(d));
  assert.equal(d.lastUserGoal, null);
  assert.equal(d.userTurns, 0);
  // render is still total and produces a header
  assert.ok(renderDigest(d).startsWith('# Session memory'));
});

test('distill: per-section caps hold under flooding', () => {
  const entries: SessionEntry[] = [];
  for (let i = 0; i < 60; i++) {
    entries.push(
      assistant(`decided to use approach number ${i} instead of the last`, [
        { tool: 'Write', target_path: `src/file-${i}.ts` },
      ]),
    );
  }
  const d = distillSession(entries);
  assert.ok(d.decisions.length <= 8, `decisions capped, got ${d.decisions.length}`);
  assert.ok(d.filesTouched.length <= 25, `files capped, got ${d.filesTouched.length}`);
});

test('distill: dedupes repeated files and decisions', () => {
  const entries: SessionEntry[] = [
    assistant('decided to reuse the graph', [{ tool: 'Edit', target_path: 'src/a.ts' }]),
    assistant('decided to reuse the graph', [{ tool: 'Edit', target_path: 'src/a.ts' }]),
  ];
  const d = distillSession(entries);
  assert.equal(d.filesTouched.length, 1);
  assert.equal(d.decisions.length, 1);
});

test('parseTranscript: keeps user/assistant turns, drops metadata + malformed', () => {
  const jsonl = [
    JSON.stringify({ type: 'last-prompt', sessionId: 's1', leafUuid: 'x' }),
    JSON.stringify({ type: 'mode', sessionId: 's1', mode: 'default' }),
    JSON.stringify({
      type: 'user',
      uuid: 'u1',
      sessionId: 's1',
      timestamp: '2026-06-21T10:00:00Z',
      message: { role: 'user', content: 'hello there fix the bug' },
    }),
    '{ this is not valid json',
    JSON.stringify({
      type: 'assistant',
      uuid: 'a1',
      sessionId: 's1',
      timestamp: '2026-06-21T10:01:00Z',
      message: { role: 'assistant', content: [{ type: 'text', text: 'the fix is ready' }] },
    }),
  ].join('\n');

  const entries = parseTranscript(jsonl);
  assert.equal(entries.length, 2, 'only the two real turns survive');
  assert.equal(entries[0].kind, 'user');
  assert.equal(entries[1].kind, 'assistant');

  const d = distillSession(entries);
  assert.equal(d.lastUserGoal, 'hello there fix the bug');
});

test('distill: on file overflow keeps the MOST-RECENTLY touched files', () => {
  const entries: SessionEntry[] = [];
  for (let i = 0; i < 30; i++) {
    entries.push(assistant(`edit ${i}`, [{ tool: 'Edit', target_path: `src/file-${i}.ts` }]));
  }
  const d = distillSession(entries);
  assert.equal(d.filesTouched.length, 25);
  // the last-touched file must be present; the first must have been dropped
  assert.ok(d.filesTouched.includes('src/file-29.ts'), 'most recent kept');
  assert.ok(!d.filesTouched.includes('src/file-0.ts'), 'oldest dropped');
});

test('distill: re-touching a file moves it to most-recent (dedup keeps last position)', () => {
  const entries: SessionEntry[] = [
    assistant('touch a', [{ tool: 'Edit', target_path: 'src/a.ts' }]),
    assistant('touch b', [{ tool: 'Edit', target_path: 'src/b.ts' }]),
    assistant('touch a again', [{ tool: 'Edit', target_path: 'src/a.ts' }]),
  ];
  const d = distillSession(entries);
  assert.deepEqual(d.filesTouched, ['src/b.ts', 'src/a.ts'], 'a re-touched → now last');
});

test('distill: only-user turns yields a goal but no decisions, not empty', () => {
  const d = distillSession([user('first ask'), user('second ask, the real goal')]);
  assert.equal(d.lastUserGoal, 'second ask, the real goal');
  assert.equal(d.decisions.length, 0);
  assert.equal(d.assistantTurns, 0);
  assert.ok(!isDigestEmpty(d), 'a goal alone is worth remembering');
});

test('distill: tool-only assistant turns capture files with no decision text', () => {
  const d = distillSession([
    assistant('', [{ tool: 'Write', target_path: 'src/x.ts' }, { tool: 'Read', target_path: 'src/y.ts' }]),
  ]);
  assert.deepEqual(d.filesTouched, ['src/x.ts'], 'only edit-class tools count; Read ignored');
  assert.equal(d.decisions.length, 0);
  assert.ok(!isDigestEmpty(d), 'files touched is resumable signal');
});

test('distill: missing session id falls back to nosession in label + uri', () => {
  const e: SessionEntry = { ...user('x'), sessionId: '' };
  const d = distillSession([e]);
  assert.equal(d.sessionId, null);
  assert.equal(digestLabel(d), 'Session memory · folklore · nosession');
  assert.equal(digestSourceUri(d), `${DIGEST_SOURCE_PREFIX}nosession`);
});

test('render: stays bounded and includes only non-empty sections', () => {
  const d = distillSession([
    user('goal here'),
    assistant('decided to ship', [{ tool: 'Edit', target_path: 'src/a.ts' }]),
  ]);
  const md = renderDigest(d);
  assert.ok(md.includes('## Decisions'));
  assert.ok(md.includes('## Files touched'));
  assert.ok(!md.includes('## Errors hit'), 'empty section omitted');
  assert.ok(md.length < 12000, 'digest stays compact');
});

test('digestLabel + sourceUri are stable per (workspace, session) for idempotent update', () => {
  const d: SessionDigest = distillSession([user('x'), assistant('decided y')]);
  assert.equal(digestLabel(d), 'Session memory · folklore · sess-abc');
  assert.equal(digestSourceUri(d), `${DIGEST_SOURCE_PREFIX}sess-abc12345`);
  // same session distilled again → same label (so save() updates in place)
  const d2 = distillSession([user('x2'), assistant('decided z')]);
  assert.equal(digestLabel(d2), digestLabel(d));
});
