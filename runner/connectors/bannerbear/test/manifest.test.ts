import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "images.get", "templates.get", "templates.list"] as const;

const COMPOSIO_TOOLS: Record<string, string> = {
  BANNERBEAR_CREATE_PROJECT: "projects.create",
  BANNERBEAR_CREATE_SIGNED_BASE: "signed_bases.create",
  BANNERBEAR_CREATE_TEMPLATE: "templates.create",
  BANNERBEAR_CREATE_TEMPLATE_SET: "template_sets.create",
  BANNERBEAR_CREATE_VIDEO_TEMPLATE: "video_templates.create",
  BANNERBEAR_CREATE_WEBHOOK: "webhooks.create",
  BANNERBEAR_DELETE_TEMPLATE: "templates.delete",
  BANNERBEAR_DELETE_WEBHOOK: "webhooks.delete",
  BANNERBEAR_GET_ACCOUNT_INFO: "account.get",
  BANNERBEAR_GET_ANIMATED_GIF: "animated_gifs.get",
  BANNERBEAR_GET_AUTH: "healthcheck",
  BANNERBEAR_GET_FONTS: "fonts.list",
  BANNERBEAR_GET_IMAGE: "images.get",
  BANNERBEAR_GET_PROJECT: "projects.get",
  BANNERBEAR_GET_SCREENSHOT: "screenshots.get",
  BANNERBEAR_GET_SIGNED_BASES: "signed_bases.list",
  BANNERBEAR_GET_TEMPLATE: "templates.get",
  BANNERBEAR_GET_TEMPLATE_SET: "template_sets.get",
  BANNERBEAR_GET_WEBHOOK: "webhooks.get",
  BANNERBEAR_HYDRATE_PROJECT: "projects.hydrate",
  BANNERBEAR_IMPORT_TEMPLATE: "templates.import",
  BANNERBEAR_JOIN_PDFS: "pdfs.join",
  BANNERBEAR_LIST_ANIMATED_GIFS: "animated_gifs.list",
  BANNERBEAR_LIST_COLLECTIONS: "collections.list",
  BANNERBEAR_LIST_EFFECTS: "effects.list",
  BANNERBEAR_LIST_IMAGES: "images.list",
  BANNERBEAR_LIST_PROJECTS: "projects.list",
  BANNERBEAR_LIST_SCREENSHOTS: "screenshots.list",
  BANNERBEAR_LIST_TEMPLATES: "templates.list",
  BANNERBEAR_LIST_TEMPLATE_SETS: "template_sets.list",
  BANNERBEAR_LIST_VIDEOS: "videos.list",
  BANNERBEAR_LIST_VIDEO_TEMPLATES: "video_templates.list",
  BANNERBEAR_UPDATE_TEMPLATE_SET: "template_sets.update",
};

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
      input[key] = items.enum ? [items.enum[0]] : ["https://example.com/a.pdf"];
    } else if (prop.type === "object") input[key] = { id: 1 };
    else input[key] = key === "url" ? "https://example.com/hook" : "x";
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

describe("bannerbear manifest", () => {
  test("has bounded host, origin auth, version, and compiles", () => {
    expect(manifest.key).toBe("bannerbear");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["utility"]);
    expect(manifest.network.allowedHosts).toEqual(["api.bannerbear.com"]);
    expect(manifest.http.baseUrl).toBe("https://api.bannerbear.com");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin four operations", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(String(requestOf(key).path).startsWith("/v2/"), key).toBe(true);
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/v2/auth" });
    expect(requestOf("templates.list").path).toBe("/v2/templates");
    expect(requestOf("templates.get").path).toBe("/v2/templates/{{uid}}");
    expect(requestOf("images.get").path).toBe("/v2/images/{{uid}}");
    expect((operations["templates.get"]!.inputSchema as { required: string[] }).required).toEqual(["uid"]);
    expect((operations["images.get"]!.inputSchema as { required: string[] }).required).toEqual(["uid"]);
  });

  test("covers every Composio Bannerbear tool with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(33);
    expect(Object.keys(operations).length).toBe(33);
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
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      const request = operation.request as Record<string, unknown>;
      expect(typeof request.method, key).toBe("string");
      expect(typeof request.path, key).toBe("string");
      expect(String(request.path).startsWith("/v2/"), key).toBe(true);
    }
  });

  test("classifies mutating HTTP methods as write or destructive", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const method = String((operation.request as Record<string, unknown>).method);
      if (method === "DELETE") expect(operation.sideEffect, key).toBe("destructive");
      else if (["POST", "PUT", "PATCH"].includes(method)) expect(operation.sideEffect, key).toBe("write");
      else expect(operation.sideEffect, key).toBe("read");
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

  test("puts JSON Content-Type only on bodies and keeps GET body-less", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const method = String(request.method);
      const headers = (request.headers as Record<string, string> | undefined) ?? {};
      if (request.body !== undefined) {
        expect(headers["Content-Type"], key).toBe("application/json");
      } else {
        expect(headers["Content-Type"], key).toBeUndefined();
      }
      if (method === "GET" || method === "DELETE") expect(request.body, key).toBeUndefined();
    }
  });

  test("maps documented Bannerbear paths and Composio aliases", () => {
    expect(requestOf("projects.create").path).toBe("/v2/projects");
    expect(requestOf("projects.get").path).toBe("/v2/projects/{{uid}}");
    expect(requestOf("projects.hydrate").path).toBe("/v2/projects/{{uid}}/hydrate");
    expect(requestOf("signed_bases.create").path).toBe("/v2/templates/{{template_uid}}/signed_bases");
    expect(requestOf("signed_bases.list").path).toBe("/v2/templates/{{template_uid}}/signed_bases");
    expect(requestOf("templates.import").path).toBe("/v2/templates/import");
    expect(requestOf("pdfs.join").path).toBe("/v2/utilities/pdf/join");
    expect((requestOf("pdfs.join").body as Record<string, string>).pdf_inputs).toBe("{{pdf_urls}}");
    expect((requestOf("templates.list").query as Record<string, string>).tag).toBe("{{tag}}");
    expect((requestOf("webhooks.create").body as Record<string, string>).event).toBe("{{event}}");
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/bannerbear/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.2.0");
  });
});

describe("bannerbear compiled handlers", () => {
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

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

  function dummyResponse(operation: Record<string, unknown>): unknown {
    if ((operation.request as { result?: unknown }).result !== undefined) return {};
    const data = (operation.outputSchema as { properties?: { data?: { type?: string; items?: { type?: string } } } }).properties?.data;
    if (data?.type === "array") return data.items?.type === "string" ? ["ok"] : [{ uid: "ok" }];
    return { uid: "ok" };
  }

  test("every operation dispatches a real HTTP request for required input", async () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as { method: string; path: string; success?: number[]; result?: unknown };
      const input = dummyInput(operation.inputSchema as { properties?: Record<string, any>; required?: string[] });
      const { requests, result } = await invoke(key, input, () => jsonResponse(dummyResponse(operation), request.success?.[0] ?? 200));
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      expect(new URL(requests[0]!.url).hostname, key).toBe("api.bannerbear.com");
      expect(requests[0]!.headers.get("authorization"), key).toBe("Bearer dummy");
      expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      expect(result).toMatchObject({ connector: "bannerbear", action: key, source: "provider" });
    }
  });

  test("origin healthcheck still probes GET /v2/auth", async () => {
    const { requests } = await invoke("healthcheck", {}, () => jsonResponse({ message: "Authorized", project: "Demo" }));
    expect(new URL(requests[0]!.url).pathname).toBe("/v2/auth");
    expect(requests[0]!.method).toBe("GET");
    expect(new URL(requests[0]!.url).search).toBe("");
  });

  test("optional query params are omitted when unset and encoded when set", async () => {
    const bare = await invoke("templates.list", {}, () => jsonResponse([]));
    expect(new URL(bare.requests[0]!.url).href).toBe("https://api.bannerbear.com/v2/templates");
    const filtered = await invoke("templates.list", { tag: "shoes", page: 2, limit: 50, extended: true }, () => jsonResponse([]));
    const url = new URL(filtered.requests[0]!.url);
    expect(url.searchParams.get("tag")).toBe("shoes");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("limit")).toBe("50");
    expect(url.searchParams.get("extended")).toBe("true");
  });

  test("pdfs.join maps pdf_urls to pdf_inputs", async () => {
    const pdfs = ["https://example.com/a.pdf", "https://example.com/b.pdf"];
    const { requests } = await invoke("pdfs.join", { pdf_urls: pdfs }, () => jsonResponse({ status: "pending" }, 202));
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/v2/utilities/pdf/join");
    expect(await requests[0]!.json()).toEqual({ pdf_inputs: pdfs });
  });

  test("path segments are URL-encoded", async () => {
    const { requests } = await invoke("images.get", { uid: "a/b?c" }, () => jsonResponse({ uid: "a/b?c" }));
    expect(new URL(requests[0]!.url).pathname).toBe("/v2/images/a%2Fb%3Fc");
  });

  test("templates.delete returns the static envelope", async () => {
    const { requests, result } = await invoke("templates.delete", { uid: "jJWBKNELpQPvbX5R93Gk" }, () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
    expect(requests[0]!.method).toBe("DELETE");
    expect(new URL(requests[0]!.url).pathname).toBe("/v2/templates/jJWBKNELpQPvbX5R93Gk");
    expect(result).toEqual({ connector: "bannerbear", action: "templates.delete", source: "provider", success: true });
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
