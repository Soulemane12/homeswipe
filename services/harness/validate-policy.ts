import { applyChanges, type PolicyChange } from "@/lib/engine/policy-patch";
import { safeParsePolicy, type HarnessPolicy } from "@/lib/engine/policy-schema";
import { checkPreferenceText } from "@/lib/guardrails/fair-housing";

/**
 * Validation gate for any candidate policy: schema + bounds (Zod), allow-listed paths only,
 * fair-housing guardrail on every dimension key and on the free-text evidence.
 */
export function validateCandidate(base: HarnessPolicy, changes: PolicyChange[]): { ok: true; policy: HarnessPolicy } | { ok: false; errors: string[] } {
  const textErrors = changes.flatMap((c) => {
    const e = checkPreferenceText(`${c.evidence} ${c.expectedEffect}`);
    return e.allowed ? [] : [`${c.path}: ${e.reason}`];
  });
  if (textErrors.length > 0) return { ok: false, errors: textErrors };
  return applyChanges(base, changes);
}

export function validatePolicy(input: unknown) {
  return safeParsePolicy(input);
}
