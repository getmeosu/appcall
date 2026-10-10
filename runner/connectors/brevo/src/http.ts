import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

export function parseBrevoRateLimit(status: number, headers: Record<string, string>): { limited: boolean; retryAfterSeconds: number } {
  if (status === 429) {
    const retryAfter = Number(headers["retry-after"] ?? "10");
    return { limited: true, retryAfterSeconds: retryAfter > 0 ? retryAfter : 10 };
  }
  return { limited: false, retryAfterSeconds: 0 };
}

export type BrevoClientOptions = { apiKey: string; fetch?: typeof fetch; operation?: string };
export type BrevoFetchInit = RequestInit & { query?: Record<string, unknown> };

export function appendQuery(path: string, query?: Record<string, unknown>): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.length === 0) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === undefined || item === null || item === "") continue;
        params.append(key, String(item));
      }
      continue;
    }
    if (typeof value === "boolean") {
      params.set(key, value ? "true" : "false");
      continue;
    }
    params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `${path}?${encoded}` : path;
}

export function createBrevoClient(options: BrevoClientOptions) {
  const operation = options.operation ?? "contacts.list";
  const declared = (manifest.operations as Record<string, { maxResponseBytes?: number; timeoutMs?: number }>)[operation];
  const maxResponseBytes = declared?.maxResponseBytes ?? 5242880;
  const httpClient = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts as string[],
    maxResponseBytes,
    timeoutMs: declared?.timeoutMs,
    fetch: options.fetch,
  });
  return {
    async fetchJSON(path: string, init: BrevoFetchInit = {}): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
      const { query, ...rest } = init;
      const response = await httpClient.fetchText(`https://api.brevo.com/v3${appendQuery(path, query)}`, {
        ...rest, headers: { "api-key": options.apiKey, "Content-Type": "application/json", ...(rest.headers as Record<string, string>) },
      });
      let body: unknown;
      try { body = JSON.parse(response.body); } catch { body = response.body; }
      return { status: response.status, headers: response.headers, body };
    },
  };
}
export type BrevoClient = ReturnType<typeof createBrevoClient>;

// brevoErrorDetail surfaces the provider's actual error so the caller (and the
// dashboard) sees WHY Brevo rejected a request — e.g. "Either of htmlContent or
// textContent is required (missing_parameter)" — instead of a generic message.
// Falls back to the supplied per-operation message when Brevo returns no
// parseable {code,message} body.
export function brevoErrorDetail(body: unknown, fallback: string): string {
  if (isRecord(body)) {
    const message = typeof body.message === "string" ? body.message : "";
    const code = typeof body.code === "string" ? body.code : "";
    if (message && code) return `${message} (${code})`;
    if (message) return message;
    if (code) return code;
  }
  return fallback;
}
export function prop(obj: Record<string, unknown>, field: string, fallback: string = ""): string { const v = obj[field]; return typeof v === "string" ? v : fallback; }
export function propNum(obj: Record<string, unknown>, field: string, fallback: number = 0): number { const v = obj[field]; if (typeof v === "number") return v; if (typeof v === "string") { const n = Number(v); return Number.isFinite(n) ? n : fallback; } return fallback; }
function isRecord(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }
export { isRecord };
