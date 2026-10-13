import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const coverage = JSON.parse(readFileSync(new URL("../../brain-graph.coverage.json", import.meta.url), "utf8"));
const operations = manifest.operations as Record<string, Record<string, unknown>>;
const LIVE_TOOLS = [
  "BRAIN_GRAPH_GET_DOCUMENT_PROGRESS",
  "BRAIN_GRAPH_INGEST_WEB_PAGE",
  "BRAIN_GRAPH_INGEST_YOUTUBE_VIDEO",
  "BRAIN_GRAPH_LIST_BRAINS",
  "BRAIN_GRAPH_LIST_DOCUMENTS",
  "BRAIN_GRAPH_LIST_PATTERNS",
  "BRAIN_GRAPH_RESOLVE_ENTITY",
  "BRAIN_GRAPH_SEARCH_BRAIN",
  "BRAIN_GRAPH_TRANSCRIBE_AUDIO",
  "BRAIN_GRAPH_UPLOAD_DOCUMENT",
];

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}

describe("brain-graph manifest", () => {
  test("compiles against the documented host and X-API-Key auth", () => {
    expect(manifest.key).toBe("brain-graph");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.network.allowedHosts).toEqual(["itsbraingraph.ai"]);
    expect(manifest.http.baseUrl).toBe("https://itsbraingraph.ai");
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
      "brain.search",
      "brains.list",
      "documents.ingest-url",
      "documents.list",
      "documents.progress",
      "entities.resolve",
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
      const headers = (request.headers as Record<string, string> | undefined) ?? {};
      if (request.method === "GET" || request.method === "DELETE") {
        expect(request.body, key).toBeUndefined();
        expect(headers["Content-Type"], key).toBeUndefined();
        expect(operation.sideEffect, key).toBe("read");
      } else {
        expect(request.body, key).toBeDefined();
        expect(headers["Content-Type"], key).toBe("application/json");
      }
      const success = request.success as number[];
      expect(success.every((status) => status === 200 || status === 201), key).toBe(true);
    }
    expect(operations["brain.search"]!.sideEffect).toBe("read");
    expect(operations["documents.ingest-url"]!.sideEffect).toBe("write");
  });

  test("uses the documented BrainGraph routes", () => {
    expect(requestOf("documents.progress")).toMatchObject({ method: "GET", path: "/api/documents/{{documentId}}/progress" });
    expect(requestOf("documents.ingest-url")).toMatchObject({ method: "POST", path: "/api/documents/url", success: [201] });
    expect(requestOf("documents.ingest-url").body).toEqual({
      url: "{{url}}",
      notes: "{{notes}}",
      conversationDate: "{{conversationDate}}",
    });
    expect(requestOf("brains.list")).toMatchObject({ method: "GET", path: "/api/brains" });
    expect(requestOf("documents.list")).toMatchObject({ method: "GET", path: "/api/brain/documents" });
    expect(requestOf("documents.list").query).toEqual({
      query: "{{query}}",
      limit: "{{limit}}",
      offset: "{{offset}}",
      includeFailed: "{{includeFailed}}",
      brainIds: "{{brainIds}}",
    });
    expect(requestOf("entities.resolve")).toMatchObject({ method: "GET", path: "/api/brain/entity/resolve" });
    expect(requestOf("entities.resolve").query).toEqual({ name: "{{name}}" });
    expect(requestOf("brain.search")).toMatchObject({ method: "POST", path: "/api/brain/search" });
    expect(requestOf("brain.search").body).toEqual({
      query: "{{query}}",
      numResults: "{{numResults}}",
      brainIds: "{{brainIds}}",
    });
    const paths = Object.values(operations).map((operation) => String((operation.request as { path?: string }).path));
    expect(paths.some((path) => path.includes("youtube") || path.includes("upload") || path.includes("transcript") || path.includes("pattern"))).toBe(false);
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
