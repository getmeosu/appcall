import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { handleRPC } from "../src/server";
import { createConnectorRegistry, defaultConnectorRegistry } from "../src/registry";
import { compileDeclarativeConnector } from "../src/declarative/compile";
import { credentialKeys, hasCredentialInput, MISSING_CREDENTIAL } from "../src/credentials";
import * as mailchimp from "../../connectors/mailchimp/src/actions";

const CONNECTORS = join(import.meta.dir, "../../connectors");

type Manifest = { key: string; auth?: { type?: string }; http?: unknown; operations: Record<string, { kind?: string }> };

function manifests(): Manifest[] {
  return readdirSync(CONNECTORS)
    .filter((dir) => existsSync(join(CONNECTORS, dir, "manifest.json")))
    .map((dir) => JSON.parse(readFileSync(join(CONNECTORS, dir, "manifest.json"), "utf8")) as Manifest);
}

let fetchSpy: ReturnType<typeof spyOn> | undefined;
function spyFetch() {
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async () => {
    throw new Error("network must not be reached without a credential");
  }) as never);
  return fetchSpy;
}
afterEach(() => {
  fetchSpy?.mockRestore();
  fetchSpy = undefined;
});

async function rejection(value: unknown): Promise<unknown> {
  try {
    await value;
  } catch (error) {
    return error;
  }
  throw new Error("expected a rejection");
}

describe("PLAT-NOCRED-1 compiled operations", () => {
  const manifest = {
    key: "nocred-fixture",
    name: "NoCred",
    version: "0.0.1",
    runtime: "bun",
    auth: { type: "api_key", setup: { mode: "api_key", fields: [{ key: "apiKey", label: "Key", required: true, secret: true }] } },
    network: { allowedHosts: ["api.example.com"] },
    http: { baseUrl: "https://api.example.com", auth: { field: "apiKey", in: "header", name: "Authorization", value: "Bearer {{apiKey}}" } },
    operations: {
      "items.get": {
        kind: "action",
        timeoutMs: 1000,
        maxInputBytes: 1024,
        maxResponseBytes: 4096,
        inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        request: { method: "GET", path: "/items/{{id}}" },
      },
      healthcheck: {
        kind: "action",
        timeoutMs: 1000,
        maxInputBytes: 1024,
        maxResponseBytes: 4096,
        request: { method: "GET", path: "/me", echo: { status: "ok" } },
      },
    },
  };

  test("a compiled op without credentials rejects MISSING_CREDENTIAL with 0 fetches", async () => {
    const fetches = spyFetch();
    const { actions } = compileDeclarativeConnector(manifest as never) as unknown as {
      actions: Record<string, (input: unknown) => unknown>;
    };
    const error = await rejection(actions["items.get"]({ id: "1" }));
    expect(error).toEqual({ ok: false, code: MISSING_CREDENTIAL, message: expect.any(String) });
    expect(JSON.stringify(error)).not.toContain("validated");
    expect(fetches).toHaveBeenCalledTimes(0);
  });

  test("invalid input still reports the input error first", () => {
    const { actions } = compileDeclarativeConnector(manifest as never) as unknown as {
      actions: Record<string, (input: unknown) => unknown>;
    };
    expect(() => actions["items.get"]({})).toThrow();
  });

  test("the compiled healthcheck keeps its static no-credential echo (HEALTH-1)", () => {
    const { actions } = compileDeclarativeConnector(manifest as never) as unknown as {
      actions: Record<string, (input: unknown) => unknown>;
    };
    expect(actions.healthcheck({})).toMatchObject({ status: "ok" });
  });
});

describe("PLAT-NOCRED-1 hand-written branches", () => {
  test("every mailchimp echo branch is gone (box-owned; fixed in the handler)", () => {
    const source = readFileSync(join(CONNECTORS, "mailchimp/src/actions.ts"), "utf8");
    expect(source).not.toMatch(/source: "connector", validated/);
  });

  test("mailchimp contacts.create without credentials rejects MISSING_CREDENTIAL with 0 fetches", async () => {
    const fetches = spyFetch();
    const error = await rejection(mailchimp.createContact({ listId: "l1", email: "a@example.com" }));
    expect(error).toMatchObject({ ok: false, code: MISSING_CREDENTIAL });
    expect(fetches).toHaveBeenCalledTimes(0);
  });

  // Salesforce is Grok Build-owned: its 25 hand-written echo branches are left
  // untouched and the platform refuses dispatch before any handler runs.
  test("every salesforce action fails closed through the registry with 0 fetches", () => {
    const fetches = spyFetch();
    const sf = manifests().find((m) => m.key === "salesforce")!;
    const actions = Object.entries(sf.operations).filter(([op, o]) => (o.kind ?? "action") === "action" && op !== "healthcheck");
    expect(actions.length).toBeGreaterThanOrEqual(25);
    for (const [op] of actions) {
      expect(defaultConnectorRegistry.executeAction("salesforce", op, { lastName: "Doe", company: "Acme", jobId: "750x0000000005LAAQ", csv: "Name\nA" }), op)
        .toMatchObject({ ok: false });
    }
    for (const [op, input] of [
      ["contacts.create", { lastName: "Doe" }],
      ["leads.create", { lastName: "Doe", company: "Acme" }],
      ["jobs.ingest_upload", { jobId: "750x0000000005LAAQ", csv: "Name\nA" }],
    ] as const) {
      expect(defaultConnectorRegistry.executeAction("salesforce", op, input), op).toMatchObject({ ok: false, code: MISSING_CREDENTIAL });
    }
    expect(defaultConnectorRegistry.executeAction("mailchimp", "contacts.create", { listId: "l1", email: "a@example.com" }))
      .toMatchObject({ ok: false, code: MISSING_CREDENTIAL });
    expect(fetches).toHaveBeenCalledTimes(0);
  });

  test("the registry refuses before the hand-written handler is invoked", () => {
    let calls = 0;
    const registry = createConnectorRegistry({
      manifests: [{
        key: "keyed",
        name: "Keyed",
        version: "0.0.1",
        runtime: "bun",
        auth: { type: "api_key", setup: { mode: "api_key", fields: [{ key: "apiKey", label: "Key", required: true, secret: true }] } },
        network: { allowedHosts: [] },
        operations: { "items.list": { kind: "action", timeoutMs: 1000, maxInputBytes: 1024, maxResponseBytes: 4096 } },
      }],
      healthchecks: {},
      actions: { keyed: { "items.list": (input: unknown) => { calls += 1; return { validated: input }; } } },
      syncs: {},
    } as never);
    expect(registry.executeAction("keyed", "items.list", {})).toMatchObject({ ok: false, code: MISSING_CREDENTIAL });
    expect(calls).toBe(0);
    expect(registry.executeAction("keyed", "items.list", { apiKey: "k" }).ok).toBe(true);
    expect(calls).toBe(1);
  });
});

describe("PLAT-NOCRED-1 manifest-declared auth", () => {
  test("auth none needs no credential and still runs", async () => {
    for (const manifest of manifests().filter((m) => (m.auth?.type ?? "none") === "none")) {
      expect(credentialKeys(manifest)).toBeUndefined();
    }
    const registry = createConnectorRegistry({
      manifests: [{
        key: "public-api",
        name: "Public",
        version: "0.0.1",
        runtime: "bun",
        auth: { type: "none" },
        network: { allowedHosts: [] },
        operations: { "items.list": { kind: "action", timeoutMs: 1000, maxInputBytes: 1024, maxResponseBytes: 4096 } },
      }],
      healthchecks: {},
      actions: { "public-api": { "items.list": () => ({ items: [] }) } },
      syncs: {},
    } as never);
    const result = registry.executeAction("public-api", "items.list", {});
    expect(result.ok).toBe(true);
    if (result.ok) expect(await result.output).toEqual({ items: [] });
  });

  test("token auth types accept the resolved accessToken", () => {
    expect(credentialKeys({ auth: { type: "oauth2" }, http: { auth: { field: "apiKey" } } })).toEqual(["apiKey", "accessToken"]);
    expect(hasCredentialInput({ accessToken: "t" }, ["apiKey", "accessToken"])).toBe(true);
    expect(hasCredentialInput({ accessToken: "" }, ["apiKey", "accessToken"])).toBe(false);
    expect(credentialKeys({ auth: { type: "api_key", setup: { fields: [], routes: [{ fields: [{ key: "apiKey", required: true, secret: true }] }] } } }))
      .toEqual(["apiKey"]);
  });

  test("MISSING_CREDENTIAL maps to 422 over RPC", async () => {
    const response = await handleRPC(new Request("http://runner.local/rpc", {
      method: "POST",
      body: JSON.stringify({
        id: "nocred",
        method: "connector.action.execute",
        params: { connectorKey: "salesforce", action: "contacts.create", input: { lastName: "Doe" } },
      }),
    }));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe(MISSING_CREDENTIAL);
  });
});

describe("PLAT-NOCRED-1 sweep: no operation succeeds without a required credential", () => {
  test("every fixture success case, replayed without credentials, fails closed with 0 fetches", async () => {
    const fetches = spyFetch();
    const byKey = new Map(manifests().map((m) => [m.key, m]));
    let gated = 0;
    const leaks: string[] = [];
    for (const dir of readdirSync(CONNECTORS)) {
      const caseDir = join(CONNECTORS, dir, "fixtures", "cases");
      if (!existsSync(caseDir)) continue;
      for (const file of readdirSync(caseDir).filter((name) => name.endsWith(".json"))) {
        const fixture = JSON.parse(readFileSync(join(caseDir, file), "utf8"));
        const manifest = byKey.get(dir);
        if (!manifest || fixture.operation === "healthcheck" || fixture.expected?.kind !== "success") continue;
        const keys = credentialKeys(manifest);
        if (!keys) continue;
        const kind = manifest.operations[fixture.operation]?.kind;
        const input = { ...(fixture.input ?? {}) };
        for (const key of [...keys, ...Object.keys(fixture.credentials ?? {})]) delete input[key];
        const result = kind === "sync"
          ? defaultConnectorRegistry.executeSync(dir, fixture.operation, input)
          : defaultConnectorRegistry.executeAction(dir, fixture.operation, input);
        if (result.ok) {
          leaks.push(`${dir} ${fixture.operation}`);
          await Promise.resolve(result.output).catch(() => undefined);
        } else if (result.code === MISSING_CREDENTIAL) {
          gated += 1;
        }
      }
    }
    expect(leaks).toEqual([]);
    expect(gated).toBeGreaterThan(500);
    expect(fetches).toHaveBeenCalledTimes(0);
  }, 120000);

  test("every declared action and sync of a credentialed connector refuses an empty input", () => {
    const fetches = spyFetch();
    const leaks: string[] = [];
    for (const manifest of manifests()) {
      if (!credentialKeys(manifest)) continue;
      for (const [operation, spec] of Object.entries(manifest.operations ?? {})) {
        if (operation === "healthcheck" || (spec.kind !== "action" && spec.kind !== "sync")) continue;
        const result = spec.kind === "sync"
          ? defaultConnectorRegistry.executeSync(manifest.key, operation, {})
          : defaultConnectorRegistry.executeAction(manifest.key, operation, {});
        if (result.ok) leaks.push(`${manifest.key} ${operation}`);
      }
    }
    expect(leaks).toEqual([]);
    expect(fetches).toHaveBeenCalledTimes(0);
  }, 120000);
});
