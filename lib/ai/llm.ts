import "server-only";
import { z } from "zod";
import { env } from "@/lib/env";

export type LlmProvider = "openai" | "openrouter";

export function llmConfig(): { provider: LlmProvider; model: string; apiKey: string; baseUrl: string } | null {
  const e = env();
  if (e.OPENAI_API_KEY) {
    return { provider: "openai", model: e.LLM_MODEL ?? "gpt-5-mini", apiKey: e.OPENAI_API_KEY, baseUrl: "https://api.openai.com/v1" };
  }
  if (e.OPENROUTER_API_KEY) {
    return { provider: "openrouter", model: e.LLM_MODEL ?? "openai/gpt-5-mini", apiKey: e.OPENROUTER_API_KEY, baseUrl: "https://openrouter.ai/api/v1" };
  }
  return null;
}

export function llmAvailable(): boolean {
  return llmConfig() !== null;
}

interface ChatResponse {
  choices?: { message?: { content?: string | null } }[];
}

/**
 * Structured output via the OpenAI-compatible chat API (OpenAI or OpenRouter). The response
 * must parse against `schema`; anything else is rejected (returns null) so callers fall back
 * to deterministic heuristics. Output is data only — never executed.
 */
export async function generateStructured<T>(input: {
  name: string;
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  timeoutMs?: number;
}): Promise<T | null> {
  const config = llmConfig();
  if (!config) return null;
  try {
    const jsonSchema = z.toJSONSchema(input.schema, { target: "draft-7" });
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.prompt },
        ],
        response_format: { type: "json_schema", json_schema: { name: input.name, schema: jsonSchema, strict: false } },
      }),
      signal: AbortSignal.timeout(input.timeoutMs ?? 20_000),
    });
    if (!res.ok) {
      console.error(`[llm] ${config.provider} ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return null;
    }
    const json = (await res.json()) as ChatResponse;
    const content = json.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = input.schema.safeParse(JSON.parse(content));
    if (!parsed.success) {
      console.error(`[llm] ${input.name} output failed validation:`, parsed.error.issues.slice(0, 3));
      return null;
    }
    return parsed.data;
  } catch (error) {
    console.error(`[llm] ${input.name} failed:`, (error as Error).message);
    return null;
  }
}
