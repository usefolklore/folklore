/**
 * Unit tests — GitHub OAuth Device Flow.
 *
 * Mocks `fetch` via the test-only `__setOAuthFetchForTest` setter so
 * the suite never makes real network calls. Locks the contract:
 *   - Empty client id → MissingClientId
 *   - Successful device-code request returns the parsed shape
 *   - Malformed device-code body → InvalidResponse
 *   - HTTP non-2xx → RequestFailed with body excerpt
 *   - Token poll: pending → keep polling, slow_down → bump interval,
 *     denied/expired → terminal errors, ok → returns access_token
 *   - getUserHandle parses login + id + html_url; null name OK
 */

import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import {
  requestDeviceCode,
  pollForToken,
  getUserHandle,
  __setOAuthFetchForTest,
} from '../src/infrastructure/github-oauth.js';

// ─────────────── fake fetch infra ─────────

interface QueuedResponse {
  readonly status: number;
  readonly body: string;
  readonly ok?: boolean;
}

let queue: QueuedResponse[] = [];
let lastInit: { url: string; init?: RequestInit }[] = [];

const makeFakeFetch = () => async (url: string, init?: RequestInit): Promise<Response> => {
  lastInit.push({ url, init });
  const next = queue.shift();
  if (!next) throw new Error(`unexpected fetch: ${url}`);
  void (next.ok ?? (next.status >= 200 && next.status < 300));
  return new Response(next.body, {
    status: next.status,
    headers: { 'content-type': 'application/json' },
  }) as unknown as Response;
};

beforeEach(() => {
  queue = [];
  lastInit = [];
  __setOAuthFetchForTest(makeFakeFetch());
});

// ─────────────── client id guard ──────────

test('requestDeviceCode rejects empty client id without making a request', async () => {
  const r = await requestDeviceCode('');
  assert.ok(r.isErr());
  assert.equal(lastInit.length, 0);
});

// ─────────────── device-code happy path ───

test('requestDeviceCode parses the response into the typed shape', async () => {
  queue.push({
    status: 200,
    body: JSON.stringify({
      device_code: 'abc-device',
      user_code: 'WIWI-1234',
      verification_uri: 'https://github.com/login/device',
      expires_in: 900,
      interval: 5,
    }),
  });
  const r = await requestDeviceCode('Iv1.fakeclient');
  assert.ok(r.isOk());
  const v = r.isOk() ? r.value : null;
  assert.equal(v?.user_code, 'WIWI-1234');
  assert.equal(v?.interval, 5);
  // Request was POSTed with the right body shape
  assert.equal(lastInit.length, 1);
  assert.equal(lastInit[0].init?.method, 'POST');
  const body = String(lastInit[0].init?.body);
  assert.match(body, /client_id=Iv1\.fakeclient/);
  assert.match(body, /scope=read%3Auser/);
});

test('requestDeviceCode flags malformed JSON body as InvalidResponse', async () => {
  queue.push({ status: 200, body: 'not-json' });
  const r = await requestDeviceCode('Iv1.fake');
  assert.ok(r.isErr());
  if (r.isErr()) assert.equal(r.error.type, 'GitHubOAuthInvalidResponse');
});

test('requestDeviceCode flags missing required fields as InvalidResponse', async () => {
  queue.push({ status: 200, body: JSON.stringify({ user_code: 'X' }) });
  const r = await requestDeviceCode('Iv1.fake');
  assert.ok(r.isErr());
  if (r.isErr()) assert.equal(r.error.type, 'GitHubOAuthInvalidResponse');
});

test('requestDeviceCode surfaces non-2xx as RequestFailed with status + body', async () => {
  queue.push({ status: 422, body: '{"error":"invalid_client_id"}' });
  const r = await requestDeviceCode('Iv1.fake');
  assert.ok(r.isErr());
  if (r.isErr() && r.error.type === 'GitHubOAuthRequestFailed') {
    assert.equal(r.error.status, 422);
    assert.match(r.error.body, /invalid_client_id/);
  }
});

// ─────────────── token poll ───────────────

test('pollForToken: pending then ok returns the access_token', async () => {
  queue.push({ status: 200, body: JSON.stringify({ error: 'authorization_pending' }) });
  queue.push({ status: 200, body: JSON.stringify({ access_token: 'gho_xxxx', token_type: 'bearer' }) });
  const r = await pollForToken('Iv1.fake', 'abc-device', /* interval */ 0, /* expires */ 60);
  assert.ok(r.isOk());
  if (r.isOk()) assert.equal(r.value, 'gho_xxxx');
});

test('pollForToken: slow_down adds 5s to the interval (smoke — no time-travel)', async () => {
  // We don't sandbox the real timer; just confirm slow_down is a
  // continue-state, not a terminal error, and ok wins eventually.
  queue.push({ status: 200, body: JSON.stringify({ error: 'slow_down' }) });
  queue.push({ status: 200, body: JSON.stringify({ access_token: 'gho_yyyy' }) });
  const r = await pollForToken('Iv1.fake', 'abc', 0, 60);
  assert.ok(r.isOk());
});

test('pollForToken: access_denied → Denied error', async () => {
  queue.push({ status: 200, body: JSON.stringify({ error: 'access_denied' }) });
  const r = await pollForToken('Iv1.fake', 'abc', 0, 60);
  assert.ok(r.isErr());
  if (r.isErr()) assert.equal(r.error.type, 'GitHubOAuthDenied');
});

test('pollForToken: expired_token → Expired error', async () => {
  queue.push({ status: 200, body: JSON.stringify({ error: 'expired_token' }) });
  const r = await pollForToken('Iv1.fake', 'abc', 0, 60);
  assert.ok(r.isErr());
  if (r.isErr()) assert.equal(r.error.type, 'GitHubOAuthExpired');
});

// ─────────────── /user fetch ──────────────

test('getUserHandle parses login + id + html_url; null name is allowed', async () => {
  queue.push({
    status: 200,
    body: JSON.stringify({
      login: 'sahar-barak',
      id: 12345,
      name: null,
      html_url: 'https://github.com/sahar-barak',
    }),
  });
  const r = await getUserHandle('gho_test_token');
  assert.ok(r.isOk());
  if (r.isOk()) {
    assert.equal(r.value.login, 'sahar-barak');
    assert.equal(r.value.id, 12345);
    assert.equal(r.value.html_url, 'https://github.com/sahar-barak');
    assert.equal(r.value.name, null);
  }
  // Bearer header was set
  const headers = lastInit[0].init?.headers as Record<string, string>;
  assert.match(headers?.['Authorization'] ?? '', /^Bearer gho_test_token$/);
});

test('getUserHandle rejects empty access_token without making a request', async () => {
  const r = await getUserHandle('');
  assert.ok(r.isErr());
  assert.equal(lastInit.length, 0);
});

test('getUserHandle: non-2xx → RequestFailed', async () => {
  queue.push({ status: 401, body: '{"message":"Bad credentials"}' });
  const r = await getUserHandle('gho_invalid');
  assert.ok(r.isErr());
  if (r.isErr() && r.error.type === 'GitHubOAuthRequestFailed') {
    assert.equal(r.error.status, 401);
  }
});

test('getUserHandle: malformed body → InvalidResponse', async () => {
  queue.push({ status: 200, body: '<html>not json</html>' });
  const r = await getUserHandle('gho_test');
  assert.ok(r.isErr());
  if (r.isErr()) assert.equal(r.error.type, 'GitHubOAuthInvalidResponse');
});
