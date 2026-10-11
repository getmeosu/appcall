import { describe, expect, it, beforeEach } from "bun:test";
import {
  createAuthClient,
  clearGreenhouseTokenCache,
  redactGreenhouseSecrets,
  parseNextCursorFromLink,
} from "../src/http";

const clientId = "client-id-abc";
const clientSecret = "super-secret-client-value-xyz";
const accessToken = "jwt-access-token-value-should-not-leak";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("Greenhouse OAuth Bearer auth", () => {
  beforeEach(() => {
    clearGreenhouseTokenCache();
  });

  it("mints a token then sends Authorization: Bearer on Harvest requests (never Basic)", async () => {
    const calls: Array<{ url: string; authorization: string | null; method: string }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      calls.push({
        url,
        authorization: headers.get("authorization"),
        method: String(init?.method ?? "GET").toUpperCase(),
      });
      if (url.includes("auth.greenhouse.io/token")) {
        expect(headers.get("authorization")?.startsWith("Basic ")).toBe(true);
        expect(headers.get("content-type")).toContain("application/x-www-form-urlencoded");
        expect(String(init?.body)).toContain("grant_type=client_credentials");
        return jsonResponse(200, { access_token: accessToken, token_type: "Bearer", expires_in: 3600 });
      }
      expect(url.startsWith("https://harvest.greenhouse.io/v3/")).toBe(true);
      expect(headers.get("authorization")).toBe(`Bearer ${accessToken}`);
      expect(headers.get("authorization")?.startsWith("Basic ")).toBe(false);
      return jsonResponse(200, [{ id: 1 }]);
    };

    const client = createAuthClient({ clientId, clientSecret, fetch: fetchImpl, operation: "users.list" });
    await client.getJSON("/users?per_page=1");
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toBe("https://auth.greenhouse.io/token");
    expect(calls[1]!.authorization).toBe(`Bearer ${accessToken}`);
    expect(calls[1]!.authorization).not.toMatch(/^Basic /);
  });

  it("caches the access token across Harvest calls until expiry", async () => {
    let tokenMints = 0;
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("auth.greenhouse.io/token")) {
        tokenMints += 1;
        return jsonResponse(200, { access_token: accessToken, token_type: "Bearer", expires_in: 3600 });
      }
      return jsonResponse(200, []);
    };
    const client = createAuthClient({ clientId, clientSecret, fetch: fetchImpl });
    await client.getJSON("/users?per_page=1");
    await client.getJSON("/candidates?per_page=1");
    expect(tokenMints).toBe(1);
  });

  it("refreshes once on Harvest 401 then retries; second 401 surfaces without looping", async () => {
    let tokenMints = 0;
    let harvestHits = 0;
    const tokens = ["token-one", "token-two"];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("auth.greenhouse.io/token")) {
        const token = tokens[Math.min(tokenMints, tokens.length - 1)]!;
        tokenMints += 1;
        return jsonResponse(200, { access_token: token, token_type: "Bearer", expires_in: 3600 });
      }
      harvestHits += 1;
      // Always 401 to force refresh-once then fail
      return jsonResponse(401, { message: "unauthorized" });
    };
    const client = createAuthClient({ clientId, clientSecret, fetch: fetchImpl });
    await expect(client.getJSON("/users?per_page=1")).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    expect(tokenMints).toBe(2);
    expect(harvestHits).toBe(2);
  });

  it("does not leak clientSecret or access token into upstream error messages", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("auth.greenhouse.io/token")) {
        return jsonResponse(200, { access_token: accessToken, token_type: "Bearer", expires_in: 3600 });
      }
      return jsonResponse(500, {
        message: `boom ${clientSecret} ${accessToken}`,
      });
    };
    const client = createAuthClient({ clientId, clientSecret, fetch: fetchImpl });
    try {
      await client.getJSON("/users?per_page=1");
      throw new Error("expected rejection");
    } catch (err: any) {
      const blob = JSON.stringify(err);
      expect(blob).not.toContain(clientSecret);
      expect(blob).not.toContain(accessToken);
      expect(err.message).toContain("[redacted]");
    }
  });

  it("redactGreenhouseSecrets strips known secrets", () => {
    const out = redactGreenhouseSecrets(`x ${clientSecret} y ${accessToken}`, [clientSecret, accessToken]);
    expect(out).not.toContain(clientSecret);
    expect(out).not.toContain(accessToken);
    expect(out).toContain("[redacted]");
  });

  it("parseNextCursorFromLink reads rel=next cursor", () => {
    const cursor = parseNextCursorFromLink({
      link: '<https://harvest.greenhouse.io/v3/candidates?cursor=abc123&per_page=100>; rel="next"',
    });
    expect(cursor).toBe("abc123");
  });

  it("putJSON sends PUT and deleteJSON can include a JSON body", async () => {
    const calls: Array<{ url: string; method: string; body: string | null }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("auth.greenhouse.io/token")) {
        return jsonResponse(200, { access_token: accessToken, token_type: "Bearer", expires_in: 3600 });
      }
      calls.push({ url, method: String(init?.method ?? "GET").toUpperCase(), body: init?.body ? String(init.body) : null });
      return jsonResponse(200, { ok: true });
    };
    const client = createAuthClient({ clientId, clientSecret, fetch: fetchImpl });
    await client.putJSON("/approver_groups/1/replace_approver", { add_user_id: 2, remove_user_id: 3 });
    await client.deleteJSON("/custom_field_options/bulk", { data: [1, 2] });
    expect(calls[0]!.method).toBe("PUT");
    expect(calls[0]!.url).toContain("/v3/approver_groups/1/replace_approver");
    expect(JSON.parse(calls[0]!.body!)).toEqual({ add_user_id: 2, remove_user_id: 3 });
    expect(calls[1]!.method).toBe("DELETE");
    expect(JSON.parse(calls[1]!.body!)).toEqual({ data: [1, 2] });
  });

  it("introspectToken POSTs the access token to auth.greenhouse.io/introspect", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push(`${String(init?.method ?? "GET").toUpperCase()} ${url}`);
      if (url.includes("auth.greenhouse.io/token")) {
        return jsonResponse(200, { access_token: accessToken, token_type: "Bearer", expires_in: 3600 });
      }
      if (url.includes("auth.greenhouse.io/introspect")) {
        expect(String(init?.body)).toContain("token=");
        return jsonResponse(200, { active: true, sub: "1049756" });
      }
      return jsonResponse(200, []);
    };
    const client = createAuthClient({ clientId, clientSecret, fetch: fetchImpl });
    const intro = await client.introspectToken();
    expect(intro.sub).toBe("1049756");
    expect(calls.some((c) => c.includes("INTROSPECT") || c.includes("/introspect"))).toBe(true);
  });
});
