// REG-VALIDATE-1: every registry action/sync dispatch is validated against the
// operation's manifest inputSchema before the handler runs, for hand-written
// handlers exactly as for compiled declarative ones.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { createConnectorRegistry, defaultConnectorRegistry } from "../src/registry";
import { handleRPC } from "../src/server";
import { buildInputValidators } from "../src/input_schema";
import { compileStrictValidator } from "../src/declarative/strict-schema";

const connectorsRoot = new URL("../../connectors", import.meta.url).pathname;

function countingFetch(response: () => Response = () => Response.json({ message: "boom" }, { status: 500 })) {
  const calls: string[] = [];
  const fetch = async (url: string | URL | Request) => {
    calls.push(String(url));
    return response();
  };
  return { calls, fetch };
}

describe("registry input schema validation", () => {
  describe("hand-written handlers", () => {
    test("lever opportunities.update rejects an unknown key with INVALID_ACTION_INPUT before any network call", () => {
      const net = countingFetch();
      const result = defaultConnectorRegistry.executeAction("lever", "opportunities.update", {
        apiKey: "k",
        region: "eu",
        fetch: net.fetch,
        id: "opp-1",
        completedAt: 1700000000000,
      });
      expect(result).toEqual({
        ok: false,
        code: "INVALID_ACTION_INPUT",
        message: "lever.opportunities.update: Unsupported input field: completedAt",
      });
      expect(net.calls).toEqual([]);
    });

    test("lever opportunities.update rejects a wrong type with INVALID_ACTION_INPUT naming the path", () => {
      const net = countingFetch();
      const wrongId = defaultConnectorRegistry.executeAction("lever", "opportunities.update", {
        apiKey: "k", region: "eu", fetch: net.fetch, id: 42,
      });
      expect(wrongId).toEqual({
        ok: false,
        code: "INVALID_ACTION_INPUT",
        message: "lever.opportunities.update: id has an invalid type (expected string)",
      });
      const wrongItem = defaultConnectorRegistry.executeAction("lever", "opportunities.update", {
        apiKey: "k", region: "eu", fetch: net.fetch, id: "opp-1", tags: ["ok", 7],
      });
      expect(wrongItem).toEqual({
        ok: false,
        code: "INVALID_ACTION_INPUT",
        message: "lever.opportunities.update: tags[1] has an invalid type (expected string)",
      });
      const missing = defaultConnectorRegistry.executeAction("lever", "opportunities.update", {
        apiKey: "k", region: "eu", fetch: net.fetch, name: "Ada",
      });
      expect(missing).toMatchObject({ ok: false, code: "INVALID_ACTION_INPUT", message: "lever.opportunities.update: id is required" });
      expect(net.calls).toEqual([]);
    });

    test("intercom conversations.reply rejects unknown keys and bad enums before any network call", () => {
      const net = countingFetch();
      const base = { accessToken: "t", fetch: net.fetch, id: "c1", messageType: "comment", type: "admin", adminId: "a1", body: "hi" };
      expect(defaultConnectorRegistry.executeAction("intercom", "conversations.reply", { ...base, bogus: true }))
        .toMatchObject({ ok: false, code: "INVALID_ACTION_INPUT", message: "intercom.conversations.reply: Unsupported input field: bogus" });
      expect(defaultConnectorRegistry.executeAction("intercom", "conversations.reply", { ...base, messageType: "shout" }))
        .toMatchObject({ ok: false, code: "INVALID_ACTION_INPUT", message: "intercom.conversations.reply: messageType is not an allowed value" });
      expect(net.calls).toEqual([]);
    });

    test("valid input with credentials and the fetch override still reaches the hand-written handler", async () => {
      const net = countingFetch();
      const result = defaultConnectorRegistry.executeAction("lever", "opportunities.update", {
        apiKey: "k", region: "eu", fetch: net.fetch, id: "opp-1", tags: ["a"],
      });
      expect(result.ok).toBe(true);
      if (result.ok) await Promise.resolve(result.output).catch(() => undefined);
      expect(net.calls.length).toBeGreaterThan(0);
      expect(net.calls[0]).toStartWith("https://api.lever.eu/v1/opportunities/opp-1");
    });

    test("the runner RPC maps a schema rejection to HTTP 400 INVALID_ACTION_INPUT", async () => {
      const response = await handleRPC(new Request("http://runner.local/rpc", {
        method: "POST",
        body: JSON.stringify({
          id: "req_schema",
          method: "connector.action.execute",
          params: { connectorKey: "lever", action: "opportunities.update", input: { apiKey: "k", region: "eu", id: "opp-1", bogus: 1 } },
        }),
      }));
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toEqual({ code: "INVALID_ACTION_INPUT", message: "lever.opportunities.update: Unsupported input field: bogus" });
    });
  });

  describe("generated (compiled declarative) path regression", () => {
    test("a strict-generated op still rejects unknown keys and bounds with INVALID_ACTION_INPUT and never fetches", () => {
      const net = countingFetch();
      expect(defaultConnectorRegistry.executeAction("emailoctopus", "lists.list", { apiKey: "k", fetch: net.fetch, limit: 10, bogus: 1 }))
        .toMatchObject({ ok: false, code: "INVALID_ACTION_INPUT", message: "emailoctopus.lists.list: Unsupported input field: bogus" });
      expect(defaultConnectorRegistry.executeAction("emailoctopus", "lists.list", { apiKey: "k", fetch: net.fetch, limit: 1000 }))
        .toMatchObject({ ok: false, code: "INVALID_ACTION_INPUT", message: "emailoctopus.lists.list: limit is above maximum" });
      expect(net.calls).toEqual([]);
    });

    test("a strict-generated op with valid input still dispatches exactly one provider call", async () => {
      const net = countingFetch(() => Response.json({ data: [], paging: {} }, { status: 200 }));
      const result = defaultConnectorRegistry.executeAction("emailoctopus", "lists.list", { apiKey: "k", fetch: net.fetch, limit: 10 });
      expect(result.ok).toBe(true);
      if (result.ok) await Promise.resolve(result.output).catch(() => undefined);
      expect(net.calls.length).toBe(1);
      expect(net.calls[0]).toContain("limit=10");
    });

    test("the fixture-safe echo path (no credential) still validates and echoes", async () => {
      const result = defaultConnectorRegistry.executeAction("emailoctopus", "lists.list", { limit: 5 });
      expect(result.ok).toBe(true);
      if (result.ok) expect(await Promise.resolve(result.output)).toMatchObject({ connector: "emailoctopus", action: "lists.list", source: "connector" });
    });
  });

  test("syncs are validated too, and the worker-injected cursor is exempt", () => {
    const manifest = {
      key: "probe", name: "Probe", version: "0.0.1", runtime: "bun",
      auth: { type: "api_key", scopes: [], setup: { mode: "api_key", fields: [{ key: "apiKey", label: "Key", required: true, secret: true }] } },
      network: { allowedHosts: ["probe.local"] },
      operations: {
        "items.list": {
          kind: "sync", timeoutMs: 1000, maxInputBytes: 4096, maxResponseBytes: 65536,
          inputSchema: { type: "object", additionalProperties: false, properties: { limit: { type: "integer", minimum: 1 } } },
        },
      },
    };
    let ran = 0;
    const registry = createConnectorRegistry({
      manifests: [manifest], healthchecks: {}, actions: {},
      syncs: { probe: { "items.list": () => { ran += 1; return { records: [] }; } } },
    });
    expect(registry.executeSync("probe", "items.list", { apiKey: "k", cursor: "c1", limit: 5 }).ok).toBe(true);
    expect(ran).toBe(1);
    expect(registry.executeSync("probe", "items.list", { apiKey: "k", since: "2026-01-01" }))
      .toEqual({ ok: false, code: "INVALID_ACTION_INPUT", message: "probe.items.list: Unsupported input field: since" });
    expect(registry.executeSync("probe", "items.list", { limit: 0 }))
      .toEqual({ ok: false, code: "INVALID_ACTION_INPUT", message: "probe.items.list: limit is below minimum" });
    expect(ran).toBe(1);
  });

  test("healthcheck dispatch is exempt: its input is the stored credential bundle", () => {
    const result = defaultConnectorRegistry.executeAction("slack", "healthcheck", {});
    expect(result.ok).toBe(true);
  });

  test("every manifest inputSchema across all connectors compiles to a dispatch validator", () => {
    const manifests: Array<{ key: string; operations: Record<string, { inputSchema?: unknown }> }> = [];
    for (const dir of readdirSync(connectorsRoot)) {
      const path = `${connectorsRoot}/${dir}/manifest.json`;
      if (existsSync(path)) manifests.push(JSON.parse(readFileSync(path, "utf8")));
    }
    expect(manifests.length).toBeGreaterThanOrEqual(461);
    const validators = buildInputValidators(manifests);
    let compiled = 0;
    for (const manifest of manifests) {
      for (const [op, spec] of Object.entries(manifest.operations)) {
        const validator = validators.get(manifest.key, op);
        if (spec.inputSchema && typeof spec.inputSchema === "object") {
          expect(typeof validator, `${manifest.key}.${op}`).toBe("function");
          // Cached: the second lookup returns the same compiled function.
          expect(validators.get(manifest.key, op)).toBe(validator!);
          compiled += 1;
        } else {
          expect(validator, `${manifest.key}.${op}`).toBeUndefined();
        }
      }
    }
    expect(compiled).toBeGreaterThan(3900);
  });

  test("github combinator ops are enforced in full at dispatch, with no allowlist", async () => {
    const net = countingFetch();
    expect(defaultConnectorRegistry.executeAction("github", "deployments.get", { accessToken: "t", fetch: net.fetch, owner: "o", repo: "r", deploymentId: "not-a-number" }))
      .toMatchObject({ ok: false, code: "INVALID_ACTION_INPUT", message: "github.deployments.get: deploymentId has an invalid type (expected number)" });
    expect(defaultConnectorRegistry.executeAction("github", "discussions.get", { accessToken: "t", fetch: net.fetch, owner: "o", repo: "r", categoryId: "C" }))
      .toEqual({ ok: false, code: "INVALID_ACTION_INPUT", message: "github.discussions.get: input requires one of: discussionNumber | discussionId | title" });
    expect(defaultConnectorRegistry.executeAction("github", "discussions.update", { accessToken: "t", fetch: net.fetch, owner: "o", repo: "r", discussionNumber: 7 }))
      .toEqual({ ok: false, code: "INVALID_ACTION_INPUT", message: "github.discussions.update: input requires one of: title | body | categoryId" });
    expect(defaultConnectorRegistry.executeAction("github", "deployments.create", { accessToken: "t", fetch: net.fetch, owner: "o", repo: "r", ref: "main", payload: 5 }))
      .toEqual({ ok: false, code: "INVALID_ACTION_INPUT", message: "github.deployments.create: payload must match exactly one allowed alternative" });
    expect(net.calls).toEqual([]);
    const ok = defaultConnectorRegistry.executeAction("github", "discussions.get", { accessToken: "t", fetch: net.fetch, owner: "o", repo: "r", title: "Welcome" });
    expect(ok.ok).toBe(true);
    if (ok.ok) await Promise.resolve(ok.output).catch(() => undefined);
    expect(net.calls.length).toBeGreaterThan(0);
  });

  test("validators are compiled once: dispatch never re-checks the schema", () => {
    const schema: Record<string, unknown> = { type: "object", additionalProperties: false, properties: { a: { type: "string" } } };
    const validate = compileStrictValidator(schema, { registry: true });
    // Mutating the schema into one that would fail the compile-time check
    // proves the per-call path does not re-run it.
    schema.patternProperties = {};
    (schema.properties as Record<string, Record<string, unknown>>).a.type = "number";
    expect(validate({ a: "x" })).toEqual({ a: "x" });
    expect(() => validate({ a: 1 })).toThrow("a has an invalid type (expected string)");
  });
});
