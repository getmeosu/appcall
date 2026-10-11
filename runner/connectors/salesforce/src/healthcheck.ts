import { ConnectorHttpError } from "../../../bun/src/http";
import { createSalesforceClient } from "./http";

export type HealthcheckResult = { connector: "salesforce"; status: "ok"; source: "connector" };
export type ProviderHealthcheckResult = { connector: "salesforce"; status: "ok"; source: "provider" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// No credential: static setup check. accessToken + instanceUrl: GET chatter users/me.
export function healthcheck(input?: unknown): HealthcheckResult | Promise<ProviderHealthcheckResult> {
  if (isRecord(input) && typeof input.accessToken === "string" && typeof input.instanceUrl === "string") {
    const fetchFn = typeof input.fetch === "function" ? (input.fetch as typeof fetch) : undefined;
    return verify(input.accessToken, input.instanceUrl, fetchFn);
  }
  return { connector: "salesforce", status: "ok", source: "connector" };
}

async function verify(accessToken: string, instanceUrl: string, fetchFn: typeof fetch | undefined): Promise<ProviderHealthcheckResult> {
  const client = createSalesforceClient({ accessToken, instanceUrl, fetch: fetchFn, operation: "healthcheck" });
  let response: { status: number };
  try {
    response = await client.getCurrentUser();
  } catch (error) {
    if (error instanceof ConnectorHttpError) throw error;
    throw { ok: false, code: "CONNECTOR_UNAVAILABLE", message: "Salesforce could not be reached." };
  }
  if (response.status < 200 || response.status >= 300) {
    throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: `Salesforce rejected the credentials (HTTP ${response.status}).` };
  }
  return { connector: "salesforce", status: "ok", source: "provider" };
}
