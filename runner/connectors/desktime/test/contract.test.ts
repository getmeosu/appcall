import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import coverage from "../../desktime.coverage.json";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });
const credentials = { apiKey: "fixture-api-key" };
const liveTools = [
  "DESKTIME_CREATE_PROJECT_WITH_TASK",
  "DESKTIME_GET_ACCOUNT_DETAILS",
  "DESKTIME_GET_ALL_COMPANY_EMPLOYEES",
  "DESKTIME_GET_EMPLOYEE",
  "DESKTIME_GET_EMPLOYEE_APPS",
  "DESKTIME_GET_EMPLOYEE_PROJECTS",
  "DESKTIME_GET_EMPLOYEE_PROJECTS_AND_APPS",
  "DESKTIME_GET_PROJECTS_LIST",
  "DESKTIME_PING_REQUEST",
  "DESKTIME_START_PROJECT_TASK",
  "DESKTIME_STOP_PROJECT_TASK",
];

describe("DeskTime declarative contract", () => {
  test("uses the documented host and X-API-Key header", () => {
    expect(manifest.key).toBe("desktime");
    expect(manifest.http.baseUrl).toBe("https://desktime.com/api/v2/json");
    expect(manifest.network.allowedHosts).toEqual(["desktime.com"]);
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "X-API-Key",
      value: "{{apiKey}}",
    });
    expect(manifest.auth.setup.fields.map((field: { key: string }) => field.key)).toEqual(["apiKey"]);
    expect(Object.keys(manifest.operations)).toHaveLength(11);
  });

  test("maps each live tool to one JSON route inside the budget", () => {
    expect(coverage.composio_tools).toBe(11);
    expect(coverage.missing_http).toEqual([]);
    expect(coverage.missing_still).toEqual([]);
    expect(coverage.mapped.map((entry: { tool: string }) => entry.tool)).toEqual(liveTools);
    const seen = new Set<string>();
    for (const entry of coverage.mapped) {
      const operation = manifest.operations[entry.operation];
      expect(operation?.request?.method, entry.tool).toBe(entry.method);
      expect(operation?.request?.path, entry.tool).toBe(entry.path);
      expect(operation.request.body, entry.tool).toBeUndefined();
      expect(operation.request.headers?.["Content-Type"], entry.tool).toBeUndefined();
      expect(operation.outputSchema.type, entry.tool).toBe("object");
      expect(operation.inputSchema.type, entry.tool).toBe("object");
      expect(operation.inputSchema.additionalProperties, entry.tool).toBe(false);
      expect(JSON.stringify(operation.inputSchema)).not.toContain("://");
      expect(operation.title.length, entry.tool).toBeGreaterThan(0);
      expect(operation.description.length, entry.tool).toBeGreaterThan(0);
      expect(operation.timeoutMs).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs).toBeLessThanOrEqual(300000);
      expect(operation.maxInputBytes).toBeLessThanOrEqual(26214400);
      expect(operation.maxResponseBytes).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect(operation.responseFormat, entry.tool).toBe("json");
      expect(operation.enforceOutputSchema, entry.tool).toBe(true);
      expect(["read", "write"]).toContain(operation.sideEffect);
      seen.add(entry.operation);
    }
    expect([...seen].sort()).toEqual(Object.keys(manifest.operations).sort());
    expect(manifest.operations["projects.create"].sideEffect).toBe("write");
    expect(manifest.operations["projects.start"].sideEffect).toBe("write");
    expect(manifest.operations["projects.stop"].sideEffect).toBe("write");
    expect(manifest.operations.ping.sideEffect).toBe("read");
  });

  test("omits optional filters and encodes project names on the documented paths", async () => {
    const seen: Request[] = [];
    await actions["employee.get"]!({
      ...credentials,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ id: 1, name: "Jim Miller" });
      },
    });
    expect(seen[0].url).toBe("https://desktime.com/api/v2/json/employee/basic");
    expect(seen[0].method).toBe("GET");
    await actions["projects.create"]!({
      ...credentials,
      project: "API Demo project",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ project: { id: 228577, name: "API Demo project" } });
      },
    });
    expect(seen[1].method).toBe("POST");
    expect(seen[1].url).toBe("https://desktime.com/api/v2/json/create-project?project=API+Demo+project");
    expect(seen[1].headers.get("content-type")).toBeNull();
    expect(await seen[1].text()).toBe("");
  });

  test("accepts the documented week period and rejects bad input, 401, and 429", async () => {
    const listed = await actions["employees.list"]!({
      ...credentials,
      date: "2025-10-01",
      period: "week",
      fetch: async () => response({ employees: { "2025-10-01": {} } }),
    });
    expect(listed.data.employees["2025-10-01"]).toEqual({});
    await expect(actions["projects.create"]!({ ...credentials, project: "", fetch: async () => response({}) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["employees.list"]!({ ...credentials, period: "year", fetch: async () => response({}) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["company.get"]!({ ...credentials, extra: true, fetch: async () => response({}) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["projects.list"]!({
      ...credentials,
      fetch: async () => response({ message: "bad fixture-api-key" }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "bad [REDACTED]" });
    await expect(actions["ping"]!({
      ...credentials,
      fetch: async () => response({ error: "slow down" }, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });

  test("does not call the network without the API key", async () => {
    let called = false;
    const result = await actions.ping!({
      fetch: async () => {
        called = true;
        return response({});
      },
    });
    expect(called).toBe(false);
    expect(result.source).toBe("connector");
  });
});
