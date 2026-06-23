/**
 * Update installer — performs the actual binary swap that update-checker
 * deliberately leaves out. update-checker answers "should I upgrade, and to
 * what?" (read-only, signature-verified); this module answers "do it now".
 *
 * Trust boundary: this module NEVER decides whether to install. It is only
 * ever called after a manifest has verified under the pinned project DID and
 * passed the eligibility gate (newer + min_supported_version). The caller
 * (CLI `update install`, or the daemon on a signed force_upgrade) owns that
 * decision. Keeping the installer decision-free means there is exactly one
 * place where trust is established — the signature check — and the installer
 * cannot be tricked into running on an unverified manifest.
 *
 * Distribution method detection is conservative: we only auto-install the
 * canonical npm-global path. Anything else (brew, container image, a git
 * checkout) returns UpdateMethodUnknown so the caller falls back to printing
 * the manual recommendation rather than running a wrong/destructive command.
 */

import { ResultAsync, errAsync } from 'neverthrow';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash, timingSafeEqual } from 'node:crypto';
import { join, resolve } from 'node:path';
import { UpdateError, type AppError } from '../domain/errors.js';

/** Fetch the release tarball bytes. Injectable for tests (no network). */
export type DownloadFn = (url: string) => Promise<Buffer>;

const defaultDownload: DownloadFn = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${url} → HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
};

/** Constant-time hex-digest comparison (length check first, then timingSafeEqual). */
const digestsMatch = (a: string, b: string): boolean => {
  if (!/^[0-9a-f]{64}$/i.test(a) || !/^[0-9a-f]{64}$/i.test(b)) return false;
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && timingSafeEqual(ab, bb);
};

/**
 * The running CLI's own version, read from the bundled package.json (single
 * source of truth). Shared by the CLI `update` command and the daemon tick so
 * both compare the same number. Returns '0.0.0' if unreadable — a value that
 * makes any real release look newer, which is the safe-fail direction for a
 * version comparison (better to surface an available upgrade than hide one).
 */
export const readPackageVersion = (
  baseDir: string = import.meta.dirname ?? '.',
): string => {
  try {
    const pkgPath = resolve(join(baseDir, '..', '..', '..', 'package.json'));
    return (JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string }).version;
  } catch {
    return '0.0.0';
  }
};

/** How folklore was installed — drives which upgrade command we run. */
export type InstallMethod = 'npm-global' | 'unknown';

export interface InstallOutcome {
  readonly method: InstallMethod;
  readonly command: string;
  readonly installed_version: string;
}

/**
 * Detect the install method from the path of the running module. A global npm
 * install lives under a `node_modules/folklore` segment inside the npm prefix.
 * `modulePath` is injectable for tests; defaults to this file's own location.
 */
export const detectInstallMethod = (
  modulePath: string = import.meta.dirname ?? '',
): InstallMethod => {
  const norm = modulePath.replace(/\\/g, '/');
  // node_modules/folklore (global or local) → npm-managed. Local dev checkouts
  // (running from src/ or dist/ without a node_modules/folklore ancestor) are
  // intentionally NOT auto-installed — a dev's working tree must never be
  // clobbered by a self-update.
  return /\/node_modules\/folklore(\/|$)/.test(norm) ? 'npm-global' : 'unknown';
};

/** Injectable command runner — returns exit code + captured stderr tail. */
export type RunCommand = (
  cmd: string,
  args: readonly string[],
) => Promise<{ readonly code: number; readonly stderr: string }>;

const defaultRun: RunCommand = (cmd, args) =>
  new Promise((resolve) => {
    const child = spawn(cmd, [...args], { stdio: ['ignore', 'inherit', 'pipe'] });
    let stderr = '';
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString();
      // Mirror to the user's terminal while keeping a tail for the error.
      process.stderr.write(d);
    });
    child.on('error', (e) => resolve({ code: 127, stderr: e.message }));
    child.on('close', (code) => resolve({ code: code ?? 0, stderr: stderr.slice(-2000) }));
  });

/**
 * Install the given version via the detected method. Pure dependency
 * injection: pass a fake `run` and `modulePath` in tests to assert the exact
 * command without spawning npm.
 *
 * Returns UpdateMethodUnknown (not an error the caller must crash on) when the
 * install method isn't auto-installable — the CLI turns that into the manual
 * recommendation block.
 */
export const installUpgrade = (
  version: string,
  opts: {
    readonly run?: RunCommand;
    readonly modulePath?: string;
    readonly packageName?: string;
    /**
     * UPD-1 — the SIGNED release artifact. When `tarballSha256` is present
     * (real releases always set it; it is covered by the manifest signature),
     * the installer downloads `tarballUrl`, verifies the bytes against the
     * signed hash, and installs THAT exact artifact — instead of resolving
     * `pkg@version` from the npm registry (which the signature does not cover).
     * Only when the manifest carries no hash (legacy) does it fall back to the
     * version install.
     */
    readonly tarballUrl?: string;
    readonly tarballSha256?: string;
    readonly download?: DownloadFn;
  } = {},
): ResultAsync<InstallOutcome, AppError> => {
  const run = opts.run ?? defaultRun;
  const pkg = opts.packageName ?? 'folklore';
  const method = detectInstallMethod(opts.modulePath);

  if (method !== 'npm-global') {
    return errAsync(
      UpdateError.methodUnknown(
        `not an npm-global install — auto-install skipped. Upgrade manually (npm install -g ${pkg}@${version}, brew upgrade, or pull the container image).`,
      ),
    );
  }

  const npmInstall = (target: string): ResultAsync<InstallOutcome, AppError> => {
    const args = ['install', '-g', target];
    const command = `npm ${args.join(' ')}`;
    return ResultAsync.fromSafePromise(run('npm', args)).andThen(({ code, stderr }) =>
      code === 0
        ? ResultAsync.fromSafePromise(
            Promise.resolve({ method, command, installed_version: version }),
          )
        : errAsync<InstallOutcome, AppError>(
            UpdateError.installFailed(command, code, stderr.trim() || 'npm exited non-zero'),
          ),
    );
  };

  // UPD-1: signed-artifact path. The manifest signature covers tarball_sha256,
  // so verifying the downloaded bytes against it is what makes the install
  // trustworthy — `npm install -g pkg@version` would re-resolve from the
  // registry, outside the signed trust path.
  if (opts.tarballSha256) {
    const url = opts.tarballUrl ?? '';
    if (!/^https:\/\//i.test(url)) {
      return errAsync(UpdateError.installFailed('download', 1, `refusing non-https tarball_url: ${url || '<missing>'}`));
    }
    const download = opts.download ?? defaultDownload;
    return ResultAsync.fromPromise(
      (async (): Promise<InstallOutcome> => {
        const bytes = await download(url);
        const got = createHash('sha256').update(bytes).digest('hex');
        if (!digestsMatch(got, opts.tarballSha256 as string)) {
          throw new Error(`tarball sha256 mismatch — refusing to install (expected ${opts.tarballSha256}, got ${got})`);
        }
        const dir = await mkdtemp(join(tmpdir(), 'folklore-upd-'));
        const file = join(dir, `${pkg}-${version}.tgz`);
        await writeFile(file, bytes);
        try {
          const outcome = await npmInstall(file).match(
            (o) => o,
            (e) => { throw new Error(typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : 'install failed'); },
          );
          return outcome;
        } finally {
          await rm(dir, { recursive: true, force: true }).catch(() => {});
        }
      })(),
      (e): AppError => UpdateError.installFailed('npm install -g <verified-tarball>', 1, (e as Error).message),
    );
  }

  // Legacy fallback: manifest carried no hash — install by version.
  return npmInstall(`${pkg}@${version}`);
};
