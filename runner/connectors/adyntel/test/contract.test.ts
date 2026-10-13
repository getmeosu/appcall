import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import coverage from "../../adyntel.coverage.json";

const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });
const credentials = { apiKey: "fixture-api-key", email: "owner@example.com" };

describe("Adyntel declarative contract", () => {
  test("uses body credentials on the documented host and no invented auth header", () => {
    expect(manifest.key).toBe("adyntel");
    expect(manifest.http.baseUrl).toBe("https://api.adyntel.com");
    expect(manifest.network.allowedHosts).toEqual(["api.adyntel.com"]);
    expect(manifest.http.auth).toEqual({ field: "apiKey" });
    expect(manifest.auth.setup.fields.map((field: { key: string }) => field.key)).toEqual(["apiKey", "email"]);
    expect(Object.keys(manifest.operations)).toHaveLength(8);
  });

  test("maps each live tool to one JSON POST and keeps budgets inside the contract", () => {
    expect(coverage.missing_http).toEqual([]);
    expect(coverage.missing_still).toEqual([]);
    expect(coverage.mapped).toHaveLength(8);
    const seen = new Set<string>();
    for (const entry of coverage.mapped) {
      const operation = manifest.operations[entry.operation];
      expect(operation?.request?.method, entry.tool).toBe("POST");
      expect(operation?.request?.path, entry.tool).toMatch(/^\/[A-Za-z0-9_/-]+$/);
      expect(operation?.request?.body?.api_key, entry.tool).toBe("{{apiKey}}");
      expect(operation?.request?.body?.email, entry.tool).toBe("{{email}}");
      expect(operation.outputSchema.type, entry.tool).toBe("object");
      expect(operation.inputSchema.type, entry.tool).toBe("object");
      expect(operation.title.length, entry.tool).toBeGreaterThan(0);
      expect(operation.description.length, entry.tool).toBeGreaterThan(0);
      expect(operation.timeoutMs).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs).toBeLessThanOrEqual(300000);
      expect(operation.maxInputBytes).toBeLessThanOrEqual(26214400);
      expect(operation.maxResponseBytes).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect(operation.request.headers["Content-Type"], entry.tool).toBe("application/json");
      expect(operation.request.success, entry.tool).not.toContain(204);
      expect(["read", "write"]).toContain(operation.sideEffect);
      seen.add(entry.operation);
    }
    expect([...seen].sort()).toEqual(Object.keys(manifest.operations).sort());
    expect(manifest.operations["tiktok.ads.search"].inputSchema.properties.countryCode.enum).toContain("DE");
    expect(manifest.operations["tiktok.ads.search"].inputSchema.properties.countryCode.enum).not.toContain("US");
    expect(manifest.operations["google.shopping.start"].sideEffect).toBe("write");
  });

  test("sends the LinkedIn page id as a JSON number and omits unset filters", async () => {
    const seen: Request[] = [];
    await actions["linkedin.ads.get"]!({
      ...credentials,
      linkedinPageId: 15564,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ page_id: "15564", ads: [], total_ads: 0, is_last_page: true, continuation_token: null });
      },
    });
    expect(new URL(seen[0].url).pathname).toBe("/linkedin");
    expect(JSON.parse(await seen[0].text())).toEqual({
      api_key: "fixture-api-key",
      email: "owner@example.com",
      linkedin_page_id: 15564,
    });
  });

  test("accepts a pending shopping job as JSON and rejects empty or invalid payloads", async () => {
    const pending = await actions["google.shopping.status"]!({
      ...credentials,
      id: "job-1",
      fetch: async () => response({ status: "processing", message: "pending" }, 202),
    });
    expect(pending.data).toEqual({ status: "processing", message: "pending" });
    await expect(actions["google.ads.get"]!({
      ...credentials,
      companyDomain: "clay.com",
      fetch: async () => response([], 200),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["google.ads.get"]!({
      ...credentials,
      companyDomain: "clay.com",
      fetch: async () => new Response("not-json", { status: 200 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
  });

  test("validates identifiers and classifies 401 and 429", async () => {
    await expect(actions["google.ads.get"]!({ ...credentials, companyDomain: "", fetch: async () => response({}) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["linkedin.ads.get"]!({ ...credentials, fetch: async () => response({}) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["meta.ads.get"]!({ ...credentials, extra: true, fetch: async () => response({}) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["keywords.paid-vs-organic"]!({
      ...credentials,
      companyDomain: "lokalise.com",
      fetch: async () => response({ message: "invalid fixture-api-key" }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "invalid [REDACTED]" });
    await expect(actions["meta.ads.search"]!({
      ...credentials,
      keyword: "webinar",
      fetch: async () => response({ detail: "slow down" }, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });

  test("does not call the network without the API key", async () => {
    let called = false;
    const result = await actions["google.shopping.start"]!({
      companyDomain: "tesla.com",
      email: "owner@example.com",
      fetch: async () => {
        called = true;
        return response({});
      },
    });
    expect(called).toBe(false);
    expect(result.source).toBe("connector");
  });
});
