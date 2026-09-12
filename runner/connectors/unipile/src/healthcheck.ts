import { ConnectorHttpError } from "../../../bun/src/http";
import { createUnipileClient, isRecord, parseUnipileRateLimit } from "./http";

// Static result returned by the no-credential setup-validation path (the
// connector is registered and reachable as code, but no provider call is made).
export type HealthcheckResult = { connector: "unipile"; status: "ok"; source: "connector" };

// Provider-confirmed result returned after a real authenticated call succeeds.
export type ProviderHealthcheckResult = { connector: "unipile"; status: "ok"; source: "provider" };

// healthcheck performs a REAL authenticated provider call when both credentials
// are present, and otherwise returns the static connector-owned status.
//
//   • input.apiKey + input.dsn → GET <dsn>/api/v1/accounts (X-API-KEY header)
//   • otherwise                → static { source: "connector" } (setup path)
//
// Unipile needs BOTH an API key and a DSN (the tenant base URL), so a partial
// credential can't be verified — it falls back to the static status rather than
// erroring. A valid pair returns 2xx; an invalid key returns 401.
//
// A `fetch` may be injected via input.fetch for tests (same pattern as actions).
export function healthcheck(input?: unknown): HealthcheckResult | Promise<ProviderHealthcheckResult> {
  if (isRecord(input) && typeof input.apiKey === "string" && typeof input.dsn === "string") {
    const fetchFn = typeof input.fetch === "function" ? (input.fetch as typeof fetch) : undefined;
    return verifyCredentials(input.apiKey, input.dsn, fetchFn);
  }
  return { connector: "unipile", status: "ok", source: "connector" };
}

async function verifyCredentials(apiKey: string, dsn: string, fetchFn?: typeof fetch): Promise<ProviderHealthcheckResult> {
  let response: { status: number; headers: Record<string, string>; body: unknown };
  try {
    const client = createUnipileClient({ apiKey, baseUrl: dsn, fetch: fetchFn, operation: "healthcheck" });
    response = await client.fetchJSON("/accounts");
  } catch (error) {
    if (error instanceof ConnectorHttpError) throw error;
    // A bad DSN (validateDsnHost) or a transport failure — not reachable.
    throw { ok: false, code: "CONNECTOR_UNAVAILABLE", message: "Unipile could not be reached (check the DSN)." };
  }
  if (response.status === 429) {
    const rl = parseUnipileRateLimit(response.status, response.headers);
    throw { ok: false, code: "CONNECTOR_RATE_LIMITED", message: "Unipile rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds };
  }
  if (response.status < 200 || response.status >= 300) {
    throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: `Unipile rejected the credentials (HTTP ${response.status}).` };
  }
  return { connector: "unipile", status: "ok", source: "provider" };
}
