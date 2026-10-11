// TT-0: the default registry routes tiktok-ads through the runtime wrapper.
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { defaultConnectorRegistry } from "../../../bun/src/registry.ts";

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), "utf8");

async function outcome(op: string, input: Record<string, unknown>) {
  try {
    const dispatched = defaultConnectorRegistry.executeAction("tiktok-ads", op, input) as any;
    if (!dispatched.ok) return { ok: false, error: dispatched };
    return { ok: true, value: await dispatched.output } as any;
  } catch (error) {
    return { ok: false, error } as any;
  }
}

describe("tiktok-ads in the default registry", () => {
  it("maps a 40001 envelope to CONNECTOR_CAPABILITY_MISSING", async () => {
    const result = await outcome("catalogs.overview.get", {
      accessToken: "fixture-access-value",
      bcId: "bc-1",
      catalogId: "cat-1",
      fetch: async () => new Response(fixture("tiktok_permission_error"), { status: 200 }),
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatchObject({ code: "CONNECTOR_CAPABILITY_MISSING", reason: "permission_missing", requiredScopes: ["DPA Catalog Management"], reconsentRequired: true });
    expect(result.error.message).toContain("requires: DPA Catalog Management");
  });

  it("no longer serves the TCM ops TikTok removed on 2025-06-30", async () => {
    let called = false;
    const result = await outcome("tcm.videos.audit_status.get", {
      accessToken: "fixture-access-value",
      advertiserId: "adv-1",
      itemIds: ["item-1"],
      fetch: async () => { called = true; return new Response("{}"); },
    });
    expect(called).toBe(false);
    expect(result).toMatchObject({ ok: false, error: { code: "ACTION_NOT_DECLARED" } });
  });

  it("returns successful compiled results unchanged", async () => {
    const result = await outcome("catalogs.overview.get", {
      accessToken: "fixture-access-value",
      bcId: "bc-1",
      catalogId: "cat-1",
      fetch: async () => new Response(fixture("catalog_overview"), { status: 200 }),
    });
    expect(result.ok).toBe(true);
    expect(result.value).toMatchObject({ connector: "tiktok-ads", action: "catalogs.overview.get", source: "provider", data: JSON.parse(fixture("catalog_overview")) });
  });
});
