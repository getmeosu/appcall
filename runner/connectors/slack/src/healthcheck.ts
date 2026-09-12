import { ConnectorHttpError, createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

export type HealthcheckResult = {
  connector: "slack";
  status: "ok";
  source: "connector";
};

export type ProviderHealthcheckResult = {
  connector: "slack";
  status: "ok";
  source: "provider";
};

// Keep the no-credential result as a setup-validation status. Once a token is
// present, only Slack's auth.test response may claim provider health.
export function healthcheck(input?: unknown): HealthcheckResult | Promise<ProviderHealthcheckResult> {
  if (isRecord(input)) {
    const token = typeof input.token === "string"
      ? input.token
      : typeof input.accessToken === "string" ? input.accessToken : undefined;
    if (token) {
      const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : fetch;
      return verifyToken(token, fetchFn);
    }
  }
  return {
    connector: "slack",
    status: "ok",
    source: "connector",
  };
}

async function verifyToken(token: string, fetchFn: typeof fetch): Promise<ProviderHealthcheckResult> {
  const httpClient = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: manifest.operations.healthcheck.maxResponseBytes,
    timeoutMs: manifest.operations.healthcheck.timeoutMs,
    fetch: fetchFn,
  });
  let response: { status: number; headers: Record<string, string>; body: string };
  try {
    response = await httpClient.fetchText("https://slack.com/api/auth.test", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (error) {
    if (error instanceof ConnectorHttpError) throw error;
    throw { ok: false, code: "CONNECTOR_UNAVAILABLE", message: "Slack could not be reached." };
  }
  if (response.status === 429) {
    const retryAfter = Number(response.headers["retry-after"] ?? "0");
    throw {
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "Slack rate limited the healthcheck.",
      ...(Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfterSeconds: retryAfter } : {}),
    };
  }
  let body: unknown;
  try {
    body = JSON.parse(response.body);
  } catch {
    body = undefined;
  }
  if (response.status >= 200 && response.status < 300 && isRecord(body) && body.ok === true) {
    return { connector: "slack", status: "ok", source: "provider" };
  }
  throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "Slack rejected the credentials." };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
