/**
 * Phase 26 — `github_user` write-time stamping + back-fill migrate.
 *
 * Locks the contract:
 *   indexNode stamps github_user from deps.githubUser() when present
 *   indexNode omits the field when deps.githubUser is undefined
 *   indexNode preserves a github_user already on cmd.node
 *   `migrate v5 --stamp-github` back-fills nodes missing the field
 *   `migrate v5 --stamp-github` preserves nodes that already carry one
 *   `migrate v5 --stamp-github` is idempotent on a fully-stamped graph
 *   `migrate v5 --stamp-github` exits 1 when no linked account exists
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { okAsync, errAsync, ResultAsync } from 'neverthrow';

import { indexNode, type UseCaseDeps } from '../src/application/use-cases.js';
import { empty as emptyGraph, type Graph, type GraphNode } from '../src/domain/graph.js';

// ─────────────── tmp home helpers ─────────

const tmpHome = (): string => mkdtempSync(join(tmpdir(), 'ak-ph26-'));

const writeLinkedAccount = (home: string, handle: string): void => {
  writeFileSync(
    join(home, 'linked-accounts.json'),
    JSON.stringify({
      version: 2,
      accounts: {
        github: {
          handle,
          user_id: '12345',
          profile_url: `https://github.com/${handle}`,
          email: `${handle}@example.com`,
          verified_at: '2026-05-27T00:00:00.000Z',
        },
      },
    }),
  );
};

// ─────────────── in-memory deps for indexNode ─────────

interface FakeDeps {
  readonly deps: UseCaseDeps;
  readonly current: () => Graph;
}

const buildFakeDeps = (
  initial: Graph,
  githubUser?: () => string | undefined,
): FakeDeps => {
  let g = initial;
  const upserted: GraphNode[] = [];
  const deps: UseCaseDeps = {
    graphs: {
      load: () => okAsync(g),
      save: (next) => { g = next; return okAsync(undefined); },
    } as UseCaseDeps['graphs'],
    vectors: {
      upsert: (_r) => okAsync(undefined),
      searchGlobal: () => errAsync({ type: 'VectorReadError', message: 'unused' } as never),
      // Only `upsert` is called by indexNode; the rest stay unimplemented.
    } as unknown as UseCaseDeps['vectors'],
    embedder: {
      dim: 3,
      embed: (_t: string) => okAsync(new Float32Array([1, 0, 0])),
      embedBatch: (_ts: readonly string[]) => okAsync([new Float32Array([1, 0, 0])]),
    } as UseCaseDeps['embedder'],
    githubUser,
  };
  void upserted;
  return { deps, current: () => g };
};

const sampleCommand = {
  node: {
    id: 'n1',
    label: 'sample',
    file_type: 'document' as const,
    source_file: 'akashik:test',
  } satisfies GraphNode,
  text: 'sample body',
};

// ─────────────── indexNode unit tests ─────────

test('phase-26: indexNode stamps github_user when deps.githubUser returns a handle', async () => {
  const { deps, current } = buildFakeDeps(emptyGraph(), () => 'SaharBarak');
  const r = await indexNode(deps)(sampleCommand);
  assert.ok(r.isOk(), 'indexNode should succeed');
  const n = current().json.nodes.find((x) => x.id === 'n1');
  assert.ok(n, 'node must be in graph');
  assert.equal((n as { github_user?: string }).github_user, 'SaharBarak');
});

test('phase-26: indexNode omits github_user when deps.githubUser is undefined', async () => {
  const { deps, current } = buildFakeDeps(emptyGraph()); // no githubUser dep
  const r = await indexNode(deps)(sampleCommand);
  assert.ok(r.isOk());
  const n = current().json.nodes.find((x) => x.id === 'n1');
  assert.ok(n);
  assert.equal((n as { github_user?: string }).github_user, undefined,
    'github_user must be absent when no lookup is provided');
});

test('phase-26: indexNode omits github_user when deps.githubUser returns undefined', async () => {
  const { deps, current } = buildFakeDeps(emptyGraph(), () => undefined);
  const r = await indexNode(deps)(sampleCommand);
  assert.ok(r.isOk());
  const n = current().json.nodes.find((x) => x.id === 'n1');
  assert.ok(n);
  assert.equal((n as { github_user?: string }).github_user, undefined);
});

test('phase-26: indexNode preserves a github_user already on cmd.node (peer-imported case)', async () => {
  const { deps, current } = buildFakeDeps(emptyGraph(), () => 'LocalUser');
  const r = await indexNode(deps)({
    ...sampleCommand,
    node: { ...sampleCommand.node, github_user: 'PeerAuthor' } as GraphNode,
  });
  assert.ok(r.isOk());
  const n = current().json.nodes.find((x) => x.id === 'n1');
  assert.equal((n as { github_user?: string }).github_user, 'PeerAuthor');
});

// ─────────────── migrate --stamp-github tests ─────────

const cliBin = join(process.cwd(), 'bin/akashik.js');

interface CliResult { code: number; stdout: string; stderr: string; }

const runMigrateStamp = (home: string): CliResult => {
  // The migrate command lives in dist after `npm run build`. If dist is
  // missing or stale the bin falls back to `npx tsx` on the source —
  // either way the same command implementation runs.
  try {
    const stdout = execFileSync(process.execPath, [cliBin, 'migrate', 'v5', '--stamp-github'], {
      env: {
        ...process.env,
        AKASHIK_HOME: home,
        AKASHIK_LEGACY_HOME: join(home, '_no_legacy'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    const err = e as { status?: number; stdout?: string | Buffer; stderr?: string | Buffer };
    const decode = (v: string | Buffer | undefined): string =>
      typeof v === 'string' ? v : v?.toString('utf8') ?? '';
    return { code: err.status ?? 1, stdout: decode(err.stdout), stderr: decode(err.stderr) };
  }
};

const writeGraph = (home: string, nodes: readonly Record<string, unknown>[]): void => {
  writeFileSync(join(home, 'graph.json'), JSON.stringify({
    directed: false, multigraph: false, graph: {},
    nodes, links: [],
  }));
};

test('phase-26: --stamp-github back-fills nodes missing the field', () => {
  const home = tmpHome();
  try {
    writeLinkedAccount(home, 'SaharBarak');
    writeGraph(home, [
      { id: 'a', label: 'A', file_type: 'document', source_file: '/a' },
      { id: 'b', label: 'B', file_type: 'document', source_file: '/b' },
    ]);

    const r = runMigrateStamp(home);
    assert.equal(r.code, 0, `migrate must succeed: ${r.stderr}`);

    const graph = JSON.parse(readFileSync(join(home, 'graph.json'), 'utf8'));
    for (const n of graph.nodes) {
      assert.equal(n.github_user, 'SaharBarak', `node ${n.id} must be stamped`);
    }
    assert.ok(existsSync(join(home, 'graph.pre-stamp-backup.json')),
      'stamp-github writes its own backup; must not clobber graph.v4-backup.json');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('phase-26: --stamp-github preserves nodes that already carry a github_user (peer-authored)', () => {
  const home = tmpHome();
  try {
    writeLinkedAccount(home, 'SaharBarak');
    writeGraph(home, [
      { id: 'mine', label: 'M', file_type: 'document', source_file: '/m' },
      { id: 'peer', label: 'P', file_type: 'document', source_file: '/p', github_user: 'OtherPerson' },
    ]);

    const r = runMigrateStamp(home);
    assert.equal(r.code, 0);

    const graph = JSON.parse(readFileSync(join(home, 'graph.json'), 'utf8'));
    const mine = graph.nodes.find((n: { id: string }) => n.id === 'mine');
    const peer = graph.nodes.find((n: { id: string }) => n.id === 'peer');
    assert.equal(mine.github_user, 'SaharBarak', 'unstamped node must get local handle');
    assert.equal(peer.github_user, 'OtherPerson', 'peer-authored node must NOT be overwritten');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('phase-26: --stamp-github is idempotent on a fully-stamped graph', () => {
  const home = tmpHome();
  try {
    writeLinkedAccount(home, 'SaharBarak');
    writeGraph(home, [
      { id: 'a', label: 'A', file_type: 'document', source_file: '/a', github_user: 'SaharBarak' },
    ]);

    const r = runMigrateStamp(home);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /Already stamped/i,
      `should report fully-stamped; got: ${r.stdout}`);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('phase-26: --stamp-github exits 1 when no linked account', () => {
  const home = tmpHome();
  try {
    // No linked-accounts.json written.
    writeGraph(home, [{ id: 'a', label: 'A', file_type: 'document', source_file: '/a' }]);

    const r = runMigrateStamp(home);
    assert.equal(r.code, 1, 'must refuse without a linked account');
    assert.match(r.stderr, /no linked github account/i,
      `should explain why; got: ${r.stderr}`);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
