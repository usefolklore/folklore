#!/usr/bin/env node
/**
 * In-session demo player — replays REAL folklore output (captured by capture.sh)
 * as a Claude Code TUI session. folklore is developers sharing the reasoning
 * their agents already worked out, peer-to-peer — so this shows real people:
 * you pull an answer from two developers who already debugged it, and three
 * developers pull what YOU worked out.
 *
 * Nothing is invented: the deny decision + traces come from the actual
 * PreToolUse hook (.frames/hook.json), the authorship from .frames/authors.json,
 * and the climbing reputation / @handles from the actual statusline at each
 * serve (.frames/status-N.txt). session.mjs only frames these into the TUI.
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
  gray: (s) => `\x1b[90m${s}\x1b[0m`, purple: (s) => `\x1b[38;5;140m${s}\x1b[0m`,
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const w = (s = '') => process.stdout.write(s + '\n');
const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

// REAL hook output: the deny + the two injected traces, each authored by a dev.
const hook = JSON.parse(read('hook.json'));
const ctx = hook.hookSpecificOutput?.additionalContext ?? '';
const denied = hook.hookSpecificOutput?.permissionDecision === 'deny';
const authors = JSON.parse(read('authors.json'));
const hits = [];
for (const m of ctx.matchAll(/^\s*\d+\.\s+([\w-]+)\s+\[[^\]]*\]\s+d=[\d.]+\s+—\s+(.+)$/gm)) {
  hits.push({ label: m[1], text: m[2].trim(), by: authors[m[1]] });
}

// REAL statusline at each serve: reputation number + the resolved @handle.
const statusBar = (n) => {
  const raw = stripAnsi(read(`status-${n}.txt`));
  const rep = (raw.match(/🏅\s*(\d+)\s*rep/) || [, '0'])[1];
  const helped = (raw.match(/(?:helped|served)\s*(\d+)/) || [, '0'])[1];
  const who = (raw.match(/⚡ answered (@?[\w:.…-]+)/) || [])[1];
  const bar = `${C.dim('folklore')} ${C.purple('claude code')}   ${C.yellow('🏅 ' + rep + ' rep')} ${C.dim('·')} helped ${C.green(helped)} ${helped === '1' ? 'dev' : 'devs'}`;
  return who ? `${bar}   ${C.green('⚡ answered ' + who)}` : bar;
};

async function main() {
  console.clear();
  w();
  w(`  ${statusBar(0)}`);
  w(`  ${C.dim('─'.repeat(74))}`);
  w();
  await sleep(700);

  // you ask
  process.stdout.write(`  ${C.cyan('>')} `);
  const q = "how do I fix the tokio spawn Send + 'static error sharing an Rc across await?";
  for (const ch of q) { process.stdout.write(ch); await sleep(15); }
  w(); w();
  await sleep(500);

  // agent reaches for the web
  w(`  ${C.green('⏺')} I'll look this up.`);
  await sleep(500);
  w(`  ${C.gray('⎿')}  ${C.yellow('WebSearch')}${C.dim('(query: "tokio spawn Send static Rc across await")')}`);
  await sleep(900);
  w();

  // folklore: two developers already solved this — no search needed
  if (denied) {
    const who = [...new Set(hits.map((h) => h.by).filter(Boolean))].map((h) => '@' + h);
    w(`  ${C.red('⛔ folklore')} ${C.dim('· no need to search — ')}${C.bold(who.length + ' developers')}${C.dim(' already solved this')}`);
    w(`  ${C.green('✓')} answered from ${who.map((h) => C.cyan(h)).join(C.dim(' and '))} ${C.gray('[signed ✓]')} ${C.dim('· 0 web · 0 tokens of re-inference')}`);
    for (const h of hits) {
      await sleep(450);
      w(`     ${C.green('•')} ${C.cyan('@' + h.by)} ${C.dim('worked this out:')} ${C.bold(h.label)}`);
      w(`       ${C.dim(trunc(h.text, 76))}`);
    }
  }
  w();
  await sleep(900);

  // agent answers from what those people already figured out
  w(`  ${C.green('⏺')} Use ${C.bold('Arc<Mutex<T>>')} for cross-thread shared state, or keep the task on`);
  w(`     one thread with ${C.bold('tokio::task::LocalSet + spawn_local')} (no Send bound).`);
  w(`     ${C.dim('Two people already spent the hours on this. You skipped the search entirely.')}`);
  w();
  await sleep(1100);

  // meanwhile: other developers are pulling YOUR work — your reputation climbs
  w(`  ${C.dim('── meanwhile, other developers are pulling what ')}${C.dim('you')}${C.dim(' worked out ──')}`);
  w();
  for (let n = 1; n <= 3; n++) {
    await sleep(950);
    w(`  ${statusBar(n)}`);
  }
  w();
  await sleep(700);
  w(`  ${C.gray('someone spent real hours on this once. now nobody in your circle repeats it —')}`);
  w(`  ${C.gray('and every developer you help builds your standing with real people. that is folklore.')}`);
  w();
  await sleep(1200);
}

main();
