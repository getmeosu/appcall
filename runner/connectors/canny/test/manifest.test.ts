import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import COMPOSIO_TOOLS from "./composio-cover.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "boards.list", "boards.get", "posts.list", "posts.get"] as const;
const READ_OPS = new Set([
  "healthcheck",
  "boards.list",
  "boards.get",
  "posts.list",
  "posts.get",
  "categories.list",
  "comments.list",
  "companies.list",
  "opportunities.list",
  "tags.list",
  "tags.get",
  "users.list",
  "users.get",
  "votes.list",
]);
const DESTRUCTIVE_OPS = new Set(["comments.delete", "posts.delete", "users.delete", "votes.delete"]);

const compiled = compileDeclarativeConnector(manifest as never);

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}

function dummyInput(schema: { properties?: Record<string, any>; required?: string[] }): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const key of schema.required ?? []) {
    const prop = schema.properties?.[key] ?? {};
    if (Array.isArray(prop.enum) && prop.enum.length > 0) input[key] = prop.enum[0];
    else if (prop.type === "integer" || prop.type === "number") input[key] = 1;
    else if (prop.type === "boolean") input[key] = true;
    else if (prop.type === "array") {
      const items = prop.items ?? {};
      if (items.type === "integer" || items.type === "number") input[key] = [1];
      else if (items.type === "object") input[key] = [dummyInput(items)];
      else input[key] = ["x"];
    } else if (prop.type === "object") input[key] = { id: "x" };
    else input[key] = key.toLowerCase().includes("email") ? "user@example.com" : "x";
  }
  return input;
}

function sameUrl(a: string, b: string): boolean {
  const x = new URL(a);
  const y = new URL(b);
  if (x.protocol !== y.protocol || x.host !== y.host || x.pathname !== y.pathname) return false;
  const q = (u: URL) => [...u.searchParams.entries()].sort((l, r) => l[0].localeCompare(r[0]) || l[1].localeCompare(r[1]));
  return JSON.stringify(q(x)) === JSON.stringify(q(y));
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ak = Object.keys(a as object);
    const bk = Object.keys(b as object);
    return ak.length === bk.length && ak.every((k) => Object.hasOwn(b as object, k) && deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

describe("canny manifest", () => {
  test("has bounded host, origin auth, version, and compiles", () => {
    expect(manifest.key).toBe("canny");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["productivity", "dev-tools"]);
    expect(manifest.network.allowedHosts).toEqual(["canny.io"]);
    expect(manifest.http.baseUrl).toBe("https://canny.io/api");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.in).toBe("body");
    expect(manifest.http.auth.name).toBe("apiKey");
    expect(manifest.http.auth.value).toBe("{{apiKey}}");
    expect(manifest.http.headers).toEqual({ Accept: "application/json", "Content-Type": "application/json" });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin five operations", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(requestOf(key).method, key).toBe("POST");
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "POST", path: "/v1/boards/list" });
    expect(requestOf("boards.list").path).toBe("/v1/boards/list");
    expect(requestOf("boards.get").path).toBe("/v1/boards/retrieve");
    expect(requestOf("posts.list").path).toBe("/v1/posts/list");
    expect(requestOf("posts.get").path).toBe("/v1/posts/retrieve");
    expect((operations["boards.get"]!.inputSchema as { required: string[] }).required).toEqual(["boardId"]);
    expect((operations["posts.get"]!.inputSchema as { required: string[] }).required).toEqual(["postId"]);
    expect((requestOf("boards.get").body as Record<string, string>).id).toBe("{{boardId}}");
    expect((requestOf("posts.get").body as Record<string, string>).id).toBe("{{postId}}");
    expect((requestOf("posts.list").body as Record<string, string>).boardID).toBe("{{boardId}}");
  });

  test("covers every Composio Canny tool with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(25);
    expect(Object.keys(operations).length).toBe(27);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      expect(requestOf(key), slug).toBeDefined();
      expect(compiled.actions[key], slug).toBeTypeOf("function");
    }
    expect(operations.healthcheck).toBeDefined();
    expect(operations["posts.get"]).toBeDefined();
  });

  test("gives every action a real request, title, description, and object inputSchema", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(["read", "write", "destructive"], key).toContain(operation.sideEffect);
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      const request = operation.request as Record<string, unknown>;
      expect(request.method, key).toBe("POST");
      expect(typeof request.path, key).toBe("string");
      expect(String(request.path).startsWith("/v"), key).toBe(true);
      expect(request.body, `${key} must send JSON with apiKey`).toBeDefined();
      expect((request.body as Record<string, string>).apiKey, key).toBe("{{apiKey}}");
    }
  });

  test("classifies Canny POST list/retrieve as read and deletes as destructive", () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (DESTRUCTIVE_OPS.has(key)) expect(operation.sideEffect, key).toBe("destructive");
      else if (READ_OPS.has(key)) expect(operation.sideEffect, key).toBe("read");
      else expect(operation.sideEffect, key).toBe("write");
    }
  });

  test("maps documented Canny paths and Composio aliases", () => {
    expect(requestOf("posts.create").path).toBe("/v1/posts/create");
    expect(requestOf("posts.update").path).toBe("/v1/posts/update");
    expect(requestOf("posts.delete").path).toBe("/v1/posts/delete");
    expect(requestOf("posts.add_tag").path).toBe("/v1/posts/add_tag");
    expect(requestOf("posts.change_status").path).toBe("/v1/posts/change_status");
    expect(requestOf("comments.create").path).toBe("/v1/comments/create");
    expect(requestOf("comments.list").path).toBe("/v2/comments/list");
    expect(requestOf("comments.delete").path).toBe("/v1/comments/delete");
    expect(requestOf("companies.list").path).toBe("/v2/companies/list");
    expect(requestOf("users.list").path).toBe("/v2/users/list");
    expect(requestOf("users.get").path).toBe("/v1/users/retrieve");
    expect(requestOf("users.create_or_update").path).toBe("/v1/users/create_or_update");
    expect(requestOf("users.delete").path).toBe("/v1/users/delete");
    expect(requestOf("votes.list").path).toBe("/v2/votes/list");
    expect(requestOf("votes.create").path).toBe("/v1/votes/create");
    expect(requestOf("votes.delete").path).toBe("/v1/votes/delete");
    expect(requestOf("tags.create").path).toBe("/v1/tags/create");
    expect(requestOf("tags.list").path).toBe("/v1/tags/list");
    expect(requestOf("tags.get").path).toBe("/v1/tags/retrieve");
    expect(requestOf("categories.list").path).toBe("/v1/categories/list");
    expect(requestOf("opportunities.list").path).toBe("/v1/opportunities/list");
    expect(requestOf("entries.create").path).toBe("/v1/entries/create");
    expect((requestOf("votes.list").body as Record<string, string>).userID).toBe("{{voterID}}");
    expect((requestOf("posts.list").body as Record<string, string>).authorID).toBe("{{authorID}}");
    expect((requestOf("posts.list").body as Record<string, string>).search).toBe("{{search}}");
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/canny/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.2.0");
  });
});

describe("canny compiled handlers", () => {
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  async function invoke(key: string, input: Record<string, unknown>, respond: (request: Request) => Promise<Response> | Response) {
    const requests: Request[] = [];
    const result = await compiled.actions[key]!({
      apiKey: "dummy",
      ...input,
      fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(url, init);
        requests.push(request);
        return respond(request);
      },
    });
    return { requests, result };
  }

  function dummyResponse(key: string, operation: Record<string, unknown>): unknown {
    const request = operation.request as { result?: unknown };
    if (key === "healthcheck" || key === "boards.list") return { boards: [] };
    if (key === "posts.list") return { posts: [], hasMore: false };
    if (request.result !== undefined && typeof request.result === "object" && request.result !== null && Object.prototype.hasOwnProperty.call(request.result, "success")) {
      return "success";
    }
    if (key === "boards.get" || key === "posts.get") return { id: "x" };
    return { id: "x" };
  }

  test("every operation dispatches a real HTTP request for required input", async () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as { method: string; path: string; success?: number[] };
      const input = dummyInput(operation.inputSchema as { properties?: Record<string, any>; required?: string[] });
      const { requests, result } = await invoke(key, input, () => jsonResponse(dummyResponse(key, operation), request.success?.[0] ?? 200));
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe("POST");
      expect(new URL(requests[0]!.url).hostname, key).toBe("canny.io");
      expect(new URL(requests[0]!.url).pathname.startsWith("/api/v"), key).toBe(true);
      expect(requests[0]!.headers.get("authorization"), key).toBeNull();
      expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      expect(requests[0]!.headers.get("content-type"), key).toBe("application/json");
      expect(await requests[0]!.json(), key).toMatchObject({ apiKey: "dummy" });
      expect(result).toMatchObject({ connector: "canny", action: key, source: "provider" });
    }
  });

  test("origin healthcheck still probes POST /v1/boards/list with apiKey in the body", async () => {
    const { requests, result } = await invoke("healthcheck", {}, () => jsonResponse({ boards: [] }));
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).href).toBe("https://canny.io/api/v1/boards/list");
    expect(await requests[0]!.json()).toEqual({ apiKey: "dummy" });
    expect(result).toMatchObject({ boards: [], source: "provider" });
  });

  test("optional body fields are omitted when unset and encoded when set", async () => {
    const bare = await invoke("posts.list", {}, () => jsonResponse({ posts: [], hasMore: false }));
    expect(await bare.requests[0]!.json()).toEqual({ apiKey: "dummy" });
    const filtered = await invoke(
      "posts.list",
      { boardId: "b1", limit: 10, skip: 20, authorID: "u1", search: "dark mode", sort: "newest", status: "open" },
      () => jsonResponse({ posts: [], hasMore: false }),
    );
    expect(await filtered.requests[0]!.json()).toEqual({
      apiKey: "dummy",
      boardID: "b1",
      limit: 10,
      skip: 20,
      authorID: "u1",
      search: "dark mode",
      sort: "newest",
      status: "open",
    });
  });

  test("votes.list maps Composio voterID to official userID", async () => {
    const { requests } = await invoke("votes.list", { voterID: "u1", postID: "p1", limit: 10 }, () =>
      jsonResponse({ items: [], hasNextPage: false, cursor: null }),
    );
    expect(new URL(requests[0]!.url).pathname).toBe("/api/v2/votes/list");
    expect(await requests[0]!.json()).toEqual({ apiKey: "dummy", postID: "p1", limit: 10, userID: "u1" });
  });

  test("maps 401 and 429", async () => {
    await expect(invoke("healthcheck", {}, () => jsonResponse({ message: "nope" }, 401))).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    await expect(
      invoke("healthcheck", {}, () => new Response("{}", { status: 429, headers: { "retry-after": "4", "content-type": "application/json" } })),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });

  test("runs fixtures against compiled handlers", async () => {
    const caseDir = join(import.meta.dir, "../fixtures/cases");
    const files = readdirSync(caseDir).filter((name) => name.endsWith(".json")).sort();
    expect(files.length).toBeGreaterThan(20);
    for (const file of files) {
      const raw = JSON.parse(readFileSync(join(caseDir, file), "utf8")) as {
        id: string;
        operation: string;
        input: Record<string, unknown>;
        credentials: Record<string, string>;
        exchanges: Array<{
          request: { method: string; url: string; headers?: Record<string, string>; body: unknown };
          response: { status: number; headers?: Record<string, string>; bodyFile?: string };
        }>;
        expected: { kind: "success"; resultFile: string } | { kind: "error"; code: string };
      };
      const action = compiled.actions[raw.operation];
      expect(action, raw.id).toBeTypeOf("function");
      let index = 0;
      const fetchStub = async (input: RequestInfo | URL, init?: RequestInit) => {
        const expected = raw.exchanges[index++];
        if (!expected) throw new Error(`${raw.id}: extra request`);
        const url = String(input instanceof Request ? input.url : input);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (method !== expected.request.method.toUpperCase() || !sameUrl(url, expected.request.url)) {
          throw new Error(`${raw.id}: ${method} ${url} != ${expected.request.method} ${expected.request.url}`);
        }
        const rawBody = init?.body == null ? null : String(init.body);
        if (expected.request.body === null) {
          if (rawBody !== null && rawBody !== "") throw new Error(`${raw.id}: unexpected body ${rawBody}`);
        } else if (typeof expected.request.body === "object") {
          if (!deepEqual(rawBody ? JSON.parse(rawBody) : null, expected.request.body)) {
            throw new Error(`${raw.id}: body mismatch ${rawBody}`);
          }
        } else if (rawBody !== expected.request.body) {
          throw new Error(`${raw.id}: body mismatch ${rawBody}`);
        }
        const got = new Headers(init?.headers);
        for (const [headerKey, value] of Object.entries(expected.request.headers ?? {})) {
          if (got.get(headerKey) !== value) throw new Error(`${raw.id}: header ${headerKey}=${got.get(headerKey)}!=${value}`);
        }
        const status = expected.response.status;
        if (status === 204) return new Response(null, { status, headers: expected.response.headers });
        const bodyBytes = expected.response.bodyFile
          ? readFileSync(join(dirname(join(caseDir, file)), expected.response.bodyFile))
          : Buffer.from("{}");
        return new Response(bodyBytes, { status, headers: expected.response.headers });
      };
      const input = { ...raw.input, ...raw.credentials, fetch: fetchStub };
      if (raw.expected.kind === "error") {
        let rejected: { code?: string } | undefined;
        try {
          await action!(input);
        } catch (error) {
          rejected = error as { code?: string };
        }
        expect(index, raw.id).toBe(raw.exchanges.length);
        expect(rejected?.code, raw.id).toBe(raw.expected.code);
        continue;
      }
      const result = await action!(input);
      expect(index, raw.id).toBe(raw.exchanges.length);
      const expected = JSON.parse(readFileSync(join(dirname(join(caseDir, file)), raw.expected.resultFile), "utf8"));
      expect(deepEqual(result, expected), `${raw.id} ${JSON.stringify(result)}`).toBe(true);
    }
  });
});
