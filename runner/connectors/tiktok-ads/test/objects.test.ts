import { describe, expect, it } from "bun:test";
import {
  normalizeCampaign,
  parseCampaignsResponse,
  normalizeAdGroup,
  parseAdGroupsResponse,
  normalizeAd,
  parseAdsResponse,
  normalizeAdvertiser,
  parseAdvertisersResponse,
  normalizePixel,
  parsePixelsResponse,
  parseAnalyticsResponse,
} from "../src/objects";
import campaignsFixture from "../fixtures/campaigns.json";
import campaignsPagedFixture from "../fixtures/campaigns_paged.json";
import adGroupsFixture from "../fixtures/ad_groups.json";
import adsFixture from "../fixtures/ads.json";
import advertisersFixture from "../fixtures/advertisers_list.json";
import pixelsFixture from "../fixtures/pixels_list.json";
import analyticsFixture from "../fixtures/analytics_report.json";

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

describe("normalizeCampaign", () => {
  const raw1 = campaignsFixture.data.list[0] as any;

  it("maps all campaign fields", () => {
    const c = normalizeCampaign(raw1);
    expect(c.id).toBe("tt-campaign:1234567890");
    expect(c.provider).toBe("tiktok-ads");
    expect(c.name).toBe("Summer Sale 2025");
    expect(c.status).toBe("ENABLE");
    expect(c.objective).toBe("CONVERSIONS");
    expect(c.budget).toBe(50000);
    expect(c.budgetMode).toBe("BUDGET_MODE_DAY");
    expect(c.optimizationGoal).toBe("CONVERSIONS");
    expect(c.startDate).toBe("2025-06-01 00:00:00");
    expect(c.endDate).toBe("2025-06-30 23:59:59");
    expect(c.createdTime).toBe("2025-05-15 10:30:00");
    expect(c.modifiedTime).toBe("2025-05-20 14:22:00");
  });

  it("stores raw object", () => {
    const c = normalizeCampaign(raw1);
    expect(c.raw).toBe(raw1);
  });

  it("handles missing fields", () => {
    const c = normalizeCampaign({});
    expect(c.id).toBe("tt-campaign:");
    expect(c.name).toBe("");
    expect(c.status).toBe("");
    expect(c.objective).toBe("");
    expect(c.budget).toBe(0);
    expect(c.budgetMode).toBe("");
    expect(c.optimizationGoal).toBe("");
    expect(c.startDate).toBe("");
    expect(c.endDate).toBe("");
    expect(c.createdTime).toBe("");
    expect(c.modifiedTime).toBe("");
  });
});

describe("parseCampaignsResponse", () => {
  it("parses campaigns from full API response", () => {
    const result = parseCampaignsResponse(campaignsFixture);
    expect(result.campaigns).toHaveLength(3);
    expect(result.nextPage).toBeNull();
    expect(result.totalCount).toBe(3);
  });

  it("returns nextPage when more pages exist", () => {
    const result = parseCampaignsResponse(campaignsPagedFixture);
    expect(result.campaigns).toHaveLength(1);
    expect(result.nextPage).toBe(2);
    expect(result.totalCount).toBe(15);
  });

  it("handles null input", () => {
    const result = parseCampaignsResponse(null);
    expect(result.campaigns).toHaveLength(0);
    expect(result.nextPage).toBeNull();
    expect(result.totalCount).toBe(0);
  });

  it("handles non-object input", () => {
    const result = parseCampaignsResponse("not-json");
    expect(result.campaigns).toHaveLength(0);
  });

  it("handles error response (code !== 0)", () => {
    const result = parseCampaignsResponse({ code: 400, message: "Bad Request" });
    expect(result.campaigns).toHaveLength(0);
  });

  it("handles missing data.list", () => {
    const result = parseCampaignsResponse({ code: 0, message: "OK", data: {} });
    expect(result.campaigns).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Ad Groups
// ---------------------------------------------------------------------------

describe("normalizeAdGroup", () => {
  const raw1 = adGroupsFixture.data.list[0] as any;

  it("maps all ad group fields", () => {
    const g = normalizeAdGroup(raw1);
    expect(g.id).toBe("tt-adgroup:1122334455");
    expect(g.provider).toBe("tiktok-ads");
    expect(g.campaignId).toBe("1234567890");
    expect(g.name).toBe("Summer Sale - Women 25-34");
    expect(g.status).toBe("ENABLE");
    expect(g.placement).toBe("PLACEMENT_TIKTOK");
    expect(g.budget).toBe(15000);
    expect(g.bidType).toBe("BID_TYPE_CPC");
    expect(g.createdTime).toBe("2025-05-15 11:00:00");
  });

  it("stores raw object", () => {
    const g = normalizeAdGroup(raw1);
    expect(g.raw).toBe(raw1);
  });

  it("handles missing fields", () => {
    const g = normalizeAdGroup({});
    expect(g.id).toBe("tt-adgroup:");
    expect(g.campaignId).toBe("");
    expect(g.name).toBe("");
    expect(g.status).toBe("");
    expect(g.placement).toBe("");
    expect(g.budget).toBe(0);
    expect(g.bidType).toBe("");
    expect(g.createdTime).toBe("");
  });
});

describe("parseAdGroupsResponse", () => {
  it("parses ad groups from full API response", () => {
    const result = parseAdGroupsResponse(adGroupsFixture);
    expect(result.adGroups).toHaveLength(3);
    expect(result.nextPage).toBeNull();
    expect(result.totalCount).toBe(3);
  });

  it("handles null input", () => {
    const result = parseAdGroupsResponse(null);
    expect(result.adGroups).toHaveLength(0);
    expect(result.nextPage).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Ads
// ---------------------------------------------------------------------------

describe("normalizeAd", () => {
  const raw1 = adsFixture.data.list[0] as any;

  it("maps all ad fields", () => {
    const a = normalizeAd(raw1);
    expect(a.id).toBe("tt-ad:4455667788");
    expect(a.provider).toBe("tiktok-ads");
    expect(a.adGroupId).toBe("1122334455");
    expect(a.name).toBe("Summer Sale - Video Ad 1");
    expect(a.status).toBe("AD_STATUS_DELIVERY_OK");
    expect(a.adFormat).toBe("VIDEO");
    expect(a.creativeType).toBe("SINGLE_VIDEO");
    expect(a.createdTime).toBe("2025-05-15 12:00:00");
  });

  it("stores raw object", () => {
    const a = normalizeAd(raw1);
    expect(a.raw).toBe(raw1);
  });

  it("handles missing fields", () => {
    const a = normalizeAd({});
    expect(a.id).toBe("tt-ad:");
    expect(a.adGroupId).toBe("");
    expect(a.name).toBe("");
    expect(a.status).toBe("");
    expect(a.adFormat).toBe("");
    expect(a.creativeType).toBe("");
    expect(a.createdTime).toBe("");
  });
});

describe("parseAdsResponse", () => {
  it("parses ads from full API response", () => {
    const result = parseAdsResponse(adsFixture);
    expect(result.ads).toHaveLength(3);
    expect(result.nextPage).toBeNull();
    expect(result.totalCount).toBe(3);
  });

  it("handles null input", () => {
    const result = parseAdsResponse(null);
    expect(result.ads).toHaveLength(0);
    expect(result.nextPage).toBeNull();
  });
});


// ---------------------------------------------------------------------------
// Advertisers / Pixels / Analytics
// ---------------------------------------------------------------------------

describe("normalizeAdvertiser", () => {
  it("maps advertiser fields", () => {
    const a = normalizeAdvertiser(advertisersFixture.data.list[0] as any);
    expect(a.id).toBe("tt-advertiser:6987654321098765432");
    expect(a.name).toBe("Acme Commerce US");
    expect(a.currency).toBe("USD");
  });
});

describe("parseAdvertisersResponse", () => {
  it("parses advertisers list", () => {
    const result = parseAdvertisersResponse(advertisersFixture);
    expect(result.advertisers).toHaveLength(2);
  });
});

describe("normalizePixel", () => {
  it("maps pixel fields", () => {
    const px = normalizePixel(pixelsFixture.data.list[0] as any);
    expect(px.id).toBe("tt-pixel:7001122334455667788");
    expect(px.name).toBe("Acme Web Pixel");
    expect(px.code).toBe("CABCDEFG");
  });
});

describe("parsePixelsResponse", () => {
  it("parses pixels list", () => {
    const result = parsePixelsResponse(pixelsFixture);
    expect(result.pixels).toHaveLength(2);
    expect(result.totalCount).toBe(2);
  });
});

describe("parseAnalyticsResponse", () => {
  it("parses integrated report rows", () => {
    const result = parseAnalyticsResponse(analyticsFixture);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].impressions).toBe(54000);
    expect(result.rows[0].spend).toBe(1250.5);
  });
});
