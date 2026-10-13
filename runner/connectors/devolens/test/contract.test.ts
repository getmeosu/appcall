import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const token = "fixture-access-token";
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });
const envelope = (extra: Record<string, unknown>) => ({ result: 0, message: null, ...extra });

describe("Devolens Cryptolens contract", () => {
  test("sends the access token as a query parameter and does not follow links", async () => {
    const seen: Request[] = [];
    const result = await actions["products.list"]!({
      token,
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({
          products: [{ id: 3349, name: "Example", password: "hidden-product-password", Password: "also-hidden" }],
          result: 0,
          message: null,
          next: "https://evil.example/more",
        });
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("GET");
    expect(seen[0].body).toBeNull();
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(seen[0].headers.get("authorization")).toBeNull();
    expect(seen[0].headers.get("content-type")).toBeNull();
    const url = new URL(seen[0].url);
    expect(url.host).toBe("api.cryptolens.io");
    expect(url.pathname).toBe("/api/product/GetProducts");
    expect(url.searchParams.get("token")).toBe(token);
    expect([...url.searchParams.keys()]).toEqual(["token"]);
    expect(result.data.products[0].password).toBeUndefined();
    expect(result.data.products[0].Password).toBeUndefined();
    expect(result.data.products[0].name).toBe("Example");
  });

  test("keeps the license key in the query and requests metadata without signing", async () => {
    const seen: Request[] = [];
    await actions["license-key.get"]!({
      token,
      productId: 3349,
      licenseKey: "AA/../BB",
      includeMetadata: true,
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response(envelope({
          licenseKey: { key: "AA/../BB", productId: 3349 },
          metadata: { activatedMachines: 1 },
        }));
      },
    });
    const url = new URL(seen[0].url);
    expect(url.pathname).toBe("/api/key/GetKey");
    expect(url.searchParams.get("ProductId")).toBe("3349");
    expect(url.searchParams.get("Key")).toBe("AA/../BB");
    expect(url.searchParams.get("Metadata")).toBe("true");
    expect(url.searchParams.get("Sign")).toBeNull();
    expect(url.searchParams.has("url")).toBe(false);
  });

  test("omits unset customer filters and encodes a license-key page", async () => {
    const seen: Request[] = [];
    const fetch = async (input: unknown, init: { method?: string; headers?: HeadersInit; body?: unknown }) => {
      seen.push(new Request(input, init));
      return response(envelope({
        customers: [],
        resellerCustomers: [],
        visibleCustomers: [],
        licenseKeys: [],
        returned: 0,
        total: 0,
        pageCount: 1,
      }));
    };
    await actions["customers.list"]!({ token, search: "Ada", fetch });
    const customers = new URL(seen[0].url);
    expect([...customers.searchParams.keys()].sort()).toEqual(["Search", "token"]);
    expect(customers.searchParams.get("Search")).toBe("Ada");
    await actions["license-keys.list"]!({
      token,
      productId: 3349,
      nextCursor: 1,
      searchQuery: "key.contains(\"ITVBC\")",
      fetch,
    });
    const keys = new URL(seen[1].url);
    expect(keys.pathname).toBe("/api/product/GetKeys");
    expect(keys.searchParams.get("Page")).toBe("1");
    expect(keys.searchParams.get("SearchQuery")).toBe("key.contains(\"ITVBC\")");
    expect(keys.searchParams.has("OrderBy")).toBe(false);
  });

  test("sends log state codes and the time filter as one JSON query value each", async () => {
    const seen: Request[] = [];
    await actions["web-api-logs.list"]!({
      token,
      productId: 3349,
      licenseKey: "AAAA-BBBB-CCCC-DDDD",
      eventTypes: [3010, 2010],
      timeFilter: { gt: 1742208215, lte: 1742294615 },
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response(envelope({ logs: [{ id: 126, state: 3010 }] }));
      },
    });
    const url = new URL(seen[0].url);
    expect(url.pathname).toBe("/api/ai/GetWebAPILog");
    expect(url.searchParams.get("States")).toBe("[3010,2010]");
    expect(url.searchParams.get("Time")).toBe("{\"gt\":1742208215,\"lte\":1742294615}");
    expect(url.searchParams.getAll("States")).toHaveLength(1);
    expect(url.searchParams.get("Key")).toBe("AAAA-BBBB-CCCC-DDDD");
    expect(url.searchParams.get("ProductId")).toBe("3349");
  });

  test("treats an empty success message as success and a provider message as an error", async () => {
    const ok = await actions["messages.list"]!({
      token,
      fetch: async () => response({ messages: [{ id: 13, channel: "stable", content: "v401", created: 1537815312 }], result: 0, message: "" }),
    });
    expect(ok.data.messages).toHaveLength(1);
    await expect(actions["products.list"]!({
      token,
      fetch: async () => response({ products: [], result: 1, message: "Access denied." }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("rejects a free-form URL, a bad page, combined reseller filters, a key without a product, malformed JSON, 401, and 429", async () => {
    const fetch = async () => response(envelope({ products: [], logs: [] }));
    await expect(actions["products.list"]!({
      token,
      url: "https://evil.example",
      fetch,
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["license-keys.list"]!({
      token,
      productId: 3349,
      nextCursor: 0,
      fetch,
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["usage.daily-aggregates.list"]!({
      token,
      limit: 1001,
      fetch,
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["resellers.list"]!({
      token,
      search: "Test",
      resellerId: 7,
      fetch,
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["web-api-logs.list"]!({
      token,
      licenseKey: "AAAA-BBBB-CCCC-DDDD",
      fetch,
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["products.list"]!({
      token,
      fetch: async () => new Response("not-json", { status: 200, headers: { "content-type": "application/json" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["products.list"]!({
      token,
      fetch: async () => response([], 200),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["products.list"]!({
      token,
      fetch: async () => response({ message: "no" }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["products.list"]!({
      token,
      fetch: async () => response({ message: "slow" }, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
