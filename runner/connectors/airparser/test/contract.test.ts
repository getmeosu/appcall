import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const coverage = JSON.parse(readFileSync(new URL("../../airparser.coverage.json", import.meta.url), "utf8"));
const operations = manifest.operations as Record<string, Record<string, unknown>>;
const LIVE_TOOLS = [
  "AIRPARSER_CLONE_EXTRACTION_SCHEMA",
  "AIRPARSER_CREATE_INBOX",
  "AIRPARSER_DELETE_INBOX",
  "AIRPARSER_GET_ACCOUNT_USAGE",
  "AIRPARSER_GET_DOCUMENT",
  "AIRPARSER_GET_INBOX",
  "AIRPARSER_LIST_DOCUMENTS",
  "AIRPARSER_LIST_INBOXES",
  "AIRPARSER_PARSE_DOCUMENT_SYNC",
  "AIRPARSER_UPSERT_EXTRACTION_SCHEMA",
];

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}

describe("airparser manifest", () => {
  test("compiles against the documented host and X-API-Key auth", () => {
    expect(manifest.key).toBe("airparser");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.network.allowedHosts).toEqual(["api.airparser.com"]);
    expect(manifest.http.baseUrl).toBe("https://api.airparser.com");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "X-API-Key",
      value: "{{apiKey}}",
    });
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(JSON.stringify(manifest.http.auth)).not.toContain("Bearer");
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("gives every action one JSON request inside budget", () => {
    expect(Object.keys(operations).sort()).toEqual([
      "documents.list",
      "inboxes.create",
      "inboxes.get",
      "inboxes.list",
    ]);
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect((operation.outputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.responseFormat, key).toBe("json");
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
      if (request.method === "GET" || request.method === "DELETE") expect(request.body, key).toBeUndefined();
      else expect(request.body, key).toBeDefined();
      const headers = (request.headers as Record<string, string> | undefined) ?? {};
      if (request.body !== undefined) expect(headers["Content-Type"], key).toBe("application/json");
      else expect(headers["Content-Type"], key).toBeUndefined();
      const method = String(request.method);
      if (method === "GET" || method === "DELETE") expect(operation.sideEffect, key).toBe("read");
      else expect(["write", "destructive"], key).toContain(operation.sideEffect);
    }
  });

  test("uses the documented Airparser routes", () => {
    expect(requestOf("inboxes.list")).toMatchObject({ method: "GET", path: "/inboxes" });
    expect(requestOf("inboxes.get")).toMatchObject({ method: "GET", path: "/inboxes/{{inbox_id}}" });
    expect(requestOf("inboxes.create")).toMatchObject({ method: "POST", path: "/inboxes/create" });
    expect(requestOf("inboxes.create").body).toEqual({ name: "{{name}}", llm_engine: "{{llm_engine}}" });
    expect(requestOf("documents.list")).toMatchObject({ method: "GET", path: "/inboxes/{{inbox_id}}/docs" });
    expect(requestOf("documents.list").query).toEqual({
      page: "{{page}}",
      per_page: "{{per_page}}",
      from: "{{from_date}}",
      to: "{{to_date}}",
      q: "{{query}}",
      status: "{{status}}",
    });
    const paths = Object.values(operations).map((operation) => String((operation.request as { path?: string }).path));
    expect(paths.some((path) => path.includes("upload") || path.includes("schema") || path.includes("/users/"))).toBe(false);
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
      expect(typeof requestOf(item.operation).method, item.tool).toBe("string");
      expect(String(requestOf(item.operation).path).length, item.tool).toBeGreaterThan(1);
    }
    for (const item of missing) expect(item.why.length, item.tool).toBeGreaterThan(0);
  });
});
