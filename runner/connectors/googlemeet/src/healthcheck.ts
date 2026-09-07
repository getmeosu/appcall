import { createGoogleMeetClient, isRecord, extractFetch, parseGoogleRateLimit } from "./http";

export type HealthcheckResult = { connector: "googlemeet"; status: "ok"; source: "connector" };
export type ProviderHealthcheckResult = { connector: "googlemeet"; status: "ok"; source: "provider" };

export function healthcheck(input?: unknown): HealthcheckResult | Promise<ProviderHealthcheckResult> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const client = createGoogleMeetClient({
      accessToken: input.accessToken,
      fetch: extractFetch(input),
      operation: "healthcheck",
    });
    return client.fetchJSON("/calendars/primary", { method: "GET" }).then((res) => {
      if (res.status >= 200 && res.status < 300) {
        return { connector: "googlemeet" as const, status: "ok" as const, source: "provider" as const };
      }
      const rl = parseGoogleRateLimit(res.status, res.headers);
      if (rl.limited) {
        throw { ok: false, code: "CONNECTOR_RATE_LIMITED", message: "Google Meet rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds };
      }
      throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "Google rejected the access token." };
    });
  }
  return { connector: "googlemeet", status: "ok", source: "connector" };
}
