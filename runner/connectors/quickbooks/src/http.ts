import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

export type QuickBooksRateLimitResult =
  | { limited: true; retryAfterSeconds: number }
  | { limited: false };

export function parseQuickBooksRateLimit(status: number, headers: Record<string, string>): QuickBooksRateLimitResult {
  if (status === 429) {
    const remaining = Number(headers["rate-limit-remaining"] ?? headers["Rate-Limit-Remaining"] ?? "0");
    // QuickBooks returns 429 when remaining is 0
    const retryAfter = remaining === 0 ? 30 : 0;
    return { limited: true, retryAfterSeconds: retryAfter };
  }
  return { limited: false };
}

export type QuickBooksClientOptions = {
  accessToken: string;
  realmId: string;
  fetch?: typeof fetch;
  operation?: string;
};

export function createQuickBooksClient(options: QuickBooksClientOptions) {
  const operation = options.operation ?? "invoices.list";
  const maxResponseBytes = (manifest.operations as Record<string, { maxResponseBytes?: number }>)[operation]?.maxResponseBytes ?? 5242880;
  const httpClient = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts as string[],
    maxResponseBytes,
    fetch: options.fetch,
  });

  const baseUrl = `https://quickbooks.api.intuit.com/v3/company/${options.realmId}`;

  return {
    get baseUrl() { return baseUrl; },

    async fetchJSON(path: string, init: RequestInit = {}): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
      const response = await httpClient.fetchText(`${baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${options.accessToken}`,
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

export type QuickBooksClient = ReturnType<typeof createQuickBooksClient>;

// --- Helpers for extracting values from QuickBooks nested objects ---

export function prop(record: unknown, field: string): string {
  if (typeof record !== "object" || record === null || Array.isArray(record)) return "";
  const value = (record as Record<string, unknown>)[field];
  return typeof value === "string" ? value : "";
}

export function propNum(record: unknown, field: string): number {
  if (typeof record !== "object" || record === null || Array.isArray(record)) return 0;
  const value = (record as Record<string, unknown>)[field];
  return typeof value === "number" ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
