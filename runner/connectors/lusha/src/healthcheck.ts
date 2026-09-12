import { isRecord } from "./http";
import { ConnectorHttpError, createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

// Static result returned by the no-credential setup-validation path (the
// connector is registered and reachable as code, but no provider call is made).
export type HealthcheckResult = { connector: "lusha"; status: "ok"; source: "connector" };

// Provider-confirmed result returned after a real authenticated call succeeds.
export type ProviderHealthcheckResult = { connector: "lusha"; status: "ok"; source: "provider" };

// healthcheck performs a REAL authenticated provider call when a credential is
// present in `input`, and otherwise returns the static connector-owned status.
//
//   • input.apiKey → GET https://api.lusha.com/account/usage (api_key header)
//   • neither      → static { source: "connector" } (setup-validation path)
//
// The /account/usage endpoint requires a valid api_key and returns 200 with
// credit usage data for authenticated requests.
//
// A `fetch` may be injected via input.fetch for tests (same pattern as actions).
export function healthcheck(input?: unknown): HealthcheckResult | Promise<ProviderHealthcheckResult> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? (input.fetch as typeof fetch) : fetch;
    return verifyApiKey(input.apiKey, fetchFn);
  }
  return { connector: "lusha", status: "ok", source: "connector" };
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
    response = await httpClient.fetchText("https://api.lusha.com/account/usage", {
      method: "GET",
      headers: { "api_key": apiKey },
    });
  } catch (error) {
    if (error instanceof ConnectorHttpError) throw error;
    throw { ok: false, code: "CONNECTOR_UNAVAILABLE", message: "Lusha could not be reached." };
  }
  if (response.status === 429) {
    throw { ok: false, code: "CONNECTOR_RATE_LIMITED", message: "Lusha rate limit exceeded." };
  }
  if (response.status < 200 || response.status >= 300) {
    throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: `Lusha rejected the credentials (HTTP ${response.status}).` };
  }
  return { connector: "lusha", status: "ok", source: "provider" };
}
