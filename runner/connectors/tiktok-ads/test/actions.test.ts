import { describe, expect, it } from "bun:test";
import {
  getAnalyticsReport,
  listAdvertisers,
  getCampaign,
  getAdGroup,
  getAd,
  listPixels,
} from "../src/actions";
import advertisersList from "../fixtures/advertisers_list.json";
import campaignGet from "../fixtures/campaign_get.json";
import adGroupGet from "../fixtures/ad_group_get.json";
import adGet from "../fixtures/ad_get.json";
import pixelsList from "../fixtures/pixels_list.json";
import analyticsReport from "../fixtures/analytics_report.json";

function createMockFetch(status: number, body: unknown) {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
}

const liveAuth = { accessToken: "test-token" };

describe("analytics.report.get", () => {
  it("requires advertiserId, dataLevel, and dates", () => {
    expect(() => getAnalyticsReport({})).toThrow("advertiserId is required");
    expect(() =>
      getAnalyticsReport({ advertiserId: "6987654321098765432", startDate: "2025-06-01", endDate: "2025-06-30" }),
    ).toThrow("dataLevel is required");
  });

  it("rejects unknown dataLevel", () => {
    expect(() =>
      getAnalyticsReport({
        advertiserId: "6987654321098765432",
        dataLevel: "NOPE",
        startDate: "2025-06-01",
        endDate: "2025-06-30",
      }),
    ).toThrow("dataLevel must be one of");
  });

  it("validates without credentials", () => {
    const result = getAnalyticsReport({
      advertiserId: "6987654321098765432",
      reportType: "BASIC",
      dataLevel: "AUCTION_CAMPAIGN",
      startDate: "2025-06-01",
      endDate: "2025-06-30",
      dimensions: ["campaign_id", "stat_time_day"],
      metrics: ["spend", "impressions", "clicks"],
    }) as any;
    expect(result.connector).toBe("tiktok-ads");
    expect(result.action).toBe("analytics.report.get");
    expect(result.validated.advertiserId).toBe("6987654321098765432");
    expect(result.validated.dataLevel).toBe("AUCTION_CAMPAIGN");
    expect(result.validated.startDate).toBe("2025-06-01");
  });

  it("fetches report live with mocked fetch", async () => {
    const result = (await getAnalyticsReport({
      ...liveAuth,
      advertiserId: "6987654321098765432",
      dataLevel: "AUCTION_CAMPAIGN",
      startDate: "2025-06-01",
      endDate: "2025-06-30",
      dimensions: ["campaign_id", "stat_time_day"],
      metrics: ["spend", "impressions", "clicks"],
      fetch: createMockFetch(200, analyticsReport),
    })) as any;
    expect(result.rows).toHaveLength(2);
    expect(result.rowCount).toBe(2);
    expect(result.rows[0].impressions).toBe(54000);
    expect(result.rows[0].clicks).toBe(1800);
    expect(result.rows[0].spend).toBe(1250.5);
    expect(result.rows[0].dimensions.campaign_id).toBe("1234567890");
  });
});

describe("advertisers.list", () => {
  it("validates without credentials and without advertiserId", () => {
    const result = listAdvertisers({}) as any;
    expect(result.connector).toBe("tiktok-ads");
    expect(result.action).toBe("advertisers.list");
    expect(result.validated).toEqual({});
  });

  it("accepts optional advertiserIds", () => {
    const result = listAdvertisers({ advertiserIds: ["6987654321098765432"] }) as any;
    expect(result.validated.advertiserIds).toEqual(["6987654321098765432"]);
  });

  it("lists advertisers live with mocked fetch", async () => {
    const result = (await listAdvertisers({
      ...liveAuth,
      fetch: createMockFetch(200, advertisersList),
    })) as any;
    expect(result.advertisers).toHaveLength(2);
    expect(result.advertisers[0].id).toBe("tt-advertiser:6987654321098765432");
    expect(result.advertisers[0].name).toBe("Acme Commerce US");
    expect(result.advertisers[0].currency).toBe("USD");
    expect(result.totalCount).toBe(2);
  });
});

describe("campaigns.get", () => {
  it("requires advertiserId and campaignId", () => {
    expect(() => getCampaign({})).toThrow("advertiserId is required");
    expect(() => getCampaign({ advertiserId: "6987654321098765432" })).toThrow("campaignId is required");
  });

  it("validates without credentials", () => {
    const result = getCampaign({ advertiserId: "6987654321098765432", campaignId: "1234567890" }) as any;
    expect(result.action).toBe("campaigns.get");
    expect(result.validated.campaignId).toBe("1234567890");
  });

  it("fetches campaign live with mocked fetch", async () => {
    const result = (await getCampaign({
      ...liveAuth,
      advertiserId: "6987654321098765432",
      campaignId: "1234567890",
      fetch: createMockFetch(200, campaignGet),
    })) as any;
    expect(result.campaign.id).toBe("tt-campaign:1234567890");
    expect(result.campaign.name).toBe("Summer Sale 2025");
    expect(result.campaign.status).toBe("ENABLE");
    expect(result.campaign.budget).toBe(50000);
  });
});

describe("ad_groups.get", () => {
  it("requires advertiserId and adGroupId", () => {
    expect(() => getAdGroup({})).toThrow("advertiserId is required");
    expect(() => getAdGroup({ advertiserId: "6987654321098765432" })).toThrow("adGroupId is required");
  });

  it("validates without credentials", () => {
    const result = getAdGroup({ advertiserId: "6987654321098765432", adGroupId: "1122334455" }) as any;
    expect(result.action).toBe("ad_groups.get");
    expect(result.validated.adGroupId).toBe("1122334455");
  });

  it("fetches ad group live with mocked fetch", async () => {
    const result = (await getAdGroup({
      ...liveAuth,
      advertiserId: "6987654321098765432",
      adGroupId: "1122334455",
      fetch: createMockFetch(200, adGroupGet),
    })) as any;
    expect(result.adGroup.id).toBe("tt-adgroup:1122334455");
    expect(result.adGroup.name).toBe("Summer Sale - Women 25-34");
    expect(result.adGroup.campaignId).toBe("1234567890");
  });
});

describe("ads.get", () => {
  it("requires advertiserId and adId", () => {
    expect(() => getAd({})).toThrow("advertiserId is required");
    expect(() => getAd({ advertiserId: "6987654321098765432" })).toThrow("adId is required");
  });

  it("validates without credentials", () => {
    const result = getAd({ advertiserId: "6987654321098765432", adId: "4455667788" }) as any;
    expect(result.action).toBe("ads.get");
    expect(result.validated.adId).toBe("4455667788");
  });

  it("fetches ad live with mocked fetch", async () => {
    const result = (await getAd({
      ...liveAuth,
      advertiserId: "6987654321098765432",
      adId: "4455667788",
      fetch: createMockFetch(200, adGet),
    })) as any;
    expect(result.ad.id).toBe("tt-ad:4455667788");
    expect(result.ad.name).toBe("Summer Sale - Video Ad 1");
    expect(result.ad.adFormat).toBe("VIDEO");
  });
});

describe("pixels.list", () => {
  it("requires advertiserId", () => {
    expect(() => listPixels({})).toThrow("advertiserId is required");
  });

  it("validates without credentials", () => {
    const result = listPixels({ advertiserId: "6987654321098765432", page: 1, pageSize: 10 }) as any;
    expect(result.action).toBe("pixels.list");
    expect(result.validated.advertiserId).toBe("6987654321098765432");
    expect(result.validated.page).toBe(1);
  });

  it("lists pixels live with mocked fetch", async () => {
    const result = (await listPixels({
      ...liveAuth,
      advertiserId: "6987654321098765432",
      fetch: createMockFetch(200, pixelsList),
    })) as any;
    expect(result.pixels).toHaveLength(2);
    expect(result.pixels[0].id).toBe("tt-pixel:7001122334455667788");
    expect(result.pixels[0].name).toBe("Acme Web Pixel");
    expect(result.pixels[0].code).toBe("CABCDEFG");
    expect(result.totalCount).toBe(2);
  });
});
