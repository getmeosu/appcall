import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "projects.get", "projects.list", "users.current", "users.list"] as const;

const COMPOSIO_TOOLS: Record<string, string | null> = {
  COMPANYCAM_ADD_COMMENT: "comments.add",
  COMPANYCAM_ADD_PHOTO_TAGS: "photos.tags.add",
  COMPANYCAM_ADD_PROJECT_LABELS: "projects.labels.add",
  COMPANYCAM_ADD_PROJECT_PHOTO_FROM_URL: "photos.create",
  COMPANYCAM_CREATE_CUSTOMER: "customers.create",
  COMPANYCAM_CREATE_PROJECT: "projects.create",
  COMPANYCAM_CREATE_PROJECT_TASK: "projects.tasks.create",
  COMPANYCAM_CREATE_PHOTO_TAG: "tags.create",
  COMPANYCAM_GET_ACCOUNT_CONTEXT: "healthcheck",
  COMPANYCAM_GET_PHOTO: "photos.get",
  COMPANYCAM_GET_PROJECT: "projects.get",
  COMPANYCAM_LIST_COMMENTS: "comments.list",
  COMPANYCAM_LIST_CUSTOMERS: "customers.list",
  COMPANYCAM_LIST_PROJECT_LABELS: "projects.labels.list",
  COMPANYCAM_LIST_PROJECT_PHOTOS: "projects.photos.list",
  COMPANYCAM_LIST_PROJECTS: "projects.list",
  COMPANYCAM_LIST_PROJECT_TASKS: "projects.tasks.list",
  COMPANYCAM_LIST_PHOTO_TAGS: "photos.tags.list",
  COMPANYCAM_LIST_USERS: "users.list",
  COMPANYCAM_SEARCH_PROJECTS: "projects.search",
  COMPANYCAM_SET_PHOTO_DESCRIPTION: "photos.description.set",
  COMPANYCAM_UPDATE_CUSTOMER: "customers.update",
  COMPANYCAM_UPDATE_PROJECT: "projects.update",
  COMPANYCAM_UPDATE_PROJECT_TASK: "projects.tasks.update",
};

const MISSING = Object.entries(COMPOSIO_TOOLS)
  .filter(([, operation]) => operation === null)
  .map(([tool]) => tool);

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
      else input[key] = ["before"];
    } else if (prop.type === "object") input[key] = dummyInput(prop);
    else if (key === "uri") input[key] = "https://example.com/photo.jpg";
    else if (key === "userEmail") input[key] = "shawn@psych.co";
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

describe("companycam manifest", () => {
  test("has bounded host, origin auth, version, and compiles", () => {
    expect(manifest.key).toBe("companycam");
    expect(manifest.version).toBe("0.3.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["productivity"]);
    expect(manifest.network.allowedHosts).toEqual(["api.companycam.com"]);
    expect(manifest.http.baseUrl).toBe("https://api.companycam.com/v2");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin five operations", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(requestOf(key), key).toBeDefined();
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/company" });
    expect(requestOf("projects.get")).toMatchObject({ method: "GET", path: "/projects/{{projectId}}" });
    expect(requestOf("projects.list").path).toBe("/projects");
    expect((requestOf("projects.list").query as Record<string, string>).per_page).toBe("{{perPage}}");
    expect(requestOf("users.current")).toMatchObject({ method: "GET", path: "/users/current" });
    expect(requestOf("users.list").path).toBe("/users");
    expect((operations["projects.get"]!.inputSchema as { required: string[] }).required).toEqual(["projectId"]);
  });

  test("covers every documented Composio CompanyCam tool with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(24);
    expect(MISSING).toEqual([]);
    const mapped = Object.values(COMPOSIO_TOOLS).filter((value): value is string => value !== null);
    expect(new Set(mapped).size).toBe(24);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(key, slug).not.toBeNull();
      expect(operations[key!], slug).toBeDefined();
      expect(requestOf(key!), slug).toBeDefined();
      expect(compiled.actions[key!], slug).toBeTypeOf("function");
    }
    expect(Object.keys(operations).length).toBe(25);
    expect(operations["users.current"]).toBeDefined();
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

  test("maps documented CompanyCam v2 paths and Composio aliases", () => {
    expect(requestOf("projects.create")).toMatchObject({ method: "POST", path: "/projects" });
    expect(requestOf("projects.update")).toMatchObject({ method: "PUT", path: "/projects/{{projectId}}" });
    expect(requestOf("projects.search").path).toBe("/projects");
    expect((requestOf("projects.search").query as Record<string, string>).query).toBe("{{query}}");
    expect((operations["projects.search"]!.inputSchema as { required: string[] }).required).toEqual(["query"]);
    expect(requestOf("comments.add").path).toBe("/{{commentCollection}}/{{resourceId}}/comments");
    expect(requestOf("comments.list").path).toBe("/{{commentCollection}}/{{resourceId}}/comments");
    expect((operations["comments.add"]!.inputSchema as { properties: { commentCollection: { enum: string[] } } }).properties.commentCollection.enum).toEqual(["projects", "photos"]);
    expect(requestOf("photos.get").path).toBe("/photos/{{photoId}}");
    expect(requestOf("photos.create").path).toBe("/projects/{{projectId}}/photos");
    expect((requestOf("photos.create").body as { photo: Record<string, string> }).photo.uri).toBe("{{uri}}");
    expect((requestOf("photos.create").body as { photo: Record<string, string> }).photo.captured_at).toBe("{{capturedAt}}");
    expect(requestOf("photos.description.set")).toMatchObject({ method: "POST", path: "/photos/{{photoId}}/descriptions" });
    expect(requestOf("photos.tags.add")).toMatchObject({ method: "POST", path: "/photos/{{photoId}}/tags" });
    expect(requestOf("photos.tags.list").path).toBe("/photos/{{photoId}}/tags");
    expect(requestOf("tags.create")).toMatchObject({ method: "POST", path: "/tags" });
    expect((requestOf("tags.create").body as { tag: Record<string, string> }).tag.display_value).toBe("{{displayValue}}");
    expect(requestOf("projects.labels.add").path).toBe("/projects/{{projectId}}/labels");
    expect(requestOf("projects.labels.list").path).toBe("/projects/{{projectId}}/labels");
    expect(requestOf("projects.photos.list").path).toBe("/projects/{{projectId}}/photos");
    expect(requestOf("customers.create")).toMatchObject({
      method: "POST",
      path: "/crm/customers",
      baseUrl: "https://api.companycam.com/v3",
    });
    expect(requestOf("customers.list")).toMatchObject({
      method: "GET",
      path: "/crm/customers",
      baseUrl: "https://api.companycam.com/v3",
    });
    expect((requestOf("customers.list").query as Record<string, string>).query).toBe("{{query}}");
    expect(requestOf("customers.update")).toMatchObject({
      method: "PATCH",
      path: "/crm/customers/{{customerId}}",
      baseUrl: "https://api.companycam.com/v3",
    });
    expect((operations["customers.create"]!.inputSchema as { required: string[] }).required).toEqual(["name"]);
    expect((operations["customers.update"]!.inputSchema as { required: string[] }).required).toEqual(["customerId"]);
    expect(requestOf("projects.tasks.create")).toMatchObject({
      method: "POST",
      path: "/projects/{{projectId}}/tasks",
      baseUrl: "https://api.companycam.com/v3",
    });
    expect((requestOf("projects.tasks.create").body as { details: string; assignee_ids: string }).details).toBe("{{details}}");
    expect((requestOf("projects.tasks.create").body as { assignee_ids: string }).assignee_ids).toBe("{{assigneeIds}}");
    expect(requestOf("projects.tasks.list")).toMatchObject({
      method: "GET",
      path: "/projects/{{projectId}}/tasks",
      baseUrl: "https://api.companycam.com/v3",
    });
    expect(requestOf("projects.tasks.update")).toMatchObject({
      method: "PATCH",
      path: "/projects/{{projectId}}/tasks/{{taskId}}",
      baseUrl: "https://api.companycam.com/v3",
    });
    expect((operations["projects.tasks.create"]!.inputSchema as { required: string[] }).required).toEqual(["projectId", "details"]);
    expect((operations["projects.tasks.update"]!.inputSchema as { required: string[] }).required).toEqual(["projectId", "taskId"]);
  });

  test("origin recipe still contains the origin five; recipe rewrite is out of this write set", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/companycam/recipe.json", import.meta.url)).json();
    for (const key of ORIGIN_OPS) {
      expect(recipe.manifest.operations[key], key).toBeDefined();
    }
    expect(recipe.manifest.http.baseUrl).toBe("https://api.companycam.com/v2");
  });
});

describe("companycam compiled handlers", () => {
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
    const data = (operation.outputSchema as { properties?: { data?: { type?: string; items?: { type?: string } } } }).properties?.data;
    if (data?.type === "array") return data.items?.type === "string" ? ["ok"] : [{ id: "ok" }];
    return { id: "ok" };
  }

  test("every operation dispatches a real HTTP request for required input", async () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as { method: string; path: string; success?: number[] };
      const input = dummyInput(operation.inputSchema as { properties?: Record<string, any>; required?: string[] });
      const { requests, result } = await invoke(key, input, () => jsonResponse(dummyResponse(operation), request.success?.[0] ?? 200));
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      expect(new URL(requests[0]!.url).hostname, key).toBe("api.companycam.com");
      const pathname = new URL(requests[0]!.url).pathname;
      expect(pathname.startsWith("/v2/") || pathname.startsWith("/v3/"), key).toBe(true);
      expect(requests[0]!.headers.get("authorization"), key).toBe("Bearer dummy");
      expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      expect(result).toMatchObject({ connector: "companycam", action: key, source: "provider" });
    }
  });

  test("origin healthcheck still probes GET /company", async () => {
    const { requests } = await invoke("healthcheck", {}, () => jsonResponse({ id: "8292212", name: "Psych" }));
    expect(new URL(requests[0]!.url).pathname).toBe("/v2/company");
    expect(requests[0]!.method).toBe("GET");
    expect(new URL(requests[0]!.url).search).toBe("");
  });

  test("optional query params are omitted when unset and encoded when set", async () => {
    const bare = await invoke("projects.list", {}, () => jsonResponse([]));
    expect(new URL(bare.requests[0]!.url).href).toBe("https://api.companycam.com/v2/projects");
    const filtered = await invoke("projects.list", { page: 2, perPage: 50, query: "Psych Office" }, () => jsonResponse([]));
    const url = new URL(filtered.requests[0]!.url);
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("per_page")).toBe("50");
    expect(url.searchParams.get("query")).toBe("Psych Office");
  });

  test("comments route to project or photo collection paths", async () => {
    const project = await invoke("comments.add", { commentCollection: "projects", resourceId: "proj 1", content: "looks good" }, () => jsonResponse({ id: "c1" }, 201));
    expect(new URL(project.requests[0]!.url).pathname).toBe("/v2/projects/proj%201/comments");
    expect(await project.requests[0]!.json()).toEqual({ comment: { content: "looks good" } });
    const photo = await invoke("comments.list", { commentCollection: "photos", resourceId: "p1", page: 1, perPage: 25 }, () => jsonResponse([]));
    const url = new URL(photo.requests[0]!.url);
    expect(url.pathname).toBe("/v2/photos/p1/comments");
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get("per_page")).toBe("25");
  });

  test("create project remaps nested address and omits unset blobs", async () => {
    const bare = await invoke("projects.create", { name: "Psych Office" }, () => jsonResponse({ id: "1", name: "Psych Office" }, 201));
    expect(await bare.requests[0]!.json()).toEqual({ name: "Psych Office" });
    expect(bare.requests[0]!.headers.get("x-companycam-user")).toBeNull();
    const full = await invoke(
      "projects.create",
      {
        name: "Psych Office",
        userEmail: "shawn@psych.co",
        address: { street_address_1: "123 Main St", city: "Santa Barbara", state: "CA", postal_code: "93101", country: "US" },
        coordinates: { lat: 34.42, lon: -119.7 },
        primary_contact: { name: "Shawn Spencer", email: "shawn@psych.co", phone_number: "805-555-1212" },
      },
      () => jsonResponse({ id: "1" }, 201),
    );
    expect(full.requests[0]!.headers.get("x-companycam-user")).toBe("shawn@psych.co");
    expect(await full.requests[0]!.json()).toEqual({
      name: "Psych Office",
      address: { street_address_1: "123 Main St", city: "Santa Barbara", state: "CA", postal_code: "93101", country: "US" },
      coordinates: { lat: 34.42, lon: -119.7 },
      primary_contact: { name: "Shawn Spencer", email: "shawn@psych.co", phone_number: "805-555-1212" },
    });
  });

  test("add photo from URL sends uri, captured_at, and optional tags", async () => {
    const { requests } = await invoke(
      "photos.create",
      { projectId: "94772883", uri: "https://example.com/job.jpg", capturedAt: 1637770053, description: "south wall", tags: ["before"] },
      () => jsonResponse({ id: "photo-1" }, 201),
    );
    expect(new URL(requests[0]!.url).pathname).toBe("/v2/projects/94772883/photos");
    expect(await requests[0]!.json()).toEqual({
      photo: { uri: "https://example.com/job.jpg", captured_at: 1637770053, description: "south wall", tags: ["before"] },
    });
  });

  test("path segments are URL-encoded", async () => {
    const { requests } = await invoke("photos.get", { photoId: "a/b?c" }, () => jsonResponse({ id: "a/b?c" }));
    expect(new URL(requests[0]!.url).pathname).toBe("/v2/photos/a%2Fb%3Fc");
  });

  test("customers hit Core API v3 /crm/customers and omit unset blobs", async () => {
    const created = await invoke("customers.create", { name: "Psych Investigations" }, () => jsonResponse({ id: "cust-1" }, 201));
    expect(new URL(created.requests[0]!.url).href).toBe("https://api.companycam.com/v3/crm/customers");
    expect(await created.requests[0]!.json()).toEqual({ name: "Psych Investigations" });
    const listed = await invoke("customers.list", { query: "Psych" }, () => jsonResponse([]));
    expect(new URL(listed.requests[0]!.url).href).toBe("https://api.companycam.com/v3/crm/customers?query=Psych");
    const updated = await invoke(
      "customers.update",
      { customerId: "cust 1", name: "Psych LLC", address: { city: "Santa Barbara", postal_code: "93101" } },
      () => jsonResponse({ id: "cust 1" }),
    );
    expect(new URL(updated.requests[0]!.url).pathname).toBe("/v3/crm/customers/cust%201");
    expect(await updated.requests[0]!.json()).toEqual({
      name: "Psych LLC",
      address: { city: "Santa Barbara", postal_code: "93101" },
    });
  });

  test("project tasks hit Core API v3 nested /projects/{id}/tasks", async () => {
    const created = await invoke(
      "projects.tasks.create",
      { projectId: "94772883", details: "Photograph south wall", assigneeIds: ["user-12"] },
      () => jsonResponse({ id: "task-1" }, 201),
    );
    expect(new URL(created.requests[0]!.url).pathname).toBe("/v3/projects/94772883/tasks");
    expect(await created.requests[0]!.json()).toEqual({ details: "Photograph south wall", assignee_ids: ["user-12"] });
    const listed = await invoke("projects.tasks.list", { projectId: "94772883" }, () => jsonResponse([]));
    expect(new URL(listed.requests[0]!.url).href).toBe("https://api.companycam.com/v3/projects/94772883/tasks");
    const updated = await invoke(
      "projects.tasks.update",
      { projectId: "94772883", taskId: "task-441", details: "Photograph flashing" },
      () => jsonResponse({ id: "task-441" }),
    );
    expect(new URL(updated.requests[0]!.url).pathname).toBe("/v3/projects/94772883/tasks/task-441");
    expect(await updated.requests[0]!.json()).toEqual({ details: "Photograph flashing" });
  });

  test("maps 401 and 429", async () => {
    await expect(invoke("healthcheck", {}, () => jsonResponse({ errors: ["nope"] }, 401))).rejects.toMatchObject({
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
      let result: unknown;
      try {
        result = await action!(input);
      } catch (error) {
        throw new Error(`${raw.id}: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
      }
      expect(index, raw.id).toBe(raw.exchanges.length);
      const expected = JSON.parse(readFileSync(join(dirname(join(caseDir, file)), raw.expected.resultFile), "utf8"));
      expect(deepEqual(result, expected), `${raw.id} ${JSON.stringify(result)}`).toBe(true);
    }
  });
});
