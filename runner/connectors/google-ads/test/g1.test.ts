import { describe, expect, it } from "bun:test";
import {
  getAsset,
  listAssets,
  mutateAssets,
  createCalloutAsset,
  getCampaignAsset,
  mutateCampaignAssets,
  getAdGroupAsset,
  mutateAdGroupAssets,
  getCustomerAsset,
  mutateCustomerAssets,
  getLabel,
  getBiddingStrategy,
  mutateBiddingStrategies,
  mutatePortfolioBiddingStrategies,
  getConversionActionTagSnippets,
} from "../src/g1";
import assetGet from "../fixtures/asset_get.json";
import assetsList from "../fixtures/assets_list.json";
import mutateAssetsFixture from "../fixtures/mutate_assets.json";
import calloutCreate from "../fixtures/callout_asset_create.json";
import campaignAssetGet from "../fixtures/campaign_asset_get.json";
import mutateCampaignAssetsFixture from "../fixtures/mutate_campaign_assets.json";
import adGroupAssetGet from "../fixtures/ad_group_asset_get.json";
import mutateAdGroupAssetsFixture from "../fixtures/mutate_ad_group_assets.json";
import customerAssetGet from "../fixtures/customer_asset_get.json";
import mutateCustomerAssetsFixture from "../fixtures/mutate_customer_assets.json";
import labelGet from "../fixtures/label_get.json";
import biddingStrategyGet from "../fixtures/bidding_strategy_get.json";
import mutateBiddingStrategiesFixture from "../fixtures/mutate_bidding_strategies.json";
import mutatePortfolioBiddingStrategiesFixture from "../fixtures/mutate_portfolio_bidding_strategies.json";
import tagSnippetsGet from "../fixtures/conversion_action_tag_snippets_get.json";
import { GOOGLE_ADS_API_VERSION, GOOGLE_ADS_BASE_URL } from "../src/http";

function createMockFetch(status: number, body: unknown) {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
    );
}

function createCaptureFetch(status: number, body: unknown, seen: { url: string; init?: RequestInit }[]) {
  return (url: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(url), init });
    return Promise.resolve(
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
    );
  };
}

const liveAuth = {
  accessToken: "test-token",
  developerToken: "dev-token",
  customerId: "1234567890",
};

describe("Ads G1 assets", () => {
  it("validates assets.get / list / mutate / callout.create", () => {
    expect((getAsset({ customerId: "1", assetId: "5" }) as any).action).toBe("assets.get");
    expect((listAssets({ customerId: "1" }) as any).action).toBe("assets.list");
    expect(
      (mutateAssets({ customerId: "1", operations: [{ create: { type: "CALLOUT" } }] }) as any).action,
    ).toBe("assets.mutate");
    expect(
      (createCalloutAsset({ customerId: "1", calloutText: "Free shipping" }) as any).action,
    ).toBe("assets.callout.create");
    expect(() => mutateAssets({ customerId: "1" })).toThrow("operations is required");
    expect(() => createCalloutAsset({ customerId: "1" })).toThrow("calloutText is required");
  });

  it("live assets.get hits v25 googleAds:search", async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const result = (await getAsset({
      ...liveAuth,
      assetId: "5555555555",
      fetch: createCaptureFetch(200, assetGet, seen),
    })) as any;
    expect(result.asset.id).toBe("gads-asset:5555555555");
    expect(seen[0]!.url).toContain(`${GOOGLE_ADS_BASE_URL}/customers/1234567890/googleAds:search`);
    const body = JSON.parse(String(seen[0]!.init?.body));
    expect(body.query).toContain("FROM asset");
    expect(body.query).not.toContain("segments.click_type");
  });

  it("live assets.list is an action with pageToken", async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const result = (await listAssets({
      ...liveAuth,
      pageToken: "page-1",
      fetch: createCaptureFetch(200, assetsList, seen),
    })) as any;
    expect(result.assets).toHaveLength(2);
    expect(result.nextPageToken).toBe("page-2");
    const body = JSON.parse(String(seen[0]!.init?.body));
    expect(body.pageToken).toBe("page-1");
    expect(body.query).not.toContain("segments.click_type");
  });

  it("live assets.mutate posts /assets:mutate", async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const result = (await mutateAssets({
      ...liveAuth,
      operations: [{ create: { type: "CALLOUT", calloutAsset: { calloutText: "Hi" } } }],
      fetch: createCaptureFetch(200, mutateAssetsFixture, seen),
    })) as any;
    expect(result.resourceNames[0]).toContain("/assets/");
    expect(seen[0]!.url).toContain("/v25/customers/1234567890/assets:mutate");
  });

  it("live assets.callout.create wraps calloutText and surfaces upstream errors", async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const result = (await createCalloutAsset({
      ...liveAuth,
      calloutText: "Free shipping",
      name: "Ship",
      fetch: createCaptureFetch(200, calloutCreate, seen),
    })) as any;
    expect(result.asset.calloutText).toBe("Free shipping");
    expect(result.asset.id).toBe("gads-asset:5555555557");
    const body = JSON.parse(String(seen[0]!.init?.body));
    expect(body.operations[0].create.calloutAsset.calloutText).toBe("Free shipping");
    expect(body.operations[0].create.type).toBe("CALLOUT");

    try {
      await createCalloutAsset({
        ...liveAuth,
        calloutText: "x".repeat(50),
        fetch: createMockFetch(400, {
          error: { code: 400, message: "callout text too long", status: "INVALID_ARGUMENT" },
        }),
      });
      throw new Error("expected createCalloutAsset to throw");
    } catch (err: any) {
      expect(err.code).toBe("CONNECTOR_UPSTREAM_ERROR");
    }
  });
});

describe("Ads G1 asset links", () => {
  it("campaign/ad_group/customer asset gets omit segments.click_type", async () => {
    for (const [fn, fixture, action, extra] of [
      [
        getCampaignAsset,
        campaignAssetGet,
        "campaign_assets.get",
        { campaignId: "1111111111", assetId: "5555555555", fieldType: "CALLOUT" },
      ],
      [
        getAdGroupAsset,
        adGroupAssetGet,
        "ad_group_assets.get",
        { adGroupId: "2222222222", assetId: "5555555555", fieldType: "CALLOUT" },
      ],
      [
        getCustomerAsset,
        customerAssetGet,
        "customer_assets.get",
        { assetId: "5555555555", fieldType: "CALLOUT" },
      ],
    ] as const) {
      const seen: { url: string; init?: RequestInit }[] = [];
      const result = (await (fn as any)({
        ...liveAuth,
        ...extra,
        fetch: createCaptureFetch(200, fixture, seen),
      })) as any;
      expect(result.action).toBe(action);
      expect(seen[0]!.url).toContain("/v25/");
      const body = JSON.parse(String(seen[0]!.init?.body));
      expect(body.query).not.toContain("segments.click_type");
    }
  });

  it("asset-link mutates hit typed :mutate paths", async () => {
    const cases = [
      [mutateCampaignAssets, mutateCampaignAssetsFixture, "/campaignAssets:mutate"],
      [mutateAdGroupAssets, mutateAdGroupAssetsFixture, "/adGroupAssets:mutate"],
      [mutateCustomerAssets, mutateCustomerAssetsFixture, "/customerAssets:mutate"],
    ] as const;
    for (const [fn, fixture, suffix] of cases) {
      const seen: { url: string; init?: RequestInit }[] = [];
      const result = (await (fn as any)({
        ...liveAuth,
        operations: [{ create: {} }],
        fetch: createCaptureFetch(200, fixture, seen),
      })) as any;
      expect(result.resourceNames.length).toBe(1);
      expect(seen[0]!.url).toBe(`${GOOGLE_ADS_BASE_URL}/customers/1234567890${suffix}`);
    }
  });
});

describe("Ads G1 labels / bidding / tag snippets", () => {
  it("labels.get and bidding_strategies.get via GAQL", async () => {
    const label = (await getLabel({
      ...liveAuth,
      labelId: "7777777777",
      fetch: createMockFetch(200, labelGet),
    })) as any;
    expect(label.label.id).toBe("gads-label:7777777777");

    const strategy = (await getBiddingStrategy({
      ...liveAuth,
      biddingStrategyId: "8888888888",
      fetch: createMockFetch(200, biddingStrategyGet),
    })) as any;
    expect(strategy.biddingStrategy.type).toBe("TARGET_CPA");
  });

  it("bidding mutates share biddingStrategies:mutate", async () => {
    for (const [fn, fixture] of [
      [mutateBiddingStrategies, mutateBiddingStrategiesFixture],
      [mutatePortfolioBiddingStrategies, mutatePortfolioBiddingStrategiesFixture],
    ] as const) {
      const seen: { url: string; init?: RequestInit }[] = [];
      await (fn as any)({
        ...liveAuth,
        operations: [{ create: { type: "TARGET_CPA" } }],
        fetch: createCaptureFetch(200, fixture, seen),
      });
      expect(seen[0]!.url).toContain("/v25/customers/1234567890/biddingStrategies:mutate");
    }
  });

  it("conversion_actions.tag_snippets.get returns tagSnippets", async () => {
    const result = (await getConversionActionTagSnippets({
      ...liveAuth,
      conversionActionId: "3333333333",
      fetch: createMockFetch(200, tagSnippetsGet),
    })) as any;
    expect(result.tagSnippets).toHaveLength(1);
    expect(result.tagSnippets[0].type).toBe("WEBPAGE");
  });
});

describe("Ads G1 API version pin", () => {
  it("stays on v25 only", () => {
    expect(GOOGLE_ADS_API_VERSION).toBe("v25");
    expect(GOOGLE_ADS_BASE_URL).toBe("https://googleads.googleapis.com/v25");
  });
});
