import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

const BASE_URL = "https://books.zoho.com/api/v3";

export type ZohoBooksRateLimitResult =
  | { limited: true; retryAfterSeconds: number }
  | { limited: false };

export function parseZohoBooksRateLimit(status: number, headers: Record<string, string>): ZohoBooksRateLimitResult {
  if (status === 429) {
    const retryAfter = Number(headers["retry-after"] ?? headers["Retry-After"] ?? "30");
    return { limited: true, retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 30 };
  }
  return { limited: false };
}

export type ZohoBooksClientOptions = {
  accessToken: string;
  organizationId?: string;
  fetch?: typeof fetch;
  operation?: string;
};

export function createZohoBooksClient(options: ZohoBooksClientOptions) {
  const operation = options.operation ?? "invoices.list";
  const maxResponseBytes =
    (manifest.operations as Record<string, { maxResponseBytes?: number }>)[operation]?.maxResponseBytes ?? 5242880;
  const httpClient = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts as string[],
    maxResponseBytes,
    fetch: options.fetch,
  });

  function urlFor(path: string, extra?: Record<string, string>): string {
    const url = new URL(`${BASE_URL}${path}`);
    if (options.organizationId) url.searchParams.set("organization_id", options.organizationId);
    if (extra) {
      for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);
    }
    return url.toString();
  }

  return {
    organizationId: options.organizationId,
    async fetchJSON(
      path: string,
      init: RequestInit = {},
      extraQuery?: Record<string, string>,
    ): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
      const response = await httpClient.fetchText(urlFor(path, extraQuery), {
        ...init,
        headers: {
          Authorization: `Zoho-oauthtoken ${options.accessToken}`,
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

export type ZohoBooksClient = ReturnType<typeof createZohoBooksClient>;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function jsonStringBody(payload: Record<string, unknown>): { headers: Record<string, string>; body: string } {
  return {
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({ JSONString: JSON.stringify(payload) }).toString(),
  };
}
