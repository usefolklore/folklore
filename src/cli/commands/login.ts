/**
 * `wellinformed login github` — link a verified GitHub identity to
 * your local DID via OAuth Device Flow.
 *
 * Why this command exists (per the project decision saved in memory):
 * the social DID for wellinformed is anchored to existing OAuth
 * identities. GitHub is the first provider. The verified-at handle
 * + GitHub user id + profile URL go into `~/.wellinformed/linked-
 * accounts.json`. The OAuth access token NEVER touches disk — we use
 * it once to fetch /user, then drop it.
 *
 * Flow:
 *   1. Read client id from $WELLINFORMED_GITHUB_CLIENT_ID (or
 *      config.yaml — env wins).
 *   2. Request a device code from GitHub.
 *   3. Print the user_code prominently + try to open the user's
 *      browser to verification_uri.
 *   4. Poll the token endpoint at GitHub's requested cadence.
 *   5. On grant, fetch /user, persist the verified handle.
 *
 * Subcommands: just `github` for now. Google / Anthropic / Twitter
 * land as siblings later — the plumbing already supports them via
 * `linked-accounts.ts`.
 */

import { spawn } from 'node:child_process';
import {
  requestDeviceCode,
  pollForToken,
  getUserHandle,
  type GitHubOAuthError,
} from '../../infrastructure/github-oauth.js';
import { saveLinkedAccount } from '../../infrastructure/linked-accounts.js';
import { wellinformedHome } from '../runtime.js';

// ─────────────── helpers ──────────────────

const renderOAuthError = (e: GitHubOAuthError): string => {
  switch (e.type) {
    case 'GitHubOAuthMissingClientId':
      return 'no GitHub OAuth client id configured.\n  → fix: export WELLINFORMED_GITHUB_CLIENT_ID="<your_app_client_id>" then re-run.\n  → Register a Device Flow OAuth app at https://github.com/settings/applications/new (callback URL is unused; enable Device Flow).';
    case 'GitHubOAuthRequestFailed':
      return `GitHub returned HTTP ${e.status}: ${e.body.slice(0, 200)}`;
    case 'GitHubOAuthInvalidResponse':
      return `GitHub response unexpected: ${e.reason}`;
    case 'GitHubOAuthDenied':
      return 'authorisation denied by user.';
    case 'GitHubOAuthExpired':
      return 'verification code expired before you completed the flow. re-run `wellinformed login github`.';
    case 'GitHubOAuthTimeout':
      return 'timeout waiting for browser confirmation. re-run when ready.';
    case 'GitHubOAuthNetworkError':
      return `network error talking to GitHub: ${e.message}`;
  }
};

const tryOpenBrowser = (url: string): void => {
  const cmd =
    process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start'
    : 'xdg-open';
  try {
    const child = spawn(cmd, [url], { stdio: 'ignore', detached: true });
    child.unref();
    child.on('error', () => { /* fall through to printed URL */ });
  } catch {
    /* user just types it */
  }
};

const clientIdFromEnv = (): string | null => {
  const v = process.env.WELLINFORMED_GITHUB_CLIENT_ID;
  return v && v.trim().length > 0 ? v.trim() : null;
};

// ─────────────── github subcommand ────────

const loginGithub = async (): Promise<number> => {
  const clientId = clientIdFromEnv();
  if (!clientId) {
    console.error(`login github: ${renderOAuthError({ type: 'GitHubOAuthMissingClientId' })}`);
    return 1;
  }

  console.log('login github: requesting device code…');
  const codeRes = await requestDeviceCode(clientId);
  if (codeRes.isErr()) {
    console.error(`login github: ${renderOAuthError(codeRes.error)}`);
    return 1;
  }
  const code = codeRes.value;

  // Print the user_code prominently — the user types this into the
  // browser. Keep the URL on its own line so terminals auto-link it.
  console.log('');
  console.log('  ┌─ open this URL in your browser ─');
  console.log(`  │   ${code.verification_uri}`);
  console.log('  ├─ and enter this code ───────────');
  console.log(`  │   ${code.user_code}`);
  console.log('  └─');
  console.log('');
  console.log(`  (expires in ${Math.round(code.expires_in / 60)} min · polling every ${code.interval}s)`);

  tryOpenBrowser(code.verification_uri);

  let dots = 0;
  const tokenRes = await pollForToken(
    clientId,
    code.device_code,
    code.interval,
    code.expires_in,
    () => {
      // Tiny progress marker — every 5 ticks, print a dot. Keeps
      // the terminal "alive" so users don't think we hung.
      if (dots++ % 5 === 0) process.stdout.write('.');
    },
  );
  process.stdout.write('\n');

  if (tokenRes.isErr()) {
    console.error(`login github: ${renderOAuthError(tokenRes.error)}`);
    return 1;
  }
  const accessToken = tokenRes.value;

  // Fetch the verified handle. The token is never persisted — only
  // the user's public attestation goes to disk.
  const userRes = await getUserHandle(accessToken);
  if (userRes.isErr()) {
    console.error(`login github: ${renderOAuthError(userRes.error)}`);
    return 1;
  }
  const user = userRes.value;

  const persisted = saveLinkedAccount(wellinformedHome(), 'github', {
    handle: user.login,
    user_id: String(user.id),
    profile_url: user.html_url,
    verified_at: new Date().toISOString(),
  });
  if (persisted.isErr()) {
    console.error(`login github: failed to persist verified handle: ${persisted.error.message}`);
    return 1;
  }

  console.log('');
  console.log(`✓ linked github.com/${user.login}${user.name ? ` (${user.name})` : ''}`);
  console.log(`  user_id:    ${user.id}`);
  console.log(`  profile:    ${user.html_url}`);
  console.log(`  recorded:   ~/.wellinformed/linked-accounts.json`);
  console.log('');
  console.log('  Your DID can now claim this handle for signed envelopes + future did:web resolution.');
  return 0;
};

// ─────────────── usage + dispatch ─────────

const USAGE = `usage: wellinformed login <provider>

  github            link a GitHub identity via OAuth device flow

  Anchors a verified handle from an external identity provider to
  your local DID. Only the verified handle (no access token) is
  persisted. Required for strict-mode P2P federation when peers
  enforce signed envelopes.

  GitHub setup:
    1. Register a Device Flow OAuth app:
       https://github.com/settings/applications/new
       (any callback URL works; enable "Device Flow" in app settings)
    2. Export the client id:
       export WELLINFORMED_GITHUB_CLIENT_ID="Iv1.<your_id>"
    3. Re-run: wellinformed login github`;

export const login = async (args: readonly string[]): Promise<number> => {
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(USAGE);
    return args.length === 0 ? 1 : 0;
  }
  const [sub] = args;
  switch (sub) {
    case 'github':
      return loginGithub();
    default:
      console.error(`login: unknown provider '${sub}'. supported: github`);
      return 1;
  }
};
