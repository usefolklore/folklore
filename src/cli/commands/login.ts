/**
 * `akashik login` — link a verified GitHub identity to your
 * local DID via OAuth Device Flow.
 *
 * GitHub is the sole identity provider for akashik. The verified
 * handle, user id, profile URL, and primary verified email go into
 * `~/.akashik/linked-accounts.json`. The OAuth access token NEVER
 * touches disk — we use it once to fetch /user + /user/emails, then
 * drop it.
 *
 * Flow:
 *   1. Read client id from $AKASHIK_GITHUB_CLIENT_ID (or
 *      config.yaml — env wins).
 *   2. Request a device code from GitHub.
 *   3. Print the user_code prominently + try to open the user's
 *      browser to verification_uri.
 *   4. Poll the token endpoint at GitHub's requested cadence.
 *   5. On grant, fetch /user + /user/emails, persist the attestation.
 *
 * One provider, one command. No `login github` subcommand: the bare
 * `akashik login` runs the only flow that exists.
 */

import { spawn } from 'node:child_process';
import {
  requestDeviceCode,
  pollForToken,
  getUserHandle,
  type GitHubOAuthError,
} from '../../infrastructure/github-oauth.js';
import { saveLinkedAccount } from '../../infrastructure/linked-accounts.js';
import { akashikHome } from '../runtime.js';

// ─────────────── helpers ──────────────────

const renderOAuthError = (e: GitHubOAuthError): string => {
  switch (e.type) {
    case 'GitHubOAuthMissingClientId':
      return 'no GitHub OAuth client id configured.\n  → fix: export AKASHIK_GITHUB_CLIENT_ID="<your_app_client_id>" then re-run.\n  → Register a Device Flow OAuth app at https://github.com/settings/applications/new (callback URL is unused; enable Device Flow).';
    case 'GitHubOAuthRequestFailed':
      return `GitHub returned HTTP ${e.status}: ${e.body.slice(0, 200)}`;
    case 'GitHubOAuthInvalidResponse':
      return `GitHub response unexpected: ${e.reason}`;
    case 'GitHubOAuthDenied':
      return 'authorisation denied by user.';
    case 'GitHubOAuthExpired':
      return 'verification code expired before you completed the flow. re-run `akashik login`.';
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
  const v = process.env.AKASHIK_GITHUB_CLIENT_ID;
  return v && v.trim().length > 0 ? v.trim() : null;
};

// ─────────────── github flow ──────────────

const loginGithub = async (): Promise<number> => {
  const clientId = clientIdFromEnv();
  if (!clientId) {
    console.error(`login: ${renderOAuthError({ type: 'GitHubOAuthMissingClientId' })}`);
    return 1;
  }

  console.log('login: requesting device code from github…');
  const codeRes = await requestDeviceCode(clientId);
  if (codeRes.isErr()) {
    console.error(`login: ${renderOAuthError(codeRes.error)}`);
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
    console.error(`login: ${renderOAuthError(tokenRes.error)}`);
    return 1;
  }
  const accessToken = tokenRes.value;

  // Fetch the verified handle. The token is never persisted — only
  // the user's public attestation goes to disk.
  const userRes = await getUserHandle(accessToken);
  if (userRes.isErr()) {
    console.error(`login: ${renderOAuthError(userRes.error)}`);
    return 1;
  }
  const user = userRes.value;

  const persisted = saveLinkedAccount(akashikHome(), 'github', {
    handle: user.login,
    user_id: String(user.id),
    profile_url: user.html_url,
    email: user.email ?? undefined,
    verified_at: new Date().toISOString(),
  });
  if (persisted.isErr()) {
    console.error(`login: failed to persist verified handle: ${persisted.error.message}`);
    return 1;
  }

  console.log('');
  console.log(`✓ linked github.com/${user.login}${user.name ? ` (${user.name})` : ''}`);
  console.log(`  user_id:    ${user.id}`);
  console.log(`  profile:    ${user.html_url}`);
  if (user.email) {
    console.log(`  email:      ${user.email}`);
  } else {
    console.log(`  email:      <not granted — re-run with user:email scope to capture>`);
  }
  console.log(`  recorded:   ~/.akashik/linked-accounts.json`);
  console.log('');
  console.log('  Your DID can now claim this handle for signed envelopes + future did:web resolution.');
  return 0;
};

// ─────────────── usage + dispatch ─────────

const USAGE = `usage: akashik login

  Link a verified GitHub identity to your local DID via OAuth Device
  Flow. Persists handle, user id, profile URL, and primary verified
  email to ~/.akashik/linked-accounts.json. The access token is NEVER
  written to disk.

  Setup:
    1. Register a Device Flow OAuth app:
       https://github.com/settings/applications/new
       (any callback URL works; enable "Device Flow" in app settings)
    2. Export the client id:
       export AKASHIK_GITHUB_CLIENT_ID="Iv1.<your_id>"
    3. Re-run: akashik login`;

export const login = async (args: readonly string[]): Promise<number> => {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(USAGE);
    return 0;
  }
  if (args.length > 0) {
    console.error(`login: unexpected argument '${args[0]}'. usage: akashik login`);
    return 1;
  }
  return loginGithub();
};
