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

export function createCalDAVClient(options: CalDAVClientOptions) {
  const operation = options.operation ?? "calendars.list";
  const maxResponseBytes = (manifest.operations as Record<string, { maxResponseBytes?: number }>)[operation]?.maxResponseBytes ?? 5242880;
  const base = resolveBaseUrl(options.baseUrl);
  const baseURL = new URL(base);
  if(baseURL.protocol !== "https:" || baseURL.username || baseURL.password || (baseURL.port && baseURL.port !== "443")) throw new Error("CalDAV requires an HTTPS URL on port 443 without embedded credentials.");
  const baseHostname = baseURL.hostname.toLowerCase();

  // Validate hostname is allowlisted
  const allowedHosts = manifest.network.allowedHosts as string[];
  if (!allowedHosts.includes(baseHostname)) {
    throw new Error(`CalDAV host "${baseHostname}" is not in the connector's allowedHosts list. Add it to the manifest to allow generic servers.`);
  }

  const httpClient = createConnectorHttpClient({ allowedHosts, maxResponseBytes, fetch: options.fetch });
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
