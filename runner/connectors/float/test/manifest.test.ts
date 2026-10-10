import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import COMPOSIO_TOOLS from "./composio-cover.json";
import { floatActions } from "../src/actions";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "accounts.list", "people.list", "clients.list", "projects.list", "allocations.list"] as const;
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
    else if (Array.isArray(prop.type) && prop.type.includes("integer")) input[key] = 1;
    else if (prop.type === "boolean") input[key] = true;
    else if (prop.type === "array") {
      const items = prop.items ?? {};
      if (items.type === "integer" || items.type === "number") input[key] = [1];
      else input[key] = ["x"];
    } else input[key] = "x";
  }
  return input;
}

describe("float manifest", () => {
  test("has bounded hosts, origin auth, version, and compiles", () => {
    expect(manifest.key).toBe("float");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["scheduling"]);
    expect(manifest.network.allowedHosts).toEqual(["api.float.com"]);
    expect(manifest.http.baseUrl).toBe("https://api.float.com/v3");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(manifest.provenance.source).toEqual({
      url: "https://github.com/oomol-lab/open-connector",
      revision: "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a",
    });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin six operations", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(requestOf(key), key).toBeDefined();
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/accounts" });
    expect(requestOf("accounts.list").path).toBe("/accounts");
    expect(requestOf("people.list").path).toBe("/people");
    expect(requestOf("clients.list").path).toBe("/clients");
    expect(requestOf("projects.list").path).toBe("/projects");
    expect(requestOf("allocations.list").path).toBe("/tasks");
  });

  test("covers every Composio Float tool with a real request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(10);
    expect(Object.keys(operations).length).toBe(25);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      expect(requestOf(key), slug).toBeDefined();
      expect(compiled.actions[key], slug).toBeTypeOf("function");
      expect(floatActions[key], slug).toBeTypeOf("function");
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

  test("maps documented Float paths and Composio aliases", () => {
    expect(requestOf("projects.get").path).toBe("/projects/{{projectId}}");
    expect(requestOf("projects.create").path).toBe("/projects");
    expect(requestOf("projects.update").path).toBe("/projects/{{projectId}}");
    expect(requestOf("allocations.create").path).toBe("/tasks");
    expect(requestOf("allocations.update").path).toBe("/tasks/{{taskId}}");
    expect(requestOf("reports.people.get").path).toBe("/reports/people");
    expect(requestOf("reports.projects.get").path).toBe("/reports/projects");
    expect((requestOf("allocations.create").body as Record<string, string>).hours).toBe("{{hours}}");
    expect((requestOf("allocations.create").body as Record<string, string>).name).toBe("{{name}}");
    expect((requestOf("allocations.create").body as Record<string, string>).task_meta_id).toBe("{{projectTaskId}}");
    expect((requestOf("projects.create").body as Record<string, string>).non_billable).toBe("{{nonBillable}}");
  });
});

describe("float compiled and mapped handlers", () => {
  const jsonResponse = (body: unknown, status = 200, headers?: Record<string, string>) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

  async function invoke(
    key: string,
    input: Record<string, unknown>,
    respond: (request: Request) => Promise<Response> | Response,
    source: "mapped" | "compiled" = "mapped",
  ) {
    const requests: Request[] = [];
    const actions = source === "mapped" ? floatActions : compiled.actions;
    const result = await actions[key]!({
      apiKey: "secret",
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
    if ((operation.request as { result?: unknown }).result !== undefined) {
      if (String((operation.request as { method?: string }).method) === "GET" && String((operation.request as { path?: string }).path).includes("reports")) {
        return { people: [], projects: [] };
      }
      return [];
    }
    const dataType = ((operation.outputSchema as { properties?: { data?: { type?: string } } }).properties?.data?.type);
    return dataType === "array" ? [] : { id: 1 };
  }

  test("every operation dispatches a real HTTP request for required input", async () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as { method: string; path: string; success?: number[] };
      const input = dummyInput(operation.inputSchema as { properties?: Record<string, any>; required?: string[] });
      if (key === "allocations.create") input.hours_per_day = 4;
      const { requests, result } = await invoke(key, input, () => jsonResponse(dummyResponse(operation), request.success?.[0] ?? 200));
      expect(requests, key).toHaveLength(1);
      expect(requests[0]!.method, key).toBe(request.method);
      expect(new URL(requests[0]!.url).hostname, key).toBe("api.float.com");
      expect(new URL(requests[0]!.url).pathname.startsWith("/v3/"), key).toBe(true);
      expect(requests[0]!.headers.get("authorization"), key).toBe("Bearer secret");
      expect(requests[0]!.headers.get("accept"), key).toBe("application/json");
      expect(result).toMatchObject({ connector: "float", action: key, source: "provider" });
    }
  });

  test("origin healthcheck still probes GET /accounts?per-page=1", async () => {
    const { requests } = await invoke("healthcheck", {}, () => jsonResponse([{ id: 1 }]));
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe("/v3/accounts");
    expect(url.searchParams.get("per-page")).toBe("1");
    expect(requests[0]!.method).toBe("GET");
  });

  test("optional query params are omitted when unset and mapped when set", async () => {
    const bare = await invoke("projects.list", {}, () => jsonResponse([]));
    expect(new URL(bare.requests[0]!.url).href).toBe("https://api.float.com/v3/projects");
    const filtered = await invoke(
      "projects.list",
      {
        per_page: 25,
        client_id: 9,
        billable: true,
        status: "confirmed",
        tags: ["iphone app", "internal"],
        include: ["team", "phases"],
        project_code: "job-1",
      },
      () => jsonResponse([]),
    );
    const url = new URL(filtered.requests[0]!.url);
    expect(url.searchParams.get("per-page")).toBe("25");
    expect(url.searchParams.get("client_id")).toBe("9");
    expect(url.searchParams.get("non_billable")).toBe("0");
    expect(url.searchParams.get("status")).toBe("2");
    expect(url.searchParams.get("tags")).toBe("iphone app,internal");
    expect(url.searchParams.get("expand")).toBe("project_team,phases");
    expect(url.searchParams.get("project_code")).toBe("job-1");
  });

  test("people.list maps Composio filters onto Float query params", async () => {
    const { requests } = await invoke(
      "people.list",
      {
        active: false,
        department_id: 12,
        employment: "part_time",
        people_types: ["employee", "role_placeholder"],
        include: ["account"],
        email: "a@b.co",
        next_cursor: "3",
      },
      () => jsonResponse([]),
    );
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe("/v3/people");
    expect(url.searchParams.get("active")).toBe("0");
    expect(url.searchParams.get("department_id")).toBe("12");
    expect(url.searchParams.get("employee_type")).toBe("0");
    expect(url.searchParams.get("people_type_id")).toBe("1,4");
    expect(url.searchParams.get("expand")).toBe("account");
    expect(url.searchParams.get("email")).toBe("a@b.co");
    expect(url.searchParams.get("page")).toBe("3");
  });

  test("allocations.list maps billable boolean, recurrence, and task id", async () => {
    const { requests } = await invoke(
      "allocations.list",
      {
        project_id: 4,
        people_id: 2,
        start_date: "2026-01-01",
        end_date: "2026-01-31",
        billable: true,
        status: "tentative",
        recurrence: "weekly",
        project_task_id: 88,
        include_task_days: true,
      },
      () => jsonResponse([]),
    );
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe("/v3/tasks");
    expect(url.searchParams.get("project_id")).toBe("4");
    expect(url.searchParams.get("people_id")).toBe("2");
    expect(url.searchParams.get("start_date")).toBe("2026-01-01");
    expect(url.searchParams.get("end_date")).toBe("2026-01-31");
    expect(url.searchParams.get("billable")).toBe("1");
    expect(url.searchParams.get("status")).toBe("1");
    expect(url.searchParams.get("repeat_state")).toBe("1");
    expect(url.searchParams.get("task_meta_id")).toBe("88");
    expect(url.searchParams.get("expand")).toBe("task_days");
  });

  test("projects.create posts Composio fields as Float JSON", async () => {
    const { requests, result } = await invoke(
      "projects.create",
      {
        name: "Project One",
        status: "confirmed",
        billable: true,
        color: "#68ddfd",
        tags: ["internal"],
        start_date: "2026-01-01",
      },
      () => jsonResponse({ project_id: 1027707, name: "Project One" }, 201),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/v3/projects");
    expect(requests[0]!.headers.get("content-type")).toBe("application/json");
    expect(await requests[0]!.json()).toEqual({
      name: "Project One",
      tags: ["internal"],
      color: "68ddfd",
      status: 2,
      non_billable: 0,
      start_date: "2026-01-01",
    });
    expect(result).toMatchObject({ action: "projects.create", data: { project_id: 1027707 } });
  });

  test("allocations.create maps hours_per_day, people_ids, and recurrence", async () => {
    const { requests } = await invoke(
      "allocations.create",
      {
        project_id: 2,
        start_date: "2023-05-01",
        end_date: "2023-05-15",
        hours_per_day: 4,
        people_ids: [11, 12],
        status: "tentative",
        recurrence: "every_two_weeks",
        project_task_name: "Concepting",
        notes: "icons",
      },
      () => jsonResponse({ task_id: 1000001613 }, 201),
    );
    expect(requests[0]!.method).toBe("POST");
    expect(new URL(requests[0]!.url).pathname).toBe("/v3/tasks");
    expect(await requests[0]!.json()).toEqual({
      project_id: 2,
      start_date: "2023-05-01",
      end_date: "2023-05-15",
      hours: 4,
      people_ids: [11, 12],
      notes: "icons",
      status: 1,
      name: "Concepting",
      repeat_state: 3,
    });
  });

  test("updates send only supplied fields and preserve JSON null clears", async () => {
    const project = await invoke(
      "projects.update",
      { project_id: 1234, client_id: 0, active: false, status: "canceled" },
      () => jsonResponse({ project_id: 1234, active: 0 }),
    );
    expect(project.requests[0]!.method).toBe("PATCH");
    expect(new URL(project.requests[0]!.url).pathname).toBe("/v3/projects/1234");
    expect(await project.requests[0]!.json()).toEqual({ status: 4, active: 0, client_id: null });

    const allocation = await invoke(
      "allocations.update",
      { allocation_id: 56, phase_id: 0, project_task_id: 0, start_time: "", hours_per_day: 6 },
      () => jsonResponse({ task_id: 56 }),
    );
    expect(new URL(allocation.requests[0]!.url).pathname).toBe("/v3/tasks/56");
    expect(await allocation.requests[0]!.json()).toEqual({
      phase_id: null,
      start_time: null,
      hours: 6,
      task_meta_id: null,
    });
  });

  test("reports hit /reports/people and /reports/projects", async () => {
    const people = await invoke(
      "reports.people.get",
      { start_date: "2026-01-01", end_date: "2026-01-31", people_id: 2 },
      () => jsonResponse({ people: [{ people_id: 2, capacity: 40 }] }),
    );
    const peopleUrl = new URL(people.requests[0]!.url);
    expect(peopleUrl.pathname).toBe("/v3/reports/people");
    expect(peopleUrl.searchParams.get("start_date")).toBe("2026-01-01");
    expect(peopleUrl.searchParams.get("people_id")).toBe("2");

    const projects = await invoke(
      "reports.projects.get",
      { start_date: "2026-01-01", end_date: "2026-01-31", project_id: 4 },
      () => jsonResponse({ projects: [{ project_id: 4, scheduled: 10 }] }),
    );
    expect(new URL(projects.requests[0]!.url).pathname).toBe("/v3/reports/projects");
    expect(new URL(projects.requests[0]!.url).searchParams.get("project_id")).toBe("4");
  });

  test("path segments are URL-encoded", async () => {
    const { requests } = await invoke("projects.get", { project_id: 4 }, () => jsonResponse({ project_id: 4 }));
    expect(new URL(requests[0]!.url).pathname).toBe("/v3/projects/4");
  });

  test("maps 401 and 429", async () => {
    await expect(invoke("healthcheck", {}, () => jsonResponse({ error: "bad" }, 401))).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    await expect(
      invoke("healthcheck", {}, () => new Response("[]", { status: 429, headers: { "retry-after": "7", "content-type": "application/json" } })),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 7 });
  });
});
