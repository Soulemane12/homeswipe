# HomeSwipe demo scripts

**One line:** HomeSwipe is a self-evolving recommendation harness, with real estate as the
environment. It predicts your reaction to every home before you see it, grades itself, and
rewrites how it learns you when it's wrong. Every step lives in MongoDB Atlas.

## Before you present

1. `pnpm setup` (seed, indexes, demo user), then `pnpm dev`, or use the deployed URL.
2. Open `/lab?judge=1` → **Reset demo** (keeps onboarding).
3. Optional, for guaranteed evolution on stage: in `/lab`, pick **Light-seeking modernist** and click **Simulate 30 interactions** twice, running evolution after each (scope *Simulated*). This leaves a policy history on screen, clearly labelled as simulated.
4. Keep two tabs open: the product in consumer mode, and `/lab` in judge mode.

## 3-minute flow

| Time | Show | Say |
| --- | --- | --- |
| 0:00 | Landing → **Start discovering** | "HomeSwipe is a self-evolving recommendation harness using real estate as the environment." |
| 0:15 | `/swipe`, swipe 5–6 homes (like the bright, modern ones; pass on dark or carpeted ones) | "Every reaction is a signal. Passive ones like opening details count for less." |
| 0:45 | Turn on judge mode (`?judge=1`), swipe two more | "Before this card appeared, HomeSwipe persisted a prediction (label, raw score, policy version) in MongoDB. The toast shows whether it was right." |
| 1:05 | `/home-dna` | "What it believes about me, with confidence, and what it's still testing. I can correct it." Set *Balcony → Not important*. |
| 1:25 | `/lab` (Real scope, or Simulated if pre-warmed) | Point at active version, accuracy with n and CI, top-3 like rate, exploration target. |
| 1:45 | **Run evolution** | "It replays history under candidate policies, backtests on the newest held-out interactions, and promotes only with a real margin, more paired wins and no regressions." |
| 2:05 | Policy history diff | Read the real diff off the screen (typical: metadata weight down, learned visual/lifestyle weight up, negative memory up, threshold recalibrated). "Every change carries the evidence that motivated it. Rejected candidates stay in the history too." |
| 2:25 | Accuracy chart | "Same-data replay puts every version on identical recent interactions. That's the fair comparison." |
| 2:40 | Back to Discover | "Recommendations now follow the promoted policy." |
| 2:50 | Architecture (README diagram) or Atlas collections | "Every interaction, impression, prediction, memory, experiment, policy and embedding is a document in MongoDB Atlas. Retrieval is Atlas Vector Search with hard constraints as prefilters." |

Mention **honesty guarantees** if asked:
- Raw scores are never called probabilities until calibrated on ≥30 outcomes.
- Evolution needs ≥30 resolved predictions and ≥10 holdout examples.
- Simulated data is tagged and never mixed into "Real" metrics.

## 60-second video flow

1. (0–8s) Swipe three homes on a phone-width screen.
2. (8–18s) Judge mode: the card shows its persisted prediction (`pred LIKE · score … · v1`). Swipe. The toast reports predicted vs. actual.
3. (18–28s) Home DNA: "Natural light: very strong · learned", then correct one trait.
4. (28–45s) `/lab`: run evolution, then show the promoted v2 diff with its evidence and the accuracy chart.
5. (45–55s) Discover refreshes under v2, showing reasons like "Strong natural light · Hardwood floors."
6. (55–60s) "Every prediction, memory and policy version lives in MongoDB Atlas. HomeSwipe learns how to learn you."

## Useful commands

```bash
pnpm simulate light_modernist 30 --evolve   # CLI simulation + evolution (simulated scope)
pnpm reset:demo                              # keep onboarding; --full to clear it too
```
