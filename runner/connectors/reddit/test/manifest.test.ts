import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import COMPOSIO_TOOLS from "./composio-cover.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const compiled = compileDeclarativeConnector(manifest as never);
const FIRST_SLICE = [
  "healthcheck",
  "me.get",
  "subreddit.about",
  "listings.hot",
  "listings.new",
  "comments.list",
  "posts.submit",
  "vote",
] as const;

const ADDED: Record<string, { method: string; path: string; sideEffect: "read" | "write" | "destructive" }> = {
  "comments.delete": { method: "POST", path: "/api/del", sideEffect: "destructive" },
  "posts.delete": { method: "POST", path: "/api/del", sideEffect: "destructive" },
  "content.edit": { method: "POST", path: "/api/editusertext", sideEffect: "write" },
  "comments.more": { method: "GET", path: "/api/morechildren", sideEffect: "read" },
  "listings.front": { method: "GET", path: "/{{sort}}", sideEffect: "read" },
  "listings.controversial": { method: "GET", path: "/controversial", sideEffect: "read" },
  "me.prefs": { method: "GET", path: "/api/v1/me/prefs", sideEffect: "read" },
  "users.about": { method: "GET", path: "/user/{{username}}/about", sideEffect: "read" },
  "listings.top": { method: "GET", path: "/r/{{subreddit}}/top", sideEffect: "read" },
  "oauth.scopes": { method: "GET", path: "/api/v1/scopes", sideEffect: "read" },
  "subreddit.rules": { method: "GET", path: "/r/{{subreddit}}/about/rules", sideEffect: "read" },
  "subreddits.search": { method: "GET", path: "/subreddits/search", sideEffect: "read" },
  "flair.list": { method: "GET", path: "/r/{{subreddit}}/api/flairlist", sideEffect: "read" },
  "username.available": { method: "GET", path: "/api/username_available", sideEffect: "read" },
  "feeds.list": { method: "GET", path: "/user/{{username}}/m/{{customFeed}}", sideEffect: "read" },
  "moderation.queue": { method: "GET", path: "/r/{{subreddit}}/about/{{location}}", sideEffect: "read" },
  "comments.subreddit": { method: "GET", path: "/r/{{subreddit}}/comments", sideEffect: "read" },
  "subreddit.moderators": { method: "GET", path: "/r/{{subreddit}}/about/moderators", sideEffect: "read" },
  "flair.linkTemplates": { method: "GET", path: "/r/{{subreddit}}/api/link_flair_v2", sideEffect: "read" },
  "comments.create": { method: "POST", path: "/api/comment", sideEffect: "write" },
  "listings.bySort": { method: "GET", path: "/r/{{subreddit}}/{{sort}}", sideEffect: "read" },
  "things.info": { method: "GET", path: "/api/info", sideEffect: "read" },
  "search.all": { method: "GET", path: "/search", sideEffect: "read" },
  "replies.toggle": { method: "POST", path: "/api/sendreplies", sideEffect: "write" },
};

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
    else input[key] = "x";
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

describe("reddit manifest", () => {
  test("has bounded hosts, oauth2 accessToken, version, and compiles", () => {
    expect(manifest.key).toBe("reddit");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["social"]);
    expect(manifest.network.allowedHosts).toEqual(["oauth.reddit.com", "www.reddit.com"]);
    expect(manifest.http.baseUrl).toBe("https://oauth.reddit.com");
    expect(manifest.auth.type).toBe("oauth2");
    expect(manifest.auth.scopes).toEqual(["identity", "read", "submit", "vote", "edit", "flair", "modflair"]);
    expect(manifest.auth.setup.mode).toBe("oauth2");
    expect(manifest.auth.setup.fields.find((field: { key: string }) => field.key === "accessToken")?.required).toBe(true);
    expect(manifest.http.auth.field).toBe("accessToken");
    expect(manifest.http.auth.value).toBe("Bearer {{accessToken}}");
    expect(manifest.auth.oauth.authorizeUrl).toBe("https://www.reddit.com/api/v1/authorize");
    expect(manifest.auth.oauth.tokenUrl).toBe("https://www.reddit.com/api/v1/access_token");
    expect(manifest.auth.oauth.clientAuth).toBe("basic");
    expect(manifest.provenance.source.revision).toBe("33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a");
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the first slice and adds the documented missing HTTP operations", () => {
    expect(Object.keys(operations)).toHaveLength(FIRST_SLICE.length + Object.keys(ADDED).length);
    expect(Object.keys(operations)).toHaveLength(32);
    for (const key of FIRST_SLICE) {
      expect(operations[key], key).toBeDefined();
      expect(requestOf(key), key).toBeDefined();
      expect(compiled.actions[key], key).toBeTypeOf("function");
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/api/v1/me" });
    expect(requestOf("me.get")).toMatchObject({ method: "GET", path: "/api/v1/me" });
    expect(requestOf("subreddit.about")).toMatchObject({ method: "GET", path: "/r/{{subreddit}}/about" });
    expect(requestOf("listings.hot")).toMatchObject({ method: "GET", path: "/r/{{subreddit}}/hot" });
    expect(requestOf("listings.new")).toMatchObject({ method: "GET", path: "/r/{{subreddit}}/new" });
    expect(requestOf("comments.list")).toMatchObject({ method: "GET", path: "/comments/{{article}}" });
    expect(requestOf("posts.submit")).toMatchObject({ method: "POST", path: "/api/submit" });
    expect(requestOf("vote")).toMatchObject({ method: "POST", path: "/api/vote" });
    for (const [key, spec] of Object.entries(ADDED)) {
      expect(requestOf(key), key).toMatchObject({ method: spec.method, path: spec.path });
      expect(operations[key]?.sideEffect, key).toBe(spec.sideEffect);
      expect(String((requestOf(key).baseUrl as string | undefined) ?? manifest.http.baseUrl), key).toBe("https://oauth.reddit.com");
    }
  });

  test("covers mapped Composio Reddit tools with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(29);
    expect(COMPOSIO_TOOLS.REDDIT_GET_RANDOM).toBeUndefined();
    expect(COMPOSIO_TOOLS.REDDIT_PREPARE_MEDIA_UPLOAD).toBeUndefined();
    expect(COMPOSIO_TOOLS.REDDIT_RETRIEVE_REDDIT_POST).toBe("listings.bySort");
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      expect(requestOf(key), slug).toBeDefined();
      expect(compiled.actions[key], slug).toBeTypeOf("function");
    }
  });

  test("gives every action a real request, title, description, and object inputSchema", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(["read", "write", "destructive"], key).toContain(operation.sideEffect);
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(10);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      const request = operation.request as Record<string, unknown>;
      expect(typeof request.method, key).toBe("string");
      expect(typeof request.path, key).toBe("string");
      expect(String(request.path).startsWith("/"), key).toBe(true);
    }
  });

  test("classifies mutating HTTP methods as write or destructive", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const method = String((operation.request as Record<string, unknown>).method);
      if (method === "DELETE" || key === "comments.delete" || key === "posts.delete") {
        expect(operation.sideEffect, key).toBe("destructive");
      } else if (["POST", "PUT", "PATCH"].includes(method)) expect(operation.sideEffect, key).toBe("write");
      else expect(operation.sideEffect, key).toBe("read");
    }
  });

  test("bounds timeout and payload sizes and keeps https auth on the secret field", () => {
    const secret = (manifest.auth.setup.fields as Array<{ key: string; secret?: boolean }>).find((field) => field.secret);
    expect(secret?.key).toBe("accessToken");
    expect(manifest.http.auth.field).toBe(secret?.key);
    expect(manifest.http.baseUrl.startsWith("https://")).toBe(true);
    for (const [key, operation] of Object.entries(operations)) {
      const timeoutMs = operation.timeoutMs as number;
      const maxInputBytes = operation.maxInputBytes as number;
      const maxResponseBytes = operation.maxResponseBytes as number;
      expect(timeoutMs, key).toBeGreaterThanOrEqual(1);
      expect(timeoutMs, key).toBeLessThanOrEqual(300000);
      expect(maxInputBytes, key).toBeLessThanOrEqual(26214400);
      expect(maxResponseBytes, key).toBeGreaterThanOrEqual(maxInputBytes);
      const request = operation.request as Record<string, unknown>;
      const headers = (request.headers as Record<string, string> | undefined) ?? {};
      if (request.body === undefined) expect(headers["Content-Type"], key).toBeUndefined();
      else expect(headers["Content-Type"], key).not.toBe("application/json");
    }
  });

  test("only interpolates path placeholders the schema requires", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { required?: string[] };
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map((match) => match[1]);
      for (const placeholder of placeholders) {
        expect(schema.required ?? [], `${key} path uses {{${placeholder}}}`).toContain(placeholder);
      }
    }
  });

  test("keeps GET/DELETE body-less and puts form Content-Type only on bodies", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const method = String(request.method);
      const headers = (request.headers as Record<string, string> | undefined) ?? {};
      if (method === "GET" || method === "DELETE") {
        expect(request.body, key).toBeUndefined();
        expect(headers["Content-Type"], key).toBeUndefined();
      }
      if (request.body !== undefined) {
        expect(request.bodyEncoding, key).toBe("form");
        expect(headers["Content-Type"], key).toBe("application/x-www-form-urlencoded");
      }
    }
    expect(manifest.http.headers["Content-Type"]).toBeUndefined();
  });

  test("does not invent a recipe when the pin has no reddit provider", () => {
    const recipePath = new URL("../../recipes/reddit/recipe.json", import.meta.url);
    expect(existsSync(recipePath)).toBe(false);
    expect(manifest.version).toBe("0.2.0");
    for (const key of FIRST_SLICE) expect(operations[key], key).toBeDefined();
  });
});

describe("reddit compiled handlers", () => {
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  async function invoke(key: string, input: Record<string, unknown>, respond: (request: Request) => Promise<Response> | Response) {
    const requests: Request[] = [];
    const result = await compiled.actions[key]!({
      accessToken: "dummy",
      ...input,
      fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(url, init);
        requests.push(request);
        return respond(request);
      },
    });
    return { requests, result };
  }

  test("every operation dispatches a real HTTP request for required input", async () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as { method: string; path: string; success?: number[] };
      const input = dummyInput(operation.inputSchema as { properties?: Record<string, any>; required?: string[] });
      const { requests, result } = await invoke(key, input, () => jsonResponse({ id: "1", name: "alice", json: { errors: [] } }, request.success?.[0] ?? 200));
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      expect(new URL(requests[0]!.url).hostname, key).toBe("oauth.reddit.com");
      expect(requests[0]!.headers.get("authorization"), key).toBe("Bearer dummy");
      expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      expect(requests[0]!.headers.get("user-agent"), key).toBe("web:appcall-reddit:0.1.0");
      expect(result).toMatchObject({ connector: "reddit", action: key, source: "provider" });
    }
  });

  test("healthcheck and me.get probe GET /api/v1/me", async () => {
    const account = { id: "abc123", name: "alice" };
    const health = await invoke("healthcheck", {}, () => jsonResponse(account));
    expect(new URL(health.requests[0]!.url).pathname).toBe("/api/v1/me");
    expect(health.requests[0]!.method).toBe("GET");
    expect(await health.requests[0]!.text()).toBe("");
    expect(health.result).toEqual({
      connector: "reddit",
      action: "healthcheck",
      source: "provider",
      status: "ok",
      id: "abc123",
      name: "alice",
    });
    const me = await invoke("me.get", {}, () => jsonResponse(account));
    expect(new URL(me.requests[0]!.url).href).toBe("https://oauth.reddit.com/api/v1/me");
    expect(me.result).toEqual({
      connector: "reddit",
      action: "me.get",
      source: "provider",
      account,
    });
  });

  test("optional listing query params are omitted when unset", async () => {
    const bare = await invoke("listings.hot", { subreddit: "python" }, () => jsonResponse({ kind: "Listing", data: { children: [] } }));
    expect(new URL(bare.requests[0]!.url).href).toBe("https://oauth.reddit.com/r/python/hot?raw_json=1");
    const filtered = await invoke("listings.new", { subreddit: "python", limit: 10, after: "t3_abc" }, () => jsonResponse({ kind: "Listing", data: { children: [] } }));
    const url = new URL(filtered.requests[0]!.url);
    expect(url.pathname).toBe("/r/python/new");
    expect(url.searchParams.get("raw_json")).toBe("1");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("after")).toBe("t3_abc");
    expect(url.searchParams.get("before")).toBeNull();
  });

  test("posts.submit posts form-urlencoded /api/submit", async () => {
    const payload = { json: { errors: [], data: { id: "xyz", name: "t3_xyz", url: "https://www.reddit.com/r/test/comments/xyz/hello/" } } };
    const { requests, result } = await invoke(
      "posts.submit",
      { subreddit: "test", title: "Hello", kind: "self", text: "Hi there" },
      () => jsonResponse(payload),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/api/submit");
    expect(requests[0]!.headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(await requests[0]!.text()).toBe(new URLSearchParams({
      api_type: "json",
      sr: "test",
      title: "Hello",
      kind: "self",
      text: "Hi there",
      resubmit: "true",
    }).toString());
    expect(result).toEqual({
      connector: "reddit",
      action: "posts.submit",
      source: "provider",
      data: payload,
    });
  });

  test("vote posts form-urlencoded /api/vote", async () => {
    const { requests, result } = await invoke("vote", { id: "t3_abc123", dir: 1 }, () => jsonResponse({}));
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/api/vote");
    expect(requests[0]!.headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(await requests[0]!.text()).toBe("id=t3_abc123&dir=1");
    expect(result).toEqual({
      connector: "reddit",
      action: "vote",
      source: "provider",
      success: true,
    });
  });

  test("maps 401 and 429", async () => {
    await expect(invoke("healthcheck", {}, () => jsonResponse({ message: "Unauthorized" }, 401))).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    await expect(
      invoke("healthcheck", {}, () => new Response("{}", { status: 429, headers: { "x-ratelimit-reset": "4", "content-type": "application/json" } })),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });

  test("runs fixtures against compiled handlers", async () => {
    const caseDir = join(import.meta.dir, "../fixtures/cases");
    const files = readdirSync(caseDir).filter((name) => name.endsWith(".json")).sort();
    expect(files.length).toBeGreaterThan(8);
    const successOps = new Set(
      files
        .map((file) => JSON.parse(readFileSync(join(caseDir, file), "utf8")) as { operation?: string; expected?: { kind?: string } })
        .filter((raw) => raw.expected?.kind === "success")
        .map((raw) => raw.operation),
    );
    for (const key of Object.keys(operations)) expect(successOps.has(key), key).toBe(true);
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
