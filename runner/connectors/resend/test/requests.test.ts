import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import composioMappings from "../fixtures/composio_tool_mapping.json";

type Exchange = {
  request: { method: string; url: string; headers: Record<string, string>; body: string | null };
  response: { status: number; bodyFile: string };
};
type FixtureCase = {
  id: string;
  operation: string;
  input: Record<string, unknown>;
  credentials: { apiKey: string };
  exchanges: Exchange[];
  expected: { kind: string; resultFile: string };
};

const operations = manifest.operations as Record<string, {
  kind?: string;
  title?: string;
  description?: string;
  sideEffect?: string;
  maxInputBytes: number;
  maxResponseBytes: number;
  inputSchema?: { type?: string };
  request?: { method?: string; path?: string; body?: unknown; headers?: Record<string, string> };
}>;

const casesDir = new URL("../fixtures/cases/", import.meta.url).pathname;
const cases = readdirSync(casesDir)
  .filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(readFileSync(casesDir + name, "utf8")) as FixtureCase);

describe("resend declarative requests", () => {
  it("gives every action a real HTTP request and a success fixture", () => {
    const keys = Object.keys(operations).sort();
    expect(keys).toHaveLength(67);
    const covered = new Set(cases.map((entry) => entry.operation));
    expect([...covered].sort()).toEqual(keys);
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(operation.title, key).toBeTruthy();
      expect(operation.description, key).toBeTruthy();
      expect(operation.inputSchema?.type, key).toBe("object");
      expect(operation.maxResponseBytes, key).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect(operation.request?.method, key).toBeTruthy();
      expect(operation.request?.path, key).toMatch(/^\//);
      const method = operation.request?.method;
      if (method === "GET" || method === "DELETE") {
        expect(operation.request?.body, key).toBeUndefined();
        expect(operation.request?.headers?.["Content-Type"], key).toBeUndefined();
      }
      if (operation.sideEffect === "read" || key.startsWith("webhook.")) {
        expect(operation.sideEffect, key).not.toBe("write");
      }
    }
  });

  it("maps every live Composio tool onto an operation that performs HTTP", () => {
    expect(composioMappings).toHaveLength(66);
    for (const mapping of composioMappings) {
      expect(mapping.operation, mapping.tool).toBeTruthy();
      expect(operations[mapping.operation as string]?.request?.path, mapping.tool).toBeTruthy();
      expect(mapping.status, mapping.tool).not.toBe("missing");
    }
  });

  it("replays every success fixture through the declarative compiler", async () => {
    const compiled = compileDeclarativeConnector(manifest as never);
    expect(Object.keys(compiled.actions).sort()).toEqual(Object.keys(operations).sort());
    for (const entry of cases) {
      const exchange = entry.exchanges[0];
      if (!exchange) throw new Error(`${entry.id} has no exchange`);
      const responseBody = readFileSync(join(casesDir, exchange.response.bodyFile), "utf8");
      let captured: { url: string; method: string; headers: Record<string, string>; body: string | undefined } | undefined;
      const result = await compiled.actions[entry.operation]!({
        ...entry.input,
        apiKey: entry.credentials.apiKey,
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          const headers = new Headers(init?.headers);
          captured = {
            url: String(input),
            method: init?.method ?? "GET",
            headers: Object.fromEntries(headers.entries()),
            body: typeof init?.body === "string" ? init.body : undefined,
          };
          return new Response(responseBody, {
            status: exchange.response.status,
            headers: { "content-type": "application/json" },
          });
        },
      });
      expect(captured?.url, entry.id).toBe(exchange.request.url);
      expect(captured?.method, entry.id).toBe(exchange.request.method);
      expect(captured?.headers.authorization, entry.id).toBe(exchange.request.headers.Authorization);
      if (exchange.request.body === null) {
        expect(captured?.body, entry.id).toBeUndefined();
        expect(captured?.headers["content-type"], entry.id).toBeUndefined();
      } else {
        expect(captured?.body, entry.id).toBe(exchange.request.body);
        expect(captured?.headers["content-type"], entry.id).toBe("application/json");
      }
      const expected = JSON.parse(readFileSync(join(casesDir, entry.expected.resultFile), "utf8"));
      expect(result, entry.id).toEqual(expected);
    }
  });
});
