import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import { uploadAttachment } from "../src/actions";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "projects.get", "projects.list", "tasks.get", "tasks.list"] as const;
const HANDWRITTEN = new Set(["attachments.upload"]);

const COMPOSIO_TOOLS: Record<string, string> = {
  BUGHERD_ADD_GUEST_TO_PROJECT: "projects.guests.add",
  BUGHERD_ADD_MEMBER_TO_PROJECT: "projects.members.add",
  BUGHERD_CREATE_ATTACHMENT: "attachments.create",
  BUGHERD_CREATE_COLUMN: "columns.create",
  BUGHERD_CREATE_COMMENT: "comments.create",
  BUGHERD_CREATE_PROJECT: "projects.create",
  BUGHERD_CREATE_TASK: "tasks.create",
  BUGHERD_CREATE_WEBHOOK: "webhooks.create",
  BUGHERD_DELETE_PROJECT: "projects.delete",
  BUGHERD_LIST_ACTIVE_PROJECTS: "projects.list-active",
  BUGHERD_LIST_ATTACHMENTS: "attachments.list",
  BUGHERD_LIST_COLUMNS: "columns.list",
  BUGHERD_LIST_PROJECTS: "projects.list",
  BUGHERD_LIST_PROJECT_TASKS: "tasks.list",
  BUGHERD_LIST_USERS: "users.list",
  BUGHERD_LIST_WEBHOOKS: "webhooks.list",
  BUGHERD_SHOW_ATTACHMENT: "attachments.get",
  BUGHERD_SHOW_COLUMN: "columns.get",
  BUGHERD_SHOW_ORGANIZATION: "organization.get",
  BUGHERD_SHOW_PROJECT: "projects.get",
  BUGHERD_SHOW_USER_PROJECTS: "users.projects.list",
  BUGHERD_SHOW_USER_TASKS: "users.tasks.list",
  BUGHERD_UPDATE_COLUMN: "columns.update",
  BUGHERD_UPDATE_PROJECT: "projects.update",
  BUGHERD_UPDATE_TASK: "tasks.update",
  BUGHERD_UPLOAD_ATTACHMENT: "attachments.upload",
};

const compiled = compileDeclarativeConnector(manifest as never);
const actions = {
  ...compiled.actions,
  "attachments.upload": uploadAttachment,
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
    else if (Array.isArray(prop.type) && prop.type.includes("integer")) input[key] = 1;
    else if (prop.type === "boolean") input[key] = true;
    else if (prop.type === "array") {
      const items = prop.items ?? {};
      input[key] = items.type === "object" ? [{ id: "a" }] : items.enum ? [items.enum[0]] : ["a"];
    } else if (prop.type === "object") {
      if (key === "project") input[key] = { name: "Site", devurl: "https://example.com" };
      else if (key === "task") input[key] = { status: "todo" };
      else if (key === "column") input[key] = { name: "QA" };
      else input[key] = dummyInput(prop);
    } else input[key] = key === "file_content" ? "hello" : key === "file_name" ? "note.txt" : "x";
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

describe("bug-herd manifest", () => {
  test("has bounded host, origin auth, version, and compiles", () => {
    expect(manifest.key).toBe("bug-herd");
    expect(manifest.version).toBe("0.2.1");
    expect(manifest.network.allowedHosts).toEqual(["www.bugherd.com"]);
    expect(manifest.http.baseUrl).toBe("https://www.bugherd.com");
    expect(manifest.http.auth).toMatchObject({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      basic: { username: "{{apiKey}}", password: "x" },
    });
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin five operations", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(String(requestOf(key).path).startsWith("/"), key).toBe(true);
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/api_v2/organization.json" });
    expect(requestOf("projects.get").path).toBe("/api_v2/projects/{{project_id}}.json");
    expect(requestOf("projects.list").path).toBe("/api_v2/projects.json");
    expect(requestOf("tasks.get").path).toBe("/api_v2/projects/{{project_id}}/tasks/{{task_id}}.json");
    expect(requestOf("tasks.list").path).toBe("/api_v2/projects/{{project_id}}/tasks.json");
    expect((operations["projects.get"]!.inputSchema as { required: string[] }).required).toEqual(["project_id"]);
    expect((operations["tasks.get"]!.inputSchema as { required: string[] }).required).toEqual(["project_id", "task_id"]);
  });

  test("covers every Composio BugHerd tool with a real request or handwritten handler", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(26);
    expect(Object.keys(operations).length).toBe(28);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      if (HANDWRITTEN.has(key)) {
        expect(operations[key]!.request, slug).toBeUndefined();
        expect(compiled.actions[key], slug).toBeUndefined();
        expect(actions[key], slug).toBeTypeOf("function");
      } else {
        expect(requestOf(key), slug).toBeDefined();
        expect(compiled.actions[key], slug).toBeTypeOf("function");
      }
    }
    expect(operations["healthcheck"]).toBeDefined();
    expect(operations["tasks.get"]).toBeDefined();
  });

  test("gives every action a title, description, object inputSchema, and request or handwritten handler", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(["read", "write", "destructive"], key).toContain(operation.sideEffect);
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      if (HANDWRITTEN.has(key)) {
        expect(operation.request, key).toBeUndefined();
      } else {
        expect(operation.request, `${key} must declare a request block`).toBeDefined();
        const request = operation.request as Record<string, unknown>;
        expect(typeof request.method, key).toBe("string");
        expect(typeof request.path, key).toBe("string");
        expect(String(request.path).startsWith("/"), key).toBe(true);
      }
    }
  });

  test("classifies mutating HTTP methods as write or destructive", () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (HANDWRITTEN.has(key)) {
        expect(operation.sideEffect, key).toBe("write");
        continue;
      }
      const method = String((operation.request as Record<string, unknown>).method);
      if (method === "DELETE") expect(operation.sideEffect, key).toBe("destructive");
      else if (["POST", "PUT", "PATCH"].includes(method)) expect(operation.sideEffect, key).toBe("write");
      else expect(operation.sideEffect, key).toBe("read");
    }
  });

  test("only interpolates path placeholders the schema requires", () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (HANDWRITTEN.has(key)) continue;
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
      if (HANDWRITTEN.has(key)) continue;
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

  test("maps documented BugHerd paths and Composio aliases", () => {
    expect(requestOf("organization.get").path).toBe("/api_v2/organization.json");
    expect(requestOf("users.list").path).toBe("/api_v2/users.json");
    expect(requestOf("users.projects.list").path).toBe("/api_v2/users/{{user_id}}/projects.json");
    expect(requestOf("users.tasks.list").path).toBe("/api_v2/users/{{user_id}}/tasks.json");
    expect(requestOf("projects.list-active").path).toBe("/api_v2/projects/active.json");
    expect(requestOf("projects.create")).toMatchObject({ method: "POST", path: "/api_v2/projects.json" });
    expect(requestOf("projects.update").path).toBe("/api_v2/projects/{{project_id}}.json");
    expect(requestOf("projects.delete")).toMatchObject({ method: "DELETE", path: "/api_v2/projects/{{project_id}}.json" });
    expect(requestOf("projects.members.add").path).toBe("/api_v2/projects/{{project_id}}/add_member.json");
    expect(requestOf("projects.guests.add").path).toBe("/api_v2/projects/{{project_id}}/add_guest.json");
    expect(requestOf("tasks.create").path).toBe("/api_v2/projects/{{project_id}}/tasks.json");
    expect(requestOf("tasks.update").path).toBe("/api_v2/projects/{{project_id}}/tasks/{{task_id}}.json");
    expect(requestOf("columns.list").path).toBe("/api_v2/projects/{{project_id}}/columns.json");
    expect(requestOf("columns.create").path).toBe("/api_v2/projects/{{project_id}}/columns.json");
    expect(requestOf("columns.get").path).toBe("/api_v2/projects/{{project_id}}/columns/{{column_id}}.json");
    expect(requestOf("columns.update").path).toBe("/api_v2/projects/{{project_id}}/columns/{{column_id}}.json");
    expect(requestOf("comments.create").path).toBe("/api_v2/projects/{{project_id}}/tasks/{{task_id}}/comments.json");
    expect(requestOf("attachments.list").path).toBe("/api_v2/projects/{{project_id}}/tasks/{{task_id}}/attachments.json");
    expect(requestOf("attachments.create").path).toBe("/api_v2/projects/{{project_id}}/tasks/{{task_id}}/attachments.json");
    expect(requestOf("attachments.get").path).toBe("/api_v2/projects/{{project_id}}/tasks/{{task_id}}/attachments/{{attachment_id}}.json");
    expect(requestOf("webhooks.list").path).toBe("/api_v2/webhooks.json");
    expect(requestOf("webhooks.create").path).toBe("/api_v2/webhooks.json");
    expect((requestOf("tasks.list").query as Record<string, string>).tag).toBe("{{tag}}");
    expect((requestOf("tasks.list").query as Record<string, string>).assigned_to_id).toBe("{{assigned_to_id}}");
    expect((requestOf("tasks.create").body as { task: Record<string, string> }).task.description).toBe("{{description}}");
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/bug_herd/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.2.0");
  });
});

describe("bug-herd compiled handlers", () => {
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  async function invoke(key: string, input: Record<string, unknown>, respond: (request: Request) => Promise<Response> | Response) {
    const requests: Request[] = [];
    const result = await actions[key]!({
      apiKey: "token",
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
      const request = (operation.request as { method?: string; path?: string; success?: number[] } | undefined) ?? {
        method: "POST",
        path: "/api_v2/projects/{{project_id}}/tasks/{{task_id}}/attachments/upload",
        success: [201],
      };
      const input = dummyInput(operation.inputSchema as { properties?: Record<string, any>; required?: string[] });
      const { requests, result } = await invoke(key, input, () => jsonResponse({ id: "ok" }, request.success?.[0] ?? 200));
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      expect(new URL(requests[0]!.url).hostname, key).toBe("www.bugherd.com");
      expect(requests[0]!.headers.get("authorization"), key).toBe("Basic dG9rZW46eA==");
      expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      if (key === "attachments.upload") {
        // Handwritten handler returns only the declared output; the runner owns the envelope.
        expect(Object.keys(result as Record<string, unknown>), key).toEqual(["data"]);
      } else {
        expect(result).toMatchObject({ connector: "bug-herd", action: key, source: "provider" });
      }
    }
  });

  test("origin healthcheck still probes GET /api_v2/organization.json", async () => {
    const { requests } = await invoke("healthcheck", {}, () => jsonResponse({ organization: { id: 42, name: "Example Studio" } }));
    expect(new URL(requests[0]!.url).pathname).toBe("/api_v2/organization.json");
    expect(requests[0]!.method).toBe("GET");
  });

  test("tasks.create wraps flattened Composio fields in {task}", async () => {
    const { requests } = await invoke(
      "tasks.create",
      { project_id: 46000, description: "Broken hero image", priority: "normal", status: "todo" },
      () => jsonResponse({ task: { id: 12345 } }, 201),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/api_v2/projects/46000/tasks.json");
    expect(await requests[0]!.json()).toEqual({ task: { description: "Broken hero image", priority: "normal", status: "todo" } });
  });

  test("projects.delete is destructive DELETE", async () => {
    const { requests, result } = await invoke("projects.delete", { project_id: 46000 }, () => jsonResponse({ success: true }));
    expect(requests[0]!.method).toBe("DELETE");
    expect(new URL(requests[0]!.url).pathname).toBe("/api_v2/projects/46000.json");
    expect(result).toMatchObject({ data: { success: true } });
  });

  test("attachments.upload posts multipart file content", async () => {
    const { requests, result } = await invoke(
      "attachments.upload",
      { project_id: 46000, task_id: 12345, file_name: "note.txt", file_content: "hello" },
      () => jsonResponse({ attachment: { id: 91, file_name: "note.txt" } }, 201),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/api_v2/projects/46000/tasks/12345/attachments/upload");
    expect(requests[0]!.headers.get("content-type") ?? "").toContain("multipart/form-data");
    const form = await requests[0]!.formData();
    const file = form.get("file");
    expect(file).toBeInstanceOf(File);
    expect((file as File).name).toBe("note.txt");
    expect(await (file as File).text()).toBe("hello");
    expect(result).toEqual({ data: { attachment: { id: 91, file_name: "note.txt" } } });
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
          response: { status: number; headers?: Record<string, string>; bodyFile: string };
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
        if (expected.request.body === null || expected.request.body === undefined) {
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
    }
  });
});
