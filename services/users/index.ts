import "server-only";
import { db } from "@/lib/mongodb/collections";
import { isAllowedDimension } from "@/lib/guardrails/fair-housing";
import { HardConstraintsSchema, type ExplicitPreferences, type HardConstraints, type UserDoc } from "@/models/user";
import { ensureInitialPolicy } from "@/services/harness/policies";
import { ensureDefaultCollections } from "@/services/collections";

export const DEFAULT_CONSTRAINTS: HardConstraints = HardConstraintsSchema.parse({ listingType: "sale" });

/** Loads the user, creating the profile, default collections and the v1 policy on first visit. */
export async function getOrCreateUser(userId: string): Promise<UserDoc> {
  const c = await db();
  const existing = await c.users.findOne({ _id: userId });
  if (existing) return existing;
  const now = new Date();
  const doc: UserDoc = {
    _id: userId,
    createdAt: now,
    updatedAt: now,
    constraints: DEFAULT_CONSTRAINTS,
    explicitPreferences: { positive: [], negative: [] },
    activePolicyVersion: 1,
    counters: { meaningfulSinceUpdate: 0, realResolvedSinceEvolution: 0 },
  };
  await c.users.updateOne({ _id: userId }, { $setOnInsert: doc }, { upsert: true });
  await ensureInitialPolicy(userId);
  await ensureDefaultCollections(userId);
  return (await c.users.findOne({ _id: userId })) ?? doc;
}

export async function saveOnboarding(userId: string, input: { constraints: HardConstraints; explicit: ExplicitPreferences }): Promise<void> {
  const c = await db();
  await getOrCreateUser(userId);
  const explicit = {
    positive: input.explicit.positive.filter(isAllowedDimension),
    negative: input.explicit.negative.filter(isAllowedDimension),
  };
  await c.users.updateOne(
    { _id: userId },
    {
      $set: {
        constraints: HardConstraintsSchema.parse(input.constraints),
        explicitPreferences: explicit,
        onboardingCompletedAt: new Date(),
        updatedAt: new Date(),
      },
    },
  );
}

export async function updateConstraints(userId: string, constraints: HardConstraints): Promise<void> {
  const c = await db();
  await c.users.updateOne({ _id: userId }, { $set: { constraints: HardConstraintsSchema.parse(constraints), updatedAt: new Date() } });
}

const RETURNING_AFTER_MS = 12 * 3600 * 1000;

/** Marks the user as seen; returns whether this is a return visit after a long gap (long-horizon UX). */
export async function touchUser(userId: string): Promise<{ returning: boolean }> {
  const c = await db();
  const now = new Date();
  const before = await c.users.findOneAndUpdate({ _id: userId }, { $set: { lastSeenAt: now } });
  const last = before?.lastSeenAt;
  return { returning: Boolean(last && now.getTime() - last.getTime() > RETURNING_AFTER_MS) };
}
