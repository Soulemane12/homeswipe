import "server-only";
import { ObjectId } from "mongodb";
import { satisfiesHardConstraints } from "@/lib/engine/constraints";
import { displayMatch } from "@/lib/engine/prediction";
import { db } from "@/lib/mongodb/collections";
import type { SavedSearchDoc } from "@/models/library";
import { getPersonalContext } from "@/services/recommendations/personalize";
import type { SearchFilters } from "./search";

export async function createSavedSearch(userId: string, input: { name: string; filters: SearchFilters; query?: string; minMatch?: number }): Promise<SavedSearchDoc> {
  const c = await db();
  const doc: SavedSearchDoc = {
    _id: new ObjectId(),
    userId,
    name: input.name.trim().slice(0, 80) || "Saved search",
    filters: input.filters,
    query: input.query,
    alert: { enabled: true, minMatch: input.minMatch ?? 80 },
    lastCheckedAt: new Date(),
    createdAt: new Date(),
  };
  await c.savedSearches.insertOne(doc);
  return doc;
}

export async function deleteSavedSearch(userId: string, id: ObjectId): Promise<void> {
  const c = await db();
  await c.savedSearches.deleteOne({ _id: id, userId });
}

export async function setSavedSearchAlert(userId: string, id: ObjectId, alert: SavedSearchDoc["alert"]): Promise<void> {
  const c = await db();
  await c.savedSearches.updateOne({ _id: id, userId }, { $set: { alert } });
}

export interface SavedSearchWithMatches extends SavedSearchDoc {
  matching: number;
  newSinceCheck: number;
  highMatch: number;
}

/**
 * Alert architecture: a saved search evaluates hard-constraint matches, new listings since the
 * last check, and listings whose personalized match crosses the alert threshold. Delivery
 * (email/push) is intentionally out of scope; this powers the in-app alerts view.
 */
export async function listSavedSearches(userId: string): Promise<SavedSearchWithMatches[]> {
  const c = await db();
  const docs = await c.savedSearches.find({ userId }).sort({ createdAt: -1 }).toArray();
  if (docs.length === 0) return [];
  const ctx = await getPersonalContext(userId);
  return docs.map((doc) => {
    const f = doc.filters;
    const constraints = {
      listingType: "sale" as const,
      minPrice: f.minPrice,
      maxPrice: f.maxPrice,
      minBedrooms: f.minBedrooms ?? 0,
      minBathrooms: f.minBathrooms ?? 0,
      propertyTypes: f.propertyTypes ?? [],
      boroughs: f.boroughs ?? [],
      neighborhoods: f.neighborhoods ?? [],
    };
    const matches = ctx.catalog.engine.filter((p) => satisfiesHardConstraints(p, constraints));
    return {
      ...doc,
      matching: matches.length,
      newSinceCheck: matches.filter((p) => p.listedAt > doc.lastCheckedAt).length,
      highMatch: matches.filter((p) => displayMatch(ctx.scorer.score(p).breakdown.fit) >= doc.alert.minMatch).length,
    };
  });
}
