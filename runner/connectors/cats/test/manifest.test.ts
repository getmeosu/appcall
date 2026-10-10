import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import COMPOSIO_TOOLS from "./composio-cover.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "candidates.get", "candidates.list", "jobs.get", "jobs.list"] as const;
const CAT_API_OPS = Object.values(COMPOSIO_TOOLS);
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
    } else if (prop.type === "object") input[key] = { id: 1 };
    else input[key] = "x".repeat(Math.max(1, Number(prop.minLength ?? 1)));
  }
  return input;
}

describe("cats manifest", () => {
  test("has dual bounded hosts, origin Token auth, version, and compiles", () => {
    expect(manifest.key).toBe("cats");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["ats-recruitment"]);
    expect(manifest.network.allowedHosts).toEqual(["api.catsone.com", "api.thecatapi.com"]);
    expect(manifest.http.baseUrl).toBe("https://api.catsone.com");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.value).toBe("Token {{apiKey}}");
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin five ATS operations", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(requestOf(key).baseUrl, key).toBeUndefined();
      expect(String(requestOf(key).path).startsWith("/v3/"), key).toBe(true);
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/v3/site" });
    expect(requestOf("candidates.list").path).toBe("/v3/candidates");
    expect(requestOf("candidates.get").path).toBe("/v3/candidates/{{candidate_id}}");
    expect(requestOf("jobs.list").path).toBe("/v3/jobs");
    expect(requestOf("jobs.get").path).toBe("/v3/jobs/{{job_id}}");
    expect((operations["candidates.get"]!.inputSchema as { required: string[] }).required).toEqual(["candidate_id"]);
    expect((operations["jobs.get"]!.inputSchema as { required: string[] }).required).toEqual(["job_id"]);
  });

  test("covers every Composio CATS tool with a real The Cat API request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(18);
    expect(Object.keys(operations).length).toBe(23);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      expect(requestOf(key), slug).toBeDefined();
      expect(requestOf(key).baseUrl, slug).toBe("https://api.thecatapi.com/v1");
      expect((requestOf(key).headers as Record<string, string>)["x-api-key"], slug).toBe("{{apiKey}}");
      expect(compiled.actions[key], slug).toBeTypeOf("function");
    }
    expect(operations.healthcheck).toBeDefined();
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
      expect(String(request.path).startsWith("/"), key).toBe(true);
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

  test("puts JSON Content-Type only on bodies and keeps GET/DELETE body-less", () => {
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

  test("maps documented The Cat API paths and Composio aliases", () => {
    expect(requestOf("favourites.create")).toMatchObject({ method: "POST", path: "/favourites" });
    expect(requestOf("favourites.create").body).toEqual({ image_id: "{{image_id}}", sub_id: "{{sub_id}}" });
    expect(requestOf("votes.create")).toMatchObject({ method: "POST", path: "/votes" });
    expect(requestOf("votes.create").body).toEqual({ image_id: "{{image_id}}", sub_id: "{{sub_id}}", value: "{{value}}" });
    expect(requestOf("favourites.delete").path).toBe("/favourites/{{favourite_id}}");
    expect(requestOf("images.delete").path).toBe("/images/{{image_id}}");
    expect(requestOf("votes.delete").path).toBe("/votes/{{vote_id}}");
    expect(requestOf("breeds.get").path).toBe("/breeds/{{breed_id}}");
    expect(requestOf("favourites.get").path).toBe("/favourites/{{favourite_id}}");
    expect(requestOf("images.get").path).toBe("/images/{{image_id}}");
    expect(requestOf("images.analysis.get").path).toBe("/images/{{image_id}}/analysis");
    expect(requestOf("images.breeds.get").path).toBe("/images/{{image_id}}/breeds");
    expect(requestOf("breeds.list").path).toBe("/breeds");
    expect(requestOf("votes.get").path).toBe("/votes/{{vote_id}}");
    expect(requestOf("categories.list").path).toBe("/categories");
    expect(requestOf("favourites.list").path).toBe("/favourites");
    expect(requestOf("images.list").path).toBe("/images");
    expect(requestOf("votes.list").path).toBe("/votes");
    expect(requestOf("breeds.search").path).toBe("/breeds/search");
    expect((requestOf("breeds.search").query as Record<string, string>).q).toBe("{{q}}");
    expect(requestOf("images.search").path).toBe("/images/search");
    expect((operations["votes.create"]!.inputSchema as { properties: { value: { enum: number[] } } }).properties.value.enum).toEqual([0, 1]);
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/cats/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.2.0");
    expect(recipe.manifest.http.baseUrl).toBe("https://api.catsone.com");
    expect(recipe.manifest.network.allowedHosts).toEqual(["api.catsone.com", "api.thecatapi.com"]);
  });
});

describe("cats compiled handlers", () => {
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
    const data = (operation.outputSchema as { properties?: { data?: { type?: unknown } } }).properties?.data;
    if (data?.type === "array") return [{ id: 1 }];
    return { id: 1 };
  }

  test("every operation dispatches a real HTTP request for required input", async () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as { method: string; path: string; success?: number[]; baseUrl?: string };
      const input = dummyInput(operation.inputSchema as { properties?: Record<string, any>; required?: string[] });
      const { requests, result } = await invoke(key, input, () => jsonResponse(dummyResponse(operation), request.success?.[0] ?? 200));
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      const host = new URL(requests[0]!.url).hostname;
      if (ORIGIN_OPS.includes(key as (typeof ORIGIN_OPS)[number])) {
        expect(host, key).toBe("api.catsone.com");
        expect(requests[0]!.headers.get("x-api-key"), key).toBeNull();
      } else {
        expect(host, key).toBe("api.thecatapi.com");
        expect(requests[0]!.headers.get("x-api-key"), key).toBe("dummy");
      }
      expect(requests[0]!.headers.get("authorization"), key).toBe("Token dummy");
      expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      expect(result).toMatchObject({ connector: "cats", action: key, source: "provider" });
    }
  });

  test("origin healthcheck still probes GET /v3/site", async () => {
    const { requests } = await invoke("healthcheck", {}, () => jsonResponse({ id: 1 }));
    expect(requests[0]!.method).toBe("GET");
    expect(requests[0]!.url).toBe("https://api.catsone.com/v3/site");
  });

  test("optional The Cat API query params are omitted when unset", async () => {
    const bare = await invoke("images.search", {}, () => jsonResponse([{ id: "bax" }]));
    expect(bare.requests[0]!.url).toBe("https://api.thecatapi.com/v1/images/search");
    const filtered = await invoke(
      "images.search",
      { limit: 1, page: 0, order: "RANDOM", size: "med", mime_types: "jpg", has_breeds: true, format: "json" },
      () => jsonResponse([{ id: "bax" }]),
    );
    expect(filtered.requests[0]!.url).toBe(
      "https://api.thecatapi.com/v1/images/search?format=json&has_breeds=true&limit=1&mime_types=jpg&order=RANDOM&page=0&size=med",
    );
  });

  test("create favourite omits sub_id when unset and JSON-encodes when set", async () => {
    const bare = await invoke("favourites.create", { image_id: "bax" }, () => jsonResponse({ message: "SUCCESS", id: 1 }));
    expect(await bare.requests[0]!.json()).toEqual({ image_id: "bax" });
    expect(bare.requests[0]!.headers.get("content-type")).toBe("application/json");
    const full = await invoke(
      "favourites.create",
      { image_id: "bax", sub_id: "user-123" },
      () => jsonResponse({ message: "SUCCESS", id: 1 }),
    );
    expect(await full.requests[0]!.json()).toEqual({ image_id: "bax", sub_id: "user-123" });
  });

  test("create vote keeps integer value in the JSON body", async () => {
    const { requests } = await invoke("votes.create", { image_id: "bax", value: 1 }, () => jsonResponse({ message: "SUCCESS", id: 9 }));
    expect(await requests[0]!.json()).toEqual({ image_id: "bax", value: 1 });
  });

  test("rejects unknown fields and missing required path ids", async () => {
    await expect(compiled.actions.healthcheck!({ apiKey: "dummy", unknownField: "nope" })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(compiled.actions["breeds.get"]!({ apiKey: "dummy" })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(compiled.actions["images.search"]!({ apiKey: "dummy", limit: 26 })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
  });

  test("covers all 18 Composio slugs as compiled functions", () => {
    expect(CAT_API_OPS).toHaveLength(18);
    for (const key of CAT_API_OPS) {
      expect(compiled.actions[key], key).toBeTypeOf("function");
    }
  });
});
