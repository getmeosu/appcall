import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import { createWorkosActionHandlers } from "../src/actions";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "organizations.get", "organizations.list", "users.get", "users.list"] as const;
const IDENTIFIER_OPS = new Set(["organizations.get", "users.get"]);

const COMPOSIO_TOOLS: Record<string, string> = {
  WORKOS_CREATE_ORGANIZATION: "organizations.create",
  WORKOS_CREATE_ORGANIZATION_MEMBERSHIP: "organization_memberships.create",
  WORKOS_CREATE_USER: "users.create",
  WORKOS_DELETE_ORGANIZATION: "organizations.delete",
  WORKOS_DELETE_ORGANIZATION_MEMBERSHIP: "organization_memberships.delete",
  WORKOS_DELETE_USER: "users.delete",
  WORKOS_GET_CONNECTION: "connections.get",
  WORKOS_GET_DIRECTORY: "directories.get",
  WORKOS_GET_DIRECTORY_GROUP: "directory_groups.get",
  WORKOS_GET_DIRECTORY_USER: "directory_users.get",
  WORKOS_GET_INVITATION: "invitations.get",
  WORKOS_GET_ORGANIZATION: "organizations.get",
  WORKOS_GET_ORGANIZATION_MEMBERSHIP: "organization_memberships.get",
  WORKOS_GET_USER: "users.get",
  WORKOS_LIST_CONNECTIONS: "connections.list",
  WORKOS_LIST_DIRECTORIES: "directories.list",
  WORKOS_LIST_DIRECTORY_GROUPS: "directory_groups.list",
  WORKOS_LIST_DIRECTORY_USERS: "directory_users.list",
  WORKOS_LIST_INVITATIONS: "invitations.list",
  WORKOS_LIST_ORGANIZATION_MEMBERSHIPS: "organization_memberships.list",
  WORKOS_LIST_ORGANIZATIONS: "organizations.list",
  WORKOS_LIST_USERS: "users.list",
  WORKOS_RESEND_INVITATION: "invitations.resend",
  WORKOS_REVOKE_INVITATION: "invitations.revoke",
  WORKOS_SEND_INVITATION: "invitations.send",
  WORKOS_SET_ORGANIZATION_MEMBERSHIP_STATUS: "organization_memberships.set_status",
  WORKOS_UPDATE_ORGANIZATION: "organizations.update",
  WORKOS_UPDATE_ORGANIZATION_MEMBERSHIP_ROLES: "organization_memberships.update_roles",
  WORKOS_UPDATE_USER: "users.update",
};

const compiled = compileDeclarativeConnector(manifest as never);
const actions = { ...compiled.actions, ...createWorkosActionHandlers() };

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}

function dummyInput(key: string, schema: { properties?: Record<string, any>; required?: string[] }): Record<string, unknown> {
  if (key === "organizations.get") return { id: "org_01EHZNVPK3SFK441A1RGBFSHRT" };
  if (key === "users.get") return { id: "user_01E4ZCR3C56J083X43JQXF3JK5" };
  const input: Record<string, unknown> = {};
  for (const field of schema.required ?? []) {
    const prop = schema.properties?.[field] ?? {};
    if (Array.isArray(prop.enum) && prop.enum.length > 0) input[field] = prop.enum[0];
    else if (prop.type === "integer" || prop.type === "number") input[field] = 1;
    else if (prop.type === "boolean") input[field] = true;
    else if (prop.type === "array") {
      const items = prop.items ?? {};
      input[field] = items.enum ? [items.enum[0]] : ["example.com"];
    } else if (prop.type === "object") input[field] = { id: 1 };
    else input[field] = field.includes("email") ? "user@example.com" : "x";
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

describe("workos manifest", () => {
  test("has bounded host, origin auth, version, and compiles", () => {
    expect(manifest.key).toBe("workos");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["dev-tools"]);
    expect(manifest.network.allowedHosts).toEqual(["api.workos.com"]);
    expect(manifest.http.baseUrl).toBe("https://api.workos.com");
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
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/organizations", query: { limit: 1 } });
    expect(requestOf("organizations.get").path).toBe("/organizations/{{id}}");
    expect(requestOf("organizations.list").path).toBe("/organizations");
    expect(requestOf("users.get").path).toBe("/user_management/users/{{id}}");
    expect(requestOf("users.list").path).toBe("/user_management/users");
  });

  test("covers every Composio WorkOS tool with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(29);
    expect(Object.keys(operations).length).toBe(30);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      expect(requestOf(key), slug).toBeDefined();
      expect(actions[key], slug).toBeTypeOf("function");
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

  test("only interpolates path placeholders the schema requires, except identifier-routed gets", () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (IDENTIFIER_OPS.has(key)) continue;
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

  test("maps documented WorkOS paths and Composio aliases", () => {
    expect(requestOf("organizations.create").path).toBe("/organizations");
    expect(requestOf("organizations.delete").path).toBe("/organizations/{{organization_id}}");
    expect(requestOf("users.create").path).toBe("/user_management/users");
    expect(requestOf("invitations.send").path).toBe("/user_management/invitations");
    expect(requestOf("invitations.resend").path).toBe("/user_management/invitations/{{invitation_id}}/resend");
    expect(requestOf("invitations.revoke").path).toBe("/user_management/invitations/{{invitation_id}}/revoke");
    expect(requestOf("directory_groups.list").path).toBe("/directory_groups");
    expect(requestOf("directory_users.list").path).toBe("/directory_users");
    const groupParams = requestOf("directory_groups.list").parameters as Array<{ wireName: string; inputName: string }>;
    expect(groupParams.some((parameter) => parameter.wireName === "directory" && parameter.inputName === "directory_id")).toBe(true);
    expect(groupParams.some((parameter) => parameter.wireName === "user" && parameter.inputName === "directory_user_id")).toBe(true);
    const userParams = requestOf("directory_users.list").parameters as Array<{ wireName: string; inputName: string }>;
    expect(userParams.some((parameter) => parameter.wireName === "directory" && parameter.inputName === "directory_id")).toBe(true);
    expect(userParams.some((parameter) => parameter.wireName === "group" && parameter.inputName === "directory_group_id")).toBe(true);
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/workos/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.2.0");
  });
});

describe("workos compiled handlers", () => {
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  async function invoke(key: string, input: Record<string, unknown>, respond: (request: Request) => Promise<Response> | Response) {
    const requests: Request[] = [];
    const result = await actions[key]!({
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
      const request = operation.request as { method: string; path: string; success?: number[] };
      const input = dummyInput(key, operation.inputSchema as { properties?: Record<string, any>; required?: string[] });
      const { requests, result } = await invoke(key, input, () => jsonResponse({ object: "ok" }, request.success?.[0] ?? 200));
      expect(requests, key).toHaveLength(1);
      expect(new URL(requests[0]!.url).hostname, key).toBe("api.workos.com");
      expect(requests[0]!.headers.get("authorization"), key).toBe("Bearer dummy");
      expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      expect(result).toMatchObject({ connector: "workos", action: key, source: "provider" });
      if (key !== "organization_memberships.set_status") {
        expect(requests[0]!.method, key).toBe(request.method);
      }
    }
  });

  test("origin healthcheck still probes GET /organizations?limit=1", async () => {
    const { requests } = await invoke("healthcheck", {}, () => jsonResponse({ object: "list", data: [] }));
    expect(new URL(requests[0]!.url).href).toBe("https://api.workos.com/organizations?limit=1");
    expect(requests[0]!.method).toBe("GET");
  });

  test("optional query params are omitted when unset and encoded when set", async () => {
    const bare = await invoke("organizations.list", {}, () => jsonResponse({ object: "list", data: [] }));
    expect(new URL(bare.requests[0]!.url).href).toBe("https://api.workos.com/organizations");
    const filtered = await invoke("organizations.list", { search: "Foo", limit: 10, order: "desc" }, () => jsonResponse({ object: "list", data: [] }));
    const url = new URL(filtered.requests[0]!.url);
    expect(url.searchParams.get("search")).toBe("Foo");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("order")).toBe("desc");
  });

  test("next_cursor aliases after and domains repeat", async () => {
    const cursor = await invoke("organizations.list", { next_cursor: "obj_01HXYZ123456789ABCDEFGHIJ", limit: 10 }, () => jsonResponse({ object: "list", data: [] }));
    expect(new URL(cursor.requests[0]!.url).searchParams.get("after")).toBe("obj_01HXYZ123456789ABCDEFGHIJ");
    const originAfter = await invoke("organizations.list", { after: "obj_01HXYZ123456789ABCDEFGHIJ", limit: 10 }, () => jsonResponse({ object: "list", data: [] }));
    expect(new URL(originAfter.requests[0]!.url).searchParams.get("after")).toBe("obj_01HXYZ123456789ABCDEFGHIJ");
    const domains = await invoke("organizations.list", { domains: ["foo-corp.com", "example.com"] }, () => jsonResponse({ object: "list", data: [] }));
    expect(new URL(domains.requests[0]!.url).searchParams.getAll("domains")).toEqual(["foo-corp.com", "example.com"]);
  });

  test("directory list filters map Composio names onto official query keys", async () => {
    const groups = await invoke("directory_groups.list", { directory_id: "directory_01ECAZ4NV9QMV47GW873HDCX74", directory_user_id: "directory_user_01E1JG7J09H96KYP8HM9B0G5SJ" }, () => jsonResponse({ object: "list", data: [] }));
    const groupUrl = new URL(groups.requests[0]!.url);
    expect(groupUrl.searchParams.get("directory")).toBe("directory_01ECAZ4NV9QMV47GW873HDCX74");
    expect(groupUrl.searchParams.get("user")).toBe("directory_user_01E1JG7J09H96KYP8HM9B0G5SJ");
    const users = await invoke("directory_users.list", { directory_id: "directory_01ECAZ4NV9QMV47GW873HDCX74", directory_group_id: "directory_group_01E1JJS84MFPPQ3G655FHTKX6Z" }, () => jsonResponse({ object: "list", data: [] }));
    const userUrl = new URL(users.requests[0]!.url);
    expect(userUrl.searchParams.get("directory")).toBe("directory_01ECAZ4NV9QMV47GW873HDCX74");
    expect(userUrl.searchParams.get("group")).toBe("directory_group_01E1JJS84MFPPQ3G655FHTKX6Z");
  });

  test("get handlers accept origin id, Composio aliases, and external_id", async () => {
    const byId = await invoke("organizations.get", { id: "org_01EHZNVPK3SFK441A1RGBFSHRT" }, () => jsonResponse({ object: "organization" }));
    expect(new URL(byId.requests[0]!.url).pathname).toBe("/organizations/org_01EHZNVPK3SFK441A1RGBFSHRT");
    const byAlias = await invoke("organizations.get", { organization_id: "org_01EHZNVPK3SFK441A1RGBFSHRT" }, () => jsonResponse({ object: "organization" }));
    expect(new URL(byAlias.requests[0]!.url).pathname).toBe("/organizations/org_01EHZNVPK3SFK441A1RGBFSHRT");
    const byExternal = await invoke("organizations.get", { external_id: "2fe01467-f7ea-4dd2-8b79-c2b4f56d0191" }, () => jsonResponse({ object: "organization" }));
    expect(new URL(byExternal.requests[0]!.url).pathname).toBe("/organizations/external_id/2fe01467-f7ea-4dd2-8b79-c2b4f56d0191");
    const userExternal = await invoke("users.get", { external_id: "f1ffa2b2-c20b-4d39-be5c-212726e11222" }, () => jsonResponse({ object: "user" }));
    expect(new URL(userExternal.requests[0]!.url).pathname).toBe("/user_management/users/external_id/f1ffa2b2-c20b-4d39-be5c-212726e11222");
  });

  test("set_status routes active to reactivate and inactive to deactivate", async () => {
    const inactive = await invoke("organization_memberships.set_status", { membership_id: "om_01HXYZ123456789ABCDEFGHIJ", status: "inactive" }, () => jsonResponse({ object: "organization_membership", status: "inactive" }));
    expect(inactive.requests[0]!.method).toBe("PUT");
    expect(new URL(inactive.requests[0]!.url).pathname).toBe("/user_management/organization_memberships/om_01HXYZ123456789ABCDEFGHIJ/deactivate");
    const active = await invoke("organization_memberships.set_status", { membership_id: "om_01HXYZ123456789ABCDEFGHIJ", status: "active" }, () => jsonResponse({ object: "organization_membership", status: "active" }));
    expect(new URL(active.requests[0]!.url).pathname).toBe("/user_management/organization_memberships/om_01HXYZ123456789ABCDEFGHIJ/reactivate");
  });

  test("path segments are URL-encoded", async () => {
    const { requests } = await invoke("organizations.get", { id: "a/b?c" }, () => jsonResponse({ object: "organization" }));
    expect(new URL(requests[0]!.url).pathname).toBe("/organizations/a%2Fb%3Fc");
  });

  test("organizations.delete returns the static envelope", async () => {
    const { requests, result } = await invoke("organizations.delete", { organization_id: "org_01EHZNVPK3SFK441A1RGBFSHRT" }, () => new Response("", { status: 200, headers: { "content-type": "application/json" } }));
    expect(requests[0]!.method).toBe("DELETE");
    expect(new URL(requests[0]!.url).pathname).toBe("/organizations/org_01EHZNVPK3SFK441A1RGBFSHRT");
    expect(result).toEqual({ connector: "workos", action: "organizations.delete", source: "provider", success: true });
  });

  test("redacts invitation acceptance credentials", async () => {
    const { result } = await invoke("invitations.get", { invitation_id: "invitation_01E4ZCR3C56J083X43JQXF3JK5" }, () => jsonResponse({
      object: "invitation",
      id: "invitation_01E4ZCR3C56J083X43JQXF3JK5",
      token: "secret-token",
      accept_invitation_url: "https://example.com/invite?invitation_token=secret-token",
    }));
    expect(result).toEqual({
      connector: "workos",
      action: "invitations.get",
      source: "provider",
      data: { object: "invitation", id: "invitation_01E4ZCR3C56J083X43JQXF3JK5" },
    });
  });

  test("maps 401 and 429", async () => {
    await expect(invoke("healthcheck", {}, () => jsonResponse({ message: "nope" }, 401))).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    await expect(
      invoke("healthcheck", {}, () => new Response("{}", { status: 429, headers: { "retry-after": "4", "content-type": "application/json" } })),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });

  test("runs fixtures against compiled and handwritten handlers", async () => {
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
      const action = actions[raw.operation];
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
