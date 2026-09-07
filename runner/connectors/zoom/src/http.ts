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
      const response = await httpClient.fetchText(`https://api.zoom.us${path}`, {
        ...init, headers: { "Authorization": `Bearer ${options.accessToken}`, "Content-Type": "application/json", ...(init.headers as Record<string, string>) },
      });
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
