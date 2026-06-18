/**
 * `folklore weights [--json]` — report the learned satisfaction-component
 * weights (RFC-0003 OQ#5 / night-queue #3).
 *
 * The satisfaction scorer splits a fixed equal weight across the trust
 * components. `learnWeights` (a Fisher-style discriminant over labelled
 * shadow-search receipts) can replace that equal split with a data-derived
 * vector — but only once enough labelled receipts exist AND
 * FOLKLORE_LEARN_WEIGHTS=1. This command surfaces what the learner WOULD
 * produce right now: the weight vector, whether it actually learned or fell
 * back to the equal split, why, and how many labelled samples it used.
 *
 * Read-only — it does not change the live scorer. Live application of learned
 * weights is gated separately and is a no-op until labelled receipts exist
 * (run with FOLKLORE_SHADOW_SEARCH=1, then label the receipts).
 */

import { folkloreHome } from '../runtime.js';
import { readShadowReceipts, loadLearnedWeights } from '../../infrastructure/shadow-receipt-store.js';

const USAGE = `usage: folklore weights [--json]

  Report the learned satisfaction-component weights from labelled shadow
  receipts. Shows the weight vector, whether learning fired or fell back to
  the equal split, and the sample count.

  Learning requires FOLKLORE_LEARN_WEIGHTS=1 and enough labelled receipts
  (collected via FOLKLORE_SHADOW_SEARCH=1). Until then the report shows the
  equal-split fallback — which is exactly what the live scorer uses.

  --json   machine-readable report on stdout`;

export const weights = async (args: readonly string[]): Promise<number> => {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(USAGE);
    return 0;
  }
  const json = args.includes('--json');
  const home = folkloreHome();
  const receiptCount = readShadowReceipts(home).length;
  // Force enabled here so the report reflects what learning WOULD yield even
  // when the live flag is off — the report is diagnostic, not the live path.
  const result = loadLearnedWeights(home, { enabled: true });

  if (json) {
    console.log(JSON.stringify({ ...result, receipts_on_disk: receiptCount }, null, 2));
    return 0;
  }

  const flagOn = process.env.FOLKLORE_LEARN_WEIGHTS === '1';
  console.log('# folklore learned weights');
  console.log(`live flag:       FOLKLORE_LEARN_WEIGHTS=${flagOn ? '1 (applied)' : '0 (equal split live)'}`);
  console.log(`receipts:        ${receiptCount} on disk`);
  console.log(`learned:         ${result.learned ? 'yes' : `no — ${result.fallback_reason}`}`);
  console.log(`samples used:    ${result.samples_used}`);
  console.log('weights:');
  for (const [name, w] of Object.entries(result.weights)) {
    console.log(`  ${name.padEnd(11)} ${(w as number).toFixed(3)}`);
  }
  if (!result.learned) {
    console.log('');
    console.log('  (equal split — collect labelled receipts via FOLKLORE_SHADOW_SEARCH=1 to learn.)');
  }
  return 0;
};
