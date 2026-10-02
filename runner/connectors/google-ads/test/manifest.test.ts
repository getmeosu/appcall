import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

describe("google-ads connector manifest", () => {
  test("manifest declares key, runtime, auth, and version 0.2.0", () => {
    expect(manifest.key).toBe("google-ads");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.auth.type).toBe("oauth2");
    expect(manifest.auth.scopes).toContain("https://www.googleapis.com/auth/adwords");
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
      "ad_groups.mutate",
      "ads.mutate",
      "keywords.mutate",
      "budgets.mutate",
      "gaql.search",
      "gaql.searchStream",
      "customer_lists.create",
      "customer_lists.mutateMembers",
      "conversion_actions.mutate",
      "labels.mutate",
      "reports.get",
    ];
    for (const op of actions) {
      expect(manifest.operations[op as keyof typeof manifest.operations].kind).toBe("action");
    }
  });

  test("manifest expands beyond the thin 4-op stub", () => {
    expect(Object.keys(manifest.operations).length).toBeGreaterThanOrEqual(20);
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
