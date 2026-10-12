import manifest from "../manifest.json";
import { healthFail, isRecord, probeProvider, stringField } from "../../_shared/healthcheck_probe";

// HEALTH-1: a credentialed healthcheck must prove the token against Xero.
// No token -> static source:"connector" (setup-validation path). With a token,
// one documented read-only call; source:"provider" only on a verified,
// provider-shaped 2xx body. Error mapping lives in _shared/healthcheck_probe.ts.

export type HealthcheckResult = { status: "ok"; source: "connector" | "provider" };

const spec = manifest.operations.healthcheck;

const HOST = "api.xero.com";

export async function healthcheck(input?: unknown): Promise<HealthcheckResult> {
  const token = stringField(input, "accessToken");
  if (!token) return { status: "ok", source: "connector" };
  // GET https://api.xero.com/connections (OAuth2 "check the tenants you're authorized to access").
  const body = await probeProvider({
    provider: "Xero",
    url: `https://${HOST}/connections`,
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    allowedHosts: [HOST],
    timeoutMs: spec.timeoutMs,
    maxResponseBytes: spec.maxResponseBytes,
    input,
    defaultRetryAfterSeconds: 30,
  });
  if (!Array.isArray(body) || !body.every((c) => isRecord(c) && typeof c.tenantId === "string" && c.tenantId.length > 0)) {
    throw healthFail("CONNECTOR_RESPONSE_INVALID", "Xero healthcheck body was not a connections list.");
  }
  if (body.length === 0) {
    throw healthFail("CONNECTOR_UPSTREAM_ERROR", "Xero token is valid but no tenant is connected to it.");
  }
  const tenantId = stringField(input, "tenantId");
  if (tenantId && !body.some((c) => (c as Record<string, unknown>).tenantId === tenantId)) {
    throw healthFail("CONNECTOR_UPSTREAM_ERROR", "Xero token is not connected to the configured tenant.");
  }
  return { status: "ok", source: "provider" };
}
