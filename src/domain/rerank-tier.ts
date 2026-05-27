/**
 * Rerank-tier picker — selects the rerank strategy based on host
 * hardware + user env + (eventually) per-query characteristics.
 *
 * Pure domain — takes the `HwCapabilities` shape from infrastructure
 * and the env-shape from process.env (via a thin reader port to keep
 * the function testable). Returns a `RerankPlan` that the application
 * layer follows: which reranker to run, at what head size, with
 * what model.
 *
 * Why a separate module instead of inlining the choice in ask.ts:
 *   - Multiple call sites (interactive `ask`, bench harness, MCP
 *     server, federated dispatcher) all need the same logic.
 *   - The tier-picking heuristics will accumulate over time
 *     (per-query routing, model-quality benchmarks, latency budgets)
 *     and should evolve in one place.
 *   - Testable in isolation against any (hw, env) combination.
 */

import type { HwCapabilities } from '../infrastructure/hw-detect.js';

// ─────────────── tier ladder ─────────────

export type RerankTier =
  | 'none'
  | 'cross-encoder'
  | 'llm-listwise-small'
  | 'llm-listwise-large';

export interface RerankPlan {
  /** Which strategy to run. `none` skips rerank entirely. */
  readonly tier: RerankTier;
  /** Head size — number of top candidates the reranker sees. */
  readonly headSize: number;
  /**
   * Model identifier for the chosen tier — Xenova/ms-marco-MiniLM-L-6-v2
   * for cross-encoder; an Ollama tag like `qwen2.5:1.5b` for LLM tiers.
   * `undefined` for the `none` tier.
   */
  readonly model?: string;
  /** Why this tier was picked — for logging / telemetry / debug. */
  readonly reason: string;
  /** Hard latency budget in ms — used to gate slower tiers. */
  readonly latencyBudgetMs: number;
}

// ─────────────── env shape ─────────────

/**
 * Subset of `process.env` the picker needs. Pulled through a
 * port so unit tests can inject without touching the global env.
 */
export interface RerankEnv {
  /** Force a specific tier. `none` / `cross-encoder` / `llm-listwise-small` / `llm-listwise-large`. */
  readonly override?: RerankTier;
  /** Hard model override (Ollama tag or Xenova HF id). */
  readonly modelOverride?: string;
  /** Latency budget cap in ms — picker won't choose a tier slower than this. */
  readonly latencyBudgetMs?: number;
  /** Head-size override. */
  readonly headSizeOverride?: number;
  /**
   * Master kill-switch — `AKASHIK_RERANK=0` forces `none` tier
   * regardless of hardware (matches the existing env contract in
   * cross-encoder.ts).
   */
  readonly disabled?: boolean;
}

export const rerankEnvFromProcess = (env: NodeJS.ProcessEnv = process.env): RerankEnv => {
  const override = env.AKASHIK_RERANK_TIER as RerankTier | undefined;
  const validOverrides: ReadonlySet<RerankTier> = new Set([
    'none', 'cross-encoder', 'llm-listwise-small', 'llm-listwise-large',
  ]);
  return {
    override: override && validOverrides.has(override) ? override : undefined,
    modelOverride: env.AKASHIK_RERANK_MODEL || undefined,
    latencyBudgetMs: env.AKASHIK_RERANK_LATENCY_MS
      ? Number(env.AKASHIK_RERANK_LATENCY_MS)
      : undefined,
    headSizeOverride: env.AKASHIK_RERANK_HEAD
      ? Number(env.AKASHIK_RERANK_HEAD)
      : undefined,
    disabled: env.AKASHIK_RERANK === '0',
  };
};

// ─────────────── tier-specific defaults ─────────────

interface TierDefaults {
  readonly model: string;
  readonly headSize: number;
  readonly latencyMs: number;
}

const DEFAULTS: Readonly<Record<Exclude<RerankTier, 'none'>, TierDefaults>> = {
  'cross-encoder': {
    model: 'Xenova/ms-marco-MiniLM-L-6-v2',
    headSize: 20,
    latencyMs: 300,
  },
  'llm-listwise-small': {
    model: 'qwen2.5:1.5b',
    headSize: 30,
    // ~2s on Apple Silicon M-series with ANE-accelerated inference for
    // a 30-candidate listwise pass. CPU-only hardware can run this
    // model but at ~5-8s (the picker's `cpu` tier defaults to
    // cross-encoder, so the higher number doesn't usually matter).
    latencyMs: 2000,
  },
  'llm-listwise-large': {
    model: 'gpt-oss:20b',
    headSize: 50,
    // ~4-5s on M3 Max with Metal acceleration for a 50-candidate
    // listwise pass. Workstation GPUs cut this to ~1s.
    latencyMs: 4500,
  },
};

// ─────────────── picker ─────────────

/**
 * Pick the best rerank tier for the given hardware + env. Returns
 * the chosen tier, head size, model, and a human-readable reason.
 *
 * Order of precedence:
 *   1. Explicit env override (`AKASHIK_RERANK_TIER`)
 *   2. Master kill-switch (`AKASHIK_RERANK=0`)
 *   3. Hardware-tier-based default with latency-budget gate
 */
export const pickRerankTier = (
  hw: HwCapabilities,
  env: RerankEnv = rerankEnvFromProcess(),
): RerankPlan => {
  // 1. Master kill-switch
  if (env.disabled) {
    return {
      tier: 'none',
      headSize: 0,
      reason: 'AKASHIK_RERANK=0 (master kill-switch)',
      latencyBudgetMs: 0,
    };
  }

  // 2. Explicit override
  if (env.override) {
    return applyOverridesToTier(env.override, env);
  }

  // 3. Hardware-tier-based default
  const tier = pickFromHardware(hw, env);
  return applyOverridesToTier(tier, env);
};

const pickFromHardware = (hw: HwCapabilities, env: RerankEnv): RerankTier => {
  // GPU host → biggest reranker that fits the latency budget
  if (hw.tier === 'gpu' && hw.hasOllama && hasModel(hw, ['gpt-oss', 'qwen2.5:7b', 'llama3.1:8b'])) {
    return fitsBudget('llm-listwise-large', env) ? 'llm-listwise-large' : 'llm-listwise-small';
  }

  // Apple Silicon with Ollama → LLM listwise, small or large depending on what's pulled
  if (hw.tier === 'accelerated' && hw.hasOllama) {
    if (hasModel(hw, ['gpt-oss', 'qwen2.5:7b', 'llama3.1:8b']) && fitsBudget('llm-listwise-large', env)) {
      return 'llm-listwise-large';
    }
    if (hasModel(hw, ['qwen2.5:1.5b', 'qwen2.5:3b', 'phi3:mini']) && fitsBudget('llm-listwise-small', env)) {
      return 'llm-listwise-small';
    }
    return 'cross-encoder';
  }

  // Mid-tier laptop CPU — cross-encoder is the sweet spot
  if (hw.tier === 'cpu') return 'cross-encoder';

  // Minimal hardware (ARM cloud, RPi, ≤ 4 GB) — cross-encoder is still
  // safe; skip rerank entirely only if explicitly asked to.
  return 'cross-encoder';
};

const hasModel = (hw: HwCapabilities, prefixes: readonly string[]): boolean =>
  hw.ollamaModels.some((m) => prefixes.some((p) => m.toLowerCase().startsWith(p.toLowerCase())));

const fitsBudget = (tier: Exclude<RerankTier, 'none'>, env: RerankEnv): boolean => {
  const budget = env.latencyBudgetMs;
  if (budget === undefined) return true;
  return DEFAULTS[tier].latencyMs <= budget;
};

const applyOverridesToTier = (tier: RerankTier, env: RerankEnv): RerankPlan => {
  if (tier === 'none') {
    return { tier, headSize: 0, reason: 'explicit override to none', latencyBudgetMs: 0 };
  }
  const def = DEFAULTS[tier];
  return {
    tier,
    headSize: env.headSizeOverride ?? def.headSize,
    model: env.modelOverride ?? def.model,
    reason: env.override
      ? `explicit override → ${tier}`
      : `hardware default for tier=${tier}`,
    latencyBudgetMs: def.latencyMs,
  };
};

// ─────────────── render helper ─────────────

/**
 * Format a plan as a single human line — used in bench logs and the
 * statusline panel so users can see which tier they're getting.
 */
export const formatRerankPlan = (plan: RerankPlan, hw: HwCapabilities): string => {
  if (plan.tier === 'none') {
    return `rerank: none (${plan.reason})`;
  }
  return `rerank: ${plan.tier} · model=${plan.model} · head=${plan.headSize} · budget≈${plan.latencyBudgetMs}ms · hw=${hw.tier} (${plan.reason})`;
};
