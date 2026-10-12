import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

export const ICLOUD_BASE_URL = "https://caldav.icloud.com";

export function parseCalDAVRateLimit(status: number, headers: Record<string, string>): { limited: boolean; retryAfterSeconds: number } {
  if (status === 429) {
    const retryAfter = Number(headers["retry-after"] ?? "10");
    return { limited: true, retryAfterSeconds: retryAfter > 0 ? retryAfter : 10 };
  }
  return { limited: false, retryAfterSeconds: 0 };
}

export type CalDAVCredentials = {
  username: string;
  password: string;
  baseUrl?: string;
};

export type CalDAVClientOptions = CalDAVCredentials & {
  fetch?: typeof fetch;
  operation?: string;
};

/** Build HTTP Basic auth header value from username:password */
export function buildBasicAuth(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  const encoded = btoa(binary);
  return `Basic ${encoded}`;
}

/** Resolve the base URL: user-supplied or iCloud default */
export function resolveBaseUrl(baseUrl?: string): string {
  if (baseUrl && baseUrl.trim().length > 0) {
    return baseUrl.replace(/\/$/, "");
  }
  return ICLOUD_BASE_URL;
}

export type HrefKind = "resource" | "collection";

function invalidHref(field: string, detail: string): never {
  throw { ok: false, code: "INVALID_ACTION_INPUT", message: `${field} ${detail}` };
}

/**
 * iCloud serves each account from a numbered partition host. When (and only when)
 * the configured server is caldav.icloud.com, an https href on exactly
 * pN-caldav.icloud.com (1-3 digits) on the default port 443 counts as the same
 * origin. Hard-coded on purpose: no other host, port or scheme is admitted.
 */
export const ICLOUD_PARTITION_HOST = /^p[0-9]{1,3}-caldav\.icloud\.com$/;

function isICloudPartition(resolved: URL, collection: URL): boolean {
  return collection.protocol === "https:" && collection.hostname === "caldav.icloud.com" && collection.port === ""
    && resolved.protocol === "https:" && resolved.port === "" && ICLOUD_PARTITION_HOST.test(resolved.hostname);
}

/**
 * resolveCollectionHref (SEC-PATH-2c-2, linus's caldav rulings) resolves a
 * caller-supplied DAV href per RFC 3986 against the configured server URL (the
 * baseUrl setup field, iCloud by default). The trust boundary is the origin, not
 * the base path, so an absolute-path href such as "/x" against
 * https://caldav.fastmail.com/dav resolves to https://caldav.fastmail.com/x. It is
 * admitted only when:
 *   - it is https on the configured origin, or on an iCloud partition host
 *     (see ICLOUD_PARTITION_HOST) when the configured server is caldav.icloud.com;
 *   - no segment is a dot segment, raw or percent-encoded in any case
 *     ("." / ".." / "%2e" / "%2E%2e" / ".%2e"), empty ("//" anywhere), blank or
 *     whitespace-only;
 *   - there is no backslash, control character, userinfo, query or fragment;
 *   - a "resource" (event .ics) has a non-empty last segment; a "collection"
 *     (principal, calendar home, calendar) may end in one trailing "/".
 * Anything else is INVALID_ACTION_INPUT before any request. Returns the absolute
 * URL to request.
 */
export function resolveCollectionHref(baseUrl: string | undefined, href: unknown, field: string, kind: HrefKind): string {
  if (typeof href !== "string" || href.trim().length === 0) return invalidHref(field, "is required");
  if (href !== href.trim() || /[\\\u0000-\u001f\u007f-\u009f]/u.test(href)) return invalidHref(field, "must not have surrounding whitespace, backslashes or control characters");
  if (/[?#]/.test(href)) return invalidHref(field, "must not contain a query or fragment");
  const collection = new URL(`${resolveBaseUrl(baseUrl)}/`);
  let resolved: URL;
  try {
    resolved = new URL(href, collection);
  } catch {
    return invalidHref(field, "is not a valid href");
  }
  if (resolved.username || resolved.password) return invalidHref(field, "must not contain userinfo");
  const sameOrigin = resolved.protocol === "https:" && resolved.origin === collection.origin;
  if (!sameOrigin && !isICloudPartition(resolved, collection)) return invalidHref(field, "must be on the configured CalDAV server");
  // Inspect the caller's own path text: WHATWG URL parsing already collapsed
  // "." / ".." / "%2e" segments in `resolved`, which is exactly what must not
  // happen silently.
  const rawPath = /^[a-z][a-z0-9+.-]*:\/\/[^/]*/i.test(href) ? href.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, "") : href;
  const segments = rawPath.split("/").slice(rawPath.startsWith("/") ? 1 : 0);
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;
    let decoded = segment;
    try { decoded = decodeURIComponent(segment); } catch { /* keep raw */ }
    if (/^(?:\.|%2e)+$/i.test(segment) || /^\.+$/.test(decoded)) return invalidHref(field, "must not contain dot segments");
    const last = i === segments.length - 1;
    if (segment.length === 0) {
      if (last && kind === "collection" && i > 0) continue;
      return invalidHref(field, last ? "must not end with an empty segment" : "must not contain empty segments");
    }
    if (decoded.trim().length === 0) return invalidHref(field, "must not contain blank segments");
  }
  return resolved.href;
}

export function createCalDAVClient(options: CalDAVClientOptions) {
  const operation = options.operation ?? "calendars.list";
  const operationSpec = (manifest.operations as Record<string, { maxResponseBytes?: number; timeoutMs?: number }>)[operation];
  const maxResponseBytes = operationSpec?.maxResponseBytes ?? 5242880;
  const base = resolveBaseUrl(options.baseUrl);
  const baseURL = new URL(base);
  if(baseURL.protocol !== "https:" || baseURL.username || baseURL.password || (baseURL.port && baseURL.port !== "443")) throw new Error("CalDAV requires an HTTPS URL on port 443 without embedded credentials.");
  const baseHostname = baseURL.hostname.toLowerCase();

  // Validate hostname is allowlisted
  const allowedHosts = manifest.network.allowedHosts as string[];
  if (!allowedHosts.includes(baseHostname)) {
    throw new Error(`CalDAV host "${baseHostname}" is not in the connector's allowedHosts list. Add it to the manifest to allow generic servers.`);
  }

  const httpClient = createConnectorHttpClient({
    allowedHosts,
    maxResponseBytes,
    timeoutMs: operationSpec?.timeoutMs,
    fetch: options.fetch,
  });
  const authHeader = buildBasicAuth(options.username, options.password);

  return {
    base,
    /** Make a raw DAV request, returning {status, headers, body} */
    async request(path: string, method: string, extraHeaders: Record<string, string> = {}, body?: string): Promise<{ status: number; headers: Record<string, string>; body: string }> {
      const url = path.startsWith("http") ? path : `${base}${path}`;
      const destination = new URL(url);
      if (destination.protocol !== "https:" || destination.username || destination.password || (destination.port && destination.port !== "443")) throw new Error("CalDAV requires an HTTPS URL on port 443 without embedded credentials.");
      const headers: Record<string, string> = {
        Authorization: authHeader,
        ...extraHeaders,
      };
      const init: RequestInit = { method, headers };
      if (body !== undefined) {
        init.body = body;
      }
      const response = await httpClient.fetchText(url, init);
      return response;
    },

    /** PROPFIND helper */
    async propfind(path: string, depth: "0" | "1", body: string): Promise<{ status: number; headers: Record<string, string>; body: string }> {
      return this.request(path, "PROPFIND", {
        "Content-Type": "application/xml; charset=utf-8",
        "Depth": depth,
      }, body);
    },

    /** REPORT helper */
    async report(path: string, depth: "0" | "1", body: string): Promise<{ status: number; headers: Record<string, string>; body: string }> {
      return this.request(path, "REPORT", {
        "Content-Type": "application/xml; charset=utf-8",
        "Depth": depth,
      }, body);
    },

    /** GET helper */
    async get(path: string): Promise<{ status: number; headers: Record<string, string>; body: string }> {
      return this.request(path, "GET", {
        Accept: "text/calendar, application/xml",
      });
    },

    /** PUT helper for create (If-None-Match: *) */
    async putCreate(path: string, calendarData: string): Promise<{ status: number; headers: Record<string, string>; body: string }> {
      return this.request(path, "PUT", {
        "Content-Type": "text/calendar; charset=utf-8",
        "If-None-Match": "*",
      }, calendarData);
    },

    /** PUT helper for update (If-Match: etag) */
    async putUpdate(path: string, etag: string, calendarData: string): Promise<{ status: number; headers: Record<string, string>; body: string }> {
      return this.request(path, "PUT", {
        "Content-Type": "text/calendar; charset=utf-8",
        "If-Match": etag,
      }, calendarData);
    },

    /** DELETE helper */
    async delete(path: string, etag?: string): Promise<{ status: number; headers: Record<string, string>; body: string }> {
      const headers: Record<string, string> = {};
      if (etag) headers["If-Match"] = etag;
      return this.request(path, "DELETE", headers);
    },
  };
}

export type CalDAVClient = ReturnType<typeof createCalDAVClient>;

export function prop(obj: Record<string, unknown>, field: string, fallback: string = ""): string {
  const v = obj[field];
  return typeof v === "string" ? v : fallback;
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
