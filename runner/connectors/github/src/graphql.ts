import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

// Shared GraphQL transport for G11+ typed ops (Option C hybrid). Not an op itself.

export type GraphqlError = {
  ok: false;
  error: {
    code: "CONNECTOR_UPSTREAM_ERROR" | "CONNECTOR_RATE_LIMITED";
    message: string;
    retryAfterSeconds?: number;
  };
};

export type GraphqlOk = { ok: true; data: Record<string, unknown> };

export type GraphqlResult = GraphqlOk | GraphqlError;

export type PageInfo = {
  hasNextPage: boolean;
  endCursor: string | null;
  hasPreviousPage: boolean;
  startCursor: string | null;
};

export type ConnectionResult<T> = { items: T[]; pageInfo: PageInfo; totalCount?: number };

export function createGraphqlTransport(options: {
  accessToken: string;
  fetch?: typeof fetch;
  githubClient?: GitHubClient;
  operation: string;
}) {
  const client =
    options.githubClient ??
    createGitHubClient({
      accessToken: options.accessToken,
      fetch: options.fetch,
      operation: options.operation,
    });
  return {
    client,
    async request(
      document: string,
      variables: Record<string, unknown> = {},
      opts: { allowNotFound?: boolean } = {},
    ): Promise<GraphqlResult | { ok: true; data: Record<string, unknown>; notFound: true }> {
      return gqlRequest(client, document, variables, opts);
    },
  };
}

export async function gqlRequest(
  client: GitHubClient,
  document: string,
  variables: Record<string, unknown> = {},
  opts: { allowNotFound?: boolean } = {},
): Promise<GraphqlResult | { ok: true; data: Record<string, unknown>; notFound: true }> {
  const response = await client.graphql(document, variables);
  const headers = lowerHeaders(response.headers);

  const rate = rateLimitFromResponse(response.status, headers);
  if (rate) return rate;

  if (response.status === 401) {
    return upstream("GitHub authentication failed.");
  }

  if (!isRecord(response.body)) {
    return upstream("GitHub rejected the GraphQL request.");
  }

  const errors = Array.isArray(response.body.errors) ? response.body.errors.filter(isRecord) : [];
  if (errors.some((error) => error.type === "RATE_LIMITED")) {
    return rateLimited(headers);
  }

  const insufficient = errors.find((error) => error.type === "INSUFFICIENT_SCOPES");
  if (insufficient) {
    const message =
      typeof insufficient.message === "string" && insufficient.message.trim().length > 0
        ? insufficient.message
        : "GitHub token is missing required OAuth scopes.";
    return upstream(message);
  }

  const data = isRecord(response.body.data) ? response.body.data : null;
  const allNotFound = errors.length > 0 && errors.every((error) => error.type === "NOT_FOUND");
  if (opts.allowNotFound && allNotFound) {
    return { ok: true as const, data: data ?? {}, notFound: true as const };
  }

  if (response.status !== 200 || !data || (errors.length > 0 && !allNotFound)) {
    if (allNotFound && opts.allowNotFound) {
      return { ok: true as const, data: data ?? {}, notFound: true as const };
    }
    if (allNotFound) {
      return upstream(
        typeof errors[0]?.message === "string" ? errors[0].message : "GitHub resource was not found.",
      );
    }
    const message =
      errors.length > 0 && typeof errors[0].message === "string"
        ? errors[0].message
        : response.status === 502 || response.status === 504
          ? "GitHub GraphQL request timed out or hit resource limits."
          : "GitHub rejected the GraphQL request.";
    return upstream(message);
  }

  // Benign NOT_FOUND with partial data: treat as success with data (caller checks nulls).
  return { ok: true as const, data };
}

export function connection<T>(
  conn: unknown,
  mapNode: (node: Record<string, unknown>) => T,
): ConnectionResult<T> {
  if (!isRecord(conn)) {
    return {
      items: [],
      pageInfo: { hasNextPage: false, endCursor: null, hasPreviousPage: false, startCursor: null },
    };
  }
  const nodes = Array.isArray(conn.nodes) ? conn.nodes.filter(isRecord).map(mapNode) : [];
  const pageInfoRaw = isRecord(conn.pageInfo) ? conn.pageInfo : {};
  return {
    items: nodes,
    pageInfo: {
      hasNextPage: pageInfoRaw.hasNextPage === true,
      endCursor: typeof pageInfoRaw.endCursor === "string" ? pageInfoRaw.endCursor : null,
      hasPreviousPage: pageInfoRaw.hasPreviousPage === true,
      startCursor: typeof pageInfoRaw.startCursor === "string" ? pageInfoRaw.startCursor : null,
    },
    ...(typeof conn.totalCount === "number" ? { totalCount: conn.totalCount } : {}),
  };
}

export function recordAt(value: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const child = value[key];
  return isRecord(child) ? child : null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rateLimitFromResponse(status: number, headers: Record<string, string>): GraphqlError | null {
  const remainingRaw = headers["x-ratelimit-remaining"];
  if (remainingRaw !== undefined && remainingRaw !== "") {
    const remaining = Number(remainingRaw);
    if (remaining === 0) return rateLimited(headers);
  }
  const parsed = parseGitHubRateLimit(status, headers);
  if (parsed.limited) {
    return {
      ok: false,
      error: {
        code: "CONNECTOR_RATE_LIMITED",
        message: "GitHub rate limit exceeded.",
        retryAfterSeconds: parsed.retryAfterSeconds,
      },
    };
  }
  return null;
}

function rateLimited(headers: Record<string, string>): GraphqlError {
  const retryAfterHeader = Number(headers["retry-after"] ?? "0");
  if (retryAfterHeader > 0 && Number.isFinite(retryAfterHeader)) {
    return {
      ok: false,
      error: {
        code: "CONNECTOR_RATE_LIMITED",
        message: "GitHub rate limit exceeded.",
        retryAfterSeconds: retryAfterHeader,
      },
    };
  }
  const reset = Number(headers["x-ratelimit-reset"] ?? "0");
  const now = Math.floor(Date.now() / 1000);
  const retryAfterSeconds =
    reset > 0 && Number.isFinite(reset) ? Math.max(0, reset - now) : 60;
  return {
    ok: false,
    error: {
      code: "CONNECTOR_RATE_LIMITED",
      message: "GitHub rate limit exceeded.",
      retryAfterSeconds,
    },
  };
}

function upstream(message: string): GraphqlError {
  return {
    ok: false,
    error: { code: "CONNECTOR_UPSTREAM_ERROR", message, retryAfterSeconds: undefined },
  };
}

function lowerHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) out[key.toLowerCase()] = value;
  return out;
}
