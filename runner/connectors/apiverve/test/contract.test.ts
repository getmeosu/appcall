import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

describe("APIVerve contract", () => {
  test("uses the documented x-api-key header and JSON accept on a body-less GET", async () => {
    const seen: Request[] = [];
    await actions.healthcheck!({
      apiKey: "secret",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ status: "ok", error: null, data: { id: "a", advice: "Go.", lang: "en" } });
      },
    });
    expect(seen[0].method).toBe("GET");
    expect(seen[0].url).toBe("https://api.apiverve.com/v1/advice");
    expect(seen[0].headers.get("x-api-key")).toBe("secret");
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");
  });

  test("encodes airline name search on the single airlinelookup route", async () => {
    const seen: Request[] = [];
    const result = await actions["airlines.lookup-by-name"]!({
      apiKey: "secret",
      name: "American Airlines",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ status: "ok", error: null, data: [{ name: "American Airlines", iata: "AA" }] });
      },
    });
    const url = new URL(seen[0].url);
    expect(url.pathname).toBe("/v1/airlinelookup");
    expect(url.searchParams.get("name")).toBe("American Airlines");
    expect(result.data).toEqual([{ name: "American Airlines", iata: "AA" }]);
  });

  test("maps currency value, from, and to and omits an absent date", async () => {
    const seen: Request[] = [];
    await actions["currency.convert"]!({
      apiKey: "secret",
      value: 12.5,
      from: "USD",
      to: "EUR",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ status: "ok", error: null, data: { convertedValue: 10 } });
      },
    });
    const url = new URL(seen[0].url);
    expect(url.pathname).toBe("/v1/currencyconverter");
    expect(url.searchParams.get("value")).toBe("12.5");
    expect(url.searchParams.get("from")).toBe("USD");
    expect(url.searchParams.get("to")).toBe("EUR");
    expect(url.searchParams.has("date")).toBe(false);
  });

  test("rejects invalid input, malformed JSON, 401, and 429", async () => {
    await expect(actions["age.calculate"]!({ apiKey: "secret", dob: "", fetch: async () => response({}) })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(
      actions["dictionary.define"]!({ apiKey: "secret", word: "apple", extra: true, fetch: async () => response({}) }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(
      actions["advice.generate"]!({ apiKey: "secret", fetch: async () => new Response("nope", { status: 200 }) }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(
      actions.healthcheck!({ apiKey: "secret", fetch: async () => response({ error: "bad key" }, 401) }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(
      actions["weather.by-city"]!({
        apiKey: "secret",
        city: "Berlin",
        fetch: async () => response({ error: "slow" }, 429, { "Retry-After": "4" }),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
