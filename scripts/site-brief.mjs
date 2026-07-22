#!/usr/bin/env node
/**
 * Daily folklore brief — one email to the ops inbox with the numbers a human
 * reads over coffee: stars, installer downloads, repo traffic, what shipped on
 * the site. Mirrors the pleiad daily-briefing shape (ops recipient, Resend,
 * single HTML table) without the worker: this runs from a GitHub Actions cron.
 *
 * Env: GITHUB_TOKEN (provided by Actions), RESEND_API_KEY (repo secret),
 *      BRIEF_TO (default hi@saharbarak.dev), BRIEF_FROM (verified sender).
 */

const REPO = process.env.GITHUB_REPOSITORY || 'usefolklore/folklore';
const TO = process.env.BRIEF_TO || 'hi@saharbarak.dev';
const FROM = process.env.BRIEF_FROM || 'Folklore Brief <noreply@pleiad.io>';

const gh = async (path) => {
  const r = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
};

const repo = await gh(`/repos/${REPO}`);
const releases = await gh(`/repos/${REPO}/releases?per_page=20`);
const views = await gh(`/repos/${REPO}/traffic/views`).catch(() => null);
const clones = await gh(`/repos/${REPO}/traffic/clones`).catch(() => null);
const commits = await gh(
  `/repos/${REPO}/commits?path=site&per_page=5&since=${new Date(Date.now() - 7 * 864e5).toISOString()}`
).catch(() => []);

const desktop = releases.find((r) => r.tag_name?.startsWith('desktop-v') && !r.draft);
const dl = (desktop?.assets || []).map((a) => ({ name: a.name, n: a.download_count }));
const dlTotal = dl.reduce((s, a) => s + a.n, 0);
const npmDl = await fetch('https://api.npmjs.org/downloads/point/last-week/@usefolklore/folklore')
  .then((r) => (r.ok ? r.json() : null))
  .catch(() => null);

const yesterday = (series) => {
  if (!series) return { count: 0, uniques: 0 };
  const items = series.views || series.clones || [];
  return items[items.length - 1] || { count: 0, uniques: 0 };
};
const vy = yesterday(views);
const cy = yesterday(clones);

const row = (k, v) =>
  `<tr><td style="padding:6px 14px 6px 0;color:#5c4f3a">${k}</td><td style="padding:6px 0;font-weight:600">${v}</td></tr>`;

const shipped = commits.length
  ? commits
      .map(
        (c) =>
          `<li><a href="${c.html_url}" style="color:#2b3a8c">${c.sha.slice(0, 7)}</a> ${c.commit.message.split('\n')[0].slice(0, 80)}</li>`
      )
      .join('')
  : '<li>no site commits this week</li>';

const html = `
<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1d1813">
  <h2 style="font-weight:700">folklore — daily brief</h2>
  <table style="border-collapse:collapse;font-size:15px">
    ${row('Stars', `${repo.stargazers_count} ★ · ${repo.forks_count} forks · ${repo.subscribers_count} watching`)}
    ${row('Repo views (yesterday)', `${vy.count} views · ${vy.uniques} uniques`)}
    ${row('Clones (yesterday)', `${cy.count} · ${cy.uniques} uniques`)}
    ${row('Desktop downloads (all-time)', `${dlTotal} — ${dl.map((a) => `${a.name.replace(/Folklore_[\d.]+_?/, '') || a.name}: ${a.n}`).join(' · ')}`)}
    ${row('npm installs (7d)', npmDl?.downloads ?? 'n/a')}
    ${row('Open issues/PRs', `${repo.open_issues_count}`)}
    ${row('Latest release', desktop ? `${desktop.tag_name} (${new Date(desktop.published_at).toISOString().slice(0, 10)})` : 'none')}
  </table>
  <h3 style="margin-top:22px">shipped on the site (7d)</h3>
  <ul style="font-size:14px;line-height:1.6">${shipped}</ul>
  <p style="color:#5c4f3a;font-size:12px;margin-top:24px">
    usefolklore.sh · sent by .github/workflows/site-brief.yml
  </p>
</div>`;

const send = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    from: FROM,
    to: [TO],
    subject: `folklore brief — ${repo.stargazers_count}★ · ${vy.count} views · ${dlTotal} downloads`,
    html,
  }),
});
const out = await send.json().catch(() => ({}));
if (!send.ok) {
  console.error('resend error', send.status, out);
  process.exit(1);
}
console.log('brief sent', out.id || '');
