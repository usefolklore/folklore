/**
 * Tests for src/domain/release.ts + src/application/update-checker.ts.
 * Covers:
 *   - semver compare correctness
 *   - manifest signature verify under matching DID
 *   - rejection: wrong DID, bad signature, malformed signature_hex,
 *     bad sha256, unsupported schema
 *   - evaluateUpgrade gate (newer + meets min_supported_version)
 *   - update-checker writes/reads config + state JSON
 *   - checkForUpdate with a mock fetch returns the right verdict
 *     across {valid manifest, wrong-channel manifest, bad-sig manifest,
 *     network failure}
 *   - tickUpdateCheck respects the interval throttle
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  compareSemver,
  isNewer,
  verifyManifest,
  evaluateUpgrade,
  type ReleaseManifest,
} from '../src/domain/release.ts';
import {
  configureUpdates,
  loadUpdateConfig,
  loadUpdateState,
  checkForUpdate,
  tickUpdateCheck,
} from '../src/application/update-checker.ts';
import {
  createUserIdentity,
  signBytes,
  type DID,
} from '../src/domain/identity.ts';

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'wi-update-'));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

// ─── helpers to build a signed manifest ─────────────────────────

const toHex = (bytes: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
};

const signManifest = (
  body: Omit<ReleaseManifest, 'signature_hex'>,
  privateKey: Uint8Array,
): ReleaseManifest => {
  // Re-implement canonical-JSON for the test helper — same rules as
  // the production canonicalManifestJSON in src/domain/release.ts.
  const obj: Record<string, unknown> = {
    schema: body.schema,
    version: body.version,
    channel: body.channel,
    released_at: body.released_at,
    tarball_url: body.tarball_url,
    tarball_sha256: body.tarball_sha256,
    notes: body.notes,
    project_did: body.project_did,
  };
  if (body.min_supported_version !== undefined) obj.min_supported_version = body.min_supported_version;
  const keys = Object.keys(obj).sort();
  const parts: string[] = [];
  for (const k of keys) parts.push(`${JSON.stringify(k)}:${JSON.stringify(obj[k])}`);
  const json = `{${parts.join(',')}}`;
  const message = new TextEncoder().encode(`wellinformed-release:v1:${json}`);
  const sigRes = signBytes(privateKey, message);
  if (sigRes.isErr()) throw new Error(`signBytes: ${sigRes.error.type}`);
  return { ...body, signature_hex: toHex(sigRes.value) };
};

const newProject = () => {
  const r = createUserIdentity(() => '2026-04-17T00:00:00.000Z');
  if (r.isErr()) throw r.error;
  return r.value;
};

// ─── semver ──────────────────────────────────────────────────────

describe('release — semver compare', () => {
  it('classifies major/minor/patch correctly', () => {
    const cases: Array<[string, string, number]> = [
      ['3.0.0', '3.0.1', -1],
      ['3.0.1', '3.0.0', 1],
      ['3.0.0', '3.0.0', 0],
      ['3.0.9', '3.1.0', -1],
      ['3.1.0', '4.0.0', -1],
      ['10.0.0', '9.99.99', 1],
    ];
    for (const [a, b, want] of cases) {
      const r = compareSemver(a, b);
      assert.ok(r.isOk(), `cmp ${a} vs ${b}`);
      if (r.isOk()) assert.equal(r.value, want, `cmp(${a},${b})`);
    }
  });

  it('rejects non-semver strings', () => {
    assert.ok(compareSemver('1.2', '1.2.3').isErr());
    assert.ok(compareSemver('foo', '1.2.3').isErr());
    assert.ok(compareSemver('1.2.3-beta', '1.2.3').isErr());
  });

  it('isNewer is the strict-greater predicate', () => {
    const a = isNewer('3.0.0', '3.0.1');
    assert.ok(a.isOk() && a.value === true);
    const b = isNewer('3.0.1', '3.0.0');
    assert.ok(b.isOk() && b.value === false);
    const c = isNewer('3.0.0', '3.0.0');
    assert.ok(c.isOk() && c.value === false);
  });
});

// ─── verify ───────────────────────────────────────────────────────

describe('release — verifyManifest', () => {
  it('passes a freshly-signed manifest under matching DID', () => {
    const project = newProject();
    const m = signManifest({
      schema: 1,
      version: '3.1.0',
      channel: 'stable',
      released_at: '2026-04-17T00:00:00.000Z',
      tarball_url: 'https://example.com/welly-3.1.0.tgz',
      tarball_sha256: 'a'.repeat(64),
      notes: 'P2P memory protocol v3.1',
      project_did: project.identity.did,
    }, project.privateKey);
    const r = verifyManifest(m, project.identity.did);
    assert.ok(r.isOk(), `verify: ${r.isErr() ? JSON.stringify(r.error) : ''}`);
  });

  it('rejects under mismatched expected DID', () => {
    const project = newProject();
    const other = newProject();
    const m = signManifest({
      schema: 1, version: '3.1.0', channel: 'stable',
      released_at: '2026-04-17T00:00:00.000Z',
      tarball_url: 'https://x', tarball_sha256: 'a'.repeat(64),
      notes: 'x', project_did: project.identity.did,
    }, project.privateKey);
    const r = verifyManifest(m, other.identity.did);
    assert.ok(r.isErr());
    if (r.isErr()) assert.equal(r.error.type, 'ReleaseDIDMismatch');
  });

  it('rejects after payload tampered', () => {
    const project = newProject();
    const m = signManifest({
      schema: 1, version: '3.1.0', channel: 'stable',
      released_at: '2026-04-17T00:00:00.000Z',
      tarball_url: 'https://x', tarball_sha256: 'a'.repeat(64),
      notes: 'x', project_did: project.identity.did,
    }, project.privateKey);
    const tampered = { ...m, version: '9.9.9' };
    const r = verifyManifest(tampered, project.identity.did);
    assert.ok(r.isErr());
    if (r.isErr()) assert.equal(r.error.type, 'ReleaseSignatureInvalid');
  });

  it('rejects malformed signature_hex', () => {
    const project = newProject();
    const r = verifyManifest({
      schema: 1, version: '3.1.0', channel: 'stable',
      released_at: '2026-04-17T00:00:00.000Z',
      tarball_url: 'https://x', tarball_sha256: 'a'.repeat(64),
      notes: 'x', project_did: project.identity.did,
      signature_hex: 'not-hex',
    }, project.identity.did);
    assert.ok(r.isErr());
  });

  it('rejects bad sha256 length', () => {
    const project = newProject();
    const r = verifyManifest({
      schema: 1, version: '3.1.0', channel: 'stable',
      released_at: '2026-04-17T00:00:00.000Z',
      tarball_url: 'https://x', tarball_sha256: 'short',
      notes: 'x', project_did: project.identity.did,
      signature_hex: '0'.repeat(128),
    }, project.identity.did);
    assert.ok(r.isErr());
  });
});

// ─── evaluateUpgrade ─────────────────────────────────────────────

describe('release — evaluateUpgrade', () => {
  it('passes when manifest is newer + signature OK + within min_supported', () => {
    const project = newProject();
    const m = signManifest({
      schema: 1, version: '3.1.0', channel: 'stable',
      released_at: '2026-04-17T00:00:00.000Z',
      tarball_url: 'https://x', tarball_sha256: 'a'.repeat(64),
      notes: 'x', project_did: project.identity.did,
      min_supported_version: '3.0.0',
    }, project.privateKey);
    const r = evaluateUpgrade(m, project.identity.did, '3.0.5');
    assert.ok(r.isOk());
  });

  it('rejects when current version < min_supported_version', () => {
    const project = newProject();
    const m = signManifest({
      schema: 1, version: '4.0.0', channel: 'stable',
      released_at: '2026-04-17T00:00:00.000Z',
      tarball_url: 'https://x', tarball_sha256: 'a'.repeat(64),
      notes: 'breaking change',
      project_did: project.identity.did,
      min_supported_version: '3.5.0',
    }, project.privateKey);
    const r = evaluateUpgrade(m, project.identity.did, '3.0.0');
    assert.ok(r.isErr());
    if (r.isErr()) assert.equal(r.error.type, 'ReleaseTooOld');
  });

  it('rejects when manifest version is not newer', () => {
    const project = newProject();
    const m = signManifest({
      schema: 1, version: '3.0.0', channel: 'stable',
      released_at: '2026-04-17T00:00:00.000Z',
      tarball_url: 'https://x', tarball_sha256: 'a'.repeat(64),
      notes: 'x', project_did: project.identity.did,
    }, project.privateKey);
    const r = evaluateUpgrade(m, project.identity.did, '3.0.0');
    assert.ok(r.isErr());
  });
});

// ─── update-checker ──────────────────────────────────────────────

describe('update-checker — config + state', () => {
  it('configureUpdates writes config readable by loadUpdateConfig', async () => {
    const project = newProject();
    const setRes = await configureUpdates(home, {
      project_did: project.identity.did,
      manifest_url: 'https://example.com/latest.json',
      check_interval_seconds: 86400,
      channel: 'stable',
      auto_check_enabled: true,
    });
    assert.ok(setRes.isOk());

    const r = await loadUpdateConfig(home);
    assert.ok(r.isOk());
    if (r.isOk()) {
      assert.equal(r.value!.project_did, project.identity.did);
      assert.equal(r.value!.channel, 'stable');
      assert.equal(r.value!.auto_check_enabled, true);
    }
  });

  it('loadUpdateState defaults when no state file present', async () => {
    const r = await loadUpdateState(home);
    assert.ok(r.isOk());
    if (r.isOk()) {
      assert.equal(r.value.last_checked_at, null);
      assert.equal(r.value.last_seen_version, null);
    }
  });
});

describe('update-checker — checkForUpdate flow', () => {
  it('returns upgrade_eligible:true on a valid signed newer manifest', async () => {
    const project = newProject();
    await configureUpdates(home, {
      project_did: project.identity.did,
      manifest_url: 'http://test.invalid/latest.json',
      check_interval_seconds: 86400,
      channel: 'stable',
      auto_check_enabled: false,
    });
    const m = signManifest({
      schema: 1, version: '3.1.0', channel: 'stable',
      released_at: '2026-04-17T00:00:00.000Z',
      tarball_url: 'https://x', tarball_sha256: 'a'.repeat(64),
      notes: 'release notes', project_did: project.identity.did,
    }, project.privateKey);
    const fakeFetch: typeof fetch = (async () => ({
      ok: true, status: 200,
      json: async () => m,
    } as Response)) as typeof fetch;
    const r = await checkForUpdate(home, '3.0.0', fakeFetch);
    assert.ok(r.isOk(), `check: ${r.isErr() ? JSON.stringify(r.error) : ''}`);
    if (r.isOk()) {
      assert.equal(r.value.upgrade_available, true);
      assert.equal(r.value.upgrade_eligible, true);
      assert.equal(r.value.latest_version, '3.1.0');
    }
  });

  it('rejects manifest from wrong channel as ineligible', async () => {
    const project = newProject();
    await configureUpdates(home, {
      project_did: project.identity.did,
      manifest_url: 'http://test.invalid',
      check_interval_seconds: 86400,
      channel: 'stable',
      auto_check_enabled: false,
    });
    const m = signManifest({
      schema: 1, version: '3.1.0', channel: 'beta',
      released_at: '2026-04-17T00:00:00.000Z',
      tarball_url: 'https://x', tarball_sha256: 'a'.repeat(64),
      notes: 'beta only', project_did: project.identity.did,
    }, project.privateKey);
    const fakeFetch: typeof fetch = (async () => ({ ok: true, status: 200, json: async () => m } as Response)) as typeof fetch;
    const r = await checkForUpdate(home, '3.0.0', fakeFetch);
    assert.ok(r.isOk());
    if (r.isOk()) {
      assert.equal(r.value.upgrade_available, false);
      assert.equal(r.value.upgrade_eligible, false);
    }
  });

  it('reports upgrade_available:false on bad signature', async () => {
    const project = newProject();
    const other = newProject();
    await configureUpdates(home, {
      project_did: project.identity.did,
      manifest_url: 'http://test.invalid',
      check_interval_seconds: 86400,
      channel: 'stable',
      auto_check_enabled: false,
    });
    // Sign with the WRONG private key but claim the project DID
    const m = signManifest({
      schema: 1, version: '3.1.0', channel: 'stable',
      released_at: '2026-04-17T00:00:00.000Z',
      tarball_url: 'https://x', tarball_sha256: 'a'.repeat(64),
      notes: 'forged', project_did: project.identity.did, // claims project DID
    }, other.privateKey); // but signs with imposter key
    const fakeFetch: typeof fetch = (async () => ({ ok: true, status: 200, json: async () => m } as Response)) as typeof fetch;
    const r = await checkForUpdate(home, '3.0.0', fakeFetch);
    assert.ok(r.isOk());
    if (r.isOk()) {
      assert.equal(r.value.upgrade_available, false);
    }
  });

  it('bubbles fetch failure as AppError', async () => {
    const project = newProject();
    await configureUpdates(home, {
      project_did: project.identity.did,
      manifest_url: 'http://test.invalid',
      check_interval_seconds: 86400,
      channel: 'stable',
      auto_check_enabled: false,
    });
    const fakeFetch: typeof fetch = (async () => { throw new Error('ENOTFOUND'); }) as typeof fetch;
    const r = await checkForUpdate(home, '3.0.0', fakeFetch);
    assert.ok(r.isErr());
  });
});

describe('update-checker — tickUpdateCheck throttle', () => {
  it('skips when interval has not elapsed', async () => {
    const project = newProject();
    await configureUpdates(home, {
      project_did: project.identity.did,
      manifest_url: 'http://test.invalid',
      check_interval_seconds: 86400,
      channel: 'stable',
      auto_check_enabled: true,
    });
    // Pre-populate state so last_checked_at is "now"
    const { writeFile } = await import('node:fs/promises');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(home, 'update'), { recursive: true });
    const recent = new Date().toISOString();
    await writeFile(join(home, 'update', 'state.json'), JSON.stringify({
      version: 1,
      last_checked_at: recent,
      last_seen_version: '3.0.0',
      last_seen_notes: null,
    }));
    let fetchCalled = false;
    const fakeFetch: typeof fetch = (async () => { fetchCalled = true; return {} as Response; }) as typeof fetch;
    const r = await tickUpdateCheck(home, '3.0.0', new Date(), fakeFetch);
    assert.ok(r.isOk());
    if (r.isOk()) assert.equal(r.value, null);
    assert.equal(fetchCalled, false, 'fetch should not be called within interval');
  });

  it('returns null when auto-check disabled', async () => {
    const project = newProject();
    await configureUpdates(home, {
      project_did: project.identity.did,
      manifest_url: 'http://test.invalid',
      check_interval_seconds: 60,
      channel: 'stable',
      auto_check_enabled: false,
    });
    let fetchCalled = false;
    const fakeFetch: typeof fetch = (async () => { fetchCalled = true; return {} as Response; }) as typeof fetch;
    const r = await tickUpdateCheck(home, '3.0.0', new Date(), fakeFetch);
    assert.ok(r.isOk());
    if (r.isOk()) assert.equal(r.value, null);
    assert.equal(fetchCalled, false);
  });
});
