/**
 * Zoho Recruit healthcheck.
 *
 * With a credential (input.accessToken) it makes a REAL authenticated call,
 * GET /recruit/v2/users?type=CurrentUser on the connection's data centre
 * (https://www.zoho.com/recruit/developer-guide/apiv2/get-users.html, scope
 * ZohoRecruit.users.READ), and reports source "provider" only when Zoho returns
 * the current user. Without a credential it returns the static connector-owned
 * status (setup-validation path). Before ZR-1 the credentialed path returned the
 * static status, which the runner rejects as "did not confirm provider health".
 */
import { createClient } from "./http";

export type HealthcheckResult = {
  connector: "zoho-recruit";
  status: "ok";
  source: "connector";
};

export type ProviderHealthcheckResult = {
  connector: "zoho-recruit";
  status: "ok";
  source: "provider";
};

export function healthcheck(input?: unknown): HealthcheckResult | Promise<ProviderHealthcheckResult> {
  if (isRecord(input) && typeof input.accessToken === "string" && input.accessToken.trim().length > 0) {
    return probe(input, input.accessToken);
  }
  return { connector: "zoho-recruit", status: "ok", source: "connector" };
}

async function probe(input: Record<string, unknown>, accessToken: string): Promise<ProviderHealthcheckResult> {
  const client = createClient({
    accessToken,
    dataCenter: input.dataCenter,
    apiDomains: [input.api_domain, input.apiDomain],
    fetch: typeof input.fetch === "function" ? (input.fetch as typeof fetch) : undefined,
    operation: "healthcheck",
  });
  const raw = await client.getJSON("/users?type=CurrentUser");
  if (isRecord(raw) && Array.isArray(raw.users) && raw.users.length > 0) {
    return { connector: "zoho-recruit", status: "ok", source: "provider" };
  }
  throw {
    ok: false,
    code: "CONNECTOR_UPSTREAM_ERROR",
    message: "Zoho Recruit did not return the current user.",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
