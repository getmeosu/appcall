import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import coverage from "../../browseract.coverage.json";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, any>>;
const { actions } = compileDeclarativeConnector(manifest as never);
const liveTools = [
  "BROWSERACT_CANCEL_TASK",
  "BROWSERACT_GET_TASK",
  "BROWSERACT_GET_WORKFLOW",
  "BROWSERACT_GET_WORKFLOW_TEMPLATE",
  "BROWSERACT_LIST_PROXY_REGIONS",
  "BROWSERACT_LIST_TASKS",
  "BROWSERACT_LIST_WORKFLOWS",
  "BROWSERACT_LIST_WORKFLOW_TEMPLATES",
  "BROWSERACT_RESUME_TASK",
  "BROWSERACT_RUN_WORKFLOW",
  "BROWSERACT_RUN_WORKFLOW_TEMPLATE",
];

const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

describe("BrowserAct contract", () => {
  test("maps every live tool to one request or a single-route gap", () => {
    const mapped = coverage.mapped.map((row) => row.tool);
    const missing = coverage.missing_still.map((row) => row.tool);
    expect(coverage.missing_http).toEqual([]);
    expect(coverage.composio_tools).toBe(liveTools.length);
    expect([...mapped, ...missing].sort()).toEqual([...liveTools].sort());
    expect(mapped.length + missing.length).toBe(liveTools.length);
    for (const row of coverage.mapped) {
      const operation = operations[row.operation];
      expect(operation?.request?.method, row.tool).toBe(row.method);
      expect(operation?.request?.path, row.tool).toBe(row.path);
      expect(typeof actions[row.operation], row.tool).toBe("function");
    }
    expect(Object.keys(operations).sort()).toEqual(coverage.mapped.map((row) => row.operation).sort());
  });

  test("keeps bearer auth, the documented host, and JSON bounds", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.browseract.com"]);
    expect(manifest.http.baseUrl).toBe("https://api.browseract.com");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "Bearer {{apiKey}}",
    });
    expect(manifest.auth.setup.fields.map((field: { key: string }) => field.key)).toEqual(["apiKey"]);
    for (const [name, operation] of Object.entries(operations)) {
      expect(operation.kind, name).toBe("action");
      expect(typeof operation.title, name).toBe("string");
      expect(typeof operation.description, name).toBe("string");
      expect(operation.inputSchema.type, name).toBe("object");
      expect(operation.outputSchema.type, name).toBe("object");
      expect(operation.responseFormat, name).toBe("json");
      expect(operation.validationMode, name).toBe("strict-generated");
      expect(operation.enforceOutputSchema, name).toBe(true);
      expect(operation.maxResponseBytes, name).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect(operation.maxInputBytes, name).toBeLessThanOrEqual(26214400);
      expect(operation.timeoutMs, name).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs, name).toBeLessThanOrEqual(300000);
      const method = operation.request.method;
      const keys = Object.keys(operation.inputSchema.properties ?? {});
      expect(keys, name).not.toContain("url");
      expect(keys, name).not.toContain("callbackUrl");
      expect(keys, name).not.toContain("callback_url");
      expect(keys, name).not.toContain("statusChangeCallbackUrl");
      expect(keys, name).not.toContain("status_change_callback_url");
      if (method === "GET" || method === "DELETE") {
        expect(operation.request.body, name).toBeUndefined();
        expect(operation.request.headers?.["Content-Type"], name).toBeUndefined();
      } else if (operation.request.body === undefined) {
        expect(operation.request.headers?.["Content-Type"], name).toBeUndefined();
      } else {
        expect(operation.request.headers?.["Content-Type"], name).toBe("application/json");
        expect(typeof operation.request.body, name).toBe("object");
      }
    }
  });

  test("sends bearer auth, encodes ids, and does not target a caller URL", async () => {
    const seen: Request[] = [];
    const fetch = async (input: string | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return json({ task_id: "93001", status: "created" });
    };
    await actions["workflows.run"]!({
      apiKey: "secret",
      botId: "bot/a",
      input: { url: "https://evil.example/path" },
      fetch,
    });
    expect(seen[0].headers.get("authorization")).toBe("Bearer secret");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    const url = new URL(seen[0].url);
    expect(url.hostname).toBe("api.browseract.com");
    expect(url.pathname).toBe("/v3/bots/bot%2Fa/runs");
    expect(url.hostname).not.toBe("evil.example");
    expect(await seen[0].json()).toEqual({ input: { url: "https://evil.example/path" } });
  });

  test("keeps cancel body-less and wraps the region array", async () => {
    const seen: Request[] = [];
    const fetch = async (input: string | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/regions")) return json([{ code: "US", name: "United States" }]);
      return json({ task_id: "93001", status: "canceled", updated_at: "2026-08-13T09:05:00Z" });
    };
    await actions["tasks.cancel"]!({ apiKey: "secret", taskId: "93001", fetch });
    expect(seen[0].method).toBe("POST");
    expect(new URL(seen[0].url).search).toBe("");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");
    const regions = await actions["regions.list"]!({ apiKey: "secret", fetch });
    expect(regions.data).toEqual([{ code: "US", name: "United States" }]);
    expect(seen[1].method).toBe("GET");
    expect(seen[1].headers.get("content-type")).toBeNull();
  });

  test("rejects invalid input, a non-array region payload, and unauthorized responses", async () => {
    const fetch = async () => json({ data: {} });
    await expect(actions["workflows.get"]!({ apiKey: "secret", botId: "", fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["regions.list"]!({ apiKey: "secret", fetch: async () => json({ code: "US" }) })).rejects.toMatchObject({
      code: "CONNECTOR_RESPONSE_INVALID",
    });
    await expect(actions["workflows.list"]!({ apiKey: "secret", fetch: async () => json({ msg: "no" }, 401) })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });
});
