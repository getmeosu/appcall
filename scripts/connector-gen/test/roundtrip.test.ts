import { describe, expect, it } from "bun:test";
import { generateManifest } from "../openapi";
import { compileDeclarativeConnector, isDeclarativeManifest } from "../../../runner/bun/src/declarative/compile";

// The generator is only useful if what it emits actually runs. This exercises
// the whole chain in one test: OpenAPI document -> manifest -> compiled handler
// -> live request against a mocked fetch.
const spec = {
  openapi: "3.0.3",
  servers: [{ url: "https://api.acme.test" }],
  paths: {
    "/tickets/{ticketId}": {
      get: {
        tags: ["Tickets"],
        summary: "Get ticket",
        parameters: [{ name: "ticketId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "ok" } },
      },
    },
    "/tickets": {
      post: {
        tags: ["Tickets"],
        summary: "Create ticket",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["subject"],
                properties: { subject: { type: "string" }, priority: { type: "string", enum: ["low", "high"] } },
              },
            },
          },
        },
        responses: { "201": { description: "created" } },
      },
    },
  },
};

const manifest = generateManifest(spec, {
  key: "acme",
  name: "Acme",
  categories: ["productivity"],
  models: ["ticket"],
  auth: { type: "api_key", field: "apiKey", in: "header", name: "Authorization", value: "Bearer {{apiKey}}", label: "API key" },
});

const inheritedContentParameterSpec = {
  openapi: "3.0.3",
  servers: [{ url: "https://api.content-parameter.test" }],
  paths: {
    "/reports": {
      parameters: [{ $ref: "#/components/parameters/ReportFilter" }],
      get: {
        operationId: "listReports",
        tags: ["Reports"],
        summary: "List reports",
        responses: { "200": { description: "ok" } },
      },
    },
  },
  components: {
    parameters: {
      ReportFilter: {
        name: "filter",
        in: "query",
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ReportFilter" },
          },
        },
      },
    },
    schemas: {
      ReportFilter: {
        type: "object",
        description: "Structured report filter.",
        required: ["status"],
        properties: {
          status: { type: "string", enum: ["open", "closed"] },
          owner: { type: "string" },
        },
      },
    },
  },
};

const inheritedContentParameterManifest = generateManifest(inheritedContentParameterSpec, {
  key: "content-parameter",
  name: "Content Parameter",
  categories: ["productivity"],
  models: ["report"],
  auth: { type: "api_key", field: "apiKey", in: "header", name: "Authorization", value: "Bearer {{apiKey}}", label: "API key" },
});

const pathItemSpec = {
  openapi: "3.0.3",
  servers: [{ url: "https://api.path-item.test" }],
  paths: {
    "/accounts/{accountId}/widgets": {
      parameters: [
        { name: "accountId", in: "path", required: true, schema: { type: "string" } },
        { $ref: "#/components/parameters/WorkspaceId" },
        { $ref: "#/components/parameters/TraceHeader" },
        { $ref: "#/components/parameters/Limit" },
      ],
      get: {
        operationId: "listWidgets",
        tags: ["Widgets"],
        summary: "List widgets",
        parameters: [
          { $ref: "#/components/parameters/AccountIdOverride" },
          { name: "limit", in: "query", required: true, schema: { type: "integer" } },
          { $ref: "#/components/parameters/RequestId" },
        ],
        responses: { "200": { description: "ok" } },
      },
    },
  },
  components: {
    parameters: {
      WorkspaceId: { name: "workspaceId", in: "query", required: true, schema: { type: "string" } },
      TraceHeader: { name: "X-Trace", in: "header", required: true, schema: { type: "string" } },
      Limit: { name: "limit", in: "query", required: false, schema: { type: "string" } },
      AccountIdOverride: { name: "accountId", in: "path", required: true, schema: { type: "string" } },
      RequestId: { name: "X-Request-ID", in: "header", required: true, schema: { type: "string" } },
    },
  },
};

const pathItemManifest = generateManifest(pathItemSpec, {
  key: "path-item",
  name: "Path Item",
  categories: ["productivity"],
  models: ["widget"],
  auth: { type: "api_key", field: "apiKey", in: "header", name: "Authorization", value: "Bearer {{apiKey}}", label: "API key" },
});

describe("generated manifest round-trip", () => {
  it("is recognised as declarative and compiles to handlers", () => {
    expect(isDeclarativeManifest(manifest)).toBe(true);
    expect(Object.keys(compileDeclarativeConnector(manifest as never).actions).sort())
      .toEqual(["tickets.create", "tickets.get"]);
  });

  it("carries every field the core manifest validation requires", () => {
    expect(manifest.key).toBe("acme");
    expect(manifest.runtime).toBe("bun");
    expect((manifest.models as string[]).length).toBeGreaterThan(0);
    expect((manifest.network as { allowedHosts: string[] }).allowedHosts).toEqual(["api.acme.test"]);
    for (const operation of Object.values(manifest.operations as Record<string, Record<string, unknown>>)) {
      expect(operation.kind).toBe("action");
      expect(operation.timeoutMs as number).toBeGreaterThan(0);
      expect(operation.maxInputBytes as number).toBeGreaterThan(0);
      expect(operation.maxResponseBytes as number).toBeGreaterThan(0);
      expect(String(operation.description).length).toBeGreaterThan(0);
      expect((operation.inputSchema as Record<string, unknown>).type).toBe("object");
    }
  });

  it("executes a generated path operation against the provider", async () => {
    const { actions } = compileDeclarativeConnector(manifest as never);
    let seenUrl = "";
    let seenAuth = "";
    const result = await actions["tickets.get"]!({
      apiKey: "k_live",
      ticketId: "TCK-9",
      fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
        seenUrl = String(url);
        seenAuth = (init?.headers as Record<string, string>).Authorization ?? "";
        return new Response(JSON.stringify({ id: "TCK-9", subject: "Printer" }), { status: 200 });
      },
    }) as Record<string, unknown>;

    expect(seenUrl).toBe("https://api.acme.test/tickets/TCK-9");
    expect(seenAuth).toBe("Bearer k_live");
    expect(result.data).toEqual({ id: "TCK-9", subject: "Printer" });
  });

  it("serializes an inherited content parameter as one encoded JSON query value", async () => {
    const { actions } = compileDeclarativeConnector(inheritedContentParameterManifest as never);
    const filter = { status: "open", owner: "A&B=one" };
    let seenUrl = "";
    const result = await actions["reports.list"]!({
      apiKey: "k_live",
      filter,
      fetch: async (url: RequestInfo | URL) => {
        seenUrl = String(url);
        return new Response(JSON.stringify({ items: [{ id: "R-1" }] }), { status: 200 });
      },
    }) as Record<string, unknown>;

    const url = new URL(seenUrl);
    expect([...url.searchParams.keys()]).toEqual(["filter"]);
    expect(url.searchParams.get("filter")).toBe(JSON.stringify(filter));
    expect(seenUrl).toContain("%26");
    expect(result.data).toEqual({ items: [{ id: "R-1" }] });
  });

  it("renders inherited path, query, and header parameters in a live round-trip", async () => {
    const { actions } = compileDeclarativeConnector(pathItemManifest as never);
    let seenUrl = "";
    let seenHeaders: Record<string, string> = {};
    const result = await actions["widgets.list"]!({
      apiKey: "k_live",
      accountId: "acct/42",
      workspaceId: "ws-7",
      limit: 25,
      "X-Trace": "trace-1",
      "X-Request-ID": "req-9",
      fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
        seenUrl = String(url);
        seenHeaders = Object.fromEntries(new Headers(init?.headers).entries());
        return new Response(JSON.stringify({ items: [{ id: "W-1" }] }), { status: 200 });
      },
    }) as Record<string, unknown>;

    expect(seenUrl).toBe("https://api.path-item.test/accounts/acct%2F42/widgets?workspaceId=ws-7&limit=25");
    expect(seenHeaders).toMatchObject({
      authorization: "Bearer k_live",
      "x-trace": "trace-1",
      "x-request-id": "req-9",
    });
    expect(result.data).toEqual({ items: [{ id: "W-1" }] });
  });

  it("enforces required inherited inputs before the provider call", async () => {
    const { actions } = compileDeclarativeConnector(pathItemManifest as never);
    const action = actions["widgets.list"]!;
    const input = {
      apiKey: "k_live",
      accountId: "acct-42",
      workspaceId: "ws-7",
      limit: 25,
      "X-Trace": "trace-1",
      "X-Request-ID": "req-9",
    };

    for (const [field, message] of [
      ["accountId", "accountId is required"],
      ["workspaceId", "workspaceId is required"],
      ["X-Trace", "X-Trace is required"],
      ["limit", "limit is required"],
      ["X-Request-ID", "X-Request-ID is required"],
    ] as const) {
      const missing = Object.fromEntries(Object.entries(input).filter(([key]) => key !== field));
      await expect(action(missing)).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT", message });
    }
  });

  it("enforces the generated required fields and enums before calling out", async () => {
    const { actions } = compileDeclarativeConnector(manifest as never);
    expect(() => actions["tickets.create"]!({ priority: "low" })).toThrow("subject is required");
    await expect(
      actions["tickets.create"]!({ apiKey: "k", subject: "Broken", priority: "urgent", fetch: async () => new Response("{}") }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT", message: "priority must be one of: low, high" });
  });
});
