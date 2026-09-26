import "server-only";
import { ObjectId } from "mongodb";
import { generateStructured, llmAvailable } from "@/lib/ai/llm";
import { CommandActionSchema, parseCommandHeuristic, type CommandAction, type CommandContext } from "@/lib/command/parse";
import { displayMatch } from "@/lib/engine/prediction";
import { DIMENSION_KEYS, dimensionNoun } from "@/lib/features/dimensions";
import { NEIGHBORHOODS } from "@/lib/seed/neighborhoods";
import { db } from "@/lib/mongodb/collections";
import { applyCorrection } from "@/services/preferences/corrections";
import { getPersonalContext } from "@/services/recommendations/personalize";

export interface CommandResult {
  kind: CommandAction["kind"];
  message: string;
  href?: string;
  parser: "llm" | "heuristic";
}

const NEAR_MANHATTAN = ["Long Island City", "Williamsburg", "DUMBO", "Brooklyn Heights", "Greenpoint", "Astoria"];

async function parseCommand(text: string, context: CommandContext): Promise<{ action: CommandAction; parser: "llm" | "heuristic" }> {
  const heuristic = parseCommandHeuristic(text, context);
  if (!llmAvailable()) return { action: heuristic, parser: "heuristic" };
  const out = await generateStructured({
    name: "command_action",
    schema: CommandActionSchema,
    system: [
      "Translate a home-search command into exactly one structured action.",
      "kinds: search (new search from text), similar (relative to the current property: cheaper, closerTo a borough, keep attributes, avoidSameNeighborhood),",
      "explain (why the user might like the current property), correction (user explains the real reason they liked/disliked the current property: because = attribute keys, notBecauseOf = attribute keys or groups kitchen/floors/light/style/building/location/outdoor/finishes),",
      `preference (user states what they want/avoid/don't care about). Attribute keys: ${DIMENSION_KEYS.join(", ")}.`,
      "Never infer anything about people, demographics, schools, religion or family status.",
    ].join(" "),
    prompt: JSON.stringify({ text, currentPropertyId: context.propertyId ?? null }),
    timeoutMs: 12_000,
  });
  if (!out) return { action: heuristic, parser: "heuristic" };
  if ((out.kind === "explain" || out.kind === "correction") && !context.propertyId) {
    return { action: heuristic, parser: "heuristic" };
  }
  return { action: out, parser: "llm" };
}

/**
 * Natural-language control layer over search, recommendation refinement and preference
 * correction. Not a chatbot: every command becomes one validated action, executed by the same
 * services the UI uses, and logged to `conversations`.
 */
export async function runCommand(userId: string, text: string, context: CommandContext & { pathname?: string }): Promise<CommandResult> {
  const { action, parser } = await parseCommand(text, context);
  let result: Omit<CommandResult, "parser">;

  switch (action.kind) {
    case "search":
      result = { kind: "search", message: `Searching for “${action.query}”.`, href: `/search?q=${encodeURIComponent(action.query)}` };
      break;
    case "similar": {
      const anchorId = action.anchorPropertyId ?? context.propertyId;
      if (!anchorId) {
        result = { kind: "similar", message: "Open a home first, then ask for similar ones — or describe what you want and I'll search.", href: `/search?q=${encodeURIComponent(text)}` };
        break;
      }
      const ctx = await getPersonalContext(userId);
      const anchor = ctx.catalog.propertyById.get(anchorId);
      const params = new URLSearchParams({ similar: anchorId });
      if (action.cheaper && anchor) params.set("maxPrice", String(Math.round((anchor.financial.price * 0.85) / 5000) * 5000));
      if (action.maxPrice) params.set("maxPrice", String(action.maxPrice));
      if (action.closerTo === "Manhattan") {
        const hoods = [...NEIGHBORHOODS.filter((n) => n.borough === "Manhattan").map((n) => n.name), ...NEAR_MANHATTAN];
        params.set("neighborhoods", hoods.join(","));
      } else if (action.closerTo) {
        params.set("boroughs", action.closerTo);
      }
      if (action.avoidSameNeighborhood && anchor) params.set("excludeNeighborhoods", anchor.address.neighborhood);
      if (action.keep.length > 0) params.set("features", action.keep.filter((k) => (anchor?.ai.features[k] ?? 0) >= 0.6).join(","));
      const bits = [action.cheaper ? "cheaper" : null, action.closerTo ? `closer to ${action.closerTo}` : null, action.avoidSameNeighborhood ? "in a different neighborhood" : null].filter(Boolean);
      result = { kind: "similar", message: `Finding homes like this one${bits.length ? `, ${bits.join(", ")}` : ""}.`, href: `/search?${params.toString()}` };
      break;
    }
    case "explain": {
      const propertyId = action.propertyId ?? context.propertyId;
      if (!propertyId) {
        result = { kind: "explain", message: "Open a home and ask again — I'll explain how it matches what I've learned about you." };
        break;
      }
      const ctx = await getPersonalContext(userId);
      const p = ctx.catalog.byId.get(propertyId);
      if (!p) {
        result = { kind: "explain", message: "I couldn't find that home." };
        break;
      }
      const scored = ctx.scorer.score(p);
      const reasons = scored.reasons.map((r) => r.text.toLowerCase());
      const tradeoffs = scored.tradeoffs.map((r) => r.text.toLowerCase());
      result = {
        kind: "explain",
        message: `${displayMatch(scored.breakdown.fit)}% match. ${reasons.length ? `You tend to like ${reasons.join(", ")} — and this home has it.` : "I don't have strong signals for this home yet."}${tradeoffs.length ? ` Possible tradeoffs: ${tradeoffs.join(", ")}.` : ""}`,
      };
      break;
    }
    case "correction": {
      const propertyId = action.propertyId ?? context.propertyId;
      const corrections = action.because.map((dimension) => ({ dimension, stance: "important" as const, direction: action.direction }));
      await applyCorrection(userId, { corrections, propertyId, because: action.because, notBecauseOf: action.notBecauseOf, text, sourceSurface: "command" });
      const nounList = action.because.map(dimensionNoun).join(" and ");
      result = {
        kind: "correction",
        message: `Got it${nounList ? ` — ${action.direction === "negative" ? "I'll weigh" : "I'll look for"} ${nounList}${action.direction === "negative" ? " as a strong negative" : ""}` : ""}${action.notBecauseOf.length ? `, and I won't blame the ${action.notBecauseOf.join(", ")}` : ""}.`,
      };
      break;
    }
    case "preference": {
      await applyCorrection(userId, { corrections: action.corrections, text, sourceSurface: "command" });
      const parts = action.corrections.map((c) =>
        c.stance === "not_important" ? `${dimensionNoun(c.dimension)} doesn't matter` : `${c.direction === "negative" ? "avoid" : "prioritize"} ${dimensionNoun(c.dimension)}`,
      );
      result = { kind: "preference", message: `Updated your Home DNA: ${parts.join("; ")}.`, href: "/home-dna" };
      break;
    }
  }

  const c = await db();
  await c.conversations.insertOne({
    _id: new ObjectId(),
    userId,
    createdAt: new Date(),
    text: text.slice(0, 500),
    context: { pathname: context.pathname, propertyId: context.propertyId },
    parser,
    action: action as unknown as Record<string, unknown>,
    resultSummary: result.message,
  });
  return { ...result, parser };
}

export async function recentCommands(userId: string, limit = 5) {
  const c = await db();
  return c.conversations.find({ userId }).sort({ createdAt: -1 }).limit(limit).toArray();
}
