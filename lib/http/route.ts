import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type z } from "zod";
import { CollectionExistsError } from "@/services/collections";
import { InteractionError } from "@/services/interactions/record";

export function json<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, init);
}

export function errorResponse(status: number, message: string, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

/** Wraps a route handler with consistent error mapping (validation → 400, config → 503). */
export function handle<Args extends unknown[]>(fn: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse(400, "Invalid request", error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
      }
      if (error instanceof InteractionError) return errorResponse(error.status, error.message);
      if (error instanceof CollectionExistsError) return errorResponse(409, error.message);
      const message = (error as Error).message ?? "Unexpected error";
      if (message.includes("MONGODB_URI")) return errorResponse(503, message);
      console.error("[api]", error);
      return errorResponse(500, "Something went wrong. Please try again.");
    }
  };
}

export async function parseBody<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  return schema.parse(body);
}
