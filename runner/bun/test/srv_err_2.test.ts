import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { handleRPC } from "../src/server";
import { createConnectorRegistry, defaultConnectorRegistry } from "../src/registry";

// SRV-ERR-2: a handler that throws synchronously must produce the same server
// body and status as one whose promise rejects with the same value, so
// CONNECTOR_CAPABILITY_MISSING keeps reason / missingScopes / requiredScopes /
// reconsentRequired and maps to 403 on every path (healthcheck, action, sync).

const capability = {
  ok: false,
  code: "CONNECTOR_CAPABILITY_MISSING",
  message: "Meta Ads permission missing for leads.list.",
  reason: "permission_missing",
  missingScopes: ["leads_retrieval"],
  requiredScopes: ["leads_retrieval", "pages_manage_ads"],
  reconsentRequired: true,
};
const limited = { ok: false, code: "CONNECTOR_RATE_LIMITED", message: "slow", retryAfterSeconds: 30 };
const plain = new Error("boom");

let thrown: unknown;
const fail = (mode: "sync" | "async") => () => {
  if (mode === "sync") throw thrown;
  return Promise.reject(thrown);
};
const op = { timeoutMs: 1_000, maxInputBytes: 1_024, maxResponseBytes: 1_024 };
const registry = (mode: "sync" | "async") => createConnectorRegistry({
  manifests: [{
    key: "cap-demo",
    name: "Cap Demo",
    version: "0.1.0",
    runtime: "bun",
    auth: { type: "none", scopes: [] },
    network: { allowedHosts: ["runner.local"] },
    operations: {
      healthcheck: { kind: "action", sideEffect: "read", ...op },
      "items.do": { kind: "action", sideEffect: "read", ...op },
      "items.list": { kind: "sync", ...op },
    },
  }] as never,
  healthchecks: { "cap-demo": fail(mode) },
  actions: { "cap-demo": { "items.do": fail(mode) } },
  syncs: { "cap-demo": { "items.list": fail(mode) } },
});

const original = { ...defaultConnectorRegistry };
afterEach(() => {
  Object.assign(defaultConnectorRegistry, original);
  (console.error as any).mockRestore?.();
});

async function rpc(mode: "sync" | "async", method: string, params: Record<string, unknown>) {
  spyOn(console, "error").mockImplementation(() => {});
  const fake = registry(mode);
  Object.assign(defaultConnectorRegistry, {
    describe: fake.describe,
    healthcheck: fake.healthcheck,
    executeAction: fake.executeAction,
    executeSync: fake.executeSync,
    operationBudget: fake.operationBudget,
  });
  const response = await handleRPC(new Request("http://runner.local/rpc", {
    method: "POST",
    body: JSON.stringify({ id: "req_srv_err_2", method, params: { connectorKey: "cap-demo", input: {}, ...params } }),
  }));
  return { status: response.status, body: await response.text() };
}

const paths: Array<[string, string, Record<string, unknown>]> = [
  ["healthcheck", "connector.healthcheck", {}],
  ["healthcheck as action", "connector.action.execute", { action: "healthcheck" }],
  ["action", "connector.action.execute", { action: "items.do" }],
  ["sync", "connector.sync.list", { sync: "items.list" }],
];

describe("SRV-ERR-2 sync throw and async reject are identical", () => {
  for (const [name, method, params] of paths) {
    test(`${name}: capability failure keeps every field and maps to 403`, async () => {
      thrown = capability;
      const sync = await rpc("sync", method, params);
      const async = await rpc("async", method, params);
      expect(sync).toEqual(async);
      expect(sync.status).toBe(403);
      expect(JSON.parse(sync.body)).toEqual({
        id: "req_srv_err_2",
        ok: false,
        error: {
          code: "CONNECTOR_CAPABILITY_MISSING",
          message: capability.message,
          reason: "permission_missing",
          missingScopes: ["leads_retrieval"],
          requiredScopes: ["leads_retrieval", "pages_manage_ads"],
          reconsentRequired: true,
        },
      });
    });

    test(`${name}: rate limit keeps retryAfterSeconds`, async () => {
      thrown = limited;
      const sync = await rpc("sync", method, params);
      expect(sync).toEqual(await rpc("async", method, params));
      expect(sync.status).toBe(429);
      expect(JSON.parse(sync.body).error).toEqual({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 30, message: "slow" });
    });

    test(`${name}: an unstructured Error maps the same way on both paths`, async () => {
      thrown = plain;
      const sync = await rpc("sync", method, params);
      expect(sync).toEqual(await rpc("async", method, params));
      expect(JSON.parse(sync.body).error.message).toBe("boom");
    });
  }
});
