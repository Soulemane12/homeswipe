import { z } from "zod";
import { getCurrentUserId } from "@/lib/auth/session";
import { handle, json, parseBody } from "@/lib/http/route";
import { runCommand } from "@/services/command";

export const maxDuration = 60;

const Body = z.object({ text: z.string().trim().min(2).max(300), pathname: z.string().max(200).optional(), propertyId: z.string().max(60).optional() });

/** POST /api/command — natural-language control layer (search, refine, explain, correct). */
export const POST = handle(async (request: Request) => {
  const body = await parseBody(request, Body);
  return json(await runCommand(await getCurrentUserId(), body.text, { pathname: body.pathname, propertyId: body.propertyId }));
});
