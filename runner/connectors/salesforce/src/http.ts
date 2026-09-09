import { ConnectorHttpError, createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

export type SalesforceRateLimitResult =
  | { limited: true; retryAfterSeconds: number }
  | { limited: false };

const API_VERSION = "v60.0";

const SALESFORCE_STATIC_HOSTS = new Set([
  "login.salesforce.com",
  "test.salesforce.com",
  "my.salesforce.com",
]);
const SALESFORCE_DOMAIN_LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const SALESFORCE_PRODUCTION_DOMAIN = new RegExp(`^${SALESFORCE_DOMAIN_LABEL}\\.my\\.salesforce\\.com$`);
const SALESFORCE_SANDBOX_DOMAIN = new RegExp(`^${SALESFORCE_DOMAIN_LABEL}\\.sandbox\\.my\\.salesforce\\.com$`);

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
  let validatedBaseUrl: string | undefined;
  const getValidatedBaseUrl = () => {
    validatedBaseUrl ??= validateSalesforceInstanceUrl(options.instanceUrl);
    return validatedBaseUrl;
  };

  return {
    get apiVersion() { return API_VERSION; },
    get baseUrl() { return baseUrl; },

    async fetchJSON(path: string, init: RequestInit = {}): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
      const response = await httpClient.fetchText(`${getValidatedBaseUrl()}${path}`, {
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

/**
 * Salesforce documents My Domain API URLs as
 * <my-domain>.my.salesforce.com and
 * <my-domain>--<sandbox-name>.sandbox.my.salesforce.com. Keep validation
 * narrower than the manifest wildcards so a nested tenant or lookalike host
 * cannot turn the connection URL into an arbitrary Salesforce subdomain.
 */
function validateSalesforceInstanceUrl(instanceUrl: string): string {
  let url: URL;
  try {
    url = new URL(instanceUrl);
  } catch {
    throw new ConnectorHttpError("OUTBOUND_INVALID_URL", "Outbound URL is invalid.");
  }

  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.port
    || url.pathname !== "/"
    || url.search
    || url.hash
  ) {
    throw new ConnectorHttpError("OUTBOUND_INVALID_URL", "Outbound URL is invalid.");
  }

  const hostname = url.hostname.toLowerCase();
  if (
    !SALESFORCE_STATIC_HOSTS.has(hostname)
    && !SALESFORCE_PRODUCTION_DOMAIN.test(hostname)
    && !SALESFORCE_SANDBOX_DOMAIN.test(hostname)
  ) {
    throw new ConnectorHttpError(
      "OUTBOUND_HOST_NOT_ALLOWED",
      "Outbound host is not allowed for this connector.",
    );
  }

  return url.origin;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
