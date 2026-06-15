/**
 * In-process metrics registry — counters, gauges, histograms.
 *
 * Pure-ish domain module: a tiny module-level singleton holds the
 * registry for the daemon process, and three primitive types record
 * and snapshot values. No I/O, no clock dependency at the type level
 * (tests inject `now`), no external dependency on OpenTelemetry — the
 * multi-LLM round-2 review explicitly tagged OTEL as "good but high
 * implementation cost", and we don't yet have distributed tracing
 * needs that justify the bundle weight.
 *
 * Surfaces this enables:
 *   - `folklore metrics` IPC command returns a JSON snapshot.
 *   - The eval harness can correlate retrieval quality drops to
 *     queue/graph pressure without grepping logs.
 *   - `daemon health --json` consumes the same snapshot.
 *
 * Intentional non-features (cheaper to add later than to remove now):
 *   - No labels / tag cardinality. The round-2 audit warned that
 *     `peer_id × room × entity_id` would explode to 500M time series;
 *     we simply don't expose label dimensions at all.
 *   - No Prometheus endpoint, no exporters. Snapshot-on-pull only.
 */

// ─────────────── primitives ─────────────────

/**
 * Monotonic counter. Increment-only, never reset (except via
 * `metrics.reset()` for test isolation).
 */
export interface Counter {
  inc(by?: number): void;
  value(): number;
}

/**
 * Point-in-time gauge. Last-write-wins. Use for "queue depth right now",
 * "peers alive right now", "memory MB right now".
 */
export interface Gauge {
  set(value: number): void;
  value(): number;
}

/**
 * Bounded-window histogram. Stores the last N observations in a ring
 * buffer (cheap insert, no allocation). `snapshot()` computes
 * p50/p95/mean/min/max from the live window. The window cap keeps
 * memory bounded even under millions of observations — old samples
 * fall out, recent latency dominates the percentiles.
 */
export interface Histogram {
  observe(value: number): void;
  snapshot(): HistogramSnapshot;
}

export interface HistogramSnapshot {
  readonly count: number;
  readonly mean: number;
  readonly min: number;
  readonly max: number;
  readonly p50: number;
  readonly p95: number;
}

/** Fixed-size ring used by Histogram. 1024 covers ~17 minutes at 1
 * obs/sec — plenty for the daemon's hot paths. */
const HISTOGRAM_WINDOW = 1024;

const makeCounter = (): Counter => {
  let v = 0;
  return {
    inc: (by = 1) => { v += by; },
    value: () => v,
  };
};

const makeGauge = (): Gauge => {
  let v = 0;
  return {
    set: (n: number) => { v = n; },
    value: () => v,
  };
};

const makeHistogram = (): Histogram => {
  const buf = new Float64Array(HISTOGRAM_WINDOW);
  let n = 0;          // total observations seen
  let head = 0;       // next write position
  let count = 0;      // live samples in buffer (caps at WINDOW)
  return {
    observe: (value: number) => {
      buf[head] = value;
      head = (head + 1) % HISTOGRAM_WINDOW;
      if (count < HISTOGRAM_WINDOW) count++;
      n++;
    },
    snapshot: (): HistogramSnapshot => {
      if (count === 0) {
        return { count: 0, mean: 0, min: 0, max: 0, p50: 0, p95: 0 };
      }
      // Copy the live samples to a sortable array. Bounded at
      // HISTOGRAM_WINDOW so this is cheap and predictable.
      const live = new Float64Array(count);
      for (let i = 0; i < count; i++) live[i] = buf[i];
      let sum = 0, lo = live[0], hi = live[0];
      for (let i = 0; i < count; i++) {
        const v = live[i];
        sum += v;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      const sorted = Array.from(live).sort((a, b) => a - b);
      const at = (p: number): number => {
        if (count === 1) return sorted[0];
        const idx = Math.min(count - 1, Math.floor(p * count));
        return sorted[idx];
      };
      return {
        count: n,
        mean: sum / count,
        min: lo,
        max: hi,
        p50: at(0.5),
        p95: at(0.95),
      };
    },
  };
};

// ─────────────── registry ───────────────────

interface Registry {
  readonly counter: (name: string) => Counter;
  readonly gauge: (name: string) => Gauge;
  readonly histogram: (name: string) => Histogram;
  readonly snapshot: () => MetricsSnapshot;
  readonly reset: () => void;
}

export interface MetricsSnapshot {
  readonly counters: Record<string, number>;
  readonly gauges: Record<string, number>;
  readonly histograms: Record<string, HistogramSnapshot>;
  readonly emitted_at: string;
}

const buildRegistry = (): Registry => {
  let counters = new Map<string, Counter>();
  let gauges = new Map<string, Gauge>();
  let histograms = new Map<string, Histogram>();

  const counter = (name: string): Counter => {
    let c = counters.get(name);
    if (!c) {
      c = makeCounter();
      counters.set(name, c);
    }
    return c;
  };
  const gauge = (name: string): Gauge => {
    let g = gauges.get(name);
    if (!g) {
      g = makeGauge();
      gauges.set(name, g);
    }
    return g;
  };
  const histogram = (name: string): Histogram => {
    let h = histograms.get(name);
    if (!h) {
      h = makeHistogram();
      histograms.set(name, h);
    }
    return h;
  };

  const snapshot = (): MetricsSnapshot => {
    const c: Record<string, number> = {};
    for (const [k, v] of counters) c[k] = v.value();
    const g: Record<string, number> = {};
    for (const [k, v] of gauges) g[k] = v.value();
    const h: Record<string, HistogramSnapshot> = {};
    for (const [k, v] of histograms) h[k] = v.snapshot();
    return { counters: c, gauges: g, histograms: h, emitted_at: new Date().toISOString() };
  };

  const reset = (): void => {
    counters = new Map();
    gauges = new Map();
    histograms = new Map();
  };

  return { counter, gauge, histogram, snapshot, reset };
};

/**
 * Process-singleton registry. Daemon code calls
 * `metrics.counter('foo').inc()` or `metrics.histogram('bar').observe(ms)`.
 * Tests use `metrics.reset()` for isolation between cases.
 */
export const metrics: Registry = buildRegistry();

// ─────────────── timing helper ──────────────

/**
 * Run `fn`, observe its wall-clock duration on `histogramName`. Awaits
 * fn even if it throws — the duration still records and the throw
 * re-propagates, so a slow failing path is still visible in the
 * histogram.
 */
export const timed = async <T>(
  histogramName: string,
  fn: () => Promise<T>,
): Promise<T> => {
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    metrics.histogram(histogramName).observe(performance.now() - t0);
  }
};
