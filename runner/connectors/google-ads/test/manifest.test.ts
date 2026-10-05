import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

describe("google-ads connector manifest", () => {
  test("manifest declares key, runtime, auth, and version 0.4.1", () => {
    expect(manifest.key).toBe("google-ads");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.version).toBe("0.4.1");
    expect(manifest.auth.type).toBe("oauth2");
    expect(manifest.auth.scopes).toContain("https://www.googleapis.com/auth/adwords");
    const fields = manifest.auth.setup.fields as Array<{ key: string; required: boolean }>;
    const developerToken = fields.find((f) => f.key === "developerToken");
    expect(developerToken).toBeDefined();
    expect(developerToken!.required).toBe(false);
  });

  test("manifest declares network controls", () => {
    expect(manifest.network.allowedHosts).toContain("googleads.googleapis.com");
    expect(manifest.network.allowedHosts).toHaveLength(1);
  });

  test("manifest declares core sync operations", () => {
    expect(manifest.operations["campaigns.list"].kind).toBe("sync");
    expect(manifest.operations["ad_groups.list"].kind).toBe("sync");
    expect(manifest.operations["ads.list"].kind).toBe("sync");
    expect(manifest.operations["keywords.list"].kind).toBe("sync");
    expect(manifest.operations["budgets.list"].kind).toBe("sync");
    expect(manifest.operations["customer_lists.list"].kind).toBe("sync");
    expect(manifest.operations["conversion_actions.list"].kind).toBe("sync");
  });

  test("manifest declares curated action operations", () => {
    const actions = [
      "healthcheck",
      "customers.listAccessible",
      "customers.listSubAccounts",
      "campaigns.get",
      "campaigns.getByName",
      "campaigns.mutate",
      "ad_groups.get",
      "ad_groups.mutate",
      "ads.get",
      "ads.mutate",
      "keywords.get",
      "keywords.mutate",
      "budgets.get",
      "budgets.mutate",
      "gaql.search",
      "gaql.searchStream",
      "customer_lists.create",
      "customer_lists.mutateMembers",
      "conversion_actions.get",
      "conversion_actions.mutate",
      "labels.mutate",
      "reports.get",
      "assets.get",
      "assets.list",
      "assets.mutate",
      "assets.callout.create",
      "campaign_assets.get",
      "campaign_assets.mutate",
      "ad_group_assets.get",
      "ad_group_assets.mutate",
      "customer_assets.get",
      "customer_assets.mutate",
      "labels.get",
      "bidding_strategies.get",
      "bidding_strategies.mutate",
      "portfolio_bidding_strategies.mutate",
      "conversion_actions.tag_snippets.get",
    ];
    for (const op of actions) {
      expect(manifest.operations[op as keyof typeof manifest.operations].kind).toBe("action");
    }
  });

  test("ADS-EFFECT-1: no mutate / mixed-batch op carries effect keys", () => {
    // Google Ads *:mutate calls can mix create, update and remove in one
    // operations array, so they must omit effectPolicy, reconcile and observe.
    const mixed = Object.entries(manifest.operations).filter(([id, spec]) => {
      const s = spec as { inputSchema?: { properties?: Record<string, { type?: unknown }> } };
      const ops = s.inputSchema?.properties?.operations;
      return /mutate/i.test(id) || (ops !== undefined && (ops.type === "array" || (Array.isArray(ops.type) && ops.type.includes("array"))));
    });
    const ids = mixed.map(([id]) => id).sort();
    for (const id of [
      "campaigns.mutate",
      "ad_groups.mutate",
      "ads.mutate",
      "keywords.mutate",
      "budgets.mutate",
      "conversion_actions.mutate",
      "labels.mutate",
      "customer_lists.mutateMembers",
    ]) {
      expect(ids).toContain(id);
    }
    for (const [id, spec] of mixed) {
      const op = spec as Record<string, unknown>;
      expect({ id, sideEffect: op.sideEffect }).toEqual({ id, sideEffect: "write" });
      expect({ id, effectPolicy: op.effectPolicy, reconcile: op.reconcile, observe: op.observe }).toEqual({
        id,
        effectPolicy: undefined,
        reconcile: undefined,
        observe: undefined,
      });
    }
  });

  test("former Reconcile companion gets remain read actions", () => {
    for (const get of [
      "campaigns.get",
      "ad_groups.get",
      "ads.get",
      "keywords.get",
      "budgets.get",
      "conversion_actions.get",
    ]) {
      const op = manifest.operations[get as keyof typeof manifest.operations] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("read");
    }
  });

  test("skips Reconcile on customer_lists.mutateMembers and defers labels", () => {
    const members = manifest.operations["customer_lists.mutateMembers"] as Record<string, unknown>;
    expect(members.sideEffect).toBe("write");
    expect(members.effectPolicy).toBeUndefined();
    expect(members.reconcile).toBeUndefined();

    const labels = manifest.operations["labels.mutate"] as Record<string, unknown>;
    expect(labels.sideEffect).toBe("write");
    expect(labels.effectPolicy).toBeUndefined();
    expect(labels.reconcile).toBeUndefined();
  });

  test("G1 mutates and callout.create omit all three effect keys", () => {
    const omit = [
      "assets.mutate",
      "campaign_assets.mutate",
      "ad_group_assets.mutate",
      "customer_assets.mutate",
      "bidding_strategies.mutate",
      "portfolio_bidding_strategies.mutate",
      "assets.callout.create",
    ];
    for (const id of omit) {
      const op = manifest.operations[id as keyof typeof manifest.operations] as Record<string, unknown>;
      expect(op.sideEffect).toBe("write");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.observe).toBeUndefined();
    }
  });

  test("assets.list is an action (GAQL + pageToken), not a sync", () => {
    const op = manifest.operations["assets.list"] as Record<string, unknown>;
    expect(op.kind).toBe("action");
    expect(op.sideEffect).toBe("read");
    const schema = op.inputSchema as { properties: Record<string, unknown>; required: string[] };
    expect(schema.properties.pageToken).toBeDefined();
    expect(schema.required).toContain("customerId");
  });

  test("manifest expands beyond the thin 4-op stub", () => {
    expect(Object.keys(manifest.operations).length).toBeGreaterThanOrEqual(20);
  });

  test("manifest stays at 44 ops on v0.4.1", () => {
    expect(Object.keys(manifest.operations).length).toBe(44);
  });

  test("manifest declares models", () => {
    expect(manifest.models).toContain("campaign");
    expect(manifest.models).toContain("ad_group");
    expect(manifest.models).toContain("ad");
    expect(manifest.models).toContain("keyword");
    expect(manifest.models).toContain("budget");
    expect(manifest.models).toContain("customer");
    expect(manifest.models).toContain("user_list");
    expect(manifest.models).toContain("conversion_action");
    expect(manifest.models).toContain("label");
    expect(manifest.models).toContain("asset");
    expect(manifest.models).toContain("campaign_asset");
    expect(manifest.models).toContain("ad_group_asset");
    expect(manifest.models).toContain("customer_asset");
    expect(manifest.models).toContain("bidding_strategy");
  });

  test("manifest has timeout and size limits on all operations", () => {
    for (const [op, spec] of Object.entries(manifest.operations)) {
      const s = spec as Record<string, unknown>;
      expect(typeof s.timeoutMs).toBe("number");
      expect((s.timeoutMs as number) > 0).toBe(true);
      expect(typeof s.maxInputBytes).toBe("number");
      expect(typeof s.maxResponseBytes).toBe("number");
    }
  });

  test("action operations declare inputSchema and outputSchema", () => {
    for (const [op, spec] of Object.entries(manifest.operations)) {
      const s = spec as Record<string, unknown>;
      if (s.kind !== "action") continue;
      expect(s.inputSchema).toBeDefined();
      expect(s.outputSchema).toBeDefined();
    }
  });
});
