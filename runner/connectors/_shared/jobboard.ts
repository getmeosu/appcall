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
 * Segments made only of dots ("." / "..") are rejected too, since URL
 * normalization would turn them into path traversal.
 */
export function assertSafePathSegment(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${field} is required`);
  }
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) {
    throw new Error(`${field} may only contain letters, digits, dots, underscores and hyphens`);
  }
  // "." and ".." are dot segments (RFC 3986 section 5.2.4): interpolated as a whole
  // path segment they collapse the path (DELETE /jobs/J1/users/.. -> /jobs/J1/).
  // Reject any segment made only of dots. Percent-encoded forms (%2e%2e, %2f) never
  // reach this point decoded and are already rejected above because "%" is not allowed.
  if (/^\.+$/.test(trimmed)) {
    throw new Error(`${field} must not be a dot segment`);
  }
  return trimmed;
}

/**
 * assertNoTraversalSegment is the permissive sibling of assertSafePathSegment,
 * for provider ids whose documented charset is wider than [A-Za-z0-9._-]:
 * emails ("a+b@x.com"), URNs ("urn:li:sponsoredAccount:1"), base64 ids ("ab+c=="),
 * Atlassian account ids ("557058:f581..."), and so on. It does not narrow the
 * charset and does not trim; it rejects only input that can change the request
 * path once interpolated:
 *   - empty or whitespace-only values;
 *   - dot segments, i.e. any value made only of dots (after trimming);
 *   - the separators "/" and "\";
 *   - C0/C1 control characters.
 * Callers MUST still encodeURIComponent the result (or use encodePathSegment):
 * WHATWG URL parsing treats "%2e%2e" as a dot segment, and encoding turns "%"
 * into "%25" so a pre-encoded value can never decode back into traversal.
 * Finite numbers are accepted and stringified.
 */
export function assertNoTraversalSegment(value: unknown, field: string): string {
  let text: string;
  if (typeof value === "string") text = value;
  else if (typeof value === "number" && Number.isFinite(value)) text = String(value);
  else throw new Error(`${field} is required`);
  const trimmed = text.trim();
  if (trimmed.length === 0) throw new Error(`${field} is required`);
  if (/^\.+$/.test(trimmed)) throw new Error(`${field} must not be a dot segment`);
  if (/[\/\\]/.test(text)) throw new Error(`${field} must not contain path separators`);
  if (/[\u0000-\u001f\u007f-\u009f]/u.test(text)) throw new Error(`${field} must not contain control characters`);
  return text;
}

/** encodePathSegment = encodeURIComponent(assertNoTraversalSegment(value, field)). */
export function encodePathSegment(value: unknown, field: string): string {
  return encodeURIComponent(assertNoTraversalSegment(value, field));
}

/**
 * assertHostLabel validates a tenant subdomain credential (Workable `account`,
 * Zendesk `subdomain`) that is interpolated as the leftmost label of a fixed
 * provider host (`https://{label}.workable.com`). SEC-PATH-2c-2: it must be a
 * single RFC 1123 label, 1-63 characters of [a-z0-9-] with no leading or trailing
 * hyphen, so a stored value cannot add labels (`acme.evil`), empty labels
 * (`.`, `..` -> `https://..zendesk.com`) or percent forms. DNS labels are
 * case-insensitive, so letters are accepted in any case and returned lowercased;
 * surrounding whitespace is trimmed. Failures are INVALID_ACTION_INPUT.
 */
export function assertHostLabel(value: unknown, field: string): string {
  const fail = (detail: string): never => {
    throw { ok: false, code: "INVALID_ACTION_INPUT", message: `${field} ${detail}` };
  };
  if (typeof value !== "string" || value.trim().length === 0) return fail("is required");
  const trimmed = (value as string).trim();
  if (/^\.+$/.test(trimmed)) return fail("must not be a dot segment");
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(trimmed)) {
    return fail("must be a single hostname label (1-63 letters, digits or hyphens, not starting or ending with a hyphen)");
  }
  return trimmed.toLowerCase();
}

/**
 * SEC-SETUP-2: assertVendorLabel accepts the spellings stored connections hold
 * for a `<label>.<suffix>` host field: a leading `https://` (any case), trailing
 * slashes and the full provider host are dropped, then the rest must be one
 * RFC 1123 label (assertHostLabel). Any other scheme, path or label rejects.
 */
export function assertVendorLabel(value: unknown, field: string, suffix: string): string {
  const escaped = suffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const text = typeof value === "string"
    ? value.trim().replace(/^https:\/\//i, "").replace(/\/+$/, "").replace(new RegExp(`\\.${escaped}$`, "i"), "")
    : value;
  return assertHostLabel(text, field);
}

/**
 * isUnsafePathSegment reports whether a caller id would change the request path
 * once interpolated, even after one round of percent-decoding: missing, blank or
 * whitespace-only, dot-only (".", ".."), a percent-encoded dot or blank form
 * ("%2e", "%2E%2e", ".%2e", "%20"), a path separator or a control character.
 * Connectors with their own error shape (SEC-PATH-2c-2 upload handlers) call it
 * and raise their usual INVALID_ACTION_INPUT; callers still encodeURIComponent.
 */
export function isUnsafePathSegment(value: unknown): boolean {
  if (typeof value !== "string") return true;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    /* malformed escapes stay raw and are encoded by the caller */
  }
  for (const text of [value, decoded]) {
    const trimmed = text.trim();
    if (trimmed.length === 0 || /^\.+$/.test(trimmed)) return true;
    if (/[\/\\]/.test(text) || /[\u0000-\u001f\u007f-\u009f]/u.test(text)) return true;
  }
  return false;
}
