import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "groups.list", "groups.get", "credentials.list", "credentials.get"] as const;

const COMPOSIO_TOOLS: Record<string, string> = {
  ACCREDIBLE_CERTIFICATES_BULK_CREATE_CREDENTIALS_V2: "credentials.bulk-create",
  ACCREDIBLE_CERTIFICATES_CLONE_GROUP: "groups.clone",
  ACCREDIBLE_CERTIFICATES_CREATE_ATTRIBUTE_KEY: "attribute-keys.create",
  ACCREDIBLE_CERTIFICATES_CREATE_COLLECTION: "collections.create",
  ACCREDIBLE_CERTIFICATES_CREATE_CREDENTIAL: "credentials.create",
  ACCREDIBLE_CERTIFICATES_CREATE_EVIDENCE_ITEM: "evidence-items.create",
  ACCREDIBLE_CERTIFICATES_CREATE_GROUP: "groups.create",
  ACCREDIBLE_CERTIFICATES_CREATE_REFERENCE: "references.create",
  ACCREDIBLE_CERTIFICATES_DELETE_COLLECTION: "collections.delete",
  ACCREDIBLE_CERTIFICATES_DELETE_CREDENTIAL: "credentials.delete",
  ACCREDIBLE_CERTIFICATES_DELETE_EVIDENCE_ITEM: "evidence-items.delete",
  ACCREDIBLE_CERTIFICATES_DELETE_GROUP: "groups.delete",
  ACCREDIBLE_CERTIFICATES_DELETE_REFERENCE: "references.delete",
  ACCREDIBLE_CERTIFICATES_GENERATE_PD_FS_FOR_CREDENTIALS: "credentials.generate-pdfs",
  ACCREDIBLE_CERTIFICATES_GET_ANALYTICS: "analytics.get",
  ACCREDIBLE_CERTIFICATES_GET_CREDENTIAL: "credentials.get",
  ACCREDIBLE_CERTIFICATES_GET_CREDENTIAL_ANALYTICS: "credentials.analytics.get",
  ACCREDIBLE_CERTIFICATES_GET_DEPARTMENT: "departments.get",
  ACCREDIBLE_CERTIFICATES_GET_EVIDENCE_ITEM: "evidence-items.get",
  ACCREDIBLE_CERTIFICATES_GET_GROUP: "groups.get",
  ACCREDIBLE_CERTIFICATES_GET_ISSUER: "issuer.get",
  ACCREDIBLE_CERTIFICATES_GET_REFERENCE: "references.get",
  ACCREDIBLE_CERTIFICATES_INITIALIZE_BADGE_DESIGNER: "designers.badge.initialize",
  ACCREDIBLE_CERTIFICATES_INITIALIZE_CERTIFICATE_DESIGNER: "designers.certificate.initialize",
  ACCREDIBLE_CERTIFICATES_LIST_TEMPLATES: "templates.list",
  ACCREDIBLE_CERTIFICATES_SEARCH_ATTRIBUTE_KEYS: "attribute-keys.search",
  ACCREDIBLE_CERTIFICATES_SEARCH_COLLECTIONS: "collections.search",
  ACCREDIBLE_CERTIFICATES_SEARCH_CREDENTIALS_V2: "credentials.search-v2",
  ACCREDIBLE_CERTIFICATES_SEARCH_DEPARTMENTS: "departments.search",
  ACCREDIBLE_CERTIFICATES_SEARCH_DESIGNS: "designs.search",
  ACCREDIBLE_CERTIFICATES_SEARCH_GROUPS: "groups.search",
  ACCREDIBLE_CERTIFICATES_UPDATE_CREDENTIAL: "credentials.update",
  ACCREDIBLE_CERTIFICATES_UPDATE_EVIDENCE_ITEM: "evidence-items.update",
  ACCREDIBLE_CERTIFICATES_UPDATE_GROUP: "groups.update",
  ACCREDIBLE_CERTIFICATES_UPDATE_REFERENCE: "references.update",
  ACCREDIBLE_CERTIFICATES_VIEW_ALL_SKILL_CATEGORIES: "skill-categories.list",
};

const compiled = compileDeclarativeConnector(manifest as never);

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}

function dummyInput(schema: { properties?: Record<string, any>; required?: string[] }): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const key of schema.required ?? []) {
    const prop = schema.properties?.[key] ?? {};
    if (key === "credentials") {
      input[key] = [{ group_id: 1, recipient: { name: "Ada", email: "ada@example.com" } }];
    } else if (key === "credential_ids") {
      input[key] = ["10000005"];
    } else if (key === "query") {
      input[key] = { name: "x" };
    } else if (key === "reference") {
      input[key] = { description: "Great work", relationship: "mentored" };
    } else if (key === "recipient") {
      input[key] = { name: "Ada", email: "ada@example.com" };
    } else if (Array.isArray(prop.enum) && prop.enum.length > 0) {
      input[key] = prop.enum[0];
    } else if (prop.type === "integer" || prop.type === "number") {
      input[key] = 1;
    } else if (prop.type === "boolean") {
      input[key] = true;
    } else if (prop.type === "array") {
      const items = prop.items ?? {};
      input[key] = items.type === "object" ? [{ id: 1 }] : ["a"];
    } else if (prop.type === "object") {
      input[key] = { id: 1 };
    } else {
      input[key] = key.includes("email") ? "ada@example.com" : "x";
    }
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

describe("accredible-certificates manifest", () => {
  test("has bounded host, origin auth, version, and compiles", () => {
    expect(manifest.key).toBe("accredible-certificates");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.network.allowedHosts).toEqual(["api.accredible.com"]);
    expect(manifest.http.baseUrl).toBe("https://api.accredible.com");
    expect(manifest.http.auth.value).toBe("Token token={{apiKey}}");
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin five operations", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(String(requestOf(key).path).startsWith("/"), key).toBe(true);
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/v1/issuer/details" });
    expect(requestOf("groups.list").path).toBe("/v1/issuer/all_groups");
    expect(requestOf("groups.get").path).toBe("/v1/issuer/groups/{{groupId}}");
    expect(requestOf("credentials.list").path).toBe("/v1/all_credentials");
    expect(requestOf("credentials.get").path).toBe("/v1/credentials/{{id}}");
    expect((operations["groups.get"]!.inputSchema as { required: string[] }).required).toEqual(["groupId"]);
    expect((operations["credentials.get"]!.inputSchema as { required: string[] }).required).toEqual(["id"]);
  });

  test("covers every Composio Accredible tool with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(36);
    expect(Object.keys(operations).length).toBe(39);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      expect(requestOf(key), slug).toBeDefined();
      expect(compiled.actions[key], slug).toBeTypeOf("function");
    }
    expect(operations["healthcheck"]).toBeDefined();
    expect(operations["groups.list"]).toBeDefined();
    expect(operations["credentials.list"]).toBeDefined();
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
      else if (["POST", "PUT", "PATCH"].includes(method)) {
        if (key.endsWith(".search") || key.endsWith("search-v2") || key === "analytics.get" || key === "credentials.analytics.get") {
          expect(operation.sideEffect, key).toBe("read");
        } else {
          expect(["write", "read"], key).toContain(operation.sideEffect);
          if (!key.includes("search") && key !== "credentials.analytics.get") {
            expect(operation.sideEffect, key).toBe("write");
          }
        }
      } else expect(operation.sideEffect, key).toBe("read");
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

  test("puts JSON Content-Type only on bodies", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const method = String(request.method);
      const headers = (request.headers as Record<string, string> | undefined) ?? {};
      if (request.body !== undefined) {
        expect(headers["Content-Type"], key).toBe("application/json");
      } else {
        expect(headers["Content-Type"], key).toBeUndefined();
      }
      if (method === "GET") expect(request.body, key).toBeUndefined();
    }
  });

  test("maps documented Accredible paths and Composio aliases", () => {
    expect(requestOf("credentials.bulk-create").path).toBe("/v2/credentials/bulk_create");
    expect(requestOf("groups.clone").path).toBe("/v1/issuer/groups/{{group_id}}/clone");
    expect(requestOf("credentials.create").path).toBe("/v1/credentials");
    expect(requestOf("credentials.search-v2").path).toBe("/v2/credentials/search");
    expect(requestOf("credentials.generate-pdfs").path).toBe("/v1/credentials/generate_pdf");
    expect(requestOf("analytics.get").path).toBe("/v1/analytics");
    expect(requestOf("issuer.get").path).toBe("/v1/issuer/details");
    expect(requestOf("templates.list").path).toBe("/v1/designs");
    expect(requestOf("designers.badge.initialize").path).toBe("/v1/designers/badge/initialize");
    expect(requestOf("designers.certificate.initialize").path).toBe("/v1/designers/certificate/initialize");
    expect(requestOf("skill-categories.list").path).toBe("/v1/skill_categories");
    expect(requestOf("collections.search").path).toBe("/v1/collections/search");
    expect(requestOf("evidence-items.create").path).toBe("/v1/credentials/{{credential_id}}/evidence_items");
    expect(requestOf("references.create").path).toBe("/v1/credentials/{{credential_id}}/references");
    expect((requestOf("credentials.create").body as Record<string, unknown>).credential).toBeDefined();
    expect((requestOf("groups.create").body as Record<string, unknown>).group).toBeDefined();
    expect((requestOf("templates.list").query as Record<string, string>).page_size).toBe("{{per_page}}");
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/accredible_certificates/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.2.0");
  });
});

describe("accredible-certificates compiled handlers", () => {
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

  test("every operation dispatches a real HTTP request for required input", async () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as { method: string; path: string };
      const input = dummyInput(operation.inputSchema as { properties?: Record<string, any>; required?: string[] });
      const { requests, result } = await invoke(key, input, () => jsonResponse({ ok: true }));
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      expect(new URL(requests[0]!.url).hostname, key).toBe("api.accredible.com");
      expect(requests[0]!.headers.get("authorization"), key).toBe("Token token=dummy");
      expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      expect(result).toMatchObject({ connector: "accredible-certificates", action: key, source: "provider" });
    }
  });

  test("origin healthcheck still probes GET /v1/issuer/details", async () => {
    const { requests } = await invoke("healthcheck", {}, () => jsonResponse({ issuer: { id: 1 } }));
    expect(new URL(requests[0]!.url).pathname).toBe("/v1/issuer/details");
    expect(requests[0]!.method).toBe("GET");
  });

  test("create credential wraps recipient fields", async () => {
    const { requests } = await invoke(
      "credentials.create",
      { group_id: 9549, recipient_name: "Jordan Smith", recipient_email: "jor@dan.org" },
      () => jsonResponse({ credential: { id: "10000005" } }),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/v1/credentials");
    expect(await requests[0]!.json()).toEqual({
      credential: { group_id: 9549, recipient: { name: "Jordan Smith", email: "jor@dan.org" } },
    });
  });

  test("search credentials v2 posts operator query keys", async () => {
    const { requests } = await invoke(
      "credentials.search-v2",
      { query: { "group.id[in]": [1, 2] } },
      () => jsonResponse({ credentials: [] }),
    );
    expect(new URL(requests[0]!.url).pathname).toBe("/v2/credentials/search");
    expect(await requests[0]!.json()).toEqual({ query: { "group.id[in]": [1, 2] } });
  });

  test("runs fixtures against compiled handlers", async () => {
    const caseDir = join(import.meta.dir, "../fixtures/cases");
    const files = readdirSync(caseDir).filter((name) => name.endsWith(".json")).sort();
    expect(files.length).toBeGreaterThan(20);
    const positive = new Set<string>();
    for (const file of files) {
      const raw = JSON.parse(readFileSync(join(caseDir, file), "utf8")) as {
        id: string;
        operation: string;
        input: Record<string, unknown>;
        credentials: Record<string, string>;
        exchanges: Array<{
          request: { method: string; url: string; headers?: Record<string, string>; body: unknown };
          response: { status: number; headers?: Record<string, string>; bodyFile: string };
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
        const bodyBytes = readFileSync(join(dirname(join(caseDir, file)), expected.response.bodyFile));
        const status = expected.response.status;
        if (status === 204) return new Response(null, { status, headers: expected.response.headers });
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
      positive.add(raw.operation);
    }
    expect([...positive].sort()).toEqual(Object.keys(operations).sort());
  });
});
