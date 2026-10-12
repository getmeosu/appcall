import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

describe("linkedin-ads manifest", () => {
  it("has correct key and version", () => {
    expect(manifest.key).toBe("linkedin-ads");
    expect(manifest.version).toBe("0.7.1");
    expect(manifest.runtime).toBe("bun");
  });

  it("uses oauth2 auth with a read-only default connect set (LI-SCOPES)", () => {
    expect(manifest.auth.type).toBe("oauth2");
    expect(manifest.auth.setup.mode).toBe("oauth2");
    expect(manifest.auth.scopes).toEqual(["r_ads", "r_ads_reporting", "r_organization_admin", "r_organization_social"]);
    expect(manifest.auth.scopes).not.toContain("rw_ads");
    expect(manifest.auth.scopes).not.toContain("rw_organization_admin");
  });

  it("allows linkedin api host", () => {
    expect(manifest.network.allowedHosts).toContain("api.linkedin.com");
    expect(manifest.network.allowedHosts).toHaveLength(1);
  });

  it("has all expected operations", () => {
    const ops = Object.keys(manifest.operations);
    expect(ops).toContain("campaigns.list");
    expect(ops).toContain("ad_accounts.list");
    expect(ops).toContain("creative_assets.list");
    expect(ops).toContain("campaigns.get");
    expect(ops).toContain("ad_accounts.get");
    expect(ops).toContain("campaign_groups.list");
    expect(ops).toContain("creatives.list");
    expect(ops).toContain("analytics.report.get");
    expect(ops).toContain("healthcheck");
    expect(ops).toContain("campaign_groups.get");
    expect(ops).toContain("audience_counts.get");
    expect(ops).toContain("targeting.facets.list");
    expect(ops).toContain("targeting.entities.list");
    expect(ops).toContain("supply_forecasts.get");
    expect(ops).toContain("lead_forms.list");
    expect(ops).toContain("lead_forms.get");
    expect(ops).toContain("ad_accounts.create");
    expect(ops).toContain("lead_forms.create");
    expect(ops).toContain("organizations.network_size.get");
    expect(ops).toContain("organizations.acls.list");
    expect(ops).toContain("organizations.page_statistics.get");
    expect(ops).toContain("organizations.follower_statistics.get");
    expect(ops).toContain("organizations.share_statistics.get");
    expect(ops).toContain("conversion_rules.list");
    expect(ops).toContain("dmp_segments.list");
    expect(ops).toContain("organizations.list");
    expect(ops).toContain("posts.list");
    expect(ops).toContain("organizations.lookup");
    expect(ops).toContain("uploads.register");
    expect(ops).toContain("events.search");
    expect(ops).toContain("lead_forms.update");
    expect(ops).toContain("organizations.acls.update");
    for (const key of [
      "ad_accounts.search", "campaigns.search", "ad_account_users.list_mine", "ad_account_users.list", "creatives.get",
      "budget_pricing.get", "campaign_groups.create", "campaigns.create", "creatives.create", "campaign_groups.update",
      "campaigns.update", "creatives.update", "campaign_groups.delete", "campaigns.delete", "creatives.delete",
    ]) expect(ops, key).toContain(key);
    expect(ops).toHaveLength(47);
  });

  it("sync operations have correct shape and a real request", () => {
    for (const key of ["campaigns.list", "ad_accounts.list", "creative_assets.list"] as const) {
      const op = manifest.operations[key];
      expect(op.kind).toBe("sync");
      expect(op.timeoutMs).toBe(30000);
      expect(op.maxInputBytes).toBe(65536);
      expect(op.maxResponseBytes).toBeGreaterThanOrEqual(op.maxInputBytes);
      expect(op.request.method).toBe("GET");
      expect(op.request.path.startsWith("/rest/")).toBe(true);
      expect(op.request.body).toBeUndefined();
    }
  });

  it("gives every operation a request method and path", () => {
    for (const [key, op] of Object.entries(manifest.operations)) {
      expect(op.request?.method, key).toEqual(expect.any(String));
      expect(op.request?.path, key).toEqual(expect.any(String));
      expect(op.maxResponseBytes).toBeGreaterThanOrEqual(op.maxInputBytes);
      expect(op.title?.length ?? 0, key).toBeGreaterThan(0);
      expect(op.inputSchema?.type, key).toBe("object");
      const method = op.request.method;
      if (method === "GET") {
        expect(op.request.body, key).toBeUndefined();
        expect(op.request.headers?.["Content-Type"], key).toBeUndefined();
        expect(op.sideEffect, key).toBe("read");
      } else if (method === "DELETE") {
        // G1 deletes remove or retire a resource: destructive, never a read or a plain write.
        expect(op.request.body, key).toBeUndefined();
        expect(op.request.headers?.["Content-Type"], key).toBeUndefined();
        expect(op.sideEffect, key).toBe("destructive");
      } else {
        expect(op.request.headers?.["Content-Type"], key).toBe("application/json");
        expect(op.sideEffect, key).toBe("write");
      }
    }
  });

  it("new P0 ops are actions with schemas", () => {
    for (const key of [
      "campaigns.get",
      "ad_accounts.get",
      "campaign_groups.list",
      "creatives.list",
      "analytics.report.get",
    ] as const) {
      const op = manifest.operations[key];
      expect(op.kind).toBe("action");
      expect(op.inputSchema).toBeDefined();
      expect(op.outputSchema).toBeDefined();
    }
  });

  it("deeper parity actions are actionable and validated", () => {
    for (const key of [
      "campaign_groups.get",
      "audience_counts.get",
      "targeting.facets.list",
      "targeting.entities.list",
      "supply_forecasts.get",
      "lead_forms.list",
      "lead_forms.get",
      "ad_accounts.create",
      "lead_forms.create",
      "organizations.network_size.get",
      "organizations.acls.list",
      "organizations.page_statistics.get",
      "organizations.follower_statistics.get",
      "organizations.share_statistics.get",
      "conversion_rules.list",
      "dmp_segments.list",
      "organizations.list",
      "posts.list",
      "organizations.lookup",
      "uploads.register",
      "events.search",
      "lead_forms.update",
      "organizations.acls.update",
    ] as const) {
      expect(manifest.operations[key].kind).toBe("action");
      expect(manifest.operations[key].inputSchema.type).toBe("object");
      expect(manifest.operations[key].title.length).toBeGreaterThan(0);
      expect(manifest.operations[key].description.length).toBeGreaterThan(0);
    }
  });

  it("healthcheck is an action with short timeout", () => {
    const hc = manifest.operations["healthcheck"];
    expect(hc.kind).toBe("action");
    expect(hc.timeoutMs).toBe(5000);
    expect(hc.maxInputBytes).toBe(4096);
    expect(hc.maxResponseBytes).toBe(65536);
  });

  it("has correct models", () => {
    expect(manifest.models).toEqual([
      "campaign",
      "ad_account",
      "creative_asset",
      "campaign_group",
      "creative",
      "analytics_result",
      "lead_form",
      "organization",
    ]);
  });
});
