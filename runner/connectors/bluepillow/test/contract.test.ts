import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const apiKey = "pk_anon_fixture";
const idempotency = "11111111-1111-4111-8111-111111111111";

const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

async function capture(operation: string, input: Record<string, unknown>, body: unknown = { ok: true }, status = 200, headers?: HeadersInit) {
  const seen: Request[] = [];
  const result = await actions[operation]!({
    apiKey,
    ...input,
    fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Request(url, init));
      return response(body, status, headers);
    },
  });
  return { seen, result };
}

describe("Blue Pillow read contract", () => {
  test("healthcheck uses bearer auth on the documented host and sends no body", async () => {
    const { seen, result } = await capture("healthcheck", {}, { status: "ok", version: "2026-05-08" });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("GET");
    expect(seen[0].url).toBe("https://api.b2a.bluepillow.com/v1/health");
    expect(seen[0].headers.get("authorization")).toBe("Bearer pk_anon_fixture");
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");
    expect(result).toEqual({
      connector: "bluepillow",
      action: "healthcheck",
      source: "provider",
      data: { status: "ok", version: "2026-05-08" },
    });
  });

  test("encodes the property id and sends include as one comma-separated query value", async () => {
    const { seen } = await capture("properties.get", {
      property_id: "prop/a",
      include: ["reviews_sample", "reviews_extended"],
      user_country: "US",
      language: "en",
      currency: "USD",
    });
    const url = new URL(seen[0].url);
    expect(seen[0].method).toBe("GET");
    expect(url.hostname).toBe("api.b2a.bluepillow.com");
    expect(url.pathname).toBe("/v1/properties/prop%2Fa");
    expect(url.searchParams.get("include")).toBe("reviews_sample,reviews_extended");
    expect(url.searchParams.getAll("include")).toHaveLength(1);
    expect(url.searchParams.get("user_country")).toBe("US");
    expect(url.searchParams.get("language")).toBe("en");
    expect(url.searchParams.get("currency")).toBe("USD");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");
  });

  test("maps discover, resolve, and cursor search onto one JSON body each", async () => {
    const discover = await capture("destinations.discoverNear", { latitude: 41.9, longitude: 12.48 });
    expect(discover.seen[0].method).toBe("POST");
    expect(new URL(discover.seen[0].url).pathname).toBe("/v1/destinations/discover-near");
    expect(discover.seen[0].headers.get("idempotency-key")).toBeNull();
    expect(discover.seen[0].headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(await discover.seen[0].text())).toEqual({ lat: 41.9, lon: 12.48 });

    const resolve = await capture("destinations.resolve", { name: "Rome", destination_type: "city" });
    expect(new URL(resolve.seen[0].url).pathname).toBe("/v1/destinations/resolve");
    expect(resolve.seen[0].headers.get("idempotency-key")).toBeNull();
    expect(JSON.parse(await resolve.seen[0].text())).toEqual({ name: "Rome", type: "city" });

    const search = await capture("stays.search", { idempotency_key: idempotency, next_cursor: "cur_only" });
    expect(new URL(search.seen[0].url).pathname).toBe("/v1/search/stays");
    expect(search.seen[0].headers.get("idempotency-key")).toBe(idempotency);
    expect(JSON.parse(await search.seen[0].text())).toEqual({ page: { cursor: "cur_only" } });
  });

  test("validates input, malformed output, 401 and 429", async () => {
    await expect(actions["properties.get"]!({
      apiKey,
      property_id: "",
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["destinations.discoverNear"]!({
      apiKey,
      latitude: 91,
      longitude: 12,
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["healthcheck"]!({
      apiKey,
      fetch: async () => response([]),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["healthcheck"]!({
      apiKey,
      fetch: async () => response({}, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["healthcheck"]!({
      apiKey,
      fetch: async () => response({}, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
