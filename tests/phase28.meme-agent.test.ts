/**
 * Phase 28 / Plan 28-02 — meme-agent (AGENT-01).
 *
 * Covers the no-credit SVG generator, caption override + truncation,
 * the higgsfield-off gate, and the dry-run pipeline (generate → no
 * post → append). All file I/O is sandboxed under os.tmpdir(); the
 * real site/assets is never touched.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { generateMeme } from '../src/agents/meme-agent/generate.js';
import { runMemeAgent } from '../src/agents/meme-agent/pipeline.js';
import { MAX_CAPTION, type MemeAgentConfig } from '../src/agents/meme-agent/types.js';

/** Build an isolated site/assets sandbox with one base art png. */
const sandbox = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'meme-agent-'));
  const gen = join(root, 'gen');
  mkdirSync(gen, { recursive: true });
  // a tiny stand-in for the base folk art
  writeFileSync(join(gen, 'meme-amnesia.png'), 'PNG');
  return root;
};

test('generate-svg: default no-credit path writes an SVG and returns Ok(MemeEntry)', async () => {
  const assets = sandbox();
  const cfg: MemeAgentConfig = { dryRun: true, useHiggsfield: false, siteAssetsDir: assets };

  const res = await generateMeme(cfg);
  assert.ok(res.isOk(), 'generateMeme should be Ok on the SVG path');
  const entry = res._unsafeUnwrap();

  assert.equal(entry.source, 'svg');
  assert.match(entry.image, /^assets\/gen\/agent-.*\.svg$/, 'image is a relative svg path under assets/gen');
  // the file the relative path points at actually exists on disk
  const onDisk = join(assets, entry.image.replace(/^assets\//, ''));
  assert.ok(existsSync(onDisk), 'the SVG file exists on disk');
  const svg = readFileSync(onDisk, 'utf8');
  assert.match(svg, /<svg/, 'output is an svg');
  assert.match(svg, /<image[^>]+meme-amnesia\.png/, 'svg references the base art relatively');
});

test('text-override-truncate: config.text becomes the caption and is clamped to 280', async () => {
  const assets = sandbox();
  const long = 'x'.repeat(400);
  const cfg: MemeAgentConfig = { dryRun: true, useHiggsfield: false, siteAssetsDir: assets, text: long };

  const res = await generateMeme(cfg);
  assert.ok(res.isOk());
  const entry = res._unsafeUnwrap();
  assert.ok(entry.caption.length <= MAX_CAPTION, `caption ${entry.caption.length} <= ${MAX_CAPTION}`);

  // a short override is preserved verbatim
  const cfg2: MemeAgentConfig = { dryRun: true, useHiggsfield: false, siteAssetsDir: sandbox(), text: 'never research twice' };
  const res2 = await generateMeme(cfg2);
  assert.ok(res2.isOk());
  assert.equal(res2._unsafeUnwrap().caption, 'never research twice');
});

test('higgsfield-off: the default config never shells out to the higgsfield CLI', async () => {
  const assets = sandbox();
  // Sabotage PATH so that IF the CLI were invoked, it would fail —
  // proving the SVG path does not touch child_process.
  const prevPath = process.env.PATH;
  process.env.PATH = '/nonexistent-bin';
  try {
    const cfg: MemeAgentConfig = { dryRun: true, useHiggsfield: false, siteAssetsDir: assets };
    const res = await generateMeme(cfg);
    assert.ok(res.isOk(), 'SVG path succeeds even with a broken PATH (no CLI invoked)');
    assert.equal(res._unsafeUnwrap().source, 'svg');
  } finally {
    process.env.PATH = prevPath;
  }
});

test('dry-run pipeline: generate → no post → append exactly one entry to memes.json', async () => {
  const assets = sandbox();
  // start memes.json with one existing entry
  const memesPath = join(assets, 'memes.json');
  writeFileSync(memesPath, JSON.stringify([{ id: 'seed', caption: 'c', image: 'assets/gen/meme-amnesia.png', alt: 'a', createdAt: '2026-01-01T00:00:00.000Z', source: 'seed' }], null, 2));

  // ensure no X creds leak in from the host env
  const prevId = process.env.X_CLIENT_ID;
  delete process.env.X_CLIENT_ID;
  try {
    const cfg: MemeAgentConfig = { dryRun: true, useHiggsfield: false, siteAssetsDir: assets, text: 'compounding inference' };
    const res = await runMemeAgent(cfg);
    assert.ok(res.isOk(), 'runMemeAgent dry-run is Ok');
    const entry = res._unsafeUnwrap();
    assert.equal(entry.source, 'svg');
    assert.equal(entry.postedUrl, undefined, 'dry-run never sets a postedUrl');

    const after = JSON.parse(readFileSync(memesPath, 'utf8')) as unknown[];
    assert.equal(after.length, 2, 'exactly one entry appended (1 → 2)');
  } finally {
    if (prevId !== undefined) process.env.X_CLIENT_ID = prevId;
  }
});

test('dry-run pipeline: starts a fresh array when memes.json is absent', async () => {
  const assets = sandbox();
  assert.ok(!existsSync(join(assets, 'memes.json')), 'precondition: no memes.json');
  const prevId = process.env.X_CLIENT_ID;
  delete process.env.X_CLIENT_ID;
  try {
    const cfg: MemeAgentConfig = { dryRun: true, useHiggsfield: false, siteAssetsDir: assets };
    const res = await runMemeAgent(cfg);
    assert.ok(res.isOk());
    const arr = JSON.parse(readFileSync(join(assets, 'memes.json'), 'utf8')) as unknown[];
    assert.equal(arr.length, 1, 'fresh array with the one new entry');
    // confirm an svg was actually produced in the sandbox
    assert.ok(readdirSync(join(assets, 'gen')).some((f) => f.endsWith('.svg')), 'svg written to sandbox gen/');
  } finally {
    if (prevId !== undefined) process.env.X_CLIENT_ID = prevId;
  }
});
