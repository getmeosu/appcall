import manifest from "../manifest.json";
import { healthFail, isRecord, probeProvider, stringField, type HealthcheckFailure } from "../../_shared/healthcheck_probe";
import { META_GRAPH_BASE_URL } from "./http";

// HEALTH-1: a credentialed healthcheck must prove the token against Meta.
// No token -> static source:"connector" (setup-validation path). With a token,
// one documented read-only call; source:"provider" only on a verified,
// provider-shaped 2xx body. Error mapping lives in _shared/healthcheck_probe.ts,
// plus Graph API in-body error codes below.

export type HealthcheckResult = { status: "ok"; source: "connector" | "provider" };

const spec = manifest.operations.healthcheck;

const HOST = "graph.facebook.com";
// https://developers.facebook.com/docs/graph-api/guides/error-handling
// 190 invalid/expired token, 102 session, 10 / 200-299 permission.
const AUTH_CODES = new Set([102, 190, 10]);
// 4 app, 17 user, 32 page, 613 call-rate; 80000-80014 Marketing API BUC throttles.
const RATE_CODES = new Set([4, 17, 32, 613]);

export function classifyGraphError(status: number, text: string, headers: Record<string, string> = {}): HealthcheckFailure | undefined {
  let code: unknown;
  try {
    const parsed = JSON.parse(text);
    code = isRecord(parsed) && isRecord(parsed.error) ? parsed.error.code : undefined;
  } catch {
    return undefined;
  }
  if (typeof code !== "number") return undefined;
  if (AUTH_CODES.has(code) || (code >= 200 && code <= 299)) {
    return healthFail("CONNECTOR_UPSTREAM_ERROR", `Meta rejected the credentials (HTTP ${status}, code ${code}).`);
  }
  if (RATE_CODES.has(code) || (code >= 80000 && code <= 80014)) {
    const raw = Number(headers["retry-after"] ?? "");
    return healthFail("CONNECTOR_RATE_LIMITED", `Meta rate limit exceeded (code ${code}).`, Number.isFinite(raw) && raw > 0 ? raw : 60);
  }
  return undefined;
}

export async function healthcheck(input?: unknown): Promise<HealthcheckResult> {
  const token = stringField(input, "accessToken");
  if (!token) return { status: "ok", source: "connector" };
  // GET /{version}/me?fields=id (Graph API User node for the token's user).
  const body = await probeProvider({
    provider: "Meta",
    url: `${META_GRAPH_BASE_URL}/me?fields=id`,
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    allowedHosts: [HOST],
    timeoutMs: spec.timeoutMs,
    maxResponseBytes: spec.maxResponseBytes,
    input,
    defaultRetryAfterSeconds: 60,
    classifyError: classifyGraphError,
  });
  if (!isRecord(body) || typeof body.id !== "string" || !/^[0-9]+$/.test(body.id)) {
    throw healthFail("CONNECTOR_RESPONSE_INVALID", "Meta healthcheck body did not contain the token's user id.");
  }
  return { status: "ok", source: "provider" };
}
