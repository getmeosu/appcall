import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

// Shared GraphQL transport for G11+ typed ops (Option C hybrid). Not an op itself.

export type GraphqlError = {
  ok: false;
  error: {
    code: "CONNECTOR_UPSTREAM_ERROR" | "CONNECTOR_RATE_LIMITED" | "CONNECTOR_CAPABILITY_MISSING";
    message: string;
    retryAfterSeconds?: number;
  } & Partial<CapabilityMissingFields>;
};

/** meta-ads-g3 precedent (src/g3.ts handleError): per-op scope missing → re-consent on first use. */
export type CapabilityMissingFields = {
  status: number;
  reason: "permission_missing";
  missingScopes: string[];
  requiredScopes: string[];
  reconsentRequired: true;
  providerCode: unknown;
  providerSubcode: unknown;
  providerError: unknown;
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
      opts: GqlRequestOptions = {},
    ): Promise<GraphqlResult | { ok: true; data: Record<string, unknown>; notFound: true }> {
      return gqlRequest(client, document, variables, opts);
    },
  };
}

export type GqlRequestOptions = {
  allowNotFound?: boolean;
  /**
   * FIX-G12C: per-op OAuth scopes (manifest requiredScopes; never added to auth.scopes).
   * When set, INSUFFICIENT_SCOPES or a 403/404 whose X-Accepted-OAuth-Scopes are not all in
   * X-OAuth-Scopes maps to CONNECTOR_CAPABILITY_MISSING (reason permission_missing).
   */
  requiredScopes?: readonly string[];
  /** Op id used in the CAPABILITY_MISSING message. */
  operation?: string;
};

export async function gqlRequest(
  client: GitHubClient,
  document: string,
  variables: Record<string, unknown> = {},
  opts: GqlRequestOptions = {},
): Promise<GraphqlResult | { ok: true; data: Record<string, unknown>; notFound: true }> {
  const response = await client.graphql(document, variables);
  const headers = lowerHeaders(response.headers);

  const rate = rateLimitFromResponse(response.status, headers);
  if (rate) return rate;

  if (response.status === 401) {
    return upstream("GitHub authentication failed.");
  }

  const bodyErrors =
    isRecord(response.body) && Array.isArray(response.body.errors) ? response.body.errors.filter(isRecord) : [];
  if (bodyErrors.some((error) => error.type === "RATE_LIMITED")) {
    return rateLimited(headers);
  }

  const capability = capabilityMissing(response.status, headers, response.body, bodyErrors, opts);
  if (capability) return capability;

  if (!isRecord(response.body)) {
    return upstream("GitHub rejected the GraphQL request.");
  }

  const errors = bodyErrors;
  const insufficient = errors.find((error) => error.type === "INSUFFICIENT_SCOPES");
  if (insufficient) {
    return upstream(
      typeof insufficient.message === "string" && insufficient.message.trim().length > 0
        ? insufficient.message
        : "GitHub token is missing required OAuth scopes.",
    );
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

/** Scopes named in a comma-separated GitHub scope header; null when the header is absent. */
export function parseScopeHeader(value: string | undefined): string[] | null {
  if (value === undefined) return null;
  return value
    .split(",")
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);
}

/** missing = X-Accepted-OAuth-Scopes − X-OAuth-Scopes; null when either header is absent. */
export function missingScopesFromHeaders(headers: Record<string, string>): string[] | null {
  const lowered = lowerHeaders(headers);
  const accepted = parseScopeHeader(lowered["x-accepted-oauth-scopes"]);
  const granted = parseScopeHeader(lowered["x-oauth-scopes"]);
  if (accepted === null || granted === null) return null;
  const have = new Set(granted);
  return accepted.filter((scope) => !have.has(scope));
}

function capabilityMissing(
  status: number,
  headers: Record<string, string>,
  body: unknown,
  errors: Record<string, unknown>[],
  opts: GqlRequestOptions,
): GraphqlError | null {
  const scopes = [...(opts.requiredScopes ?? [])];
  if (scopes.length === 0) return null;
  const insufficient = errors.find((error) => error.type === "INSUFFICIENT_SCOPES");
  const headerMissing = status === 403 || status === 404 ? missingScopesFromHeaders(headers) : null;
  const headerSignal = headerMissing !== null && headerMissing.length > 0;
  if (!insufficient && !headerSignal) return null;
  const missing = headerSignal ? headerMissing! : scopes;
  const label = opts.operation ?? "operation";
  return {
    ok: false,
    error: {
      code: "CONNECTOR_CAPABILITY_MISSING",
      message: `GitHub ${label} is missing permission ${missing.join(", ")}. Reconnect GitHub to re-consent with ${missing.join(", ")} (not part of the default connect scopes).`,
      status,
      reason: "permission_missing",
      missingScopes: missing,
      requiredScopes: scopes,
      reconsentRequired: true,
      providerCode: insufficient ? "INSUFFICIENT_SCOPES" : null,
      providerSubcode: null,
      providerError: insufficient ? errors : isRecord(body) ? body : null,
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
