import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { defaultConnectorRegistry } from "../../../bun/src/registry";
import { compileStrictValidator } from "../../../bun/src/declarative/strict-schema";

// FX-meta-1 (fix-effects-x §R5 shape rule): Reconcile is kept only when an exact
// observe's raw output validates against the reconciled op's own outputSchema.
// campaigns/ad_sets/ads/ad_creatives.get return {campaign|adSet|ad|creative};
// the updates declare {id, success}. So the 4 updates omit every effect key.

type Op = Record<string, any>;
const ops = manifest.operations as Record<string, Op>;
const EFFECT_KEYS = ["effectPolicy", "reconcile", "observe", "reconcileInput"];

const UPDATES: [string, string, Record<string, unknown>, string][] = [
  ["campaigns.update", "campaigns.get", { campaignId: "23851234567890123", name: "Summer Sale v2", status: "PAUSED" }, "/23851234567890123"],
  ["ad_sets.update", "ad_sets.get", { adSetId: "23851234567890456", name: "Adults 25-44 v2", status: "PAUSED" }, "/23851234567890456"],
  ["ads.update", "ads.get", { adId: "23851234567890789", name: "Ad v2", status: "PAUSED" }, "/23851234567890789"],
  ["ad_creatives.update", "ad_creatives.get", { creativeId: "23851234567890999", name: "Creative v2" }, "/23851234567890999"],
];

function graphFetch(body: unknown = { success: true }) {
  const calls: { method: string; url: string }[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push({ method: init?.method ?? (input instanceof Request ? input.method : "GET"), url });
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

describe("FX-meta-1: meta-ads updates carry no effect keys", () => {
  for (const [id, observe] of UPDATES) {
    test(`${id} omits effectPolicy/reconcile/observe/reconcileInput`, () => {
      for (const key of EFFECT_KEYS) expect(ops[id]![key], `${id}.${key}`).toBeUndefined();
      expect(ops[id]!.sideEffect).toBe("write");
      expect(ops[id]!.description).not.toContain("Reconciles via");
      expect(ops[id]!.description).toContain(`${observe} returns`);
    });

    test(`${id} outputSchema is unchanged ({connector, action, source, id, success})`, () => {
      expect(ops[id]!.outputSchema).toEqual({
        type: "object",
        properties: {
          connector: { type: "string" },
          action: { type: "string" },
          source: { type: "string" },
          id: { type: "string" },
          success: { type: "boolean" },
        },
      });
    });
  }

  for (const [id, , input, path] of UPDATES) {
    test(`${id} dispatches through the registry with one POST and no observe`, async () => {
      const { calls, impl } = graphFetch({ success: true });
      const result = defaultConnectorRegistry.executeAction("meta-ads", id, { ...input, accessToken: "token", fetch: impl });
      expect(result.ok).toBe(true);
      const output = await Promise.resolve((result as { output: unknown }).output) as Record<string, unknown>;
      expect(calls).toHaveLength(1);
      expect(calls[0]!.method).toBe("POST");
      expect(new URL(calls[0]!.url).pathname.endsWith(path)).toBe(true);
      expect(output.action).toBe(id);
      expect(output.success).toBe(true);
      const validate = compileStrictValidator(ops[id]!.outputSchema, { registry: true });
      expect(() => validate(output)).not.toThrow();
    });
  }
});

describe("FX-meta-1: meta-ads-wide effect-rule scan", () => {
  const entries = Object.entries(ops);

  test("Idempotent appears nowhere", () => {
    expect(JSON.stringify(manifest).includes("Idempotent")).toBe(false);
  });

  test("no meta-ads op carries any effect key", () => {
    for (const [id, op] of entries) {
      for (const key of EFFECT_KEYS) expect(op[key], `${id}.${key}`).toBeUndefined();
    }
  });

  test("deletes are sideEffect destructive (Meta: DELETED cannot change status)", () => {
    const deletes = entries.filter(([id]) => /\.delete$/.test(id)).map(([id]) => id).sort();
    expect(deletes).toEqual(["ad_sets.delete", "ads.delete", "campaigns.delete"]);
    for (const id of deletes) {
      expect(ops[id]!.sideEffect, id).toBe("destructive");
      expect(ops[id]!.description).toContain("manage-your-ad-object-status");
    }
  });

  test("delete dispatch sends one DELETE and never observes", async () => {
    const { calls, impl } = graphFetch({ success: true });
    const result = defaultConnectorRegistry.executeAction("meta-ads", "campaigns.delete", {
      campaignId: "23851234567890123",
      accessToken: "token",
      fetch: impl,
    });
    expect(result.ok).toBe(true);
    await Promise.resolve((result as { output: unknown }).output);
    expect(calls.map((c) => c.method)).toEqual(["DELETE"]);
  });
});
