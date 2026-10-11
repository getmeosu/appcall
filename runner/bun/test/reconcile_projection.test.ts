import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createConnectorRegistry, defaultConnectorRegistry } from "../src/registry";

type Call = { method: string; url: string; body: string | null };

function intercomFetch(status = 200, body: unknown = { type: "conversation", id: "147", state: "open" }) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push({ method: init?.method ?? "GET", url, body: typeof init?.body === "string" ? init.body : null });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

async function settle(result: ReturnType<typeof defaultConnectorRegistry.executeAction>) {
  if (!result.ok) return { failure: result };
  try {
    return { output: await Promise.resolve(result.output) };
  } catch (error) {
    return { error: error as Record<string, unknown> };
  }
}

describe("Reconcile observe projection: intercom conversation writes", () => {
  const cases: [string, Record<string, unknown>, string][] = [
    ["conversations.close", { id: "147", adminId: "991", body: "Closing - resolved." }, "/conversations/147/parts"],
    ["conversations.assign", { id: "147", adminId: "991", assigneeId: "5", body: "Over to you." }, "/conversations/147/parts"],
    ["conversations.tag", { id: "147", tagId: "17", adminId: "991" }, "/conversations/147/tags"],
  ];

  for (const [action, input, writePath] of cases) {
    test(`${action} with action-only inputs observes conversations.get`, async () => {
      const { calls, impl } = intercomFetch();
      const settled = await settle(
        defaultConnectorRegistry.executeAction("intercom", action, { ...input, accessToken: "token", fetch: impl }),
      );
      expect(settled.error).toBeUndefined();
      expect(settled.failure).toBeUndefined();
      expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}${new URL(c.url).search}`)).toEqual([
        `POST ${writePath}`,
        "GET /conversations/147",
      ]);
      expect(settled.output).toMatchObject({ connector: "intercom", action: "conversations.get", data: { id: "147" } });
    });
  }

  test("conversations.reply is a create: returns the primary, no observe", async () => {
    const { calls, impl } = intercomFetch(200, { type: "conversation", id: "147" });
    const settled = await settle(
      defaultConnectorRegistry.executeAction("intercom", "conversations.reply", {
        id: "147",
        type: "admin",
        messageType: "comment",
        adminId: "991",
        body: "Thanks",
        accessToken: "token",
        fetch: impl,
      }),
    );
    expect(settled.error).toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(new URL(calls[0].url).pathname).toBe("/conversations/147/reply");
    expect(settled.output).toMatchObject({ id: "147" });
  });

  test("upstream write failure surfaces CONNECTOR_UPSTREAM_ERROR and never observes", async () => {
    const { calls, impl } = intercomFetch(404, { type: "error.list", errors: [{ code: "not_found", message: "Resource Not Found" }] });
    const settled = await settle(
      defaultConnectorRegistry.executeAction("intercom", "conversations.close", {
        id: "missing",
        adminId: "991",
        accessToken: "token",
        fetch: impl,
      }),
    );
    expect(settled.error).toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
  });
});

// ---------------------------------------------------------------------------
// Synthetic connector: generic projection + guards
// ---------------------------------------------------------------------------

const budget = { timeoutMs: 1_000, maxInputBytes: 4_096, maxResponseBytes: 4_096 };

function syntheticRegistry(operations: Record<string, unknown>, recorder: Record<string, unknown[]>) {
  const record = (name: string, result: (input: unknown) => unknown) => (input: unknown) => {
    (recorder[name] ??= []).push(input);
    return result(input);
  };
  return createConnectorRegistry({
    manifests: [{
      key: "projection-demo",
      name: "Projection Demo",
      version: "0.1.0",
      runtime: "bun",
      auth: { type: "none", scopes: [] },
      network: { allowedHosts: ["runner.local"] },
      operations: operations as never,
    }],
    healthchecks: { "projection-demo": () => ({ status: "ok" }) },
    actions: {
      "projection-demo": {
        "things.update": record("things.update", () => ({ updated: true })),
        "things.create": record("things.create", () => ({ id: "new-1" })),
        "things.ping": record("things.ping", () => ({ pinged: true })),
        "things.get": record("things.get", (input) => ({ observed: input })),
        "things.peek": record("things.peek", (input) => ({ peeked: input })),
      },
    },
  });
}

const closedObserve = {
  kind: "action",
  sideEffect: "read",
  ...budget,
  inputSchema: {
    type: "object",
    required: ["id"],
    properties: { id: { type: "string" }, view: { type: "string" } },
    additionalProperties: false,
  },
};

const updateAction = {
  kind: "action",
  sideEffect: "write",
  effectPolicy: "Reconcile",
  reconcile: "things.get",
  ...budget,
  inputSchema: {
    type: "object",
    required: ["id"],
    properties: { id: { type: "string" }, name: { type: "string" }, view: { type: "string" } },
    additionalProperties: false,
  },
};

describe("Reconcile observe projection: synthetic connector", () => {
  test("drops action-only keys, keeps observe-declared and runtime keys", async () => {
    const recorder: Record<string, unknown[]> = {};
    const registry = syntheticRegistry({ "things.update": updateAction, "things.get": closedObserve }, recorder);
    const fetchMarker = () => undefined;
    const result = registry.executeAction("projection-demo", "things.update", {
      id: "42",
      name: "renamed",
      view: "full",
      accessToken: "secret",
      fetch: fetchMarker,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    await Promise.resolve(result.output);
    expect(recorder["things.update"]).toEqual([{ id: "42", name: "renamed", view: "full", accessToken: "secret", fetch: fetchMarker }]);
    expect(recorder["things.get"]).toEqual([{ id: "42", view: "full", accessToken: "secret", fetch: fetchMarker }]);
  });

  test("open observe (no closed schema) still receives the full action input", async () => {
    const recorder: Record<string, unknown[]> = {};
    const registry = syntheticRegistry({
      "things.update": { ...updateAction, reconcile: "things.peek" },
      "things.peek": { kind: "sync", ...budget },
    }, recorder);
    const result = registry.executeAction("projection-demo", "things.update", { id: "42", name: "x", accessToken: "s" });
    if (!result.ok) throw new Error("unexpected failure");
    await Promise.resolve(result.output);
    expect(recorder["things.peek"]).toEqual([{ id: "42", name: "x", accessToken: "s" }]);
  });

  test("Idempotent merges the projected primary id into the projected input", async () => {
    const recorder: Record<string, unknown[]> = {};
    const registry = syntheticRegistry({
      "things.create": {
        kind: "action",
        sideEffect: "write",
        effectPolicy: "Idempotent",
        reconcile: "things.get",
        ...budget,
        inputSchema: { type: "object", properties: { name: { type: "string" } }, additionalProperties: false },
      },
      "things.get": closedObserve,
    }, recorder);
    const result = registry.executeAction("projection-demo", "things.create", { name: "n", accessToken: "s" });
    if (!result.ok) throw new Error("unexpected failure");
    await Promise.resolve(result.output);
    expect(recorder["things.get"]).toEqual([{ accessToken: "s", id: "new-1" }]);
  });

  test("Idempotent without a reconcile target returns the primary (validation.rs parity)", async () => {
    const recorder: Record<string, unknown[]> = {};
    const registry = syntheticRegistry({
      "things.ping": { kind: "action", sideEffect: "write", effectPolicy: "Idempotent", ...budget },
    }, recorder);
    const result = registry.executeAction("projection-demo", "things.ping", {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await Promise.resolve(result.output)).toEqual({ pinged: true });
  });

  test("required observe key absent from this call fails INVALID_ACTION_INPUT before the write", () => {
    const recorder: Record<string, unknown[]> = {};
    const registry = syntheticRegistry({
      "things.update": { ...updateAction, inputSchema: { ...updateAction.inputSchema, required: [] } },
      "things.get": { ...closedObserve, inputSchema: { ...closedObserve.inputSchema, required: ["id", "view"] } },
    }, recorder);
    const result = registry.executeAction("projection-demo", "things.update", { id: "42", name: "x" });
    expect(result).toMatchObject({ ok: false, code: "INVALID_ACTION_INPUT" });
    expect(recorder["things.update"]).toBeUndefined();
    expect(recorder["things.get"]).toBeUndefined();
  });

  test("a pairing whose closed observe requires a key the action cannot accept does not load", () => {
    expect(() =>
      syntheticRegistry({
        "things.update": updateAction,
        "things.get": {
          ...closedObserve,
          inputSchema: {
            ...closedObserve.inputSchema,
            required: ["id", "tenant"],
            properties: { ...closedObserve.inputSchema.properties, tenant: { type: "string" } },
          },
        },
      }, {}),
    ).toThrow(/requires tenant/);
  });

  test("Reconcile naming an undeclared observe does not load", () => {
    expect(() => syntheticRegistry({ "things.update": { ...updateAction, reconcile: "things.missing" } }, {})).toThrow(
      /not declared/,
    );
  });
});

// ---------------------------------------------------------------------------
// Scan: every effect pairing across all manifests resolves
// ---------------------------------------------------------------------------

type Op = Record<string, unknown> & { inputSchema?: { properties?: Record<string, unknown>; required?: string[]; additionalProperties?: unknown } };

// Pre-existing pairings whose OPEN (hand-written) observe lists a required key
// the action schema does not declare. The runner does not enforce open-observe
// schemas, so these load; some still fail after the write (tracked as
// follow-up cards). This list may only shrink.
const KNOWN_OPEN_OBSERVE_GAPS = [
  "github commits.comments.create -> commits.get [ref]",
  "github commits.statuses.create -> commits.status.get [ref]",
  "github issues.comments.delete -> issues.get [issueNumber]",
  "github issues.comments.update -> issues.get [issueNumber]",
  "github notifications.threads.subscription.set -> notifications.threads.subscription.get [thread_id]",
  "github orgs.repos.create -> repos.get [owner,repo]",
  "google-ads ad_groups.mutate -> ad_groups.get [adGroupId]",
  "google-ads ads.mutate -> ads.get [adId]",
  "google-ads budgets.mutate -> budgets.get [budgetId]",
  "google-ads campaigns.mutate -> campaigns.get [campaignId]",
  "google-ads conversion_actions.mutate -> conversion_actions.get [conversionActionId]",
  "google-ads keywords.mutate -> keywords.get [criterionId]",
];

describe("effect pairing scan (all connector manifests)", () => {
  const root = join(import.meta.dir, "..", "..", "connectors");
  const manifests = readdirSync(root)
    .filter((dir) => existsSync(join(root, dir, "manifest.json")))
    .map((dir) => JSON.parse(readFileSync(join(root, dir, "manifest.json"), "utf8")) as { key: string; operations?: Record<string, Op> });

  test("every Reconcile/Idempotent pairing resolves and closed observes are satisfiable", () => {
    const problems: string[] = [];
    const openGaps: string[] = [];
    let pairings = 0;
    for (const manifest of manifests) {
      const ops = manifest.operations ?? {};
      for (const [name, op] of Object.entries(ops)) {
        const policy = op.effectPolicy;
        if (policy !== "Reconcile" && policy !== "Idempotent") {
          if (op.reconcile !== undefined) problems.push(`${manifest.key} ${name}: reconcile without effectPolicy`);
          continue;
        }
        const target = typeof op.reconcile === "string" ? op.reconcile : "";
        if (!target) {
          if (policy === "Reconcile") problems.push(`${manifest.key} ${name}: Reconcile without reconcile`);
          continue;
        }
        pairings += 1;
        const observe = ops[target];
        if (!observe) {
          problems.push(`${manifest.key} ${name}: reconcile ${target} not declared`);
          continue;
        }
        if (!(observe.kind === "sync" || observe.sideEffect === "read")) {
          problems.push(`${manifest.key} ${name}: reconcile ${target} is not a read/sync`);
        }
        const actionProps = new Set(Object.keys(op.inputSchema?.properties ?? {}));
        const missing = (observe.inputSchema?.required ?? []).filter(
          (key) => !actionProps.has(key) && !(policy === "Idempotent" && key === "id"),
        );
        if (missing.length === 0) continue;
        const line = `${manifest.key} ${name} -> ${target} [${missing.join(",")}]`;
        if (observe.inputSchema?.additionalProperties === false) problems.push(`closed observe unsatisfiable: ${line}`);
        else openGaps.push(line);
      }
    }
    expect(pairings).toBeGreaterThan(100);
    expect(problems).toEqual([]);
    expect(openGaps.sort()).toEqual([...KNOWN_OPEN_OBSERVE_GAPS].sort());
  });

  test("the default registry (all manifests) loads with the pairing guard on", () => {
    expect(defaultConnectorRegistry.describe("intercom")).toBeDefined();
  });
});
