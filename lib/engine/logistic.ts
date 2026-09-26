/**
 * Weighted L2-regularized logistic regression (Newton–Raphson with a Cholesky solve).
 * Small and dependency-free: d ≈ 36 features, n ≤ a few hundred interactions.
 * The intercept is not penalized.
 */
export interface LogisticFit {
  beta: number[];
  intercept: number;
  /** Observed Fisher information per coefficient (diagonal, excluding the prior). */
  information: number[];
  n: number;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Solves A x = b for symmetric positive-definite A (in place on copies). */
function choleskySolve(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const l = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = a[i][j];
      for (let k = 0; k < j; k++) sum -= l[i][k] * l[j][k];
      if (i === j) {
        if (sum <= 1e-12) return null;
        l[i][i] = Math.sqrt(sum);
      } else {
        l[i][j] = sum / l[j][j];
      }
    }
  }
  const y = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = b[i];
    for (let k = 0; k < i; k++) sum -= l[i][k] * y[k];
    y[i] = sum / l[i][i];
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = y[i];
    for (let k = i + 1; k < n; k++) sum -= l[k][i] * x[k];
    x[i] = sum / l[i][i];
  }
  return x;
}

export function fitLogistic(input: {
  xs: number[][];
  ys: number[];
  weights: number[];
  lambda: number;
  dim: number;
  maxIterations?: number;
}): LogisticFit {
  const { xs, ys, weights, lambda, dim } = input;
  const n = xs.length;
  const p = dim + 1; // last slot = intercept
  const theta = new Array<number>(p).fill(0);
  const information = new Array<number>(dim).fill(0);
  if (n === 0) return { beta: theta.slice(0, dim), intercept: 0, information, n };

  const iterations = input.maxIterations ?? 12;
  for (let iter = 0; iter < iterations; iter++) {
    const grad = new Array<number>(p).fill(0);
    const hess = Array.from({ length: p }, () => new Array<number>(p).fill(0));
    for (let i = 0; i < n; i++) {
      const x = xs[i];
      let z = theta[dim];
      for (let d = 0; d < dim; d++) z += theta[d] * x[d];
      const mu = sigmoid(z);
      const w = weights[i];
      const r = w * (mu - ys[i]);
      const h = w * Math.max(mu * (1 - mu), 1e-6);
      for (let a = 0; a < dim; a++) {
        const xa = x[a];
        if (xa === 0) continue;
        grad[a] += r * xa;
        const hxa = h * xa;
        for (let b = 0; b <= a; b++) hess[a][b] += hxa * x[b];
        hess[dim][a] += hxa;
      }
      grad[dim] += r;
      hess[dim][dim] += h;
    }
    for (let a = 0; a < dim; a++) {
      grad[a] += lambda * theta[a];
      hess[a][a] += lambda;
    }
    hess[dim][dim] += 1e-6;
    // Mirror the lower triangle.
    for (let a = 0; a < p; a++) for (let b = 0; b < a; b++) hess[b][a] = hess[a][b];
    for (let a = 0; a < dim; a++) hess[a][dim] = hess[dim][a];

    const step = choleskySolve(hess, grad);
    if (!step) break;
    let maxStep = 0;
    for (let a = 0; a < p; a++) {
      theta[a] -= step[a];
      maxStep = Math.max(maxStep, Math.abs(step[a]));
    }
    if (maxStep < 1e-6) break;
  }
  for (let i = 0; i < n; i++) {
    const x = xs[i];
    let z = theta[dim];
    for (let d = 0; d < dim; d++) z += theta[d] * x[d];
    const mu = sigmoid(z);
    const h = weights[i] * mu * (1 - mu);
    for (let d = 0; d < dim; d++) information[d] += h * x[d] * x[d];
  }
  return { beta: theta.slice(0, dim), intercept: theta[dim], information, n };
}
