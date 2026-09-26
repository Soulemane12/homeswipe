import "server-only";

interface OpenAIEmbeddingResponse {
  data: { embedding: number[]; index: number }[];
}

/** OpenAI embeddings, truncated to the same dimensionality as the Voyage index. */
export async function openaiEmbed(input: { apiKey: string; model: string; texts: string[]; dimensions: number }): Promise<number[][]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ input: input.texts, model: input.model, dimensions: input.dimensions }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`OpenAI embeddings failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as OpenAIEmbeddingResponse;
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}
