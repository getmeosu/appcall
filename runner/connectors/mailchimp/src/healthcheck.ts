import manifest from "../manifest.json";
import { healthFail, isRecord, probeProvider, stringField } from "../../_shared/healthcheck_probe";

// HEALTH-1: a credentialed healthcheck must prove the token against Mailchimp.
// No token -> static source:"connector" (setup-validation path). With a token,
// one documented read-only call; source:"provider" only on a verified,
// provider-shaped 2xx body. Error mapping lives in _shared/healthcheck_probe.ts.

export type HealthcheckResult = { status: "ok"; source: "connector" | "provider" };

const spec = manifest.operations.healthcheck;

const HOST_PATTERN = /^[a-z]{2,4}[0-9]{1,3}\.api\.mailchimp\.com$/;

export async function healthcheck(input?: unknown): Promise<HealthcheckResult> {
  const token = stringField(input, "accessToken");
  if (!token) return { status: "ok", source: "connector" };
  const host = stringField(input, "host").toLowerCase();
  if (!HOST_PATTERN.test(host)) {
    throw healthFail("CONNECTOR_UPSTREAM_ERROR", "Mailchimp data-center host is missing or invalid in the healthcheck input.");
  }
  // GET /3.0/ping (Marketing API "Ping").
  const body = await probeProvider({
    provider: "Mailchimp",
    url: `https://${host}/3.0/ping`,
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    allowedHosts: [host],
    timeoutMs: spec.timeoutMs,
    maxResponseBytes: spec.maxResponseBytes,
    input,
  });
  if (!isRecord(body) || typeof body.health_status !== "string") {
    throw healthFail("CONNECTOR_RESPONSE_INVALID", "Mailchimp healthcheck body did not contain a health_status.");
  }
  return { status: "ok", source: "provider" };
}
