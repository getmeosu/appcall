import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

export type GraphRateLimitResult =
  | { limited: true; retryAfterSeconds: number }
  | { limited: false };

export function parseGraphRateLimit(status: number, headers: Record<string, string>): GraphRateLimitResult {
  if (status === 429) {
    const retryAfter = Number(headers["retry-after"] ?? headers["Retry-After"] ?? "0");
    return { limited: true, retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : 0 };
  }
  return { limited: false };
}

export function parseGraphNextLink(response: unknown): string | null {
  if (!isRecord(response)) return null;
  const link = response["@odata.nextLink"];
  return typeof link === "string" && link.length > 0 ? link : null;
}

export type GraphClientOptions = {
  accessToken: string;
  fetch?: typeof fetch;
  operation?: string;
};

export function createGraphClient(options: GraphClientOptions) {
  const operation = options.operation ?? "messages.list";
  const maxResponseBytes = (manifest.operations as Record<string, { maxResponseBytes?: number }>)[operation]?.maxResponseBytes ?? 5242880;
  const httpClient = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts as string[],
    maxResponseBytes,
    fetch: options.fetch,
  });

  return {
    async fetchText(path: string, init: RequestInit = {}): Promise<{ status: number; headers: Record<string, string>; body: string }> {
      const response = await httpClient.fetchText(`https://graph.microsoft.com${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${options.accessToken}`,
          ...(init.headers as Record<string, string>),
        },
      });
      return response;
    },

    async fetchJSON(path: string, init: RequestInit = {}): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
      const response = await httpClient.fetchText(`https://graph.microsoft.com${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${options.accessToken}`,
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

export type GraphClient = ReturnType<typeof createGraphClient>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
