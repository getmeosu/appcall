import { describe, expect, test } from "bun:test";
import {
  META_GRAPH_API_VERSION,
  actPath,
  CAMPAIGN_GET_FIELDS,
  ADSET_GET_FIELDS,
  AD_GET_FIELDS,
  resolveObserveFields,
  getCampaign,
  createCampaign,
  updateCampaign,
  getAdSet,
  createAdSet,
  updateAdSet,
  getAd,
  createAd,
  updateAd,
  listAdCreatives,
  getAdCreative,
  createAdCreative,
  getInsights,
  getAdAccount,
  searchTargeting,
} from "../src/g1";
import campaignGet from "../fixtures/campaign_get.json";
import campaignCreated from "../fixtures/campaign_created.json";
import campaignUpdated from "../fixtures/campaign_updated.json";
import adsetGet from "../fixtures/adset_get.json";
import adsetCreated from "../fixtures/adset_created.json";
import adsetUpdated from "../fixtures/adset_updated.json";
import adGet from "../fixtures/ad_get.json";
import adCreated from "../fixtures/ad_created.json";
import adUpdated from "../fixtures/ad_updated.json";
import creativesList from "../fixtures/adcreatives_list.json";
import creativeGet from "../fixtures/adcreative_get.json";
import creativeCreated from "../fixtures/adcreative_created.json";
import insightsGet from "../fixtures/insights_get.json";
import accountGet from "../fixtures/ad_account_get.json";
import targetingSearch from "../fixtures/targeting_search.json";

function stubFetch(body: unknown, init: { status?: number } = {}) {
  const calls: Request[] = [];
  const impl = (async (input: string | URL | Request, requestInit?: RequestInit) => {
    calls.push(new Request(input as string, requestInit));
    return new Response(JSON.stringify(body), {
      status: init.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

const auth = { accessToken: "EAAB-test-token" };

describe("meta-ads G1 helpers", () => {
  test("pins Graph v26.0", () => {
    expect(META_GRAPH_API_VERSION).toBe("v26.0");
  });

  test("actPath normalizes ad account ids", () => {
    expect(actPath("123456789")).toBe("act_123456789");
    expect(actPath("act_123456789")).toBe("act_123456789");
    expect(() => actPath("not-an-id")).toThrow(/adAccountId/);
  });
});

describe("campaigns.get / create / update", () => {
  test("get GETs /{id} on v26.0 and normalizes", async () => {
    const { calls, impl } = stubFetch(campaignGet);
    const result = await getCampaign({ ...auth, campaignId: "23851234567890123", fetch: impl });
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]!.url);
    expect(url.origin).toBe("https://graph.facebook.com");
    expect(url.pathname).toBe("/v26.0/23851234567890123");
    expect(url.searchParams.get("fields")).toContain("objective");
    expect(calls[0]!.headers.get("Authorization")).toBe("Bearer EAAB-test-token");
    expect(result.campaign).toMatchObject({
      provider: "meta-ads",
      name: "Summer Sale",
      status: "PAUSED",
      objective: "OUTCOME_TRAFFIC",
      dailyBudget: 5000,
    });
  });

  test("create POSTs form body to /act_{id}/campaigns", async () => {
    const { calls, impl } = stubFetch(campaignCreated);
    const result = await createCampaign({
      ...auth,
      adAccountId: "123456789",
      name: "Summer Sale",
      objective: "OUTCOME_TRAFFIC",
      status: "PAUSED",
      dailyBudget: 5000,
      specialAdCategories: [],
      fetch: impl,
    });
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/v26.0/act_123456789/campaigns");
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.headers.get("Content-Type")).toContain("application/x-www-form-urlencoded");
    const body = await calls[0]!.text();
    const params = new URLSearchParams(body);
    expect(params.get("name")).toBe("Summer Sale");
    expect(params.get("objective")).toBe("OUTCOME_TRAFFIC");
    expect(params.get("special_ad_categories")).toBe("[]");
    expect(params.get("daily_budget")).toBe("5000");
    expect(result.id).toBe("23851234567890123");
  });

  test("update POSTs to /{campaignId}", async () => {
    const { calls, impl } = stubFetch(campaignUpdated);
    const result = await updateCampaign({
      ...auth,
      campaignId: "23851234567890123",
      name: "Summer Sale v2",
      status: "PAUSED",
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/v26.0/23851234567890123");
    const params = new URLSearchParams(await calls[0]!.text());
    expect(params.get("name")).toBe("Summer Sale v2");
    expect(result.success).toBe(true);
  });
});

describe("ad_sets.get / create / update", () => {
  test("get normalizes targeting from live nesting", async () => {
    const { calls, impl } = stubFetch(adsetGet);
    const result = await getAdSet({ ...auth, adSetId: "23851234567890234", fetch: impl });
    expect(new URL(calls[0]!.url).pathname).toBe("/v26.0/23851234567890234");
    expect(result.adSet).toMatchObject({
      name: "US 25-45 Interest",
      campaignId: "23851234567890123",
      optimizationGoal: "LINK_CLICKS",
    });
    expect((result.adSet as { targeting: Record<string, unknown> }).targeting).toMatchObject({
      age_min: 25,
    });
  });

  test("create requires targeting and POSTs snake_case", async () => {
    const { calls, impl } = stubFetch(adsetCreated);
    const result = await createAdSet({
      ...auth,
      adAccountId: "act_123456789",
      name: "US 25-45 Interest",
      campaignId: "23851234567890123",
      billingEvent: "IMPRESSIONS",
      optimizationGoal: "LINK_CLICKS",
      targeting: { geo_locations: { countries: ["US"] } },
      dailyBudget: 2000,
      status: "PAUSED",
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/v26.0/act_123456789/adsets");
    const params = new URLSearchParams(await calls[0]!.text());
    expect(params.get("campaign_id")).toBe("23851234567890123");
    expect(params.get("optimization_goal")).toBe("LINK_CLICKS");
    expect(JSON.parse(params.get("targeting")!)).toEqual({ geo_locations: { countries: ["US"] } });
    expect(result.id).toBe("23851234567890234");
  });

  test("update POSTs changed fields only", async () => {
    const { calls, impl } = stubFetch(adsetUpdated);
    await updateAdSet({ ...auth, adSetId: "23851234567890234", dailyBudget: 2500, fetch: impl });
    const params = new URLSearchParams(await calls[0]!.text());
    expect(params.get("daily_budget")).toBe("2500");
    expect(params.get("name")).toBeNull();
  });
});

describe("ads.get / create / update", () => {
  test("get reads creative.object_type into creative.type", async () => {
    const { impl } = stubFetch(adGet);
    const result = await getAd({ ...auth, adId: "23851234567890345", fetch: impl });
    expect(result.ad).toMatchObject({
      name: "Carousel A",
      adSetId: "23851234567890234",
      creative: { name: "Hero Photo", type: "PHOTO" },
    });
  });

  test("create POSTs creative JSON", async () => {
    const { calls, impl } = stubFetch(adCreated);
    const result = await createAd({
      ...auth,
      adAccountId: "123456789",
      name: "Carousel A",
      adsetId: "23851234567890234",
      creative: { creative_id: "23851234567890456" },
      status: "PAUSED",
      fetch: impl,
    });
    const params = new URLSearchParams(await calls[0]!.text());
    expect(params.get("adset_id")).toBe("23851234567890234");
    expect(JSON.parse(params.get("creative")!)).toEqual({ creative_id: "23851234567890456" });
    expect(result.id).toBe("23851234567890345");
  });

  test("update succeeds", async () => {
    const { impl } = stubFetch(adUpdated);
    const result = await updateAd({ ...auth, adId: "23851234567890345", status: "PAUSED", fetch: impl });
    expect(result.success).toBe(true);
  });
});

describe("ad_creatives.list / get / create", () => {
  test("list reads data[] and paging.cursors.after", async () => {
    const { calls, impl } = stubFetch(creativesList);
    const result = await listAdCreatives({ ...auth, adAccountId: "123456789", limit: 25, fetch: impl });
    expect(new URL(calls[0]!.url).pathname).toBe("/v26.0/act_123456789/adcreatives");
    expect(result.creatives).toHaveLength(2);
    expect((result.creatives as Array<{ objectType: string }>)[0]!.objectType).toBe("PHOTO");
    expect(result.nextCursor).toBe("AFTERCUR");
  });

  test("get returns object_type as objectType", async () => {
    const { impl } = stubFetch(creativeGet);
    const result = await getAdCreative({ ...auth, creativeId: "23851234567890456", fetch: impl });
    expect(result.creative).toMatchObject({
      graphId: "23851234567890456",
      objectType: "PHOTO",
      name: "Hero Photo",
    });
  });

  test("create POSTs object_story_spec", async () => {
    const { calls, impl } = stubFetch(creativeCreated);
    const result = await createAdCreative({
      ...auth,
      adAccountId: "act_123456789",
      name: "Hero Photo",
      objectStorySpec: {
        page_id: "1234567890",
        link_data: { message: "Shop", link: "https://example.com", image_hash: "abc123hash" },
      },
      fetch: impl,
    });
    const params = new URLSearchParams(await calls[0]!.text());
    expect(params.get("name")).toBe("Hero Photo");
    expect(JSON.parse(params.get("object_story_spec")!).page_id).toBe("1234567890");
    expect(result.id).toBe("23851234567890456");
  });
});

describe("insights.get / ad_accounts.get / targeting.search", () => {
  test("insights.get hits /{id}/insights and returns data[] rows", async () => {
    const { calls, impl } = stubFetch(insightsGet);
    const result = await getInsights({
      ...auth,
      objectId: "23851234567890123",
      datePreset: "last_7d",
      fetch: impl,
    });
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/v26.0/23851234567890123/insights");
    expect(url.searchParams.get("date_preset")).toBe("last_7d");
    expect(result.rows).toHaveLength(1);
    expect((result.rows as Array<{ impressions: string }>)[0]!.impressions).toBe("12500");
  });

  test("insights.get level=account uses act_ prefix", async () => {
    const { calls, impl } = stubFetch(insightsGet);
    await getInsights({ ...auth, objectId: "123456789", level: "account", fetch: impl });
    expect(new URL(calls[0]!.url).pathname).toBe("/v26.0/act_123456789/insights");
  });

  test("ad_accounts.get normalizes account_status", async () => {
    const { calls, impl } = stubFetch(accountGet);
    const result = await getAdAccount({ ...auth, adAccountId: "123456789", fetch: impl });
    expect(new URL(calls[0]!.url).pathname).toBe("/v26.0/act_123456789");
    expect(result.adAccount).toMatchObject({
      name: "Example Ads Account",
      accountStatus: "ACTIVE",
      currency: "USD",
      timezone: "America/Los_Angeles",
    });
  });

  test("targeting.search GETs /search", async () => {
    const { calls, impl } = stubFetch(targetingSearch);
    const result = await searchTargeting({
      ...auth,
      q: "fitness",
      type: "adinterest",
      limit: 10,
      fetch: impl,
    });
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/v26.0/search");
    expect(url.searchParams.get("q")).toBe("fitness");
    expect(url.searchParams.get("type")).toBe("adinterest");
    expect(result.results).toHaveLength(2);
    expect((result.results as Array<{ name: string }>)[0]!.name).toBe("Fitness and wellness");
  });
});

describe("Reconcile observe default fields", () => {
  test("every mutable update input maps into its observe default GET fields", () => {
    const campaignWire = {
      name: "name",
      status: "status",
      dailyBudget: "daily_budget",
      lifetimeBudget: "lifetime_budget",
      spendCap: "spend_cap",
      bidStrategy: "bid_strategy",
      specialAdCategories: "special_ad_categories",
    };
    for (const wire of Object.values(campaignWire)) {
      expect(CAMPAIGN_GET_FIELDS.split(",")).toContain(wire);
    }

    const adSetWire = {
      name: "name",
      status: "status",
      dailyBudget: "daily_budget",
      lifetimeBudget: "lifetime_budget",
      bidAmount: "bid_amount",
      targeting: "targeting",
      endTime: "end_time",
    };
    for (const wire of Object.values(adSetWire)) {
      expect(ADSET_GET_FIELDS.split(",")).toContain(wire);
    }

    // ads.update mutables after dropping deprecated ad-level bidAmount
    const adWire = { name: "name", status: "status", creative: "creative" };
    for (const wire of Object.values(adWire)) {
      expect(AD_GET_FIELDS.includes(wire)).toBe(true);
    }
  });

  test("observe ignores caller-supplied fields on a reused update-shaped input", async () => {
    // Simulate runner Reconcile reusing campaigns.update input that smuggles `fields`.
    const { calls, impl } = stubFetch(campaignGet);
    await getCampaign({
      ...auth,
      campaignId: "23851234567890123",
      name: "Summer Sale v2",
      status: "PAUSED",
      spendCap: 100000,
      fields: "id,name",
      fetch: impl,
    });
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0]!.url).searchParams.get("fields")).toBe(CAMPAIGN_GET_FIELDS);
    expect(resolveObserveFields(
      { campaignId: "1", accessToken: "t", name: "x", fields: "id" },
      CAMPAIGN_GET_FIELDS,
      ["campaignId"],
    )).toBe(CAMPAIGN_GET_FIELDS);
    expect(resolveObserveFields(
      { campaignId: "1", accessToken: "t", fields: "id,name" },
      CAMPAIGN_GET_FIELDS,
      ["campaignId"],
    )).toBe("id,name");

    const adsetCalls = stubFetch(adsetGet);
    await getAdSet({
      ...auth,
      adSetId: "23851234567890234",
      dailyBudget: 2500,
      fields: "id,name",
      fetch: adsetCalls.impl,
    });
    expect(new URL(adsetCalls.calls[0]!.url).searchParams.get("fields")).toBe(ADSET_GET_FIELDS);

    const adCalls = stubFetch(adGet);
    await getAd({
      ...auth,
      adId: "23851234567890345",
      status: "PAUSED",
      fields: "id,name",
      fetch: adCalls.impl,
    });
    expect(new URL(adCalls.calls[0]!.url).searchParams.get("fields")).toBe(AD_GET_FIELDS);
  });
});
