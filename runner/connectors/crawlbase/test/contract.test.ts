import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

describe("Crawlbase contract", () => {
  test("sends the token as a query parameter on the documented host", async () => {
    const seen: Request[] = [];
    await actions["storage.count"]!({
      apiKey: "cb_fixture",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ totalCount: 1 });
      },
    });
    expect(seen).toHaveLength(1);
    const url = new URL(seen[0].url);
    expect(seen[0].method).toBe("GET");
    expect(url.origin).toBe("https://api.crawlbase.com");
    expect(url.pathname).toBe("/storage/total_count");
    expect(url.searchParams.get("token")).toBe("cb_fixture");
    expect(seen[0].headers.get("authorization")).toBeNull();
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");
  });

  test("fixes crawling usage to one product and drops an omitted month flag", async () => {
    const seen: Request[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return response({
        totalSuccess: 1,
        totalFailed: 0,
        totalDue: 0,
        domainStats: [],
      });
    };
    await actions["account.crawlingUsage"]!({ apiKey: "cb_fixture", fetch });
    await actions["account.crawlingUsage"]!({ apiKey: "cb_fixture", includePreviousMonth: true, fetch });
    const first = new URL(seen[0].url);
    const second = new URL(seen[1].url);
    expect(first.pathname).toBe("/account");
    expect(first.searchParams.get("product")).toBe("crawling-api");
    expect(first.searchParams.get("previous_month")).toBeNull();
    expect(second.searchParams.get("previous_month")).toBe("true");
    expect(second.searchParams.get("product")).toBe("crawling-api");
    expect(seen[0].headers.get("content-type")).toBeNull();
  });

  test("keeps stored page id listing on one route", async () => {
    const seen: Request[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return response({ rids: ["RID1"], scroll_id: "cursor-1" });
    };
    await actions["storage.rids.list"]!({ apiKey: "cb_fixture", limit: 2, order: "asc", scroll: true, fetch });
    await actions["storage.rids.list"]!({ apiKey: "cb_fixture", nextCursor: "cursor/1", fetch });
    const first = new URL(seen[0].url);
    const second = new URL(seen[1].url);
    expect(first.pathname).toBe("/storage/rids");
    expect(second.pathname).toBe("/storage/rids");
    expect(first.searchParams.get("scroll")).toBe("true");
    expect(first.searchParams.get("scroll_order")).toBe("asc");
    expect(first.searchParams.get("scroll_id")).toBeNull();
    expect(second.searchParams.get("scroll")).toBeNull();
    expect(second.searchParams.get("scroll_id")).toBe("cursor/1");
    expect(seen[1].method).toBe("GET");
    expect(seen[1].headers.get("content-type")).toBeNull();
  });

  test("posts JSON only for bulk storage calls and does not delete on read", async () => {
    const seen: Request[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return response([{ rid: "RID1", url: "https://example.com/a", body: "H4sIAAAA" }]);
    };
    await actions["storage.pages.get"]!({ apiKey: "cb_fixture", rids: ["RID1"], fetch });
    await actions["storage.pages.delete"]!({
      apiKey: "cb_fixture",
      rids: ["RID1"],
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response([{ rid: "RID1", result: "Deleted", status: true }]);
      },
    });
    expect(seen[0].method).toBe("POST");
    expect(new URL(seen[0].url).pathname).toBe("/storage/bulk");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(await seen[0].text()).toBe('{"rids":["RID1"]}');
    expect(seen[1].method).toBe("POST");
    expect(new URL(seen[1].url).pathname).toBe("/storage/bulk_delete");
    expect(await seen[1].text()).toBe('{"rids":["RID1"]}');
  });

  test("rejects extra fields, empty or duplicate ids, malformed JSON, 401, and 429", async () => {
    const fetch = async () => response({ totalCount: 1 });
    await expect(actions["storage.count"]!({ apiKey: "cb_fixture", url: "https://evil.example", fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["storage.pages.get"]!({ apiKey: "cb_fixture", rids: [], fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["storage.pages.delete"]!({ apiKey: "cb_fixture", rids: ["RID1", "RID1"], fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["storage.count"]!({
      apiKey: "cb_fixture",
      fetch: async () => new Response("not-json", { status: 200, headers: { "content-type": "text/plain" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["storage.count"]!({ apiKey: "cb_fixture", fetch: async () => response({}, 401) })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    await expect(actions["storage.count"]!({
      apiKey: "cb_fixture",
      fetch: async () => response({}, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
