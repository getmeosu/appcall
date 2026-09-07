import { isRecord } from "./http";

export type NormalizedMeeting = {
  id: string;
  provider: "googlemeet";
  providerMeetingId: string;
  title: string;
  startTime: string;
  endTime: string;
  meetingUrl: string;
  modelVersion: "2026-05-31";
  raw: Record<string, unknown>;
};

function dateTime(v: unknown): string {
  return isRecord(v) && typeof v.dateTime === "string" ? v.dateTime : "";
}

function meetLink(m: Record<string, unknown>): string {
  if (typeof m.hangoutLink === "string" && m.hangoutLink) return m.hangoutLink;
  if (isRecord(m.conferenceData) && Array.isArray(m.conferenceData.entryPoints)) {
    const ep = m.conferenceData.entryPoints.find((e) => isRecord(e) && typeof e.uri === "string");
    if (isRecord(ep) && typeof ep.uri === "string") return ep.uri;
  }
  return "";
}

export function normalizeMeeting(m: Record<string, unknown>): NormalizedMeeting {
  const id = String(m.id ?? "");
  return {
    id: `gm-meeting:${id}`,
    provider: "googlemeet",
    providerMeetingId: id,
    title: typeof m.summary === "string" ? m.summary : "",
    startTime: dateTime(m.start),
    endTime: dateTime(m.end),
    meetingUrl: meetLink(m),
    modelVersion: "2026-05-31",
    raw: m,
  };
}

export function parseMeetingsResponse(response: unknown): { meetings: NormalizedMeeting[] } {
  if (!isRecord(response) || !Array.isArray(response.items)) return { meetings: [] };
  return { meetings: response.items.filter(isRecord).map(normalizeMeeting) };
}
