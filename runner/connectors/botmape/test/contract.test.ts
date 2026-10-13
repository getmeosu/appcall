import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import coverage from "../../botmape.coverage.json";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, any>>;
const { actions } = compileDeclarativeConnector(manifest as never);
const liveTools = [
  "BOTMAPE_ADD_KNOWLEDGE",
  "BOTMAPE_CREATE_AI_AGENT",
  "BOTMAPE_DELETE_KNOWLEDGE_ENTRY",
  "BOTMAPE_GET_AI_AGENT",
  "BOTMAPE_GET_PLATFORM_ANALYTICS",
  "BOTMAPE_LIST_AI_AGENTS",
  "BOTMAPE_LIST_KNOWLEDGE_ENTRIES",
  "BOTMAPE_SEND_MESSAGE_TO_AI_AGENT",
];

const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

describe("BotMape contract", () => {
  test("maps every live tool to one JSON request", () => {
    const mapped = coverage.mapped.map((row) => row.tool);
    const missing = coverage.missing_still.map((row: { tool: string }) => row.tool);
    expect(coverage.missing_http).toEqual([]);
    expect(coverage.missing_still).toEqual([]);
    expect([...mapped, ...missing].sort()).toEqual([...liveTools].sort());
    expect(mapped.length + missing.length).toBe(liveTools.length);
    expect(coverage.composio_tools).toBe(liveTools.length);
    for (const row of coverage.mapped) {
      const operation = operations[row.operation];
      expect(operation.request.method, row.tool).toBe(row.method);
      expect(operation.request.path, row.tool).toBe(row.path);
      expect(typeof actions[row.operation], row.tool).toBe("function");
    }
  });

  test("keeps JSON bounds, body-less reads, and X-API-Key auth", () => {
    expect(manifest.network.allowedHosts).toEqual(["botmape.com"]);
    expect(manifest.http.baseUrl).toBe("https://botmape.com");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "X-API-Key",
      value: "{{apiKey}}",
    });
    for (const [name, operation] of Object.entries(operations)) {
      expect(operation.kind, name).toBe("action");
      expect(typeof operation.title, name).toBe("string");
      expect(operation.title.length, name).toBeGreaterThan(0);
      expect(typeof operation.description, name).toBe("string");
      expect(operation.inputSchema.type, name).toBe("object");
      expect(operation.outputSchema.type, name).toBe("object");
      expect(operation.responseFormat, name).toBe("json");
      expect(operation.maxResponseBytes, name).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect(operation.maxInputBytes, name).toBeLessThanOrEqual(26214400);
      expect(operation.timeoutMs, name).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs, name).toBeLessThanOrEqual(300000);
      const method = operation.request.method;
      if (method === "GET" || method === "DELETE") {
        expect(operation.request.body, name).toBeUndefined();
        expect(operation.request.headers?.["Content-Type"], name).toBeUndefined();
      } else {
        expect(operation.request.headers?.["Content-Type"], name).toBe("application/json");
        expect(typeof operation.request.body, name).toBe("object");
      }
    }
  });

  test("sends X-API-Key, omits the local confirmation, and encodes the agent id", async () => {
    const seen: Request[] = [];
    const fetch = async (input: string | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return json({ id: 42, name: "Sales Assistant" });
    };
    await actions["agents.create"]!({
      apiKey: "secret",
      name: "Sales Assistant",
      confirmPermanentCreation: true,
      fetch,
    });
    expect(seen[0].headers.get("x-api-key")).toBe("secret");
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(seen[0].method).toBe("POST");
    expect(new URL(seen[0].url).pathname).toBe("/api/chatbots");
    expect(await seen[0].text()).toBe('{"name":"Sales Assistant"}');

    const listed: Request[] = [];
    await actions["agents.get"]!({
      apiKey: "secret",
      aiAgentId: 42,
      fetch: async (input: string | URL, init?: RequestInit) => {
        listed.push(new Request(input, init));
        return json({ id: 42, name: "Sales Assistant" });
      },
    });
    expect(new URL(listed[0].url).pathname).toBe("/api/chatbots/42");
    expect(listed[0].headers.get("content-type")).toBeNull();
    expect(listed[0].method).toBe("GET");
  });

  test("wraps a JSON array and rejects bad input, malformed output, 401, and 429", async () => {
    const listed = await actions["agents.list"]!({
      apiKey: "secret",
      fetch: async () => json([{ id: 1, name: "Support" }]),
    });
    expect(listed.data).toEqual([{ id: 1, name: "Support" }]);
    expect(operations["agents.list"].outputSchema.type).toBe("object");

    await expect(actions["agents.create"]!({
      apiKey: "secret",
      name: "Sales Assistant",
      fetch: async () => json({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["agents.create"]!({
      apiKey: "secret",
      name: "Sales Assistant",
      confirmPermanentCreation: false,
      fetch: async () => json({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["agents.send-message"]!({
      apiKey: "secret",
      aiAgentId: 42,
      message: "",
      fetch: async () => json({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["agents.get"]!({
      apiKey: "secret",
      aiAgentId: 42,
      fetch: async () => json([]),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["agents.list"]!({
      apiKey: "secret",
      fetch: async () => json({}, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["analytics.get"]!({
      apiKey: "secret",
      fetch: async () => json({}, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
