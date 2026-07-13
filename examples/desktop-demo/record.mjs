import { chromium } from 'playwright-core';

const scene = process.argv[2];
const outDir = process.argv[3] || './out';
const seconds = Number(process.argv[4] || 30);
const W = Number(process.argv[5] || 1920);
const H = Number(process.argv[6] || 1200);
const zoom = process.argv[7] || '1.5';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
  recordVideo: { dir: outDir, size: { width: W, height: H } },
});
const page = await context.newPage();
await page.goto('file://' + scene + '?zoom=' + zoom);
await page.waitForTimeout(seconds * 1000);
await context.close();
await browser.close();
console.log('done');
