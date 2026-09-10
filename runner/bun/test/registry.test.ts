import { describe, expect, test } from "bun:test";
import { ConnectorHttpError } from "../src/http";
import { assertValidRegistry, createConnectorRegistry, defaultConnectorRegistry } from "../src/registry";

describe("runner connector registry", () => {
  test("describes connectors from manifests", () => {
    const notion = defaultConnectorRegistry.describe("notion");
    const slack = defaultConnectorRegistry.describe("slack");
    const telegram = defaultConnectorRegistry.describe("telegram");
    const whatsapp = defaultConnectorRegistry.describe("whatsapp");

    expect(notion?.key).toBe("notion");
    expect(notion?.operations["credentials.validate"].kind).toBe("action");
    expect(slack?.key).toBe("slack");
    expect(slack?.operations["messages.send"].kind).toBe("action");
    expect(telegram?.key).toBe("telegram");
    expect(telegram?.operations["messages.list"].kind).toBe("sync");
    expect(whatsapp?.key).toBe("whatsapp");
    expect(whatsapp?.operations["messages.send"].kind).toBe("action");
  });

  test("default registry has no manifest-handler drift", () => {
    expect(defaultConnectorRegistry.validate()).toEqual([]);
  });

  test("executes connector-owned actions through registered handlers", () => {
    const result = defaultConnectorRegistry.executeAction("whatsapp", "messages.send", {
      phoneNumberId: "123456789",
      to: "15551234567",
      text: "hello",
    });

    expect(result.ok).toBe(true);
    expect(result.output).toMatchObject({
      source: "connector",
      validated: { phoneNumberId: "123456789", to: "15551234567", text: "hello" },
    });
  });

  test("routes microsoft-365 messages.send through the registered action", async () => {
    const requests: Request[] = [];
    const result = defaultConnectorRegistry.executeAction("microsoft-365", "messages.send", {
      accessToken: "test-token",
      to: ["recipient@example.com"],
      subject: "Hello",
      body: "World",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(null, { status: 202 });
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      await expect(result.output).resolves.toEqual({
        connector: "microsoft-365",
        action: "messages.send",
        source: "connector",
        sent: true,
      });
    }
    expect(requests).toHaveLength(1);
  });

  test("rejects whitespace-only Outlook recipients before provider dispatch", async () => {
    let dispatches = 0;
    const result = defaultConnectorRegistry.executeAction("microsoft-365", "messages.send", {
      accessToken: "test-token",
      to: ["   "],
      subject: "Hello",
      body: "World",
      fetch: async () => {
        dispatches += 1;
        return new Response(null, { status: 202 });
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      await expect(result.output).rejects.toThrow("to[].address is required");
    }
    expect(dispatches).toBe(0);
  });

  test("executes connector-owned sync handlers through registered handlers", () => {
    const result = defaultConnectorRegistry.executeSync("telegram", "messages.list", {
      response: {
        ok: true,
        result: [{
          update_id: 777,
          message: {
            message_id: 42,
            chat: { id: 1001 },
            from: { id: 501 },
            text: "hello from telegram",
          },
        }],
      },
    });

    expect(result.ok).toBe(true);
    expect(result.output).toMatchObject({
      provider: "telegram",
      operation: "messages.list",
      items: [{
        id: "telegram:1001:42",
        text: "hello from telegram",
      }],
    });
  });

  test("rejects undeclared and non-action manifest operations", () => {
    expect(defaultConnectorRegistry.executeAction("slack", "messages.delete", {})).toEqual({
      ok: false,
      code: "ACTION_NOT_DECLARED",
      message: "Action is not declared in the connector manifest.",
    });

    expect(defaultConnectorRegistry.executeAction("slack", "messages.list", {})).toEqual({
      ok: false,
      code: "ACTION_NOT_EXECUTABLE",
      message: "Operation is not executable as an action.",
    });
  });

  test("rejects undeclared and non-sync manifest operations", () => {
    expect(defaultConnectorRegistry.executeSync("slack", "messages.delete", {})).toEqual({
      ok: false,
      code: "SYNC_NOT_DECLARED",
      message: "Sync is not declared in the connector manifest.",
    });

    expect(defaultConnectorRegistry.executeSync("slack", "messages.send", {})).toEqual({
      ok: false,
      code: "SYNC_NOT_EXECUTABLE",
      message: "Operation is not executable as a sync.",
    });
  });

  test("reports declared action operations without handlers", () => {
    const registry = createConnectorRegistry({
      manifests: [{
        key: "missing-handler",
        name: "Missing Handler",
        version: "0.1.0",
        runtime: "bun",
        auth: { type: "none", scopes: [] },
        network: { allowedHosts: ["runner.local"] },
        operations: {
          "messages.send": { kind: "action" },
          "messages.list": { kind: "sync" },
        },
      }],
      healthchecks: {
        "missing-handler": () => ({ status: "ok" }),
      },
      actions: {
        "missing-handler": {},
      },
      syncs: {
        "missing-handler": {
          "messages.list": (input) => ({ input }),
        },
      },
    });

    expect(registry.validate()).toEqual([{
      code: "ACTION_HANDLER_MISSING",
      connectorKey: "missing-handler",
      operation: "messages.send",
      message: "Declared action operation has no registered handler.",
    }]);
    expect(() => assertValidRegistry(registry)).toThrow(
      "Connector registry validation failed: ACTION_HANDLER_MISSING missing-handler messages.send",
    );
  });

  test("reports declared sync operations without handlers", () => {
    const registry = createConnectorRegistry({
      manifests: [{
        key: "missing-sync-handler",
        name: "Missing Sync Handler",
        version: "0.1.0",
        runtime: "bun",
        auth: { type: "none", scopes: [] },
        network: { allowedHosts: ["runner.local"] },
        operations: {
          "messages.list": { kind: "sync" },
        },
      }],
      healthchecks: {
        "missing-sync-handler": () => ({ status: "ok" }),
      },
      actions: {
        "missing-sync-handler": {},
      },
      syncs: {
        "missing-sync-handler": {},
      },
    });

    expect(registry.validate()).toEqual([{
      code: "SYNC_HANDLER_MISSING",
      connectorKey: "missing-sync-handler",
      operation: "messages.list",
      message: "Declared sync operation has no registered handler.",
    }]);
    expect(() => assertValidRegistry(registry)).toThrow(
      "Connector registry validation failed: SYNC_HANDLER_MISSING missing-sync-handler messages.list",
    );
  });

  test("creates operation HTTP clients from manifest response limits", async () => {
    const registry = createConnectorRegistry({
      manifests: [{
        key: "limited",
        name: "Limited",
        version: "0.1.0",
        runtime: "bun",
        auth: { type: "none", scopes: [] },
        network: { allowedHosts: ["api.example.com"] },
        operations: {
          "messages.send": {
            kind: "action",
            maxResponseBytes: 4,
          },
        },
      }],
      healthchecks: {},
      actions: {
        limited: {
          "messages.send": (input) => ({ input }),
        },
      },
    });

    const client = registry.createHttpClient("limited", "messages.send", {
      fetch: async () => new Response("12345"),
    });

    expect(client).toBeDefined();
    await expect(client?.fetchText("https://api.example.com/messages")).rejects.toMatchObject({
      name: "ConnectorHttpError",
      code: "OUTBOUND_RESPONSE_TOO_LARGE",
    } satisfies Partial<ConnectorHttpError>);
  });

  test("rejects action and sync inputs larger than manifest limits before dispatch", () => {
    const registry = createConnectorRegistry({
      manifests: [{
        key: "bounded",
        name: "Bounded",
        version: "0.1.0",
        runtime: "bun",
        auth: { type: "none", scopes: [] },
        network: { allowedHosts: ["api.example.com"] },
        operations: {
          "messages.send": { kind: "action", maxInputBytes: 16 },
          "messages.list": { kind: "sync", maxInputBytes: 16 },
        },
      }],
      healthchecks: {},
      actions: {
        bounded: {
          "messages.send": () => {
            throw new Error("handler should not run");
          },
        },
      },
      syncs: {
        bounded: {
          "messages.list": () => {
            throw new Error("sync handler should not run");
          },
        },
      },
    });

    expect(registry.executeAction("bounded", "messages.send", { text: "this is too large" })).toEqual({
      ok: false,
      code: "INPUT_TOO_LARGE",
      message: "Operation input exceeds the connector manifest byte limit.",
    });
    expect(registry.executeSync("bounded", "messages.list", { response: { items: ["too large"] } })).toEqual({
      ok: false,
      code: "INPUT_TOO_LARGE",
      message: "Operation input exceeds the connector manifest byte limit.",
    });
  });

  test("wraps async action and sync handlers with manifest timeouts", async () => {
    const registry = createConnectorRegistry({
      manifests: [{
        key: "timed",
        name: "Timed",
        version: "0.1.0",
        runtime: "bun",
        auth: { type: "none", scopes: [] },
        network: { allowedHosts: ["api.example.com"] },
        operations: {
          "messages.send": { kind: "action", timeoutMs: 1, maxInputBytes: 1024 },
          "messages.list": { kind: "sync", timeoutMs: 1, maxInputBytes: 1024 },
        },
      }],
      healthchecks: {},
      actions: {
        timed: {
          "messages.send": () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 50)),
        },
      },
      syncs: {
        timed: {
          "messages.list": () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 50)),
        },
      },
    });

    const actionResult = registry.executeAction("timed", "messages.send", {});
    expect(actionResult.ok).toBe(true);
    if (actionResult.ok) {
      await expect(actionResult.output).rejects.toMatchObject({
        code: "OPERATION_TIMEOUT",
        message: "Operation exceeded the connector manifest timeout.",
      });
    }

    const syncResult = registry.executeSync("timed", "messages.list", {});
    expect(syncResult.ok).toBe(true);
    if (syncResult.ok) {
      await expect(syncResult.output).rejects.toMatchObject({
        code: "OPERATION_TIMEOUT",
        message: "Operation exceeded the connector manifest timeout.",
      });
    }
  });

  test("apify actors.input_schema is registered and executes the handler", async () => {
    const fetchStub = (async (info: RequestInfo | URL) => {
      const url = new URL(typeof info === "string" ? info : info.toString());
      void url;
      return new Response(JSON.stringify({ data: { actorDefinition: { input: { type: "object", properties: {} } } } }), { status: 200 });
    }) as typeof fetch;
    const result = defaultConnectorRegistry.executeAction("apify", "actors.input_schema", {
      apiKey: "k", actorId: "x~y", fetch: fetchStub,
    });
    expect(result.ok).toBe(true);
    const output = await (result as { ok: true; output: Promise<unknown> }).output;
    expect(output).toMatchObject({ connector: "apify", action: "actors.input_schema" });
  });

  test("apify actors.options is registered and executes the handler", async () => {
    const fetchStub = (async (info: RequestInfo | URL) => {
      const url = new URL(typeof info === "string" ? info : info.toString());
      const map: Record<string, unknown> = {
        "/v2/acts": { data: { items: [] } },
        "/v2/actor-tasks": { data: { items: [] } },
      };
      return new Response(JSON.stringify(map[url.pathname] ?? {}), { status: 200 });
    }) as typeof fetch;

    const result = defaultConnectorRegistry.executeAction("apify", "actors.options", {
      apiKey: "k", search: "", fetch: fetchStub,
    });
    expect(result.ok).toBe(true);
    const output = await (result as { ok: true; output: Promise<unknown> }).output;
    expect(output).toMatchObject({ connector: "apify", action: "actors.options" });
  });
});
