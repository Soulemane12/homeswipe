import { ObjectId } from "mongodb";
import { z } from "zod";
import { getCurrentUserId } from "@/lib/auth/session";
import { handle, json, parseBody } from "@/lib/http/route";
import { SOURCE_SURFACES } from "@/models/interaction";
import { listCollections, listSaved, removeFromCollection } from "@/services/collections";
import { scheduleBackgroundLearning } from "@/services/interactions/learning";
import { recordInteraction } from "@/services/interactions/record";
import { toCard } from "@/services/properties/cards";
import { getPersonalContext, scoreIds } from "@/services/recommendations/personalize";

/** GET /api/saved — saved homes with collections. */
export const GET = handle(async () => {
  const userId = await getCurrentUserId();
  const [saved, collections, ctx] = await Promise.all([listSaved(userId), listCollections(userId), getPersonalContext(userId)]);
  const scored = scoreIds(ctx, saved.map((s) => s.propertyId));
  return json({
    collections: collections.map((c) => ({ id: c._id.toHexString(), name: c.name, kind: c.kind })),
    saved: saved
      .map((s) => {
        const p = ctx.catalog.propertyById.get(s.propertyId);
        return p ? { ...toCard(p, { scored: scored.get(p.id), saved: true }), collectionIds: s.collectionIds.map((x) => x.toHexString()), savedAt: s.createdAt } : null;
      })
      .filter(Boolean),
  });
});

const Body = z.object({
  propertyId: z.string().min(1),
  action: z.enum(["save", "unsave", "remove_from_collection"]),
  collectionId: z.string().regex(/^[a-f0-9]{24}$/).optional(),
  sourceSurface: z.enum(SOURCE_SURFACES).default("saved"),
  impressionId: z.string().regex(/^[a-f0-9]{24}$/).optional(),
});

/** POST /api/saved — save (optionally into a collection), unsave, or remove from one collection. */
export const POST = handle(async (request: Request) => {
  const userId = await getCurrentUserId();
  const body = await parseBody(request, Body);
  if (body.action === "remove_from_collection" && body.collectionId) {
    await removeFromCollection(userId, body.propertyId, new ObjectId(body.collectionId));
    return json({ ok: true });
  }
  const result = await recordInteraction(userId, {
    type: body.action === "save" ? "save" : "unsave",
    propertyId: body.propertyId,
    sourceSurface: body.sourceSurface,
    impressionId: body.impressionId,
    metadata: body.collectionId ? { collectionId: body.collectionId } : undefined,
  });
  scheduleBackgroundLearning(userId, result);
  return json({ ok: true, preferencesUpdating: result.preferenceUpdateDue });
});
