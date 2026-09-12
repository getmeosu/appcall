import { isRecord, notionVersion } from "./http";
import { ConnectorHttpError, createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

// Static result returned by the no-credential setup-validation path (the
// connector is registered and reachable as code, but no provider call is made).
export type HealthcheckResult = { connector: "notion"; status: "ok"; source: "connector" };

// Provider-confirmed result returned after a real authenticated call succeeds.
export type ProviderHealthcheckResult = { connector: "notion"; status: "ok"; source: "provider" };

// healthcheck performs a REAL authenticated provider call when a credential is
// present in `input`, and otherwise returns the static connector-owned status.
//
//   • input.notionToken → GET https://api.notion.com/v1/users/me
//                          (Authorization: Bearer <token> + Notion-Version header)
//   • neither           → static { source: "connector" } (setup-validation path)
//
// A `fetch` may be injected via input.fetch for tests (same pattern as actions).
export function healthcheck(input?: unknown): HealthcheckResult | Promise<ProviderHealthcheckResult> {
  if (isRecord(input) && typeof input.notionToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? (input.fetch as typeof fetch) : fetch;
    return verify(input.notionToken, fetchFn);
  }
  return { connector: "notion", status: "ok", source: "connector" };
}

async function verify(notionToken: string, fetchFn: typeof fetch): Promise<ProviderHealthcheckResult> {
  const httpClient = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: manifest.operations.healthcheck.maxResponseBytes,
    timeoutMs: manifest.operations.healthcheck.timeoutMs,
    fetch: fetchFn,
  });
  let response: { status: number; body: string };
  try {
    response = await httpClient.fetchText("https://api.notion.com/v1/users/me", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${notionToken}`,
        "Notion-Version": notionVersion,
      },
    });
  } catch (err) {
    if (err instanceof ConnectorHttpError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw { ok: false, code: "CONNECTOR_UNAVAILABLE", message: `Notion could not be reached: ${message}` };
  }
  if (response.status === 429) {
    throw { ok: false, code: "CONNECTOR_RATE_LIMITED", message: "Notion rate limited this request." };
  }
  if (response.status < 200 || response.status >= 300) {
    throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: `Notion rejected the credentials (HTTP ${response.status}).` };
  }
  return { connector: "notion", status: "ok", source: "provider" };
}
