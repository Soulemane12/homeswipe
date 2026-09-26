import "server-only";
import type { EngineInteraction } from "@/lib/engine/types";
import { db } from "@/lib/mongodb/collections";
import type { InteractionDoc } from "@/models/interaction";

export function toEngineInteraction(doc: InteractionDoc): EngineInteraction {
  return {
    id: doc._id.toHexString(),
    propertyId: doc.propertyId ?? undefined,
    type: doc.type,
    createdAt: doc.createdAt,
    dwellMs: doc.dwellMs ?? undefined,
    collectionKind: doc.collectionKind ?? undefined,
    simulated: doc.simulated,
    attribution: doc.metadata?.attribution ?? undefined,
    corrections: doc.metadata?.corrections ?? undefined,
    targetInteractionId: doc.metadata?.targetInteractionId ?? undefined,
  };
}

/** Full chronological interaction history (the long-horizon memory source of truth). */
export async function loadInteractionHistory(userId: string): Promise<EngineInteraction[]> {
  const c = await db();
  const docs = await c.interactions.find({ userId }).sort({ createdAt: 1, _id: 1 }).toArray();
  return docs.map(toEngineInteraction);
}
