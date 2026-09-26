import "server-only";

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";

interface VoyageResponse {
  data: { embedding: number[]; index: number }[];
  model: string;
}

/** Voyage AI embeddings (default model voyage-4; voyage-4-lite is a cheaper, faster fallback). */
export async function voyageEmbed(input: {
  apiKey: string;
  model: string;
  texts: string[];
  inputType: "document" | "query";
  dimensions: number;
}): Promise<number[][]> {
  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      input: input.texts,
      model: input.model,
      input_type: input.inputType,
      output_dimension: input.dimensions,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Voyage embeddings failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as VoyageResponse;
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}
