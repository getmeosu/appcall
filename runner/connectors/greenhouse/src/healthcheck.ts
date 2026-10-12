import { createAuthClient } from "./http";

export type GreenhouseHealthcheckInput = {
  clientId?: string;
  clientSecret?: string;
  userId?: string;
  fetch?: typeof fetch;
};

/**
 * Mint an OAuth token (client credentials) then GET /v3/users?per_page=1.
 * Proves both token exchange and Harvest Bearer access (and Site Admin `sub` when set).
 * Any token-mint or Harvest failure throws (401/403 → CONNECTOR_UPSTREAM_ERROR,
 * 429 → CONNECTOR_RATE_LIMITED), so source:"provider" is only returned after a
 * real provider success. connector/action ride on the PLAT-OUT-1 envelope.
 */
export async function healthcheck(input: GreenhouseHealthcheckInput = {}): Promise<{
  status: "ok";
  source: "provider";
  data: unknown;
}> {
  const client = createAuthClient({
    clientId: typeof input.clientId === "string" ? input.clientId : "",
    clientSecret: typeof input.clientSecret === "string" ? input.clientSecret : "",
    userId: typeof input.userId === "string" ? input.userId : undefined,
    fetch: input.fetch,
    operation: "healthcheck",
  });
  const data = await client.getJSON("/users?per_page=1");
  if (data === null || typeof data !== "object") {
    throw {
      ok: false,
      code: "CONNECTOR_RESPONSE_INVALID",
      message: "Greenhouse healthcheck returned no users payload.",
    };
  }
  return { status: "ok", source: "provider", data };
}
