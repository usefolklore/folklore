#!/usr/bin/env node
/**
 * deny-gate demo driver.
 *
 * Simulates a coding agent about to reach for the web, then shows folklore's
 * network-before-web decision. It calls the REAL engine (`folklore ask
 * --json`) and applies the SAME deny rule the PreToolUse hook applies inside
 * Claude Code (decision === 'use_memory' AND >= FOLKLORE_DENY_MIN_HITS hits,
 * satisfaction >= FOLKLORE_DENY_THRESHOLD). Same inputs, same verdict — this
 * is a faithful render of what the hook does, not a mock.
 *
 * Usage: node agent.mjs "a question the agent would google"
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const C = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  gray: (s) => `\x1b[90m${s}\x1b[0m`,
};

const THRESHOLD = Number(process.env.FOLKLORE_DENY_THRESHOLD ?? 0.85);
const MIN_HITS = Number(process.env.FOLKLORE_DENY_MIN_HITS ?? 2);

const query = process.argv.slice(2).join(' ').trim();
if (!query) {
  console.error('usage: agent.mjs "your question"');
  process.exit(1);
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const bin = resolve(repoRoot, 'bin', 'folklore.js');

const ask = () => {
  const out = execFileSync(process.execPath, [bin, 'ask', '--json', '--k', '3', query], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(out);
};

const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

console.log();
console.log(`${C.cyan('🤖 agent')}  ${C.dim('I need to answer:')} ${C.bold(query)}`);
console.log(`${C.gray('         → reaching for')} ${C.yellow(`WebSearch("${truncate(query, 52)}")`)}`);
console.log();

const t0 = Date.now();
const r = ask();
const ms = Date.now() - t0;

const hits = Array.isArray(r.hits) ? r.hits : [];
const sat = typeof r.satisfaction === 'number' ? r.satisfaction : 0;
const deny = r.decision === 'use_memory' && hits.length >= MIN_HITS && sat >= THRESHOLD;

if (deny) {
  console.log(
    `${C.red('⛔ folklore')}  ${C.bold('web call DENIED')}  ` +
      C.dim(`— your graph already knows this (satisfaction ${sat.toFixed(2)} ≥ ${THRESHOLD})`),
  );
  console.log();
  console.log(`${C.green('✓ answered from local graph')} ${C.dim(`— 0 network calls, ${ms}ms:`)}`);
  for (const h of hits) {
    console.log(`   ${C.green('•')} ${C.bold(h.label)}  ${C.gray(`d=${(h.distance ?? 0).toFixed(2)}`)}`);
    console.log(`     ${C.dim(truncate(h.summary ?? '', 88))}`);
  }
  console.log();
  console.log(C.gray(`   saved 1 web round-trip · answered offline · a peer researched this once, everyone reuses it`));
} else {
  console.log(
    `${C.green('✓ folklore')}  ${C.bold('web call ALLOWED')}  ` +
      C.dim(`— not in your graph (satisfaction ${sat.toFixed(2)} < ${THRESHOLD})`),
  );
  console.log();
  console.log(`${C.yellow('→ WebSearch proceeds')} ${C.dim(`(${ms}ms to decide)`)}`);
  console.log(C.gray('   …and the result auto-saves to the graph, so next time it denies + answers instantly.'));
}
console.log();
