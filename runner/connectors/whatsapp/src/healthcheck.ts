import { ConnectorHttpError, createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

// Static result returned by the no-credential setup-validation path (the
// connector is registered and reachable as code, but no provider call is made).
export type HealthcheckResult = { connector: "whatsapp"; status: "ok"; source: "connector" };

// Provider-confirmed result returned after a real authenticated call succeeds.
export type ProviderHealthcheckResult = { connector: "whatsapp"; status: "ok"; source: "provider" };

// The Graph API version used by the connector. Must stay in sync with messages.ts.
const GRAPH_VERSION = "v25.0";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// healthcheck performs a REAL authenticated provider call when both credentials
// are present, and otherwise returns the static connector-owned status.
//
//   • input.accessToken + input.phoneNumberId →
//       GET https://graph.facebook.com/<version>/<phoneNumberId>
//       Authorization: Bearer <accessToken>
//   • otherwise → static { source: "connector" } (setup-validation path)
//
// WhatsApp needs BOTH an access token and a phone number ID. A partial
// credential can't be verified — it falls back to the static status rather
// than erroring. A valid pair returns 2xx with the phone number resource;
// an invalid/expired token returns 401.
//
// A `fetch` may be injected via input.fetch for tests (same pattern as actions).
export function healthcheck(input?: unknown): HealthcheckResult | Promise<ProviderHealthcheckResult> {
  if (
    isRecord(input) &&
    typeof input.accessToken === "string" &&
    typeof input.phoneNumberId === "string"
  ) {
    const fetchFn = typeof input.fetch === "function" ? (input.fetch as typeof fetch) : fetch;
    return verifyCredentials(input.accessToken, input.phoneNumberId, fetchFn);
  }
  return { connector: "whatsapp", status: "ok", source: "connector" };
}

async function verifyCredentials(
  accessToken: string,
  phoneNumberId: string,
  fetchFn: typeof fetch,
): Promise<ProviderHealthcheckResult> {
  const httpClient = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: manifest.operations.healthcheck.maxResponseBytes,
    timeoutMs: manifest.operations.healthcheck.timeoutMs,
    fetch: fetchFn,
  });
  let response: { status: number; body: string };
  try {
    response = await httpClient.fetchText(
      `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}?fields=verified_name,quality_rating`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
  } catch (error) {
    if (error instanceof ConnectorHttpError) throw error;
    throw { ok: false, code: "CONNECTOR_UNAVAILABLE", message: "WhatsApp (Meta Graph API) could not be reached." };
  }
  if (response.status === 429) {
    throw { ok: false, code: "CONNECTOR_RATE_LIMITED", message: "WhatsApp rate limit exceeded." };
  }
  if (response.status < 200 || response.status >= 300) {
    throw {
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: `WhatsApp rejected the credentials (HTTP ${response.status}).`,
    };
  }
  return { connector: "whatsapp", status: "ok", source: "provider" };
}
