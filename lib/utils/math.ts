export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) sum += a[i] * b[i];
  return sum;
}

export function norm(a: ArrayLike<number>): number {
  return Math.sqrt(dot(a, a));
}

/** Cosine similarity in [-1, 1]; returns 0 when either vector is (near) zero. */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const na = norm(a);
  const nb = norm(b);
  if (na < 1e-9 || nb < 1e-9) return 0;
  return dot(a, b) / (na * nb);
}

export function subtract(a: ArrayLike<number>, b: ArrayLike<number>): number[] {
  const out = new Array<number>(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] - (b[i] ?? 0);
  return out;
}

export function addScaled(target: number[], source: ArrayLike<number>, scale: number): void {
  for (let i = 0; i < target.length; i++) target[i] += (source[i] ?? 0) * scale;
}

export function normalize(a: ArrayLike<number>): number[] {
  const n = norm(a);
  if (n < 1e-9) return Array.from(a, () => 0);
  return Array.from(a, (v) => v / n);
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function round(value: number, digits = 3): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/** Pearson correlation; 0 when either series has no variance. */
export function correlation(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx < 1e-12 || syy < 1e-12) return 0;
  return sxy / Math.sqrt(sxx * syy);
}

/** Wilson score interval for a binomial proportion (95% by default). */
export function wilsonInterval(successes: number, n: number, z = 1.96): { low: number; high: number } {
  if (n === 0) return { low: 0, high: 1 };
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { low: clamp(center - margin), high: clamp(center + margin) };
}
