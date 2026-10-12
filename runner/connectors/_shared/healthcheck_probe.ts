import { ConnectorHttpError, createConnectorHttpClient } from "../../bun/src/http";

// HEALTH-1: shared provider probe for credentialed healthchecks.
// One authenticated GET; the caller's `verify` decides whether the body is
// provider evidence. Error mapping: 401/403 -> credentials rejected
// (CONNECTOR_UPSTREAM_ERROR), 429 -> CONNECTOR_RATE_LIMITED (Retry-After),
// other non-2xx -> CONNECTOR_UPSTREAM_ERROR, transport -> CONNECTOR_UNAVAILABLE,
// non-JSON / unverified body -> CONNECTOR_RESPONSE_INVALID.

export type HealthcheckFailure = { ok: false; code: string; message: string; retryAfterSeconds?: number };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function healthFail(code: string, message: string, retryAfterSeconds?: number): HealthcheckFailure {
  return { ok: false, code, message, ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }) };
}

export function stringField(input: unknown, key: string): string {
  if (!isRecord(input)) return "";
  const value = input[key];
  return typeof value === "string" ? value.trim() : "";
}

export type ProbeOptions = {
  provider: string;
  url: string;
  headers: Record<string, string>;
  allowedHosts: string[];
  timeoutMs: number;
  maxResponseBytes: number;
  input: unknown;
  defaultRetryAfterSeconds?: number;
};

export async function probeProvider(options: ProbeOptions): Promise<unknown> {
  const injected = isRecord(options.input) ? options.input.fetch : undefined;
  const http = createConnectorHttpClient({
    allowedHosts: options.allowedHosts,
    maxResponseBytes: options.maxResponseBytes,
    timeoutMs: options.timeoutMs,
    fetch: typeof injected === "function" ? (injected as typeof fetch) : undefined,
  });
  const { provider } = options;
  let response: { status: number; headers: Record<string, string>; body: string };
  try {
    response = await http.fetchText(options.url, { method: "GET", headers: options.headers });
  } catch (err) {
    if (err instanceof ConnectorHttpError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw healthFail("CONNECTOR_UNAVAILABLE", `${provider} could not be reached: ${message}`);
  }
  if (response.status === 401 || response.status === 403) {
    throw healthFail("CONNECTOR_UPSTREAM_ERROR", `${provider} rejected the credentials (HTTP ${response.status}).`);
  }
  if (response.status === 429) {
    const raw = Number(response.headers["retry-after"] ?? "");
    throw healthFail(
      "CONNECTOR_RATE_LIMITED",
      `${provider} rate limit exceeded.`,
      Number.isFinite(raw) && raw > 0 ? raw : options.defaultRetryAfterSeconds ?? 10,
    );
  }
  if (response.status < 200 || response.status >= 300) {
    throw healthFail("CONNECTOR_UPSTREAM_ERROR", `${provider} healthcheck failed (HTTP ${response.status}).`);
  }
  try {
    return JSON.parse(response.body);
  } catch {
    throw healthFail("CONNECTOR_RESPONSE_INVALID", `${provider} returned a non-JSON healthcheck body.`);
  }
}
