import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import coverage from "../../conversion-tools.coverage.json";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const operations = manifest.operations as Record<string, {
  kind?: string;
  sideEffect?: string;
  timeoutMs?: number;
  maxInputBytes?: number;
  maxResponseBytes?: number;
  title?: string;
  description?: string;
  responseFormat?: string;
  validationMode?: string;
  enforceOutputSchema?: boolean;
  inputSchema?: { type?: string; additionalProperties?: boolean; properties?: Record<string, unknown> };
  outputSchema?: { type?: string };
  request?: { method?: string; path?: string; body?: unknown; headers?: Record<string, string>; query?: unknown };
}>;

const liveTools = [
  "CONVERSION_TOOLS_CONVERT_EXCEL_TO_HTML",
  "CONVERSION_TOOLS_CONVERT_WORD_TO_TEXT",
  "CONVERSION_TOOLS_CREATE_TASK",
  "CONVERSION_TOOLS_DOWNLOAD_FILE",
  "CONVERSION_TOOLS_GET_AUTH_INFO",
  "CONVERSION_TOOLS_GET_CONFIG",
  "CONVERSION_TOOLS_GET_FILE_INFO",
  "CONVERSION_TOOLS_GET_TASK_STATUS",
  "CONVERSION_TOOLS_LIST_TASKS",
  "CONVERSION_TOOLS_UPDATE_TASK_RETENTION",
  "CONVERSION_TOOLS_UPLOAD_FILE",
];

const forbiddenInputKeys = new Set(["url", "file_url", "fileUrl", "callbackUrl", "callback_url"]);

const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });

describe("Conversion Tools contract", () => {
  test("maps every live tool to one JSON route or a non-JSON gap", () => {
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
    for (const row of coverage.missing_still) {
      expect(row.why.length, row.tool).toBeGreaterThan(0);
      expect(operations[row.tool], row.tool).toBeUndefined();
    }
  });

  test("uses bearer auth on the documented host and stays inside JSON bounds", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.conversiontools.io"]);
    expect(manifest.http.baseUrl).toBe("https://api.conversiontools.io/v1");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "Bearer {{apiKey}}",
    });
    const httpHeaders = (manifest.http.headers ?? {}) as Record<string, string>;
    expect(httpHeaders["Content-Type"] ?? httpHeaders["content-type"]).toBeUndefined();
    for (const [name, operation] of Object.entries(operations)) {
      expect(operation.kind, name).toBe("action");
      expect(operation.title, name).toBeString();
      expect(operation.description, name).toBeString();
      expect(operation.responseFormat, name).toBe("json");
      expect(operation.validationMode, name).toBe("strict-generated");
      expect(operation.enforceOutputSchema, name).toBe(true);
      expect(operation.outputSchema?.type, name).toBe("object");
      expect(operation.inputSchema?.type, name).toBe("object");
      expect(operation.inputSchema?.additionalProperties, name).toBe(false);
      expect(operation.timeoutMs, name).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs, name).toBeLessThanOrEqual(300000);
      expect(operation.maxInputBytes, name).toBeLessThanOrEqual(26214400);
      expect(operation.maxResponseBytes, name).toBeGreaterThanOrEqual(operation.maxInputBytes ?? 0);
      const keys = Object.keys(operation.inputSchema?.properties ?? {});
      for (const key of keys) expect(forbiddenInputKeys.has(key), `${name} ${key}`).toBe(false);
      const request = operation.request;
      expect(request?.method, name).toBeString();
      expect(String(request?.path ?? "").startsWith("/"), name).toBe(true);
      if (request?.method === "GET" || request?.method === "DELETE") {
        expect(request.body, name).toBeUndefined();
        expect(request.headers?.["Content-Type"] ?? request.headers?.["content-type"], name).toBeUndefined();
      }
      if (request?.body !== undefined) {
        expect(request.headers?.["Content-Type"], name).toBe("application/json");
      }
    }
  });

  test("creates an excel task from a file id and does not send a URL", async () => {
    const seen: Request[] = [];
    const result = await actions["convert.excel-to-html"]!({
      apiKey: "secret",
      fileId: "be87de1a680c4451a49a72df3fecd3fd",
      sheet: "Sheet1",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ error: null, task_id: "4147c475ffe94ec8a11aff9a6a8f437a" });
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("POST");
    expect(seen[0].url).toBe("https://api.conversiontools.io/v1/tasks");
    expect(seen[0].headers.get("authorization")).toBe("Bearer secret");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    const body = JSON.parse(await seen[0].text()) as { type: string; options: Record<string, unknown> };
    expect(body).toEqual({
      type: "convert.excel_to_html",
      options: { file_id: "be87de1a680c4451a49a72df3fecd3fd", sheet: "Sheet1" },
    });
    expect(body.options.url).toBeUndefined();
    expect(result).toMatchObject({
      connector: "conversion-tools",
      action: "convert.excel-to-html",
      source: "provider",
      data: { error: null, task_id: "4147c475ffe94ec8a11aff9a6a8f437a" },
    });
  });

  test("omits the status query unless it is set and encodes the task id", async () => {
    const seen: Request[] = [];
    const fetch = async (input: string | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return response({ error: null, data: [] });
    };
    await actions["tasks.list"]!({ apiKey: "secret", fetch });
    expect(seen[0].method).toBe("GET");
    expect(seen[0].url).toBe("https://api.conversiontools.io/v1/tasks");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(seen[0].body).toBeNull();
    await actions["tasks.list"]!({ apiKey: "secret", status: "ERROR", fetch });
    expect(new URL(seen[1].url).searchParams.get("status")).toBe("ERROR");
    await actions["tasks.get"]!({
      apiKey: "secret",
      taskId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/",
      fetch,
    });
    expect(new URL(seen[2].url).pathname).toBe("/v1/tasks/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa%2F");
  });

  test("rejects a URL field, a short file id, bad retention, non-object JSON, and upstream errors", async () => {
    const fileId = "be87de1a680c4451a49a72df3fecd3fd";
    const ok = async () => response({ error: null, task_id: "4147c475ffe94ec8a11aff9a6a8f437a" });
    await expect(actions["tasks.create"]!({ apiKey: "secret", type: "convert.xml_to_excel", fileId, url: "https://example.com/a.xml", fetch: ok })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["convert.word-to-text"]!({ apiKey: "secret", fileId: "", fetch: ok })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["tasks.retention.update"]!({ apiKey: "secret", taskId: fileId, retentionMode: "forever", fetch: ok })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["auth.get"]!({ apiKey: "secret", fetch: async () => response("ok") })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["config.get"]!({ apiKey: "secret", fetch: async () => response([]) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["files.info"]!({ apiKey: "secret", fileId, fetch: async () => response({ error: "unauthorized" }, 401) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["tasks.list"]!({ apiKey: "secret", fetch: async () => response({}, 429, { "Retry-After": "4" }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
    const failed = await actions["tasks.get"]!({
      apiKey: "secret",
      taskId: "4147c475ffe94ec8a11aff9a6a8f437a",
      fetch: async () => response({ error: "Wrong file format", status: "ERROR", file_id: null, conversionProgress: 0 }),
    });
    expect(failed.data).toMatchObject({ status: "ERROR", error: "Wrong file format" });
  });
});
