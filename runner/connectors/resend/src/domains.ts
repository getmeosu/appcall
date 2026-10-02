import { createResendClient, parseResendRateLimit, isRecord } from "./http";
import { normalizeDomain, parseDomainsListResponse } from "./objects";

export type DomainsListInput = {
  limit?: number;
  after?: string;
  before?: string;
};

export type DomainsGetInput = { id: string };

function requireOptionalLimit(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("limit must be a number");
  const n = Math.floor(value);
  if (n < 1 || n > 100) throw new Error("limit must be between 1 and 100");
  return n;
}

function optionalCursor(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} must be a non-empty string`);
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

export function validateDomainsListInput(input: unknown): DomainsListInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  const limit = requireOptionalLimit(input.limit);
  const after = optionalCursor(input.after, "after");
  const before = optionalCursor(input.before, "before");
  if (after && before) throw new Error("after and before cannot both be set");
  return { limit, after, before };
}

export function validateDomainsGetInput(input: unknown): DomainsGetInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { id: requireString(input.id, "id") };
}

function buildQuery(payload: DomainsListInput): string {
  const params = new URLSearchParams();
  if (payload.limit !== undefined) params.set("limit", String(payload.limit));
  if (payload.after) params.set("after", payload.after);
  if (payload.before) params.set("before", payload.before);
  const q = params.toString();
  return q ? `?${q}` : "";
}

function fail(status: number, headers: Record<string, string>, fallback: string): never {
  const rl = parseResendRateLimit(status, headers);
  if (rl.limited) {
    throw { ok: false, code: "CONNECTOR_RATE_LIMITED", message: "Resend rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds };
  }
  throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: fallback };
}

export function listDomains(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const payload = validateDomainsListInput(input);
    const fetchFn = typeof input.fetch === "function" ? (input.fetch as typeof fetch) : undefined;
    return createResendClient({ apiKey: input.apiKey, fetch: fetchFn, operation: "domains.list" })
      .fetchJSON(`/domains${buildQuery(payload)}`, { method: "GET" })
      .then((result) => {
        if (result.status >= 200 && result.status < 300) {
          const parsed = parseDomainsListResponse(result.body);
          return {
            connector: "resend",
            action: "domains.list",
            source: "provider",
            domains: parsed.domains,
            hasMore: parsed.hasMore,
          };
        }
        fail(result.status, result.headers, "Resend rejected the domains.list request.");
      });
  }
  return {
    connector: "resend",
    action: "domains.list",
    source: "connector",
    validated: validateDomainsListInput(input ?? {}),
  };
}

export function getDomain(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const payload = validateDomainsGetInput(input);
    const fetchFn = typeof input.fetch === "function" ? (input.fetch as typeof fetch) : undefined;
    return createResendClient({ apiKey: input.apiKey, fetch: fetchFn, operation: "domains.get" })
      .fetchJSON(`/domains/${encodeURIComponent(payload.id)}`, { method: "GET" })
      .then((result) => {
        if (result.status >= 200 && result.status < 300 && isRecord(result.body)) {
          return {
            connector: "resend",
            action: "domains.get",
            source: "provider",
            domain: normalizeDomain(result.body),
          };
        }
        fail(result.status, result.headers, "Resend rejected the domains.get request.");
      });
  }
  return {
    connector: "resend",
    action: "domains.get",
    source: "connector",
    validated: validateDomainsGetInput(input),
  };
}
