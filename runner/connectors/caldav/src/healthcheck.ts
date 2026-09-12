import { runPrincipalDiscover } from "./actions";
import { ConnectorHttpError } from "../../../bun/src/http";

// Static result returned by the no-credential setup-validation path (the
// connector is registered and reachable as code, but no provider call is made).
export type HealthcheckResult = { connector: "caldav"; status: "ok"; source: "connector" };

// Provider-confirmed result returned after a real authenticated call succeeds.
export type ProviderHealthcheckResult = { connector: "caldav"; status: "ok"; source: "provider" };

// healthcheck performs a REAL authenticated provider call when credentials are
// present in `input`, and otherwise returns the static connector-owned status.
//
//   • input.username + input.password → PROPFIND / (principal discovery)
//   • neither                         → static { source: "connector" }
//
// A `fetch` may be injected via input.fetch for tests (same pattern as actions).
export function healthcheck(input?: unknown): HealthcheckResult | Promise<ProviderHealthcheckResult> {
  if (isRecord(input) && typeof input.username === "string" && typeof input.password === "string") {
    return verifyCredentials(input);
  }
  return { connector: "caldav", status: "ok", source: "connector" };
}

async function verifyCredentials(input: Record<string, unknown>): Promise<ProviderHealthcheckResult> {
  let result: Awaited<ReturnType<typeof runPrincipalDiscover>>;
  try {
    result = await runPrincipalDiscover(input, "healthcheck");
  } catch (err) {
    if (err instanceof ConnectorHttpError) throw err;
    // Network failure or non-allowlisted host — surface as unavailable.
    const message = err instanceof Error ? err.message : "CalDAV server could not be reached.";
    throw { ok: false, code: "CONNECTOR_UNAVAILABLE", message };
  }
  if (result.ok) {
    return { connector: "caldav", status: "ok", source: "provider" };
  }
  // Auth / rate-limit / upstream errors come back as a structured error from
  // the principal-discovery call — propagate code + message verbatim.
  throw {
    ok: false,
    code: result.error.code,
    message: result.error.message,
    retryAfterSeconds: result.error.retryAfterSeconds,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
