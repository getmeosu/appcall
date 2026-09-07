import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

export type TypeFormRateLimitResult =
  | { limited: true; retryAfterSeconds: number }
  | { limited: false };

export function parseTypeFormRateLimit(
  status: number,
  headers: Record<string, string>,
): TypeFormRateLimitResult {
  if (status === 429) {
    const retryAfter =
      Number(headers["retry-after"] ?? headers["Retry-After"] ?? "0");
    if (retryAfter > 0 && Number.isFinite(retryAfter)) {
      return { limited: true, retryAfterSeconds: retryAfter };
    }
    return { limited: true, retryAfterSeconds: 10 };
  }
  return { limited: false };
}

/**
 * Typeform Create API uses page-based pagination.
 * The response includes a `page` field (current page number) and the caller
 * can request the next page via `?page=N+1`.
 * We extract a cursor string from the page count and total items to allow
 * resumption. The cursor is simply the next page number as a string.
 */
export function parseNextPageCursor(response: unknown): string | null {
  if (!isRecord(response)) return null;
  const pageCount = response.page_count;
  if (typeof pageCount !== "number" || pageCount <= 1) return null;

  const currentPage = response.page;
  if (typeof currentPage !== "number") return null;

  if (currentPage < pageCount) {
    return String(currentPage + 1);
  }
  return null;
}

export type TypeFormForm = {
  id: string;
  title: string;
  description?: string | null;
  created_at: string;
  updated_at: string;
  last_response_at?: string | null;
  self?: { href: string };
  _links?: { display: string };
  [key: string]: unknown;
};

export type TypeFormFormsListResponse = {
  items: TypeFormForm[];
  page_count: number;
};

export type TypeFormAnswer = {
  type: string;
  text?: string;
  email?: string;
  url?: string;
  choice?: { label: string };
  choices?: { labels: string[] };
  boolean?: boolean;
  number?: number;
  date?: string;
  file_url?: string;
  phone_number?: string;
  [key: string]: unknown;
};

export type TypeFormResponse = {
  id: string;
  form_id: string;
  submitted_at: string;
  landed_at?: string;
  answers: TypeFormAnswer[];
  metadata?: {
    user_agent?: string;
    referer?: string;
    network_id?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type TypeFormResponsesListResponse = {
  items: TypeFormResponse[];
  page_count: number;
};

export type TypeFormClientOptions = {
  accessToken: string;
  fetch?: typeof fetch;
  operation?: string;
};

export function createTypeFormClient(options: TypeFormClientOptions) {
  const operation = options.operation ?? "forms.list";
  const maxResponseBytes = (
    manifest.operations as Record<string, { maxResponseBytes?: number }>
  )[operation]?.maxResponseBytes ?? 5242880;

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
        `https://api.typeform.com${path}`,
        {
          ...init,
          headers: {
            Authorization: `Bearer ${options.accessToken}`,
            "Content-Type": "application/json",
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

export type TypeFormClient = ReturnType<typeof createTypeFormClient>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
