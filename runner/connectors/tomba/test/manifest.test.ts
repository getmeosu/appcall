import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "emails.count", "domain.search", "email.finder"] as const;

const COMPOSIO_TOOLS: Record<string, string> = {
  TOMBA_ATTRIBUTES_LIST: "attributes.list",
  TOMBA_DOMAIN_STATUS: "domain.status",
  TOMBA_ENRICH_COMPANY: "company.enrich",
  TOMBA_ENRICH_PERSON: "person.enrich",
  TOMBA_ENRICH_PERSON_AND_COMPANY: "combined.enrich",
  TOMBA_FIND_AUTHOR: "author.finder",
  TOMBA_FIND_EMAIL: "email.finder",
  TOMBA_FIND_EMAIL_FROM_LINKEDIN: "linkedin.finder",
  TOMBA_FIND_PHONE: "phone.finder",
  TOMBA_GET_EMAIL_COUNT: "emails.count",
  TOMBA_GET_EMAIL_FORMAT: "email.format",
  TOMBA_GET_EMAIL_SOURCES: "email.sources",
  TOMBA_GET_EMPLOYEE_LOCATIONS: "employees.locations",
  TOMBA_KEYS_DELETE: "keys.delete",
  TOMBA_KEYS_LIST: "keys.list",
  TOMBA_LEADS_CREATE: "leads.create",
  TOMBA_LEADS_LIST: "leads.list",
  TOMBA_LISTS_DELETE: "lists.delete",
  TOMBA_LISTS_LIST: "lists.list",
  TOMBA_LISTS_UPDATE: "lists.update",
  TOMBA_SEARCH_DOMAIN_CONTACTS: "domain.search",
  TOMBA_USAGE_STATS: "usage.get",
  TOMBA_VALIDATE_PHONE: "phone.validate",
  TOMBA_VERIFY_EMAIL: "email.verifier",
  TOMBA_VERIFY_EMAILS: "emails.verify_bulk",
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
    else if (prop.type === "array") input[key] = key === "emails" ? ["jane.doe@stripe.com"] : ["x"];
    else if (prop.type === "object") input[key] = { id: 1 };
    else if (key === "email") input[key] = "jane.doe@stripe.com";
    else if (key === "domain") input[key] = "stripe.com";
    else if (key === "phone") input[key] = "+14155550132";
    else if (key === "url" || key === "linkedin" || key === "website") input[key] = "https://www.linkedin.com/in/jane-doe";
    else if (key === "country" || key === "country_code") input[key] = "US";
    else input[key] = typeof prop.minLength === "number" && prop.minLength > 1 ? "x".repeat(prop.minLength) : "x";
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

describe("tomba manifest", () => {
  test("has bounded host, origin auth, version, and compiles", () => {
    expect(manifest.key).toBe("tomba");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["crm"]);
    expect(manifest.network.allowedHosts).toEqual(["api.tomba.io"]);
    expect(manifest.http.baseUrl).toBe("https://api.tomba.io/v1");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.name).toBe("X-Tomba-Key");
    expect(manifest.http.auth.value).toBe("{{apiKey}}");
    expect(manifest.http.headers).toEqual({ Accept: "application/json", "X-Tomba-Secret": "{{apiSecret}}" });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin four operations", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(requestOf(key), key).toBeDefined();
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/me" });
    expect(requestOf("emails.count")).toMatchObject({ method: "GET", path: "/email-count" });
    expect(requestOf("domain.search")).toMatchObject({ method: "GET", path: "/domain-search" });
    expect(requestOf("email.finder")).toMatchObject({ method: "GET", path: "/email-finder" });
    expect((operations["emails.count"]!.inputSchema as { required: string[] }).required).toEqual(["domain"]);
    expect((operations["email.finder"]!.inputSchema as { required: string[] }).required).toEqual(["domain", "firstName", "lastName"]);
    expect((requestOf("email.finder").query as Record<string, string>).first_name).toBe("{{firstName}}");
    expect((requestOf("email.finder").query as Record<string, string>).last_name).toBe("{{lastName}}");
  });

  test("covers every Composio Tomba tool with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(25);
    expect(Object.keys(operations).length).toBe(26);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      expect(requestOf(key), slug).toBeDefined();
      expect(compiled.actions[key], slug).toBeTypeOf("function");
    }
    expect(compiled.actions.healthcheck).toBeTypeOf("function");
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

  test("maps documented Tomba paths and Composio aliases", () => {
    expect(requestOf("attributes.list").path).toBe("/attributes");
    expect(requestOf("author.finder").path).toBe("/author-finder");
    expect(requestOf("combined.enrich").path).toBe("/combined/find");
    expect(requestOf("company.enrich").path).toBe("/companies/find");
    expect(requestOf("domain.status").path).toBe("/domain-status");
    expect(requestOf("email.format").path).toBe("/email-format");
    expect(requestOf("email.sources").path).toBe("/email-sources");
    expect(requestOf("email.verifier").path).toBe("/email-verifier");
    expect(requestOf("emails.verify_bulk").path).toBe("/bulk/verifier");
    expect(requestOf("employees.locations").path).toBe("/location");
    expect(requestOf("keys.delete").path).toBe("/keys/{{key_id}}");
    expect(requestOf("keys.list").path).toBe("/keys");
    expect(requestOf("leads.create").path).toBe("/leads");
    expect(requestOf("linkedin.finder").path).toBe("/linkedin");
    expect(requestOf("lists.delete").path).toBe("/leads_lists/{{id}}");
    expect(requestOf("lists.list").path).toBe("/leads_lists");
    expect(requestOf("lists.update").path).toBe("/leads_lists/{{id}}");
    expect(requestOf("person.enrich").path).toBe("/people/find");
    expect(requestOf("phone.finder").path).toBe("/phone-finder");
    expect(requestOf("phone.validate").path).toBe("/phone-validator");
    expect(requestOf("usage.get").path).toBe("/usage");
    expect((requestOf("leads.create").body as Record<string, string>).website_url).toBe("{{website}}");
    expect((requestOf("leads.create").body as Record<string, string>).phone_number).toBe("{{phone}}");
    expect((requestOf("emails.verify_bulk").body as Record<string, unknown>).list).toBe("{{emails}}");
    expect((requestOf("emails.verify_bulk").body as Record<string, unknown>).launch).toBe(true);
    expect((requestOf("email.sources").success as number[])).toContain(201);
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/tomba/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.2.0");
  });
});

describe("tomba compiled handlers", () => {
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  async function invoke(key: string, input: Record<string, unknown>, respond: (request: Request) => Promise<Response> | Response) {
    const requests: Request[] = [];
    const result = await compiled.actions[key]!({
      apiKey: "dummy",
      apiSecret: "dummysecret",
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
      const { requests, result } = await invoke(key, input, () => jsonResponse({ ok: true }, request.success?.[0] ?? 200));
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      expect(new URL(requests[0]!.url).hostname, key).toBe("api.tomba.io");
      expect(requests[0]!.headers.get("x-tomba-key"), key).toBe("dummy");
      expect(requests[0]!.headers.get("x-tomba-secret"), key).toBe("dummysecret");
      expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      expect(result).toMatchObject({ connector: "tomba", action: key, source: "provider" });
    }
  });

  test("origin healthcheck still probes GET /me", async () => {
    const { requests } = await invoke("healthcheck", {}, () => jsonResponse({ data: { user_id: 1 } }));
    expect(new URL(requests[0]!.url).pathname).toBe("/v1/me");
    expect(requests[0]!.method).toBe("GET");
    expect(new URL(requests[0]!.url).search).toBe("");
  });

  test("optional domain.search query params are omitted when unset and encoded when set", async () => {
    const bare = await invoke("domain.search", { domain: "stripe.com" }, () => jsonResponse({ data: {} }));
    expect(new URL(bare.requests[0]!.url).href).toBe("https://api.tomba.io/v1/domain-search?domain=stripe.com");
    const filtered = await invoke(
      "domain.search",
      { domain: "stripe.com", page: 2, limit: 20, department: "engineering", country: "US", enrich_mobile: true },
      () => jsonResponse({ data: {} }),
    );
    const url = new URL(filtered.requests[0]!.url);
    expect(url.searchParams.get("domain")).toBe("stripe.com");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("limit")).toBe("20");
    expect(url.searchParams.get("department")).toBe("engineering");
    expect(url.searchParams.get("country")).toBe("US");
    expect(url.searchParams.get("enrich_mobile")).toBe("true");
  });

  test("leads.create maps website and phone to official fields", async () => {
    const { requests } = await invoke(
      "leads.create",
      { first_name: "Jane", email: "jane.doe@stripe.com", website: "stripe.com", phone: "+14155550123" },
      () => jsonResponse({ data: { id: 1 } }, 201),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/v1/leads");
    expect(await requests[0]!.json()).toEqual({
      first_name: "Jane",
      email: "jane.doe@stripe.com",
      website_url: "stripe.com",
      phone_number: "+14155550123",
    });
  });

  test("emails.verify_bulk creates and launches a verifier job", async () => {
    const emails = ["jane.doe@stripe.com", "ada@stripe.com"];
    const { requests } = await invoke("emails.verify_bulk", { emails }, () => jsonResponse({ data: { id: 4521 } }, 201));
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/v1/bulk/verifier");
    expect(await requests[0]!.json()).toEqual({ name: "AppCall email verify", list: emails, launch: true });
  });

  test("path segments are URL-encoded", async () => {
    const { requests } = await invoke("keys.delete", { key_id: "a/b?c" }, () => jsonResponse({ data: { status: true } }));
    expect(new URL(requests[0]!.url).pathname).toBe("/v1/keys/a%2Fb%3Fc");
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
