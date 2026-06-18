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
});
