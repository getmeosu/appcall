import { verifySmtp } from "../../_shared/smtp";
import { ConnectorHttpError, createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

export type HealthcheckResult = { connector: "resend"; status: "ok"; source: "connector" };
export type ProviderHealthcheckResult = { connector: "resend"; status: "ok"; source: "provider" };

// healthcheck performs a REAL authenticated provider call when a credential is
// present in `input`, and otherwise returns the static connector-owned status.
//
//   • input.apiKey   → GET https://api.resend.com/domains (Bearer)
//   • input.smtpHost → AUTH-only SMTP verification (no mail sent)
//   • neither        → static { source: "connector" } (setup-validation path)
export function healthcheck(input?: unknown): HealthcheckResult | Promise<ProviderHealthcheckResult> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? (input.fetch as typeof fetch) : fetch;
    return verifyApiKey(input.apiKey, fetchFn);
  }
  if (isRecord(input) && typeof input.smtpHost === "string" && input.smtpHost.length > 0) {
    return verifySmtp(input as Record<string, unknown>).then(() => ({
      connector: "resend" as const,
      status: "ok" as const,
      source: "provider" as const,
    }));
  }
  return { connector: "resend", status: "ok", source: "connector" };
}

async function verifyApiKey(apiKey: string, fetchFn: typeof fetch): Promise<ProviderHealthcheckResult> {
  const httpClient = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: manifest.operations.healthcheck.maxResponseBytes,
    timeoutMs: manifest.operations.healthcheck.timeoutMs,
    fetch: fetchFn,
  });
  let response: { status: number; body: string };
  try {
    response = await httpClient.fetchText("https://api.resend.com/domains", {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch (error) {
    if (error instanceof ConnectorHttpError) throw error;
    throw { ok: false, code: "CONNECTOR_UNAVAILABLE", message: "Resend could not be reached." };
  }
  if (response.status >= 200 && response.status < 300) {
    return { connector: "resend", status: "ok", source: "provider" };
  }
  throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "Resend rejected the credentials." };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
