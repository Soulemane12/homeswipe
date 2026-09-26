import { describe, expect, it } from "vitest";
import { applyCalibration, fitPlatt } from "@/lib/engine/calibration";
import { areaUnderCurve, computeMetrics } from "@/lib/engine/metrics";
import { createRng } from "@/lib/utils/prng";
import { wilsonInterval } from "@/lib/utils/math";

describe("metrics", () => {
  it("computes accuracy, precision, recall and top-N like rate", () => {
    const m = computeMetrics(
      [
        { predicted: "LIKE", actual: "LIKE", score: 0.9, batchId: "a", rank: 0 },
        { predicted: "LIKE", actual: "DISLIKE", score: 0.7, batchId: "a", rank: 1 },
        { predicted: "DISLIKE", actual: "DISLIKE", score: 0.2, batchId: "a", rank: 2 },
        { predicted: "DISLIKE", actual: "LIKE", score: 0.4, batchId: "a", rank: 3 },
      ],
      2,
    );
    expect(m.accuracy).toBe(0.5);
    expect(m.precision).toBe(0.5);
    expect(m.recall).toBe(0.5);
    expect(m.topNLikeRate).toBe(0.5);
    expect(m.likeRate).toBe(0.5);
  });

  it("computes AUC with ties", () => {
    expect(areaUnderCurve([0.1, 0.2, 0.8, 0.9], [false, false, true, true])).toBe(1);
    expect(areaUnderCurve([0.5, 0.5], [true, false])).toBe(0.5);
    expect(areaUnderCurve([0.9, 0.1], [false, true])).toBe(0);
  });

  it("gives honest Wilson intervals for small samples", () => {
    const small = wilsonInterval(8, 10);
    const large = wilsonInterval(80, 100);
    expect(small.high - small.low).toBeGreaterThan(large.high - large.low);
    expect(small.low).toBeLessThan(0.8);
  });
});

describe("Platt calibration", () => {
  it("refuses to calibrate with too little data", () => {
    expect(fitPlatt([{ score: 0.8, liked: true }], 30)).toBeNull();
  });

  it("maps an overconfident score onto observed like rates", () => {
    // Scores are overconfident: a 0.9 score is liked only ~60% of the time.
    const rng = createRng(3);
    const points = Array.from({ length: 400 }, () => {
      const score = rng();
      const trueP = 0.3 + 0.3 * score;
      return { score, liked: rng() < trueP };
    });
    const cal = fitPlatt(points, 30)!;
    expect(cal).not.toBeNull();
    expect(cal.brierCalibrated).toBeLessThan(cal.brierRaw);
    expect(applyCalibration(0.95, cal)).toBeLessThan(0.8);
  });
});
