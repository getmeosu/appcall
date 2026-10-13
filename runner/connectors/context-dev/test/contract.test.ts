import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import coverage from "../../context-dev.coverage.json";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, any>>;
const { actions } = compileDeclarativeConnector(manifest);
const liveTools = [
  "CONTEXT_DEV_EXTRACT_STRUCTURED_WEB_DATA",
  "CONTEXT_DEV_GET_BRAND",
  "CONTEXT_DEV_GET_MONITOR_LIMITS",
  "CONTEXT_DEV_GET_WEBDB_USAGE",
  "CONTEXT_DEV_GET_WEBSITE_STYLEGUIDE",
  "CONTEXT_DEV_LIST_BATCHES",
  "CONTEXT_DEV_LIST_MONITORS",
  "CONTEXT_DEV_LIST_WEBDB_COLLECTIONS",
  "CONTEXT_DEV_PARSE_FILE",
  "CONTEXT_DEV_SCRAPE_WEBPAGE_MARKDOWN",
  "CONTEXT_DEV_SEARCH_BRANDS",
];

const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("Context.dev contract", () => {
  test("maps every live tool to one request or a non-HTTP gap", () => {
    const mapped = coverage.mapped.map((row) => row.tool);
    const missing = coverage.missing_still.map((row) => row.tool);
    expect(coverage.missing_http).toEqual([]);
    expect(coverage.composio_tools).toBe(liveTools.length);
    expect(coverage.index_tools).toBe(11);
    expect([...mapped, ...missing].sort()).toEqual([...liveTools].sort());
    expect(mapped.length + missing.length).toBe(liveTools.length);
    for (const row of coverage.missing_still) {
      expect(row.why.length).toBeGreaterThan(0);
      expect(row.why.includes("\n")).toBe(false);
    }
    for (const row of coverage.mapped) {
      const operation = operations[row.operation];
      expect(operation.request.method, row.tool).toBe(row.method);
      expect(operation.request.path, row.tool).toBe(row.path);
      expect(typeof actions[row.operation], row.tool).toBe("function");
    }
  });

  test("keeps bearer auth, one host, and JSON bounds", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.context.dev"]);
    expect(manifest.http.baseUrl).toBe("https://api.context.dev/v1");
    expect(manifest.http.baseUrl.includes("{{")).toBe(false);
    expect(manifest.auth.setup.fields.map((field) => field.key)).toEqual(["apiKey"]);
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "Bearer {{apiKey}}",
    });
    for (const [name, operation] of Object.entries(operations)) {
      expect(operation.kind, name).toBe("action");
      expect(operation.sideEffect, name).toBe("read");
      expect(typeof operation.title, name).toBe("string");
      expect(typeof operation.description, name).toBe("string");
      expect(operation.inputSchema.type, name).toBe("object");
      expect(operation.outputSchema.type, name).toBe("object");
      expect(operation.responseFormat, name).toBe("json");
      expect(operation.maxResponseBytes, name).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect(operation.maxInputBytes, name).toBeLessThanOrEqual(26214400);
      expect(operation.timeoutMs, name).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs, name).toBeLessThanOrEqual(300000);
      expect(operation.request.bodyEncoding, name).toBeUndefined();
      const method = operation.request.method;
      if (method === "GET" || method === "DELETE") {
        expect(operation.request.body, name).toBeUndefined();
        expect(operation.request.headers?.["Content-Type"], name).toBeUndefined();
      } else {
        expect(operation.request.headers?.["Content-Type"], name).toBe("application/json");
        expect(typeof operation.request.body, name).toBe("object");
      }
    }
  });

  test("sends bearer auth and locks markdown to one JSON route", async () => {
    const seen: { url?: string; headers?: Record<string, string>; body?: string }[] = [];
    const fetch = async (url: string | URL, init?: RequestInit) => {
      seen.push({
        url: String(url),
        headers: init?.headers as Record<string, string>,
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      return json({ monitors_used: 0, monitors_limit: 1, plan: "free", request_id: "req" });
    };
    await actions["monitors.limits"]!({ apiKey: "secret", fetch });
    expect(seen[0].headers?.Authorization).toBe("Bearer secret");
    expect(new URL(seen[0].url!).hostname).toBe("api.context.dev");
    expect(seen[0].body).toBeUndefined();

    seen.length = 0;
    const scrapeFetch = async (url: string | URL, init?: RequestInit) => {
      seen.push({ url: String(url), body: typeof init?.body === "string" ? init.body : undefined });
      return json({
        url: "https://example.com/",
        markdown: { requested: true, success: true, data: "# Example" },
        request_id: "req",
      });
    };
    await actions["web.scrapeMarkdown"]!({ apiKey: "secret", url: "https://example.com", fetch: scrapeFetch });
    const body = JSON.parse(seen[0].body!);
    expect(new URL(seen[0].url!).pathname).toBe("/v1/web/scrape");
    expect(body.formats).toEqual({ markdown: true });
    expect(body.url).toBe("https://example.com");
  });

  test("rejects a second brand identifier, a missing styleguide target, bad output, 401, and 429", async () => {
    const fetch = async () => json({});
    await expect(
      actions["brand.retrieve"]!({ apiKey: "secret", type: "by_domain", domain: "stripe.com", name: "Stripe", fetch }),
    ).rejects.toThrow("exactly one");
    await expect(actions["web.styleguide"]!({ apiKey: "secret", fetch })).rejects.toThrow("exactly one");
    await expect(
      actions["monitors.limits"]!({ apiKey: "secret", fetch: async () => json([]) }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(
      actions["monitors.limits"]!({ apiKey: "secret", fetch: async () => json({ message: "no" }, 401) }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(
      actions["monitors.limits"]!({
        apiKey: "secret",
        fetch: async () => json({}, 429, { "Retry-After": "4" }),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
