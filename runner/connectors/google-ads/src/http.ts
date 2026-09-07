import { createConnectorHttpClient, type ConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

// ---------------------------------------------------------------------------
// Google Ads GAQL raw API shapes
// ---------------------------------------------------------------------------

export type GoogleAdsRateLimitResult =
  | { limited: true; retryAfterSeconds: number }
  | { limited: false };

export type ConnectorErrorCode =
  | "CONNECTOR_RATE_LIMITED"
  | "CONNECTOR_UPSTREAM_ERROR";

export type ConnectorError = {
  code: ConnectorErrorCode;
  message: string;
  retryAfterSeconds?: number;
  providerError?: string;
};

export function parseGoogleAdsRateLimit(response: Response): GoogleAdsRateLimitResult {
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("Retry-After") ?? "0");
    return { limited: true, retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : 0 };
  }
  return { limited: false };
}

export function parseGoogleAdsRateLimitMetadata(status: number, headers: Record<string, string>): GoogleAdsRateLimitResult {
  if (status === 429) {
    const retryAfter = Number(headers["retry-after"] ?? headers["Retry-After"] ?? "0");
    return { limited: true, retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : 0 };
  }
  return { limited: false };
}

export function parseGoogleAdsError(body: unknown): ConnectorError | null {
  if (!isRecord(body)) return null;
  const error = body.error;
  if (!isRecord(error)) return null;
  const status = typeof error.status === "number" ? error.status : 0;
  const message = typeof error.message === "string" ? error.message : "Google Ads API error";
  const code = typeof error.code === "number" ? error.code : status;

  if (status === 429 || code === 429) {
    return { code: "CONNECTOR_RATE_LIMITED", message, retryAfterSeconds: 0 };
  }
  return { code: "CONNECTOR_UPSTREAM_ERROR", message, providerError: `${code}` };
}

export function parseNextPageToken(response: unknown): string | null {
  if (!isRecord(response)) return null;
  const token = response.nextPageToken;
  return typeof token === "string" && token.length > 0 ? token : null;
}

// ---------------------------------------------------------------------------
// Raw GAQL row shapes — Google Ads returns `results[].<resource>` nested objects.
// ---------------------------------------------------------------------------

export type GoogleAdsCampaignRow = {
  campaign: {
    resource_name: string;
    id: string;
    name: string;
    status: string;
    budget?: {
      amount_micros?: string;
    };
    bidding_strategy?: string;
    start_date?: string;
    end_date?: string;
    [key: string]: unknown;
  };
  metrics?: {
    impressions?: string;
    clicks?: string;
    cost_micros?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type GoogleAdsAdGroupRow = {
  ad_group: {
    resource_name: string;
    id: string;
    name: string;
    status: string;
    type: string;
    campaign: string;
    cpc_bid_micros?: string;
    [key: string]: unknown;
  };
  metrics?: {
    impressions?: string;
    clicks?: string;
    cost_micros?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type GoogleAdsAdRow = {
  ad: {
    resource_name: string;
    id: string;
    name?: string;
    status: string;
    type: string;
    ad_group: string;
    headline?: string;
    description?: string;
    final_urls?: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type GoogleAdsSearchResponse = {
  results: unknown[];
  nextPageToken?: string;
  totalResultsCount?: string;
  fieldMask?: string;
  [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

export type GoogleAdsClientOptions = {
  accessToken: string;
  developerToken: string;
  loginCustomerId?: string;
  fetch?: typeof fetch;
  httpClient?: ConnectorHttpClient;
  operation?: string;
};

export function createGoogleAdsClient(options: GoogleAdsClientOptions): ConnectorHttpClient {
  const operation = options.operation ?? "campaigns.list";
  return options.httpClient ?? createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts as string[],
    maxResponseBytes: (manifest.operations as Record<string, { maxResponseBytes?: number }>)[operation]?.maxResponseBytes ?? 5242880,
    fetch: options.fetch,
  });
}

/**
 * Build the headers required for every Google Ads API call.
 */
export function buildGoogleAdsHeaders(options: GoogleAdsClientOptions): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.accessToken}`,
    "developer-token": options.developerToken,
    "Content-Type": "application/json",
  };
  if (options.loginCustomerId) {
    headers["login-customer-id"] = options.loginCustomerId;
  }
  return headers;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function prop(obj: Record<string, unknown>, key: string, fallback: string = ""): string {
  const val = obj[key];
  return typeof val === "string" ? val : fallback;
}

export function propNum(obj: Record<string, unknown>, key: string, fallback: number = 0): number {
  const val = obj[key];
  if (typeof val === "number") return Number.isFinite(val) ? val : fallback;
  if (typeof val === "string") { const n = Number(val); return Number.isFinite(n) ? n : fallback; }
  return fallback;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
