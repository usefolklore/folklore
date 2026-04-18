/**
 * `wellinformed update <sub>` — auto-update CLI surface.
 *
 *   configure --did <did:key:z...> --url <manifest URL> [--channel stable] [--interval 86400]
 *   check                                check now (verifies signature)
 *   status                               show config + last check + latest seen
 *   enable-auto                          turn on daemon auto-check
 *   disable-auto                         turn off daemon auto-check
 *
 * The flow:
 *   1. operator pins the project DID once via `configure`
 *   2. on each tick (or manual `check`) the daemon downloads the manifest,
 *      verifies the Ed25519 signature against the pinned DID, gates the
 *      upgrade decision (newer than current + meets min_supported_version)
 *   3. if `upgrade_eligible: true`, the operator's package manager handles
 *      the install (npm update -g wellinformed, brew upgrade, etc.) — the
 *      CLI prints the recommended command
 *
 * Why no built-in installer in v3.0: see the rationale in
 * `src/application/update-checker.ts` header.
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { formatError } from '../../domain/errors.js';
import { configureUpdates, loadUpdateConfig, loadUpdateState, checkForUpdate } from '../../application/update-checker.js';
import { wellinformedHome } from '../runtime.js';

const currentVersion = (): string => {
  // Read from package.json — single source of truth.
  try {
    const pkgPath = resolve(join(import.meta.dirname ?? '.', '..', '..', '..', 'package.json'));
    const raw = readFileSync(pkgPath, 'utf8');
    return (JSON.parse(raw) as { version: string }).version;
  } catch {
    return '0.0.0';
  }
};

const getArg = (args: readonly string[], flag: string, def?: string): string | undefined => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : def;
};

const configure = async (rest: readonly string[]): Promise<number> => {
  const did = getArg(rest, '--did');
  const url = getArg(rest, '--url');
  if (!did || !url) {
    console.error('update configure: missing --did and/or --url');
    console.error('  example: wellinformed update configure \\');
    console.error('             --did did:key:z6Mk... \\');
    console.error('             --url https://releases.wellinformed.dev/latest.json');
    return 1;
  }
  if (!did.startsWith('did:key:z')) {
    console.error(`update configure: --did must be a did:key, got '${did}'`);
    return 1;
  }
  const channel = getArg(rest, '--channel', 'stable')!;
  const interval = parseInt(getArg(rest, '--interval', '86400')!, 10);
  if (!Number.isFinite(interval) || interval < 60) {
    console.error(`update configure: --interval must be ≥ 60 seconds, got '${interval}'`);
    return 1;
  }
  const r = await configureUpdates(wellinformedHome(), {
    project_did: did as unknown as import('../../domain/release.js').DID,
    manifest_url: url,
    check_interval_seconds: interval,
    channel,
    auto_check_enabled: false, // explicit enable-auto required
  });
  if (r.isErr()) {
    console.error(`update configure: ${formatError(r.error)}`);
    return 1;
  }
  console.log(`✓ pinned project DID: ${did}`);
  console.log(`  manifest URL:        ${url}`);
  console.log(`  channel:             ${channel}`);
  console.log(`  check interval:      ${interval}s`);
  console.log(`  auto-check:          disabled (run 'wellinformed update enable-auto' to turn on)`);
  return 0;
};

const check = async (): Promise<number> => {
  const v = currentVersion();
  console.log(`current version: ${v}`);
  console.log('checking...');
  const r = await checkForUpdate(wellinformedHome(), v);
  if (r.isErr()) {
    console.error(`update check: ${formatError(r.error)}`);
    return 1;
  }
  const res = r.value;
  console.log(`latest version:  ${res.latest_version} (channel manifest)`);
  if (!res.upgrade_available) {
    console.log('verdict:         ✗ manifest signature did not verify under pinned DID');
    return 1;
  }
  if (!res.upgrade_eligible) {
    if (res.error) {
      console.log(`verdict:         signature OK but upgrade gated: ${res.error.type}`);
    } else {
      console.log('verdict:         signature OK but upgrade gated (already up-to-date)');
    }
    return 0;
  }
  console.log('verdict:         ✓ upgrade eligible');
  console.log('');
  console.log('Notes:');
  console.log(res.notes ?? '(no release notes)');
  console.log('');
  console.log('To install:');
  console.log(`  npm update -g wellinformed   # if installed via npm`);
  console.log(`  # or download tarball + verify sha256:`);
  console.log(`  curl -fsSL ${res.manifest!.tarball_url} -o /tmp/welly.tgz`);
  console.log(`  echo '${res.manifest!.tarball_sha256}  /tmp/welly.tgz' | shasum -a 256 -c -`);
  return 0;
};

const status = async (): Promise<number> => {
  const cfg = await loadUpdateConfig(wellinformedHome());
  if (cfg.isErr()) {
    console.error(`update status: ${formatError(cfg.error)}`);
    return 1;
  }
  if (!cfg.value) {
    console.log('not configured (run `wellinformed update configure --did ... --url ...`)');
    return 0;
  }
  const state = await loadUpdateState(wellinformedHome());
  if (state.isErr()) {
    console.error(`update status: ${formatError(state.error)}`);
    return 1;
  }
  console.log(`current version:  ${currentVersion()}`);
  console.log(`pinned DID:       ${cfg.value.project_did}`);
  console.log(`manifest URL:     ${cfg.value.manifest_url}`);
  console.log(`channel:          ${cfg.value.channel}`);
  console.log(`auto-check:       ${cfg.value.auto_check_enabled ? 'enabled' : 'disabled'}`);
  console.log(`interval:         ${cfg.value.check_interval_seconds}s`);
  console.log(`last checked:     ${state.value.last_checked_at ?? '(never)'}`);
  console.log(`last seen:        ${state.value.last_seen_version ?? '(none)'}`);
  return 0;
};

const setAuto = async (enabled: boolean): Promise<number> => {
  const cfg = await loadUpdateConfig(wellinformedHome());
  if (cfg.isErr()) { console.error(`${formatError(cfg.error)}`); return 1; }
  if (!cfg.value) {
    console.error('not configured. run: wellinformed update configure --did ... --url ...');
    return 1;
  }
  const r = await configureUpdates(wellinformedHome(), { ...cfg.value, auto_check_enabled: enabled });
  if (r.isErr()) { console.error(`${formatError(r.error)}`); return 1; }
  console.log(`auto-check ${enabled ? 'enabled' : 'disabled'}.`);
  return 0;
};

const help = (): number => {
  console.log('usage: wellinformed update <sub>');
  console.log('');
  console.log('  configure --did <did:key> --url <url> [--channel stable] [--interval 86400]');
  console.log('  check               fetch manifest, verify signature under pinned DID');
  console.log('  status              show config + last-checked + last-seen');
  console.log('  enable-auto         daemon will auto-check on each tick');
  console.log('  disable-auto        stop auto-checking');
  console.log('');
  console.log('All releases must be Ed25519-signed under the pinned project DID. The');
  console.log('CLI verifies signatures locally — no implicit trust in download URLs.');
  console.log('Install step is left to the operator (npm update / brew upgrade / etc.)');
  console.log('— v3.0 ships verify-and-recommend, not auto-install.');
  return 0;
};

export const update = async (args: string[]): Promise<number> => {
  const [sub, ...rest] = args;
  switch (sub) {
    case 'configure':       return configure(rest);
    case 'check':           return check();
    case 'status':
    case undefined:         return status();
    case 'enable-auto':     return setAuto(true);
    case 'disable-auto':    return setAuto(false);
    case 'help':
    case '--help':
    case '-h':              return help();
    default:
      console.error(`update: unknown subcommand '${sub}'`);
      help();
      return 1;
  }
};
