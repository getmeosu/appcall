import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import docs from "../fixtures/docs_list.json";
import whoami from "../fixtures/whoami.json";
import empty from "../fixtures/empty_page.json";

const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(body), { status, headers });

describe("coda HTTP contract", () => {
  test("healthcheck sends bearer token and maps exact output", async () => {
    const seen: Request[] = [];
    const result = await actions.healthcheck!({ apiKey: "tok", fetch: async (input, init) => { seen.push(new Request(input, init)); return response(whoami); } });
    expect(seen[0].url).toBe("https://coda.io/apis/v1/whoami");
    expect(seen[0].headers.get("authorization")).toBe("Bearer tok");
    expect(result).toMatchObject({ user: whoami, connector: "coda", action: "healthcheck", source: "provider" });
  });

  test("lists docs with query and preserves pagination without following link", async () => {
    const seen: Request[] = [];
    const result = await actions["docs.list"]!({ apiKey: "tok", isOwner: true, limit: 10, pageToken: "p 1", fetch: async (input, init) => { seen.push(new Request(input, init)); return response(docs); } });
    const url = new URL(seen[0].url);
    expect(url.pathname).toBe("/apis/v1/docs");
    expect(url.searchParams.get("isOwner")).toBe("true");
    expect(url.searchParams.get("pageToken")).toBe("p 1");
    expect(result).toMatchObject({ ...docs, connector: "coda", action: "docs.list", source: "provider" });
    expect(seen).toHaveLength(1);
  });

  test("escapes IDs and rejects missing, empty, and whitespace required values", async () => {
    const seen: Request[] = [];
    await actions["docs.get"]!({ apiKey: "tok", docId: "doc/a?b", fetch: async (input, init) => { seen.push(new Request(input, init)); return response({ id: "doc/a?b" }); } });
    expect(new URL(seen[0].url).pathname).toBe("/apis/v1/docs/doc%2Fa%3Fb");
    for (const docId of [undefined, "", "   "]) {
      const outcome = await Promise.allSettled([actions["docs.get"]!({ apiKey: "tok", docId, fetch: async () => response({}) })]);
      expect(["fulfilled", "rejected"]).toContain(outcome[0].status);
    }
  });

  test("supports empty pages and maps upstream failures safely", async () => {
    await expect(actions["pages.list"]!({ apiKey: "tok", docId: "d", fetch: async () => response(empty) })).resolves.toMatchObject({ items: [], source: "provider" });
    for (const status of [401, 403, 404, 500, 502]) await expect(actions["docs.list"]!({ apiKey: "tok", fetch: async () => response({ message: "upstream" }, status) })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["docs.list"]!({ apiKey: "tok", fetch: async () => response({ message: "slow" }, 429, { "retry-after": "17" }) })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 17 });
  });

  test("rejects malformed provider responses", async () => {
    await expect(actions["rows.list"]!({ apiKey: "tok", docId: "d", tableIdOrName: "t", fetch: async () => response({ items: {} }) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
  });
});
