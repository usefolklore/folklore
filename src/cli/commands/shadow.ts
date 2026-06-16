/**
 * `folklore shadow` — report the shadow-search calibration receipts
 * (RFC-0003 OQ#5). Reads the bounded local jsonl the federated path
 * writes when FOLKLORE_SHADOW_SEARCH=1 and prints the aggregate: how
 * often the breakpoint skipped, the would-shadow rate, mean coverage,
 * and BadSkipRate once receipts are labelled.
 *
 * `--json` for the machine shape; default is a compact human block.
 */

import { folkloreHome } from '../runtime.js';
import { readShadowReceipts } from '../../infrastructure/shadow-receipt-store.js';
import { summarizeReceipts } from '../../domain/shadow-receipt.js';

export const shadowCmd = async (args: string[]): Promise<number> => {
  const json = args.includes('--json');
  const receipts = readShadowReceipts(folkloreHome());
  const s = summarizeReceipts(receipts);

  if (json) {
    console.log(JSON.stringify(s));
    return 0;
  }

  if (s.total === 0) {
    console.log('# folklore shadow receipts');
    console.log('none yet. enable with FOLKLORE_SHADOW_SEARCH=1 and run federated queries.');
    return 0;
  }

  const pct = (n: number): string => `${Math.round(n * 100)}%`;
  console.log('# folklore shadow receipts');
  console.log(`receipts:        ${s.total} (${s.labelled} labelled)`);
  console.log(`skip rate:       ${pct(s.skip_rate)} (use_memory — web skipped)`);
  console.log(`would-shadow:    ${pct(s.would_shadow_rate)} (escalating decisions worth a shadow pass)`);
  console.log(
    `avg coverage:    ${s.avg_coverage_ratio === null ? 'n/a' : pct(s.avg_coverage_ratio)} (borderline queries)`,
  );
  console.log(`bad-skip rate:   ${s.bad_skip_rate === null ? 'n/a (label receipts first)' : pct(s.bad_skip_rate)}`);
  const decisions = Object.entries(s.by_decision)
    .map(([d, n]) => `${d}=${n}`)
    .join(' · ');
  console.log(`by decision:     ${decisions}`);
  return 0;
};
