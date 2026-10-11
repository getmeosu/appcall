import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";
import { REVISION } from "./revision";

export function parseKlaviyoRateLimit(status: number, _headers: Record<string, string>): { limited: boolean; retryAfterSeconds: number } {
  if (status === 429) { return { limited: true, retryAfterSeconds: 30 }; }
  return { limited: false, retryAfterSeconds: 0 };
}

export function parseNextCursor(response: unknown): string | null {
  if (!isRecord(response)) return null;
  const links = response.links;
  if (!isRecord(links)) return null;
  const next = links.next;
  return typeof next === "string" && next.length > 0 ? next : null;
}

export function extractCursorFromUrl(url: string): string | null {
  const match = url.match(/page%5Bcursor%5D=([^&]+)/);
  return match ? match[1] : null;
}

// KV-1: Klaviyo's 2026-07-15 OpenAPI declares request bodies and responses as
// application/vnd.api+json. Caller headers are spread first; Authorization,
// accept, revision and (for string bodies) Content-Type are then pinned, so a
// caller cannot override the revision on the wire (any casing is dropped).
export const JSON_API = "application/vnd.api+json";
const PINNED = new Set(["authorization", "accept", "revision", "content-type"]);
export function klaviyoHeaders(apiKey: string, init: RequestInit = {}): Record<string, string> {
  const caller: Record<string, string> = {};
  const raw = init.headers;
  if (raw instanceof Headers) raw.forEach((v, k) => { caller[k] = v; });
  else if (Array.isArray(raw)) for (const [k, v] of raw as [string, string][]) caller[k] = v;
  else Object.assign(caller, (raw ?? {}) as Record<string, string>);
  const hasJsonBody = typeof init.body === "string";
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(caller)) {
    const lower = k.toLowerCase();
    if (PINNED.has(lower) && (lower !== "content-type" || hasJsonBody)) continue;
    headers[k] = v;
  }
  headers.Authorization = `Klaviyo-API-Key ${apiKey}`;
  headers.accept = JSON_API;
  headers.revision = REVISION;
  if (hasJsonBody) headers["Content-Type"] = JSON_API;
  return headers;
}

export type KlaviyoClientOptions = { apiKey: string; fetch?: typeof fetch; operation?: string };

export function createKlaviyoClient(options: KlaviyoClientOptions) {
  const operation = options.operation ?? "contacts.list";
  const maxResponseBytes = (manifest.operations as Record<string, { maxResponseBytes?: number }>)[operation]?.maxResponseBytes ?? 5242880;
  const httpClient = createConnectorHttpClient({ allowedHosts: manifest.network.allowedHosts as string[], maxResponseBytes, fetch: options.fetch });
  return {
    async fetchJSON(path: string, init: RequestInit = {}): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
      const response = await httpClient.fetchText(`https://a.klaviyo.com/api${path}`, {
        ...init, headers: klaviyoHeaders(options.apiKey, init),
      });
      let body: unknown;
      try { body = JSON.parse(response.body); } catch { body = response.body; }
      return { status: response.status, headers: response.headers, body };
    },
  };
}
export type KlaviyoClient = ReturnType<typeof createKlaviyoClient>;
export function prop(obj: Record<string, unknown>, field: string, fallback: string = ""): string { const v = obj[field]; return typeof v === "string" ? v : fallback; }

export function firstString(input: Record<string, unknown>, keys: string[], label: string): string {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  throw new Error(`${label} is required`);
}

export function queryPath(path: string, input: unknown): string {
  if (!isRecord(input)) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    const allowed = key === "filter" || key === "sort" || key === "include" || key.startsWith("fields[") || key.startsWith("page[") || key.startsWith("additional-fields[");
    if (!allowed || value == null) continue;
    if (Array.isArray(value)) {
      const items = value.filter((item): item is string => typeof item === "string" && item.length > 0);
      if (items.length) params.set(key, items.join(","));
    } else if (typeof value === "string" && value.length) params.set(key, value);
    else if (typeof value === "number") params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
function isRecord(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }
export { isRecord };
