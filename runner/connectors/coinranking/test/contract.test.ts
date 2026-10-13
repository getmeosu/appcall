import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

const ok = { status: "success", data: { coin: { uuid: "Qwsogvtv82FCd", symbol: "BTC" } } };

describe("Coinranking contract", () => {
  test("uses x-access-token on the fixed API host", async () => {
    const seen: Request[] = [];
    await actions["coins.list"]!({
      apiKey: "secret",
      limit: 2,
      timePeriod: "24h",
      tiers: ["1", "2"],
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ status: "success", data: { stats: { total: 0 }, coins: [] } });
      },
    });
    const url = new URL(seen[0].url);
    expect(url.hostname).toBe("api.coinranking.com");
    expect(url.pathname).toBe("/v2/coins");
    expect(url.searchParams.get("limit")).toBe("2");
    expect(url.searchParams.get("timePeriod")).toBe("24h");
    expect(url.searchParams.getAll("tiers[]")).toEqual(["1", "2"]);
    expect(seen[0].headers.get("x-access-token")).toBe("secret");
    expect(seen[0].headers.get("authorization")).toBeNull();
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(seen[0].method).toBe("GET");
    expect(await seen[0].text()).toBe("");
  });

  test("keeps a coin UUID in one path segment and does not follow another host", async () => {
    const seen: Request[] = [];
    await actions["coins.get"]!({
      apiKey: "secret",
      uuid: "https://evil.example/coin",
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response(ok);
      },
    });
    const url = new URL(seen[0].url);
    expect(url.hostname).toBe("api.coinranking.com");
    expect(url.pathname).toBe("/v2/coin/https%3A%2F%2Fevil.example%2Fcoin");
    expect(seen).toHaveLength(1);
  });

  test("sends repeated uuid filters and no body on selected-coin stats", async () => {
    const seen: Request[] = [];
    await actions["stats.coins"]!({
      apiKey: "secret",
      uuids: ["Qwsogvtv82FCd", "razxDUgYGNAdQ"],
      tag: "defi",
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ status: "success", data: { stats: { numberOfCoins: 2 } } });
      },
    });
    const url = new URL(seen[0].url);
    expect(url.pathname).toBe("/v2/stats/coins");
    expect(url.searchParams.getAll("uuids[]")).toEqual(["Qwsogvtv82FCd", "razxDUgYGNAdQ"]);
    expect(url.searchParams.get("tag")).toBe("defi");
    expect(seen[0].method).toBe("GET");
    expect(seen[0].headers.get("content-type")).toBeNull();
  });

  test("validates input, malformed output, 401 and 429", async () => {
    const fetch = async () => response({});
    await expect(actions["coins.get"]!({ apiKey: "secret", uuid: "", fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["coins.get"]!({ apiKey: "secret", uuid: "..", fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["coins.list"]!({ apiKey: "secret", baseUrl: "https://evil.example", fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["search.suggestions"]!({ apiKey: "secret", fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["coins.price"]!({ apiKey: "secret", uuid: "Qwsogvtv82FCd", fetch: async () => response({ status: "success", data: [] }) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["coins.price"]!({ apiKey: "secret", uuid: "Qwsogvtv82FCd", fetch: async () => response({}, 401) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["coins.price"]!({ apiKey: "secret", uuid: "Qwsogvtv82FCd", fetch: async () => response({}, 429, { "Retry-After": "4" }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
