import { prop, isRecord } from "./http";

// ---------------------------------------------------------------------------
// NormalizedRun
// ---------------------------------------------------------------------------

export type NormalizedRun = {
  id: string;
  provider: "apify";
  status: string;
  actorId: string;
  startedAt: string;
  finishedAt: string;
  defaultDatasetId: string;
  modelVersion: "2026-05-17";
  raw: Record<string, unknown>;
};

export function normalizeRun(r: Record<string, unknown>): NormalizedRun {
  const meta = isRecord(r.meta) ? r.meta : {};
  const actorId = prop(r, "actId") || prop(meta as Record<string, unknown>, "actId");
  return {
    id: prop(r, "id"),
    provider: "apify",
    status: prop(r, "status"),
    actorId,
    startedAt: prop(r, "startedAt"),
    finishedAt: prop(r, "finishedAt"),
    defaultDatasetId: prop(r, "defaultDatasetId"),
    modelVersion: "2026-05-17",
    raw: r,
  };
}

export function parseRunResponse(response: unknown): { run: NormalizedRun | null } {
  if (!isRecord(response)) return { run: null };
  // Apify wraps in { data: {...} }
  const data = isRecord(response.data) ? response.data : response;
  if (!isRecord(data)) return { run: null };
  return { run: normalizeRun(data) };
}
