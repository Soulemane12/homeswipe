const NAMES: Record<string, string> = {
  "rankingWeights.semantic": "Semantic weight",
  "rankingWeights.explicit": "Explicit-preference weight",
  "rankingWeights.inferred": "Learned lifestyle weight",
  "rankingWeights.visual": "Learned visual weight",
  "rankingWeights.behavior": "Behavior (similar-to-engaged) weight",
  "rankingWeights.metadata": "Metadata weight",
  "rankingWeights.freshness": "Freshness weight",
  "rankingWeights.exploration": "Exploration weight",
  "memoryPolicy.recentInteractionWindow": "Recent memory window",
  "memoryPolicy.recentMemoryWeight": "Recent memory weight",
  "memoryPolicy.longTermMemoryWeight": "Long-term memory weight",
  "memoryPolicy.negativeMemoryWeight": "Negative memory weight",
  "memoryPolicy.maxPositiveMemories": "Max positive memories",
  "memoryPolicy.maxNegativeMemories": "Max negative memories",
  "explorationPolicy.rate": "Exploration rate",
  "explorationPolicy.strategy": "Exploration strategy",
  "explorationPolicy.minConfidenceTarget": "Exploration confidence target",
  "prediction.threshold": "Like threshold",
  "prediction.sharpness": "Prediction sharpness",
};

export function pathName(path: string): string {
  if (NAMES[path]) return NAMES[path];
  if (path.startsWith("featureImportance.")) return `Importance: ${path.split(".")[1].replace(/_/g, " ")}`;
  if (path.startsWith("candidateGenerators.")) {
    const [, gen, field] = path.split(".");
    return `Generator ${gen} ${field}`;
  }
  if (path.startsWith("contextPolicy.")) return `Context: ${path.split(".")[1].replace(/([A-Z])/g, " $1").toLowerCase()}`;
  return path;
}

export function formatValue(v: number | boolean | string | null): string {
  if (v === null) return "—";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return String(v);
}

export function pct(v: number, digits = 0): string {
  return `${(v * 100).toFixed(digits)}%`;
}
