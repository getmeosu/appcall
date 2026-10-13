import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const chains = [
  {
    arch: "evm",
    chainId: 1,
    label: "Ethereum Mainnet",
    features: ["blockprices"],
    system: "ethereum",
    network: "main",
  },
];
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

describe("Blocknative gas platform contract", () => {
  test("sends the raw API key and does not follow a second hop", async () => {
    const seen: Request[] = [];
    const result = await actions.healthcheck!({
      apiKey: "secret",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response(chains);
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.headers.get("authorization")).toBe("secret");
    expect(seen[0]!.headers.get("accept")).toBe("application/json");
    expect(seen[0]!.headers.get("content-type")).toBeNull();
    expect(seen[0]!.method).toBe("GET");
    expect(new URL(seen[0]!.url).pathname).toBe("/chains");
    expect(await seen[0]!.text()).toBe("");
    expect(result.data).toEqual(chains);
  });

  test("repeats confidence levels and keeps system and network on one blockprices route", async () => {
    const seen: string[] = [];
    await actions["gas.prices.get"]!({
      apiKey: "secret",
      system: "story",
      network: "mainnet",
      confidenceLevels: [99, 70],
      fetch: async (input) => {
        seen.push(String(input));
        return response({ system: "story", network: "mainnet", unit: "gwei", blockPrices: [] });
      },
    });
    const url = new URL(seen[0]!);
    expect(url.pathname).toBe("/gasprices/blockprices");
    expect(url.searchParams.get("system")).toBe("story");
    expect(url.searchParams.get("network")).toBe("mainnet");
    expect(url.searchParams.get("chainid")).toBeNull();
    expect(url.searchParams.getAll("confidenceLevels")).toEqual(["99", "70"]);
  });

  test("rejects extra input, a non-array chain list, 401, and 429", async () => {
    await expect(actions["gas.prices.get"]!({ apiKey: "secret", extra: true, fetch: async () => response({}) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["gas.distribution.get"]!({ apiKey: "secret", chainid: 137, fetch: async () => response({}) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["chains.list"]!({ apiKey: "secret", fetch: async () => response({ data: {} }) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["oracles.list"]!({ apiKey: "secret", fetch: async () => response({ msg: "Unauthorized" }, 401) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["gas.basefee.estimates"]!({ apiKey: "secret", fetch: async () => response({ msg: "slow down" }, 429, { "Retry-After": "4" }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
