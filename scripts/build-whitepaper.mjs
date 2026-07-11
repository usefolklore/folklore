#!/usr/bin/env node
/**
 * Build docs/whitepaper.html from docs/WHITEPAPER.md, reusing the styled shell
 * docs/whitepaper.template.html (STIX serif, MathJax, LaTeX-article CSS).
 * Re-run after editing the markdown so the rendered paper never drifts again.
 * The site whitepaper page is this exact standalone HTML.
 *
 *   npm i marked --no-save && node scripts/build-whitepaper.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const md = readFileSync(join(ROOT, 'docs', 'WHITEPAPER.md'), 'utf8');
const template = readFileSync(join(ROOT, 'docs', 'whitepaper.template.html'), 'utf8');

marked.setOptions({ gfm: true, breaks: false });

// Protect math spans so marked doesn't mangle TeX (underscores → <em>, etc.).
const math = [];
const protect = (s) => s
  .replace(/\$\$[\s\S]*?\$\$/g, (m) => (math.push(m), `@@MATH${math.length - 1}@@`))
  .replace(/\\\[[\s\S]*?\\\]/g, (m) => (math.push(m), `@@MATH${math.length - 1}@@`))
  .replace(/\\\([\s\S]*?\\\)/g, (m) => (math.push(m), `@@MATH${math.length - 1}@@`));
const restore = (s) => s.replace(/@@MATH(\d+)@@/g, (_, i) => math[+i]);

// Split the two leading rules: [title] --- [abstract] --- [body...]
const parts = md.split(/\n---\n/);
const titleRegion = parts[0].trim();
const abstractRegion = (parts[1] ?? '').trim();
const body = parts.slice(2).join('\n---\n');

// Title block.
const tlines = titleRegion.split('\n').map((l) => l.trim()).filter(Boolean);
const title = (tlines.find((l) => l.startsWith('# ')) ?? '# ').slice(2).trim();
const subs = tlines.filter((l) => !l.startsWith('# '));
const titleHtml =
  `<div class="titleblock"><h1>${marked.parseInline(title)}</h1>\n` +
  subs.map((s) => `<p>${marked.parseInline(s)}</p>`).join('\n') +
  '\n</div>';

// Abstract.
const absBody = abstractRegion.replace(/^##\s*Abstract\s*/i, '').trim();
const absHtml = `<div class="abstract"><h2>Abstract</h2>\n${marked.parse(absBody)}</div>`;

// Body (math-protected).
const bodyHtml = restore(marked.parse(protect(body)));

const head = template.split('<div class="paper">')[0] + '<div class="paper">\n';
const out = `${head}${titleHtml}\n<hr>\n${absHtml}\n<hr>\n${bodyHtml}\n</div>\n</body>\n</html>\n`;
writeFileSync(join(ROOT, 'docs', 'whitepaper.html'), out);
console.log(`built docs/whitepaper.html — ${out.length} bytes, ${math.length} math spans, body ${bodyHtml.length}b`);
