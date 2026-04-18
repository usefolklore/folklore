/**
 * Update checker — fetch latest release manifest, verify signature
 * against the pinned project DID, gate the upgrade decision.
 *
 * Does NOT perform the actual binary swap — that's a CLI/installer
 * concern (npm install -g, brew upgrade, etc.). The application layer
 * answers the question "should I update, and if so to what?" — leaving
 * the install step to the operator's package manager of choice.
 *
 * Why no built-in installer:
 *   - npm-based installs (the canonical wellinformed distribution)
 *     already have an idiomatic upgrade path (`npm update -g wellinformed`)
 *   - Auto-replacing a running binary requires platform-specific tricks
 *     (file locks on Windows, code-signing on macOS, etc.) that are
 *     out of scope for v3.0
 *   - The verify-and-recommend split lets adopters wire whatever
 *     installer they want (apt, brew, container image pull, etc.)
 *     and trust the manifest signature regardless
 *
 * v3.1 may add a `wellinformed update install` flow for the npm path
 * specifically — gated on adopter feedback.
 */

import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PeerError, type AppError } from '../domain/errors.js';
import {
  evaluateUpgrade,
  verifyManifest,
  type DID,
  type ReleaseError,
  type ReleaseManifest,
} from '../domain/release.js';

// ─────────────────────── config + state on disk ───────────────────

export interface UpdateConfig {
  readonly version: 1;
  /** Pinned project DID — the only signer trusted for releases. */
  readonly project_did: DID;
  /** URL of the manifest JSON. Conventional: `${RELEASE_BASE}/latest.json`. */
  readonly manifest_url: string;
  /** Periodic check interval in seconds (default 86400 = once a day). */
  readonly check_interval_seconds: number;
  /** Channel filter — only accept manifests with this channel. */
  readonly channel: string;
  /** Whether the daemon should auto-check on its tick. */
  readonly auto_check_enabled: boolean;
}

export interface UpdateState {
  readonly version: 1;
  readonly last_checked_at: string | null;
  readonly last_seen_version: string | null;
  readonly last_seen_notes: string | null;
}

const updatePaths = (homeDir: string) => ({
  configPath: join(homeDir, 'update', 'config.json'),
  statePath: join(homeDir, 'update', 'state.json'),
  dir: join(homeDir, 'update'),
});

const writeJSON = (path: string, data: unknown): ResultAsync<void, AppError> =>
  ResultAsync.fromPromise(
    (async () => {
      await mkdir(join(path, '..'), { recursive: true });
      await writeFile(path + '.tmp', JSON.stringify(data, null, 2), 'utf8');
      const { rename } = await import('node:fs/promises');
      await rename(path + '.tmp', path);
    })(),
    (e) => PeerError.identityWriteError(path, (e as Error).message),
  );

const readJSON = <T>(path: string, label: string): ResultAsync<T | null, AppError> => {
  if (!existsSync(path)) return okAsync(null);
  return ResultAsync.fromPromise(readFile(path, 'utf8'), (e) =>
    PeerError.identityReadError(path, (e as Error).message),
  ).andThen((text) => {
    try { return okAsync<T | null, AppError>(JSON.parse(text) as T); }
    catch (e) { return errAsync<T | null, AppError>(PeerError.identityParseError(path, `${label}: ${(e as Error).message}`)); }
  });
};

// ─────────────────────── lifecycle ────────────────────────────────

/**
 * Initialize update config — pin the project DID, manifest URL, channel.
 * Idempotent: re-running with the same DID is a no-op; with a different
 * DID it overwrites (operator explicitly retargets the trust root).
 */
export const configureUpdates = (
  homeDir: string,
  cfg: Omit<UpdateConfig, 'version'>,
): ResultAsync<void, AppError> => {
  const paths = updatePaths(homeDir);
  return writeJSON(paths.configPath, { version: 1, ...cfg });
};

export const loadUpdateConfig = (homeDir: string): ResultAsync<UpdateConfig | null, AppError> => {
  const paths = updatePaths(homeDir);
  return readJSON<UpdateConfig>(paths.configPath, 'update config');
};

export const loadUpdateState = (homeDir: string): ResultAsync<UpdateState, AppError> => {
  const paths = updatePaths(homeDir);
  return readJSON<UpdateState>(paths.statePath, 'update state').map((s) =>
    s ?? { version: 1, last_checked_at: null, last_seen_version: null, last_seen_notes: null },
  );
};

const saveState = (homeDir: string, state: UpdateState): ResultAsync<void, AppError> => {
  const paths = updatePaths(homeDir);
  return writeJSON(paths.statePath, state);
};

// ─────────────────────── check + verify ───────────────────────────

export interface UpdateCheckResult {
  readonly current_version: string;
  readonly latest_version: string;
  readonly upgrade_available: boolean;
  readonly upgrade_eligible: boolean;
  readonly manifest: ReleaseManifest | null;
  readonly checked_at: string;
  readonly notes: string | null;
  readonly error?: ReleaseError;
}

/**
 * Fetch the manifest, verify the signature, gate the upgrade decision.
 * Updates the local state with the latest-seen version regardless of
 * eligibility (for `wellinformed update status` reporting).
 */
export const checkForUpdate = (
  homeDir: string,
  currentVersion: string,
  fetchImpl: typeof fetch = fetch,
): ResultAsync<UpdateCheckResult, AppError> =>
  loadUpdateConfig(homeDir).andThen((cfg) => {
    if (!cfg) {
      return errAsync<UpdateCheckResult, AppError>(
        PeerError.identityReadError(updatePaths(homeDir).configPath, 'update not configured — run `wellinformed update configure`'),
      );
    }
    const checkedAt = new Date().toISOString();
    return ResultAsync.fromPromise(
      (async () => {
        const r = await fetchImpl(cfg.manifest_url, { method: 'GET' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as ReleaseManifest;
      })(),
      (e) => PeerError.identityReadError(cfg.manifest_url, (e as Error).message),
    ).andThen((manifest) => {
      // Channel filter — even verified manifests on the wrong channel are skipped
      if (manifest.channel !== cfg.channel) {
        return saveState(homeDir, {
          version: 1,
          last_checked_at: checkedAt,
          last_seen_version: manifest.version,
          last_seen_notes: manifest.notes,
        }).map((): UpdateCheckResult => ({
          current_version: currentVersion,
          latest_version: manifest.version,
          upgrade_available: false,
          upgrade_eligible: false,
          manifest: null,
          checked_at: checkedAt,
          notes: manifest.notes,
        }));
      }

      // Pure-domain gate: verify signature, check newness + min-supported.
      const evalRes = evaluateUpgrade(manifest, cfg.project_did, currentVersion);
      const verifyOnly = verifyManifest(manifest, cfg.project_did);

      const newState: UpdateState = {
        version: 1,
        last_checked_at: checkedAt,
        last_seen_version: manifest.version,
        last_seen_notes: manifest.notes,
      };

      return saveState(homeDir, newState).map((): UpdateCheckResult => ({
        current_version: currentVersion,
        latest_version: manifest.version,
        upgrade_available: verifyOnly.isOk(),
        upgrade_eligible: evalRes.isOk(),
        manifest: verifyOnly.isOk() ? manifest : null,
        checked_at: checkedAt,
        notes: manifest.notes,
        ...(evalRes.isErr() ? { error: evalRes.error } : {}),
      }));
    });
  });

/**
 * Daemon-tick convenience: load config, check if interval elapsed since
 * last_checked_at, run checkForUpdate if so. Returns null if a check
 * was skipped (rate-limited).
 */
export const tickUpdateCheck = (
  homeDir: string,
  currentVersion: string,
  now: Date = new Date(),
  fetchImpl: typeof fetch = fetch,
): ResultAsync<UpdateCheckResult | null, AppError> =>
  loadUpdateConfig(homeDir).andThen((cfg) => {
    if (!cfg || !cfg.auto_check_enabled) return okAsync<UpdateCheckResult | null, AppError>(null);
    return loadUpdateState(homeDir).andThen((state) => {
      if (state.last_checked_at) {
        const elapsedMs = now.getTime() - new Date(state.last_checked_at).getTime();
        if (elapsedMs < cfg.check_interval_seconds * 1000) return okAsync<UpdateCheckResult | null, AppError>(null);
      }
      return checkForUpdate(homeDir, currentVersion, fetchImpl).map((r) => r as UpdateCheckResult | null);
    });
  });

// ─────────────────────── re-exports ────────────────────────────────

export type { ReleaseManifest, DID };
