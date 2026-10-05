import { createConnectorHttpClient, type ConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

/** Google Ads REST API version. Tip bumped v19→v25 (GAQL campaign dates use start_date_time/end_date_time since v23). */
export const GOOGLE_ADS_API_VERSION = "v25";
export const GOOGLE_ADS_BASE_URL = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;

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

function looksLikeMissingEuPoliticalAdvertising(body: unknown, message: string): boolean {
  const hay = `${message}\n${JSON.stringify(body ?? "")}`.toLowerCase();
  return (
    hay.includes("contains_eu_political_advertising") ||
    hay.includes("eu_political_advertising") ||
    hay.includes("missing_eu_political_advertising")
  );
}

export function parseGoogleAdsError(body: unknown): ConnectorError | null {
  if (!isRecord(body)) return null;
  const error = body.error;
  if (!isRecord(error)) return null;
  const status = typeof error.status === "number" ? error.status : 0;
  let message = typeof error.message === "string" ? error.message : "Google Ads API error";
  const code = typeof error.code === "number" ? error.code : status;

  if (status === 429 || code === 429) {
    return { code: "CONNECTOR_RATE_LIMITED", message, retryAfterSeconds: 0 };
  }
  if (looksLikeMissingEuPoliticalAdvertising(body, message)) {
    message =
      "Google Ads requires containsEuPoliticalAdvertising on campaign create " +
      "(CONTAINS_EU_POLITICAL_ADVERTISING or DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING). " +
      "The connector never defaults this advertiser declaration. Upstream: " +
      message;
  }
  return { code: "CONNECTOR_UPSTREAM_ERROR", message, providerError: `${code}` };
}

export function parseNextPageToken(response: unknown): string | null {
  if (!isRecord(response)) return null;
  const token = response.nextPageToken;
  return typeof token === "string" && token.length > 0 ? token : null;
}

/** Strip hyphens/spaces from a Google Ads customer ID. */
export function sanitizeCustomerId(customerId: string): string {
  return customerId.replace(/[-\s]/g, "");
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
    start_date_time?: string;
    end_date_time?: string;
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

export type GoogleAdsKeywordRow = {
  ad_group_criterion: {
    resource_name: string;
    criterion_id: string;
    status: string;
    type?: string;
    ad_group?: string;
    keyword?: {
      text?: string;
      match_type?: string;
    };
    cpc_bid_micros?: string;
    negative?: boolean;
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

export type GoogleAdsBudgetRow = {
  campaign_budget: {
    resource_name: string;
    id: string;
    name?: string;
    amount_micros?: string;
    status?: string;
    delivery_method?: string;
    period?: string;
    explicitly_shared?: boolean;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type GoogleAdsCustomerClientRow = {
  customer_client: {
    resource_name: string;
    client_customer?: string;
    id?: string;
    descriptive_name?: string;
    status?: string;
    manager?: boolean;
    level?: string;
    currency_code?: string;
    time_zone?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type GoogleAdsUserListRow = {
  user_list: {
    resource_name: string;
    id: string;
    name?: string;
    description?: string;
    membership_status?: string;
    size_for_display?: string;
    size_for_search?: string;
    type?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type GoogleAdsConversionActionRow = {
  conversion_action: {
    resource_name: string;
    id: string;
    name?: string;
    status?: string;
    type?: string;
    category?: string;
    primary_for_goal?: boolean;
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

export type GoogleAdsMutateResponse = {
  results?: Array<{ resourceName?: string; resource_name?: string; [key: string]: unknown }>;
  partialFailureError?: unknown;
  [key: string]: unknown;
};

export type GoogleAdsAccessibleCustomersResponse = {
  resourceNames?: string[];
  resource_names?: string[];
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

export type GoogleAdsHttpResult = {
  status: number;
  headers: Record<string, string>;
  body: unknown;
};

export function createGoogleAdsClient(options: GoogleAdsClientOptions) {
  const operation = options.operation ?? "campaigns.list";
  const httpClient = options.httpClient ?? createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts as string[],
    maxResponseBytes: (manifest.operations as Record<string, { maxResponseBytes?: number }>)[operation]?.maxResponseBytes ?? 5242880,
    fetch: options.fetch,
  });

  return {
    async fetchJSON(path: string, init: RequestInit = {}): Promise<GoogleAdsHttpResult> {
      const url = path.startsWith("http") ? path : `${GOOGLE_ADS_BASE_URL}${path}`;
      const response = await httpClient.fetchText(url, {
        ...init,
        headers: {
          ...buildGoogleAdsHeaders(options),
          ...(init.headers as Record<string, string> | undefined),
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
    headers["login-customer-id"] = sanitizeCustomerId(options.loginCustomerId);
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
