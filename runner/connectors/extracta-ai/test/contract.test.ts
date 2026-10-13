import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const coverage = JSON.parse(readFileSync(new URL("../../extracta-ai.coverage.json", import.meta.url), "utf8"));
const operations = manifest.operations as Record<string, {
  kind?: string;
  title?: string;
  description?: string;
  sideEffect?: string;
  timeoutMs?: number;
  maxInputBytes?: number;
  maxResponseBytes?: number;
  inputSchema?: { type?: string; properties?: Record<string, unknown> };
  outputSchema?: { type?: string };
  responseFormat?: string;
  request?: { method?: string; path?: string; body?: unknown; headers?: Record<string, string>; baseUrl?: string };
}>;

const LIVE_TOOLS = [
  "EXTRACTA_AI_CREATE_CLASSIFICATION",
  "EXTRACTA_AI_CREATE_EXTRACTION",
  "EXTRACTA_AI_DELETE_CLASSIFICATION",
  "EXTRACTA_AI_DELETE_EXTRACTION",
  "EXTRACTA_AI_GET_BATCH_RESULTS",
  "EXTRACTA_AI_GET_CREDITS",
  "EXTRACTA_AI_UPDATE_CLASSIFICATION",
  "EXTRACTA_AI_UPDATE_EXTRACTION",
  "EXTRACTA_AI_VIEW_CLASSIFICATION",
  "EXTRACTA_AI_VIEW_EXTRACTION",
];

function requestOf(key: string) {
  return operations[key]!.request!;
}

function walk(value: unknown, visit: (key: string) => void) {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      visit(key);
      walk(child, visit);
    }
  }
}

describe("Extracta.ai contract", () => {
  test("compiles against the documented host and bearer auth", () => {
    expect(manifest.key).toBe("extracta-ai");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.network.allowedHosts).toEqual(["api.extracta.ai"]);
    expect(manifest.http.baseUrl).toBe("https://api.extracta.ai/api/v1");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "Bearer {{apiKey}}",
    });
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("uses one documented JSON route per action", () => {
    expect(Object.keys(operations).sort()).toEqual([
      "batches.results",
      "classifications.create",
      "classifications.update",
      "classifications.view",
      "credits.get",
      "extractions.create",
      "extractions.update",
      "extractions.view",
    ]);
    expect(requestOf("classifications.create")).toMatchObject({ method: "POST", path: "/documentClassification/createClassification" });
    expect(requestOf("classifications.update")).toMatchObject({ method: "PATCH", path: "/documentClassification/updateClassification" });
    expect(requestOf("classifications.view")).toMatchObject({ method: "POST", path: "/documentClassification/viewClassification" });
    expect(requestOf("extractions.create")).toMatchObject({ method: "POST", path: "/createExtraction" });
    expect(requestOf("extractions.update")).toMatchObject({ method: "PATCH", path: "/updateExtraction" });
    expect(requestOf("extractions.view")).toMatchObject({ method: "POST", path: "/viewExtraction" });
    expect(requestOf("batches.results")).toMatchObject({ method: "POST", path: "/getBatchResults" });
    expect(requestOf("credits.get")).toMatchObject({ method: "GET", path: "/credits" });
    expect(requestOf("credits.get").body).toBeUndefined();
    const paths = Object.values(operations).map((operation) => operation.request?.path);
    expect(paths).not.toContain("/uploadFiles");
    expect(paths).not.toContain("/deleteExtraction");
    expect(paths).not.toContain("/documentClassification/deleteClassification");
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request!;
      expect(request.baseUrl, key).toBeUndefined();
      expect(String(request.path).includes("http"), key).toBe(false);
      const names: string[] = [];
      walk(operation.inputSchema, (name) => names.push(name));
      expect(names, key).not.toContain("url");
      expect(names, key).not.toContain("baseUrl");
      if (request.method === "GET" || request.method === "DELETE") {
        expect(request.body, key).toBeUndefined();
        expect(request.headers?.["Content-Type"], key).toBeUndefined();
        expect(operation.sideEffect, key).toBe("read");
      } else {
        expect(request.body, key).toBeDefined();
        expect(request.headers?.["Content-Type"], key).toBe("application/json");
      }
    }
  });

  test("covers the live 10-tool list without a missing_http gap", () => {
    expect(LIVE_TOOLS).toHaveLength(10);
    expect(coverage.composio_tools).toBe(10);
    expect(coverage.missing_http).toEqual([]);
    const mapped = coverage.mapped as { tool: string; operation: string }[];
    const missing = coverage.missing_still as { tool: string; why: string }[];
    expect(mapped.length + missing.length).toBe(LIVE_TOOLS.length);
    expect([...mapped.map((item) => item.tool), ...missing.map((item) => item.tool)].sort()).toEqual([...LIVE_TOOLS].sort());
    for (const item of mapped) {
      expect(operations[item.operation], item.tool).toBeDefined();
      expect(requestOf(item.operation).method, item.tool).toMatch(/^[A-Z]+$/);
      expect(String(requestOf(item.operation).path).startsWith("/"), item.tool).toBe(true);
    }
    for (const item of missing) {
      expect(item.why.length, item.tool).toBeGreaterThan(0);
      expect(item.why.includes("\n"), item.tool).toBe(false);
    }
  });
});
