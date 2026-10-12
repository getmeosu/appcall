import manifest from "../manifest.json";
import { healthFail, isRecord, probeProvider, stringField } from "../../_shared/healthcheck_probe";

// HEALTH-1: a credentialed healthcheck must prove the token against HubSpot.
// No token -> static source:"connector" (setup-validation path). With a token,
// one documented read-only call; source:"provider" only on a verified,
// provider-shaped 2xx body. Error mapping lives in _shared/healthcheck_probe.ts.

export type HealthcheckResult = { status: "ok"; source: "connector" | "provider" };

const spec = manifest.operations.healthcheck;

const HOST = "api.hubapi.com";

export async function healthcheck(input?: unknown): Promise<HealthcheckResult> {
  const token = stringField(input, "accessToken");
  if (!token) return { status: "ok", source: "connector" };
  // GET /account-info/v3/details (Account Information API).
  const body = await probeProvider({
    provider: "HubSpot",
    url: `https://${HOST}/account-info/v3/details`,
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    allowedHosts: [HOST],
    timeoutMs: spec.timeoutMs,
    maxResponseBytes: spec.maxResponseBytes,
    input,
  });
  if (!isRecord(body) || typeof body.portalId !== "number") {
    throw healthFail("CONNECTOR_RESPONSE_INVALID", "HubSpot healthcheck body did not contain a portalId.");
  }
  return { status: "ok", source: "provider" };
}
