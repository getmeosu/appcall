import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const coverage = JSON.parse(readFileSync(new URL("../../docupipe.coverage.json", import.meta.url), "utf8"));
const operations = manifest.operations as Record<string, Record<string, unknown>>;
const LIVE_TOOLS = [
  "DOCUPIPE_CREATE_SCHEMA",
  "DOCUPIPE_DELETE_DOCUMENT",
  "DOCUPIPE_DELETE_DOCUMENTS",
  "DOCUPIPE_FIND_DOCUMENTS",
  "DOCUPIPE_FIND_JOBS",
  "DOCUPIPE_GET_ACCOUNT_USAGE",
  "DOCUPIPE_GET_DOCUMENT",
  "DOCUPIPE_GET_SCHEMA",
  "DOCUPIPE_GET_STANDARDIZATION",
  "DOCUPIPE_LIST_SCHEMAS",
  "DOCUPIPE_LIST_STANDARDIZATIONS",
  "DOCUPIPE_STANDARDIZE_DOCUMENT",
  "DOCUPIPE_UPLOAD_DOCUMENT",
];

const { actions } = compileDeclarativeConnector(manifest as never);
const jsonResponse = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}

describe("DocuPipe contract", () => {
  test("compiles against app.docupipe.ai and X-API-Key", () => {
    expect(manifest.key).toBe("docupipe");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.network.allowedHosts).toEqual(["app.docupipe.ai"]);
    expect(manifest.http.baseUrl).toBe("https://app.docupipe.ai");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "X-API-Key",
      value: "{{apiKey}}",
    });
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(JSON.stringify(manifest.http.auth)).not.toContain("Bearer");
    expect(compileDeclarativeConnector(manifest as never).key).toBe("docupipe");
  });

  test("gives every action one JSON request inside budget", () => {
    expect(Object.keys(operations).sort()).toEqual([
      "documents.delete",
      "documents.get",
      "documents.standardize",
      "schemas.create",
      "schemas.get",
      "schemas.list",
      "standardizations.get",
      "standardizations.list",
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
      expect(request.baseUrl, key).toBeUndefined();
      expect(typeof request.method, key).toBe("string");
      expect(String(request.path).startsWith("/"), key).toBe(true);
      if (request.method === "GET" || request.method === "DELETE") expect(request.body, key).toBeUndefined();
      else expect(request.body, key).toBeDefined();
      const headers = (request.headers as Record<string, string> | undefined) ?? {};
      if (request.body !== undefined) expect(headers["Content-Type"], key).toBe("application/json");
      else expect(headers["Content-Type"], key).toBeUndefined();
      const method = String(request.method);
      if (method === "GET") expect(operation.sideEffect, key).toBe("read");
      else if (method === "DELETE") expect(operation.sideEffect, key).toBe("destructive");
      else expect(operation.sideEffect, key).toBe("write");
    }
  });

  test("uses the documented single DocuPipe routes", () => {
    expect(requestOf("schemas.create")).toMatchObject({ method: "POST", path: "/schema" });
    expect(requestOf("documents.delete")).toMatchObject({ method: "DELETE", path: "/document/{{documentId}}" });
    expect(requestOf("documents.get")).toMatchObject({ method: "GET", path: "/document/{{documentId}}" });
    expect(requestOf("schemas.get")).toMatchObject({ method: "GET", path: "/schema/{{schemaId}}" });
    expect(requestOf("standardizations.get")).toMatchObject({ method: "GET", path: "/standardization/{{standardizationId}}" });
    expect(requestOf("schemas.list")).toMatchObject({ method: "GET", path: "/schemas" });
    expect(requestOf("standardizations.list")).toMatchObject({ method: "GET", path: "/standardizations" });
    expect(requestOf("documents.standardize")).toMatchObject({ method: "POST", path: "/v3/standardize" });
    const serialized = JSON.stringify(manifest);
    expect(serialized).not.toContain("/documents/search");
    expect(serialized).not.toContain("/jobs");
    expect(serialized).not.toContain("/account");
    expect(serialized).not.toContain("\"url\"");
    expect(serialized).not.toContain("contents");
  });

  test("covers the live 13-tool list with no missing_http gap", () => {
    expect(LIVE_TOOLS).toHaveLength(13);
    expect(coverage.composio_tools).toBe(13);
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
    expect(coverage.full_depth).toBe(true);
  });

  test("encodes document ids, omits unset filters, and rejects bad calls", async () => {
    const seen: Request[] = [];
    await actions["documents.get"]!({
      apiKey: "tok",
      documentId: "doc/a",
      fetch: async (url: string | URL, init?: RequestInit) => {
        seen.push(new Request(url, init));
        return jsonResponse({ documentId: "doc/a", status: "completed" });
      },
    });
    expect(new URL(seen[0]!.url).pathname).toBe("/document/doc%2Fa");
    expect(seen).toHaveLength(1);

    const listed: Request[] = [];
    await actions["schemas.list"]!({
      apiKey: "tok",
      fetch: async (url: string | URL, init?: RequestInit) => {
        listed.push(new Request(url, init));
        return jsonResponse([{ schemaId: "sch_1" }]);
      },
    });
    expect(new URL(listed[0]!.url).search).toBe("");

    await expect(actions["documents.delete"]!({
      apiKey: "tok",
      documentId: "",
      fetch: async () => jsonResponse({ success: true }),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["schemas.create"]!({
      apiKey: "tok",
      schemaName: "Lease",
      jsonSchema: { type: "object" },
      fileUrl: "https://example.com/lease.pdf",
      fetch: async () => jsonResponse({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["documents.get"]!({
      apiKey: "tok",
      documentId: "doc_1",
      fetch: async () => jsonResponse([]),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["schemas.list"]!({
      apiKey: "tok",
      fetch: async () => jsonResponse({ detail: ["no"] }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["schemas.list"]!({
      apiKey: "tok",
      fetch: async () => jsonResponse({}, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
