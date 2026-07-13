import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';

const scene = process.argv[2];
const outDir = process.argv[3] || './out';
const seconds = Number(process.argv[4] || 30);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
  recordVideo: { dir: outDir, size: { width: 1280, height: 800 } },
});
const page = await context.newPage();
await page.goto('file://' + scene);
await page.waitForTimeout(seconds * 1000);
await context.close();      // flushes the video file
await browser.close();
console.log('done');
