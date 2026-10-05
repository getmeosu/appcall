import { describe, expect, it, beforeEach } from "bun:test";
import { healthcheck } from "../src/healthcheck";
import { clearGreenhouseTokenCache } from "../src/http";

describe("Greenhouse healthcheck", () => {
  beforeEach(() => {
    clearGreenhouseTokenCache();
  });

  it("mints an OAuth token then GETs /v3/users?per_page=1 with Bearer", async () => {
    const calls: Request[] = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push(new Request(input as string, init));
      const url = String(input);
      if (url.includes("auth.greenhouse.io/token")) {
        return new Response(
          JSON.stringify({ access_token: "hc-token", token_type: "Bearer", expires_in: 3600 }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify([{ id: 1, name: "Admin" }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const result = await healthcheck({
      clientId: "cid",
      clientSecret: "csec",
      fetch: fetchImpl,
    });

    expect(result.connector).toBe("greenhouse");
    expect(result.status).toBe("ok");
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toBe("https://auth.greenhouse.io/token");
    expect(calls[1]!.url).toContain("https://harvest.greenhouse.io/v3/users");
    expect(calls[1]!.headers.get("authorization")).toBe("Bearer hc-token");
    expect(calls[1]!.headers.get("authorization")).not.toMatch(/^Basic /);
  });
});
