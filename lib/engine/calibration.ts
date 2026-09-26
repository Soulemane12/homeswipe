import { clamp, sigmoid } from "@/lib/utils/math";

export interface Calibration {
  method: "platt";
  a: number;
  b: number;
  n: number;
  brierRaw: number;
  brierCalibrated: number;
  /** Expected calibration error over 5 equal-width bins, after calibration. */
  ece: number;
}

export interface CalibrationPoint {
  score: number;
  liked: boolean;
}

function logit(p: number): number {
  const q = clamp(p, 1e-4, 1 - 1e-4);
  return Math.log(q / (1 - q));
}

export function brierScore(points: { p: number; liked: boolean }[]): number {
  if (points.length === 0) return 0;
  return points.reduce((s, x) => s + (x.p - (x.liked ? 1 : 0)) ** 2, 0) / points.length;
}

export function expectedCalibrationError(points: { p: number; liked: boolean }[], bins = 5): number {
  if (points.length === 0) return 0;
  let total = 0;
  for (let b = 0; b < bins; b++) {
    const lo = b / bins;
    const hi = (b + 1) / bins;
    const inBin = points.filter((x) => x.p >= lo && (b === bins - 1 ? x.p <= hi : x.p < hi));
    if (inBin.length === 0) continue;
    const conf = inBin.reduce((s, x) => s + x.p, 0) / inBin.length;
    const acc = inBin.filter((x) => x.liked).length / inBin.length;
    total += (inBin.length / points.length) * Math.abs(conf - acc);
  }
  return total;
}

/**
 * Platt scaling: p = sigmoid(a·logit(score) + b), fitted by Newton's method with Platt's
 * smoothed targets and a small ridge penalty toward the identity map (a=1, b=0).
 * Returns null when there is not enough data or only one class.
 */
export function fitPlatt(points: CalibrationPoint[], minPoints: number): Calibration | null {
  const n = points.length;
  const positives = points.filter((p) => p.liked).length;
  if (n < minPoints || positives === 0 || positives === n) return null;
  const tPos = (positives + 1) / (positives + 2);
  const tNeg = 1 / (n - positives + 2);
  const xs = points.map((p) => logit(p.score));
  const ts = points.map((p) => (p.liked ? tPos : tNeg));
  let a = 1;
  let b = 0;
  const ridge = 0.01;
  for (let iter = 0; iter < 50; iter++) {
    let ga = ridge * (a - 1);
    let gb = ridge * b;
    let haa = ridge;
    let hab = 0;
    let hbb = ridge;
    for (let i = 0; i < n; i++) {
      const p = sigmoid(a * xs[i] + b);
      const d = p - ts[i];
      const w = Math.max(p * (1 - p), 1e-9);
      ga += d * xs[i];
      gb += d;
      haa += w * xs[i] * xs[i];
      hab += w * xs[i];
      hbb += w;
    }
    const det = haa * hbb - hab * hab;
    if (Math.abs(det) < 1e-12) break;
    const da = (hbb * ga - hab * gb) / det;
    const db = (haa * gb - hab * ga) / det;
    a -= da;
    b -= db;
    if (Math.abs(da) + Math.abs(db) < 1e-7) break;
  }
  const calibrated = points.map((p, i) => ({ p: sigmoid(a * xs[i] + b), liked: p.liked }));
  return {
    method: "platt",
    a,
    b,
    n,
    brierRaw: brierScore(points.map((p) => ({ p: p.score, liked: p.liked }))),
    brierCalibrated: brierScore(calibrated),
    ece: expectedCalibrationError(calibrated),
  };
}

export function applyCalibration(score: number, calibration: Calibration): number {
  return sigmoid(calibration.a * logit(score) + calibration.b);
}
