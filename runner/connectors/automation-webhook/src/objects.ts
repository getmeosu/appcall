export type NormalizedEvent = {
  id: string;
  provider: "automation-webhook";
  providerEventId: string;
  source: string;
  eventType: string;
  payload: Record<string, unknown>;
  headers: Record<string, string>;
  receivedAt: string;
  modelVersion: "2026-05-17";
  raw: Record<string, unknown>;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function prop(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return typeof v === "string" ? v : "";
}

function stringRecord(obj: Record<string, unknown>, key: string): Record<string, string> {
  const v = obj[key];
  if (!isRecord(v)) return {};
  const result: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === "string") result[k] = val;
  }
  return result;
}

function recordValue(obj: Record<string, unknown>, key: string): Record<string, unknown> {
  const v = obj[key];
  return isRecord(v) ? v : {};
}

export function normalizeEvent(e: Record<string, unknown>): NormalizedEvent {
  return {
    id: `webhook-event:${prop(e, "id")}`,
    provider: "automation-webhook",
    providerEventId: prop(e, "id"),
    source: prop(e, "source"),
    eventType: prop(e, "event_type"),
    payload: recordValue(e, "payload"),
    headers: stringRecord(e, "headers"),
    receivedAt: prop(e, "received_at"),
    modelVersion: "2026-05-17",
    raw: e,
  };
}

export function parseEventsResponse(response: unknown): { events: NormalizedEvent[] } {
  if (!isRecord(response)) return { events: [] };
  const events = response.events;
  if (!Array.isArray(events)) return { events: [] };
  return { events: events.filter(isRecord).map(normalizeEvent) };
}
