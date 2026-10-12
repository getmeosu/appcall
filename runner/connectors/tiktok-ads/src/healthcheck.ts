import manifest from "../manifest.json";
import { healthFail, isRecord, probeProvider, stringField } from "../../_shared/healthcheck_probe";

// HEALTH-1: a credentialed healthcheck must prove the token against TikTok Ads.
// No token -> static source:"connector" (setup-validation path). With a token,
// one documented read-only call; source:"provider" only on a verified,
// provider-shaped 2xx body. Error mapping lives in _shared/healthcheck_probe.ts.

export type HealthcheckResult = { status: "ok"; source: "connector" | "provider" };

const spec = manifest.operations.healthcheck;

const HOST = "business-api.tiktok.com";
// Business API returns HTTP 200 with a non-zero `code` on failure.
const AUTH_CODES = new Set([40001, 40002, 40102, 40104, 40105]);
const RATE_LIMIT_CODE = 40100;

export async function healthcheck(input?: unknown): Promise<HealthcheckResult> {
  const token = stringField(input, "accessToken");
  if (!token) return { status: "ok", source: "connector" };
  // GET /open_api/v1.3/user/info/ (Business API "Get authorized user info").
  const body = await probeProvider({
    provider: "TikTok Ads",
    url: `${manifest.http.baseUrl}/user/info/`,
    headers: { Accept: "application/json", "Access-Token": token },
    allowedHosts: [HOST],
    timeoutMs: spec.timeoutMs,
    maxResponseBytes: spec.maxResponseBytes,
    input,
    defaultRetryAfterSeconds: 30,
  });
  if (!isRecord(body) || typeof body.code !== "number") {
    throw healthFail("CONNECTOR_RESPONSE_INVALID", "TikTok Ads healthcheck body did not contain a code.");
  }
  if (AUTH_CODES.has(body.code)) {
    throw healthFail("CONNECTOR_UPSTREAM_ERROR", `TikTok Ads rejected the credentials (code ${body.code}).`);
  }
  if (body.code === RATE_LIMIT_CODE) {
    throw healthFail("CONNECTOR_RATE_LIMITED", "TikTok Ads rate limit exceeded.", 30);
  }
  if (body.code !== 0) {
    throw healthFail("CONNECTOR_UPSTREAM_ERROR", `TikTok Ads healthcheck failed (code ${body.code}).`);
  }
  if (!isRecord(body.data) || (typeof body.data.core_user_id !== "string" && typeof body.data.core_user_id !== "number")) {
    throw healthFail("CONNECTOR_RESPONSE_INVALID", "TikTok Ads healthcheck body did not contain the authorized user.");
  }
  return { status: "ok", source: "provider" };
}
