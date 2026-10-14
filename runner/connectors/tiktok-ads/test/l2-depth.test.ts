// L2-27: the documented single-route rows from the Composio missing_http
// backlog, plus the evidence-backed dispositions for the selector rows.
// Fixture-only: every request goes to an injected fetch; nothing reaches TikTok.
import { describe, expect, it } from "bun:test";
import { loadFixtureCases, runCandidateFixtures } from "../../../../scripts/connector-gen/openconnector/recipe-fixtures";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import { defaultConnectorRegistry } from "../../../bun/src/registry";
import coverage from "../../tiktok-ads.coverage.json";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, any>;
const { actions } = compileDeclarativeConnector(manifest as never);

// [Composio tool slug, AppCall operation, documented method, documented route]
const batch: Array<[string, string, string, string]> = [
  ["TIKTOK_ADS_CHECK_PAGE_LEAD_TASK", "leads.download_task.check", "POST", "/page/lead/task/"],
  ["TIKTOK_ADS_CREATE_CATALOG_PRODUCT_SET", "catalogs.product_sets.upload", "POST", "/catalog/set/upload/"],
  ["TIKTOK_ADS_CREATE_GMV_MAX_CUSTOMIZED_POSTS", "gmv_max.customized_posts.create", "POST", "/gmv_max/creation/custom_anchor_video_list/create/"],
  ["TIKTOK_ADS_DELETE_GMV_MAX_CUSTOMIZED_POSTS", "gmv_max.customized_posts.delete", "POST", "/gmv_max/creation/custom_anchor_video_list/delete/"],
  ["TIKTOK_ADS_GET_ADVERTISER_ACCOUNTS", "advertisers.list", "GET", "/oauth2/advertiser/get/ or /advertiser/info/"],
  ["TIKTOK_ADS_GET_GMV_MAX_VIDEO_PRODUCT_LINKS", "gmv_max.video_anchors.get", "POST", "/gmv_max/creation/shop_video/video_anchors/"],
  ["TIKTOK_ADS_LIST_GMV_MAX_CUSTOMIZED_POSTS", "gmv_max.customized_posts.list", "POST", "/gmv_max/creation/custom_anchor_video_list/get/"],
  ["TIKTOK_ADS_SEARCH_TARGETING", "targeting.interests.search", "GET", "/targeting/search/"],
  ["TIKTOK_ADS_SUBMIT_CREATIVE_SMART_TEXT", "creatives.smart_text.feedback", "POST", "/creative/smart_text/feedback/"],
];

// Selector/composite rows whose tool behavior spans more than one documented
// route (or an ordered multi-step workflow) and therefore cannot be one
// declarative request. The underlying routes are already exposed as their own
// operations, so the row is a client-side projection, not a missing route.
const reclassified: Array<[string, string[]]> = [
  ["TIKTOK_ADS_DELETE_SMART_PLUS_RESOURCES", ["https://business-api.tiktok.com/portal/docs?id=1843312888885314", "https://docs.composio.dev/toolkits/tiktok_ads.md"]],
  ["TIKTOK_ADS_GET_CREATIVE_ASSETS", ["https://business-api.tiktok.com/portal/docs?id=1740050161973250", "https://docs.composio.dev/toolkits/tiktok_ads.md"]],
  ["TIKTOK_ADS_GET_SMART_PLUS_MATERIAL_REPORT", ["https://business-api.tiktok.com/portal/docs?id=1843317489576961", "https://docs.composio.dev/toolkits/tiktok_ads.md"]],
  ["TIKTOK_ADS_GET_SMART_PLUS_REVIEW_INFO", ["https://business-api.tiktok.com/portal/docs?id=1843317465695233", "https://docs.composio.dev/toolkits/tiktok_ads.md"]],
  ["TIKTOK_ADS_SET_SMART_PLUS_DELIVERY_STATUS", ["https://business-api.tiktok.com/portal/docs?id=1843312888885314", "https://docs.composio.dev/toolkits/tiktok_ads.md"]],
  ["TIKTOK_ADS_UPLOAD_FILE_CHUNKED", ["https://business-api.tiktok.com/portal/docs?id=1737721229896705", "https://docs.composio.dev/toolkits/tiktok_ads.md"]],
];

describe("tiktok-ads L2 depth batch", () => {
  it("accounts for all 403 tools exactly once with no missing_http", () => {
    const tools = [...coverage.mapped, ...coverage.missing_http, ...coverage.missing_still].map((row) => row.tool);
    expect(coverage.composio_tools).toBe(403);
    expect(coverage.full_depth).toBe(true);
    expect(coverage.missing_http).toEqual([]);
    expect(tools).toHaveLength(403);
    expect(new Set(tools).size).toBe(403);
  });

  it("maps the batch tools to the documented operations", () => {
    const mapped = new Map(coverage.mapped.map((row) => [row.tool, row.operation]));
    for (const [tool, operation, method, path] of batch) {
      expect(mapped.get(tool), tool).toBe(operation);
      const definition = operations[operation];
      expect(definition, operation).toBeDefined();
      expect(definition.kind).toBe("action");
      expect(definition.request.method, operation).toBe(method);
      if (method !== "GET") expect(definition.request.path, operation).toBe(path);
      expect(typeof actions[operation], operation).toBe("function");
      expect(definition.inputSchema.additionalProperties).toBe(false);
    }
    expect(operations["targeting.interests.search"].request.path).toBe("/targeting/search/");
    expect(operations["leads.download_task.check"].request.path).toBe("/page/lead/task/");
  });

  it("pins the documented routes and scopes of the new operations", () => {
    const routes: Record<string, [string, string, string[]]> = {
      "leads.download_task.check": ["POST", "/page/lead/task/", ["Lead Management"]],
      "catalogs.product_sets.upload": ["POST", "/catalog/set/upload/", ["DPA Catalog Management"]],
      "gmv_max.customized_posts.create": ["POST", "/gmv_max/creation/custom_anchor_video_list/create/", ["Ads Management"]],
      "gmv_max.customized_posts.list": ["POST", "/gmv_max/creation/custom_anchor_video_list/get/", ["Ads Management"]],
      "gmv_max.customized_posts.delete": ["POST", "/gmv_max/creation/custom_anchor_video_list/delete/", ["Ads Management"]],
      "gmv_max.video_anchors.get": ["POST", "/gmv_max/creation/shop_video/video_anchors/", ["Ads Management"]],
      "targeting.interests.search": ["GET", "/targeting/search/", ["Ads Management"]],
      "creatives.smart_text.feedback": ["POST", "/creative/smart_text/feedback/", ["Creative Management"]],
    };
    for (const [key, [method, path, scopes]] of Object.entries(routes)) {
      expect(operations[key].request.method, key).toBe(method);
      expect(operations[key].request.path, key).toBe(path);
      expect(operations[key].request.successStatuses, key).toEqual([200]);
      expect(operations[key].requiredScopes, key).toEqual(scopes);
    }
  });

  it("replays the batch fixtures through the compiled actions", async () => {
    const cases = loadFixtureCases(new URL("../fixtures/cases", import.meta.url).pathname);
    const runs = await runCandidateFixtures(JSON.stringify(manifest), cases);
    // advertisers.list is the pre-existing handwritten op covered by tt0.test.ts;
    // the eight new declarative ops each carry a fixture triple.
    expect(runs).toHaveLength(batch.length - 1);
    for (const run of runs) {
      if (run.status !== "passed") throw new Error(`${run.caseId}: ${run.error}`);
    }
    const positive = new Set(cases.filter((entry) => entry.expected.kind === "success").map((entry) => entry.operation));
    for (const [, operation] of batch) {
      if (operation === "advertisers.list") continue;
      expect(positive.has(operation), operation).toBe(true);
    }
  });

  it("records the selector rows as evidence-backed client-side projections", () => {
    const still = new Map(coverage.missing_still.map((row) => [row.tool, row.why]));
    for (const [tool, evidence] of reclassified) {
      const why = still.get(tool);
      expect(why, tool).toBeDefined();
      expect(why, tool).toContain("reason=client_only_projection");
      for (const url of evidence) expect(why, tool).toContain(url);
      expect(why, tool).toContain("fetched=2026-10-14");
    }
    for (const [tool] of reclassified) {
      expect(coverage.missing_http.some((row) => row.tool === tool), tool).toBe(false);
    }
  });

  it("drops the optional x-lead-region header and unresolved body fields", async () => {
    let sent: RequestInit | undefined;
    await actions["leads.download_task.check"]({
      accessToken: "fixture-access-token",
      task_id: "task-1",
      fetch: async (_input: RequestInfo | URL, init: RequestInit = {}) => {
        sent = init;
        return new Response(JSON.stringify({ code: 0, message: "OK", data: { status: "RUNNING", task_id: "task-1" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    expect(new Headers(sent?.headers).get("x-lead-region")).toBeNull();
    expect(JSON.parse(String(sent?.body))).toEqual({ task_id: "task-1" });
  });

  it("posts the catalog product-set CSV as multipart form data through the default registry", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const result = defaultConnectorRegistry.executeAction("tiktok-ads", "catalogs.product_sets.upload", {
      accessToken: "fixture-access-token",
      bc_id: "bc-1",
      catalog_id: "cat-1",
      product_set_name: "Summer Set",
      file_signature: "d41d8cd98f00b204e9800998ecf8427e",
      fileBase64: Buffer.from("product_set_id,condition\nset-1,ALL").toString("base64"),
      fileName: "summer-set.csv",
      fetch: async (input: RequestInfo | URL, init: RequestInit = {}) => {
        calls.push({ url: String(input), init });
        return new Response(JSON.stringify({ code: 0, message: "OK", request_id: "r", data: { product_set_id: "set-1" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const output = await result.output;
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/open_api/v1.3/catalog/set/upload/");
    expect(calls[0]!.init.method).toBe("POST");
    expect(new Headers(calls[0]!.init.headers).get("Access-Token")).toBe("fixture-access-token");
    expect(new Headers(calls[0]!.init.headers).get("Content-Type")).toBeNull();
    const form = calls[0]!.init.body;
    expect(form).toBeInstanceOf(FormData);
    if (!(form instanceof FormData)) return;
    expect(form.get("bc_id")).toBe("bc-1");
    expect(form.get("catalog_id")).toBe("cat-1");
    expect(form.get("product_set_name")).toBe("Summer Set");
    expect(form.get("file_signature")).toBe("d41d8cd98f00b204e9800998ecf8427e");
    expect(form.has("accessToken")).toBe(false);
    expect(form.has("fileBase64")).toBe(false);
    expect(form.has("fileName")).toBe(false);
    const file = form.get("file");
    expect(file).toBeInstanceOf(File);
    if (!(file instanceof File)) return;
    expect(file.name).toBe("summer-set.csv");
    expect(Buffer.from(await file.arrayBuffer()).toString("utf8")).toBe("product_set_id,condition\nset-1,ALL");
    expect(output).toMatchObject({
      connector: "tiktok-ads",
      action: "catalogs.product_sets.upload",
      source: "connector",
      data: { product_set_id: "set-1" },
    });
  });

  it("maps TikTok catalog permission failures with the operation's required scopes", async () => {
    let dispatches = 0;
    const result = defaultConnectorRegistry.executeAction("tiktok-ads", "catalogs.product_sets.upload", {
      accessToken: "fixture-access-token",
      bc_id: "bc-1",
      catalog_id: "cat-1",
      product_set_name: "Summer Set",
      file_signature: "d41d8cd98f00b204e9800998ecf8427e",
      fetch: async () => {
        dispatches += 1;
        return Response.json({ code: 40001, message: "Permission denied" }, { status: 200 });
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    await expect(result.output).rejects.toMatchObject({
      code: "CONNECTOR_CAPABILITY_MISSING",
      reason: "permission_missing",
      missingScopes: ["DPA Catalog Management"],
      requiredScopes: ["DPA Catalog Management"],
      reconsentRequired: true,
    });
    expect(dispatches).toBe(1);
  });

  it("rejects missing upload credentials before dispatch through the default registry", async () => {
    let dispatches = 0;
    const result = defaultConnectorRegistry.executeAction("tiktok-ads", "catalogs.product_sets.upload", {
      bc_id: "bc-1",
      catalog_id: "cat-1",
      product_set_name: "Summer Set",
      file_signature: "d41d8cd98f00b204e9800998ecf8427e",
      fetch: async () => {
        dispatches += 1;
        return Response.json({ code: 0, data: { product_set_id: "set-1" } });
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    await expect(result.output).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
      message: "accessToken is required",
    });
    expect(dispatches).toBe(0);
  });

  it("rejects invalid upload input before dispatch through the default registry", () => {
    let dispatches = 0;
    const result = defaultConnectorRegistry.executeAction("tiktok-ads", "catalogs.product_sets.upload", {
      accessToken: "fixture-access-token",
      bc_id: "bc-1",
      catalog_id: "cat-1",
      product_set_name: "Summer Set",
      file_signature: "d41d8cd98f00b204e9800998ecf8427e",
      unexpected: true,
      fetch: async () => {
        dispatches += 1;
        return Response.json({ code: 0, data: { product_set_id: "set-1" } });
      },
    });

    expect(result).toMatchObject({
      ok: false,
      code: "INVALID_ACTION_INPUT",
      message: "tiktok-ads.catalogs.product_sets.upload: Unsupported input field: unexpected",
    });
    expect(dispatches).toBe(0);
  });
});
