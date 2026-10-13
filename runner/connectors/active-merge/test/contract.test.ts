import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import coverage from "../../active-merge.coverage.json";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, any>>;
const { actions } = compileDeclarativeConnector(manifest as never);
const liveTools = [
  "ACTIVE_MERGE_GENERATE_DOCUMENT",
  "ACTIVE_MERGE_GENERATE_IMAGES",
  "ACTIVE_MERGE_GENERATE_WORKFLOW_DOCUMENTS",
  "ACTIVE_MERGE_GET_CREDITS",
  "ACTIVE_MERGE_GET_DOCUMENT_GENERATIONS",
  "ACTIVE_MERGE_GET_DOCUMENT_TEMPLATE_PLACEHOLDERS",
  "ACTIVE_MERGE_GET_FILE_DOWNLOAD_URL",
  "ACTIVE_MERGE_GET_IMAGE_GENERATION",
  "ACTIVE_MERGE_GET_IMAGE_TEMPLATES",
  "ACTIVE_MERGE_GET_WORKFLOWS",
  "ACTIVE_MERGE_LIST_DOCUMENT_TEMPLATES",
  "ACTIVE_MERGE_LIST_FILES",
  "ACTIVE_MERGE_SAVE_GENERATED_FILES",
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("ActiveMerge contract", () => {
  test("maps every live tool to one request or a single-route gap", () => {
    const mapped = coverage.mapped.map((row) => row.tool);
    const missing = coverage.missing_still.map((row) => row.tool);
    expect(coverage.missing_http).toEqual([]);
    expect([...mapped, ...missing].sort()).toEqual([...liveTools].sort());
    expect(mapped.length + missing.length).toBe(liveTools.length);
    for (const row of coverage.mapped) {
      const operation = operations[row.operation];
      expect(typeof operation?.request?.method, row.tool).toBe("string");
      expect(typeof operation?.request?.path, row.tool).toBe("string");
      expect(typeof actions[row.operation], row.tool).toBe("function");
    }
  });

  test("keeps JSON bounds, body-less reads, and API-KEY auth", () => {
    expect(manifest.network.allowedHosts).toEqual(["app.activemerge.com"]);
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "API-KEY",
      value: "{{apiKey}}",
    });
    expect(manifest.http.baseUrl).toBe("https://app.activemerge.com");
    for (const [name, operation] of Object.entries(operations)) {
      expect(operation.kind, name).toBe("action");
      expect(typeof operation.title, name).toBe("string");
      expect(typeof operation.description, name).toBe("string");
      expect(operation.inputSchema.type, name).toBe("object");
      expect(operation.outputSchema.type, name).toBe("object");
      expect(operation.responseFormat, name).toBe("json");
      expect(operation.maxResponseBytes, name).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect(operation.maxInputBytes, name).toBeLessThanOrEqual(26214400);
      expect(operation.timeoutMs, name).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs, name).toBeLessThanOrEqual(300000);
      const method = operation.request.method;
      if (method === "GET" || method === "DELETE") {
        expect(operation.request.body, name).toBeUndefined();
        expect(operation.request.headers?.["Content-Type"], name).toBeUndefined();
      } else {
        expect(operation.request.headers?.["Content-Type"], name).toBe("application/json");
        expect(typeof operation.request.body, name).toBe("object");
      }
    }
  });

  test("sends API-KEY, omits optional query and body fields, and encodes ids", async () => {
    const seen: Request[] = [];
    const fetch = async (input: string | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return json({ total: 1, used: 0, left: 1 });
    };
    await actions["credits.get"]!({ apiKey: "secret", fetch });
    expect(seen[0].headers.get("api-key")).toBe("secret");
    expect(seen[0].headers.get("authorization")).toBeNull();
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");

    seen.length = 0;
    await actions["files.list"]!({ apiKey: "secret", fetch: async (input: string | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return json({ data: [] });
    } });
    expect(new URL(seen[0].url).search).toBe("");

    seen.length = 0;
    await actions["templates.placeholders"]!({
      apiKey: "secret",
      templateId: "abc/123",
      fetch: async (input: string | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return json(["ClientName"]);
      },
    });
    expect(new URL(seen[0].url).pathname).toBe("/api/templates/abc%2F123/placeholders");

    seen.length = 0;
    await actions["files.save"]!({
      apiKey: "secret",
      jobId: "job-1",
      fetch: async (input: string | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return json({ saved: [{ id: 1 }], count: 1 });
      },
    });
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(await seen[0].text()).toBe('{"job_id":"job-1"}');
  });

  test("rejects bad input, dot segments, malformed JSON, and 401", async () => {
    const fetch = async () => json({});
    await expect(actions["documents.generate"]!({
      apiKey: "secret",
      templateId: "abc123",
      data: { ClientName: "Ada" },
      format: "html",
      fetch,
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["credits.get"]!({ apiKey: "secret", extra: true, fetch })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["templates.placeholders"]!({
      apiKey: "secret",
      templateId: "..",
      fetch,
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["credits.get"]!({
      apiKey: "secret",
      fetch: async () => new Response("not-json", { status: 200, headers: { "content-type": "application/json" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["credits.get"]!({
      apiKey: "secret",
      fetch: async () => json({ message: "Unauthorized" }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("wraps a JSON array under data", async () => {
    const result = await actions["templates.list"]!({
      apiKey: "secret",
      fetch: async () => json([{ id: 1, unique_id: "abc123", name: "Invoice" }]),
    });
    expect(result.data).toEqual([{ id: 1, unique_id: "abc123", name: "Invoice" }]);
  });
});
