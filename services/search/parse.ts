import "server-only";
import { generateStructured, llmAvailable } from "@/lib/ai/llm";
import { isAllowedDimension } from "@/lib/guardrails/fair-housing";
import { DIMENSION_KEYS } from "@/lib/features/dimensions";
import { parseSearchQueryHeuristic, ParsedQuerySchema, type ParsedQuery } from "@/lib/search/parse-query";

/**
 * Natural-language query → structured search. The LLM (if configured) extracts the same
 * schema; the result is sanitized (known dimensions only, fair-housing guardrail) and the
 * heuristic parser is always the fallback.
 */
export async function parseSearchQuery(text: string): Promise<ParsedQuery & { parser: "llm" | "heuristic" }> {
  const heuristic = parseSearchQueryHeuristic(text);
  if (!llmAvailable()) return { ...heuristic, parser: "heuristic" };
  const out = await generateStructured({
    name: "search_query",
    schema: ParsedQuerySchema,
    system: [
      "Extract a structured NYC home search from the user's text.",
      "constraints: only explicit hard limits the user stated (price in dollars, min bedrooms/bathrooms, property types from [condo, co-op, townhouse, single_family, multi_family], boroughs, neighborhoods).",
      `desired/avoided: soft property attributes using ONLY these keys: ${DIMENSION_KEYS.join(", ")}.`,
      "semanticText: a short description of the home they want.",
      "Never infer anything about people, demographics, schools, religion or family status.",
    ].join(" "),
    prompt: text,
    timeoutMs: 12_000,
  });
  if (!out) return { ...heuristic, parser: "heuristic" };
  const known = (k: string) => DIMENSION_KEYS.includes(k) && isAllowedDimension(k);
  return {
    constraints: out.constraints,
    desired: out.desired.filter(known),
    avoided: out.avoided.filter(known),
    semanticText: out.semanticText || text,
    parser: "llm",
  };
}
