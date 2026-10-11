import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

export const RESTLI_PROTOCOL_VERSION = "2.0.0";
/** LinkedIn Marketing API version for every versioned /rest/ call (Active, sunset 2027-09-15). Local to this connector. */
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
 * Rest.li headers for one api.linkedin.com call: X-Restli-Protocol-Version 2.0.0 always,
 * Linkedin-Version on /rest/ paths only and never on /v2/. Applied last over any caller headers,
 * so a caller can neither drop the pin on /rest/ nor leak it onto /v2/.
 */
export function withRestliHeaders(pathOrUrl: string, headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (lower === "linkedin-version" || lower === "x-restli-protocol-version") continue;
    out[key] = value;
  }
  out["X-Restli-Protocol-Version"] = RESTLI_PROTOCOL_VERSION;
  if (isVersionedPath(pathOrUrl)) out["Linkedin-Version"] = LINKEDIN_VERSION;
  return out;
}

/** Case-insensitive response header read. */
export function headerValue(headers: Record<string, string>, name: string): string {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return value;
  }
  return "";
}

export type LinkedInRateLimitResult =
  | { limited: true; retryAfterSeconds: number }
  | { limited: false };

export function parseLinkedInRateLimit(status: number, headers: Record<string, string>): LinkedInRateLimitResult {
  if (status === 429) {
    const retryAfter = Number(headers["retry-after"] ?? headers["Retry-After"] ?? "0");
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

export type LinkedInClientOptions = {
  accessToken: string;
  fetch?: typeof fetch;
  operation?: string;
};

export function createLinkedInClient(options: LinkedInClientOptions) {
  const operation = options.operation ?? "profile.get";
  const maxResponseBytes = (manifest.operations as Record<string, { maxResponseBytes?: number }>)[operation]?.maxResponseBytes ?? 5242880;
  const httpClient = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts as string[],
    maxResponseBytes,
    fetch: options.fetch,
  });

  return {
    async fetchJSON(path: string, init: RequestInit = {}): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
      const url = path.startsWith("http") ? path : `${API_ORIGIN}${path}`;
      const response = await httpClient.fetchText(url, {
        ...init,
        headers: withRestliHeaders(url, {
          Authorization: `Bearer ${options.accessToken}`,
          "Content-Type": "application/json",
          ...(init.headers as Record<string, string>),
        }),
      });
      let body: unknown;
      try { body = JSON.parse(response.body); } catch { body = response.body; }
      return { status: response.status, headers: response.headers, body };
    },
  };
}

export type LinkedInClient = ReturnType<typeof createLinkedInClient>;

export function extractField(obj: Record<string, unknown>, field: string): unknown {
  return obj[field] ?? null;
}

export function extractString(obj: Record<string, unknown>, field: string): string {
  const val = obj[field];
  return typeof val === "string" ? val : "";
}

export function extractNumber(obj: Record<string, unknown>, field: string): number {
  const val = obj[field];
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  if (typeof val === "string") { const n = Number(val); return Number.isFinite(n) ? n : 0; }
  return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
