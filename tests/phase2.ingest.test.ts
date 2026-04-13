/**
 * Phase 2 acceptance test — full ingest pipeline on a local RSS fixture.
 *
 *  1. Write a local RSS 2.0 fixture to a tmp file
 *  2. Register a `generic_rss` SourceDescriptor pointing at file://<tmp>
 *  3. Run triggerRoom('homelab')
 *  4. Assert:
 *     - 3 new items (one chunk each for small bodies)
 *     - graph.json has 3 nodes with source_uri + content_sha256 + fetched_at
 *     - vector index has 3 vectors
 *     - re-running trigger yields 0 new, 0 updated, 3 skipped (dedup)
 *     - mutating the fixture then re-running yields 0 new, 1 updated, 2 skipped
 *
 * Uses the fixture embedder so the test is hermetic (no model download,
 * no network).
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

import { fileGraphRepository } from '../src/infrastructure/graph-repository.js';
import { openSqliteVectorIndex } from '../src/infrastructure/vector-index.js';
import { fixtureEmbedder } from '../src/infrastructure/embedders.js';
import { httpFetcher } from '../src/infrastructure/http/fetcher.js';
import { xmlParser } from '../src/infrastructure/parsers/xml-parser.js';
import { readabilityExtractor } from '../src/infrastructure/parsers/html-extractor.js';
import { sourceRegistry } from '../src/infrastructure/sources/registry.js';
import { fileSourcesConfig } from '../src/infrastructure/sources-config.js';
import { triggerRoom } from '../src/application/ingest.js';
import type { IngestDeps } from '../src/application/ingest.js';
import type { SourceDescriptor } from '../src/domain/sources.js';

const rssFixture = (ver: 'v1' | 'v2'): string => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Homelab Weekly</title>
    <link>https://example.com/homelab</link>
    <description>Home lab news and notes</description>
    <item>
      <title>Mikrotik CHR licensing explained</title>
      <link>https://example.com/homelab/mikrotik-chr</link>
      <description>Mikrotik CHR runs RouterOS inside VMware or Proxmox. The free tier caps you at 1 Mbps upload; the perpetual license removes the cap and also unlocks the TR-069 remote management features. This post walks through licensing choices for homelab operators.</description>
      <pubDate>Tue, 01 Apr 2026 10:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Proxmox PCIe passthrough deep dive</title>
      <link>https://example.com/homelab/proxmox-passthrough</link>
      <description>${ver === 'v1' ? 'Proxmox PCIe passthrough requires IOMMU groups to be isolated so the guest can claim the device. Check /sys/kernel/iommu_groups/ after enabling VT-d or AMD-Vi in BIOS.' : 'REWRITTEN: PCIe passthrough on Proxmox needs clean IOMMU groups. This updated post covers the BIOS toggles, the vfio-pci modprobe config, and a checklist for dirty groups.'}</description>
      <pubDate>Wed, 02 Apr 2026 10:00:00 GMT</pubDate>
    </item>
    <item>
      <title>10GbE DAC vs fibre cost analysis</title>
      <link>https://example.com/homelab/10gbe-dac-vs-fibre</link>
      <description>DAC cables are cheaper per port but capped at 7m; fibre costs 2x but scales to 300m+. For most homelabs the DAC break-even is at 2-3 ports.</description>
      <pubDate>Thu, 03 Apr 2026 10:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>
`;

test('phase 2: generic_rss ingest — fetch, chunk, index, dedup, update', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'wellinformed-phase2-'));
  try {
    // ── arrange ──

    const feedPath = join(tmp, 'feed.xml');
    writeFileSync(feedPath, rssFixture('v1'));
    const feedUrl = pathToFileURL(feedPath).toString();

    const graphPath = join(tmp, 'graph.json');
    const vectorPath = join(tmp, 'vectors.db');
    const sourcesPath = join(tmp, 'sources.json');

    const graphs = fileGraphRepository(graphPath);
    const vectors = (await openSqliteVectorIndex({ path: vectorPath }))._unsafeUnwrap();
    const embedder = fixtureEmbedder();
    const sources = fileSourcesConfig(sourcesPath);
    const http = httpFetcher();
    const xml = xmlParser();
    const html = readabilityExtractor();
    const registry = sourceRegistry({
      http,
      xml,
      html,
      claudeSessions: { homePath: '/tmp', patterns: [], scanUserMessages: false, nowMs: () => Date.now() },
    });

    const deps: IngestDeps = { graphs, vectors, embedder, sources, registry };

    const descriptor: SourceDescriptor = {
      id: 'homelab-weekly',
      kind: 'generic_rss',
      room: 'homelab',
      wing: 'network',
      enabled: true,
      config: { feed_url: feedUrl, max_items: 10 },
    };
    (await sources.add(descriptor))._unsafeUnwrap();

    // ── act 1 — first run ──

    const run1 = (await triggerRoom(deps)('homelab'))._unsafeUnwrap();
    assert.equal(run1.runs.length, 1);
    const s1 = run1.runs[0];
    assert.equal(s1.error, undefined, `first run should not error, got ${JSON.stringify(s1.error)}`);
    assert.equal(s1.items_seen, 3);
    assert.equal(s1.items_new, 3, 'first run — all 3 items should be new');
    assert.equal(s1.items_updated, 0);
    assert.equal(s1.items_skipped, 0);

    // graph should contain 3 nodes with wellinformed fields set
    const afterRun1 = (await graphs.load())._unsafeUnwrap();
    assert.equal(afterRun1.json.nodes.length, 3);
    for (const node of afterRun1.json.nodes) {
      assert.equal(node.room, 'homelab', `node ${node.id} should be in homelab`);
      assert.ok(node.source_uri, `node ${node.id} must have source_uri`);
      assert.ok(node.fetched_at, `node ${node.id} must have fetched_at`);
      assert.ok(node.content_sha256, `node ${node.id} must have content_sha256`);
      assert.equal(node.embedding_id, node.id, 'embedding_id should equal the node id');
    }
    assert.equal(vectors.size(), 3, 'vector index should have 3 embeddings');

    // ── act 2 — idempotent re-run (no changes) ──

    const run2 = (await triggerRoom(deps)('homelab'))._unsafeUnwrap();
    const s2 = run2.runs[0];
    assert.equal(s2.error, undefined);
    assert.equal(s2.items_seen, 3);
    assert.equal(s2.items_new, 0, 're-run should produce 0 new items');
    assert.equal(s2.items_updated, 0, 're-run should produce 0 updated items');
    assert.equal(s2.items_skipped, 3, 're-run should skip all 3 items');

    const afterRun2 = (await graphs.load())._unsafeUnwrap();
    assert.equal(afterRun2.json.nodes.length, 3, 'node count must not grow on re-run');
    assert.equal(vectors.size(), 3, 'vector index must not grow on re-run');

    // ── act 3 — mutate one item's body and re-run ──

    writeFileSync(feedPath, rssFixture('v2'));
    const run3 = (await triggerRoom(deps)('homelab'))._unsafeUnwrap();
    const s3 = run3.runs[0];
    assert.equal(s3.error, undefined);
    assert.equal(s3.items_seen, 3);
    assert.equal(s3.items_new, 0);
    assert.equal(s3.items_updated, 1, 'exactly one item body changed');
    assert.equal(s3.items_skipped, 2, 'the other two are unchanged and should be skipped');

    const afterRun3 = (await graphs.load())._unsafeUnwrap();
    assert.equal(afterRun3.json.nodes.length, 3, 'node count still 3 after update');
    const mutated = afterRun3.json.nodes.find(
      (n) => n.source_uri === 'https://example.com/homelab/proxmox-passthrough',
    );
    assert.ok(mutated);
    const hashRun1 = (afterRun1.json.nodes.find(
      (n) => n.source_uri === 'https://example.com/homelab/proxmox-passthrough',
    ) as { content_sha256: string } | undefined)?.content_sha256;
    assert.notEqual(
      (mutated as { content_sha256: string }).content_sha256,
      hashRun1,
      'content_sha256 should have changed for the rewritten item',
    );

    vectors.close();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
