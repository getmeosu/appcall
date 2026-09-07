import { verifySmtp } from "../../_shared/smtp";

export type HealthcheckResult = { connector: "sendgrid"; status: "ok"; source: "connector" };
export type ProviderHealthcheckResult = { connector: "sendgrid"; status: "ok"; source: "provider" };

// healthcheck performs a REAL authenticated provider call when a credential is
// present in `input`, and otherwise returns the static connector-owned status.
//
//   • input.apiKey   → GET https://api.sendgrid.com/v3/user/account (Bearer)
//   • input.smtpHost → AUTH-only SMTP verification (no mail sent)
//   • neither        → static { source: "connector" } (setup-validation path)
export function healthcheck(input?: unknown): HealthcheckResult | Promise<ProviderHealthcheckResult> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? (input.fetch as typeof fetch) : fetch;
    return verifyApiKey(input.apiKey, fetchFn);
  }
  if (isRecord(input) && typeof input.smtpHost === "string" && input.smtpHost.length > 0) {
    return verifySmtp(input as Record<string, unknown>).then(() => ({
      connector: "sendgrid" as const,
      status: "ok" as const,
      source: "provider" as const,
    }));
  }
  return { connector: "sendgrid", status: "ok", source: "connector" };
}

async function verifyApiKey(apiKey: string, fetchFn: typeof fetch): Promise<ProviderHealthcheckResult> {
  let response: Response;
  try {
    response = await fetchFn("https://api.sendgrid.com/v3/user/account", {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch {
    throw { ok: false, code: "CONNECTOR_UNAVAILABLE", message: "SendGrid could not be reached." };
  }
  if (response.status >= 200 && response.status < 300) {
    return { connector: "sendgrid", status: "ok", source: "provider" };
  }
  throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "SendGrid rejected the credentials." };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
