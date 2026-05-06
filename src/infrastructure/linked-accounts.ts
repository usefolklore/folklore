/**
 * Linked external accounts — verified handles from OAuth providers
 * that anchor the user's social DID without leaking access tokens.
 *
 * Persisted at `~/.wellinformed/linked-accounts.json` with an atomic
 * write (tmp+rename) so a crash mid-write never leaves a torn file
 * that the next read silently rolls back to "empty."
 *
 * Schema (versioned for future migration; bump VERSION when fields
 * change semantics):
 *
 *   {
 *     "version": 1,
 *     "accounts": {
 *       "github": {
 *         "handle":      "sahar-barak",
 *         "user_id":     "12345",
 *         "profile_url": "https://github.com/sahar-barak",
 *         "verified_at": "2026-05-06T20:30:00.000Z"
 *       }
 *     }
 *   }
 *
 * Tokens never reach this file. Only the public attestation that the
 * verified-at timestamp says "wellinformed proved the user controls
 * github.com/<handle> at this moment."
 *
 * Future providers (Google, Anthropic, Twitter, etc.) drop in as new
 * keys under `accounts.<provider>` with the same shape: handle,
 * user_id, profile_url, verified_at.
 */

import { Result, err, ok } from 'neverthrow';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWriteSync } from './atomic-write.js';

// ─────────────── shape ────────────────────

const VERSION = 1 as const;

export type ProviderName = 'github' | 'google' | 'anthropic' | 'twitter';

export interface LinkedAccount {
  readonly handle: string;
  readonly user_id: string;
  readonly profile_url: string;
  readonly verified_at: string; // ISO-8601
}

export interface LinkedAccountsFile {
  readonly version: typeof VERSION;
  readonly accounts: Partial<Record<ProviderName, LinkedAccount>>;
}

export type LinkedAccountsError =
  | { readonly type: 'LinkedAccountsParseError'; readonly path: string; readonly message: string }
  | { readonly type: 'LinkedAccountsWriteError'; readonly path: string; readonly message: string };

const linkedAccountsPath = (home: string): string =>
  join(home, 'linked-accounts.json');

// ─────────────── load ─────────────────────

const emptyFile = (): LinkedAccountsFile => ({ version: VERSION, accounts: {} });

/**
 * Read linked-accounts.json. Returns an empty file on missing or
 * malformed input — refusing to throw means a corrupted file doesn't
 * brick downstream operations (signed envelope verification, etc.).
 * The next successful save() rewrites the canonical structure.
 */
export const loadLinkedAccounts = (home: string): LinkedAccountsFile => {
  const path = linkedAccountsPath(home);
  if (!existsSync(path)) return emptyFile();
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as LinkedAccountsFile;
    if (
      parsed.version !== VERSION ||
      !parsed.accounts ||
      typeof parsed.accounts !== 'object'
    ) {
      return emptyFile();
    }
    return parsed;
  } catch {
    return emptyFile();
  }
};

// ─────────────── save ─────────────────────

/**
 * Upsert one provider's verified handle. Atomic write — tmp+rename so
 * a SIGKILL mid-write never leaves a half-written JSON the next boot
 * reads as garbage.
 */
export const saveLinkedAccount = (
  home: string,
  provider: ProviderName,
  account: LinkedAccount,
): Result<void, LinkedAccountsError> => {
  const path = linkedAccountsPath(home);
  const current = loadLinkedAccounts(home);
  const next: LinkedAccountsFile = {
    version: VERSION,
    accounts: { ...current.accounts, [provider]: account },
  };
  try {
    atomicWriteSync(path, JSON.stringify(next, null, 2));
    return ok(undefined);
  } catch (e) {
    return err({
      type: 'LinkedAccountsWriteError',
      path,
      message: (e as Error).message,
    });
  }
};
