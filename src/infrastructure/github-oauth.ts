/**
 * GitHub OAuth — Device Authorization Grant flow (RFC 8628).
 *
 * Why device flow and not authorization-code:
 *
 *   1. wellinformed runs in a terminal on the user's laptop. There's
 *      no public callback URL. Device flow needs no redirect URI, no
 *      localhost callback server, no client secret.
 *   2. Works the same on a server, a corporate workstation, or behind
 *      strict firewalls. The user's browser is the only thing that
 *      needs to reach github.com — the daemon never does.
 *   3. The `gh` CLI uses this exact flow for the same reasons. It's
 *      the standard GitHub-blessed pattern for native-tool auth.
 *
 * What we use the access_token for:
 *
 *   ONE call to GET /user — to capture the verified GitHub handle
 *   that anchors the user's social DID. We do not store the token
 *   beyond that single call. The token is the means to verify "the
 *   user controls github.com/<handle>"; the persisted record is the
 *   verified-handle attestation. (Future: extend to fetch the user's
 *   public SSH/PGP keys from /users/<handle>/keys for offline
 *   verification when did:web resolves through GitHub Pages.)
 *
 * Privacy / security:
 *
 *   - All HTTP via Node fetch (no third-party OAuth lib pulls).
 *   - Access token stays in memory; never persisted. Only the public
 *     verified handle + GitHub user id + profile URL go to disk.
 *   - User-Agent identifies wellinformed so GitHub's audit log can
 *     show what tool created the OAuth session.
 *   - Device-code endpoint requires the client_id only (no secret).
 *     Caller validates client_id is set before any request fires.
 *
 * Pure-ish: depends on `fetch` (built-in Node 22+). Tests inject a
 * fake fetch via the module-scoped `oauthFetch` setter.
 */

import { Result, ResultAsync, err, ok, errAsync, okAsync } from 'neverthrow';

// ─────────────── error model ──────────────

export type GitHubOAuthError =
  | { readonly type: 'GitHubOAuthMissingClientId' }
  | { readonly type: 'GitHubOAuthRequestFailed'; readonly status: number; readonly body: string }
  | { readonly type: 'GitHubOAuthInvalidResponse'; readonly reason: string }
  | { readonly type: 'GitHubOAuthDenied' }
  | { readonly type: 'GitHubOAuthExpired' }
  | { readonly type: 'GitHubOAuthTimeout' }
  | { readonly type: 'GitHubOAuthNetworkError'; readonly message: string };

export const GitHubOAuthError = {
  missingClientId: (): GitHubOAuthError => ({ type: 'GitHubOAuthMissingClientId' }),
  requestFailed: (status: number, body: string): GitHubOAuthError => ({
    type: 'GitHubOAuthRequestFailed', status, body,
  }),
  invalidResponse: (reason: string): GitHubOAuthError => ({
    type: 'GitHubOAuthInvalidResponse', reason,
  }),
  denied: (): GitHubOAuthError => ({ type: 'GitHubOAuthDenied' }),
  expired: (): GitHubOAuthError => ({ type: 'GitHubOAuthExpired' }),
  timeout: (): GitHubOAuthError => ({ type: 'GitHubOAuthTimeout' }),
  network: (message: string): GitHubOAuthError => ({
    type: 'GitHubOAuthNetworkError', message,
  }),
} as const;

// ─────────────── wire shapes ──────────────

export interface DeviceCodeResponse {
  /** Used by the client to poll for the access token. Treat as secret. */
  readonly device_code: string;
  /** Short human-typeable code shown to the user. */
  readonly user_code: string;
  /** URL the user opens in a browser to enter `user_code`. */
  readonly verification_uri: string;
  /** Seconds until `device_code` expires. Typically 900 (15 min). */
  readonly expires_in: number;
  /** Minimum seconds between polling requests. Typically 5. */
  readonly interval: number;
}

export interface VerifiedGitHubUser {
  /** GitHub login (e.g. 'sahar-barak'). Stable per-account. */
  readonly login: string;
  /** Numeric stable id. Survives login rename. */
  readonly id: number;
  /** Optional display name. */
  readonly name: string | null;
  /** Profile URL — used as the canonical reference in the social DID. */
  readonly html_url: string;
}

// ─────────────── injectable fetch ─────────

/**
 * Module-scoped fetch reference so tests can swap in a fake. The
 * default is the global `fetch` (Node 22+, undici). Production code
 * must NOT call this setter; only tests should.
 */
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

let oauthFetch: FetchLike = (url, init) => fetch(url, init);

/** Test seam — replace the fetch implementation. Returns the previous
 * one so tests can restore it. */
export const __setOAuthFetchForTest = (next: FetchLike): FetchLike => {
  const prev = oauthFetch;
  oauthFetch = next;
  return prev;
};

// ─────────────── endpoints ────────────────

const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';

const USER_AGENT = 'wellinformed-oauth/1.0';

// ─────────────── step 1: request device code ─────

/**
 * Initiate the device flow. Caller embeds `clientId` (a public OAuth
 * app id — safe to ship, no secret needed for this flow). Optionally
 * narrows scope; default is `read:user` (just enough to verify the
 * handle).
 */
export const requestDeviceCode = (
  clientId: string,
  scope: string = 'read:user',
): ResultAsync<DeviceCodeResponse, GitHubOAuthError> => {
  if (!clientId || clientId.trim().length === 0) {
    return errAsync(GitHubOAuthError.missingClientId());
  }
  return ResultAsync.fromPromise(
    oauthFetch(GITHUB_DEVICE_CODE_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      body: new URLSearchParams({ client_id: clientId, scope }).toString(),
    }),
    (e) => GitHubOAuthError.network((e as Error).message),
  ).andThen((res) =>
    ResultAsync.fromPromise(res.text(), (e) =>
      GitHubOAuthError.network((e as Error).message),
    ).andThen((text) => {
      if (!res.ok) {
        return errAsync(GitHubOAuthError.requestFailed(res.status, text));
      }
      return parseDeviceCode(text);
    }),
  );
};

const parseDeviceCode = (
  body: string,
): ResultAsync<DeviceCodeResponse, GitHubOAuthError> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return errAsync(GitHubOAuthError.invalidResponse('device-code body not JSON'));
  }
  if (!parsed || typeof parsed !== 'object') {
    return errAsync(GitHubOAuthError.invalidResponse('device-code body not an object'));
  }
  const o = parsed as Record<string, unknown>;
  if (
    typeof o.device_code !== 'string' ||
    typeof o.user_code !== 'string' ||
    typeof o.verification_uri !== 'string' ||
    typeof o.expires_in !== 'number' ||
    typeof o.interval !== 'number'
  ) {
    return errAsync(GitHubOAuthError.invalidResponse('device-code missing required fields'));
  }
  return okAsync({
    device_code: o.device_code,
    user_code: o.user_code,
    verification_uri: o.verification_uri,
    expires_in: o.expires_in,
    interval: o.interval,
  });
};

// ─────────────── step 2: poll for token ──────

interface TokenPollOk {
  readonly kind: 'ok';
  readonly access_token: string;
}
interface TokenPollPending {
  readonly kind: 'pending' | 'slow_down';
}
interface TokenPollTerminal {
  readonly kind: 'denied' | 'expired';
}
type TokenPollResult = TokenPollOk | TokenPollPending | TokenPollTerminal;

const oneTokenPoll = (
  clientId: string,
  deviceCode: string,
): ResultAsync<TokenPollResult, GitHubOAuthError> =>
  ResultAsync.fromPromise(
    oauthFetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      body: new URLSearchParams({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }).toString(),
    }),
    (e) => GitHubOAuthError.network((e as Error).message),
  ).andThen((res) =>
    ResultAsync.fromPromise(res.text(), (e) =>
      GitHubOAuthError.network((e as Error).message),
    ).andThen((text) => {
      // GitHub returns 200 with body{error: ...} for pending/slow_down.
      // It returns 200 with body{access_token: ...} for granted.
      // Returns non-200 only for malformed requests — surface those.
      if (!res.ok && res.status !== 200) {
        return errAsync(GitHubOAuthError.requestFailed(res.status, text));
      }
      return parseTokenPoll(text);
    }),
  );

const parseTokenPoll = (
  body: string,
): ResultAsync<TokenPollResult, GitHubOAuthError> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return errAsync(GitHubOAuthError.invalidResponse('token-poll body not JSON'));
  }
  if (!parsed || typeof parsed !== 'object') {
    return errAsync(GitHubOAuthError.invalidResponse('token-poll body not an object'));
  }
  const o = parsed as Record<string, unknown>;
  if (typeof o.access_token === 'string' && o.access_token.length > 0) {
    return okAsync<TokenPollResult, GitHubOAuthError>({
      kind: 'ok',
      access_token: o.access_token,
    });
  }
  if (typeof o.error === 'string') {
    switch (o.error) {
      case 'authorization_pending':
        return okAsync<TokenPollResult, GitHubOAuthError>({ kind: 'pending' });
      case 'slow_down':
        return okAsync<TokenPollResult, GitHubOAuthError>({ kind: 'slow_down' });
      case 'access_denied':
        return okAsync<TokenPollResult, GitHubOAuthError>({ kind: 'denied' });
      case 'expired_token':
        return okAsync<TokenPollResult, GitHubOAuthError>({ kind: 'expired' });
      default:
        return errAsync(GitHubOAuthError.invalidResponse(`unknown error: ${o.error}`));
    }
  }
  return errAsync(GitHubOAuthError.invalidResponse('no access_token and no error in response'));
};

/**
 * Poll the token endpoint at the cadence GitHub asked for, until we
 * get an access_token, the user denies, the code expires, or the
 * caller's `signal` aborts. Honours `slow_down` by adding 5s to the
 * interval per RFC 8628 §3.5.
 *
 * Caller is expected to print "open <verification_uri> and enter
 * <user_code>" between requestDeviceCode and pollForToken.
 */
export const pollForToken = async (
  clientId: string,
  deviceCode: string,
  initialIntervalSec: number,
  expiresInSec: number,
  onTick?: () => void,
): Promise<Result<string, GitHubOAuthError>> => {
  const start = Date.now();
  let intervalSec = Math.max(1, initialIntervalSec);
  const deadlineMs = start + Math.max(60, expiresInSec) * 1000;

  while (Date.now() < deadlineMs) {
    onTick?.();
    const r = await oneTokenPoll(clientId, deviceCode);
    if (r.isErr()) return err(r.error);
    const v = r.value;
    if (v.kind === 'ok') return ok(v.access_token);
    if (v.kind === 'denied') return err(GitHubOAuthError.denied());
    if (v.kind === 'expired') return err(GitHubOAuthError.expired());
    if (v.kind === 'slow_down') intervalSec += 5;
    await new Promise((resolve) => setTimeout(resolve, intervalSec * 1000));
  }
  return err(GitHubOAuthError.timeout());
};

// ─────────────── step 3: fetch user ──────

/**
 * Verify the access_token by calling /user. The handle returned here
 * is the cryptographic anchor for the social DID — never compute it
 * from the user's input, always read it back from GitHub's API after
 * the token grant.
 */
export const getUserHandle = (
  accessToken: string,
): ResultAsync<VerifiedGitHubUser, GitHubOAuthError> => {
  if (!accessToken) {
    return errAsync(GitHubOAuthError.invalidResponse('empty access_token'));
  }
  return ResultAsync.fromPromise(
    oauthFetch(GITHUB_USER_URL, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': USER_AGENT,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }),
    (e) => GitHubOAuthError.network((e as Error).message),
  ).andThen((res) =>
    ResultAsync.fromPromise(res.text(), (e) =>
      GitHubOAuthError.network((e as Error).message),
    ).andThen((text) => {
      if (!res.ok) {
        return errAsync(GitHubOAuthError.requestFailed(res.status, text));
      }
      return parseUser(text);
    }),
  );
};

const parseUser = (
  body: string,
): ResultAsync<VerifiedGitHubUser, GitHubOAuthError> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return errAsync(GitHubOAuthError.invalidResponse('user body not JSON'));
  }
  if (!parsed || typeof parsed !== 'object') {
    return errAsync(GitHubOAuthError.invalidResponse('user body not an object'));
  }
  const o = parsed as Record<string, unknown>;
  if (typeof o.login !== 'string' || typeof o.id !== 'number' || typeof o.html_url !== 'string') {
    return errAsync(GitHubOAuthError.invalidResponse('user missing required fields'));
  }
  return okAsync({
    login: o.login,
    id: o.id,
    name: typeof o.name === 'string' ? o.name : null,
    html_url: o.html_url,
  });
};
