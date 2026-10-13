import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import coverage from "../../bing-webmaster-tools.coverage.json";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

const live = [
  "BING_WEBMASTER_TOOLS_GET_CRAWL_DIAGNOSTICS",
  "BING_WEBMASTER_TOOLS_GET_FEEDS",
  "BING_WEBMASTER_TOOLS_GET_INBOUND_LINKS",
  "BING_WEBMASTER_TOOLS_GET_PAGE_PERFORMANCE",
  "BING_WEBMASTER_TOOLS_GET_QUERY_PERFORMANCE",
  "BING_WEBMASTER_TOOLS_GET_SEARCH_PERFORMANCE",
  "BING_WEBMASTER_TOOLS_GET_SUBMISSION_QUOTAS",
  "BING_WEBMASTER_TOOLS_INSPECT_URL",
  "BING_WEBMASTER_TOOLS_LIST_CHILD_URLS",
  "BING_WEBMASTER_TOOLS_LIST_SITES",
  "BING_WEBMASTER_TOOLS_RESEARCH_KEYWORDS",
  "BING_WEBMASTER_TOOLS_SUBMIT_FEED",
  "BING_WEBMASTER_TOOLS_SUBMIT_URLS",
];

describe("Bing Webmaster Tools contract", () => {
  test("maps every live tool to one request or a missing_still reason", () => {
    const mapped = coverage.mapped.map((row: { tool: string }) => row.tool);
    const missing = coverage.missing_still.map((row: { tool: string; why: string }) => row.tool);
    expect(coverage.missing_http).toEqual([]);
    expect(coverage.composio_tools).toBe(13);
    expect([...mapped, ...missing].sort()).toEqual([...live].sort());
    expect(mapped.length + missing.length).toBe(live.length);
    for (const row of coverage.missing_still) {
      expect(row.why.length, row.tool).toBeGreaterThan(0);
      expect(manifest.operations[row.tool]).toBeUndefined();
    }
    for (const row of coverage.mapped) {
      const operation = manifest.operations[row.operation];
      expect(operation?.request?.method, row.tool).toBe(row.method);
      expect(operation?.request?.path, row.tool).toBe(row.path);
      expect(actions[row.operation], row.tool).toBeTypeOf("function");
    }
  });

  test("sends the API key as the apikey query parameter and does not follow another URL", async () => {
    const seen: { url: string; method: string; body: unknown; headers: Headers }[] = [];
    const result = await actions["sites.list"]!({
      apiKey: "fixture-api-key",
      fetch: async (input: unknown, init?: { method?: string; body?: unknown; headers?: HeadersInit }) => {
        seen.push({
          url: String(input),
          method: String(init?.method),
          body: init?.body ?? null,
          headers: new Headers(init?.headers),
        });
        return response({
          d: [{ Url: "https://example.com/", note: "https://evil.example/sites" }],
        });
      },
    });
    const url = new URL(seen[0].url);
    expect(url.hostname).toBe("ssl.bing.com");
    expect(url.pathname).toBe("/webmaster/api.svc/json/GetUserSites");
    expect(url.searchParams.get("apikey")).toBe("fixture-api-key");
    expect(seen[0].method).toBe("GET");
    expect(seen[0].body).toBeNull();
    expect(seen[0].headers.get("authorization")).toBeNull();
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(seen).toHaveLength(1);
    expect(result.data.d).toHaveLength(1);
  });

  test("posts one SubmitUrlBatch JSON body", async () => {
    const seen: { url: string; body: unknown; headers: Headers }[] = [];
    await actions["urls.submit"]!({
      apiKey: "fixture-api-key",
      site_url: "https://example.com/",
      urls: ["https://example.com/a"],
      fetch: async (input: unknown, init?: { body?: unknown; headers?: HeadersInit }) => {
        seen.push({ url: String(input), body: init?.body, headers: new Headers(init?.headers) });
        return response({ d: null });
      },
    });
    const url = new URL(seen[0].url);
    expect(url.pathname).toBe("/webmaster/api.svc/json/SubmitUrlBatch");
    expect(url.searchParams.get("apikey")).toBe("fixture-api-key");
    expect(seen[0].body).toBe('{"siteUrl":"https://example.com/","urlList":["https://example.com/a"]}');
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(seen[0].headers.get("authorization")).toBeNull();
  });

  test("drops omitted child-url filters and keeps one route", async () => {
    const seen: { url: string; body: string }[] = [];
    await actions["urls.children.list"]!({
      apiKey: "fixture-api-key",
      site_url: "https://example.com/",
      url: "https://example.com/docs",
      page_number: 0,
      fetch: async (input: unknown, init?: { body?: unknown }) => {
        seen.push({ url: String(input), body: String(init?.body) });
        return response({ d: [] });
      },
    });
    expect(new URL(seen[0].url).pathname).toBe("/webmaster/api.svc/json/GetChildrenUrlInfo");
    expect(seen[0].body).toBe(
      '{"siteUrl":"https://example.com/","url":"https://example.com/docs","page":0,"filterProperties":{"__type":"FilterProperties:#Microsoft.Bing.Webmaster.Api"}}',
    );
  });

  test("validates input, malformed output, upstream errors, and rate limits", async () => {
    await expect(actions["urls.inspect"]!({
      apiKey: "fixture-api-key",
      site_url: "",
      url: "https://example.com/docs",
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["sites.list"]!({
      apiKey: "fixture-api-key",
      fetch: async () => response([]),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["sites.list"]!({
      apiKey: "fixture-api-key",
      fetch: async () => response({ ErrorCode: 3, Message: "InvalidApiKey" }, 400),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["sites.list"]!({
      apiKey: "fixture-api-key",
      fetch: async () => response({}, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });

  test("blocks redirects instead of following them", async () => {
    await expect(actions["urls.inspect"]!({
      apiKey: "fixture-api-key",
      site_url: "https://example.com/",
      url: "https://example.com/docs",
      fetch: async () => new Response("", { status: 302, headers: { location: "https://evil.example/" } }),
    })).rejects.toMatchObject({ code: "OUTBOUND_REDIRECT_BLOCKED" });
  });
});
