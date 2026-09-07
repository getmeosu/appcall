import { createKlaviyoClient, parseKlaviyoRateLimit, prop, isRecord } from "./http";

// ─── segments.get ─────────────────────────────────────────────────────────────

export type GetSegmentInput = { segmentId: string };

export type NormalizedSegment = {
  id: string;
  provider: "klaviyo";
  providerSegmentId: string;
  name: string;
  profileCount: number;
  createdAt: string;
  updatedAt: string;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeSegment(d: Record<string, unknown>): NormalizedSegment {
  const attrs = isRecord(d.attributes) ? d.attributes : {};
  return {
    id: `kl-segment:${prop(d, "id")}`,
    provider: "klaviyo",
    providerSegmentId: prop(d, "id"),
    name: prop(attrs, "name"),
    profileCount: typeof attrs.profile_count === "number" ? attrs.profile_count : 0,
    createdAt: prop(attrs, "created"),
    updatedAt: prop(attrs, "updated"),
    modelVersion: "2026-05-16",
    raw: d,
  };
}

export function validateGetSegmentInput(input: unknown): GetSegmentInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { segmentId: requireString(input.segmentId, "segmentId") };
}

export async function getSegmentFromClient(
  options: { apiKey: string; fetch?: typeof fetch },
  input: unknown
): Promise<{ ok: true; segment: NormalizedSegment } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
  const payload = validateGetSegmentInput(input);
  const client = createKlaviyoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "segments.get" });
  const result = await client.fetchJSON(`/segments/${payload.segmentId}`);
  if (result.status === 200) {
    const body = result.body as Record<string, unknown>;
    const data = isRecord(body.data) ? body.data : { id: payload.segmentId, attributes: {} };
    return { ok: true, segment: normalizeSegment(data) };
  }
  const rl = parseKlaviyoRateLimit(result.status, result.headers);
  if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Klaviyo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
  if (result.status === 404) return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Segment not found." } };
  return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Klaviyo rejected the get segment request." } };
}

function requireString(v: unknown, f: string): string {
  if (typeof v !== "string" || !v.length) throw new Error(`${f} is required`);
  return v;
}
