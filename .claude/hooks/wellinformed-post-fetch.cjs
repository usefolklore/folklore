#!/usr/bin/env node
/**
 * wellinformed PostToolUse auto-save hook.
 *
 * Runs AFTER Claude calls WebSearch / WebFetch. Captures the tool
 * result and files it as a `source` note in a dedicated `research-inbox`
 * room so the next search hits the graph instead of the web. User can
 * later promote, reroom, or delete via `wellinformed lint` / `save`.
 *
 * Rationale: the real cost of "going somewhere else" isn't the trip —
 * it's repeating the trip. If Claude fetches the same URL twice in two
 * sessions, we paid the network cost twice AND lost the reasoning from
 * round one. Auto-saving closes that loop.
 *
 * Room choice: hardcoded `research-inbox` (not the user's current room)
 * so public / shared rooms don't get polluted by incidental web grabs.
 * Users promote the good ones with `wellinformed save --room <real>`.
 *
 * Graceful degradation: any error → exit 0 silently. We never want a
 * post-hook to interrupt Claude's reasoning loop.
 */

'use strict';

const { spawn } = require('node:child_process');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const os = require('node:os');

const HOME = process.env.WELLINFORMED_HOME || join(os.homedir(), '.wellinformed');
const GRAPH_PATH = join(HOME, 'graph.json');
const SAVE_TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 32_000;
// System room — every WebSearch / WebFetch result lands here so every
// peer can touch `research` and see what this agent has read lately.
// Deliberately not tunable: the system-rooms contract is that toolshed
// and research are the two canonical, always-available surfaces.
const ROOM = 'research';

const safe = (fn) => { try { return fn(); } catch { return undefined; } };

const readPayload = () => safe(() => JSON.parse(readFileSync(0, 'utf8') || '{}')) ?? {};

const extractText = (toolName, ti, resp) => {
  if (!resp) return '';
  if (typeof resp === 'string') return resp;
  if (Array.isArray(resp)) {
    return resp.map((r) => (typeof r === 'string' ? r : r?.text ?? JSON.stringify(r))).join('\n');
  }
  if (typeof resp === 'object') {
    if (typeof resp.text === 'string') return resp.text;
    if (typeof resp.content === 'string') return resp.content;
    if (typeof resp.result === 'string') return resp.result;
    return JSON.stringify(resp).slice(0, MAX_BODY_BYTES);
  }
  return '';
};

const labelFor = (toolName, ti) => {
  if (toolName === 'WebSearch') return `web: ${String(ti.query ?? '').slice(0, 100)}`;
  if (toolName === 'WebFetch')  return `url: ${String(ti.url ?? '').slice(0, 100)}`;
  return `${toolName}: ${JSON.stringify(ti).slice(0, 80)}`;
};

const sourceUriFor = (toolName, ti) => {
  if (toolName === 'WebFetch' && ti.url) return String(ti.url);
  if (toolName === 'WebSearch' && ti.query) return `websearch:${String(ti.query).slice(0, 200)}`;
  return undefined;
};

const saveToGraph = (label, body, sourceUri) => new Promise((resolve) => {
  const args = ['save', '--room', ROOM, '--type', 'source', '--label', label];
  if (sourceUri) args.push('--source-uri', sourceUri);
  const child = spawn('wellinformed', args, {
    stdio: ['pipe', 'ignore', 'ignore'],
    timeout: SAVE_TIMEOUT_MS,
  });
  child.on('error', () => resolve());
  child.on('close', () => resolve());
  try {
    child.stdin.end(body.slice(0, MAX_BODY_BYTES));
  } catch {
    resolve();
  }
});

const main = async () => {
  if (!existsSync(GRAPH_PATH)) process.exit(0);

  const payload = readPayload();
  const toolName = String(payload.tool_name ?? '');
  if (toolName !== 'WebSearch' && toolName !== 'WebFetch') process.exit(0);

  const ti = payload.tool_input ?? {};
  const text = extractText(toolName, ti, payload.tool_response ?? payload.tool_result);
  if (!text || text.length < 64) process.exit(0);

  await saveToGraph(labelFor(toolName, ti), text, sourceUriFor(toolName, ti));
  process.exit(0);
};

main().catch(() => process.exit(0));
