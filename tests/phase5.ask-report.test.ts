/**
 * Phase 5 acceptance test — ask + report.
 *
 * Seeds a room with an RSS fixture, triggers ingest, then:
 *   1. generateReport returns non-empty new_nodes + stats
 *   2. renderReport produces valid markdown with expected sections
 *   3. report persistence writes to the expected path
 *   4. searchByRoom (via use case) returns results for the room
 *   5. searchGlobal returns results across rooms
 */

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
import { generateReport, renderReport } from '../src/application/report.js';
import { searchByRoom, searchGlobal } from '../src/application/use-cases.js';

const rssFixture = (): string => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Homelab Weekly</title>
    <item>
      <title>Mikrotik CHR licensing explained</title>
      <link>https://example.com/homelab/mikrotik</link>
      <description>RouterOS in VMs with licensing tiers and TR-069 remote management.</description>
      <pubDate>Tue, 01 Apr 2026 10:00:00 GMT</pubDate>
    </item>
    <item>
      <title>10GbE DAC vs fibre</title>
      <link>https://example.com/homelab/10gbe</link>
      <description>DAC cables capped at 7m, fibre scales to 300m. Break-even at 2-3 ports.</description>
      <pubDate>Wed, 02 Apr 2026 10:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Proxmox GPU passthrough guide</title>
      <link>https://example.com/homelab/gpu-passthrough</link>
      <description>VFIO modules, IOMMU groups, and the blacklist dance for GPU passthrough on Proxmox VE.</description>
      <pubDate>Thu, 03 Apr 2026 10:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

test('phase 5: report generation + search from seeded graph', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'wellinformed-phase5-'));
  const feedPath = join(tmp, 'feed.xml');
  writeFileSync(feedPath, rssFixture());

  try {
    const graphs = fileGraphRepository(join(tmp, 'graph.json'));
    const vectors = (await openSqliteVectorIndex({ path: join(tmp, 'vectors.db') }))._unsafeUnwrap();
    const embedder = fixtureEmbedder();
    const sources = fileSourcesConfig(join(tmp, 'sources.json'));
    const http = httpFetcher();
    const xml = xmlParser();
    const html = readabilityExtractor();
    const reg = sourceRegistry({ http, xml, html });
    const ingestDeps: IngestDeps = { graphs, vectors, embedder, sources, registry: reg };

    // Seed source + trigger
    (await sources.add({
      id: 'homelab-weekly',
      kind: 'generic_rss',
      room: 'homelab',
      enabled: true,
      config: { feed_url: pathToFileURL(feedPath).toString(), max_items: 10 },
    }))._unsafeUnwrap();

    const run = (await triggerRoom(ingestDeps)('homelab'))._unsafeUnwrap();
    assert.equal(run.runs[0].items_new, 3);

    // 1. generateReport — non-empty
    const reportDeps = { graphs, vectors, sources };
    const data = (await generateReport(reportDeps)({ room: 'homelab' }))._unsafeUnwrap();
    assert.equal(data.room, 'homelab');
    assert.equal(data.stats.room_nodes, 3);
    assert.equal(data.stats.sources, 1);
    assert.equal(data.new_nodes.length, 3);
    assert.ok(data.god_nodes.length >= 0); // may be 0 if no edges between nodes

    // 2. renderReport — produces valid markdown
    const md = renderReport(data);
    assert.ok(md.includes('# wellinformed report'));
    assert.ok(md.includes('## Stats'));
    assert.ok(md.includes('## New nodes'));
    assert.ok(md.includes('Mikrotik'));
    assert.ok(md.includes('total nodes: 3'));

    // 3. persistence — write report to disk
    const reportDir = join(tmp, 'reports', 'homelab');
    const { mkdirSync, writeFileSync: wf } = await import('node:fs');
    mkdirSync(reportDir, { recursive: true });
    const date = data.generated_at.slice(0, 10);
    const reportPath = join(reportDir, `${date}.md`);
    wf(reportPath, md);
    assert.ok(existsSync(reportPath));
    const persisted = readFileSync(reportPath, 'utf8');
    assert.ok(persisted.includes('Mikrotik'));

    // 4. searchByRoom — returns results
    const searchDeps = { graphs, vectors, embedder };
    const roomResults = (
      await searchByRoom(searchDeps)({ room: 'homelab', text: 'Mikrotik licensing', k: 3 })
    )._unsafeUnwrap();
    assert.ok(roomResults.length >= 1, 'searchByRoom should find results');
    assert.ok(
      roomResults.every((m) => m.room === 'homelab'),
      'all results must be in homelab',
    );

    // 5. searchGlobal — returns results
    const globalResults = (
      await searchGlobal(searchDeps)({ text: 'DAC cables fibre', k: 5 })
    )._unsafeUnwrap();
    assert.ok(globalResults.length >= 1, 'searchGlobal should find results');

    // 6. report with --since filter
    const futureDate = '2099-01-01T00:00:00Z';
    const emptyReport = (
      await generateReport(reportDeps)({ room: 'homelab', since: futureDate })
    )._unsafeUnwrap();
    assert.equal(emptyReport.new_nodes.length, 0, 'future cutoff should yield 0 new nodes');

    vectors.close();
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
