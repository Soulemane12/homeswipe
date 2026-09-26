import type { InteractionType } from "@/lib/config/signals";
import type { SourceSurface } from "@/models/interaction";
import { apiFetch } from "./api";

export interface TrackInput {
  type: InteractionType;
  propertyId?: string;
  impressionId?: string;
  dwellMs?: number;
  photosViewed?: number;
  sourceSurface: SourceSurface;
  metadata?: Record<string, unknown>;
}

export interface TrackResult {
  interactionId: string;
  preferencesUpdating: boolean;
  resolved?: { predictedLabel: string; actualLabel: string; correct: boolean; predictedLikeScore: number; policyVersion: number };
}

/** Records an interaction. `keepalive` lets passive signals (dwell on leave) survive navigation. */
export function track(input: TrackInput, options: { keepalive?: boolean } = {}): Promise<TrackResult> {
  return apiFetch<TrackResult>("/api/interactions", { body: input, keepalive: options.keepalive });
}
