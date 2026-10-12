import { ConnectorHttpError, createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

// HEALTH-P0: a credentialed healthcheck must prove the token against Workable.
//
//   • input.accessToken + input.account → GET https://{account}.workable.com/spi/v3/stages
//     (documented SPI "List stages", Bearer token, read-only, no paging cost).
//     Only a 2xx JSON body carrying a `stages` array returns source:"provider".
//   • no token → static { source: "connector" } (setup-validation path; the
//     registry rejects a credentialed source:"connector").
//
// Errors: 401/403 → credentials rejected, 429 → CONNECTOR_RATE_LIMITED with
// Retry-After, other non-2xx → CONNECTOR_UPSTREAM_ERROR, transport failure →
// CONNECTOR_UNAVAILABLE, unexpected body → CONNECTOR_RESPONSE_INVALID.

export type WorkableHealthcheckResult =
  | { status: "ok"; source: "connector" }
  | { status: "ok"; source: "provider" };

type HealthcheckFailure = { ok: false; code: string; message: string; retryAfterSeconds?: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(code: string, message: string, retryAfterSeconds?: number): HealthcheckFailure {
  return { ok: false, code, message, ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }) };
}

export async function healthcheck(input?: unknown): Promise<WorkableHealthcheckResult> {
  const token = isRecord(input) ? input.accessToken : undefined;
  if (typeof token !== "string" || token.length === 0) {
    return { status: "ok", source: "connector" };
  }
  const rawAccount = (input as Record<string, unknown>).account;
  const account = typeof rawAccount === "string" ? rawAccount.trim() : "";
  if (!/^[A-Za-z0-9._-]+$/.test(account)) {
    throw fail("CONNECTOR_UPSTREAM_ERROR", "Workable account subdomain is missing or invalid.");
  }
  const injected = (input as Record<string, unknown>).fetch;
  const http = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: manifest.operations.healthcheck.maxResponseBytes,
    timeoutMs: manifest.operations.healthcheck.timeoutMs,
    fetch: typeof injected === "function" ? (injected as typeof fetch) : undefined,
  });

  let response: { status: number; headers: Record<string, string>; body: string };
  try {
    response = await http.fetchText(`https://${account}.workable.com/spi/v3/stages`, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    if (err instanceof ConnectorHttpError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw fail("CONNECTOR_UNAVAILABLE", `Workable could not be reached: ${message}`);
  }

  if (response.status === 401 || response.status === 403) {
    throw fail("CONNECTOR_UPSTREAM_ERROR", `Workable rejected the credentials (HTTP ${response.status}).`);
  }
  if (response.status === 429) {
    const raw = Number(response.headers["retry-after"] ?? "");
    throw fail("CONNECTOR_RATE_LIMITED", "Workable rate limit exceeded.", Number.isFinite(raw) && raw > 0 ? raw : 10);
  }
  if (response.status < 200 || response.status >= 300) {
    throw fail("CONNECTOR_UPSTREAM_ERROR", `Workable healthcheck failed (HTTP ${response.status}).`);
  }
  let body: unknown;
  try {
    body = JSON.parse(response.body);
  } catch {
    throw fail("CONNECTOR_RESPONSE_INVALID", "Workable returned a non-JSON healthcheck body.");
  }
  if (!isRecord(body) || !Array.isArray(body.stages)) {
    throw fail("CONNECTOR_RESPONSE_INVALID", "Workable healthcheck body did not contain a stages list.");
  }
  return { status: "ok", source: "provider" };
}
