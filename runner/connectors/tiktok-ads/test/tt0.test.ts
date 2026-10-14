// TT-0: dead-op fixes, TCM -> TikTok One rewires, removed TCM ops, Events API 2.0,
// per-op requiredScopes and permission-error mapping. Fixture-only: every
// request goes to an injected fetch; nothing reaches TikTok.
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { wrapActions, requiredScopesFor, classifyTikTokResponse } from "../src/runtime.ts";
import { getCampaign } from "../src/actions.ts";
import { TT1_DESTRUCTIVE } from "./destructive-set.ts";

const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8")) as any;
const ops = manifest.operations as Record<string, any>;
const actions = wrapActions({ "campaigns.get": getCampaign as any });
const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), "utf8");
const CRED = "fixture-access-value";

type Call = { url: URL; method: string; headers: Headers; body: any };
async function run(op: string, input: Record<string, unknown>, fixtureName: string, status = 200) {
  const calls: Call[] = [];
  const fetch = async (u: RequestInfo | URL, init: RequestInit = {}) => {
    calls.push({ url: new URL(String(u)), method: String(init.method ?? "GET"), headers: new Headers(init.headers), body: init.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(fixture(fixtureName), { status, headers: { "content-type": "application/json" } });
  };
  const result = (await actions[op]!({ accessToken: CRED, ...input, fetch })) as any;
  return { result, calls };
}
async function failure(op: string, input: Record<string, unknown>, fixtureName: string, status = 200) {
  try {
    await run(op, input, fixtureName, status);
  } catch (error) {
    return error as any;
  }
  throw new Error(`${op} did not fail`);
}
const V13 = "/open_api/v1.3";

const getCases: Array<[string, Record<string, unknown>, string, string, Record<string, string>, Record<string, string>?]> = [
  ["custom_audiences.apply_log.get", { advertiserId: "adv-1", customAudienceIds: ["a1", "a2"], page: 1, pageSize: 10 }, "custom_audience_apply_log", "/dmp/custom_audience/apply/log/", { advertiser_id: "adv-1", custom_audience_ids: "[\"a1\",\"a2\"]", page: "1", page_size: "10" }],
  ["custom_audiences.share_log.get", { advertiserId: "adv-1", customAudienceId: "a1" }, "custom_audience_share_log", "/dmp/custom_audience/share/log/", { advertiser_id: "adv-1", custom_audience_id: "a1" }],
  ["catalogs.feeds.log.get", { bcId: "bc-1", catalogId: "cat-1", feedId: "feed-1" }, "catalog_feed_log", "/catalog/feed/log/", { bc_id: "bc-1", catalog_id: "cat-1", feed_id: "feed-1" }],
  ["catalogs.overview.get", { bcId: "bc-1", catalogId: "cat-1" }, "catalog_overview", "/catalog/overview/", { bc_id: "bc-1", catalog_id: "cat-1" }],
  ["catalogs.product_set_products.list", { bcId: "bc-1", catalogId: "cat-1", productSetId: "set-1", page: 2, pageSize: 20 }, "catalog_set_products", "/catalog/set/product/get/", { bc_id: "bc-1", catalog_id: "cat-1", product_set_id: "set-1", page: "2", page_size: "20" }],
  ["pixels.instant_page_events.get", { advertiserId: "adv-1", objectiveType: "CONVERSIONS", optimizationGoal: "CONVERT" }, "pixel_instant_page_events", "/pixel/instant_page/event/", { advertiser_id: "adv-1", objective_type: "CONVERSIONS", optimization_goal: "CONVERT" }],
  ["catalogs.list", { bcId: "bc-1", page: 1, pageSize: 10 }, "catalog_list", "/catalog/get/", { bc_id: "bc-1", page: "1", page_size: "10" }],
  ["catalogs.event_sources.get", { bcId: "bc-1", catalogId: "cat-1" }, "catalog_eventsource_bound", "/catalog/eventsource_bind/get/", { bc_id: "bc-1", catalog_id: "cat-1" }],
  ["catalogs.feeds.list", { bcId: "bc-1", catalogId: "cat-1" }, "catalog_feeds", "/catalog/feed/get/", { bc_id: "bc-1", catalog_id: "cat-1" }],
  ["catalogs.product_sets.list", { bcId: "bc-1", catalogId: "cat-1", returnProductCount: true }, "catalog_sets", "/catalog/set/get/", { bc_id: "bc-1", catalog_id: "cat-1", return_product_count: "true" }],
  ["catalogs.videos.list", { bcId: "bc-1", catalogId: "cat-1", page: 1, pageSize: 20 }, "catalog_videos", "/catalog/video/get/", { bc_id: "bc-1", catalog_id: "cat-1", page: "1", page_size: "20" }],
  ["tcm.reports.get", { ttoTcmAccountId: "tto-1", campaignId: "camp-1", countryCode: "US", startDate: "2025-09-25", endDate: "2025-09-27" }, "tto_campaign_report", "/tto/tcm/report/", { tto_tcm_account_id: "tto-1", campaign_id: "camp-1", start_date: "2025-09-25", end_date: "2025-09-27" }, { "Country-Code": "US" }],
  ["tcm.spark_ads.status.get", { tcmAccountId: "tto-1", videoId: "vid-1" }, "tcm_tt_video_status", "/tcm/tt_video/status/", { tcm_account_id: "tto-1", video_id: "vid-1" }],
  ["tcm.creators.authorized.list", { creatorId: "open-1", fields: ["display_name", "followers_count"] }, "tto_creator_insights", "/tto/creator/authorized/", { creator_id: "open-1", fields: "[\"display_name\",\"followers_count\"]" }],
  ["tcm.creators.authorized.videos.list", { creatorId: "open-1", limit: 10, cursor: 0 }, "tto_creator_media_insights", "/tto/creator/authorized/video/list/", { creator_id: "open-1", limit: "10", cursor: "0" }],
  ["tcm.creators.public.list", { ttoTcmAccountId: "tto-1", handleName: "demo.creator" }, "tto_public_account_insights", "/tto/tcm/creator/public/", { tto_tcm_account_id: "tto-1", handle_name: "demo.creator" }],
  ["tcm.creators.public.videos.list", { ttoTcmAccountId: "tto-1", handleName: "demo.creator", videoIds: ["v1"], limit: 25 }, "tto_public_media_insights", "/tto/tcm/creator/public/video/list/", { tto_tcm_account_id: "tto-1", handle_name: "demo.creator", video_ids: "[\"v1\"]", limit: "25" }],
];

const postCases: Array<[string, Record<string, unknown>, string, string, Record<string, unknown>]> = [
  ["custom_audiences.lookalike.create", { advertiser_id: "adv-1", custom_audience_name: "LAL", lookalike_spec: { source_audience_id: "a1", include_source: false, mobile_os: "ALL", placements: ["TIKTOK"], location_ids: ["6252001"], audience_size: "BALANCED" } }, "custom_audience_lookalike_create", "/dmp/custom_audience/lookalike/create/", { advertiser_id: "adv-1", custom_audience_name: "LAL", lookalike_spec: { source_audience_id: "a1", include_source: false, mobile_os: "ALL", placements: ["TIKTOK"], location_ids: ["6252001"], audience_size: "BALANCED" } }],
  ["custom_audiences.lookalike.update", { advertiser_id: "adv-1", custom_audience_ids: ["a1"] }, "custom_audience_lookalike_refresh", "/dmp/custom_audience/lookalike/update/", { advertiser_id: "adv-1", custom_audience_ids: ["a1"] }],
  ["catalogs.event_sources.bind", { advertiser_id: "adv-1", bc_id: "bc-1", catalog_id: "cat-1", pixel_code: "CABCDEFG" }, "catalog_eventsource_bind", "/catalog/eventsource/bind/", { advertiser_id: "adv-1", bc_id: "bc-1", catalog_id: "cat-1", pixel_code: "CABCDEFG" }],
  ["catalogs.event_sources.unbind", { advertiser_id: "adv-1", bc_id: "bc-1", catalog_id: "cat-1", app_id: "app-1" }, "catalog_eventsource_bind", "/catalog/eventsource/unbind/", { advertiser_id: "adv-1", bc_id: "bc-1", catalog_id: "cat-1", app_id: "app-1" }],
  ["catalogs.product_sets.update", { bc_id: "bc-1", catalog_id: "cat-1", product_set_id: "set-1", product_set_name: "Summer" }, "catalog_set_update", "/catalog/set/update/", { bc_id: "bc-1", catalog_id: "cat-1", product_set_id: "set-1", product_set_name: "Summer" }],
  ["catalogs.product_sets.delete", { bc_id: "bc-1", catalog_id: "cat-1", product_set_ids: ["set-1", "set-2"] }, "catalog_set_delete", "/catalog/set/delete/", { bc_id: "bc-1", catalog_id: "cat-1", product_set_ids: ["set-1", "set-2"] }],
  ["tcm.spark_ads.apply", { tcm_account_id: "tto-1", video_id: "vid-1", authorization_days: 30 }, "tcm_tt_video_apply", "/tcm/tt_video/apply/", { tcm_account_id: "tto-1", video_id: "vid-1", authorization_days: 30 }],
  ["pixels.batch", { pixel_code: "CABCDEFG", batch: [{ event: "ViewContent", event_time: 1760000000, page: { url: "https://shop.example/p/1" } }] }, "pixel_track", "/event/track/", { event_source: "web", event_source_id: "CABCDEFG", data: [{ event: "ViewContent", event_time: 1760000000, page: { url: "https://shop.example/p/1" } }] }],
];

describe("TT-0 fixed dead ops (live-shaped fixtures)", () => {
  for (const [op, input, fx, path, query, headers] of getCases) {
    it(`${op} -> GET ${path}`, async () => {
      const { result, calls } = await run(op, input, fx);
      expect(calls).toHaveLength(1);
      expect(calls[0]!.method).toBe("GET");
      expect(calls[0]!.url.pathname).toBe(V13 + path);
      expect(Object.fromEntries(calls[0]!.url.searchParams)).toEqual(query);
      expect(calls[0]!.headers.get("Access-Token")).toBe(CRED);
      for (const [name, value] of Object.entries(headers ?? {})) expect(calls[0]!.headers.get(name)).toBe(value);
      expect(result.source).toBe("provider");
      expect(result.data).toEqual(JSON.parse(fixture(fx)));
      expect(ops[op].request.path).toBe(path);
    });
  }
  for (const [op, input, fx, path, body] of postCases) {
    it(`${op} -> POST ${path}`, async () => {
      const { result, calls } = await run(op, input, fx);
      expect(calls).toHaveLength(1);
      expect(calls[0]!.method).toBe("POST");
      expect(calls[0]!.url.pathname).toBe(V13 + path);
      expect(calls[0]!.body).toEqual(body);
      expect(result.data.code).toBe(0);
      expect(ops[op].sideEffect).toBe(TT1_DESTRUCTIVE.has(op) ? "destructive" : "write");
    });
  }

  it("covers all 24 fixed dead ops plus the Events 2.0 rewire", () => {
    const covered = new Set([...getCases.map((c) => c[0]), ...postCases.map((c) => c[0])]);
    expect(covered.size).toBe(25);
  });

  it("drops deprecated and invented params from the fixed ops", () => {
    expect(ops["custom_audiences.lookalike.create"].inputSchema.properties.audience_sub_type).toBeUndefined();
    expect(ops["catalogs.feeds.list"].inputSchema.properties.page).toBeUndefined();
    expect(ops["catalogs.product_sets.list"].inputSchema.properties.page).toBeUndefined();
    expect(Object.keys(ops["pixels.track"].inputSchema.properties)).not.toContain("timestamp");
    expect(Object.keys(ops["pixels.track"].inputSchema.properties)).not.toContain("context");
  });
});

describe("TT-0 removed TCM ops", () => {
  // TikTok Creator Marketplace APIs stopped working on 2025-06-30 and these two
  // have no TikTok One successor
  // (https://business-api.tiktok.com/portal/docs/tiktok-one-api/v1.3), so they
  // are dropped from the manifest and the action map.
  it("drops tcm.videos.audit_status.get and .update outright", () => {
    expect(manifest.version).toBe("0.8.2");
    expect(Object.keys(ops)).toHaveLength(432);
    for (const op of ["tcm.videos.audit_status.get", "tcm.videos.audit_status.update"]) {
      expect(ops[op], op).toBeUndefined();
      expect(actions[op], op).toBeUndefined();
    }
  });
  it("leaves no request-less action behind", () => {
    for (const [key, op] of Object.entries(ops)) {
      if (op.kind === "action") expect(op.request, key).toBeDefined();
    }
  });
});

describe("TT-0 existing-op wire fix: catalogs.videos.get", () => {
  // Official v1.3 "Get catalog videos" (GET /catalog/video/get/) takes
  // `catalog_video_ids`, not `video_ids`.
  it("sends catalog_video_ids", async () => {
    const { result, calls } = await run("catalogs.videos.get", { bcId: "bc-1", catalogId: "cat-1", videoIds: ["1800000000000000001"], page: 1, pageSize: 20 }, "catalog_videos");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.url.pathname).toBe(V13 + "/catalog/video/get/");
    expect(Object.fromEntries(calls[0]!.url.searchParams)).toEqual({ bc_id: "bc-1", catalog_id: "cat-1", catalog_video_ids: "[\"1800000000000000001\"]", page: "1", page_size: "20" });
    expect(calls[0]!.url.searchParams.has("video_ids")).toBe(false);
    expect(result.data).toEqual(JSON.parse(fixture("catalog_videos")));
  });
});

describe("TT-0 permission errors", () => {
  const declarativeInput = { advertiserId: "adv-1", customAudienceIds: ["a1"] };
  it("maps code 40001 on a declarative op to CONNECTOR_CAPABILITY_MISSING", async () => {
    const error = await failure("custom_audiences.apply_log.get", declarativeInput, "tiktok_permission_error");
    expect(error).toMatchObject({
      ok: false,
      code: "CONNECTOR_CAPABILITY_MISSING",
      reason: "permission_missing",
      missingScopes: ["Audience Management"],
      requiredScopes: ["Audience Management"],
      reconsentRequired: true,
      providerCode: 40001,
    });
  });
  it("maps HTTP 403 on a declarative op to CONNECTOR_CAPABILITY_MISSING", async () => {
    const error = await failure("catalogs.overview.get", { bcId: "bc-1", catalogId: "cat-1" }, "tiktok_permission_error", 403);
    expect(error).toMatchObject({ code: "CONNECTOR_CAPABILITY_MISSING", reason: "permission_missing", requiredScopes: ["DPA Catalog Management"], reconsentRequired: true, status: 403 });
  });
  it("keeps code 40002 on a declarative op as CONNECTOR_UPSTREAM_ERROR", async () => {
    const error = await failure("custom_audiences.apply_log.get", declarativeInput, "tiktok_validation_error");
    expect(error).toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR", providerCode: 40002 });
    expect(error.reconsentRequired).toBeUndefined();
  });
  it("maps code 40100 to CONNECTOR_RATE_LIMITED", async () => {
    const error = await failure("custom_audiences.apply_log.get", declarativeInput, "tiktok_error");
    expect(error).toMatchObject({ code: "CONNECTOR_RATE_LIMITED", providerCode: 40100 });
  });
  it("maps code 40001 and HTTP 403 on a hand-written op to CONNECTOR_CAPABILITY_MISSING", async () => {
    const input = { advertiserId: "adv-1", campaignId: "c-1" };
    const byCode = await failure("campaigns.get", input, "tiktok_permission_error");
    expect(byCode).toMatchObject({ code: "CONNECTOR_CAPABILITY_MISSING", reason: "permission_missing", requiredScopes: ["Ads Management"], missingScopes: ["Ads Management"], reconsentRequired: true });
    const byStatus = await failure("campaigns.get", input, "tiktok_permission_error", 403);
    expect(byStatus).toMatchObject({ code: "CONNECTOR_CAPABILITY_MISSING", status: 403 });
  });
  it("keeps code 40002 on a hand-written op as CONNECTOR_UPSTREAM_ERROR", async () => {
    const error = await failure("campaigns.get", { advertiserId: "adv-1", campaignId: "c-1" }, "tiktok_validation_error");
    expect(error).toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
  it("leaves successful outputs and the credential-free echo path unchanged", async () => {
    const echo = (await actions["catalogs.overview.get"]!({ bcId: "bc-1", catalogId: "cat-1" })) as any;
    expect(echo.source).toBe("connector");
    expect(classifyTikTokResponse(200, { code: 0, data: {} })).toBe("none");
  });
});

describe("TT-0 scope model", () => {
  const firstLevel = new Set([
    "Ad Account Management", "Ads Management", "Audience Management", "Reporting", "Measurement",
    "Creative Management", "App Management", "Pixel Management", "DPA Catalog Management", "Reach & Frequency",
    "Lead Management", "TikTok Creator Marketplace (TCM)", "TikTok Creator", "Ad Comments",
    "TikTok business plugin", "Automated Rules", "TikTok Accounts", "Onsite Commerce Store",
    "Offline Events Management", "Ad Diagnosis", "CRM Event Management",
  ]);
  it("declares one real TikTok permission per op and none on the connect request", () => {
    expect(manifest.auth.scopes).toEqual([]);
    for (const [key, op] of Object.entries(ops)) {
      if (key === "healthcheck") {
        expect(op.requiredScopes).toBeUndefined();
        continue;
      }
      expect(Array.isArray(op.requiredScopes), key).toBe(true);
      expect(op.requiredScopes.length, key).toBe(1);
      expect(firstLevel.has(op.requiredScopes[0]), `${key}: ${op.requiredScopes[0]}`).toBe(true);
    }
    expect(requiredScopesFor("bc.transfer")).toEqual(["Ad Account Management"]);
    expect(requiredScopesFor("tcm.reports.get")).toEqual(["TikTok Creator Marketplace (TCM)"]);
    expect(requiredScopesFor("tcm.creators.authorized.list")).toEqual(["TikTok Creator"]);
  });
});

describe("TT-0 money-charging ops", () => {
  const charging = ["bc.transfer", "payment_portfolios.credit_line.update", "ad_groups.rf.create", "ad_groups.rf.update", "bc.advertisers.create", "campaigns.spark_ads.create"];
  it("state plainly that they charge money", () => {
    for (const op of charging) {
      expect(ops[op].description.startsWith("CHARGES MONEY:"), op).toBe(true);
      expect(ops[op].sideEffect, op).toBe("write");
    }
  });
  const sample = (schema: any): unknown => {
    if (Array.isArray(schema?.enum)) return schema.enum[0];
    switch (schema?.type) {
      case "integer": case "number": return schema.minimum ?? 1;
      case "boolean": return false;
      case "array": return Array.from({ length: Math.max(1, schema.minItems ?? 1) }, () => sample(schema.items ?? { type: "string" }));
      case "object": return Object.fromEntries((schema.required ?? []).map((k: string) => [k, sample(schema.properties?.[k])]));
      default: return "fixture-1";
    }
  };
  it("are exercised only against fixtures through an injected fetch", async () => {
    for (const op of charging) {
      const schema = ops[op].inputSchema;
      const input = Object.fromEntries((schema.required ?? []).map((k: string) => [k, sample(schema.properties[k])]));
      const { calls, result } = await run(op, input, "pixel_track");
      expect(calls, op).toHaveLength(1);
      expect(calls[0]!.url.hostname).toBe("business-api.tiktok.com");
      expect(calls[0]!.method, op).toBe("POST");
      expect(result.data.code, op).toBe(0);
    }
  });
});

describe("TT-0 input schemas", () => {
  it("use no unions", () => {
    const walk = (node: unknown, path: string): void => {
      if (!node || typeof node !== "object") return;
      for (const [key, value] of Object.entries(node)) {
        expect(["oneOf", "anyOf", "allOf", "not"].includes(key), `${path}.${key}`).toBe(false);
        if (key === "type") expect(Array.isArray(value), `${path}.type`).toBe(false);
        walk(value, `${path}.${key}`);
      }
    };
    for (const [key, op] of Object.entries(ops)) walk(op.inputSchema, key);
  });
});
