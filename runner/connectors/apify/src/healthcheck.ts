import { ConnectorHttpError, createConnectorHttpClient } from "../../../bun/src/http";
import { isRecord } from "./http";
import manifest from "../manifest.json";

// Static result returned by the no-credential setup-validation path (the
// connector is registered and reachable as code, but no provider call is made).
export type HealthcheckResult = { connector: "apify"; status: "ok"; source: "connector" };

// Provider-confirmed result returned after a real authenticated call succeeds.
export type ProviderHealthcheckResult = { connector: "apify"; status: "ok"; source: "provider" };

// healthcheck performs a REAL authenticated provider call when a credential is
// present in `input`, and otherwise returns the static connector-owned status.
//
//   • input.apiKey → GET https://api.apify.com/v2/users/me (Authorization: Bearer)
//   • neither      → static { source: "connector" } (setup-validation path)
//
// Apify's API identifies the account solely from the token, so /v2/users/me is
// the canonical token-only "who am I" probe: a valid token returns 2xx, an
// invalid one returns 401. Unlike Apollo there is no body-level validity flag —
// the HTTP status is authoritative.
//
// A `fetch` may be injected via input.fetch for tests (same pattern as actions).
export function healthcheck(input?: unknown): HealthcheckResult | Promise<ProviderHealthcheckResult> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? (input.fetch as typeof fetch) : fetch;
    return verifyApiKey(input.apiKey, fetchFn);
  }
  return { connector: "apify", status: "ok", source: "connector" };
}

async function verifyApiKey(apiKey: string, fetchFn: typeof fetch): Promise<ProviderHealthcheckResult> {
  const httpClient = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: manifest.operations.healthcheck.maxResponseBytes,
    timeoutMs: manifest.operations.healthcheck.timeoutMs,
    fetch: fetchFn,
  });
  let response: { status: number; body: string };
  try {
    response = await httpClient.fetchText("https://api.apify.com/v2/users/me", {
      method: "GET",
      headers: { "Authorization": `Bearer ${apiKey}` },
    });
  } catch (error) {
    if (error instanceof ConnectorHttpError) throw error;
    throw { ok: false, code: "CONNECTOR_UNAVAILABLE", message: "Apify could not be reached." };
  }
  if (response.status < 200 || response.status >= 300) {
    throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: `Apify rejected the credentials (HTTP ${response.status}).` };
  }
  return { connector: "apify", status: "ok", source: "provider" };
}
