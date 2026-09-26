import "server-only";
import { DEMO_USER_ID } from "@/models/user";

/**
 * The single seam for identity. HomeSwipe runs as one demo user for the hackathon; swapping in
 * Clerk/Auth.js means returning the authenticated user's id here — nothing else changes.
 */
export async function getCurrentUserId(): Promise<string> {
  return DEMO_USER_ID;
}
