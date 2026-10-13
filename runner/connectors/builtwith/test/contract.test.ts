import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

const domainBody = {
  Results: [{ Lookup: "example.com", Result: { Paths: [] } }],
  Errors: [],
};

async function capture(action: string, input: Record<string, unknown>, body: unknown = domainBody) {
  const seen: Request[] = [];
  const result = await actions[action]!({
    apiKey: "secret",
    ...input,
    fetch: async (requestInput: RequestInfo, init?: RequestInit) => {
      seen.push(new Request(requestInput, init));
      return response(body);
    },
  });
  return { seen, result };
}

describe("BuiltWith contract", () => {
  test("sends KEY on api.builtwith.com and no request body", async () => {
    const { seen } = await capture("free.lookup", { lookup: "example.com" }, { domain: "example.com", groups: [] });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("GET");
    expect(seen[0].headers.get("authorization")).toBeNull();
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(await seen[0].text()).toBe("");
    const url = new URL(seen[0].url);
    expect(url.hostname).toBe("api.builtwith.com");
    expect(url.pathname).toBe("/free1/api.json");
    expect(url.searchParams.get("KEY")).toBe("secret");
    expect(url.searchParams.get("LOOKUP")).toBe("example.com");
  });

  test("maps documented domain flags and omits the rest", async () => {
    expect(manifest.operations["domain.lookup"].inputSchema.properties).not.toHaveProperty("nolive");
    const flagged = await capture("domain.lookup", {
      lookup: "example.com,builtwith.com",
      nopii: "yes",
      trust: "yes",
      hidedl: "yes",
      noattr: "yes",
      nometa: "yes",
      hidetext: "yes",
      liveonly: "yes",
    });
    const url = new URL(flagged.seen[0].url);
    expect(url.pathname).toBe("/v26/api.json");
    expect(url.searchParams.get("LOOKUP")).toBe("example.com,builtwith.com");
    expect(url.searchParams.get("NOPII")).toBe("yes");
    expect(url.searchParams.get("TRUST")).toBe("yes");
    expect(url.searchParams.get("HIDEDL")).toBe("yes");
    expect(url.searchParams.get("NOATTR")).toBe("yes");
    expect(url.searchParams.get("NOMETA")).toBe("yes");
    expect(url.searchParams.get("HIDETEXT")).toBe("yes");
    expect(url.searchParams.get("LIVEONLY")).toBe("yes");
    expect(url.searchParams.has("NOLIVE")).toBe(false);
    const plain = await capture("domain.lookup", { lookup: "example.com" });
    const plainUrl = new URL(plain.seen[0].url);
    expect(plainUrl.searchParams.get("LOOKUP")).toBe("example.com");
    expect(plainUrl.searchParams.has("NOPII")).toBe(false);
    expect(plainUrl.searchParams.has("LIVEONLY")).toBe(false);
    await expect(actions["domain.lookup"]!({
      apiKey: "secret",
      lookup: "example.com",
      nolive: "yes",
      fetch: async () => response(domainBody),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
  });

  test("keeps the live-domain alias on one Domain API route", async () => {
    const { seen } = await capture("mcp.lookup", { domain: "example.com" });
    const url = new URL(seen[0].url);
    expect(url.hostname).toBe("api.builtwith.com");
    expect(url.pathname).toBe("/v26/api.json");
    expect(url.searchParams.get("LOOKUP")).toBe("example.com");
    expect(url.searchParams.get("LIVEONLY")).toBe("yes");
    expect(url.searchParams.get("NOPII")).toBeNull();
  });

  test("keeps social identifiers on the BuiltWith host", async () => {
    const { seen, result } = await capture(
      "social.lookup",
      { lookup: "linkedin.com/company/builtwith" },
      { Socials: [{ Name: "builtwith", Results: [{ Domain: "builtwith.com" }] }] },
    );
    const url = new URL(seen[0].url);
    expect(url.hostname).toBe("api.builtwith.com");
    expect(url.pathname).toBe("/social1/api.json");
    expect(url.searchParams.get("LOOKUP")).toBe("linkedin.com/company/builtwith");
    expect(result.data).toEqual({ Socials: [{ Name: "builtwith", Results: [{ Domain: "builtwith.com" }] }] });
  });

  test("sends lists and product query names", async () => {
    const lists = await capture("lists.get", {
      tech: "AB-Tasty",
      meta: "yes",
      country: "US,CA",
      since: "30 Days Ago",
      offset: "QWrd7gVNwFQCWb",
    }, { NextOffset: "END", Results: [] });
    const listsUrl = new URL(lists.seen[0].url);
    expect(listsUrl.pathname).toBe("/lists13/api.json");
    expect(listsUrl.searchParams.get("TECH")).toBe("AB-Tasty");
    expect(listsUrl.searchParams.get("META")).toBe("yes");
    expect(listsUrl.searchParams.get("COUNTRY")).toBe("US,CA");
    expect(listsUrl.searchParams.get("SINCE")).toBe("30 Days Ago");
    expect(listsUrl.searchParams.get("OFFSET")).toBe("QWrd7gVNwFQCWb");
    expect(listsUrl.searchParams.has("ALL")).toBe(false);
    const products = await capture("product.lookup", { query: "dom:jbhifi.com.au", page: 0, limit: 50 }, {
      query: "dom:jbhifi.com.au",
      shops: [],
    });
    const productUrl = new URL(products.seen[0].url);
    expect(productUrl.pathname).toBe("/productv1/api.json");
    expect(productUrl.searchParams.get("QUERY")).toBe("dom:jbhifi.com.au");
    expect(productUrl.searchParams.get("PAGE")).toBe("0");
    expect(productUrl.searchParams.get("LIMIT")).toBe("50");
  });

  test("wraps the recommendations array", async () => {
    const rows = [{ Domain: "example.com", Recommendations: [{ name: "Zendesk" }] }];
    const { result } = await capture("recommendations.lookup", { lookup: "example.com" }, rows);
    expect(result.data).toEqual(rows);
  });

  test("validates input, body errors, malformed output, 401 and 429", async () => {
    const fetch = async () => response(domainBody);
    await expect(actions["domain.lookup"]!({ apiKey: "secret", lookup: "", fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["lists.get"]!({ apiKey: "secret", fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["domain.lookup"]!({ apiKey: "secret", lookup: "example.com", nopii: "no", fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["product.lookup"]!({ apiKey: "secret", query: "shoes", page: "first", fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["free.lookup"]!({
      apiKey: "secret",
      lookup: "example.com",
      fetch: async () => response({ Errors: [{ Message: "Invalid key", Code: -4 }] }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["financial.lookup"]!({
      apiKey: "secret",
      lookup: "robinhood.com",
      fetch: async () => response([]),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["redirects.lookup"]!({
      apiKey: "secret",
      lookup: "example.com",
      fetch: async () => response({}, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["redirects.lookup"]!({
      apiKey: "secret",
      lookup: "example.com",
      fetch: async () => response({}, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
