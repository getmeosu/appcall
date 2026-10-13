import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, any>>;
const { actions } = compileDeclarativeConnector(manifest as never);
const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

const envelope = {
  status: {
    timestamp: "2026-01-01T00:00:00.000Z",
    error_code: 0,
    error_message: null,
    elapsed: 1,
    credit_count: 1,
  },
  data: [{ id: 1, name: "Bitcoin", symbol: "BTC", slug: "bitcoin" }],
};

const mapped: Record<string, { operation: string; path: string }> = {
  COINMARKETCAP_CRYPTOCURRENCY_LISTINGS_LATEST: {
    operation: "cryptocurrency.listings.latest",
    path: "/v3/cryptocurrency/listings/latest",
  },
  COINMARKETCAP_CRYPTOCURRENCY_MAP: {
    operation: "cryptocurrency.map",
    path: "/v1/cryptocurrency/map",
  },
  COINMARKETCAP_CRYPTOCURRENCY_QUOTES_LATEST: {
    operation: "cryptocurrency.quotes.latest",
    path: "/v3/cryptocurrency/quotes/latest",
  },
  COINMARKETCAP_GET_CRYPTOCURRENCY_INFO: {
    operation: "cryptocurrency.info",
    path: "/v2/cryptocurrency/info",
  },
  COINMARKETCAP_GET_EXCHANGE_INFO: {
    operation: "exchange.info",
    path: "/v1/exchange/info",
  },
  COINMARKETCAP_GET_KEY_INFO: {
    operation: "key.info",
    path: "/v1/key/info",
  },
  COINMARKETCAP_GLOBAL_METRICS_QUOTES_LATEST: {
    operation: "global-metrics.quotes.latest",
    path: "/v1/global-metrics/quotes/latest",
  },
  COINMARKETCAP_PARTNER_MAP: {
    operation: "exchange.map",
    path: "/v1/exchange/map",
  },
  COINMARKETCAP_TOOLS_PRICE_CONVERSION: {
    operation: "tools.price-conversion",
    path: "/v2/tools/price-conversion",
  },
};

describe("coinmarketcap contract", () => {
  test("uses the documented Pro API host and key header", () => {
    expect(manifest.key).toBe("coinmarketcap");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.network.allowedHosts).toEqual(["pro-api.coinmarketcap.com"]);
    expect(manifest.http.baseUrl).toBe("https://pro-api.coinmarketcap.com");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "X-CMC_PRO_API_KEY",
      value: "{{apiKey}}",
    });
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(JSON.stringify(manifest.http).toLowerCase()).not.toContain("content-type");
    expect(JSON.stringify(manifest.auth)).not.toContain("http://");
    expect(JSON.stringify(manifest.auth).toLowerCase()).not.toContain("baseurl");
    const setupKeys = manifest.auth.setup.fields.map((field: { key: string }) => field.key);
    expect(setupKeys).toEqual(["apiKey"]);
  });

  test("maps the 9 live tools onto one GET each", () => {
    expect(Object.keys(mapped)).toHaveLength(9);
    expect(Object.keys(operations)).toHaveLength(10);
    expect(operations.healthcheck.request.path).toBe("/v1/key/info");
    for (const [tool, spec] of Object.entries(mapped)) {
      const request = operations[spec.operation]?.request;
      expect(request, tool).toBeDefined();
      expect(request.method, tool).toBe("GET");
      expect(request.path, tool).toBe(spec.path);
      expect(request.body, tool).toBeUndefined();
      expect(request.baseUrl, tool).toBeUndefined();
      expect(actions[spec.operation], tool).toBeTypeOf("function");
    }
    const paths = Object.values(mapped).map((spec) => spec.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  test("keeps budgets, read side effects, and object schemas", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(operation.sideEffect, key).toBe("read");
      expect(operation.responseFormat, key).toBe("json");
      expect(operation.validationMode, key).toBe("strict-generated");
      expect(operation.enforceOutputSchema, key).toBe(true);
      expect(operation.inputSchema.type, key).toBe("object");
      expect(operation.inputSchema.additionalProperties, key).toBe(false);
      expect(operation.outputSchema.type, key).toBe("object");
      expect(operation.title.length, key).toBeGreaterThan(0);
      expect(operation.description.length, key).toBeGreaterThan(0);
      expect(operation.timeoutMs, key).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs, key).toBeLessThanOrEqual(300000);
      expect(operation.maxInputBytes, key).toBeLessThanOrEqual(26214400);
      expect(operation.maxResponseBytes, key).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect(operation.request.method, key).toBe("GET");
      expect(operation.request.headers, key).toBeUndefined();
      expect(operation.request.body, key).toBeUndefined();
    }
  });

  test("sends the API key header and does not send a body", async () => {
    const seen: Request[] = [];
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      seen.push(new Request(url, init));
      return json(envelope);
    };
    await actions.healthcheck!({ apiKey: "secret-key", fetch: fetchImpl });
    expect(seen[0].headers.get("x-cmc_pro_api_key")).toBe("secret-key");
    expect(seen[0].headers.get("authorization")).toBeNull();
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(seen[0].method).toBe("GET");
    expect(seen[0].url).toBe("https://pro-api.coinmarketcap.com/v1/key/info");
    expect(await seen[0].text()).toBe("");
  });

  test("forwards documented filters and joins identifier arrays", async () => {
    const seen: string[] = [];
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      seen.push(String(url));
      return json(envelope);
    };
    await actions["cryptocurrency.listings.latest"]!({
      apiKey: "secret-key",
      start: 101,
      limit: 50,
      convert: "USD",
      sort: "percent_change_24h",
      sort_dir: "desc",
      tag: "defi",
      cryptocurrency_type: "tokens",
      fetch: fetchImpl,
    });
    expect(seen[0]).toBe(
      "https://pro-api.coinmarketcap.com/v3/cryptocurrency/listings/latest?start=101&limit=50&convert=USD&sort=percent_change_24h&sort_dir=desc&cryptocurrency_type=tokens&tag=defi",
    );

    await actions["cryptocurrency.map"]!({
      apiKey: "secret-key",
      id: "1,1027",
      slug: "bitcoin",
      symbol: "BTC,ETH",
      listing_status: "active",
      fetch: fetchImpl,
    });
    const mapUrl = new URL(seen[1]);
    expect(mapUrl.pathname).toBe("/v1/cryptocurrency/map");
    expect(mapUrl.searchParams.get("symbol")).toBe("BTC,ETH");
    expect(mapUrl.searchParams.get("id")).toBe("1,1027");
    expect(mapUrl.searchParams.get("slug")).toBe("bitcoin");
    expect(mapUrl.searchParams.get("listing_status")).toBe("active");

    await actions["cryptocurrency.info"]!({
      apiKey: "secret-key",
      id: ["1", 1027],
      fetch: fetchImpl,
    });
    expect(seen[2]).toBe("https://pro-api.coinmarketcap.com/v2/cryptocurrency/info?id=1,1027");

    await actions["exchange.info"]!({
      apiKey: "secret-key",
      slug: ["binance", "gdax"],
      aux: "logo,urls",
      fetch: fetchImpl,
    });
    expect(seen[3]).toBe("https://pro-api.coinmarketcap.com/v1/exchange/info?slug=binance,gdax&aux=logo,urls");

    await actions["exchange.map"]!({
      apiKey: "secret-key",
      slug: "binance,gdax",
      listing_status: "active",
      start: 1,
      limit: 2,
      fetch: fetchImpl,
    });
    expect(seen[4]).toBe(
      "https://pro-api.coinmarketcap.com/v1/exchange/map?listing_status=active&slug=binance%2Cgdax&start=1&limit=2",
    );

    await actions["tools.price-conversion"]!({
      apiKey: "secret-key",
      amount: 2,
      symbol: "BTC",
      convert: "USD",
      time: "2024-01-01T00:00:00Z",
      fetch: fetchImpl,
    });
    expect(seen[5]).toBe(
      "https://pro-api.coinmarketcap.com/v2/tools/price-conversion?amount=2&symbol=BTC&time=2024-01-01T00%3A00%3A00Z&convert=USD",
    );
  });

  test("rejects bad input and classifies 401, 429, and a non-object body", async () => {
    const fetchImpl = async () => json(envelope);
    await expect(
      actions["cryptocurrency.listings.latest"]!({ apiKey: "k", limit: 0, fetch: fetchImpl }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(
      actions["cryptocurrency.listings.latest"]!({ apiKey: "k", limit: 5001, fetch: fetchImpl }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(
      actions["cryptocurrency.map"]!({ apiKey: "k", sort: "name", fetch: fetchImpl }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(
      actions["tools.price-conversion"]!({ apiKey: "k", symbol: "BTC", fetch: fetchImpl }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(
      actions["tools.price-conversion"]!({ apiKey: "k", amount: 0, symbol: "BTC", fetch: fetchImpl }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(
      actions["cryptocurrency.info"]!({ apiKey: "k", id: [], fetch: fetchImpl }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(
      actions["key.info"]!({ apiKey: "k", extra: true, fetch: fetchImpl }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(
      actions["key.info"]!({
        apiKey: "k",
        fetch: async () =>
          json({ status: { error_code: 1001, error_message: "This API Key is invalid." } }, 401),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(
      actions["key.info"]!({
        apiKey: "k",
        fetch: async () =>
          json({ status: { error_code: 429, error_message: "Rate limit" } }, 429, { "Retry-After": "9" }),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 9 });
    await expect(actions["key.info"]!({ apiKey: "k", fetch: async () => json("nope") })).rejects.toMatchObject({
      code: "CONNECTOR_RESPONSE_INVALID",
    });
    await expect(
      actions["key.info"]!({ apiKey: "k", fetch: async () => new Response("", { status: 200 }) }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    const bare = await actions["cryptocurrency.quotes.latest"]!({
      apiKey: "k",
      symbol: "BTC",
      fetch: async () => json([{ id: 1, symbol: "BTC" }]),
    });
    expect(bare.data).toEqual([{ id: 1, symbol: "BTC" }]);
  });
});
