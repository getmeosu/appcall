import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

// ---------------------------------------------------------------------------
// Meta Marketing API raw object types
// ---------------------------------------------------------------------------

export type MetaCampaignObject = {
  id: string;
  name?: string | null;
  status?: string | null;
  objective?: string | null;
  daily_budget?: string | null;
  lifetime_budget?: string | null;
  start_time?: string | null;
  stop_time?: string | null;
  created_time?: string | null;
  updated_time?: string | null;
  effective_status?: string | null;
  [key: string]: unknown;
};

export type MetaAdSetObject = {
  id: string;
  campaign_id?: string | null;
  name?: string | null;
  status?: string | null;
  daily_budget?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  targeting?: Record<string, unknown> | null;
  optimization_goal?: string | null;
  [key: string]: unknown;
};

export type MetaCreativeObject = {
  name?: string | null;
  type?: string | null;
  [key: string]: unknown;
};

export type MetaAdObject = {
  id: string;
  adset_id?: string | null;
  name?: string | null;
  status?: string | null;
  creative?: MetaCreativeObject | null;
  effective_status?: string | null;
  created_time?: string | null;
  updated_time?: string | null;
  [key: string]: unknown;
};

export type MetaAdAccountObject = {
  id: string;
  name?: string | null;
  account_status?: number | null;
  currency?: string | null;
  timezone_name?: string | null;
  business_name?: string | null;
  [key: string]: unknown;
};

export type MetaListResponse<T> = {
  data: T[];
  paging?: {
    cursors?: {
      after?: string;
      before?: string;
    };
    next?: string;
    previous?: string;
  };
};

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

export type MetaClientOptions = {
  accessToken: string;
  fetch?: typeof fetch;
  operation?: string;
};

export function createMetaClient(options: MetaClientOptions) {
  const operation = options.operation ?? "campaigns.list";
  const maxResponseBytes =
    (manifest.operations as Record<string, { maxResponseBytes?: number }>)[operation]?.maxResponseBytes ?? 5242880;
  const httpClient = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts as string[],
    maxResponseBytes,
    fetch: options.fetch,
  });

  return {
    async fetchJSON(
      path: string,
      init: RequestInit = {},
    ): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
      const response = await httpClient.fetchText(
        `https://graph.facebook.com/v19.0${path}`,
        {
          ...init,
          headers: {
            Authorization: `Bearer ${options.accessToken}`,
            ...(init.headers as Record<string, string>),
          },
        },
      );
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

export type MetaClient = ReturnType<typeof createMetaClient>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function prop(obj: Record<string, unknown>, key: string, fallback: string = ""): string {
  const val = obj[key];
  return typeof val === "string" ? val : fallback;
}

export function propNum(obj: Record<string, unknown>, key: string, fallback: number = 0): number {
  const val = obj[key];
  if (typeof val === "number") {
    return Number.isFinite(val) ? val : fallback;
  }
  if (typeof val === "string") {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
