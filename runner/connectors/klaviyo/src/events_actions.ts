import { createKlaviyoClient, parseKlaviyoRateLimit, prop, isRecord } from "./http";

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

export function normalizeEvent(d: Record<string, unknown>): NormalizedEvent {
  const attrs = isRecord(d.attributes) ? d.attributes : {};
  const metric = isRecord(attrs.metric) ? attrs.metric : {};
  const profile = isRecord(attrs.profile) ? attrs.profile : {};
  return {
    id: `kl-event:${prop(d, "id")}`,
    provider: "klaviyo",
    providerEventId: prop(d, "id"),
    metricName: prop(metric, "name"),
    profileEmail: prop(profile, "email"),
    value: typeof attrs.value === "number" ? attrs.value : 0,
    time: prop(attrs, "datetime"),
    modelVersion: "2026-05-16",
    raw: d,
  };
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
  const payload = validateCreateEventInput(input);
  const client = createKlaviyoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "events.create" });
  const profileAttrs: Record<string, unknown> = { email: payload.profileEmail };
  if (payload.profileId) profileAttrs.id = payload.profileId;
  const attrs: Record<string, unknown> = {
    metric: { data: { type: "metric", attributes: { name: payload.metricName } } },
    profile: { data: { type: "profile", attributes: profileAttrs } },
  };
  if (payload.properties) attrs.properties = payload.properties;
  if (payload.value !== undefined) attrs.value = payload.value;
  if (payload.time) attrs.time = payload.time;
  const result = await client.fetchJSON("/events", {
    method: "POST",
    body: JSON.stringify({ data: { type: "event", attributes: attrs } }),
  });
  // Klaviyo returns 202 Accepted for event tracking
  if (result.status === 202 || result.status === 201 || result.status === 200) {
    const body = result.body as Record<string, unknown>;
    // 202 often has no body; synthesize a minimal normalized event
    const data = isRecord(body.data) ? body.data : { id: "", attributes: { metric: { name: payload.metricName }, profile: { email: payload.profileEmail } } };
    return { ok: true, event: normalizeEvent(data) };
  }
  const rl = parseKlaviyoRateLimit(result.status, result.headers);
  if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Klaviyo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
  return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Klaviyo rejected the create event request." } };
}

function requireString(v: unknown, f: string): string {
  if (typeof v !== "string" || !v.length) throw new Error(`${f} is required`);
  return v;
}
