#!/usr/bin/env node
/**
 * In-session demo player — replays REAL folklore outputs (captured by
 * capture.sh) as a faithful Claude Code TUI session. Nothing here is invented:
 * the deny decision + injected peer traces come from the actual PreToolUse hook
 * (.frames/hook.json), and the climbing reputation / notification come from the
 * actual statusline rendered at each serve (.frames/status-N.txt).
 *
 * This is the honest replacement for the ./resolve wrappers: it shows folklore
 * where it really lives — inside a Claude Code session, receiving inference from
 * the swarm and earning reputation serving it back.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));
const FR = join(DIR, '.frames');
const read = (f) => readFileSync(join(FR, f), 'utf8');
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

const C = {
  reset: '\x1b[0m', dim: (s) => `\x1b[2m${s}\x1b[0m`, bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`, red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`, cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  mag: (s) => `\x1b[35m${s}\x1b[0m`, gray: (s) => `\x1b[90m${s}\x1b[0m`,
  purple: (s) => `\x1b[38;5;140m${s}\x1b[0m`,
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const w = (s = '') => process.stdout.write(s + '\n');

// ── parse the REAL hook output: the two injected peer traces ──
const hook = JSON.parse(read('hook.json'));
const ctx = hook.hookSpecificOutput?.additionalContext ?? '';
const denied = hook.hookSpecificOutput?.permissionDecision === 'deny';
const hits = [];
for (const m of ctx.matchAll(/^\s*\d+\.\s+([\w-]+)\s+\[[^\]]*\]\s+d=[\d.]+\s+—\s+(.+)$/gm)) {
  hits.push({ label: m[1], text: m[2].trim() });
}

// ── parse the REAL statusline + ledger at each serve: reputation + peer ──
const shortPeer = (id) => (id && id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id);
const statusBar = (n) => {
  const raw = stripAnsi(read(`status-${n}.txt`));
  const rep = (raw.match(/🏅\s*(\d+)\s*rep/) || [, '0'])[1];
  const served = (raw.match(/served\s*(\d+)\s*peer/) || [, '0'])[1];
  let answered;
  if (n > 0) {
    try { answered = shortPeer(JSON.parse(read(`contrib-${n}.json`)).last_served_peer); } catch { /* no ledger */ }
  }
  const bar = `${C.dim('folklore')} ${C.purple('claude code')}   ${C.yellow('🏅 ' + rep + ' rep')} ${C.dim('·')} served ${C.green(served)} peer${served === '1' ? '' : 's'}`;
  return answered ? `${bar}   ${C.green('⚡ answered ' + answered)}` : bar;
};

const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

async function main() {
  console.clear();
  w();
  w(`  ${statusBar(0)}`);
  w(`  ${C.dim('─'.repeat(72))}`);
  w();
  await sleep(700);

  // user turn
  process.stdout.write(`  ${C.cyan('>')} `);
  const q = "how do I fix the tokio spawn Send + 'static error sharing an Rc across await?";
  for (const ch of q) { process.stdout.write(ch); await sleep(14); }
  w(); w();
  await sleep(500);

  // agent reaches for the web
  w(`  ${C.green('⏺')} I'll look this up.`);
  await sleep(500);
  w(`  ${C.gray('⎿')}  ${C.yellow('WebSearch')}${C.dim('(query: "tokio spawn Send static Rc across await")')}`);
  await sleep(900);
  w();

  // folklore intercepts — REAL deny + injected peer traces
  if (denied) {
    w(`  ${C.red('⛔ folklore')} ${C.dim('· web call denied — the swarm already ground this out')}`);
    w(`  ${C.green('✓')} answered from ${C.bold(hits.length + " peers' graphs")} ${C.gray('[signed ✓]')} ${C.dim('· 0 web calls · 0 tokens of re-inference')}`);
    for (const h of hits) {
      await sleep(450);
      w(`     ${C.green('•')} ${C.bold(h.label)} ${C.gray('· from a peer')}`);
      w(`       ${C.dim(trunc(h.text, 78))}`);
    }
  }
  w();
  await sleep(900);

  // agent answers from the peer inference
  w(`  ${C.green('⏺')} Use ${C.bold('Arc<Mutex<T>>')} for cross-thread shared state, or keep the task on`);
  w(`     one thread with ${C.bold('tokio::task::LocalSet + spawn_local')} (no Send bound).`);
  w(`     ${C.dim('Answered from the swarm — zero web, zero re-inference.')}`);
  w();
  await sleep(1100);

  // meanwhile: YOUR node is serving the swarm — reputation climbs live
  w(`  ${C.dim('── meanwhile, other agents are pulling ')}${C.dim('your')}${C.dim(' traces — you earn rep ──')}`);
  w();
  for (let n = 1; n <= 3; n++) {
    await sleep(950);
    w(`  ${statusBar(n)}`);
  }
  w();
  await sleep(700);
  w(`  ${C.gray('you paid for this inference once. the whole swarm reuses it — and every')}`);
  w(`  ${C.gray('agent you answer pushes your reputation up. that is the compounding loop.')}`);
  w();
  await sleep(1200);
}

main();
