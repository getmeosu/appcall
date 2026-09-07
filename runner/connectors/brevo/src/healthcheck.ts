import { verifySmtp } from "../../_shared/smtp";

// Static result returned by the no-credential setup-validation path (the
// connector is registered and reachable as code, but no provider call is made).
export type HealthcheckResult = { connector: "brevo"; status: "ok"; source: "connector" };

// Provider-confirmed result returned after a real authenticated call succeeds.
export type ProviderHealthcheckResult = { connector: "brevo"; status: "ok"; source: "provider" };

// healthcheck performs a REAL authenticated provider call when a credential is
// present in `input`, and otherwise returns the static connector-owned status.
//
//   • input.apiKey   → GET https://api.brevo.com/v3/account (api-key header)
//   • input.smtpHost → AUTH-only SMTP verification (no mail sent)
//   • neither        → static { source: "connector" } (setup-validation path)
//
// A `fetch` may be injected via input.fetch for tests (same pattern as actions).
export function healthcheck(input?: unknown): HealthcheckResult | Promise<ProviderHealthcheckResult> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? (input.fetch as typeof fetch) : fetch;
    return verifyApiKey(input.apiKey, fetchFn);
  }
  if (isRecord(input) && typeof input.smtpHost === "string" && input.smtpHost.length > 0) {
    return verifySmtp(input as Record<string, unknown>).then(() => ({
      connector: "brevo" as const,
      status: "ok" as const,
      source: "provider" as const,
    }));
  }
  return { connector: "brevo", status: "ok", source: "connector" };
}

async function verifyApiKey(apiKey: string, fetchFn: typeof fetch): Promise<ProviderHealthcheckResult> {
  let response: Response;
  try {
    response = await fetchFn("https://api.brevo.com/v3/account", {
      method: "GET",
      headers: { "api-key": apiKey },
    });
  } catch {
    throw { ok: false, code: "CONNECTOR_UNAVAILABLE", message: "Brevo could not be reached." };
  }
  if (response.status >= 200 && response.status < 300) {
    return { connector: "brevo", status: "ok", source: "provider" };
  }
  throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "Brevo rejected the credentials." };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
