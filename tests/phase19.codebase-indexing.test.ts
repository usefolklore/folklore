/**
 * Phase 19 — Structured Codebase Indexing test suite.
 *
 * Covers CODE-01..08 + all 6 pitfalls from 19-RESEARCH.md + regression
 * guards for files that must NOT be modified in this phase.
 *
 * Run: npm test
 * Focused: node --import tsx --test tests/phase19.codebase-indexing.test.ts
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

import { CodebaseError, formatError } from '../src/domain/errors.js';
import {
  type CodebaseId,
  computeCodebaseId,
  computeEdgeId,
  computeNodeId,
} from '../src/domain/codebase.js';
import {
  CODE_GRAPH_SCHEMA_VERSION,
  openCodeGraph,
} from '../src/infrastructure/code-graph.js';
import {
  detectLanguage,
  makeParserRegistry,
  parseFile,
} from '../src/infrastructure/tree-sitter-parser.js';
import {
  indexCodebase,
  reindexCodebase,
} from '../src/application/codebase-indexer.js';

const FIXTURE_ROOT = resolve(new URL('./fixtures/phase19', import.meta.url).pathname);

const makeTmp = (tag: string): string =>
  mkdtempSync(join(tmpdir(), `wi-p19-${tag}-`));

// ─────────────────────── Domain types ──────────────────────────────────────

describe('Phase 19 — Domain types (CODE-08)', () => {
  it('computeCodebaseId is deterministic and 16 hex chars', () => {
    const a = computeCodebaseId('/home/u/proj');
    const b = computeCodebaseId('/home/u/proj');
    const c = computeCodebaseId('/home/u/other');
    assert.strictEqual(a, b, 'same path must produce same id');
    assert.notStrictEqual(a, c, 'different paths must produce different ids');
    assert.match(a, /^[0-9a-f]{16}$/, 'id must be 16 hex chars');
  });

  it('computeNodeId is stable across calls with identical inputs', () => {
    const cb = computeCodebaseId('/x') as CodebaseId;
    const a = computeNodeId(cb, 'src/a.ts', 'function', 'foo', 10);
    const b = computeNodeId(cb, 'src/a.ts', 'function', 'foo', 10);
    const c = computeNodeId(cb, 'src/a.ts', 'function', 'foo', 11);
    assert.strictEqual(a, b, 'same inputs must produce same node id');
    assert.notStrictEqual(a, c, 'different line must change node id');
    assert.match(a, /^[0-9a-f]{32}$/, 'node id must be 32 hex chars');
  });

  it('computeEdgeId is stable and composed from (codebase, source, target, kind)', () => {
    const cb = computeCodebaseId('/x') as CodebaseId;
    const a = computeEdgeId(cb, 's1', 't1', 'calls');
    const b = computeEdgeId(cb, 's1', 't1', 'calls');
    const c = computeEdgeId(cb, 's1', 't1', 'contains');
    assert.strictEqual(a, b, 'same triple must produce same edge id');
    assert.notStrictEqual(a, c, 'different kind must change edge id');
    assert.match(a, /^[0-9a-f]{32}$/, 'edge id must be 32 hex chars');
  });
});

// ─────────────────────── CodebaseError (error union) ───────────────────────

describe('Phase 19 — CodebaseError (error union)', () => {
  it('has 8 constructor helpers on the CodebaseError namespace', () => {
    assert.equal(typeof CodebaseError.dbOpenError, 'function', 'dbOpenError missing');
    assert.equal(typeof CodebaseError.dbReadError, 'function', 'dbReadError missing');
    assert.equal(typeof CodebaseError.dbWriteError, 'function', 'dbWriteError missing');
    assert.equal(typeof CodebaseError.grammarMissingError, 'function', 'grammarMissingError missing');
    assert.equal(typeof CodebaseError.parseError, 'function', 'parseError missing');
    assert.equal(typeof CodebaseError.notFound, 'function', 'notFound missing');
    assert.equal(typeof CodebaseError.attachFailed, 'function', 'attachFailed missing');
    assert.equal(typeof CodebaseError.invalidPath, 'function', 'invalidPath missing');
  });

  it('formatError renders every CodebaseError variant without throwing', () => {
    const cases = [
      CodebaseError.dbOpenError('/x/db', 'corrupt'),
      CodebaseError.dbReadError('row missing'),
      CodebaseError.dbWriteError('code_nodes', 'disk full'),
      CodebaseError.grammarMissingError('python', 'not installed'),
      CodebaseError.parseError('x.ts', 'unexpected token'),
      CodebaseError.notFound('abc123'),
      CodebaseError.attachFailed('cb1', 'room1', 'dup'),
      CodebaseError.invalidPath('/nope', 'ENOENT'),
    ];
    for (const e of cases) {
      const s = formatError(e);
      assert.equal(typeof s, 'string', `formatError returned non-string for ${e.type}`);
      assert.ok(s.length > 0, `formatError returned empty string for ${e.type}`);
    }
  });
});

// ─────────────────────── SQLite schema v1 ──────────────────────────────────

describe('Phase 19 — code-graph.db schema v1 (CODE-04)', () => {
  let tmpHome: string;
  before(() => { tmpHome = makeTmp('schema'); });
  after(() => { rmSync(tmpHome, { recursive: true, force: true }); });

  it('CODE_GRAPH_SCHEMA_VERSION exported as 1', () => {
    assert.strictEqual(CODE_GRAPH_SCHEMA_VERSION, 1);
  });

  it('openCodeGraph creates all 4 tables and sets user_version=1 (CODE-04)', async () => {
    const dbPath = join(tmpHome, 'code-graph.db');
    const res = await openCodeGraph({ path: dbPath });
    assert.ok(res.isOk(), `openCodeGraph failed: ${res.isErr() ? res.error.type : ''}`);
    const repo = res._unsafeUnwrap();
    try {
      const list = await repo.listCodebases();
      assert.ok(list.isOk(), 'listCodebases should succeed on fresh db');
      assert.deepEqual(list._unsafeUnwrap(), [], 'fresh db should have no codebases');
    } finally {
      repo.close();
    }
    // Reopen — migration must be idempotent
    const res2 = await openCodeGraph({ path: dbPath });
    assert.ok(res2.isOk(), 'second open failed — migration not idempotent');
    res2._unsafeUnwrap().close();
  });

  it('writes to code-graph.db, not to graph.json (CODE-04 boundary)', async () => {
    const dbPath = join(tmpHome, 'graph-boundary.db');
    const res = await openCodeGraph({ path: dbPath });
    const repo = res._unsafeUnwrap();
    try {
      const id = computeCodebaseId('/boundary/check') as CodebaseId;
      const up = await repo.upsertCodebase({
        id,
        name: 'boundary',
        root_path: '/boundary/check',
        language_summary: 'typescript:1',
        indexed_at: new Date().toISOString(),
        node_count: 0,
        root_sha: 'deadbeef',
      });
      assert.ok(up.isOk(), 'upsertCodebase should succeed');
      assert.ok(statSync(dbPath).isFile(), 'code-graph.db file should exist');
    } finally {
      repo.close();
    }
  });
});

// ─────────────────────── ParserRegistry instance reuse (pitfall 1) ─────────

describe('Phase 19 — ParserRegistry instance reuse (pitfall 1)', () => {
  it('returns the SAME Parser object on repeated getParser calls for typescript', () => {
    const reg = makeParserRegistry();
    const a = reg.getParser('typescript');
    const b = reg.getParser('typescript');
    assert.ok(a.isOk() && b.isOk(), `load failed: ${a.isErr() ? a.error.type : ''} ${b.isErr() ? b.error.type : ''}`);
    assert.strictEqual(
      a._unsafeUnwrap(),
      b._unsafeUnwrap(),
      'parser instance must be reused (pitfall 1 — parser creation costs ~50ms)',
    );
  });

  it('loads python grammar lazily and caches it on repeated calls', () => {
    const reg = makeParserRegistry();
    const a = reg.getParser('python');
    const b = reg.getParser('python');
    assert.ok(a.isOk() && b.isOk(), `python load failed: ${a.isErr() ? a.error.type : ''}`);
    assert.strictEqual(
      a._unsafeUnwrap(),
      b._unsafeUnwrap(),
      'python parser must be cached on second call',
    );
  });

  it('two separate registries do NOT share parser instances', () => {
    const reg1 = makeParserRegistry();
    const reg2 = makeParserRegistry();
    const a = reg1.getParser('typescript')._unsafeUnwrap();
    const b = reg2.getParser('typescript')._unsafeUnwrap();
    // Different registry instances have separate caches — instances differ
    assert.notStrictEqual(a, b, 'different registries must use independent caches');
  });
});

// ─────────────────────── Language detection ────────────────────────────────

describe('Phase 19 — detectLanguage extension map', () => {
  it('maps TypeScript/JavaScript extensions correctly', () => {
    assert.strictEqual(detectLanguage('/x/a.ts'), 'typescript');
    assert.strictEqual(detectLanguage('/x/a.tsx'), 'typescript');
    assert.strictEqual(detectLanguage('/x/a.mts'), 'typescript');
    assert.strictEqual(detectLanguage('/x/a.cts'), 'typescript');
    assert.strictEqual(detectLanguage('/x/a.js'), 'javascript');
    assert.strictEqual(detectLanguage('/x/a.jsx'), 'javascript');
    assert.strictEqual(detectLanguage('/x/a.mjs'), 'javascript');
    assert.strictEqual(detectLanguage('/x/a.cjs'), 'javascript');
  });

  it('maps Python extension and returns null for unsupported types', () => {
    assert.strictEqual(detectLanguage('/x/a.py'), 'python');
    assert.strictEqual(detectLanguage('/x/readme.md'), null);
    assert.strictEqual(detectLanguage('/x/a.rs'), null, 'Rust deferred to Phase 20');
    assert.strictEqual(detectLanguage('/x/a.go'), null, 'Go deferred to Phase 20');
  });
});

// ─────────────────────── parseFile — TypeScript (CODE-01, CODE-08) ─────────

describe('Phase 19 — parseFile TypeScript (CODE-01, CODE-08)', () => {
  const reg = makeParserRegistry();
  const cb = computeCodebaseId('/fx') as CodebaseId;

  it('extracts class, interface, type_alias, functions, method from sample.ts (CODE-01)', () => {
    const abs = join(FIXTURE_ROOT, 'sample.ts');
    const bytes = readFileSync(abs);
    const res = parseFile(reg, abs, FIXTURE_ROOT, cb, bytes);
    assert.ok(res.isOk(), res.isErr() ? res.error.type : '');
    const out = res._unsafeUnwrap();
    const kinds = new Set(out.nodes.map((n) => n.kind));
    assert.ok(kinds.has('file'), 'expected file node');
    assert.ok(kinds.has('class'), 'expected class node (Greeter)');
    assert.ok(kinds.has('interface'), 'expected interface node (Person)');
    assert.ok(kinds.has('type_alias'), 'expected type_alias node (Greeting)');
    assert.ok(kinds.has('function'), 'expected function node (makeGreeter / loudGreet)');
    assert.ok(kinds.has('method'), 'expected method node (greet)');
  });

  it('populates start_line, start_col, end_line, end_col on every node', () => {
    const abs = join(FIXTURE_ROOT, 'sample.ts');
    const bytes = readFileSync(abs);
    const out = parseFile(reg, abs, FIXTURE_ROOT, cb, bytes)._unsafeUnwrap();
    const named = out.nodes.filter((n) => n.kind !== 'file');
    assert.ok(named.length > 0, 'should have non-file nodes');
    for (const n of named) {
      assert.ok(n.start_line >= 1, `start_line ${n.start_line} should be >= 1`);
      assert.ok(n.end_line >= n.start_line, `end_line ${n.end_line} should be >= start_line ${n.start_line}`);
      assert.ok(typeof n.start_col === 'number', 'start_col must be a number');
      assert.ok(typeof n.end_col === 'number', 'end_col must be a number');
    }
  });

  it('stamps the same content_hash on every node in a file (pitfall 5)', () => {
    const abs = join(FIXTURE_ROOT, 'sample.ts');
    const bytes = readFileSync(abs);
    const out = parseFile(reg, abs, FIXTURE_ROOT, cb, bytes)._unsafeUnwrap();
    const hashes = new Set(out.nodes.map((n) => n.content_hash));
    assert.strictEqual(hashes.size, 1, 'all nodes in one file must share one content_hash (pitfall 5)');
    const expected = createHash('sha256').update(bytes).digest('hex');
    assert.strictEqual([...hashes][0], expected, 'content_hash must be sha256 of file bytes');
  });

  it('emits contains edges from file -> class and class -> method', () => {
    const abs = join(FIXTURE_ROOT, 'sample.ts');
    const bytes = readFileSync(abs);
    const out = parseFile(reg, abs, FIXTURE_ROOT, cb, bytes)._unsafeUnwrap();
    const containsEdges = out.edges.filter((e) => e.kind === 'contains');
    assert.ok(
      containsEdges.length >= 5,
      `expected at least 5 contains edges, got ${containsEdges.length}`,
    );
  });

  it('emits function signatures as JSON in signature_json', () => {
    const abs = join(FIXTURE_ROOT, 'sample.ts');
    const bytes = readFileSync(abs);
    const out = parseFile(reg, abs, FIXTURE_ROOT, cb, bytes)._unsafeUnwrap();
    const functions = out.nodes.filter((n) => n.kind === 'function');
    assert.ok(functions.length >= 2, 'expected at least 2 function nodes');
    const withSig = functions.filter((f) => typeof f.signature_json === 'string');
    assert.ok(withSig.length >= 1, 'at least one function should have signature_json');
    for (const f of withSig) {
      const parsed = JSON.parse(f.signature_json!) as { params: unknown };
      assert.ok('params' in parsed, 'signature_json must have params field');
    }
  });
});

// ─────────────────────── parseFile — Python (CODE-03) ──────────────────────

describe('Phase 19 — parseFile Python (CODE-03)', () => {
  const reg = makeParserRegistry();
  const cb = computeCodebaseId('/fx') as CodebaseId;

  it('extracts function_definition, class_definition, import_statement from sample.py', () => {
    const abs = join(FIXTURE_ROOT, 'sample.py');
    const bytes = readFileSync(abs);
    const res = parseFile(reg, abs, FIXTURE_ROOT, cb, bytes);
    assert.ok(res.isOk(), res.isErr() ? res.error.type : '');
    const out = res._unsafeUnwrap();
    const kinds = new Set(out.nodes.map((n) => n.kind));
    assert.ok(kinds.has('file'), 'expected file node');
    assert.ok(kinds.has('function'), 'expected function node from greet()');
    assert.ok(kinds.has('class'), 'expected class node from Greeter');
    assert.ok(kinds.has('import'), 'expected import node from `import os`');
  });

  it('emits Python nodes with language=python', () => {
    const abs = join(FIXTURE_ROOT, 'sample.py');
    const bytes = readFileSync(abs);
    const out = parseFile(reg, abs, FIXTURE_ROOT, cb, bytes)._unsafeUnwrap();
    assert.ok(
      out.nodes.every((n) => n.language === 'python'),
      'all nodes in a .py file must have language=python',
    );
    assert.ok(out.nodes.length >= 4, 'expected at least 4 nodes from sample.py');
  });
});

// ─────────────────────── Two-pass call graph (CODE-02, pitfall 4) ──────────

describe('Phase 19 — Two-pass call graph (CODE-02, pitfall 4)', () => {
  let tmpHome: string;
  before(() => { tmpHome = makeTmp('calls'); });
  after(() => { rmSync(tmpHome, { recursive: true, force: true }); });

  it('resolves cross-file calls across caller.ts + callee.ts with confidence level', async () => {
    const root = join(tmpHome, 'proj');
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'caller.ts'), readFileSync(join(FIXTURE_ROOT, 'caller.ts')));
    writeFileSync(join(root, 'callee.ts'), readFileSync(join(FIXTURE_ROOT, 'callee.ts')));

    const repo = (await openCodeGraph({ path: join(tmpHome, 'cg.db') }))._unsafeUnwrap();
    try {
      const registry = makeParserRegistry();
      const report = await indexCodebase({ repo, registry })({ absPath: root, name: 'calls' });
      assert.ok(report.isOk(), report.isErr() ? report.error.type : '');
      const r = report._unsafeUnwrap();
      const totalCalls =
        r.call_confidence.exact + r.call_confidence.heuristic + r.call_confidence.unresolved;
      assert.ok(totalCalls > 0, 'expected at least one call edge');
      assert.ok('exact' in r.call_confidence, 'call_confidence must have exact key');
      assert.ok('heuristic' in r.call_confidence, 'call_confidence must have heuristic key');
      assert.ok('unresolved' in r.call_confidence, 'call_confidence must have unresolved key');
    } finally {
      repo.close();
    }
  });

  it('compute() callee declared exactly once → exact confidence (pitfall 4 two-pass)', async () => {
    const root = join(tmpHome, 'proj2');
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'caller.ts'), readFileSync(join(FIXTURE_ROOT, 'caller.ts')));
    writeFileSync(join(root, 'callee.ts'), readFileSync(join(FIXTURE_ROOT, 'callee.ts')));

    const repo = (await openCodeGraph({ path: join(tmpHome, 'cg2.db') }))._unsafeUnwrap();
    try {
      const registry = makeParserRegistry();
      const report = (
        await indexCodebase({ repo, registry })({ absPath: root, name: 'exact' })
      )._unsafeUnwrap();
      assert.ok(
        report.call_confidence.exact >= 1,
        `expected exact ≥ 1 got ${report.call_confidence.exact}`,
      );
      assert.ok(report.node_count > 0, 'must have nodes');
      assert.ok(report.edge_count > 0, 'must have edges');
    } finally {
      repo.close();
    }
  });

  it('nameToNodes built AFTER all files scanned — callee can be declared after caller (pitfall 4)', async () => {
    // Write callee FIRST in directory listing, caller second.
    // On Linux/macOS readdir may return them in either order.
    // Two-pass must still resolve the call correctly.
    const root = join(tmpHome, 'proj3');
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'z_callee.ts'), readFileSync(join(FIXTURE_ROOT, 'callee.ts')));
    writeFileSync(join(root, 'a_caller.ts'), readFileSync(join(FIXTURE_ROOT, 'caller.ts')));

    const repo = (await openCodeGraph({ path: join(tmpHome, 'cg3.db') }))._unsafeUnwrap();
    try {
      const registry = makeParserRegistry();
      const report = (
        await indexCodebase({ repo, registry })({ absPath: root, name: 'order' })
      )._unsafeUnwrap();
      // Two-pass: regardless of parse order, compute() should be found as exact
      assert.ok(
        report.call_confidence.exact >= 1,
        `two-pass failed — expected exact ≥ 1 got ${report.call_confidence.exact}`,
      );
    } finally {
      repo.close();
    }
  });
});

// ─────────────────────── Incremental reindex (CODE-06, hash skip) ──────────

describe('Phase 19 — Incremental reindex (CODE-06, hash skip)', () => {
  let tmpHome: string;
  before(() => { tmpHome = makeTmp('reindex'); });
  after(() => { rmSync(tmpHome, { recursive: true, force: true }); });

  it('re-running index on unchanged files → unchanged_files === indexed_files of first run', async () => {
    const root = join(tmpHome, 'proj');
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'sample.ts'), readFileSync(join(FIXTURE_ROOT, 'sample.ts')));

    const repo = (await openCodeGraph({ path: join(tmpHome, 'cg.db') }))._unsafeUnwrap();
    try {
      const registry = makeParserRegistry();
      const first = (
        await indexCodebase({ repo, registry })({ absPath: root, name: 'r1' })
      )._unsafeUnwrap();
      assert.ok(first.indexed_files >= 1, 'first run must index at least 1 file');
      assert.strictEqual(first.unchanged_files, 0, 'no files should be unchanged on first run');

      const id = first.codebase_id;
      const second = (await reindexCodebase({ repo, registry })(id))._unsafeUnwrap();
      assert.strictEqual(
        second.unchanged_files,
        first.indexed_files,
        'reindex must skip all unchanged files (CODE-06)',
      );
      assert.strictEqual(
        second.indexed_files,
        0,
        'reindex must parse zero files when nothing changed',
      );
    } finally {
      repo.close();
    }
  });

  it('reindex after editing a file re-parses ONLY the changed file', async () => {
    const root = join(tmpHome, 'proj2');
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'a.ts'), 'export const A = 1;');
    writeFileSync(join(root, 'b.ts'), 'export const B = 2;');

    const repo = (await openCodeGraph({ path: join(tmpHome, 'cg2.db') }))._unsafeUnwrap();
    try {
      const registry = makeParserRegistry();
      const first = (
        await indexCodebase({ repo, registry })({ absPath: root, name: 'r2' })
      )._unsafeUnwrap();
      assert.strictEqual(first.indexed_files, 2, 'first run must index both files');

      writeFileSync(join(root, 'a.ts'), 'export const A = 99;');

      const second = (await reindexCodebase({ repo, registry })(first.codebase_id))._unsafeUnwrap();
      assert.strictEqual(second.indexed_files, 1, 'only a.ts should be re-parsed');
      assert.strictEqual(second.unchanged_files, 1, 'b.ts should be counted as unchanged');
    } finally {
      repo.close();
    }
  });
});

// ─────────────────────── Codebase attachment M:N (CODE-03, CODE-05) ────────

describe('Phase 19 — Codebase attachment M:N (CODE-03, CODE-05)', () => {
  let tmpHome: string;
  before(() => { tmpHome = makeTmp('attach'); });
  after(() => { rmSync(tmpHome, { recursive: true, force: true }); });

  it('attachToRoom + detachFromRoom round-trip (CODE-05)', async () => {
    const repo = (await openCodeGraph({ path: join(tmpHome, 'cg.db') }))._unsafeUnwrap();
    try {
      const id = computeCodebaseId('/att/test') as CodebaseId;
      await repo.upsertCodebase({
        id,
        name: 'att',
        root_path: '/att/test',
        language_summary: 'typescript:1',
        indexed_at: new Date().toISOString(),
        node_count: 0,
        root_sha: 'deadbeef',
      });

      const a1 = await repo.attachToRoom(id, 'homelab');
      assert.ok(a1.isOk(), 'attach should succeed');
      const rooms = (await repo.getRoomsForCodebase(id))._unsafeUnwrap();
      assert.deepStrictEqual(rooms, ['homelab'], 'attached room must appear');

      // Attach a second room — M:N
      await repo.attachToRoom(id, 'research');
      const rooms2 = (await repo.getRoomsForCodebase(id))._unsafeUnwrap();
      assert.strictEqual(rooms2.length, 2, 'must have 2 rooms after second attach');
      assert.ok(rooms2.includes('homelab'), 'homelab must be present');
      assert.ok(rooms2.includes('research'), 'research must be present');

      // Detach one — codebase stays (non-destructive)
      await repo.detachFromRoom(id, 'homelab');
      const rooms3 = (await repo.getRoomsForCodebase(id))._unsafeUnwrap();
      assert.deepStrictEqual(rooms3, ['research'], 'only research should remain');

      const cb = await repo.getCodebase(id);
      assert.ok(cb.isOk());
      assert.notStrictEqual(cb._unsafeUnwrap(), null, 'codebase must still exist after detach');
    } finally {
      repo.close();
    }
  });

  it('getCodebasesForRoom returns all codebases attached to a room', async () => {
    const repo = (await openCodeGraph({ path: join(tmpHome, 'cg2.db') }))._unsafeUnwrap();
    try {
      const idA = computeCodebaseId('/a') as CodebaseId;
      const idB = computeCodebaseId('/b') as CodebaseId;
      await repo.upsertCodebase({
        id: idA, name: 'A', root_path: '/a',
        language_summary: 'ts:1', indexed_at: 'now', node_count: 0, root_sha: 'x',
      });
      await repo.upsertCodebase({
        id: idB, name: 'B', root_path: '/b',
        language_summary: 'py:1', indexed_at: 'now', node_count: 0, root_sha: 'y',
      });
      await repo.attachToRoom(idA, 'homelab');
      await repo.attachToRoom(idB, 'homelab');
      const list = (await repo.getCodebasesForRoom('homelab'))._unsafeUnwrap();
      assert.strictEqual(list.length, 2, 'both codebases must be returned for the room');
    } finally {
      repo.close();
    }
  });

  it('deleteCodebase cascades to nodes/edges/attachments (ON DELETE CASCADE)', async () => {
    const repo = (await openCodeGraph({ path: join(tmpHome, 'cg3.db') }))._unsafeUnwrap();
    try {
      const id = computeCodebaseId('/del') as CodebaseId;
      await repo.upsertCodebase({
        id, name: 'del', root_path: '/del',
        language_summary: 'ts:1', indexed_at: 'now', node_count: 0, root_sha: 'z',
      });
      await repo.attachToRoom(id, 'scratch');
      await repo.upsertNodes([{
        id: 'nx',
        codebase_id: id,
        kind: 'file',
        name: 'f.ts',
        file_path: 'f.ts',
        start_line: 1,
        start_col: 0,
        end_line: 1,
        end_col: 0,
        language: 'typescript',
        content_hash: 'h',
      }]);
      const del = await repo.deleteCodebase(id);
      assert.ok(del.isOk(), 'deleteCodebase should succeed');
      const rooms = (await repo.getRoomsForCodebase(id))._unsafeUnwrap();
      assert.deepStrictEqual(rooms, [], 'room attachments must be cascaded');
      const search = (await repo.searchNodes({ codebase_id: id }))._unsafeUnwrap();
      assert.deepStrictEqual(search, [], 'nodes must be cascaded');
    } finally {
      repo.close();
    }
  });
});

// ─────────────────────── Design pattern detection ──────────────────────────

describe('Phase 19 — Trivial design pattern detection (extra_json)', () => {
  const reg = makeParserRegistry();
  const cb = computeCodebaseId('/p') as CodebaseId;

  it('detects Factory / Singleton / Observer / Builder / Adapter via class name + getInstance heuristic', () => {
    const abs = join(FIXTURE_ROOT, 'patterns.ts');
    const bytes = readFileSync(abs);
    const out = parseFile(reg, abs, FIXTURE_ROOT, cb, bytes)._unsafeUnwrap();
    const classes = out.nodes.filter((n) => n.kind === 'class');
    const patterns = new Set<string>();
    for (const c of classes) {
      if (c.extra_json) {
        const parsed = JSON.parse(c.extra_json) as { pattern?: string };
        if (parsed.pattern) patterns.add(parsed.pattern);
      }
    }
    assert.ok(patterns.has('Factory'), `missing Factory. got: ${[...patterns].join(',')}`);
    assert.ok(
      patterns.has('Singleton'),
      `missing Singleton (getInstance heuristic). got: ${[...patterns].join(',')}`,
    );
    assert.ok(patterns.has('Observer'), `missing Observer. got: ${[...patterns].join(',')}`);
    assert.ok(patterns.has('Builder'), `missing Builder. got: ${[...patterns].join(',')}`);
    assert.ok(patterns.has('Adapter'), `missing Adapter. got: ${[...patterns].join(',')}`);
  });
});

// ─────────────────────── Codebase search (CODE-07) ─────────────────────────

describe('Phase 19 — codebase search (CODE-07)', () => {
  let tmpHome: string;
  before(() => { tmpHome = makeTmp('search'); });
  after(() => { rmSync(tmpHome, { recursive: true, force: true }); });

  it('returns nodes matching a name LIKE pattern and supports kind filter', async () => {
    const root = join(tmpHome, 'proj');
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'sample.ts'), readFileSync(join(FIXTURE_ROOT, 'sample.ts')));
    const repo = (await openCodeGraph({ path: join(tmpHome, 'cg.db') }))._unsafeUnwrap();
    try {
      const registry = makeParserRegistry();
      const r = (
        await indexCodebase({ repo, registry })({ absPath: root, name: 'srch' })
      )._unsafeUnwrap();

      const hits = (
        await repo.searchNodes({ codebase_id: r.codebase_id, name_pattern: '%Greeter%' })
      )._unsafeUnwrap();
      assert.ok(hits.length >= 1, 'LIKE search for Greeter must return at least 1 result');
      assert.ok(hits.some((n) => n.name === 'Greeter'), 'Greeter class must be in results');

      const onlyClasses = (
        await repo.searchNodes({ codebase_id: r.codebase_id, kind: 'class' })
      )._unsafeUnwrap();
      assert.ok(onlyClasses.every((n) => n.kind === 'class'), 'kind filter must exclude other kinds');
      assert.ok(onlyClasses.length >= 1, 'must return at least 1 class node');
    } finally {
      repo.close();
    }
  });

  it('searchNodes returns file_path, start_line, start_col on every result (CODE-07)', async () => {
    const root = join(tmpHome, 'proj2');
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'sample.ts'), readFileSync(join(FIXTURE_ROOT, 'sample.ts')));
    const repo = (await openCodeGraph({ path: join(tmpHome, 'cg2.db') }))._unsafeUnwrap();
    try {
      const registry = makeParserRegistry();
      const r = (
        await indexCodebase({ repo, registry })({ absPath: root, name: 'srch2' })
      )._unsafeUnwrap();
      const nodes = (await repo.searchNodes({ codebase_id: r.codebase_id }))._unsafeUnwrap();
      assert.ok(nodes.length > 0, 'must have nodes to check');
      for (const n of nodes) {
        assert.ok(typeof n.file_path === 'string' && n.file_path.length > 0, 'file_path required');
        assert.ok(typeof n.start_line === 'number' && n.start_line >= 1, 'start_line must be ≥ 1');
        assert.ok(typeof n.start_col === 'number', 'start_col must be present');
      }
    } finally {
      repo.close();
    }
  });
});

// ─────────────────────── Full index smoke (CODE-01..08 end-to-end) ──────────

describe('Phase 19 — Full index smoke test (CODE-01..08 end-to-end)', () => {
  let tmpHome: string;
  before(() => { tmpHome = makeTmp('smoke'); });
  after(() => { rmSync(tmpHome, { recursive: true, force: true }); });

  it('indexing all phase-19 fixtures produces nodes in every expected kind bucket', async () => {
    const root = join(tmpHome, 'proj');
    mkdirSync(root, { recursive: true });
    for (const f of ['sample.ts', 'caller.ts', 'callee.ts', 'patterns.ts', 'sample.py']) {
      writeFileSync(join(root, f), readFileSync(join(FIXTURE_ROOT, f)));
    }

    const repo = (await openCodeGraph({ path: join(tmpHome, 'cg.db') }))._unsafeUnwrap();
    try {
      const registry = makeParserRegistry();
      const report = (
        await indexCodebase({ repo, registry })({ absPath: root, name: 'smoke' })
      )._unsafeUnwrap();

      assert.ok(report.indexed_files >= 5, 'must index at least 5 files');
      assert.ok(report.node_count > 0, 'must produce nodes');
      assert.ok(report.edge_count > 0, 'must produce edges');
      assert.ok(
        report.by_kind['class'] >= 6,
        `expected ≥6 class nodes (Greeter + 5 patterns), got ${report.by_kind['class']}`,
      );
      assert.ok(report.by_kind['function'] >= 3, 'expected ≥3 function nodes');
      assert.ok(report.by_language['typescript'] >= 1, 'must track typescript file count');
      assert.ok(report.by_language['python'] >= 1, 'must track python file count');

      const cb = (await repo.getCodebase(report.codebase_id))._unsafeUnwrap();
      assert.notStrictEqual(cb, null, 'Codebase record must exist after indexing (CODE-01)');
      assert.strictEqual(cb!.node_count, report.node_count, 'node_count in DB must match report');
      assert.ok(cb!.language_summary.length > 0, 'language_summary must be populated');
    } finally {
      repo.close();
    }
  });
});

// ─────────────────────── Regression guards ─────────────────────────────────

describe('Phase 19 — Regression guards (files NOT modified by Phase 19)', () => {
  it('src/infrastructure/sources/codebase.ts (shallow indexer) must not import tree-sitter or code-graph.db', () => {
    const src = readFileSync('src/infrastructure/sources/codebase.ts', 'utf8');
    assert.ok(!src.includes('tree-sitter'), 'shallow indexer must not import tree-sitter (scope boundary)');
    assert.ok(!src.includes('code-graph.db'), 'shallow indexer must not reference code-graph.db (scope boundary)');
    assert.ok(src.includes('codebaseSource'), 'shallow indexer must still export codebaseSource');
  });

  it('src/cli/commands/index-project.ts must not import Phase 19 code-graph or parser', () => {
    const src = readFileSync('src/cli/commands/index-project.ts', 'utf8');
    assert.ok(!src.includes('openCodeGraph'), 'index-project.ts must not import Phase 19 code-graph');
    assert.ok(!src.includes('tree-sitter-parser'), 'index-project.ts must not import Phase 19 parser');
  });

  it('MCP server registers ≥15 tools including code_graph_query (CODE-08)', () => {
    const src = readFileSync('src/mcp/server.ts', 'utf8');
    const matches = src.match(/server\.registerTool\(/g) ?? [];
    assert.ok(
      matches.length >= 15,
      `expected ≥15 registerTool calls, got ${matches.length}`,
    );
    assert.ok(src.includes("'code_graph_query'"), 'code_graph_query must be registered in MCP server');
  });

  it('tree-sitter deps pinned exactly (no ^ or ~) in package.json (pitfall 2 ABI guard)', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      dependencies: Record<string, string>;
    };
    // Actual shipped versions per 19-01-SUMMARY deviation (corrected from plan spec 0.25.0)
    assert.strictEqual(
      pkg.dependencies['tree-sitter'],
      '0.21.1',
      'tree-sitter must be pinned to 0.21.1 (corrected from 0.25.0 — TS grammar peer requirement)',
    );
    assert.strictEqual(
      pkg.dependencies['tree-sitter-typescript'],
      '0.23.2',
      'tree-sitter-typescript must be pinned to 0.23.2',
    );
    assert.strictEqual(
      pkg.dependencies['tree-sitter-python'],
      '0.23.4',
      'tree-sitter-python must be pinned to 0.23.4 (corrected from 0.25.0)',
    );
    assert.ok(
      !('tree-sitter-rust' in pkg.dependencies),
      'tree-sitter-rust must NOT be present in Phase 19 (Phase 20 scope)',
    );
    assert.ok(
      !('tree-sitter-go' in pkg.dependencies),
      'tree-sitter-go must NOT be present in Phase 19 (Phase 20 scope)',
    );
  });
});
