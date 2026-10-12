import manifest from "../manifest.json";
import { healthFail, isRecord, probeProvider, stringField } from "../../_shared/healthcheck_probe";
import { GOOGLE_ADS_BASE_URL } from "./http";

// HEALTH-1: a credentialed healthcheck must prove the token against Google Ads.
// No token -> static source:"connector" (setup-validation path). With a token,
// one documented read-only call; source:"provider" only on a verified,
// provider-shaped 2xx body. Error mapping lives in _shared/healthcheck_probe.ts.

export type HealthcheckResult = { status: "ok"; source: "connector" | "provider" };

const spec = manifest.operations.healthcheck;

const HOST = "googleads.googleapis.com";

export async function healthcheck(input?: unknown): Promise<HealthcheckResult> {
  const token = stringField(input, "accessToken");
  if (!token) return { status: "ok", source: "connector" };
  const headers: Record<string, string> = { Accept: "application/json", Authorization: `Bearer ${token}` };
  // developerToken is optional setup; never send an empty header.
  const developerToken = stringField(input, "developerToken");
  if (developerToken) headers["developer-token"] = developerToken;
  // GET /{version}/customers:listAccessibleCustomers (needs no customer id or login-customer-id).
  const body = await probeProvider({
    provider: "Google Ads",
    url: `${GOOGLE_ADS_BASE_URL}/customers:listAccessibleCustomers`,
    headers,
    allowedHosts: [HOST],
    timeoutMs: spec.timeoutMs,
    maxResponseBytes: spec.maxResponseBytes,
    input,
    defaultRetryAfterSeconds: 30,
  });
  // An account with no accessible customers returns {} (proto3 omits empty repeated fields).
  const names = isRecord(body) ? (body.resourceNames ?? []) : undefined;
  if (!Array.isArray(names) || !names.every((n) => typeof n === "string" && /^customers\/[0-9]+$/.test(n))) {
    throw healthFail("CONNECTOR_RESPONSE_INVALID", "Google Ads healthcheck body was not an accessible-customers list.");
  }
  return { status: "ok", source: "provider" };
}
