import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8")) as any;
const bunSrc = process.env.APPCALL_BUN_SRC_ROOT ?? "../../../bun/src";
const { compileDeclarativeConnector } = await import(`${bunSrc}/declarative/compile.ts`);
const { wrapTikTokApiEnvelope } = await import("../src/declarative.ts");

const catalogAudienceOperations = [
  "catalogs.list", "catalogs.get", "catalogs.create", "catalogs.update", "catalogs.delete",
    "catalogs.available_countries.list", "catalogs.overview.get",
  "catalogs.lexicon.get", "catalogs.event_sources.get", "catalogs.event_sources.bind",
  "catalogs.event_sources.unbind", "catalogs.feeds.list", "catalogs.feeds.create",
  "catalogs.feeds.update", "catalogs.feeds.delete", "catalogs.feeds.log.get",
  "catalogs.products.delete", "catalogs.product_sets.list",
  "catalogs.product_sets.update", "catalogs.product_sets.delete", "catalogs.product_set_products.list",
  "catalogs.videos.list", "catalogs.videos.delete",
  "custom_audiences.get", "custom_audiences.update", "custom_audiences.delete",
  "custom_audiences.apply", "custom_audiences.apply_log.get", "custom_audiences.share",
  "custom_audiences.share.cancel", "custom_audiences.share_log.get",
  "custom_audiences.lookalike.create", "custom_audiences.lookalike.update",
  "custom_audiences.rule.create", "saved_audiences.list", "saved_audiences.create",
  "saved_audiences.delete",
];

const campaignReportPixelOperations = [
  "ad_groups.quota.get", "ad_groups.review.get", "ads.review.get", "ad_groups.diagnoses.get",
  "ad_groups.budget.update", "ad_groups.appeal", "ads.audience_size.estimate",
  "campaigns.copy_task.create", "campaigns.copy_task.get", "campaigns.quota.get",
  "ads.aco.create", "ads.aco.get", "ads.aco.update", "ads.aco.material_status.update",
  "reports.task.create", "reports.task.check", "reports.task.cancel", "reports.task.download",
  "audience.insights.overlap.get", "custom_audiences.create",
  "catalogs.location_currency.get", "catalogs.migrate", "catalogs.products.get",
  "catalogs.products.upload", "catalogs.products.update", "catalogs.products.upload_by_url",
  "catalogs.products.log.get", "catalogs.product_sets.create",
  "catalogs.feeds.schedule_status.update", "catalogs.videos.upload_by_url",
  "pixels.create", "pixels.update", "pixels.events.create", "pixels.events.update",
  "pixels.events.delete", "pixels.event_stats.get", "pixels.instant_page_events.get",
  "pixels.bc_links.list", "pixels.bc_links.update", "pixels.transfer",
];

const waveOperations = [
  "bc.list",
  "bc.assets.list",
  "bc.assets.admin.list",
  "bc.assets.assign",
  "bc.assets.unassign",
  "bc.assets.admin.delete",
  "bc.asset_members.list",
  "bc.asset_partners.list",
  "bc.asset_groups.list",
  "bc.asset_groups.get",
  "bc.asset_groups.create",
  "bc.asset_groups.update",
  "bc.asset_groups.delete",
  "bc.members.list",
  "bc.members.invite",
  "bc.members.update",
  "bc.members.delete",
  "bc.partners.list",
  "bc.partners.add",
  "bc.partners.delete",
  "bc.partner_assets.list",
  "bc.partner_assets.delete",
  "bc.balance.get",
  "bc.transactions.list",
  "bc.account_transactions.list",
  "bc.billing_groups.list",
  "bc.billing_groups.create",
  "bc.billing_groups.update",
  "bc.invoices.unpaid.get",
  "bc.transfer",
  "bc.advertisers.create",
  "advertisers.balance.get",
  "advertisers.transactions.list",
  "advertisers.update",
  "campaigns.smart_plus.list",
  "campaigns.smart_plus.create",
  "campaigns.smart_plus.update",
  "campaigns.smart_plus.status.update",
  "ad_groups.smart_plus.list",
  "ad_groups.smart_plus.create",
  "ad_groups.smart_plus.update",
  "ad_groups.smart_plus.status.update",
  "ads.smart_plus.list",
  "ads.smart_plus.create",
  "ads.smart_plus.update",
  "ads.smart_plus.status.update",
  "ads.smart_plus.appeal",
  "ads.smart_plus.review.get",
  "ads.smart_plus.material_status.update",
  "materials.smart_plus.review.get",
  "reports.smart_plus.material.overview",
  "reports.smart_plus.material.breakdown",
  "campaigns.gmv_max.create",
  "campaigns.gmv_max.get",
  "campaigns.gmv_max.update",
  "campaigns.gmv_max.sessions.create",
  "campaigns.gmv_max.sessions.delete",
  "campaigns.gmv_max.sessions.get",
  "campaigns.gmv_max.sessions.list",
  "campaigns.gmv_max.sessions.update",
  "gmv_max.bid.recommend",
  "gmv_max.custom_anchor_videos.list",
  "gmv_max.occupied_custom_shop_ads.list",
  "gmv_max.identity.get",
  "gmv_max.videos.list",
  "gmv_max.stores.list",
  "gmv_max.shop_ad_usage.check",
  "gmv_max.exclusive_authorization.get",
  "gmv_max.exclusive_authorization.create",
  "reports.gmv_max.get",
  "identities.create",
  "identities.videos.get",
  "spark_ads.videos.list",
  "spark_ads.videos.get",
  "spark_ads.authorize",
  "spark_ads.unbind",
  "tcm.spark_ads.status.get",
  "tcm.spark_ads.apply",
  "tcm.reports.get",
  "tcm.creators.authorized.list",
  "tcm.creators.authorized.videos.list",
  "tcm.creators.public.list",
  "tcm.creators.public.videos.list",
  "comments.list",
  "comments.references.list",
  "comments.reply",
  "comments.delete",
  "comments.status.update",
  "comments.export.create",
  "comments.export.get",
  "blocked_words.list",
  "blocked_words.check",
  "blocked_words.create",
  "blocked_words.update",
  "blocked_words.delete",
  "blocked_words.export.create",
  "blocked_words.export.get",
  "tools.regions.list",
  "tools.search_regions.list",
  "tools.interest_categories.list",
  "tools.interest_keywords.list",
  "tools.interest_keywords.recommend",
  "tools.action_categories.list",
  "tools.hashtags.list",
  "tools.hashtags.recommend",
  "tools.targeting_categories.recommend",
  "tools.targeting.search",
  "tools.targeting.info",
  "tools.targeting.list",
  "tools.os_versions.list",
  "tools.languages.list",
  "tools.carriers.list",
  "tools.device_models.list",
  "tools.timezones.list",
  "tools.contextual_tags.list",
  "tools.contextual_tags.get",
  "tools.phone_region_codes.list",
  "tools.open_url.get",
  "tools.url.validate",
  "tools.vbo_status.get",
  "tools.bid.recommend",
  "tools.brand_safety.partner_status.get",
  "tools.search_ads.health.get",
  "portfolios.list",
  "portfolios.get",
  "portfolios.create",
  "creatives.assets.share",
  "creatives.assets.delete",
  "creatives.images.edit",
  "creatives.smart_text.generate",
  "creatives.shareable_links.create",
  "discovery.trending.list",
  "discovery.hashtags.get",
  "playables.list",
  "playables.validate",
  "playables.save",
  "playables.delete",
  "videos.get",
  "images.get",
  "optimizer.rules.list",
  "optimizer.rules.get",
  "optimizer.rules.create",
  "optimizer.rules.update",
  "optimizer.rules.batch_bind",
  "optimizer.rule_results.list",
  "optimizer.rule_results.get",
  "apps.list",
  "apps.get",
  "apps.create",
  "apps.update",
  "apps.optimization_events.list",
  "apps.retargeting_events.list",
  "offline_events.list",
  "offline_events.create",
  "offline_events.update",
  "offline_events.delete",
  "terms.get",
  "terms.check",
  "terms.confirm",
  "pangle.audience_packages.list",
  "pangle.block_list.get",
  "pangle.block_list.update",
  "rf.inventory.estimate",
  "rf.orders.cancel",
];

const v050Operations = [
  "pixels.track",
  "pixels.batch",
  "pages.list",
  "pages.libraries.list",
  "pages.libraries.transfer",
  "pages.fields.list",
  "leads.fields.list",
  "leads.get",
  "leads.download_task.create",
  "leads.download_task.get",
  "leads.mock.create",
  "leads.mock.list",
  "leads.mock.delete",
  "identities.info.get",
  "identities.live.get",
  "identities.videos.list",
  "reports.ad_benchmark.get",
  "reports.video_performance.get",
  "creatives.report.get",
  "split_tests.create",
  "split_tests.update",
  "split_tests.end",
  "split_tests.results.get",
  "split_tests.promote",
  "search_ads.negative_keywords.list",
  "search_ads.negative_keywords.add",
  "search_ads.negative_keywords.update",
  "search_ads.negative_keywords.delete",
  "search_ads.negative_keywords.download",
  "rf.contracts.query",
  "rf.delivery.timezones.list",
  "campaigns.gmv_max.creatives.update",
  "campaigns.spark_ads.create",
  "spark_ads.recommend",
  "catalogs.eventsource_bind.get",
  "showcase.identities.list",
  "showcase.products.list",
  "showcase.regions.list",
  "stores.list",
  "stores.products.list",
  "subscriptions.list",
  "subscriptions.create",
  "subscriptions.delete",
  "files.upload.start",
  "files.upload.finish",
];

const v060Operations = [
  "ad_groups.rf.create",
  "ad_groups.rf.update",
  "ad_groups.rf.estimated.get",
  "audience.insights.info.get",
  "audience.segments.operate",
  "assets.bind.quota.get",
  "bc.account.budget_changelog.get",
  "bc.account.costs.list",
  "bc.advertisers.attributes.get",
  "bc.advertisers.disable",
  "bc.advertisers.qualifications.get",
  "bc.advertisers.unionpay.check",
  "bc.advertisers.unionpay.submit",
  "bc.assets.account_authorization.get",
  "bc.assets.advertiser.assign",
  "bc.assets.advertiser.assigned.list",
  "bc.assets.advertiser.unassign",
  "bc.billing_groups.advertisers.list",
  "bc.invoices.get",
  "bc.invoices.task.create",
  "bc.invoices.task.get",
  "bc.invoices.task.list",
  "blocked_words.export.download",
  "comments.export.download",
  "catalogs.feeds.get",
  "catalogs.insights.categories.get",
  "catalogs.insights.filters.get",
  "catalogs.insights.products.get",
  "catalogs.sets.get",
  "catalogs.videos.get",
  "catalogs.videos.log.get",
  "catalogs.video_packages.get",
  "catalogs.diagnostics.get",
  "catalogs.eventsource.issues.get",
  "catalogs.eventsource.metrics.get",
  "catalogs.product_diagnostics.create",
  "catalogs.product_diagnostics.get",
  "changelogs.get",
  "changelogs.task.create",
  "changelogs.task.check",
  "changelogs.task.download",
  "creatives.ads_preview.create",
  "creatives.auto_messages.create",
  "creatives.auto_messages.list",
  "creatives.cta.recommend",
  "portfolios.delete",
  "videos.fix.task.create",
  "videos.fix.task.get",
  "crm.list",
  "crm.create",
  "ctm.message_event_sets.get",
  "custom_conversions.create",
  "custom_conversions.delete",
  "custom_conversions.get",
  "custom_conversions.list",
  "custom_conversions.update",
  "images.search",
  "images.update",
  "videos.search",
  "videos.update",
  "files.music.get",
  "files.names.check",
  "videos.suggest_cover.get",
  "gmv_max.campaigns.list",
  "identities.music.authorization.get",
  "identities.native_series.get",
  "optimizer.rules.status.update",
  "payment_portfolios.get",
  "payment_portfolios.create",
  "payment_portfolios.advertisers.get",
  "payment_portfolios.advertisers.update",
  "payment_portfolios.credit_line.update",
  "payment_portfolios.users.get",
  "ads.smart_plus.preview",
  "ad_groups.smart_plus.budget.update",
  "campaigns.smart_plus.copy_task.create",
  "campaigns.smart_plus.copy_task.get",
  "campaign_labels.list",
  "minis.get",
  "tools.search_keywords.ideas",
  "tools.search_keywords.recommend",
  "tools.content_exclusion.list",
  "tools.content_exclusion.get",
  "tiktok_inventory_filters.get",
  "tiktok_inventory_filters.update",
];

const v070Operations = [
  "mmm.requests.create",
  "mmm.requests.check",
  "mmm.requests.download",
  "mmm.requests.history",
  "bc.create",
  "identities.delete",
  "creatives.pre_review.create",
  "creatives.pre_review.get",
  "segments.mapping.update",
  "campaigns.spc.create",
  "apps.attribution_sources.list",
  "reports.bid_protection.statuses.get",
  "reports.bid_protection.details.get",
  "creatives.fatigue.list",
  "account.verification.filetypes.get",
  "account.verification.status.get",
  "account.verification.submit",
  "files.video.upload",
  "files.image.upload",
  "files.music.upload",
  "files.temporary.upload",
  "custom_audiences.file.upload",
  "bc.image.upload",
  "playables.upload",
  "files.transfer.upload",
  "bc.organization_accounts.create",
  "account.verification.upload",
];

const addedOperations = [...catalogAudienceOperations, ...campaignReportPixelOperations, ...waveOperations, ...v050Operations, ...v060Operations, ...v070Operations];

describe("TikTok Ads v1.3 coverage", () => {
  it("adds the documented catalog, audience, campaign, reporting, pixel, BC, Smart+, GMV Max, comment, and tool operations as real request-backed actions", () => {
    expect(Object.keys(manifest.operations)).toHaveLength(424);
    for (const key of addedOperations) {
      const operation = manifest.operations[key];
      expect(operation, key).toBeDefined();
      expect(operation.kind, key).toBe("action");
      expect(operation.request, key).toBeDefined();
      expect(operation.title, key).toEqual(expect.any(String));
      expect(operation.description, key).toEqual(expect.any(String));
      expect(operation.inputSchema?.type, key).toBe("object");
    }
  });

  it("compiles the catalog reads and sends the stored token without exposing it in the schema", async () => {
    const compiled = compileDeclarativeConnector(manifest);
    const handler = wrapTikTokApiEnvelope(compiled.actions["catalogs.get"]);
    expect(handler).toBeFunction();
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const result = await handler({
      accessToken: "fixture-access-token",
      bcId: "bc-42",
      catalogId: "catalog-7",
      fetch: async (input: RequestInfo | URL, init: RequestInit = {}) => {
        calls.push({ url: String(input), init });
        return new Response(readFileSync(new URL("../fixtures/catalog_get.json", import.meta.url), "utf8"), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    }) as any;

    expect(calls).toHaveLength(1);
    const request = calls[0]!;
    const url = new URL(request.url);
    expect(url.pathname).toBe("/open_api/v1.3/catalog/get/");
    expect(url.searchParams.get("bc_id")).toBe("bc-42");
    expect(url.searchParams.get("catalog_id")).toBe("catalog-7");
    expect(new Headers(request.init.headers).get("Access-Token")).toBe("fixture-access-token");
    expect(result.data.list[0].catalog_id).toBe("catalog-7");
    expect(manifest.operations["catalogs.get"].inputSchema.properties.accessToken).toBeUndefined();
  });

  it("requires the provider body for mutations and sends it as JSON", async () => {
    const handler = wrapTikTokApiEnvelope(compileDeclarativeConnector(manifest).actions["catalogs.update"]);
    let invalidInputReachedProvider = false;
    await expect(handler({
      accessToken: "fixture-access-token",
      bc_id: "bc-42",
      fetch: async () => {
        invalidInputReachedProvider = true;
        return new Response("{}", { status: 200 });
      },
    })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    expect(invalidInputReachedProvider).toBe(false);

    let sentBody = "";
    const result = await handler({
      accessToken: "fixture-access-token",
      bc_id: "bc-42",
      catalog_id: "catalog-7",
      catalog_name: "Summer Catalog",
      fetch: async (_input: RequestInfo | URL, init: RequestInit = {}) => {
        sentBody = String(init.body ?? "");
        return new Response(readFileSync(new URL("../fixtures/catalog_mutation.json", import.meta.url), "utf8"), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    }) as any;

    expect(JSON.parse(sentBody)).toEqual({
      bc_id: "bc-42",
      catalog_id: "catalog-7",
      catalog_name: "Summer Catalog",
    });
    expect(result.data).toBeDefined();
  });

  it("declares reads as read-only and mutations as writes", () => {
    for (const key of addedOperations) {
      const operation = manifest.operations[key];
      expect(operation.sideEffect, key).toBe(operation.request.method === "GET" ? "read" : "write");
    }
  });

  it("serializes custom audience ID arrays as JSON and rejects TikTok application errors", async () => {
    const handler = wrapTikTokApiEnvelope(compileDeclarativeConnector(manifest).actions["custom_audiences.get"]);
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const success = await handler({
      accessToken: "fixture-access-token",
      advertiserId: "adv-1",
      customAudienceIds: ["aud-1", "aud-2"],
      fetch: async (input: RequestInfo | URL, init: RequestInit = {}) => {
        calls.push({ url: String(input), init });
        return new Response(readFileSync(new URL("../fixtures/custom_audience_get.json", import.meta.url), "utf8"), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    }) as any;

    expect(JSON.parse(new URL(calls[0]!.url).searchParams.get("custom_audience_ids")!)).toEqual(["aud-1", "aud-2"]);
    expect(success.data.list[0].custom_audience_id).toBe("aud-1");

    await expect(handler({
      accessToken: "fixture-access-token",
      advertiserId: "adv-1",
      customAudienceIds: ["aud-1"],
      fetch: async () => new Response(readFileSync(new URL("../fixtures/tiktok_error.json", import.meta.url), "utf8"), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  it("checks async report tasks and creates pixels over documented v1.3 paths", async () => {
    const compiled = compileDeclarativeConnector(manifest);
    const check = wrapTikTokApiEnvelope(compiled.actions["reports.task.check"]);
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const checked = await check({
      accessToken: "fixture-access-token",
      advertiserId: "adv-1",
      taskId: "task-42",
      fetch: async (input: RequestInfo | URL, init: RequestInit = {}) => {
        calls.push({ url: String(input), init });
        return new Response(readFileSync(new URL("../fixtures/report_task.json", import.meta.url), "utf8"), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    }) as any;
    expect(new URL(calls[0]!.url).pathname).toBe("/open_api/v1.3/report/task/check/");
    expect(new URL(calls[0]!.url).searchParams.get("task_id")).toBe("task-42");
    expect(checked.data.task_id).toBe("task-42");

    let sentBody = "";
    const created = await wrapTikTokApiEnvelope(compiled.actions["pixels.create"])({
      accessToken: "fixture-access-token",
      advertiser_id: "adv-1",
      pixel_name: "Acme Web Pixel",
      fetch: async (_input: RequestInfo | URL, init: RequestInit = {}) => {
        sentBody = String(init.body ?? "");
        return new Response(readFileSync(new URL("../fixtures/pixel_mutation.json", import.meta.url), "utf8"), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    }) as any;
    expect(JSON.parse(sentBody)).toEqual({ advertiser_id: "adv-1", pixel_name: "Acme Web Pixel" });
    expect(created.data.pixel_id).toBe("7001122334455667788");
  });

  it("serializes catalog product ID arrays and ad review IDs as JSON", async () => {
    const compiled = compileDeclarativeConnector(manifest);
    const productCalls: Array<{ url: string }> = [];
    const products = await wrapTikTokApiEnvelope(compiled.actions["catalogs.products.get"])({
      accessToken: "fixture-access-token",
      bcId: "bc-42",
      catalogId: "catalog-7",
      productIds: ["sku-1"],
      fetch: async (input: RequestInfo | URL) => {
        productCalls.push({ url: String(input) });
        return new Response(readFileSync(new URL("../fixtures/catalog_product_get.json", import.meta.url), "utf8"), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    }) as any;
    expect(new URL(productCalls[0]!.url).pathname).toBe("/open_api/v1.3/catalog/product/get/");
    expect(JSON.parse(new URL(productCalls[0]!.url).searchParams.get("product_ids")!)).toEqual(["sku-1"]);
    expect(products.data.list[0].product_id).toBe("sku-1");

    const reviewCalls: Array<{ url: string }> = [];
    await wrapTikTokApiEnvelope(compiled.actions["ads.review.get"])({
      accessToken: "fixture-access-token",
      advertiserId: "adv-1",
      adIds: ["ad-1"],
      fetch: async (input: RequestInfo | URL) => {
        reviewCalls.push({ url: String(input) });
        return new Response(readFileSync(new URL("../fixtures/ad_review.json", import.meta.url), "utf8"), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    expect(new URL(reviewCalls[0]!.url).pathname).toBe("/open_api/v1.3/ad/review_info/");
    expect(JSON.parse(new URL(reviewCalls[0]!.url).searchParams.get("ad_ids")!)).toEqual(["ad-1"]);
  });

  it("requires campaign copy identifiers before creating a copy task", async () => {
    const handler = wrapTikTokApiEnvelope(compileDeclarativeConnector(manifest).actions["campaigns.copy_task.create"]);
    let reachedProvider = false;
    await expect(handler({
      accessToken: "fixture-access-token",
      advertiser_id: "adv-1",
      fetch: async () => {
        reachedProvider = true;
        return new Response("{}", { status: 200 });
      },
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(reachedProvider).toBe(false);
  });

  it("lists Business Centers and assigns assets over documented v1.3 paths", async () => {
    const compiled = compileDeclarativeConnector(manifest);
    const listCalls: Array<{ url: string; init: RequestInit }> = [];
    const listed = await wrapTikTokApiEnvelope(compiled.actions["bc.list"])({
      accessToken: "fixture-access-token",
      page: 1,
      fetch: async (input: RequestInfo | URL, init: RequestInit = {}) => {
        listCalls.push({ url: String(input), init });
        return new Response(readFileSync(new URL("../fixtures/bc_get.json", import.meta.url), "utf8"), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    }) as any;
    expect(new URL(listCalls[0]!.url).pathname).toBe("/open_api/v1.3/bc/get/");
    expect(new Headers(listCalls[0]!.init.headers).get("Access-Token")).toBe("fixture-access-token");
    expect(listed.data.list[0].bc_id).toBe("bc-42");

    let sentBody = "";
    const assigned = await wrapTikTokApiEnvelope(compiled.actions["bc.assets.assign"])({
      accessToken: "fixture-access-token",
      bc_id: "bc-42",
      asset_id: "asset-9",
      asset_type: "ADVERTISER",
      user_id: "user-3",
      fetch: async (_input: RequestInfo | URL, init: RequestInit = {}) => {
        sentBody = String(init.body ?? "");
        return new Response(readFileSync(new URL("../fixtures/bc_asset_assign.json", import.meta.url), "utf8"), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    }) as any;
    expect(JSON.parse(sentBody)).toEqual({
      bc_id: "bc-42",
      asset_id: "asset-9",
      asset_type: "ADVERTISER",
      user_id: "user-3",
    });
    expect(assigned.data.asset_id).toBe("asset-9");
  });

  it("requires Smart+ campaign identifiers and sends GMV Max create bodies as JSON", async () => {
    const compiled = compileDeclarativeConnector(manifest);
    let reachedProvider = false;
    await expect(wrapTikTokApiEnvelope(compiled.actions["campaigns.smart_plus.create"])({
      accessToken: "fixture-access-token",
      advertiser_id: "adv-1",
      fetch: async () => {
        reachedProvider = true;
        return new Response("{}", { status: 200 });
      },
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(reachedProvider).toBe(false);

    let sentBody = "";
    const created = await wrapTikTokApiEnvelope(compiled.actions["campaigns.smart_plus.create"])({
      accessToken: "fixture-access-token",
      advertiser_id: "adv-1",
      campaign_name: "Smart Plus Summer",
      objective_type: "WEB_CONVERSIONS",
      request_id: "req-1",
      fetch: async (input: RequestInfo | URL, init: RequestInit = {}) => {
        sentBody = String(init.body ?? "");
        expect(new URL(String(input)).pathname).toBe("/open_api/v1.3/smart_plus/campaign/create/");
        return new Response(readFileSync(new URL("../fixtures/smart_plus_campaign.json", import.meta.url), "utf8"), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    }) as any;
    expect(JSON.parse(sentBody)).toEqual({
      advertiser_id: "adv-1",
      campaign_name: "Smart Plus Summer",
      objective_type: "WEB_CONVERSIONS",
      request_id: "req-1",
    });
    expect(created.data.campaign_id).toBe("sp-campaign-1");

    let gmvBody = "";
    const gmv = await wrapTikTokApiEnvelope(compiled.actions["campaigns.gmv_max.create"])({
      accessToken: "fixture-access-token",
      advertiser_id: "adv-1",
      campaign_name: "GMV Max Shop",
      request_id: "req-2",
      store_id: "store-1",
      store_authorized_bc_id: "bc-42",
      shopping_ads_type: "PRODUCT",
      optimization_goal: "VALUE",
      deep_bid_type: "VO_MIN_ROAS",
      schedule_type: "SCHEDULE_FROM_NOW",
      schedule_start_time: "2026-10-08 00:00:00",
      fetch: async (_input: RequestInfo | URL, init: RequestInit = {}) => {
        gmvBody = String(init.body ?? "");
        return new Response(readFileSync(new URL("../fixtures/gmv_max_campaign.json", import.meta.url), "utf8"), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    }) as any;
    expect(JSON.parse(gmvBody).store_id).toBe("store-1");
    expect(gmv.data.campaign_id).toBe("gmv-campaign-1");
  });

  it("serializes comment and blocked-word arrays as JSON query values", async () => {
    const compiled = compileDeclarativeConnector(manifest);
    const commentCalls: Array<{ url: string }> = [];
    const comments = await wrapTikTokApiEnvelope(compiled.actions["comments.list"])({
      accessToken: "fixture-access-token",
      advertiserId: "adv-1",
      startTime: "2026-10-01 00:00:00",
      endTime: "2026-10-07 23:59:59",
      searchField: "ITEM_ID",
      searchValue: "item-1",
      commentType: ["COMMENT"],
      fetch: async (input: RequestInfo | URL) => {
        commentCalls.push({ url: String(input) });
        return new Response(readFileSync(new URL("../fixtures/comments_list.json", import.meta.url), "utf8"), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    }) as any;
    const commentUrl = new URL(commentCalls[0]!.url);
    expect(commentUrl.pathname).toBe("/open_api/v1.3/comment/list/");
    expect(JSON.parse(commentUrl.searchParams.get("comment_type")!)).toEqual(["COMMENT"]);
    expect(comments.data.list[0].comment_id).toBe("cmt-1");

    const blockedCalls: Array<{ url: string }> = [];
    const blocked = await wrapTikTokApiEnvelope(compiled.actions["blocked_words.check"])({
      accessToken: "fixture-access-token",
      advertiserId: "adv-1",
      blockedWords: ["spam"],
      fetch: async (input: RequestInfo | URL) => {
        blockedCalls.push({ url: String(input) });
        return new Response(readFileSync(new URL("../fixtures/blocked_words.json", import.meta.url), "utf8"), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    }) as any;
    expect(new URL(blockedCalls[0]!.url).pathname).toBe("/open_api/v1.3/blockedword/check/");
    expect(JSON.parse(new URL(blockedCalls[0]!.url).searchParams.get("blocked_words")!)).toEqual(["spam"]);
    expect(blocked.data.list[0].is_blocked).toBe(true);
  });

  it("tracks pixel events and reads Instant Form leads over documented v1.3 JSON paths", async () => {
    const compiled = compileDeclarativeConnector(manifest);
    let trackBody = "";
    const tracked = await wrapTikTokApiEnvelope(compiled.actions["pixels.track"])({
      accessToken: "fixture-access-token",
      pixel_code: "CABCDEFG",
      event: "CompletePayment",
      event_time: 1760000000,
      event_id: "evt-1",
      fetch: async (input: RequestInfo | URL, init: RequestInit = {}) => {
        trackBody = String(init.body ?? "");
        expect(new URL(String(input)).pathname).toBe("/open_api/v1.3/event/track/");
        return new Response(readFileSync(new URL("../fixtures/pixel_track.json", import.meta.url), "utf8"), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    }) as any;
    expect(JSON.parse(trackBody)).toEqual({
      event_source: "web",
      event_source_id: "CABCDEFG",
      data: [{ event: "CompletePayment", event_time: 1760000000, event_id: "evt-1" }],
    });
    expect(tracked.data).toEqual({});

    const leadCalls: Array<{ url: string }> = [];
    const lead = await wrapTikTokApiEnvelope(compiled.actions["leads.get"])({
      accessToken: "fixture-access-token",
      advertiserId: "adv-1",
      leadSource: "INSTANT_FORM",
      pageId: "page-9",
      leadId: "lead-1",
      fetch: async (input: RequestInfo | URL) => {
        leadCalls.push({ url: String(input) });
        return new Response(readFileSync(new URL("../fixtures/lead_get.json", import.meta.url), "utf8"), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    }) as any;
    const leadUrl = new URL(leadCalls[0]!.url);
    expect(leadUrl.pathname).toBe("/open_api/v1.3/lead/get/");
    expect(leadUrl.searchParams.get("advertiser_id")).toBe("adv-1");
    expect(leadUrl.searchParams.get("lead_source")).toBe("INSTANT_FORM");
    expect(leadUrl.searchParams.get("page_id")).toBe("page-9");
    expect(lead.data.lead_id).toBe("lead-1");
  });

  it("creates split tests and lists negative keywords over documented v1.3 paths", async () => {
    const compiled = compileDeclarativeConnector(manifest);
    let splitBody = "";
    const created = await wrapTikTokApiEnvelope(compiled.actions["split_tests.create"])({
      accessToken: "fixture-access-token",
      advertiser_id: "adv-1",
      split_test_group_name: "Budget split",
      fetch: async (input: RequestInfo | URL, init: RequestInit = {}) => {
        splitBody = String(init.body ?? "");
        expect(new URL(String(input)).pathname).toBe("/open_api/v1.3/split_test/create/");
        return new Response(readFileSync(new URL("../fixtures/split_test.json", import.meta.url), "utf8"), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    }) as any;
    expect(JSON.parse(splitBody)).toEqual({
      advertiser_id: "adv-1",
      split_test_group_name: "Budget split",
    });
    expect(created.data.split_test_group_id).toBe("st-1");

    const keywordCalls: Array<{ url: string }> = [];
    const keywords = await wrapTikTokApiEnvelope(compiled.actions["search_ads.negative_keywords.list"])({
      accessToken: "fixture-access-token",
      advertiserId: "adv-1",
      objectType: "ADGROUP",
      objectId: "ag-1",
      fetch: async (input: RequestInfo | URL) => {
        keywordCalls.push({ url: String(input) });
        return new Response(readFileSync(new URL("../fixtures/negative_keyword.json", import.meta.url), "utf8"), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    }) as any;
    const keywordUrl = new URL(keywordCalls[0]!.url);
    expect(keywordUrl.pathname).toBe("/open_api/v1.3/search_ad/negative_keyword/get/");
    expect(keywordUrl.searchParams.get("object_type")).toBe("ADGROUP");
    expect(keywords.data.list[0].keyword).toBe("cheap");
  });

  it("keeps GET/DELETE body-less and sets JSON Content-Type only on bodies", async () => {
    expect(manifest.http.headers?.["Content-Type"]).toBeUndefined();
    expect(manifest.http.headers?.["content-type"]).toBeUndefined();
    for (const [key, operation] of Object.entries(manifest.operations) as Array<[string, any]>) {
      const request = operation.request;
      if (!request) continue;
      const method = String(request.method ?? "GET").toUpperCase();
      const contentType = request.headers?.["Content-Type"] ?? request.headers?.["content-type"];
      if (method === "GET" || method === "HEAD" || method === "DELETE") {
        expect(request.body, key).toBeUndefined();
        expect(contentType, key).toBeUndefined();
      } else if (request.body !== undefined) {
        if (request.bodyEncoding === "form") {
          expect(contentType, key).toBe("application/x-www-form-urlencoded");
        } else {
          expect(contentType, key).toBe("application/json");
        }
      }
    }

    const compiled = compileDeclarativeConnector(manifest);
    const getCalls: Array<{ url: string; init: RequestInit }> = [];
    await wrapTikTokApiEnvelope(compiled.actions["changelogs.task.check"])({
      accessToken: "fixture-access-token",
      advertiserId: "adv-1",
      taskId: "task-42",
      fetch: async (input: RequestInfo | URL, init: RequestInit = {}) => {
        getCalls.push({ url: String(input), init });
        return new Response(readFileSync(new URL("../fixtures/report_task.json", import.meta.url), "utf8"), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    expect(getCalls).toHaveLength(1);
    expect(new URL(getCalls[0]!.url).pathname).toBe("/open_api/v1.3/changelog/task/check/");
    expect(getCalls[0]!.init.body).toBeUndefined();
    expect(new Headers(getCalls[0]!.init.headers).get("Content-Type")).toBeNull();
    expect(new Headers(getCalls[0]!.init.headers).get("Access-Token")).toBe("fixture-access-token");

    let sentBody = "";
    let sentType: string | null = null;
    const created = await wrapTikTokApiEnvelope(compiled.actions["custom_conversions.create"])({
      accessToken: "fixture-access-token",
      advertiser_id: "adv-1",
      name: "High-value purchase",
      event_source_id: "pixel-1",
      optimization_event: "SHOPPING",
      fetch: async (input: RequestInfo | URL, init: RequestInit = {}) => {
        sentBody = String(init.body ?? "");
        sentType = new Headers(init.headers).get("Content-Type");
        expect(new URL(String(input)).pathname).toBe("/open_api/v1.3/custom_conversion/create/");
        return new Response(readFileSync(new URL("../fixtures/catalog_mutation.json", import.meta.url), "utf8"), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    }) as any;
    expect(sentType).toBe("application/json");
    expect(JSON.parse(sentBody)).toEqual({
      advertiser_id: "adv-1",
      name: "High-value purchase",
      event_source_id: "pixel-1",
      optimization_event: "SHOPPING",
    });
    expect(created.data).toBeDefined();

    const assignCalls: Array<{ url: string; init: RequestInit }> = [];
    await wrapTikTokApiEnvelope(compiled.actions["bc.assets.advertiser.assign"])({
      accessToken: "fixture-access-token",
      bc_id: "bc-42",
      asset_id: "tt-9",
      advertiser_id: "adv-1",
      fetch: async (input: RequestInfo | URL, init: RequestInit = {}) => {
        assignCalls.push({ url: String(input), init });
        return new Response(readFileSync(new URL("../fixtures/bc_asset_assign.json", import.meta.url), "utf8"), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    expect(new URL(assignCalls[0]!.url).pathname).toBe("/open_api/v1.3/bc/asset/advertiser/assign/");
    expect(new Headers(assignCalls[0]!.init.headers).get("Content-Type")).toBe("application/json");
    expect(JSON.parse(String(assignCalls[0]!.init.body))).toEqual({
      bc_id: "bc-42",
      asset_id: "tt-9",
      advertiser_id: "adv-1",
    });
  });


  it("sends filled origin reads and the Business Center create body", async () => {
    const compiled = compileDeclarativeConnector(manifest);
    const calls: string[] = [];
    await wrapTikTokApiEnvelope(compiled.actions["campaigns.get"])({
      accessToken: "fixture-access-token",
      advertiserId: "adv-1",
      campaignId: "cmp-1",
      fetch: async (input: RequestInfo | URL) => {
        calls.push(String(input));
        return new Response(JSON.stringify({ code: 0, message: "OK", request_id: "r", data: { list: [] } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    const campaignUrl = new URL(calls[0]!);
    expect(campaignUrl.pathname).toBe("/open_api/v1.3/campaign/get/");
    expect(JSON.parse(campaignUrl.searchParams.get("filtering")!)).toEqual({ campaign_ids: ["cmp-1"] });

    let body = "";
    await wrapTikTokApiEnvelope(compiled.actions["bc.create"])({
      accessToken: "fixture-access-token",
      bc_name: "North",
      timezone: "America/Los_Angeles",
      fetch: async (_input: RequestInfo | URL, init: RequestInit = {}) => {
        body = String(init.body ?? "");
        expect(new URL(String(_input)).pathname).toBe("/open_api/v1.3/bc/create/");
        return new Response(JSON.stringify({ code: 0, message: "OK", request_id: "r", data: { bc_id: "bc-1" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    expect(JSON.parse(body)).toEqual({ bc_name: "North", timezone: "America/Los_Angeles" });
  });

  it("keeps recipe operations equal to runner operations", async () => {
    const recipe = await Bun.file(new URL("../../recipes/tiktok_ads/recipe.json", import.meta.url)).json() as {
      manifest: { operations: Record<string, unknown> };
      selection: { operations: string[] };
    };
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(manifest.operations).sort());
    expect(recipe.selection.operations.sort()).toEqual(Object.keys(manifest.operations).sort());
  });
});
