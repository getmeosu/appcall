import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const auth = { accountUsername: "fixture-user", apiPassword: "fixture-api-password" };
const basic = `Basic ${Buffer.from(`${auth.accountUsername}:${auth.apiPassword}`, "utf8").toString("base64")}`;

const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

async function capture(
  operation: string,
  input: Record<string, unknown>,
  body: unknown = { ok: true },
  status = 200,
  headers?: HeadersInit,
) {
  const seen: Request[] = [];
  const result = await actions[operation]!({
    ...auth,
    ...input,
    fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Request(url, init));
      return response(body, status, headers);
    },
  });
  return { seen, result };
}

describe("DPD read contract", () => {
  test("ping uses basic auth on the documented host and sends no body", async () => {
    const { seen, result } = await capture("ping", {}, { status: "SUCCESS" });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("GET");
    expect(seen[0].url).toBe("https://api.getdpd.com/v2/");
    expect(new URL(seen[0].url).hostname).toBe("api.getdpd.com");
    expect(seen[0].headers.get("authorization")).toBe(basic);
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");
    expect(result).toEqual({
      connector: "dpd2",
      action: "ping",
      source: "provider",
      data: { status: "SUCCESS" },
    });
  });

  test("encodes one subscriber route and keeps email off the query name", async () => {
    const listed = await capture(
      "subscribers.list",
      { storefront_id: 7, email: "a/b@example.com", page: 2 },
      [{ id: 1, username: "a/b@example.com" }],
    );
    const url = new URL(listed.seen[0].url);
    expect(listed.seen[0].method).toBe("GET");
    expect(url.hostname).toBe("api.getdpd.com");
    expect(url.pathname).toBe("/v2/storefronts/7/subscribers");
    expect(url.searchParams.get("username")).toBe("a/b@example.com");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("email")).toBeNull();
    expect(url.searchParams.get("per_page")).toBeNull();
    expect(listed.seen[0].headers.get("content-type")).toBeNull();
    expect(await listed.seen[0].text()).toBe("");
    expect(listed.result.data).toEqual([{ id: 1, username: "a/b@example.com" }]);

    const verified = await capture("subscribers.verify", { storefront_id: 7, id: 5 }, { status: "ACTIVE" });
    const verifyUrl = new URL(verified.seen[0].url);
    expect(verifyUrl.pathname).toBe("/v2/storefronts/7/subscribers/verify");
    expect(verifyUrl.searchParams.get("id")).toBe("5");
    expect(verifyUrl.searchParams.has("username")).toBe(false);
    expect(verified.seen[0].headers.get("content-type")).toBeNull();
  });

  test("maps purchase since and until onto date_min and date_max", async () => {
    const { seen } = await capture("purchases.list", {
      since: "2024-01-01",
      until: "yesterday",
      page: 2,
      status: "ACT",
      ship: false,
    });
    const url = new URL(seen[0].url);
    expect(seen[0].method).toBe("GET");
    expect(url.pathname).toBe("/v2/purchases");
    expect(url.searchParams.get("date_min")).toBe("2024-01-01");
    expect(url.searchParams.get("date_max")).toBe("yesterday");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("status")).toBe("ACT");
    expect(url.searchParams.get("ship")).toBe("false");
    expect(url.searchParams.has("since")).toBe(false);
    expect(url.searchParams.has("until")).toBe(false);
    expect(url.searchParams.has("limit")).toBe(false);
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");
  });

  test("keeps a false newsletter filter and accepts the end-of-pages object", async () => {
    const { seen, result } = await capture(
      "customers.list",
      { email: "ada@example.com", receives_newsletters: false, page: 3 },
      { status: "NOTFOUND" },
    );
    const url = new URL(seen[0].url);
    expect(url.pathname).toBe("/v2/customers");
    expect(url.searchParams.get("email")).toBe("ada@example.com");
    expect(url.searchParams.get("receives_newsletters")).toBe("false");
    expect(url.searchParams.get("page")).toBe("3");
    expect(url.searchParams.has("per_page")).toBe(false);
    expect(result.data).toEqual({ status: "NOTFOUND" });
  });

  test("rejects a free-form URL, a bad id, and a verify call with no selector before fetch", async () => {
    const fetch = async () => {
      throw new Error("fetch should not run");
    };
    await expect(actions["storefronts.get"]!({ ...auth, id: "42", fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["storefronts.get"]!({ ...auth, id: 42, url: "https://evil.example", fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["subscribers.verify"]!({ ...auth, storefront_id: 1, fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions.ping!({ accountUsername: "user:name", apiPassword: "pw", fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions.ping!({ apiPassword: "pw", fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    const echo = await actions.ping!({ accountUsername: "fixture-user" });
    expect(echo).toMatchObject({ connector: "dpd2", action: "ping", source: "connector" });
  });

  test("rejects invalid JSON, a non-object list item, 401, and 429", async () => {
    await expect(actions.ping!({
      ...auth,
      fetch: async () => new Response("VERIFIED", { status: 200, headers: { "content-type": "text/plain" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["storefronts.list"]!({ ...auth, fetch: async () => response([1]) })).rejects.toMatchObject({
      code: "CONNECTOR_RESPONSE_INVALID",
    });
    await expect(actions.ping!({ ...auth, fetch: async () => response({ error: "no" }, 401) })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    await expect(actions.ping!({
      ...auth,
      fetch: async () => response({}, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
