import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

export const RESTLI_PROTOCOL_VERSION = "2.0.0";
/**
 * LinkedIn Marketing API version pinned for every versioned /rest/ call
 * (Marketing September 2026, Active, sunset 2027-09-15). Local to this connector:
 * no cross-connector import, and no caller input can change it.
 */
export const LINKEDIN_VERSION = "202609";
const API_ORIGIN = "https://api.linkedin.com";

/** True when the path or api.linkedin.com URL is on the versioned /rest/ base path. */
export function isVersionedPath(pathOrUrl: string): boolean {
  if (pathOrUrl.startsWith("/")) return pathOrUrl.startsWith("/rest/");
  try {
    const url = new URL(pathOrUrl);
    return url.origin === API_ORIGIN && url.pathname.startsWith("/rest/");
  } catch {
    return false;
  }
}

/**
 * Rest.li headers for one api.linkedin.com call (local copy of the linkedin
 * connector's withRestliHeaders): X-Restli-Protocol-Version 2.0.0 always, and
 * LinkedIn-Version on /rest/ paths only, never on /v2/. Applied last over any
 * caller headers, matched case-insensitively, so a caller can neither drop or
 * change the pin on /rest/ nor leak it onto /v2/.
 */
export function withRestliHeaders(pathOrUrl: string, headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (lower === "linkedin-version" || lower === "x-restli-protocol-version") continue;
    out[key] = value;
  }
  out["X-Restli-Protocol-Version"] = RESTLI_PROTOCOL_VERSION;
  if (isVersionedPath(pathOrUrl)) out["LinkedIn-Version"] = LINKEDIN_VERSION;
  return out;
}

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
      const url = path.startsWith("http") ? path : `${API_ORIGIN}${path}`;
      const merged: Record<string, string> = { Authorization: `Bearer ${options.accessToken}` };
      if (init.body != null && init.body !== "") merged["Content-Type"] = "application/json";
      const extra = init.headers;
      if (extra instanceof Headers) {
        extra.forEach((value, key) => { merged[key] = value; });
      } else if (Array.isArray(extra)) {
        for (const [key, value] of extra) merged[key] = String(value);
      } else if (extra && typeof extra === "object") {
        for (const [key, value] of Object.entries(extra as Record<string, string>)) {
          if (value != null) merged[key] = String(value);
        }
      }
      const headers = withRestliHeaders(url, merged);
      const response = await httpClient.fetchText(url, { ...init, headers });
      let body: unknown;
      try { body = response.body === "" ? null : JSON.parse(response.body); } catch { body = response.body; }
      return { status: response.status, headers: response.headers, body };
    },
  };
}

export type LinkedInAdsClient = ReturnType<typeof createLinkedInAdsClient>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
