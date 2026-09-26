import "server-only";
import { ObjectId } from "mongodb";
import { INITIAL_POLICY, parsePolicy, type HarnessPolicy } from "@/lib/engine/policy-schema";
import { db } from "@/lib/mongodb/collections";
import type { HarnessPolicyDoc } from "@/models/harness";

export interface ActivePolicy {
  version: number;
  policy: HarnessPolicy;
  doc: HarnessPolicyDoc;
}

/** Seeds the intentionally imperfect v1 policy for a user if they have none. */
export async function ensureInitialPolicy(userId: string): Promise<void> {
  const c = await db();
  const exists = await c.harnessPolicies.findOne({ userId, version: 1 });
  if (exists) return;
  const doc: HarnessPolicyDoc = {
    _id: new ObjectId(),
    userId,
    version: 1,
    parentVersion: null,
    status: "active",
    createdAt: new Date(),
    createdBy: "seed",
    reason: "Initial policy: trusts listing metadata and onboarding answers; learned signals, negative memory and exploration are deliberately under-weighted until interaction history justifies changes.",
    evidence: [],
    changes: [],
    diff: [],
    policy: parsePolicy(INITIAL_POLICY),
    activatedAt: new Date(),
  };
  try {
    await c.harnessPolicies.insertOne(doc);
  } catch (error) {
    // A concurrent request may have seeded it first (unique userId+version).
    if ((error as { code?: number }).code !== 11000) throw error;
  }
}

export async function getActivePolicy(userId: string): Promise<ActivePolicy> {
  const c = await db();
  let doc = await c.harnessPolicies.findOne({ userId, status: "active" });
  if (!doc) {
    await ensureInitialPolicy(userId);
    doc = await c.harnessPolicies.findOne({ userId, status: "active" });
  }
  if (!doc) throw new Error(`No active harness policy for ${userId}`);
  return { version: doc.version, policy: parsePolicy(doc.policy), doc };
}

export async function listPolicies(userId: string): Promise<HarnessPolicyDoc[]> {
  const c = await db();
  return c.harnessPolicies.find({ userId }).sort({ version: 1 }).toArray();
}

export async function nextPolicyVersion(userId: string): Promise<number> {
  const c = await db();
  const latest = await c.harnessPolicies.find({ userId }).sort({ version: -1 }).limit(1).next();
  return (latest?.version ?? 0) + 1;
}
