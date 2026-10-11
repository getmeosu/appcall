import { ConnectorHttpError } from "../../../bun/src/http";
import { createCalendlyClient, isRecord } from "./http";

export type HealthcheckResult = { connector: "calendly"; status: "ok"; source: "connector" };
export type ProviderHealthcheckResult = { connector: "calendly"; status: "ok"; source: "provider" };

// No credential: static setup check. accessToken: GET https://api.calendly.com/users/me.
export function healthcheck(input?: unknown): HealthcheckResult | Promise<ProviderHealthcheckResult> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? (input.fetch as typeof fetch) : undefined;
    return verify(input.accessToken, fetchFn);
  }
  return { connector: "calendly", status: "ok", source: "connector" };
}

async function verify(accessToken: string, fetchFn: typeof fetch | undefined): Promise<ProviderHealthcheckResult> {
  const client = createCalendlyClient({ accessToken, fetch: fetchFn, operation: "healthcheck" });
  let response: { status: number };
  try {
    response = await client.fetchJSON("/users/me");
  } catch (error) {
    if (error instanceof ConnectorHttpError) throw error;
    throw { ok: false, code: "CONNECTOR_UNAVAILABLE", message: "Calendly could not be reached." };
  }
  if (response.status < 200 || response.status >= 300) {
    throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: `Calendly rejected the credentials (HTTP ${response.status}).` };
  }
  return { connector: "calendly", status: "ok", source: "provider" };
}
