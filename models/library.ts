import type { ObjectId } from "mongodb";
import type { CollectionKind } from "@/lib/config/signals";
import type { HardConstraints } from "./user";

export interface SavedPropertyDoc {
  _id: ObjectId;
  userId: string;
  propertyId: string;
  collectionIds: ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CollectionDoc {
  _id: ObjectId;
  userId: string;
  name: string;
  kind: CollectionKind;
  createdAt: Date;
}

export interface SavedSearchDoc {
  _id: ObjectId;
  userId: string;
  name: string;
  filters: Partial<HardConstraints> & { minSqft?: number; maxHoa?: number; minYearBuilt?: number; features?: string[] };
  query?: string;
  alert: { enabled: boolean; minMatch: number };
  lastCheckedAt: Date;
  createdAt: Date;
}

export interface ConversationDoc {
  _id: ObjectId;
  userId: string;
  createdAt: Date;
  text: string;
  context: { pathname?: string; propertyId?: string };
  parser: "llm" | "heuristic";
  action: Record<string, unknown>;
  resultSummary: string;
}
