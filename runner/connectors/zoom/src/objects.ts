import { prop, propNum, isRecord } from "./http";

// ---------------------------------------------------------------------------
// NormalizedMeeting
// ---------------------------------------------------------------------------

export type NormalizedMeeting = {
  id: string;
  provider: "zoom";
  topic: string;
  startTime: string;
  duration: number;
  joinUrl: string;
  timezone: string;
  modelVersion: "2026-05-17";
  raw: Record<string, unknown>;
};

export function normalizeMeeting(m: Record<string, unknown>): NormalizedMeeting {
  const rawId = m["id"];
  const idStr = typeof rawId === "number" ? String(rawId) : typeof rawId === "string" ? rawId : "";
  return {
    id: `zoom-meeting:${idStr}`,
    provider: "zoom",
    topic: prop(m, "topic"),
    startTime: prop(m, "start_time"),
    duration: propNum(m, "duration"),
    joinUrl: prop(m, "join_url"),
    timezone: prop(m, "timezone"),
    modelVersion: "2026-05-17",
    raw: m,
  };
}

export function parseMeetingResponse(response: unknown): { meeting: NormalizedMeeting | null } {
  if (!isRecord(response)) return { meeting: null };
  return { meeting: normalizeMeeting(response) };
}

export function parseMeetingsListResponse(response: unknown): { meetings: NormalizedMeeting[]; nextPageToken: string | null; totalRecords: number } {
  if (!isRecord(response)) return { meetings: [], nextPageToken: null, totalRecords: 0 };
  const list = response["meetings"];
  if (!Array.isArray(list)) return { meetings: [], nextPageToken: null, totalRecords: 0 };
  const nextPageToken = typeof response["next_page_token"] === "string" && response["next_page_token"] ? response["next_page_token"] : null;
  const totalRecords = typeof response["total_records"] === "number" ? response["total_records"] : 0;
  return {
    meetings: list.filter(isRecord).map(normalizeMeeting),
    nextPageToken,
    totalRecords,
  };
}
