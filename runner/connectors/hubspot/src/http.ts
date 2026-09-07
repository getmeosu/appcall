import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

export type HubSpotRateLimitResult =
  | { limited: true; retryAfterSeconds: number }
  | { limited: false };

export function parseHubSpotRateLimit(status: number, headers: Record<string, string>): HubSpotRateLimitResult {
  if (status === 429) {
    const retryAfter = Number(headers["retry-after"] ?? headers["Retry-After"] ?? "0");
    if (retryAfter > 0 && Number.isFinite(retryAfter)) {
      return { limited: true, retryAfterSeconds: retryAfter };
    }
    return { limited: true, retryAfterSeconds: 10 };
  }
  if (status === 403) {
    const remaining = Number(headers["x-ratelimit-remaining"] ?? headers["X-RateLimit-Remaining"] ?? "1");
    if (remaining === 0) {
      const reset = Number(headers["x-ratelimit-reset"] ?? headers["X-RateLimit-Reset"] ?? "0");
      const now = Math.floor(Date.now() / 1000);
      const retryAfter = Math.max(0, reset - now);
      return { limited: true, retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 10 };
    }
  }
  return { limited: false };
}

export function parseNextPageCursor(response: unknown): string | null {
  if (!isRecord(response)) return null;
  const paging = response.paging;
  if (!isRecord(paging)) return null;
  const next = paging.next;
  if (!isRecord(next)) return null;
  const after = next.after;
  return typeof after === "string" && after.length > 0 ? after : null;
}

export type HubSpotCrmObject = {
  id: string;
  properties: Record<string, string | null>;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  url?: string;
  associations?: Record<string, { results: Array<{ id: string }> }>;
  [key: string]: unknown;
};

export type HubSpotListResponse = {
  results: HubSpotCrmObject[];
  paging?: { next?: { after: string } };
};

export type HubSpotClientOptions = {
  accessToken: string;
  fetch?: typeof fetch;
  operation?: string;
};

export function createHubSpotClient(options: HubSpotClientOptions) {
  const operation = options.operation ?? "contacts.list";
  const maxResponseBytes = (manifest.operations as Record<string, { maxResponseBytes?: number }>)[operation]?.maxResponseBytes ?? 5242880;
  const httpClient = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts as string[],
    maxResponseBytes,
    fetch: options.fetch,
  });

  return {
    async fetchJSON(path: string, init: RequestInit = {}): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
      const response = await httpClient.fetchText(`https://api.hubapi.com${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${options.accessToken}`,
          "Content-Type": "application/json",
          ...(init.headers as Record<string, string>),
        },
      });
      let body: unknown;
      try { body = JSON.parse(response.body); } catch { body = response.body; }
      return { status: response.status, headers: response.headers, body };
    },
  };
}

export type HubSpotClient = ReturnType<typeof createHubSpotClient>;

export function prop(obj: HubSpotCrmObject, key: string, fallback: string = ""): string {
  const val = obj.properties?.[key];
  return typeof val === "string" ? val : fallback;
}

export function propNum(obj: HubSpotCrmObject, key: string, fallback: number = 0): number {
  const val = obj.properties?.[key];
  if (typeof val === "string") { const n = Number(val); return Number.isFinite(n) ? n : fallback; }
  return fallback;
}

export function propBool(obj: HubSpotCrmObject, key: string): boolean {
  const val = obj.properties?.[key];
  return val === "true";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
