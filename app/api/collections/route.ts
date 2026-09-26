import { z } from "zod";
import { getCurrentUserId } from "@/lib/auth/session";
import { handle, json, parseBody } from "@/lib/http/route";
import { createCollection, listCollections } from "@/services/collections";

export const GET = handle(async () => {
  const collections = await listCollections(await getCurrentUserId());
  return json({ collections: collections.map((c) => ({ id: c._id.toHexString(), name: c.name, kind: c.kind })) });
});

const Body = z.object({ name: z.string().trim().min(1).max(60) });

export const POST = handle(async (request: Request) => {
  const body = await parseBody(request, Body);
  const c = await createCollection(await getCurrentUserId(), body.name);
  return json({ id: c._id.toHexString(), name: c.name, kind: c.kind });
});
