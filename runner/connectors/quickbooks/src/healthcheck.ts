import manifest from "../manifest.json";
import { healthFail, isRecord, probeProvider, stringField } from "../../_shared/healthcheck_probe";

// HEALTH-1: a credentialed healthcheck must prove the token against QuickBooks.
// No token -> static source:"connector" (setup-validation path). With a token,
// one documented read-only call; source:"provider" only on a verified,
// provider-shaped 2xx body. Error mapping lives in _shared/healthcheck_probe.ts.

export type HealthcheckResult = { status: "ok"; source: "connector" | "provider" };

const spec = manifest.operations.healthcheck;

const HOST = "quickbooks.api.intuit.com";

export async function healthcheck(input?: unknown): Promise<HealthcheckResult> {
  const token = stringField(input, "accessToken");
  if (!token) return { status: "ok", source: "connector" };
  const realmId = stringField(input, "realmId");
  if (!/^[0-9]{1,32}$/.test(realmId)) {
    throw healthFail("CONNECTOR_UPSTREAM_ERROR", "QuickBooks realmId is missing or invalid in the healthcheck input.");
  }
  // GET /v3/company/{realmId}/companyinfo/{realmId} (Accounting API CompanyInfo read).
  const body = await probeProvider({
    provider: "QuickBooks",
    url: `https://${HOST}/v3/company/${realmId}/companyinfo/${realmId}`,
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    allowedHosts: [HOST],
    timeoutMs: spec.timeoutMs,
    maxResponseBytes: spec.maxResponseBytes,
    input,
  });
  const info = isRecord(body) ? body.CompanyInfo : undefined;
  if (!isRecord(info) || String(info.Id ?? "") !== realmId) {
    throw healthFail("CONNECTOR_RESPONSE_INVALID", "QuickBooks healthcheck body did not contain the CompanyInfo for this realm.");
  }
  return { status: "ok", source: "provider" };
}
