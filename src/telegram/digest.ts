/**
 * Outbound digest — post-tick summary sent to Telegram.
 *
 * After each daemon tick, format a digest of what was fetched and
 * send it via the bot. One message per room, top-N new items.
 */

import type { RoomRun } from '../domain/sources.js';
import type { WellinformedBot } from './bot.js';

export const sendDigest = async (
  bot: WellinformedBot,
  runs: readonly RoomRun[],
  topN = 3,
): Promise<void> => {
  for (const run of runs) {
    const totalNew = run.runs.reduce((s, r) => s + r.items_new, 0);
    if (totalNew === 0) continue; // skip rooms with no new content

    const lines: string[] = [
      `*Daily digest: ${run.room}*`,
      `${totalNew} new items across ${run.runs.length} sources\n`,
    ];

    // Show top sources with new items
    const withNew = run.runs
      .filter((r) => r.items_new > 0)
      .sort((a, b) => b.items_new - a.items_new)
      .slice(0, topN);

    for (const r of withNew) {
      lines.push(`• ${r.source_id} (${r.kind}): +${r.items_new} new`);
    }

    lines.push(`\n_Run \`report ${run.room}\` for the full breakdown._`);

    await bot.sendMessage(lines.join('\n'));
  }
};
