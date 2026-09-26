import "server-only";
import { cookies } from "next/headers";

export const JUDGE_COOKIE = "hs_judge";

/** Judge/debug mode exposes predictions and policy internals; consumer mode hides them. */
export async function isJudgeMode(): Promise<boolean> {
  const store = await cookies();
  return store.get(JUDGE_COOKIE)?.value === "1";
}
