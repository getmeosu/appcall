import { createKlaviyoClient, firstString, parseKlaviyoRateLimit, prop, queryPath, isRecord } from "./http";

// ─── events.create ────────────────────────────────────────────────────────────

export type CreateEventInput = {
  metricName: string;
  profileEmail: string;
  profileId?: string;
  properties?: Record<string, unknown>;
  value?: number;
  time?: string;
};

export type NormalizedEvent = {
  id: string;
  provider: "klaviyo";
  providerEventId: string;
  metricName: string;
  profileEmail: string;
  value: number;
  time: string;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

// KV-1: GET /api/events(/{id}) (revision 2026-07-15, EventResponseObjectResource)
// returns only timestamp/event_properties/datetime/uuid as attributes; metric
// and profile are `relationships.{metric,profile}.data` linkage resolved
// through the compound document's `included` (include=metric,profile). The
// monetary value is the reserved `$value` key inside `event_properties`
// (Klaviyo event properties; arch notes TF:140 event_properties, TF:141-143
// attributes.value/metric/profile absent in every revision).
function includedResource(d: Record<string, unknown>, rel: string, included: unknown): Record<string, unknown> {
  const rels = isRecord(d.relationships) ? d.relationships : {};
  const link = isRecord(rels[rel]) && isRecord((rels[rel] as Record<string, unknown>).data) ? (rels[rel] as Record<string, unknown>).data as Record<string, unknown> : undefined;
  if (!link || !Array.isArray(included)) return {};
  const id = prop(link, "id");
  const hit = included.find((r): r is Record<string, unknown> => isRecord(r) && r.type === rel && prop(r, "id") === id && id.length > 0);
  return hit && isRecord(hit.attributes) ? hit.attributes : {};
}

function eventValue(attrs: Record<string, unknown>): number {
  const props = isRecord(attrs.event_properties) ? attrs.event_properties : {};
  const v = props["$value"];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim().length > 0 && Number.isFinite(Number(v))) return Number(v);
  return 0;
}

export function normalizeEvent(d: Record<string, unknown>, included?: unknown): NormalizedEvent {
  const attrs = isRecord(d.attributes) ? d.attributes : {};
  return {
    id: `kl-event:${prop(d, "id")}`,
    provider: "klaviyo",
    providerEventId: prop(d, "id"),
    metricName: prop(includedResource(d, "metric", included), "name"),
    profileEmail: prop(includedResource(d, "profile", included), "email"),
    value: eventValue(attrs),
    time: prop(attrs, "datetime"),
    modelVersion: "2026-05-16",
    raw: d,
  };
}

// Adds include=metric,profile (plus sparse fieldsets for just the fields the
// normalizer reads) unless the caller already asked for them.
function withEventIncludes(input: unknown): Record<string, unknown> {
  const base: Record<string, unknown> = isRecord(input) ? { ...input } : {};
  const existing = typeof base.include === "string" ? base.include.split(",") : Array.isArray(base.include) ? base.include.filter((x): x is string => typeof x === "string") : [];
  const merged = [...existing];
  for (const need of ["metric", "profile"]) if (!merged.includes(need)) merged.push(need);
  base.include = merged;
  if (!existing.includes("metric") && base["fields[metric]"] === undefined) base["fields[metric]"] = "name";
  if (!existing.includes("profile") && base["fields[profile]"] === undefined) base["fields[profile]"] = "email";
  return base;
}

export function validateCreateEventInput(input: unknown): CreateEventInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {
    metricName: requireString(input.metricName, "metricName"),
    profileEmail: requireString(input.profileEmail, "profileEmail"),
    profileId: typeof input.profileId === "string" ? input.profileId : undefined,
    properties: isRecord(input.properties) ? (input.properties as Record<string, unknown>) : undefined,
    value: typeof input.value === "number" ? input.value : undefined,
    time: typeof input.time === "string" ? input.time : undefined,
  };
}

export async function createEventFromClient(
  options: { apiKey: string; fetch?: typeof fetch },
  input: unknown
): Promise<{ ok: true; event: NormalizedEvent } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
  const rawData = isRecord(input) && isRecord(input.data) ? input.data : undefined;
  const payload = rawData ? { metricName: "", profileEmail: "" } : validateCreateEventInput(input);
  const client = createKlaviyoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "events.create" });
  // KV-1: the profile id belongs at profile.data.id (arch notes TF:129);
  // profile.data.attributes.id is not in the spec (TF:131). email stays in
  // profile.data.attributes (TF:130).
  const profileData: Record<string, unknown> = { type: "profile" };
  if (payload.profileId) profileData.id = payload.profileId;
  profileData.attributes = { email: payload.profileEmail };
  const attrs: Record<string, unknown> = {
    metric: { data: { type: "metric", attributes: { name: payload.metricName } } },
    profile: { data: profileData },
  };
  if (payload.properties) attrs.properties = payload.properties;
  if (payload.value !== undefined) attrs.value = payload.value;
  if (payload.time) attrs.time = payload.time;
  const result = await client.fetchJSON("/events", {
    method: "POST",
    body: JSON.stringify(rawData ? { data: rawData } : { data: { type: "event", attributes: attrs } }),
  });
  // Klaviyo returns 202 Accepted for event tracking
  if (result.status === 202 || result.status === 201 || result.status === 200) {
    // Klaviyo answers 202 with an empty body, so the event is reported from
    // what was accepted; an id is taken from a response body if one exists.
    const body = isRecord(result.body) ? result.body : {};
    const data = isRecord(body.data) ? body.data : {};
    const accepted = payload as Partial<CreateEventInput>;
    return { ok: true, event: {
      id: `kl-event:${prop(data, "id")}`, provider: "klaviyo", providerEventId: prop(data, "id"),
      metricName: accepted.metricName ?? "", profileEmail: accepted.profileEmail ?? "",
      value: typeof accepted.value === "number" ? accepted.value : 0,
      time: typeof accepted.time === "string" ? accepted.time : "",
      modelVersion: "2026-05-16", raw: data,
    } };
  }
  const rl = parseKlaviyoRateLimit(result.status, result.headers);
  if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Klaviyo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
  return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Klaviyo rejected the create event request." } };
}

export type GetEventInput = { eventId: string };
export type ListEventsInput = Record<string, never>;

export function validateGetEventInput(input: unknown): GetEventInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { eventId: firstString(input, ["eventId", "id"], "eventId") };
}

export function validateListEventsInput(input: unknown): ListEventsInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {};
}

export async function getEventFromClient(
  options: { apiKey: string; fetch?: typeof fetch },
  input: unknown
): Promise<{ ok: true; event: NormalizedEvent } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
  const payload = validateGetEventInput(input);
  const client = createKlaviyoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "events.get" });
  const result = await client.fetchJSON(queryPath(`/events/${payload.eventId}`, withEventIncludes(input)));
  if (result.status === 200) {
    const body = isRecord(result.body) ? result.body : {};
    const data = isRecord(body.data) ? body.data : { id: payload.eventId, attributes: {} };
    return { ok: true, event: normalizeEvent(data, body.included) };
  }
  const rl = parseKlaviyoRateLimit(result.status, result.headers);
  if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Klaviyo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
  if (result.status === 404) return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Event not found." } };
  return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Klaviyo rejected the get event request." } };
}

export async function listEventsFromClient(
  options: { apiKey: string; fetch?: typeof fetch },
  input: unknown
): Promise<{ ok: true; events: NormalizedEvent[] } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
  validateListEventsInput(input);
  const client = createKlaviyoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "events.list" });
  const result = await client.fetchJSON(queryPath("/events", withEventIncludes(input)));
  if (result.status === 200) {
    const body = isRecord(result.body) ? result.body : {};
    const data = Array.isArray(body.data) ? body.data.filter(isRecord) : [];
    return { ok: true, events: data.map((d) => normalizeEvent(d, body.included)) };
  }
  const rl = parseKlaviyoRateLimit(result.status, result.headers);
  if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Klaviyo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
  return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Klaviyo rejected the list events request." } };
}

function requireString(v: unknown, f: string): string {
  if (typeof v !== "string" || !v.length) throw new Error(`${f} is required`);
  return v;
}
