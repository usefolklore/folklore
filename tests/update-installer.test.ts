/**
 * Tests for src/application/update-installer.ts.
 * Covers:
 *   - detectInstallMethod classifies npm-global vs dev/unknown paths
 *   - installUpgrade builds the exact npm command and reports success
 *   - non-zero npm exit → UpdateInstallFailed with the command + code
 *   - non-npm install method → UpdateMethodUnknown (soft fail, not a crash)
 *
 * No npm spawn: the command runner is dependency-injected.
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import {
  detectInstallMethod,
  installUpgrade,
  type RunCommand,
} from '../src/application/update-installer.ts';

describe('update-installer — detectInstallMethod', () => {
  it('classifies a global node_modules path as npm-global', () => {
    assert.equal(
      detectInstallMethod('/usr/local/lib/node_modules/folklore/dist/application'),
      'npm-global',
    );
    assert.equal(
      detectInstallMethod('/home/u/.npm-global/lib/node_modules/folklore/dist'),
      'npm-global',
    );
  });

  it('classifies a dev checkout as unknown (never auto-installs over a working tree)', () => {
    assert.equal(detectInstallMethod('/Users/dev/projects/akashik/dist/application'), 'unknown');
    assert.equal(detectInstallMethod('/Users/dev/projects/akashik/src/application'), 'unknown');
    assert.equal(detectInstallMethod(''), 'unknown');
  });
});

describe('update-installer — installUpgrade', () => {
  const npmGlobal = '/usr/local/lib/node_modules/folklore/dist/application';

  it('builds the pinned-version npm command and reports the outcome', async () => {
    let seen: { cmd: string; args: readonly string[] } | null = null;
    const run: RunCommand = async (cmd, args) => {
      seen = { cmd, args };
      return { code: 0, stderr: '' };
    };
    const r = await installUpgrade('3.1.0', { run, modulePath: npmGlobal });
    assert.ok(r.isOk(), `install: ${r.isErr() ? JSON.stringify(r.error) : ''}`);
    assert.deepEqual(seen, { cmd: 'npm', args: ['install', '-g', 'folklore@3.1.0'] });
    if (r.isOk()) {
      assert.equal(r.value.installed_version, '3.1.0');
      assert.equal(r.value.command, 'npm install -g folklore@3.1.0');
      assert.equal(r.value.method, 'npm-global');
    }
  });

  it('maps a non-zero npm exit to UpdateInstallFailed', async () => {
    const run: RunCommand = async () => ({ code: 1, stderr: 'EACCES: permission denied' });
    const r = await installUpgrade('3.1.0', { run, modulePath: npmGlobal });
    assert.ok(r.isErr());
    if (r.isErr()) {
      assert.equal(r.error.type, 'UpdateInstallFailed');
      if (r.error.type === 'UpdateInstallFailed') {
        assert.equal(r.error.code, 1);
        assert.match(r.error.message, /EACCES/);
      }
    }
  });

  it('refuses to install over a non-npm checkout (UpdateMethodUnknown)', async () => {
    let ran = false;
    const run: RunCommand = async () => { ran = true; return { code: 0, stderr: '' }; };
    const r = await installUpgrade('3.1.0', { run, modulePath: '/Users/dev/akashik/dist' });
    assert.ok(r.isErr());
    if (r.isErr()) assert.equal(r.error.type, 'UpdateMethodUnknown');
    assert.equal(ran, false, 'must not spawn any command for an unknown method');
  });

  it('honours a custom package name', async () => {
    let seen: readonly string[] = [];
    const run: RunCommand = async (_cmd, args) => { seen = args; return { code: 0, stderr: '' }; };
    const r = await installUpgrade('9.9.9', { run, modulePath: npmGlobal, packageName: 'folklore-next' });
    assert.ok(r.isOk());
    assert.deepEqual(seen, ['install', '-g', 'folklore-next@9.9.9']);
  });

  // UPD-1 — the signed-artifact install path.
  const sha256hex = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

  it('UPD-1: verifies the signed tarball hash and installs THAT artifact (not pkg@version)', async () => {
    const bytes = Buffer.from('fake-tarball-bytes');
    const digest = sha256hex(bytes);
    let installedTarget: string | null = null;
    const run: RunCommand = async (_cmd, args) => { installedTarget = args[2]; return { code: 0, stderr: '' }; };
    const r = await installUpgrade('3.1.0', {
      run, modulePath: npmGlobal,
      tarballUrl: 'https://example.com/folklore-3.1.0.tgz',
      tarballSha256: digest,
      download: async () => bytes,
    });
    assert.ok(r.isOk(), `install: ${r.isErr() ? JSON.stringify(r.error) : ''}`);
    assert.ok(installedTarget && installedTarget.endsWith('.tgz'), 'installs the verified local tarball, not pkg@version');
    assert.ok(!String(installedTarget).includes('@'), 'must NOT install by npm version when a signed hash is present');
  });

  it('UPD-1: refuses to install when the tarball hash does not match', async () => {
    let ran = false;
    const run: RunCommand = async () => { ran = true; return { code: 0, stderr: '' }; };
    const r = await installUpgrade('3.1.0', {
      run, modulePath: npmGlobal,
      tarballUrl: 'https://example.com/folklore-3.1.0.tgz',
      tarballSha256: 'a'.repeat(64), // wrong hash
      download: async () => Buffer.from('tampered-bytes'),
    });
    assert.ok(r.isErr(), 'mismatched hash must fail closed');
    assert.equal(ran, false, 'must NOT run npm when the artifact fails verification');
  });

  it('UPD-1: refuses a non-https tarball_url', async () => {
    let ran = false;
    const run: RunCommand = async () => { ran = true; return { code: 0, stderr: '' }; };
    const r = await installUpgrade('3.1.0', {
      run, modulePath: npmGlobal,
      tarballUrl: 'http://example.com/folklore.tgz',
      tarballSha256: 'b'.repeat(64),
      download: async () => Buffer.from('x'),
    });
    assert.ok(r.isErr(), 'non-https tarball must be rejected');
    assert.equal(ran, false);
  });
});
