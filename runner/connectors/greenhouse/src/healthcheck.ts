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
 */
export async function healthcheck(input: GreenhouseHealthcheckInput = {}): Promise<{
  connector: "greenhouse";
  status: "ok";
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
  return { connector: "greenhouse", status: "ok", data };
}
