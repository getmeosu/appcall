import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

const RESTLI_PROTOCOL_VERSION = "2.0.0";

export type LinkedInAdsRateLimitResult =
  | { limited: true; retryAfterSeconds: number }
  | { limited: false };

export function parseLinkedInAdsRateLimit(status: number, headers: Record<string, string>): LinkedInAdsRateLimitResult {
  if (status === 429) {
    const retryAfter = Number(headers["x-ratelimit-reset"] ?? headers["retry-after"] ?? headers["Retry-After"] ?? "0");
    if (retryAfter > 0 && Number.isFinite(retryAfter)) {
      return { limited: true, retryAfterSeconds: retryAfter };
    }
    return { limited: true, retryAfterSeconds: 30 };
  }
  return { limited: false };
}

export function parsePagingLinks(response: unknown): { nextStart: number | null; count: number } {
  if (!isRecord(response)) return { nextStart: null, count: 0 };
  const paging = response.paging;
  if (!isRecord(paging)) return { nextStart: null, count: 0 };
  const count = typeof paging.count === "number" ? paging.count : 0;
  const links = paging.links;
  if (!Array.isArray(links) || links.length === 0) return { nextStart: null, count };
  const nextLink = links.find((l: any) => isRecord(l) && l.rel === "next");
  if (!nextLink || !isRecord(nextLink)) return { nextStart: null, count };
  const uri = nextLink.uri;
  if (typeof uri !== "string") return { nextStart: null, count };
  const match = uri.match(/start=(\d+)/);
  if (!match) return { nextStart: null, count };
  return { nextStart: Number(match[1]), count };
}

export type LinkedInAdsClientOptions = {
  accessToken: string;
  fetch?: typeof fetch;
  operation?: string;
};

export function createLinkedInAdsClient(options: LinkedInAdsClientOptions) {
  const operation = options.operation ?? "campaigns.list";
  const maxResponseBytes = (manifest.operations as Record<string, { maxResponseBytes?: number }>)[operation]?.maxResponseBytes ?? 5242880;
  const httpClient = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts as string[],
    maxResponseBytes,
    fetch: options.fetch,
  });

  return {
    async fetchJSON(path: string, init: RequestInit = {}): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
      const url = path.startsWith("http") ? path : `https://api.linkedin.com${path}`;
      const response = await httpClient.fetchText(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${options.accessToken}`,
          "X-Restli-Protocol-Version": RESTLI_PROTOCOL_VERSION,
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

export type LinkedInAdsClient = ReturnType<typeof createLinkedInAdsClient>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
