import { ConnectorHttpError } from "../../../bun/src/http";
import { createGitHubClient, parseGitHubRateLimit } from "./http";

export type HealthcheckResult = {
  connector: "github";
  status: "ok";
  source: "connector";
};

export type ProviderHealthcheckResult = {
  connector: "github";
  status: "ok";
  source: "provider";
};

// A configured OAuth token must be checked against GitHub's user endpoint. The
// static result is reserved for the no-credential setup-validation path.
export function healthcheck(input?: unknown): HealthcheckResult | Promise<ProviderHealthcheckResult> {
  if (isRecord(input) && typeof input.accessToken === "string" && input.accessToken.length > 0) {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : fetch;
    return verifyToken(input.accessToken, fetchFn);
  }
  return { connector: "github", status: "ok", source: "connector" };
}

async function verifyToken(accessToken: string, fetchFn: typeof fetch): Promise<ProviderHealthcheckResult> {
  const client = createGitHubClient({ accessToken, fetch: fetchFn, operation: "healthcheck" });
  let response: Awaited<ReturnType<typeof client.fetchJSON>>;
  try {
    response = await client.fetchJSON("/user", { method: "GET" });
  } catch (error) {
    if (error instanceof ConnectorHttpError) throw error;
    throw { ok: false, code: "CONNECTOR_UNAVAILABLE", message: "GitHub could not be reached." };
  }
  if (response.status >= 200 && response.status < 300) {
    return { connector: "github", status: "ok", source: "provider" };
  }
  const rateLimit = parseGitHubRateLimit(response.status, response.headers);
  if (rateLimit.limited) {
    throw {
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "GitHub rate limited the healthcheck.",
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    };
  }
  throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the credentials." };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
