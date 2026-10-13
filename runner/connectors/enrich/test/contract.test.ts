import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });
const ok = { success: true, data: { balance: 1 } };

describe("Enrich contract", () => {
  test("credit balance uses the x-api-key header and sends no body", async () => {
    const seen: Request[] = [];
    await actions["credits.balance"]!({
      apiKey: "fixture-api-token",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response(ok);
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("GET");
    expect(seen[0].headers.get("x-api-key")).toBe("fixture-api-token");
    expect(seen[0].headers.get("authorization")).toBeNull();
    expect(seen[0].headers.get("content-type")).toBeNull();
    const url = new URL(seen[0].url);
    expect(url.hostname).toBe("dev.enrich.so");
    expect(url.pathname).toBe("/api/v3/wallets/balance");
  });

  test("employee search posts JSON to Enrich and does not fetch the LinkedIn URL", async () => {
    const seen: Request[] = [];
    await actions["employees.find"]!({
      apiKey: "fixture-api-token",
      company_linkedin_url: "https://www.linkedin.com/company/google/",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ success: true, data: { results: [] } });
      },
    });
    expect(seen).toHaveLength(1);
    const url = new URL(seen[0].url);
    expect(url.hostname).toBe("dev.enrich.so");
    expect(url.pathname).toBe("/api/v3/people-search/employee-finder");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(await seen[0].text()).toBe(
      '{"company_linkedin_url":"https://www.linkedin.com/company/google/"}',
    );
  });

  test("validates input, malformed output, 401 and 429", async () => {
    await expect(
      actions["email.validate"]!({
        apiKey: "fixture-api-token",
        email: "",
        fetch: async () => response({}),
      }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(
      actions["credits.balance"]!({
        apiKey: "fixture-api-token",
        fetch: async () => response([]),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(
      actions["credits.balance"]!({
        apiKey: "fixture-api-token",
        fetch: async () => response({}, 401),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(
      actions["credits.balance"]!({
        apiKey: "fixture-api-token",
        fetch: async () => response({}, 429, { "Retry-After": "4" }),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
