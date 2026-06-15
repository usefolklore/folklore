/**
 * Hardware capability detection — runtime probe for the host's
 * compute resources. Drives the rerank-tier picker so folklore
 * runs the best quality each user's actual hardware can deliver
 * rather than the lowest-common-denominator pure-CPU path.
 *
 * Detection is intentionally cheap (no model loads, no benchmarks):
 *   - Platform + arch from `process` / `os`
 *   - Apple Silicon family inferred from `darwin + arm64`
 *   - CUDA via `nvidia-smi --query-gpu=name` (try-spawn, 500 ms)
 *   - Ollama via a quick HTTP probe at the configured URL (1 s)
 *   - Memory pressure from `os.totalmem()`
 *
 * Everything is synchronous-with-async-tail; the cheap fields land
 * immediately and the network/spawn probes are awaited together.
 * Cached for the lifetime of the process — capabilities don't change.
 *
 * Failure modes: every probe is fail-closed (returns `false` /
 * `undefined`). A misconfigured `FOLKLORE_OLLAMA_URL` doesn't
 * crash the picker; it just downgrades the tier.
 */

import { spawnSync } from 'node:child_process';
import { cpus, totalmem, platform as nodePlatform, arch as nodeArch, hostname } from 'node:os';

// ─────────────── port ─────────────

export type Platform = 'darwin' | 'linux' | 'win32' | 'freebsd' | 'unknown';
export type Arch = 'arm64' | 'x64' | 'arm' | 'unknown';

export interface HwCapabilities {
  /** OS family — `darwin` = macOS; `linux` includes ARM cloud boxes. */
  readonly platform: Platform;
  /** CPU architecture — `arm64` covers Apple Silicon + Hetzner ARM. */
  readonly arch: Arch;
  /** Hostname (for telemetry / debug — not used for tier picking). */
  readonly hostname: string;
  /** Logical CPU count. */
  readonly cpuCount: number;
  /** Total system RAM in GB (rounded). */
  readonly memoryGB: number;
  /**
   * Apple Silicon family — true iff `darwin + arm64`. Used to enable
   * the ANE / Metal-capable execution-provider paths once those land.
   */
  readonly appleSilicon: boolean;
  /** NVIDIA discrete GPU detected via nvidia-smi. */
  readonly hasCuda: boolean;
  /** Detected GPU name(s), if any (NVIDIA only for now). */
  readonly gpus: readonly string[];
  /**
   * Ollama HTTP service reachable. Drives the LLM-listwise rerank
   * tier — without Ollama (or a comparable LLM endpoint) the picker
   * falls back to cross-encoder rerank.
   */
  readonly hasOllama: boolean;
  /** Models available locally on Ollama (when reachable). */
  readonly ollamaModels: readonly string[];
  /**
   * Coarse runtime tier — `gpu` > `accelerated` > `cpu` > `minimal`.
   * Picked from the fine-grained signals above; the rerank-tier
   * picker uses this as its primary input.
   */
  readonly tier: 'gpu' | 'accelerated' | 'cpu' | 'minimal';
}

// ─────────────── detection ─────────────

const OLLAMA_PROBE_TIMEOUT_MS = 1000;
const CUDA_PROBE_TIMEOUT_MS = 500;

const toPlatform = (p: NodeJS.Platform): Platform =>
  p === 'darwin' || p === 'linux' || p === 'win32' || p === 'freebsd' ? p : 'unknown';

const toArch = (a: string): Arch =>
  a === 'arm64' || a === 'x64' || a === 'arm' ? a as Arch : 'unknown';

/**
 * Probe NVIDIA CUDA via nvidia-smi. Returns the comma-separated GPU
 * names list, or `[]` if the tool is absent / fails. Sync because the
 * spawn is short-lived and we cache the whole capabilities object.
 */
const detectCuda = (): { hasCuda: boolean; gpus: string[] } => {
  try {
    const res = spawnSync('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'], {
      timeout: CUDA_PROBE_TIMEOUT_MS,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (res.status !== 0 || !res.stdout) return { hasCuda: false, gpus: [] };
    const gpus = res.stdout.split('\n').map((s) => s.trim()).filter((s) => s.length > 0);
    return { hasCuda: gpus.length > 0, gpus };
  } catch {
    return { hasCuda: false, gpus: [] };
  }
};

/**
 * Probe a running Ollama instance. Returns the list of locally
 * available models; an empty list means Ollama isn't reachable.
 * Endpoint comes from FOLKLORE_OLLAMA_URL or the default localhost.
 */
const detectOllama = async (): Promise<{ hasOllama: boolean; models: string[] }> => {
  const baseUrl = (process.env.FOLKLORE_OLLAMA_URL ?? 'http://localhost:11434').replace(/\/$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLLAMA_PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
    if (!res.ok) return { hasOllama: false, models: [] };
    const json = await res.json() as { models?: Array<{ name?: string }> };
    const models = (json.models ?? []).map((m) => m.name ?? '').filter((s) => s.length > 0);
    return { hasOllama: true, models };
  } catch {
    return { hasOllama: false, models: [] };
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Coarse tier from the fine-grained signals. The rerank-tier picker
 * uses this as its primary input but can be overridden by env.
 *
 * Tier ladder:
 *   `gpu`          — NVIDIA discrete GPU available
 *   `accelerated`  — Apple Silicon (ANE + Metal) OR ≥ 8 GB RAM + ≥ 8 cores
 *   `cpu`          — typical commodity laptop / desktop
 *   `minimal`      — ARM-cloud / Raspberry Pi class (≤ 4 GB RAM)
 */
const computeTier = (
  cuda: boolean,
  appleSilicon: boolean,
  memoryGB: number,
  cpuCount: number,
): HwCapabilities['tier'] => {
  if (cuda) return 'gpu';
  if (appleSilicon) return 'accelerated';
  if (memoryGB >= 8 && cpuCount >= 8) return 'accelerated';
  if (memoryGB >= 4) return 'cpu';
  return 'minimal';
};

// ─────────────── public API ─────────────

let cached: HwCapabilities | null = null;

/**
 * Detect host capabilities. Cached for the lifetime of the process.
 * The first call awaits the Ollama probe; subsequent calls return the
 * cache without network traffic.
 */
export const detectHardware = async (): Promise<HwCapabilities> => {
  if (cached !== null) return cached;

  const platform = toPlatform(nodePlatform());
  const arch = toArch(nodeArch());
  const appleSilicon = platform === 'darwin' && arch === 'arm64';
  const cpuCount = cpus().length;
  const memoryGB = Math.round(totalmem() / (1024 * 1024 * 1024));

  const cuda = detectCuda();
  const ollama = await detectOllama();

  cached = {
    platform,
    arch,
    hostname: hostname(),
    cpuCount,
    memoryGB,
    appleSilicon,
    hasCuda: cuda.hasCuda,
    gpus: cuda.gpus,
    hasOllama: ollama.hasOllama,
    ollamaModels: ollama.models,
    tier: computeTier(cuda.hasCuda, appleSilicon, memoryGB, cpuCount),
  };
  return cached;
};

/**
 * Reset the cached capabilities. Tests-only — production should never
 * call this since hardware doesn't change between calls.
 */
export const _resetHwCache = (): void => {
  cached = null;
};
