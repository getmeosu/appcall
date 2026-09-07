import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

export type SalesforceRateLimitResult =
  | { limited: true; retryAfterSeconds: number }
  | { limited: false };

const API_VERSION = "v60.0";

export function parseSalesforceRateLimit(status: number, headers: Record<string, string>): SalesforceRateLimitResult {
  if (status === 429) {
    const retryAfter = Number(headers["retry-after"] ?? headers["Retry-After"] ?? "0");
    return { limited: true, retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 30 };
  }
  if (status === 403) {
    const remaining = Number(headers["x-ratelimit-remaining"] ?? headers["X-RateLimit-Remaining"] ?? "1");
    if (remaining === 0) {
      const reset = Number(headers["x-ratelimit-reset"] ?? headers["X-RateLimit-Reset"] ?? "0");
      const now = Math.floor(Date.now() / 1000);
      const retryAfter = Math.max(0, reset - now);
      return { limited: true, retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60 };
    }
  }
  return { limited: false };
}

export function parseNextRecordsUrl(response: unknown): string | null {
  if (!isRecord(response)) return null;
  const nextRecordsUrl = response.nextRecordsUrl;
  return typeof nextRecordsUrl === "string" && nextRecordsUrl.length > 0 ? nextRecordsUrl : null;
}

export function isQueryDone(response: unknown): boolean {
  if (!isRecord(response)) return true;
  return response.done === true;
}

export type SalesforceClientOptions = {
  accessToken: string;
  instanceUrl: string;
  fetch?: typeof fetch;
  operation?: string;
};

export function createSalesforceClient(options: SalesforceClientOptions) {
  const operation = options.operation ?? "contacts.list";
  const maxResponseBytes = (manifest.operations as Record<string, { maxResponseBytes?: number }>)[operation]?.maxResponseBytes ?? 5242880;
  const httpClient = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts as string[],
    maxResponseBytes,
    fetch: options.fetch,
  });

  const baseUrl = options.instanceUrl.replace(/\/+$/, "");

  return {
    get apiVersion() { return API_VERSION; },
    get baseUrl() { return baseUrl; },

    async fetchJSON(path: string, init: RequestInit = {}): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
      const response = await httpClient.fetchText(`${baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${options.accessToken}`,
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

    async soqlQuery(query: string): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
      return this.fetchJSON(`/services/data/${API_VERSION}/query?q=${encodeURIComponent(query)}`);
    },

    async queryNext(nextRecordsUrl: string): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
      return this.fetchJSON(nextRecordsUrl);
    },

    async createRecord(sobject: string, data: Record<string, unknown>): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
      return this.fetchJSON(`/services/data/${API_VERSION}/sobjects/${sobject}`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },

    async getRecord(sobject: string, id: string): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
      return this.fetchJSON(`/services/data/${API_VERSION}/sobjects/${sobject}/${encodeURIComponent(id)}`);
    },

    async updateRecord(sobject: string, id: string, data: Record<string, unknown>): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
      return this.fetchJSON(`/services/data/${API_VERSION}/sobjects/${sobject}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },

    async deleteRecord(sobject: string, id: string): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
      return this.fetchJSON(`/services/data/${API_VERSION}/sobjects/${sobject}/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    },

    async searchJSON(sosl: string): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
      return this.fetchJSON(`/services/data/${API_VERSION}/search?q=${encodeURIComponent(sosl)}`);
    },
  };
}

export type SalesforceClient = ReturnType<typeof createSalesforceClient>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
