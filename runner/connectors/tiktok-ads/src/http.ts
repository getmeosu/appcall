import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

// ---------------------------------------------------------------------------
// TikTok for Business API client factory
// ---------------------------------------------------------------------------

const BASE_URL = "https://business-api.tiktok.com/open_api/v2.0";

export type TikTokRateLimitResult =
  | { limited: true; retryAfterSeconds: number }
  | { limited: false };

export function parseTikTokRateLimit(status: number, headers: Record<string, string>): TikTokRateLimitResult {
  if (status === 429) {
    const retryAfter = Number(headers["retry-after"] ?? headers["Retry-After"] ?? "30");
    return { limited: true, retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 30 };
  }
  return { limited: false };
}

export type TikTokClientOptions = {
  accessToken: string;
  advertiserId: string;
  fetch?: typeof fetch;
  operation?: string;
};

export function createTikTokClient(options: TikTokClientOptions) {
  const operation = options.operation ?? "campaigns.list";
  const maxResponseBytes = (manifest.operations as Record<string, { maxResponseBytes?: number }>)[operation]?.maxResponseBytes ?? 5242880;
  const httpClient = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts as string[],
    maxResponseBytes,
    fetch: options.fetch,
  });

  return {
    async fetchJSON(path: string, init: RequestInit = {}): Promise<{
      status: number;
      headers: Record<string, string>;
      body: unknown;
    }> {
      const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
      const response = await httpClient.fetchText(url, {
        ...init,
        headers: {
          "Access-Token": options.accessToken,
          "Content-Type": "application/json",
          ...(init.headers as Record<string, string>),
        },
      });

      let body: unknown;
      try {
        body = JSON.parse(response.body);
      } catch {
        body = response.body;
      }

      return { status: response.status, headers: response.headers, body };
    },
  };
}

export type TikTokClient = ReturnType<typeof createTikTokClient>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function prop(obj: Record<string, unknown>, field: string, fallback: string = ""): string {
  const val = obj[field];
  return typeof val === "string" ? val : fallback;
}

export function propNum(obj: Record<string, unknown>, field: string, fallback: number = 0): number {
  const val = obj[field];
  if (typeof val === "number") return Number.isFinite(val) ? val : fallback;
  if (typeof val === "string") {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
