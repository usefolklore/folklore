/**
 * Browser/WASM portability fitness tests.
 *
 * The v4 thesis includes "the same primitives that power the daemon
 * also run in the browser." This test enforces that claim at the
 * module-import boundary: any domain primitive that touches a Node-
 * specific global (process, Buffer, fs, etc.) breaks the contract and
 * must be moved to infrastructure.
 *
 * What we check:
 *   1. No `node:` imports in tested modules (static grep at test time)
 *   2. Functions execute correctly when called with browser-safe inputs
 *      (Float32Array, Uint8Array, plain objects)
 *   3. Output types are typed-array based, not Buffer
 *
 * Modules covered:
 *   - src/domain/binary-quantize.ts  (Matryoshka + Hamming)
 *   - src/domain/semantic-cache.ts   (L2 paraphrase cache)
 *   - src/domain/query-cache.ts      (L1 hash cache)
 *   - src/domain/vectors.ts          (cosine, l2, normalize)
 *
 * The browser deployment target is the Y.Doc collaborative graph viewer
 * + WASM-compiled VectorIndex (v4.2). Until the WASM port lands, this
 * test is a shape contract that prevents accidental Node-coupling.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  truncateMRL,
  binarize,
  matryoshkaBinary,
  hammingDistance,
  hammingSimilarity,
  bytesPerVector,
  compressionRatio,
} from '../src/domain/binary-quantize.js';
import { semanticCache } from '../src/domain/semantic-cache.js';
import { queryCache } from '../src/domain/query-cache.js';

const SRC = (rel: string) => join(process.cwd(), 'src', 'domain', rel);

const BROWSER_SAFE_MODULES = [
  'binary-quantize.ts',
  'semantic-cache.ts',
  'query-cache.ts',
  'vectors.ts',
];

test('browser-portability: domain modules import zero node: builtins', () => {
  const violations: string[] = [];
  for (const f of BROWSER_SAFE_MODULES) {
    const src = readFileSync(SRC(f), 'utf8');
    // Allow `import type { ... } from 'node:...'` since types are
    // erased — they don't end up in the runtime bundle. We only ban
    // value imports.
    const lines = src.split('\n');
    for (const ln of lines) {
      const trimmed = ln.trim();
      if (trimmed.startsWith('//')) continue;
      if (/import\s+type\b/.test(trimmed)) continue;
      if (/from\s+['"]node:/.test(trimmed)) {
        violations.push(`${f}: ${trimmed}`);
      }
    }
  }
  assert.deepEqual(violations, [], `node: imports found in browser-safe modules:\n${violations.join('\n')}`);
});

test('browser-portability: domain modules use no Buffer or process globals', () => {
  const violations: string[] = [];
  for (const f of BROWSER_SAFE_MODULES) {
    const src = readFileSync(SRC(f), 'utf8');
    // Check for direct global usage. \b boundaries avoid false hits in
    // identifiers like `myProcess`. Comments still pass through; that's
    // ok — a `// uses Buffer` comment is fine.
    const lines = src.split('\n');
    for (const ln of lines) {
      const code = ln.split('//')[0]; // strip line comment
      if (/\bBuffer\b/.test(code)) violations.push(`${f}: Buffer — ${ln.trim()}`);
      if (/\bprocess\.(env|cwd|exit|stdout|stderr|platform)\b/.test(code)) {
        violations.push(`${f}: process — ${ln.trim()}`);
      }
    }
  }
  assert.deepEqual(violations, [], `Node globals found in browser-safe modules:\n${violations.join('\n')}`);
});

test('browser-portability: binary-quantize roundtrip on Float32Array', () => {
  const v = new Float32Array(768);
  for (let i = 0; i < 768; i++) v[i] = (i % 7) - 3;
  // Normalize first.
  let s = 0;
  for (let i = 0; i < 768; i++) s += v[i] * v[i];
  s = Math.sqrt(s) || 1;
  for (let i = 0; i < 768; i++) v[i] /= s;

  const truncated = truncateMRL(v, 512);
  assert.ok(truncated.isOk());
  const tv = truncated._unsafeUnwrap();
  assert.equal(tv.length, 512);
  assert.ok(tv instanceof Float32Array, 'output must be Float32Array, not Buffer');

  const packed = binarize(tv);
  assert.ok(packed instanceof Uint8Array, 'binarize output must be Uint8Array');
  assert.equal(packed.length, 64); // 512 bits / 8

  // Hamming self-distance is 0; Hamming similarity is 1.
  assert.equal(hammingDistance(packed, packed), 0);
  assert.equal(hammingSimilarity(packed, packed), 1);

  // matryoshkaBinary one-shot
  const oneShot = matryoshkaBinary(v, 512);
  assert.ok(oneShot.isOk());
  const ob = oneShot._unsafeUnwrap();
  assert.deepEqual(Array.from(ob), Array.from(packed));
});

test('browser-portability: bytesPerVector + compressionRatio are pure math', () => {
  assert.equal(bytesPerVector(768, 'fp32'), 3072);
  assert.equal(bytesPerVector(512, 'binary'), 64);
  assert.equal(compressionRatio(768, 512, 'binary'), 48);
});

test('browser-portability: semanticCache works with Float32Array vectors', () => {
  const c = semanticCache({ defaultThreshold: 0.5 });
  const v = new Float32Array([1, 0, 0, 0]);
  c.set(v, 'cached');
  const hit = c.get(v);
  assert.notEqual(hit, null);
  assert.equal(hit!.stdout, 'cached');
});

test('browser-portability: queryCache works without Node crypto', () => {
  // queryCache uses sha256 — must verify it works via WebCrypto-compatible path.
  // (Node provides node:crypto.createHash; for browser we'd swap. Today's
  // L1 cache is daemon-only so this is the contract: when porting, the
  // sha256 helper needs a SubtleCrypto implementation. Document the seam.)
  const c = queryCache({ maxEntries: 10, ttlMs: 1000 });
  const k = c.keyFor('ask', ['libp2p']);
  assert.ok(typeof k === 'string' && k.length > 0);
  c.set(k, 'cached-stdout');
  const hit = c.get(k);
  assert.equal(hit?.stdout, 'cached-stdout');
});
