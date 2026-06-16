/**
 * Cloudflare Pages Function — stamps a __cfbot cookie with the request's
 * Cloudflare bot signal so the client can report it to GA4 (event: bot_check).
 *
 * Value format: "<score>:<verified>"  e.g. "12:0" or ":1"
 *  - score: cf.botManagement.score (1=bot … 99=human) when Bot Management is
 *    available; empty string on plans without scoring (Bot Fight Mode only).
 *  - verified: 1 if Cloudflare recognises a verified good bot (Googlebot etc.).
 *
 * Runs on every response; cookie is short-lived and SameSite=Lax.
 */
export async function onRequest(context) {
  const { request, next } = context;
  const res = await next();

  const cf = request.cf || {};
  const bm = cf.botManagement || {};
  const score = bm.score != null ? bm.score : '';
  const verified = bm.verifiedBot ? 1 : 0;

  const out = new Response(res.body, res);
  out.headers.append(
    'Set-Cookie',
    `__cfbot=${score}:${verified}; Path=/; Max-Age=1800; SameSite=Lax`
  );
  return out;
}
