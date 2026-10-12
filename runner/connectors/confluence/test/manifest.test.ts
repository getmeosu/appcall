import { describe, expect, it, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import COMPOSIO_TOOLS from "./composio-cover.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const actionOps = Object.fromEntries(Object.entries(operations).filter(([, op]) => op.kind === "action"));
const webhookOps = Object.fromEntries(Object.entries(operations).filter(([, op]) => op.kind === "webhook"));
const compiled = compileDeclarativeConnector(manifest as never);
const FIRST_SLICE = ["healthcheck", "space.list", "page.list", "page.get", "search.content"] as const;
const creds = {
  site: "acme.atlassian.net",
  email: "me@acme.com",
  apiToken: "tok123",
  basicAuth: "bWU6dG9rMTIz",
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
    else if (prop.type === "array") input[key] = ["x"];
    else input[key] = "x";
  }
  return input;
}

describe("confluence manifest", () => {
  it("declares the connector identity the control plane keys on", () => {
    expect(manifest.key).toBe("confluence");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["productivity"]);
    expect(manifest.models.length).toBeGreaterThan(0);
  });

  it("gives every action the limits and tool schema the MCP gateway requires", () => {
    for (const [key, operation] of Object.entries(actionOps)) {
      expect(operation.kind, key).toBe("action");
      expect(operation.timeoutMs as number, key).toBeGreaterThan(0);
      expect(operation.maxInputBytes as number, key).toBeGreaterThan(0);
      expect(operation.maxResponseBytes as number, key).toBeGreaterThan(0);
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as Record<string, unknown>).type, key).toBe("object");
      expect(operation.outputSchema, `${key} must declare an outputSchema`).toBeDefined();
      expect(["read", "write"]).toContain(operation.sideEffect as string);
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
    }
  });

  it("classifies every mutating operation as a write — a safety control, not metadata", () => {
    const writes = Object.entries(actionOps)
      .filter(([, operation]) => ["POST", "PUT", "PATCH", "DELETE"].includes(String((operation.request as Record<string, unknown>).method)))
      .map(([key]) => key);
    expect(writes.length).toBeGreaterThan(0);
    for (const key of writes) {
      expect(operations[key]!.sideEffect, `${key} mutates and must be sideEffect write`).toBe("write");
    }
  });

  it("only interpolates path placeholders the operation's schema requires", () => {
    for (const [key, operation] of Object.entries(actionOps)) {
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { required?: string[] };
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map((match) => match[1]);
      for (const placeholder of placeholders) {
        expect(schema.required ?? [], `${key} path uses {{${placeholder}}}`).toContain(placeholder);
      }
    }
  });

  it("templates every query and body value from a declared input", () => {
    for (const [key, operation] of Object.entries(actionOps)) {
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { properties?: Record<string, unknown> };
      const declared = Object.keys(schema.properties ?? {});
      const templated = [...JSON.stringify([request.query ?? {}, request.body ?? {}]).matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)]
        .map((match) => match[1]!)
        .filter((name) => name.startsWith("input.") === false);
      for (const name of templated) {
        expect(declared, `${key} references {{${name}}}`).toContain(name);
      }
    }
  });

  it("keeps every operation key inside the control plane's safe charset", () => {
    for (const key of Object.keys(operations)) {
      expect(key).toMatch(/^[a-zA-Z0-9._-]+$/);
    }
  });

  it("backs off on the documented 429 with a real Retry-After header", () => {
    expect(manifest.http.errors.rateLimitStatuses).toEqual([429]);
    expect(manifest.http.errors.retryAfterHeader).toBe("retry-after");
    expect(manifest.http.errors.retryAfterKind).toBe("seconds");
  });

  it("does not opt into bodyErrorPaths, since errors[] only appears on non-success statuses the status check already catches", () => {
    expect((manifest.http.errors as Record<string, unknown>).bodyErrorPaths).toBeUndefined();
  });

  it("keeps the origin/main surface and adds one real HTTP tool per remaining Composio slug", () => {
    const origin = [
      "healthcheck",
      "page.create",
      "page.get",
      "page.update",
      "page.list",
      "page.delete",
      "page.children.list",
      "space.list",
      "space.get",
      "space.create",
      "search.cql",
      "attachment.listForPage",
      "comment.create",
      "comment.list",
      "comment.get",
      "labels.add",
      "labels.list",
      "labels.remove",
      "blogpost.list",
      "blogpost.get",
      "blogpost.create",
      "webhook.page_created",
      "webhook.page_updated",
      "webhook.comment_created",
      "webhook.space_created",
    ];
    for (const key of origin) {
      expect(operations[key], key).toBeDefined();
    }
    expect(manifest.version).toBe("0.4.1");
    expect(Object.keys(operations)).toHaveLength(73);
    expect(Object.keys(actionOps)).toHaveLength(69);
  });

  it("declares EventOnly webhooks without a request or tool schema", () => {
    expect(Object.keys(webhookOps).sort()).toEqual([
      "webhook.comment_created",
      "webhook.page_created",
      "webhook.page_updated",
      "webhook.space_created",
    ]);
    for (const [key, operation] of Object.entries(webhookOps)) {
      expect(operation.kind, key).toBe("webhook");
      expect(operation.request, key).toBeUndefined();
      expect(operation.inputSchema, key).toBeUndefined();
    }
  });

  it("never declares attachment.upload — multipart bodies are Tier H, not declarative", () => {
    expect(operations["attachment.upload"]).toBeUndefined();
  });

  // --- Connector-specific assertions from the task brief ---

  it("templates the site URL from a REQUIRED setup field", () => {
    expect(manifest.http.baseUrl).toBe("https://{{site}}/wiki");
    // Only the templated entry is declared: buildURL always renders {{site}},
    // so a literal "*.atlassian.net" entry could never be the one that
    // matches — it would only widen what the manifest claims to permit for
    // nothing.
    expect(manifest.network.allowedHosts).toEqual(["{{site}}"]);
    const fields = manifest.auth.setup.fields as { key: string; required?: boolean }[];
    expect(fields.map((f) => f.key)).toEqual(expect.arrayContaining(["site", "email", "apiToken"]));
    expect(fields.find((f) => f.key === "site")?.required).toBe(true);
  });

  it("derives the Basic header rather than asking the operator to encode it", () => {
    expect(manifest.auth.setup.derive).toEqual([
      { field: "basicAuth", kind: "basic", from: ["email", "apiToken"] },
    ]);
    // basicAuth is derived, so it must not be a field the operator is asked for.
    expect(manifest.auth.setup.fields.map((f: { key: string }) => f.key)).not.toContain("basicAuth");
    // auth.field must still name the secret setup field, not the derived one.
    expect(manifest.http.auth.field).toBe("apiToken");
  });

  it("reads both Confluence error shapes, v2 first", () => {
    expect(manifest.http.errors.messagePaths[0]).toBe("errors.0.detail");
    expect(manifest.http.errors.messagePaths).toContain("message");
  });

  it("uses v2 for content and v1 only where v2 has no endpoint", () => {
    const v1 = Object.entries(actionOps)
      .filter(([, op]) => String((op.request as Record<string, unknown>).path).startsWith("/rest/api"))
      .map(([key]) => key);
    expect(v1.sort()).toEqual([
      "attachment.download",
      "audit.list",
      "content.restrictions.get",
      "healthcheck",
      "search.content",
      "search.cql",
      "search.users",
      "space.contents.list",
      "space.createPrivate",
      "space.delete",
      "user.anonymous.get",
    ]);
  });

  it("requires all five fields page.update needs for optimistic concurrency", () => {
    const schema = operations["page.update"]!.inputSchema as { required?: string[] };
    expect(schema.required).toEqual(expect.arrayContaining(["id", "status", "title", "body", "version"]));
  });

  it("requires spaceId (not a space key) on page.create and says so in the description", () => {
    const op = operations["page.create"]!;
    const schema = op.inputSchema as { required?: string[]; properties?: Record<string, unknown> };
    expect(schema.required).toContain("spaceId");
    expect(Object.keys(schema.properties ?? {})).not.toContain("spaceKey");
    expect(String(op.description)).toContain("NOT the space key");
  });

  it("maps _links.next through as an opaque nextLink, never inventing a bare nextCursor", () => {
    for (const key of [
      "page.list",
      "space.list",
      "attachment.listForPage",
      "page.children.list",
      "labels.list",
      "comment.list",
      "blogpost.list",
      "attachment.labels.list",
      "blogpost.labels.list",
      "label.blogposts.list",
      "blogpost.versions.list",
      "blogpost.properties.list",
      "page.properties.list",
      "blogpost.inlineComments.list",
      "labels.listAll",
      "space.labels.list",
      "space.contentLabels.list",
      "page.inlineComments.list",
      "page.versions.list",
      "space.properties.list",
      "tasks.list",
      "search.pages",
      "search.spaces",
    ]) {
      const result = JSON.stringify((operations[key]!.request as Record<string, unknown>).result ?? {});
      expect(result, key).toContain("{{response._links.next}}");
      expect(result, key).not.toContain("nextCursor");
    }
  });

  it("keeps EventOnly webhooks as sideEffect read", () => {
    for (const [key, operation] of Object.entries(webhookOps)) {
      expect(operation.sideEffect, key).toBe("read");
    }
  });
});

describe("confluence first-slice contract", () => {
  test("has required *.atlassian.net host, Basic email:apiToken, pinned provenance, and compiles", () => {
    expect(manifest.key).toBe("confluence");
    expect(manifest.version).toBe("0.4.1");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.http.baseUrl).toBe("https://{{site}}/wiki");
    expect(manifest.network.allowedHosts).toEqual(["{{site}}"]);
    expect(manifest.http.headers.Accept).toBe("application/json");
    expect(manifest.http.headers["Content-Type"]).toBeUndefined();
    expect(manifest.http.auth).toEqual({
      field: "apiToken",
      in: "header",
      name: "Authorization",
      value: "Basic {{basicAuth}}",
    });
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.auth.scopes).toEqual([]);
    expect(Object.keys(manifest.auth).sort()).toEqual(["scopes", "setup", "type"]);
    const fields = manifest.auth.setup.fields as Array<{ key: string; required?: boolean; secret?: boolean; description?: string }>;
    expect(fields.map((field) => field.key)).toEqual(["site", "email", "apiToken"]);
    expect(fields.every((field) => field.required === true)).toBe(true);
    const site = fields.find((field) => field.key === "site")!;
    expect(site.secret).toBe(false);
    expect(site.description).toContain("atlassian.net");
    expect(manifest.auth.setup.derive).toEqual([{ field: "basicAuth", kind: "basic", from: ["email", "apiToken"] }]);
    expect(manifest.provenance.source).toEqual({
      url: "https://github.com/oomol-lab/open-connector",
      revision: "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a",
    });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("covers healthcheck + spaces.list, pages.list/get, content.search", () => {
    for (const key of FIRST_SLICE) {
      expect(operations[key], key).toBeDefined();
      expect(requestOf(key), key).toBeDefined();
      expect(compiled.actions[key], key).toBeTypeOf("function");
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/rest/api/user/current" });
    expect(requestOf("space.list")).toMatchObject({ method: "GET", path: "/api/v2/spaces" });
    expect(requestOf("page.list")).toMatchObject({ method: "GET", path: "/api/v2/pages" });
    expect(requestOf("page.get")).toMatchObject({ method: "GET", path: "/api/v2/pages/{{id}}" });
    expect(requestOf("search.content")).toMatchObject({ method: "GET", path: "/rest/api/search" });
    expect((operations["page.get"]!.inputSchema as { required: string[] }).required).toEqual(["id"]);
    expect((operations["search.content"]!.inputSchema as { required: string[] }).required).toEqual(["query"]);
  });

  test("maps first-slice Composio CONFLUENCE tools onto real requests", () => {
    expect(Object.keys(COMPOSIO_TOOLS).length).toBeGreaterThanOrEqual(4);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      expect(requestOf(key), slug).toBeDefined();
      expect(compiled.actions[key], slug).toBeTypeOf("function");
    }
  });

  test("GET and DELETE are body-less and JSON Content-Type is only set when a body is present", () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (!operation.request) continue;
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
    expect(manifest.http.headers["Content-Type"]).toBeUndefined();
  });

  test("recipe operations equal runner operations and auth is type/scopes/setup only", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/confluence/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.4.0");
    expect(Object.keys(recipe.manifest.auth).sort()).toEqual(["scopes", "setup", "type"]);
    expect(recipe.manifest.auth.type).toBe("api_key");
    expect(recipe.manifest.auth.scopes).toEqual([]);
    expect(recipe.source.revision).toBe("33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a");
  });
});

describe("confluence compiled first-slice handlers", () => {
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  async function invoke(key: string, input: Record<string, unknown>, respond: (request: Request) => Promise<Response> | Response) {
    const requests: Request[] = [];
    const result = await compiled.actions[key]!({
      ...creds,
      ...input,
      fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(url, init);
        requests.push(request);
        return respond(request);
      },
    });
    return { requests, result };
  }

  test("every first-slice REST operation dispatches a real HTTP request for required input", async () => {
    for (const key of FIRST_SLICE) {
      const operation = operations[key]!;
      const request = operation.request as { method: string; path: string; success?: number[] };
      const input = dummyInput(operation.inputSchema as { properties?: Record<string, any>; required?: string[] });
      const { requests, result } = await invoke(key, input, () =>
        jsonResponse({ results: [], id: "1", accountId: "a1", displayName: "Ada", type: "known" }, request.success?.[0] ?? 200),
      );
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      expect(new URL(requests[0]!.url).hostname, key).toBe("acme.atlassian.net");
      expect(requests[0]!.headers.get("authorization"), key).toBe("Basic bWU6dG9rMTIz");
      expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      expect(requests[0]!.headers.get("content-type"), key).toBeNull();
      expect(await requests[0]!.text(), key).toBe("");
      expect(result).toMatchObject({ connector: "confluence", action: key, source: "provider" });
    }
  });

  test("healthcheck probes GET /rest/api/user/current", async () => {
    const { requests, result } = await invoke("healthcheck", {}, () =>
      jsonResponse({ type: "known", accountId: "a1", displayName: "Ada", email: "me@acme.com" }),
    );
    expect(new URL(requests[0]!.url).pathname).toBe("/wiki/rest/api/user/current");
    expect(requests[0]!.method).toBe("GET");
    expect(new URL(requests[0]!.url).search).toBe("");
    expect(result).toMatchObject({
      connector: "confluence",
      action: "healthcheck",
      source: "provider",
      status: "ok",
      accountId: "a1",
      displayName: "Ada",
    });
  });

  test("spaces.list (space.list) hits GET /api/v2/spaces", async () => {
    const { requests, result } = await invoke("space.list", { limit: 25 }, () =>
      jsonResponse({ results: [{ id: "98765", key: "ENG", name: "Engineering" }], _links: { next: "/api/v2/spaces?cursor=n1" } }),
    );
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe("/wiki/api/v2/spaces");
    expect(url.searchParams.get("limit")).toBe("25");
    expect(result).toMatchObject({
      connector: "confluence",
      action: "space.list",
      source: "provider",
      nextLink: "/api/v2/spaces?cursor=n1",
    });
  });

  test("pages.list/get hit v2 pages", async () => {
    const listed = await invoke("page.list", { spaceId: "98765" }, () => jsonResponse({ results: [{ id: "123456" }], _links: {} }));
    expect(new URL(listed.requests[0]!.url).pathname).toBe("/wiki/api/v2/pages");
    expect(new URL(listed.requests[0]!.url).searchParams.get("space-id")).toBe("98765");
    const got = await invoke("page.get", { id: "123456" }, () => jsonResponse({ id: "123456", title: "Home", spaceId: "98765" }));
    expect(new URL(got.requests[0]!.url).pathname).toBe("/wiki/api/v2/pages/123456");
    expect(got.result).toMatchObject({ connector: "confluence", action: "page.get", source: "provider" });
  });

  test("content.search (search.content) hits GET /rest/api/search", async () => {
    const { requests } = await invoke("search.content", { query: "onboarding" }, () => jsonResponse({ results: [], size: 0 }));
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe("/wiki/rest/api/search");
    expect(url.searchParams.get("cql")).toBe('title ~ "onboarding"');
  });

  test("mutating ops send JSON Content-Type and GET/DELETE do not", async () => {
    const created = await invoke("page.create", { spaceId: "98765", title: "New" }, () => jsonResponse({ id: "9" }));
    expect(created.requests[0]!.headers.get("content-type")).toBe("application/json");
    expect(created.requests[0]!.method).toBe("POST");
    const deleted = await invoke("page.delete", { id: "123456" }, () => new Response(null, { status: 204 }));
    expect(deleted.requests[0]!.method).toBe("DELETE");
    expect(deleted.requests[0]!.headers.get("content-type")).toBeNull();
    expect(await deleted.requests[0]!.text()).toBe("");
  });
});
