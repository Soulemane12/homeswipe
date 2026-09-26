import "server-only";
import { ObjectId } from "mongodb";
import type { CollectionKind } from "@/lib/config/signals";
import { db } from "@/lib/mongodb/collections";
import type { CollectionDoc } from "@/models/library";

const DEFAULTS: { name: string; kind: CollectionKind }[] = [
  { name: "Favorites", kind: "favorites" },
  { name: "Dream Homes", kind: "dream" },
  { name: "Tour", kind: "tour" },
];

export async function ensureDefaultCollections(userId: string): Promise<void> {
  const c = await db();
  const existing = await c.collections.find({ userId }).toArray();
  const missing = DEFAULTS.filter((d) => !existing.some((e) => e.kind === d.kind));
  if (missing.length === 0) return;
  await c.collections.insertMany(missing.map((d) => ({ _id: new ObjectId(), userId, name: d.name, kind: d.kind, createdAt: new Date() })));
}

export async function listCollections(userId: string): Promise<CollectionDoc[]> {
  const c = await db();
  await ensureDefaultCollections(userId);
  const docs = await c.collections.find({ userId }).sort({ createdAt: 1 }).toArray();
  const order: Record<CollectionKind, number> = { favorites: 0, dream: 1, tour: 2, custom: 3 };
  return docs.sort((a, b) => order[a.kind] - order[b.kind]);
}

export async function createCollection(userId: string, name: string): Promise<CollectionDoc> {
  const c = await db();
  const trimmed = name.trim().slice(0, 60);
  const existing = await c.collections.findOne({ userId, name: { $regex: `^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } });
  if (existing) throw new CollectionExistsError(existing.name);
  const doc: CollectionDoc = { _id: new ObjectId(), userId, name: trimmed, kind: "custom", createdAt: new Date() };
  await c.collections.insertOne(doc);
  return doc;
}

export class CollectionExistsError extends Error {
  constructor(name: string) {
    super(`You already have a collection named “${name}”.`);
  }
}

export async function deleteCollection(userId: string, collectionId: ObjectId): Promise<void> {
  const c = await db();
  const col = await c.collections.findOne({ _id: collectionId, userId });
  if (!col || col.kind !== "custom") return;
  await c.collections.deleteOne({ _id: collectionId });
  await c.savedProperties.updateMany({ userId }, { $pull: { collectionIds: collectionId } });
}

/** Saves a property into a collection (Favorites by default). Returns the collection kind used. */
export async function saveToCollection(userId: string, propertyId: string, collectionId?: ObjectId): Promise<CollectionKind> {
  const c = await db();
  const collections = await listCollections(userId);
  const target = collectionId ? collections.find((x) => x._id.equals(collectionId)) : collections.find((x) => x.kind === "favorites");
  if (!target) throw new Error("Collection not found");
  const now = new Date();
  await c.savedProperties.updateOne(
    { userId, propertyId },
    { $setOnInsert: { _id: new ObjectId(), userId, propertyId, createdAt: now }, $addToSet: { collectionIds: target._id }, $set: { updatedAt: now } },
    { upsert: true },
  );
  return target.kind;
}

export async function removeFromCollection(userId: string, propertyId: string, collectionId: ObjectId): Promise<void> {
  const c = await db();
  await c.savedProperties.updateOne({ userId, propertyId }, { $pull: { collectionIds: collectionId }, $set: { updatedAt: new Date() } });
  await c.savedProperties.deleteOne({ userId, propertyId, collectionIds: { $size: 0 } });
}

export async function unsaveProperty(userId: string, propertyId: string): Promise<void> {
  const c = await db();
  await c.savedProperties.deleteOne({ userId, propertyId });
}

export async function savedPropertyIds(userId: string): Promise<Set<string>> {
  const c = await db();
  const docs = await c.savedProperties.find({ userId }, { projection: { propertyId: 1 } }).toArray();
  return new Set(docs.map((d) => d.propertyId));
}

export async function listSaved(userId: string) {
  const c = await db();
  return c.savedProperties.find({ userId }).sort({ updatedAt: -1 }).toArray();
}
