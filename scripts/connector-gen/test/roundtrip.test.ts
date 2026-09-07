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

  it("enforces the generated required fields and enums before calling out", async () => {
    const { actions } = compileDeclarativeConnector(manifest as never);
    expect(() => actions["tickets.create"]!({ priority: "low" })).toThrow("subject is required");
    await expect(
      actions["tickets.create"]!({ apiKey: "k", subject: "Broken", priority: "urgent", fetch: async () => new Response("{}") }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT", message: "priority must be one of: low, high" });
  });
});
