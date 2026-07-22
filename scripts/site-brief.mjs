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
const OS_LABEL = [
  [/universal\.dmg$/, 'macOS'],
  [/setup\.exe$/, 'Windows'],
  [/\.msi$/, 'Windows MSI'],
  [/\.AppImage$/, 'Linux'],
  [/\.deb$/, 'Debian'],
];
const dl = (desktop?.assets || [])
  .filter((a) => !a.name.endsWith('.tar.gz')) // updater artifact, not a human download
  .map((a) => ({
    name: (OS_LABEL.find(([re]) => re.test(a.name)) || [null, a.name])[1],
    n: a.download_count,
  }));
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

/**
 * Brand shell — the site's visual language translated to email-safe HTML:
 * paper #f4ecd8, ink #1d1813 3px borders, yellow stamp, mono uppercase labels,
 * pink-rail "shipped" block. Tables + inline styles only (Gmail strips the
 * rest); box-shadow is progressive enhancement for clients that keep it.
 */
const SERIF = "Georgia,'Times New Roman',serif";
const MONO = "'Courier New',Courier,monospace";
const INK = '#1d1813';
const PAPER = '#f4ecd8';
const PAPER2 = '#ece0c2';
const MUTED = '#5c4f3a';
const PINK = '#ff4f6d';
const BLUE = '#2b3a8c';
const YELLOW = '#f5b921';

const statRow = (label, value, last = false) => `
  <tr>
    <td style="padding:11px 16px 11px 0;font-family:${MONO};font-size:10px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:${MUTED};vertical-align:top;white-space:nowrap;${last ? '' : `border-bottom:2px solid ${INK};`}">${label}</td>
    <td style="padding:11px 0;font-family:${SERIF};font-size:16px;font-weight:bold;color:${INK};${last ? '' : `border-bottom:2px solid ${INK};`}">${value}</td>
  </tr>`;

const shipped = commits.length
  ? commits
      .map((c) => {
        const first = c.commit.message.split('\n')[0];
        const msg = first.length > 72 ? first.slice(0, 70).trimEnd() + '&hellip;' : first;
        return `<tr><td style="padding:7px 0;font-family:${SERIF};font-size:14px;line-height:1.5;color:${INK}">
          <a href="${c.html_url}" style="font-family:${MONO};font-size:12px;font-weight:bold;color:${BLUE};text-decoration:underline">${c.sha.slice(0, 7)}</a>
          &nbsp;${msg}</td></tr>`;
      })
      .join('')
  : `<tr><td style="padding:7px 0;font-family:${SERIF};font-size:14px;font-style:italic;color:${MUTED}">no site commits this week. The graph rested</td></tr>`;

const today = new Date().toISOString().slice(0, 10);

const html = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};padding:0;margin:0">
<tr><td align="center" style="padding:34px 14px 44px">

  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

    <!-- masthead -->
    <tr><td style="padding:0 4px 16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-family:${SERIF};font-size:34px;font-weight:bold;letter-spacing:-1px;color:${INK}">folklore</td>
        <td align="right" style="vertical-align:middle">
          <span style="display:inline-block;background:${YELLOW};border:2px solid ${INK};padding:6px 12px;font-family:${MONO};font-size:10px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:${INK};box-shadow:3px 3px 0 ${INK}">Daily brief · ${today}</span>
        </td>
      </tr></table>
    </td></tr>

    <!-- the numbers card -->
    <tr><td style="background:${PAPER2};border:3px solid ${INK};box-shadow:6px 6px 0 ${INK};padding:20px 24px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${statRow('Stars', `${repo.stargazers_count} &#9733; &nbsp;&middot;&nbsp; ${repo.forks_count} forks &nbsp;&middot;&nbsp; ${repo.subscribers_count} watching`)}
        ${statRow('Site repo, yesterday', `${vy.count} views (${vy.uniques} unique) &nbsp;&middot;&nbsp; ${cy.count} clones`)}
        ${statRow('App downloads', `<span style="font-size:22px">${dlTotal}</span>&nbsp; <span style="font-family:${MONO};font-size:11px;font-weight:normal;color:${MUTED}">${dl.map((a) => `${a.name} ${a.n}`).join(' &middot; ')}</span>`)}
        ${statRow('npm installs, 7d', `${npmDl?.downloads ?? 'n/a'}`)}
        ${statRow('Open issues + PRs', `${repo.open_issues_count}`)}
        ${statRow('Latest release', desktop ? `<a href="${desktop.html_url}" style="color:${BLUE};text-decoration:underline">${desktop.tag_name}</a> &nbsp;<span style="font-family:${MONO};font-size:11px;font-weight:normal;color:${MUTED}">${new Date(desktop.published_at).toISOString().slice(0, 10)} · signed &amp; notarized</span>` : 'none', true)}
      </table>
    </td></tr>

    <!-- shipped -->
    <tr><td style="padding:26px 4px 8px;font-family:${MONO};font-size:11px;font-weight:bold;letter-spacing:2.5px;text-transform:uppercase;color:${INK}">Shipped on the site &middot; 7 days</td></tr>
    <tr><td style="border-left:5px solid ${PINK};background:${PAPER2};padding:10px 18px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${shipped}</table>
    </td></tr>

    <!-- footer -->
    <tr><td style="padding:26px 4px 0;font-family:${MONO};font-size:11px;color:${MUTED}">
      <a href="https://usefolklore.sh" style="color:${BLUE};text-decoration:underline">usefolklore.sh</a>
      &nbsp;&middot;&nbsp; <a href="https://github.com/${REPO}" style="color:${BLUE};text-decoration:underline">github</a>
      &nbsp;&middot;&nbsp; knowledge travels mouth to ear
    </td></tr>

  </table>
</td></tr>
</table>`;

if (process.env.DRY_RUN) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(process.env.DRY_RUN, html);
  console.log('dry run — html written to', process.env.DRY_RUN);
  process.exit(0);
}

const send = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    from: FROM,
    to: [TO],
    subject: `folklore · ${repo.stargazers_count}★ · ${vy.count} views · ${dlTotal} app downloads`,
    html,
  }),
});
const out = await send.json().catch(() => ({}));
if (!send.ok) {
  console.error('resend error', send.status, out);
  process.exit(1);
}
console.log('brief sent', out.id || '');
