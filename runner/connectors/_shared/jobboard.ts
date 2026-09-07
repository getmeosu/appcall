/**
 * Shared client for the public job-board connectors.
 *
 * Seven connectors (Ashby, Greenhouse, Lever, Recruitee, SmartRecruiters,
 * Workable, Zoho Recruit) read a provider's public postings API through the same
 * shape: build a base URL from tenant input, GET a path, parse JSON. They each
 * carried a near-identical copy of that code which called the global `fetch`
 * directly — no host allowlist, no redirect blocking, no response size bound, no
 * deadline, and no way to inject a fetch for tests.
 *
 * Routing them through createConnectorHttpClient puts every one of those
 * controls back and leaves each connector owning only the part that genuinely
 * differs: its base URL and its auth header.
 */
import {
  type ConnectorHttpClient,
  createConnectorHttpClient,
} from "../../bun/src/http";

export type JobBoardClientOptions = {
  /** Absolute base URL; the tenant-derived part is already interpolated. */
  baseUrl: string;
  /** Manifest allowlist. Wildcard entries ("*.recruitee.com") are supported. */
  allowedHosts: string[];
  maxResponseBytes: number;
  timeoutMs?: number;
  /** Extra request headers, typically Authorization. */
  headers?: Record<string, string>;
  /** Injected for tests; production passes nothing and the real fetch is used. */
  fetch?: typeof fetch;
  /** Provider name used in error messages, e.g. "Ashby". */
  provider: string;
};

export type JobBoardClient = {
  /** getJSON GETs `path` relative to the base URL and parses the JSON body. */
  getJSON(path?: string): Promise<unknown>;
};

/**
 * ConnectorUpstreamError is thrown as a plain structured object rather than an
 * Error subclass because that is what the runner's error mapper reads: an object
 * carrying `code` keeps the provider's failure class (rate limit vs. upstream
 * fault) intact through to the control plane, where an Error would collapse into
 * the generic "invalid input" fallback.
 */
export type ConnectorUpstreamError = {
  ok: false;
  code: "CONNECTOR_RATE_LIMITED" | "CONNECTOR_UPSTREAM_ERROR";
  message: string;
  retryAfterSeconds?: number;
};

const defaultRetryAfterSeconds = 10;

export function upstreamErrorFor(
  provider: string,
  status: number,
  headers: Record<string, string>,
  body: string,
): ConnectorUpstreamError {
  if (status === 429) {
    const raw = Number(headers["retry-after"] ?? "");
    return {
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: `${provider} rate limit exceeded.`,
      retryAfterSeconds: Number.isFinite(raw) && raw > 0 ? raw : defaultRetryAfterSeconds,
    };
  }
  // The body is truncated because it is an untrusted provider response that
  // ends up in an error message and, from there, in logs.
  return {
    ok: false,
    code: "CONNECTOR_UPSTREAM_ERROR",
    message: `${provider} API returned ${status}: ${body.slice(0, 200)}`,
  };
}

export function createJobBoardClient(options: JobBoardClientOptions): JobBoardClient {
  const http: ConnectorHttpClient = createConnectorHttpClient({
    allowedHosts: options.allowedHosts,
    maxResponseBytes: options.maxResponseBytes,
    timeoutMs: options.timeoutMs,
    fetch: options.fetch,
  });

  return {
    async getJSON(path = ""): Promise<unknown> {
      const response = await http.fetchText(`${options.baseUrl}${path}`, {
        method: "GET",
        headers: { Accept: "application/json", ...(options.headers ?? {}) },
      });
      if (response.status < 200 || response.status >= 300) {
        throw upstreamErrorFor(options.provider, response.status, response.headers, response.body);
      }
      try {
        return JSON.parse(response.body);
      } catch {
        throw {
          ok: false,
          code: "CONNECTOR_UPSTREAM_ERROR",
          message: `${options.provider} returned a non-JSON body.`,
        } satisfies ConnectorUpstreamError;
      }
    },
  };
}

/**
 * assertSafePathSegment rejects tenant input that would change the request's
 * host or path structure once interpolated into a URL.
 *
 * Every one of these connectors builds its URL from a customer-supplied board
 * name, site or company. Without this, a value containing "/" or "@" moves the
 * request to a different host entirely — the allowlist catches the common cases,
 * but validating at the source is what makes the URL mean what it looks like.
 */
export function assertSafePathSegment(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${field} is required`);
  }
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) {
    throw new Error(`${field} may only contain letters, digits, dots, underscores and hyphens`);
  }
  return trimmed;
}
