import { isRecord } from "./http";
import { ConnectorHttpError, createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

// Static result returned by the no-credential setup-validation path (the
// connector is registered and reachable as code, but no provider call is made).
export type HealthcheckResult = { connector: "saleshandy"; status: "ok"; source: "connector" };

// Provider-confirmed result returned after a real authenticated call succeeds.
export type ProviderHealthcheckResult = { connector: "saleshandy"; status: "ok"; source: "provider" };

// healthcheck performs a REAL authenticated provider call when a credential is
// present in `input`, and otherwise returns the static connector-owned status.
//
//   • input.apiKey → GET https://open-api.saleshandy.com/v1/sequences?pageSize=1 (x-api-key header)
//   • neither      → static { source: "connector" } (setup-validation path)
//
// A `fetch` may be injected via input.fetch for tests (same pattern as actions).
export function healthcheck(input?: unknown): HealthcheckResult | Promise<ProviderHealthcheckResult> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? (input.fetch as typeof fetch) : fetch;
    return verifyApiKey(input.apiKey, fetchFn);
  }
  return { connector: "saleshandy", status: "ok", source: "connector" };
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
    response = await httpClient.fetchText("https://open-api.saleshandy.com/v1/sequences?pageSize=1", {
      method: "GET",
      headers: { "x-api-key": apiKey },
    });
  } catch (error) {
    if (error instanceof ConnectorHttpError) throw error;
    throw { ok: false, code: "CONNECTOR_UNAVAILABLE", message: "SalesHandy could not be reached." };
  }
  if (response.status === 429) {
    throw { ok: false, code: "CONNECTOR_RATE_LIMITED", message: "SalesHandy rate limit exceeded." };
  }
  if (response.status < 200 || response.status >= 300) {
    throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: `SalesHandy rejected the credentials (HTTP ${response.status}).` };
  }
  return { connector: "saleshandy", status: "ok", source: "provider" };
}
