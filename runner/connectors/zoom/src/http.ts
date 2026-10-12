import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

export function parseZoomRateLimit(status: number, headers: Record<string, string>): { limited: boolean; retryAfterSeconds: number } {
  if (status === 429) {
    const retryAfter = Number(headers["retry-after"] ?? headers["x-ratelimit-reset"] ?? "10");
    return { limited: true, retryAfterSeconds: retryAfter > 0 ? retryAfter : 10 };
  }
  return { limited: false, retryAfterSeconds: 0 };
}

export type ZoomClientOptions = { accessToken: string; fetch?: typeof fetch; operation?: string };

export function createZoomClient(options: ZoomClientOptions) {
  const operation = options.operation ?? "meetings.list";
  const maxResponseBytes = (manifest.operations as Record<string, { maxResponseBytes?: number }>)[operation]?.maxResponseBytes ?? 5242880;
  const httpClient = createConnectorHttpClient({ allowedHosts: manifest.network.allowedHosts as string[], maxResponseBytes, fetch: options.fetch });
  return {
    async fetchJSON(path: string, init: RequestInit = {}): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
      const headerBag: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
      const hasContentType = Object.keys(headerBag).some((key) => key.toLowerCase() === "content-type");
      const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
      const headers: Record<string, string> = {
        "Authorization": `Bearer ${options.accessToken}`,
        ...headerBag,
      };
      if (!hasContentType && !isForm) headers["Content-Type"] = "application/json";
      const response = await httpClient.fetchText(`https://api.zoom.us${path}`, { ...init, headers });
      let body: unknown;
      if (response.body && response.body.trim().length > 0) {
        try { body = JSON.parse(response.body); } catch { body = response.body; }
      } else {
        body = {};
      }
      return { status: response.status, headers: response.headers, body };
    },
  };
}
export type ZoomClient = ReturnType<typeof createZoomClient>;

export function prop(obj: Record<string, unknown>, field: string, fallback: string = ""): string { const v = obj[field]; return typeof v === "string" ? v : fallback; }
export function propNum(obj: Record<string, unknown>, field: string, fallback: number = 0): number { const v = obj[field]; if (typeof v === "number") return v; if (typeof v === "string") { const n = Number(v); return Number.isFinite(n) ? n : fallback; } return fallback; }
export function isRecord(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }

export function fieldString(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.length > 0) return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

export function fieldNumber(obj: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

export function fieldBoolean(obj: Record<string, unknown>, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "boolean") return value;
  }
  return undefined;
}

export function fieldValue(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (obj[key] !== undefined) return obj[key];
  }
  return undefined;
}

/** First alias whose value is present (anything but undefined), so "" is seen, not skipped. */
export function presentField(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (obj[key] !== undefined) return obj[key];
  }
  return undefined;
}

/**
 * SEC-PATH-2b: guard a Zoom path value on the RAW input, before any encoding.
 * Empty, whitespace (anywhere), backslashes, control characters and dot-only
 * values are rejected. "/" stays allowed here because Zoom meeting/webinar
 * UUIDs are base64 and are encoded by the caller.
 */
export function assertZoomRawSegment(value: unknown, field: string): string {
  let text: string;
  if (typeof value === "string") text = value;
  else if (typeof value === "number" && Number.isFinite(value)) text = String(value);
  else throw new Error(`${field} is required`);
  if (text.trim().length === 0) throw new Error(`${field} is required`);
  if (/\s/.test(text)) throw new Error(`${field} must not contain whitespace`);
  if (text.includes("\\")) throw new Error(`${field} must not contain backslashes`);
  if (/[\u0000-\u001f\u007f-\u009f]/u.test(text)) throw new Error(`${field} must not contain control characters`);
  if (/^\.+$/.test(text)) throw new Error(`${field} must not be a dot segment`);
  return text;
}

/**
 * Optional Zoom path value: omitted (undefined) stays undefined so the caller
 * may apply a documented default; any present value ("" included) must pass
 * assertZoomRawSegment.
 */
export function optionalZoomSegment(obj: Record<string, unknown>, field: string, ...aliases: string[]): string | undefined {
  const value = presentField(obj, field, ...aliases);
  return value === undefined ? undefined : assertZoomRawSegment(value, field);
}

export function requireField(obj: Record<string, unknown>, field: string, ...aliases: string[]): string {
  const value = fieldString(obj, field, ...aliases);
  if (!value) throw new Error(`${field} is required`);
  return value;
}

export function queryValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return value.map((item) => String(item)).join(",");
  return undefined;
}
