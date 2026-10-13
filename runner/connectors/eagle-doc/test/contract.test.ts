import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const coverage = JSON.parse(readFileSync(new URL("../../eagle-doc.coverage.json", import.meta.url), "utf8"));
const operations = manifest.operations as Record<string, Record<string, unknown>>;
const LIVE_TOOLS = [
  "EAGLE_DOC_ANY_DOC_OCR",
  "EAGLE_DOC_BATCH_ANY_DOC_OCR",
  "EAGLE_DOC_BATCH_TASK_DELETE",
  "EAGLE_DOC_INVOICE_OCR_BASE64",
  "EAGLE_DOC_MANAGEMENT_QUOTA",
  "EAGLE_DOC_RECEIPT_OCR_V3",
  "EAGLE_DOC_RECEIPT_QUOTA_V2",
  "EAGLE_DOC_USAGE_CURRENT_MONTH",
  "EAGLE_DOC_USAGE_MONTHLY_HISTORY",
  "EAGLE_DOC_USAGE_REQUEST_LOGS",
];

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}

describe("eagle-doc manifest", () => {
  test("compiles against de.eagle-doc.com and the api-key header", () => {
    expect(manifest.key).toBe("eagle-doc");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.network.allowedHosts).toEqual(["de.eagle-doc.com"]);
    expect(manifest.http.baseUrl).toBe("https://de.eagle-doc.com");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "api-key",
      value: "{{apiKey}}",
    });
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(JSON.stringify(manifest.http.auth)).not.toContain("Bearer");
    expect(JSON.stringify(manifest)).not.toContain("file_url");
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("gives every action one body-less JSON GET inside budget", () => {
    expect(Object.keys(operations).sort()).toEqual([
      "quota.management",
      "quota.receipt",
      "usage.current",
      "usage.logs",
      "usage.monthly",
    ]);
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect((operation.outputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.responseFormat, key).toBe("json");
      expect(operation.sideEffect, key).toBe("read");
      const timeoutMs = operation.timeoutMs as number;
      const maxInputBytes = operation.maxInputBytes as number;
      const maxResponseBytes = operation.maxResponseBytes as number;
      expect(timeoutMs, key).toBeGreaterThanOrEqual(1);
      expect(timeoutMs, key).toBeLessThanOrEqual(300000);
      expect(maxInputBytes, key).toBeLessThanOrEqual(26214400);
      expect(maxResponseBytes, key).toBeGreaterThanOrEqual(maxInputBytes);
      const request = requestOf(key);
      expect(request.method, key).toBe("GET");
      expect(String(request.path).startsWith("/"), key).toBe(true);
      expect(request.body, key).toBeUndefined();
      expect(request.baseUrl, key).toBeUndefined();
      const headers = (request.headers as Record<string, string> | undefined) ?? {};
      expect(headers["Content-Type"], key).toBeUndefined();
    }
  });

  test("uses the documented Eagle Doc usage and quota routes", () => {
    expect(requestOf("quota.management")).toMatchObject({ method: "GET", path: "/api/management/v1/quota" });
    expect(requestOf("quota.receipt")).toMatchObject({ method: "GET", path: "/api/v2/receipt/processing/quota" });
    expect(requestOf("usage.current")).toMatchObject({ method: "GET", path: "/api/usage/v1/current" });
    expect(requestOf("usage.monthly")).toMatchObject({ method: "GET", path: "/api/usage/v1/monthly" });
    expect(requestOf("usage.logs")).toMatchObject({ method: "GET", path: "/api/usage/v1/logs" });
    const paths = Object.values(operations).map((operation) => String((operation.request as { path?: string }).path));
    expect(paths.some((path) => path.includes("anydoc") || path.includes("base64") || path.includes("/task") || path.includes("/receipt/v3"))).toBe(false);
  });

  test("covers the live 10-tool list without a missing_http gap", () => {
    expect(LIVE_TOOLS).toHaveLength(10);
    expect(coverage.composio_tools).toBe(10);
    expect(coverage.index_tools).toBe(10);
    expect(coverage.missing_http).toEqual([]);
    const mapped = coverage.mapped as { tool: string; operation: string }[];
    const missing = coverage.missing_still as { tool: string; why: string }[];
    expect(mapped.length + missing.length).toBe(LIVE_TOOLS.length);
    expect([...mapped.map((item) => item.tool), ...missing.map((item) => item.tool)].sort()).toEqual([...LIVE_TOOLS].sort());
    for (const item of mapped) {
      expect(operations[item.operation], item.tool).toBeDefined();
      expect(requestOf(item.operation).method, item.tool).toBe("GET");
      expect(String(requestOf(item.operation).path).length, item.tool).toBeGreaterThan(1);
    }
    for (const item of missing) expect(item.why.length, item.tool).toBeGreaterThan(0);
  });
});
