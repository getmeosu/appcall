import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import coverage from "../../charla.coverage.json";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, any>>;
const { actions } = compileDeclarativeConnector(manifest as never);
const liveTools = [
  "CHARLA_CREATE_KB_ARTICLE",
  "CHARLA_DELETE_KB_ARTICLE",
  "CHARLA_GET_CONTACT",
  "CHARLA_GET_KB_ARTICLE",
  "CHARLA_LIST_CONTACTS",
  "CHARLA_LIST_CONVERSATIONS",
  "CHARLA_LIST_KB_ARTICLES",
  "CHARLA_LIST_KB_CATEGORIES",
  "CHARLA_UPDATE_KB_ARTICLE",
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const article = {
  id: 43525,
  title: "How to use Charla API",
  slug: "how-to-use-charla-api",
  description: "A guide to using Charla.",
  article: "<p>Full article content here.</p>",
  categories: [{ id: 1, name: "General" }],
  status: "Published",
  visibility: "Public",
};

describe("Charla contract", () => {
  test("maps every live tool to one request or a single-route gap", () => {
    const mapped = coverage.mapped.map((row) => row.tool);
    const missing = coverage.missing_still.map((row) => row.tool);
    expect(coverage.missing_http).toEqual([]);
    expect([...mapped, ...missing].sort()).toEqual([...liveTools].sort());
    expect(mapped.length + missing.length).toBe(liveTools.length);
    expect(coverage.missing_still).toEqual([
      {
        tool: "CHARLA_DELETE_KB_ARTICLE",
        why: "Official DELETE /kb/article/{id} is HTTP 200 with no response schema, so success may be an empty body.",
      },
    ]);
    for (const row of coverage.mapped) {
      const operation = operations[row.operation];
      expect(operation.request.method, row.tool).toBe(row.method);
      expect(operation.request.path, row.tool).toBe(row.path);
      expect(operation.request.success, row.tool).toEqual([200]);
      expect(typeof actions[row.operation], row.tool).toBe("function");
    }
  });

  test("keeps JSON bounds, body-less reads, and X-Api-Key auth", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.charla.com"]);
    expect(manifest.http.baseUrl).toBe("https://api.charla.com/v1");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "X-Api-Key",
      value: "{{apiKey}}",
    });
    for (const [name, operation] of Object.entries(operations)) {
      expect(operation.kind, name).toBe("action");
      expect(typeof operation.title, name).toBe("string");
      expect(typeof operation.description, name).toBe("string");
      expect(operation.inputSchema.type, name).toBe("object");
      expect(operation.outputSchema.type, name).toBe("object");
      expect(operation.responseFormat, name).toBe("json");
      expect(operation.maxResponseBytes, name).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect(operation.maxInputBytes, name).toBeLessThanOrEqual(26214400);
      expect(operation.timeoutMs, name).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs, name).toBeLessThanOrEqual(300000);
      const method = operation.request.method;
      expect(method === "GET" || method === "POST", name).toBe(true);
      if (method === "GET" || method === "DELETE") {
        expect(operation.request.body, name).toBeUndefined();
        expect(operation.request.headers?.["Content-Type"], name).toBeUndefined();
      } else {
        expect(operation.request.headers?.["Content-Type"], name).toBe("application/json");
        expect(typeof operation.request.body, name).toBe("object");
      }
    }
  });

  test("sends X-Api-Key, omits an empty cursor, and encodes ids", async () => {
    const seen: Request[] = [];
    const capture = async (input: string | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return json({ data: [], paging: { total: 0, next_cursor: null, has_next: false } });
    };
    await actions["contacts.list"]!({ apiKey: "secret", fetch: capture });
    expect(seen[0].headers.get("x-api-key")).toBe("secret");
    expect(seen[0].headers.get("authorization")).toBeNull();
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(new URL(seen[0].url).search).toBe("");
    expect(await seen[0].text()).toBe("");

    seen.length = 0;
    await actions["contacts.list"]!({
      apiKey: "secret",
      cursor: 1757765348,
      fetch: capture,
    });
    expect(new URL(seen[0].url).href).toBe("https://api.charla.com/v1/contacts?cursor=1757765348");

    seen.length = 0;
    await actions["kb.articles.list"]!({
      apiKey: "secret",
      cursor: "NjM4OTMzNjA5NDgxMjMwMDAwXzQzNTI1",
      fetch: async (input: string | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return json({ data: [], paging: { total: 0, next_cursor: null, has_next: false } });
      },
    });
    expect(new URL(seen[0].url).href).toBe(
      "https://api.charla.com/v1/kb/articles?cursor=NjM4OTMzNjA5NDgxMjMwMDAwXzQzNTI1",
    );

    seen.length = 0;
    await actions["contacts.get"]!({
      apiKey: "secret",
      contactId: "a9b259f5-3c3c-471e-86c7-3e69b3d83d25",
      fetch: async (input: string | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return json({ id: "a9b259f5-3c3c-471e-86c7-3e69b3d83d25" });
      },
    });
    expect(new URL(seen[0].url).pathname).toBe("/v1/contacts/a9b259f5-3c3c-471e-86c7-3e69b3d83d25");

    seen.length = 0;
    await actions["kb.articles.create"]!({
      apiKey: "secret",
      categories: [{ id: 1 }],
      status: "Draft",
      visibility: "Private",
      fetch: async (input: string | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return json(article);
      },
    });
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(await seen[0].text()).toBe('{"categories":[{"id":1}],"status":"Draft","visibility":"Private"}');

    seen.length = 0;
    await actions["kb.articles.update"]!({
      apiKey: "secret",
      articleId: 43525,
      title: "How to use Charla API",
      status: "Published",
      visibility: "Public",
      description: "",
      categories: [{ id: 1 }],
      contentHtml: "<p>Full article content here.</p>",
      fetch: async (input: string | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return json({ ...article, description: "" });
      },
    });
    expect(await seen[0].text()).toBe(
      '{"id":43525,"title":"How to use Charla API","description":"","article":"<p>Full article content here.</p>","categories":[{"id":1}],"status":"Published","visibility":"Public"}',
    );
  });

  test("rejects bad input, dot segments, malformed JSON, and upstream errors", async () => {
    const fetch = async () => json({});
    await expect(actions["kb.articles.create"]!({
      apiKey: "secret",
      categories: [{ id: 1 }],
      visibility: "Private",
      fetch,
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["contacts.list"]!({ apiKey: "secret", extra: true, fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["contacts.get"]!({ apiKey: "secret", contactId: "..", fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["contacts.list"]!({ apiKey: "secret", cursor: "1757765348", fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["kb.articles.create"]!({
      apiKey: "secret",
      categories: [1],
      status: "Draft",
      visibility: "Private",
      fetch,
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["kb.articles.get"]!({
      apiKey: "secret",
      articleId: 43525,
      fetch: async () => new Response("not-json", { status: 200, headers: { "content-type": "application/json" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["kb.articles.get"]!({
      apiKey: "secret",
      articleId: 43525,
      fetch: async () => new Response("", { status: 200, headers: { "content-type": "application/json" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["contacts.list"]!({
      apiKey: "secret",
      fetch: async () => json({ message: "Unauthorized" }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["contacts.list"]!({
      apiKey: "secret",
      fetch: async () => json({ message: "Slow down" }, 429),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });

  test("wraps the categories JSON array under data", async () => {
    const result = await actions["kb.categories.list"]!({
      apiKey: "secret",
      fetch: async () => json([{ id: 1, name: "Using Chatrla", parent: null }]),
    });
    expect(result.data).toEqual([{ id: 1, name: "Using Chatrla", parent: null }]);
  });
});
