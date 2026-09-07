import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

export type XeroRateLimitResult =
  | { limited: true; retryAfterSeconds: number }
  | { limited: false };

export function parseXeroRateLimit(status: number, headers: Record<string, string>): XeroRateLimitResult {
  if (status === 429) {
    const retryAfter = Number(headers["retry-after"] ?? headers["Retry-After"] ?? "30");
    return { limited: true, retryAfterSeconds: retryAfter > 0 ? retryAfter : 30 };
  }
  return { limited: false };
}

export type XeroClientOptions = {
  accessToken: string;
  tenantId: string;
  fetch?: typeof fetch;
  operation?: string;
};

export function createXeroClient(options: XeroClientOptions) {
  const operation = options.operation ?? "invoices.list";
  const maxResponseBytes = (manifest.operations as Record<string, { maxResponseBytes?: number }>)[operation]?.maxResponseBytes ?? 5242880;
  const httpClient = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts as string[],
    maxResponseBytes,
    fetch: options.fetch,
  });

  const baseUrl = "https://api.xero.com/api.xro/2.0";

  return {
    get baseUrl() { return baseUrl; },

    async fetchJSON(path: string, init: RequestInit = {}): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
      const response = await httpClient.fetchText(`${baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${options.accessToken}`,
          "Xero-Tenant-Id": options.tenantId,
          "Content-Type": "application/json",
          Accept: "application/json",
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

export type XeroClient = ReturnType<typeof createXeroClient>;
