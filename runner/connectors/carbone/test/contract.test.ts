import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const coverage = JSON.parse(readFileSync(new URL("../../carbone.coverage.json", import.meta.url), "utf8"));
const operations = manifest.operations as Record<string, Record<string, unknown>>;
const LIVE_TOOLS = [
  "CARBONE_DELETE_TEMPLATE",
  "CARBONE_DOWNLOAD_TEMPLATE",
  "CARBONE_GENERATE_REPORT",
  "CARBONE_GET_STATUS",
  "CARBONE_LIST_TEMPLATE_CATEGORIES",
  "CARBONE_LIST_TEMPLATES",
  "CARBONE_LIST_TEMPLATE_TAGS",
  "CARBONE_RENDER_TEMPLATE_DIRECT",
  "CARBONE_SET_API_VERSION",
  "CARBONE_UPDATE_TEMPLATE",
  "CARBONE_UPLOAD_TEMPLATE",
];

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}

describe("carbone manifest", () => {
  test("compiles against the documented host and bearer auth", () => {
    expect(manifest.key).toBe("carbone");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.network.allowedHosts).toEqual(["api.carbone.io"]);
    expect(manifest.http.baseUrl).toBe("https://api.carbone.io");
    expect(manifest.http.baseUrl).not.toContain("{{");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "Bearer {{apiKey}}",
    });
    expect(manifest.http.headers).toEqual({
      Accept: "application/json",
      "carbone-version": "5",
    });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("gives every action one JSON request inside budget", () => {
    expect(Object.keys(operations).sort()).toEqual([
      "reports.generate",
      "reports.render-direct",
      "status.get",
      "templates.categories.list",
      "templates.delete",
      "templates.list",
      "templates.tags.list",
      "templates.update",
      "templates.upload",
    ]);
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect((operation.outputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.responseFormat, key).toBe("json");
      expect(operation.validationMode, key).toBe("strict-generated");
      expect(operation.enforceOutputSchema, key).toBe(true);
      const timeoutMs = operation.timeoutMs as number;
      const maxInputBytes = operation.maxInputBytes as number;
      const maxResponseBytes = operation.maxResponseBytes as number;
      expect(timeoutMs, key).toBeGreaterThanOrEqual(1);
      expect(timeoutMs, key).toBeLessThanOrEqual(300000);
      expect(maxInputBytes, key).toBeLessThanOrEqual(26214400);
      expect(maxResponseBytes, key).toBeGreaterThanOrEqual(maxInputBytes);
      const request = requestOf(key);
      expect(typeof request.method, key).toBe("string");
      expect(String(request.path).startsWith("/"), key).toBe(true);
      expect(request.baseUrl, key).toBeUndefined();
      expect(JSON.stringify(request), key).not.toContain("webhook");
      expect(JSON.stringify(request), key).not.toContain("multipart");
      expect(JSON.stringify(request), key).not.toContain("download");
      const headers = (request.headers as Record<string, string> | undefined) ?? {};
      if (request.method === "GET" || request.method === "DELETE") {
        expect(request.body, key).toBeUndefined();
        expect(headers["Content-Type"], key).toBeUndefined();
      } else {
        expect(request.body, key).toBeDefined();
        expect(headers["Content-Type"], key).toBe("application/json");
      }
      const success = request.success as number[];
      expect(success, key).toEqual([200]);
    }
    expect(operations["status.get"]!.sideEffect).toBe("read");
    expect(operations["templates.list"]!.sideEffect).toBe("read");
    expect(operations["templates.delete"]!.sideEffect).toBe("destructive");
    expect(operations["templates.upload"]!.sideEffect).toBe("write");
    expect(operations["templates.update"]!.sideEffect).toBe("write");
    expect(operations["reports.generate"]!.sideEffect).toBe("write");
    expect(operations["reports.render-direct"]!.sideEffect).toBe("write");
  });

  test("uses the documented Carbone routes", () => {
    expect(requestOf("status.get")).toMatchObject({ method: "GET", path: "/status" });
    expect(requestOf("templates.list")).toMatchObject({ method: "GET", path: "/templates" });
    expect(requestOf("templates.list").query).toEqual({
      id: "{{id}}",
      versionId: "{{versionId}}",
      category: "{{category}}",
      origin: "{{origin}}",
      includeVersions: "{{includeVersions}}",
      search: "{{search}}",
      limit: "{{limit}}",
      cursor: "{{cursor}}",
    });
    expect(requestOf("templates.categories.list")).toMatchObject({ method: "GET", path: "/templates/categories" });
    expect(requestOf("templates.tags.list")).toMatchObject({ method: "GET", path: "/templates/tags" });
    expect(requestOf("templates.upload")).toMatchObject({ method: "POST", path: "/template", success: [200] });
    expect(requestOf("templates.upload").body).toEqual({ template: "{{template}}" });
    expect(requestOf("templates.update")).toMatchObject({ method: "PATCH", path: "/template/{{templateId}}" });
    expect(requestOf("templates.update").body).toEqual({
      name: "{{name}}",
      tags: "{{tags}}",
      comment: "{{comment}}",
      category: "{{category}}",
      expireAt: "{{expireAt}}",
      deployedAt: "{{deployedAt}}",
    });
    expect(requestOf("templates.delete")).toMatchObject({ method: "DELETE", path: "/template/{{templateId}}" });
    expect(requestOf("reports.generate")).toMatchObject({ method: "POST", path: "/render/{{templateId}}" });
    expect(requestOf("reports.generate").query).toBeUndefined();
    expect(requestOf("reports.render-direct")).toMatchObject({ method: "POST", path: "/render/template" });
    expect(requestOf("reports.render-direct").query).toBeUndefined();
    const paths = Object.values(operations).map((operation) => String((operation.request as { path?: string }).path));
    expect(paths.some((path) => path.includes("://") || path.includes("render/{{renderId}}"))).toBe(false);
  });

  test("covers the live 11-tool list without a missing_http gap", () => {
    expect(LIVE_TOOLS).toHaveLength(11);
    expect(coverage.composio_tools).toBe(11);
    expect(coverage.missing_http).toEqual([]);
    const mapped = coverage.mapped as { tool: string; operation: string }[];
    const missing = coverage.missing_still as { tool: string; why: string }[];
    expect(mapped.length + missing.length).toBe(LIVE_TOOLS.length);
    expect([...mapped.map((item) => item.tool), ...missing.map((item) => item.tool)].sort()).toEqual([...LIVE_TOOLS].sort());
    for (const item of mapped) {
      expect(operations[item.operation], item.tool).toBeDefined();
      expect(typeof requestOf(item.operation).method, item.tool).toBe("string");
      expect(String(requestOf(item.operation).path).length, item.tool).toBeGreaterThan(1);
    }
    expect(missing.map((item) => item.tool).sort()).toEqual([
      "CARBONE_DOWNLOAD_TEMPLATE",
      "CARBONE_SET_API_VERSION",
    ]);
    for (const item of missing) expect(item.why.length, item.tool).toBeGreaterThan(0);
    expect(missing.find((item) => item.tool === "CARBONE_DOWNLOAD_TEMPLATE")!.why).toContain("file stream");
    expect(missing.find((item) => item.tool === "CARBONE_SET_API_VERSION")!.why).toContain("not an HTTP route");
  });
});
