import { describe, expect, test } from "bun:test";
import { healthcheck } from "../src/healthcheck";

describe("github connector healthcheck", () => {
  test("returns connector-owned healthy status", () => {
    expect(healthcheck()).toEqual({
      connector: "github",
      status: "ok",
      source: "connector",
    });
  });

  test("uses GitHub /user for a credentialed healthcheck", async () => {
    const requests: Request[] = [];
    const result = await healthcheck({
      accessToken: "gho-secret",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify({ id: 123 }), { status: 200 });
      },
    });

    expect(result).toEqual({ connector: "github", status: "ok", source: "provider" });
    expect(requests[0].url).toBe("https://api.github.com/user");
    expect(requests[0].headers.get("authorization")).toBe("Bearer gho-secret");
  });

  test("does not claim health when GitHub rejects the credential", async () => {
    await expect(healthcheck({
      accessToken: "gho-invalid",
      fetch: async () => new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
