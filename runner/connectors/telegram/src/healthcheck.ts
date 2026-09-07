export type HealthcheckResult = {
  connector: "telegram";
  status: "ok";
  source: "connector";
};

export type ProviderHealthcheckResult = {
  connector: "telegram";
  status: "ok";
  source: "provider";
};

// healthcheck performs a REAL authenticated provider call when a bot token is
// present in `input`, and otherwise returns the static connector-owned status.
//
//   • input.botToken → GET https://api.telegram.org/bot{token}/getMe
//   • no token       → static { source: "connector" } (setup-validation path)
//
// A `fetch` may be injected via input.fetch for tests (same pattern as actions).
export function healthcheck(input?: unknown): HealthcheckResult | Promise<ProviderHealthcheckResult> {
  if (isRecord(input) && typeof input.botToken === "string" && input.botToken.length > 0) {
    const fetchFn = typeof input.fetch === "function" ? (input.fetch as typeof fetch) : fetch;
    return verifyBotToken(input.botToken, fetchFn);
  }
  return {
    connector: "telegram",
    status: "ok",
    source: "connector",
  };
}

async function verifyBotToken(botToken: string, fetchFn: typeof fetch): Promise<ProviderHealthcheckResult> {
  let response: Response;
  try {
    response = await fetchFn(`https://api.telegram.org/bot${botToken}/getMe`, {
      method: "GET",
      headers: {},
    });
  } catch {
    throw { ok: false, code: "CONNECTOR_UNAVAILABLE", message: "Telegram could not be reached." };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  if (response.status >= 200 && response.status < 300 && isRecord(body) && body.ok === true) {
    return { connector: "telegram", status: "ok", source: "provider" };
  }
  throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "Telegram rejected the bot token." };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
