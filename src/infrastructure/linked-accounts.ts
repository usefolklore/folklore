/**
 * Linked external accounts — verified handles from OAuth providers
 * that anchor the user's social DID without leaking access tokens.
 *
 * Persisted at `~/.folklore/linked-accounts.json` with an atomic
 * write (tmp+rename) so a crash mid-write never leaves a torn file
 * that the next read silently rolls back to "empty."
 *
 * Schema (versioned for future migration; bump VERSION when fields
 * change semantics):
 *
 *   {
 *     "version": 2,
 *     "accounts": {
 *       "github": {
 *         "handle":      "sahar-barak",
 *         "user_id":     "12345",
 *         "profile_url": "https://github.com/sahar-barak",
 *         "email":       "sahar.h.barak@gmail.com",
 *         "verified_at": "2026-05-06T20:30:00.000Z"
 *       }
 *     }
 *   }
 *
 * Tokens never reach this file. Only the public attestation that the
 * verified-at timestamp says "folklore proved the user controls
 * github.com/<handle> at this moment." Email — when present — is the
 * primary verified address from the provider's API (for GitHub:
 * `/user/emails` with primary:true, verified:true). It's the canonical
 * cross-device identity string the statusline + node tagging key on.
 *
 * Version 2 (2026-05-27): added `email`. v1 files are read forward-
 * compatibly with `email` left absent; the next save() rewrites as v2.
 *
 * Future providers (Google, Anthropic, Twitter, etc.) drop in as new
 * keys under `accounts.<provider>` with the same shape: handle,
 * user_id, profile_url, email, verified_at.
 */

import { Result, err, ok } from 'neverthrow';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWriteSync } from './atomic-write.js';

// ─────────────── shape ────────────────────

const VERSION = 2 as const;

export type ProviderName = 'github' | 'google' | 'anthropic' | 'twitter';

export interface LinkedAccount {
  readonly handle: string;
  readonly user_id: string;
  readonly profile_url: string;
  /** Primary verified email from the provider's API. v2+; absent on v1
   *  records until the next login round-trip refreshes them. */
  readonly email?: string;
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
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { version?: number; accounts?: unknown };
    if (
      typeof parsed.version !== 'number' ||
      parsed.version < 1 ||
      parsed.version > VERSION ||
      !parsed.accounts ||
      typeof parsed.accounts !== 'object'
    ) {
      return emptyFile();
    }
    // Forward-load v1 files: same field set minus `email`. Cast to v2
    // shape — the next save() upgrades the file in place.
    return {
      version: VERSION,
      accounts: parsed.accounts as LinkedAccountsFile['accounts'],
    };
  } catch {
    return emptyFile();
  }
};

// ─────────────── save ─────────────────────

/**
 * Read just the github handle (no email, no profile URL) — the field
 * stamped onto every locally-authored node. Returns undefined when no
 * verified handle is present.
 *
 * Used by `indexNode` to tag nodes at the write boundary so federation
 * can map every shared chunk back to its author without trawling DIDs.
 * The full LinkedAccount is read via loadLinkedAccounts() — this is
 * just the hot-path convenience.
 */
export const readGithubHandle = (home: string): string | undefined => {
  const f = loadLinkedAccounts(home);
  return f.accounts.github?.handle;
};

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
