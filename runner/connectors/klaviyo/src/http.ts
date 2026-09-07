import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

const REVISION = "2024-10-15";

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

export type KlaviyoClientOptions = { apiKey: string; fetch?: typeof fetch; operation?: string };

export function createKlaviyoClient(options: KlaviyoClientOptions) {
  const operation = options.operation ?? "contacts.list";
  const maxResponseBytes = (manifest.operations as Record<string, { maxResponseBytes?: number }>)[operation]?.maxResponseBytes ?? 5242880;
  const httpClient = createConnectorHttpClient({ allowedHosts: manifest.network.allowedHosts as string[], maxResponseBytes, fetch: options.fetch });
  return {
    async fetchJSON(path: string, init: RequestInit = {}): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
      const response = await httpClient.fetchText(`https://a.klaviyo.com/api${path}`, {
        ...init, headers: { Authorization: `Klaviyo-API-Key ${options.apiKey}`, revision: REVISION, "Content-Type": "application/json", ...(init.headers as Record<string, string>) },
      });
      let body: unknown;
      try { body = JSON.parse(response.body); } catch { body = response.body; }
      return { status: response.status, headers: response.headers, body };
    },
  };
}
export type KlaviyoClient = ReturnType<typeof createKlaviyoClient>;
export function prop(obj: Record<string, unknown>, field: string, fallback: string = ""): string { const v = obj[field]; return typeof v === "string" ? v : fallback; }
function isRecord(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }
export { isRecord };
