/**
 * `wellinformed gc` — long-term-memory garbage collection.
 *
 * Walks tier nodes (`session://`, `synthesis://`, `decision://`),
 * classifies each via retention scoring, and either reports
 * (`gc list`) or applies (`gc apply`) the plan.
 *
 * Subcommands:
 *   list  [--demote-band <cold|frozen>] [--min-age-days N]
 *         [--skip-contradictions] [--json]
 *   apply [--demote-band ...] [--min-age-days N]
 *         [--skip-contradictions] [--json]
 *   help
 *
 * Local-only: never propagates a delete to peers. The auto-forget
 * planner is pure and lives in src/domain/auto-forget.ts; the orch
 * in src/application/auto-forget-tick.ts.
 */

import { formatError } from '../../domain/errors.js';
import { defaultRuntime } from '../runtime.js';
import { runAutoForgetTick } from '../../application/auto-forget-tick.js';
import type { AutoForgetConfig, AutoForgetReport } from '../../application/auto-forget-tick.js';

// ─────────────── arg parse ─────────────

interface ParsedFlags {
  readonly dryRun: boolean;
  readonly config: AutoForgetConfig;
  readonly json: boolean;
}

const parseFlags = (args: readonly string[], dryRun: boolean): ParsedFlags | string => {
  let demoteBand: 'cold' | 'frozen' | undefined;
  let minAgeDays: number | undefined;
  let skipContradictions = false;
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') { json = true; continue; }
    if (a === '--skip-contradictions') { skipContradictions = true; continue; }
    if (a === '--demote-band') {
      const v = args[++i];
      if (v !== 'cold' && v !== 'frozen') return `--demote-band must be cold|frozen, got '${v}'`;
      demoteBand = v;
      continue;
    }
    if (a === '--min-age-days') {
      const v = Number(args[++i]);
      if (!Number.isFinite(v) || v < 0) return `--min-age-days must be a non-negative number`;
      minAgeDays = v;
      continue;
    }
    return `unknown flag: ${a}`;
  }
  return {
    dryRun,
    json,
    config: {
      ...(demoteBand !== undefined ? { demoteBand } : {}),
      ...(minAgeDays !== undefined ? { demoteMinAgeDays: minAgeDays } : {}),
      skipContradictions,
    },
  };
};

// ─────────────── render ─────────────

const renderReport = (report: AutoForgetReport): string => {
  const lines: string[] = [];
  const verdict = report.dryRun ? 'DRY-RUN' : 'APPLIED';
  lines.push(`gc ${verdict} — ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`  nodes inspected:  ${report.plan.stats.nodesInspected}`);
  lines.push(`  tiered nodes:     ${report.plan.stats.tieredNodes}`);
  lines.push(`  planned deletes:  ${report.plan.stats.deletes}`);
  lines.push(`  planned demotes:  ${report.plan.stats.demotes}`);
  lines.push(`  contradictions:   ${report.plan.stats.contradictions}`);
  if (!report.dryRun) {
    lines.push('');
    lines.push(`  applied deletes:  ${report.applied.deleted.length}`);
    lines.push(`  applied demotes:  ${report.applied.demoted.length}`);
    if (report.applied.errors.length > 0) {
      lines.push(`  application errors: ${report.applied.errors.length}`);
      for (const e of report.applied.errors.slice(0, 5)) {
        lines.push(`    - ${e.nodeId}: ${e.message}`);
      }
    }
  }
  if (report.plan.items.length > 0) {
    lines.push('');
    lines.push(`  plan (first 20):`);
    for (const item of report.plan.items.slice(0, 20)) {
      const tag = item.action === 'delete' ? 'DEL' : 'DEM';
      const reason = (item as { reason: string }).reason;
      lines.push(`    ${tag}  ${item.tier.padEnd(11)}  ${reason.padEnd(24)}  ${item.nodeId}`);
    }
    if (report.plan.items.length > 20) {
      lines.push(`    ... and ${report.plan.items.length - 20} more`);
    }
  }
  return lines.join('\n');
};

// ─────────────── handlers ─────────────

const runSub = async (args: readonly string[], dryRun: boolean): Promise<number> => {
  const flagsRes = parseFlags(args, dryRun);
  if (typeof flagsRes === 'string') {
    console.error(`gc: ${flagsRes}`);
    console.error(`  see: wellinformed gc help`);
    return 1;
  }
  const flags = flagsRes;

  const rtRes = await defaultRuntime();
  if (rtRes.isErr()) {
    console.error(`gc: runtime init failed — ${formatError(rtRes.error)}`);
    return 1;
  }
  const rt = rtRes.value;

  const out = await runAutoForgetTick({
    graphs: rt.graphs,
    vectors: rt.vectors,
  })({ dryRun: flags.dryRun, config: flags.config });

  if (out.isErr()) {
    console.error(`gc: ${formatError(out.error)}`);
    return 1;
  }

  if (flags.json) {
    process.stdout.write(JSON.stringify(out.value, null, 2) + '\n');
  } else {
    console.log(renderReport(out.value));
  }
  return 0;
};

const printGcHelp = (): void => {
  console.log(`wellinformed gc — long-term memory garbage collection

Subcommands:
  list   [flags]   Dry-run plan: show what would be deleted / demoted
  apply  [flags]   Apply the plan: hard-delete TTL nodes, demote frozen ones

Flags:
  --demote-band {cold|frozen}   Retention band that triggers demote (default: frozen)
  --min-age-days N              Minimum age (days) before demote eligible (default: 30)
  --skip-contradictions         Skip the O(N²) contradiction pass
  --json                        Emit machine-readable JSON

Behaviour:
  Only tier nodes (session://, synthesis://, decision://) are touched.
  observation tier (file://, https://, arxiv://, etc.) is governed by
  source-adapter retention and is NEVER acted on by 'gc'.

  Deletes are hard-remove + vector index cleanup. Demotes set
  isLatest=false so retrieval drops the node but audit still has it.

  Local only: gc never propagates a delete to peers. Federation is
  eventually-consistent on content, not on delete operations.
`);
};

// ─────────────── entry ─────────────

export const gc = async (args: readonly string[]): Promise<number> => {
  const [sub, ...rest] = args;
  switch (sub) {
    case undefined:
    case 'help':
    case '-h':
    case '--help':
      printGcHelp();
      return 0;
    case 'list':
      return runSub(rest, true);
    case 'apply':
      return runSub(rest, false);
    default:
      console.error(`gc: unknown subcommand '${sub}'`);
      console.error(`  see: wellinformed gc help`);
      return 1;
  }
};
