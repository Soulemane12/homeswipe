import { describe, expect, it } from "vitest";
import { HARNESS_CONFIG } from "@/lib/config/harness";
import { computeMetrics, type OutcomeRow } from "@/lib/engine/metrics";
import { decidePromotion, pairedOutcome } from "@/lib/engine/promotion";
import { splitTrainHoldout } from "@/lib/engine/replay";

function rows(correct: number, total: number, likeEvery = 2): OutcomeRow[] {
  return Array.from({ length: total }, (_, i) => {
    const actual = i % likeEvery === 0 ? "LIKE" : "DISLIKE";
    const predicted = i < correct ? actual : actual === "LIKE" ? "DISLIKE" : "LIKE";
    return { predicted, actual, score: 0.5 } as OutcomeRow;
  });
}

const config = { ...HARNESS_CONFIG };

describe("promotion gate", () => {
  it("requires at least 30 resolved predictions and 10 holdout examples", () => {
    const current = computeMetrics(rows(5, 10));
    const candidate = computeMetrics(rows(9, 10));
    const tooFew = decidePromotion({ totalResolved: 25, current, candidate, paired: { candidateOnlyCorrect: 4, currentOnlyCorrect: 0 }, config });
    expect(tooFew.promote).toBe(false);
    expect(tooFew.checks.find((c) => c.name === "enough_evidence")?.passed).toBe(false);
    const smallHoldout = decidePromotion({ totalResolved: 40, current: computeMetrics(rows(4, 8)), candidate: computeMetrics(rows(8, 8)), paired: { candidateOnlyCorrect: 4, currentOnlyCorrect: 0 }, config });
    expect(smallHoldout.checks.find((c) => c.name === "enough_holdout")?.passed).toBe(false);
  });

  it("promotes only when accuracy improves by the minimum delta with more paired wins", () => {
    const current = computeMetrics(rows(6, 12));
    const better = computeMetrics(rows(9, 12));
    expect(decidePromotion({ totalResolved: 40, current, candidate: better, paired: { candidateOnlyCorrect: 3, currentOnlyCorrect: 0 }, config }).promote).toBe(true);
    const same = computeMetrics(rows(6, 12));
    expect(decidePromotion({ totalResolved: 40, current, candidate: same, paired: { candidateOnlyCorrect: 1, currentOnlyCorrect: 1 }, config }).promote).toBe(false);
  });

  it("blocks promotion when accuracy rises only by collapsing to the majority class", () => {
    // Holdout with 3 likes / 9 dislikes: always predicting DISLIKE gets 75% accuracy but 50% balanced accuracy.
    const labels = Array.from({ length: 12 }, (_, i) => (i < 3 ? "LIKE" : "DISLIKE"));
    const currentRows = labels.map((a, i) => ({ actual: a, predicted: i < 3 ? "LIKE" : i < 7 ? "DISLIKE" : "LIKE", score: 0.5 }) as OutcomeRow);
    const majorityRows = labels.map((a) => ({ actual: a, predicted: "DISLIKE", score: 0.5 }) as OutcomeRow);
    const current = computeMetrics(currentRows);
    const candidate = computeMetrics(majorityRows);
    expect(candidate.accuracy).toBeGreaterThan(current.accuracy);
    const decision = decidePromotion({ totalResolved: 40, current, candidate, paired: pairedOutcome(currentRows, majorityRows), config });
    expect(decision.promote).toBe(false);
    expect(decision.checks.find((c) => c.name === "balanced_accuracy")?.passed).toBe(false);
  });

  it("splits chronologically with a holdout of max(10, 30%)", () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    const { training, holdout } = splitTrainHoldout(items, { holdoutFraction: 0.3, minHoldout: 10 });
    expect(holdout).toEqual(items.slice(20));
    expect(training).toEqual(items.slice(0, 20));
    expect(splitTrainHoldout(Array.from({ length: 50 }, (_, i) => i), { holdoutFraction: 0.3, minHoldout: 10 }).holdout).toHaveLength(15);
  });
});

describe("one-sided holdouts", () => {
  it("never promotes on a holdout that contains only one outcome", () => {
    const allDislikes = Array.from({ length: 20 }, () => ({ predicted: "DISLIKE", actual: "DISLIKE", score: 0.1 }) as OutcomeRow);
    const current = computeMetrics(allDislikes.map((r, i) => (i < 5 ? { ...r, predicted: "LIKE" } : r)));
    const candidate = computeMetrics(allDislikes);
    expect(candidate.accuracy).toBe(1);
    const decision = decidePromotion({ totalResolved: 60, current, candidate, paired: { candidateOnlyCorrect: 5, currentOnlyCorrect: 0 }, config });
    expect(decision.promote).toBe(false);
    expect(decision.checks.find((c) => c.name === "both_outcomes_in_holdout")?.passed).toBe(false);
  });
});
