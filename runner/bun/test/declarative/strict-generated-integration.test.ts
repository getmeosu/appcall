import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../src/declarative/compile";

const manifest = (overrides: Record<string, unknown> = {}) => ({ key: "strict-fixture", network: { allowedHosts: ["example.com"] }, http: { baseUrl: "https://example.com", auth: { field: "apiKey", in: "header", name: "Authorization", value: "Bearer {{apiKey}}" } }, operations: { check: { kind: "action", validationMode: "strict-generated", responseFormat: "json", enforceOutputSchema: true, inputSchema: { type: "object", properties: { id: { type: "string", minLength: 1 } }, required: ["id"], additionalProperties: false }, outputSchema: { type: "object", properties: { data: { type: ["object", "null"] } }, required: ["data"] }, request: { method: "GET", path: "/items/{{id}}", success: [200] } }, }, ...overrides } as any);

describe("strict generated declarative integration", () => {
  test("rejects invalid input before guarded fetch", async () => { let calls = 0; const action = compileDeclarativeConnector(manifest()).actions.check!; await expect(action({ apiKey: "k", id: "" , fetch: async () => { calls++; return new Response("{}") } })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" }); expect(calls).toBe(0); });
  test("rejects successful HTML as structured upstream error", async () => { const action = compileDeclarativeConnector(manifest()).actions.check!; await expect(action({ apiKey: "k", id: "x", fetch: async () => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }) })).rejects.toMatchObject({ ok: false }); });
  test("preserves upstream 401 error", async () => { const action = compileDeclarativeConnector(manifest()).actions.check!; await expect(action({ apiKey: "k", id: "x", fetch: async () => new Response("unauthorized", { status: 401 }) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", ok: false }); });
  test("accepts JSON null data", async () => { const action = compileDeclarativeConnector(manifest()).actions.check!; const result = await action({ apiKey: "k", id: "x", fetch: async () => new Response('{"data":null}', { status: 200, headers: { "content-type": "application/json" } }) }); expect(result).toMatchObject({ data: { data: null } }); });
  test("does not leak injected credentials through a result template", async () => {
    const m = manifest({ operations: { check: { ...(manifest().operations as any).check, inputSchema: { type: "object", properties: { x: { type: "string" } } }, outputSchema: { type: "object", properties: { submitted: { type: "object" } }, required: ["submitted"] }, request: { method: "GET", path: "/items/{{x}}", success: [200], result: { submitted: "{{input}}" } } } } });
    const action = compileDeclarativeConnector(m).actions.check!;
    const result = await action({ apiKey: "synthetic-secret", x: "hello", fetch: async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }) });
    expect(result).toMatchObject({ submitted: { x: "hello" } });
    expect(JSON.stringify(result)).not.toContain("synthetic-secret");
  });
  test("rejects non-finite nested input before fetch", async () => {
    let calls = 0;
    const m = manifest({ operations: { check: { ...(manifest().operations as any).check, inputSchema: { type: "object" } } } });
    const action = compileDeclarativeConnector(m).actions.check!;
    await expect(action({ apiKey: "k", nested: { values: [Infinity] }, fetch: async () => { calls++; return new Response("{}"); } })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(calls).toBe(0);
  });
  test("legacy operation remains available without strict flags", async () => { const m = manifest(); (m.operations as any).check.validationMode = undefined; delete (m.operations as any).check.responseFormat; const action = compileDeclarativeConnector(m).actions.check!; const result = await action({ id: "x" }); expect(result).toMatchObject({ connector: "strict-fixture", action: "check" }); });
});
