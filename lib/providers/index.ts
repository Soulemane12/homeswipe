import "server-only";
import { env } from "@/lib/env";
import { RentCastPropertyProvider } from "./rentcast";
import { SeedPropertyProvider } from "./seed";
import type { PropertyProvider } from "./types";

/** Configured provider; falls back to the seed dataset whenever RentCast is not configured. */
export function getPropertyProvider(): PropertyProvider {
  const e = env();
  if (e.PROPERTY_PROVIDER === "rentcast" && e.RENTCAST_API_KEY) return new RentCastPropertyProvider(e.RENTCAST_API_KEY);
  if (e.PROPERTY_PROVIDER === "rentcast") console.warn("[providers] PROPERTY_PROVIDER=rentcast but RENTCAST_API_KEY is missing; using seed data.");
  return new SeedPropertyProvider();
}
