import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

const BASE = "https://www.googleapis.com/calendar/v3";

export function parseGoogleRateLimit(status: number, headers: Record<string, string>): { limited: boolean; retryAfterSeconds: number } {
  if (status === 429) {
    const retryAfter = Number(headers["retry-after"] ?? "10");
    return { limited: true, retryAfterSeconds: retryAfter > 0 ? retryAfter : 10 };
  }
  return { limited: false, retryAfterSeconds: 0 };
}

export type GoogleMeetClientOptions = { accessToken: string; fetch?: typeof fetch; operation?: string };

export function createGoogleMeetClient(options: GoogleMeetClientOptions) {
  const operation = options.operation ?? "meetings.list";
  const maxResponseBytes = (manifest.operations as Record<string, { maxResponseBytes?: number }>)[operation]?.maxResponseBytes ?? 5242880;
  const httpClient = createConnectorHttpClient({ allowedHosts: manifest.network.allowedHosts as string[], maxResponseBytes, fetch: options.fetch });
  return {
    async fetchJSON(path: string, init: RequestInit = {}): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
      const response = await httpClient.fetchText(`${BASE}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${options.accessToken}`, "Content-Type": "application/json", ...(init.headers as Record<string, string>) },
      });
      let body: unknown;
      try { body = JSON.parse(response.body); } catch { body = response.body; }
      return { status: response.status, headers: response.headers, body };
    },
  };
}

export type GoogleMeetClient = ReturnType<typeof createGoogleMeetClient>;

export function googleErrorDetail(body: unknown, fallback: string): string {
  if (isRecord(body) && isRecord(body.error)) {
    const msg = typeof body.error.message === "string" ? body.error.message : "";
    if (msg) return msg;
  }
  return fallback;
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function extractFetch(input: Record<string, unknown>): typeof fetch | undefined {
  return typeof input.fetch === "function" ? (input.fetch as typeof fetch) : undefined;
}
