import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const routes = {
  "company-metrics.get": { method: "GET", path: "/stock/metric" },
  "company-profile.get": { method: "GET", path: "/stock/profile2" },
  "market-status.get": { method: "GET", path: "/stock/market-status" },
  "quote.get": { method: "GET", path: "/quote" },
  "financials-reported.get": { method: "GET", path: "/stock/financials-reported" },
  "earnings.list": { method: "GET", path: "/stock/earnings" },
  "filings.list": { method: "GET", path: "/stock/filings" },
  "symbols.search": { method: "GET", path: "/search" },
} as const;

const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

describe("Finnhub contract", () => {
  test("uses the documented token header on finnhub.io", () => {
    expect(manifest.key).toBe("finnhub");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.network.allowedHosts).toEqual(["finnhub.io"]);
    expect(manifest.http.baseUrl).toBe("https://finnhub.io/api/v1");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "X-Finnhub-Token",
      value: "{{apiKey}}",
    });
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
    expect(Object.keys(manifest.operations).sort()).toEqual(Object.keys(routes).sort());
  });

  test("maps each action to one body-less JSON GET", () => {
    const httpHeaders = manifest.http.headers ?? {};
    for (const [name, operation] of Object.entries(manifest.operations)) {
      const route = routes[name as keyof typeof routes];
      expect(operation.kind, name).toBe("action");
      expect(operation.sideEffect, name).toBe("read");
      expect(operation.title.length, name).toBeGreaterThan(0);
      expect(operation.description.length, name).toBeGreaterThan(0);
      expect(operation.timeoutMs, name).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs, name).toBeLessThanOrEqual(300000);
      expect(operation.maxInputBytes, name).toBeLessThanOrEqual(26214400);
      expect(operation.maxResponseBytes, name).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect(operation.inputSchema.type, name).toBe("object");
      expect(operation.inputSchema.additionalProperties, name).toBe(false);
      expect(operation.outputSchema.type, name).toBe("object");
      expect(operation.enforceOutputSchema, name).toBe(true);
      expect(operation.validationMode, name).toBe("strict-generated");
      expect(operation.responseFormat, name).toBe("json");
      expect(operation.request?.method, name).toBe(route.method);
      expect(operation.request?.path, name).toBe(route.path);
      expect(operation.request?.baseUrl, name).toBeUndefined();
      expect(operation.request?.success, name).toEqual([200]);
      expect(operation.request?.body, name).toBeUndefined();
      expect(JSON.stringify(operation.request?.headers ?? {}), name).not.toContain("Content-Type");
      expect(JSON.stringify(httpHeaders), name).not.toContain("Content-Type");
    }
  });

  test("sends the token header, encodes the symbol, and does not follow another route", async () => {
    const { actions } = compileDeclarativeConnector(manifest as never);
    const seen: Request[] = [];
    const result = await actions["quote.get"]!({
      apiKey: "secret-token",
      symbol: "BRK/A",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ c: 1, d: 0, dp: 0, h: 1, l: 1, o: 1, pc: 1, t: 1 });
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("GET");
    expect(seen[0].headers.get("x-finnhub-token")).toBe("secret-token");
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");
    const url = new URL(seen[0].url);
    expect(url.origin).toBe("https://finnhub.io");
    expect(url.pathname).toBe("/api/v1/quote");
    expect(url.searchParams.get("symbol")).toBe("BRK/A");
    expect(url.searchParams.get("token")).toBeNull();
    expect(result.data.c).toBe(1);
  });

  test("company profile is one route and accepts exactly one identifier", async () => {
    const { actions } = compileDeclarativeConnector(manifest as never);
    const seen: Request[] = [];
    await actions["company-profile.get"]!({
      apiKey: "secret-token",
      isin: "US0378331005",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ ticker: "AAPL", name: "Fixture Inc" });
      },
    });
    const url = new URL(seen[0].url);
    expect(url.pathname).toBe("/api/v1/stock/profile2");
    expect(url.searchParams.get("isin")).toBe("US0378331005");
    expect(url.searchParams.has("symbol")).toBe(false);
    expect(url.searchParams.has("cusip")).toBe(false);
    await expect(actions["company-profile.get"]!({
      apiKey: "secret-token",
      symbol: "AAPL",
      isin: "US0378331005",
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["company-profile.get"]!({
      apiKey: "secret-token",
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
  });

  test("validates input, malformed output, 401 and 429", async () => {
    const { actions } = compileDeclarativeConnector(manifest as never);
    await expect(actions["quote.get"]!({
      apiKey: "secret-token",
      symbol: "",
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["filings.list"]!({
      apiKey: "secret-token",
      form: "10-K",
      fetch: async () => response([]),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["quote.get"]!({
      apiKey: "secret-token",
      symbol: "AAPL",
      fetch: async () => response([]),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["quote.get"]!({
      apiKey: "secret-token",
      symbol: "AAPL",
      fetch: async () => response({ error: "Invalid API key" }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["quote.get"]!({
      apiKey: "secret-token",
      symbol: "AAPL",
      fetch: async () => response({}, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
