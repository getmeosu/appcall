import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

export type GitHubRateLimitResult =
  | { limited: true; retryAfterSeconds: number }
  | { limited: false };

export function parseGitHubRateLimit(status: number, headers: Record<string, string>): GitHubRateLimitResult {
  if (status === 403) {
    const remaining = Number(headers["x-ratelimit-remaining"] ?? headers["X-RateLimit-Remaining"] ?? "1");
    if (remaining === 0) {
      const reset = Number(headers["x-ratelimit-reset"] ?? headers["X-RateLimit-Reset"] ?? "0");
      const now = Math.floor(Date.now() / 1000);
      const retryAfter = Math.max(0, reset - now);
      return { limited: true, retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : 60 };
    }
  }
  if (status === 429 || status === 403) {
    const retryAfter = Number(headers["retry-after"] ?? headers["Retry-After"] ?? "0");
    if (retryAfter > 0 && Number.isFinite(retryAfter)) {
      return { limited: true, retryAfterSeconds: retryAfter };
    }
  }
  return { limited: false };
}

export function parseGitHubNextLink(response: unknown): string | null {
  if (!isRecord(response)) return null;
  // GitHub REST API uses Link header for pagination, but we also support
  // a synthetic nextLink field that the sync proxy can inject
  const nextLink = response.nextLink;
  if (typeof nextLink === "string" && nextLink.length > 0) return nextLink;
  // If the response has a page info from sync proxy
  const page = response.page;
  const hasNext = response.hasNextPage;
  if (typeof page === "number" && hasNext === true) {
    return String((page as number) + 1);
  }
  return null;
}

export function parseNextPageFromLinkHeader(linkHeader: string | null | undefined): string | null {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}

export type GitHubClientOptions = {
  accessToken: string;
  fetch?: typeof fetch;
  operation?: string;
};

export function createGitHubClient(options: GitHubClientOptions) {
  const operation = options.operation ?? "issues.list";
  const operationSpec = (manifest.operations as Record<string, { maxResponseBytes?: number; timeoutMs?: number }>)[operation];
  const maxResponseBytes = operationSpec?.maxResponseBytes ?? 5242880;
  const httpClient = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts as string[],
    maxResponseBytes,
    timeoutMs: operationSpec?.timeoutMs,
    fetch: options.fetch,
  });

  return {
    async fetchJSON(path: string, init: RequestInit = {}): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
      const response = await httpClient.fetchText(`https://api.github.com${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${options.accessToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
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

export type GitHubClient = ReturnType<typeof createGitHubClient>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
