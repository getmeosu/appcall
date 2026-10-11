import { ConnectorHttpError } from "../../../bun/src/http";
import { createCalComClient, isRecord } from "./http";

export type HealthcheckResult = { connector: "cal-com"; status: "ok"; source: "connector" };
export type ProviderHealthcheckResult = { connector: "cal-com"; status: "ok"; source: "provider" };

// No credential: static setup check. accessToken: GET https://api.cal.com/v2/me.
export function healthcheck(input?: unknown): HealthcheckResult | Promise<ProviderHealthcheckResult> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? (input.fetch as typeof fetch) : undefined;
    return verify(input.accessToken, fetchFn);
  }
  return { connector: "cal-com", status: "ok", source: "connector" };
}

async function verify(token: string, fetchFn: typeof fetch | undefined): Promise<ProviderHealthcheckResult> {
  const client = createCalComClient({ token, fetch: fetchFn, operation: "healthcheck" });
  let response: { status: number };
  try {
    response = await client.fetchJSON("/me");
  } catch (error) {
    if (error instanceof ConnectorHttpError) throw error;
    throw { ok: false, code: "CONNECTOR_UNAVAILABLE", message: "Cal.com could not be reached." };
  }
  if (response.status < 200 || response.status >= 300) {
    throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: `Cal.com rejected the credentials (HTTP ${response.status}).` };
  }
  return { connector: "cal-com", status: "ok", source: "provider" };
}
