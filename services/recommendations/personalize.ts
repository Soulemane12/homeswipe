import "server-only";
import { createScorer, type Scorer } from "@/lib/engine/scoring";
import type { HarnessPolicy } from "@/lib/engine/policy-schema";
import type { PreferenceState, ScoredProperty } from "@/lib/engine/types";
import type { UserDoc } from "@/models/user";
import { getActivePolicy } from "@/services/harness/policies";
import { getLiveState } from "@/services/preferences/update";
import { loadCatalog, type Catalog } from "@/services/properties/repository";
import { getOrCreateUser } from "@/services/users";

export interface PersonalContext {
  user: UserDoc;
  policy: HarnessPolicy;
  policyVersion: number;
  catalog: Catalog;
  state: PreferenceState;
  scorer: Scorer;
}

/**
 * A scorer for the current user's learned preferences, for surfaces that personalize without
 * creating feed impressions (search, property details, similar homes, compare, saved, map).
 */
export async function getPersonalContext(userId: string): Promise<PersonalContext> {
  const [user, active, catalog] = await Promise.all([getOrCreateUser(userId), getActivePolicy(userId), loadCatalog()]);
  const state = await getLiveState(user, active, catalog);
  const scorer = createScorer({ state, policy: active.policy, stats: catalog.stats, constraints: user.constraints, properties: catalog.byId, now: new Date() });
  return { user, policy: active.policy, policyVersion: active.version, catalog, state, scorer };
}

export function scoreIds(ctx: PersonalContext, ids: string[]): Map<string, ScoredProperty> {
  const out = new Map<string, ScoredProperty>();
  for (const id of ids) {
    const p = ctx.catalog.byId.get(id);
    if (p) out.set(id, ctx.scorer.score(p));
  }
  return out;
}
