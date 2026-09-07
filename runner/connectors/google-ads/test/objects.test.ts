import { describe, expect, test } from "bun:test";
import {
  normalizeCampaign,
  parseCampaignsResponse,
  normalizeAdGroup,
  parseAdGroupsResponse,
  normalizeAd,
  parseAdsResponse,
} from "../src/objects";
import campaignsList from "../fixtures/campaigns_list.json";
import adGroupsList from "../fixtures/ad_groups_list.json";
import adsList from "../fixtures/ads_list.json";

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

describe("normalizeCampaign", () => {
  const raw = campaignsList.results[0] as any;

  test("maps all campaign fields", () => {
    const c = normalizeCampaign(raw);
    expect(c.id).toBe("gads-campaign:1111111111");
    expect(c.provider).toBe("google-ads");
    expect(c.name).toBe("Summer Sale 2024");
    expect(c.status).toBe("ENABLED");
    expect(c.budget).toBe(5000);
    expect(c.biddingStrategy).toBe("MAXIMIZE_CLICKS");
    expect(c.startDate).toBe("20240601");
    expect(c.endDate).toBe("20240831");
  });

  test("maps campaign metrics from micros", () => {
    const c = normalizeCampaign(raw);
    expect(c.metrics.impressions).toBe(125430);
    expect(c.metrics.clicks).toBe(3842);
    expect(c.metrics.cost).toBe(19210);
  });

  test("handles paused campaign", () => {
    const paused = campaignsList.results[2] as any;
    const c = normalizeCampaign(paused);
    expect(c.status).toBe("PAUSED");
    expect(c.name).toBe("Holiday Promo - Paused");
  });

  test("stores raw object", () => {
    const c = normalizeCampaign(raw);
    expect(c.raw).toBe(raw);
  });

  test("handles missing budget and metrics gracefully", () => {
    const minimal = { campaign: { resource_name: "customers/1/campaigns/9", id: "9", name: "Test", status: "ENABLED" } };
    const c = normalizeCampaign(minimal);
    expect(c.id).toBe("gads-campaign:9");
    expect(c.budget).toBe(0);
    expect(c.biddingStrategy).toBe("");
    expect(c.metrics.impressions).toBe(0);
    expect(c.metrics.clicks).toBe(0);
    expect(c.metrics.cost).toBe(0);
  });
});

describe("parseCampaignsResponse", () => {
  test("parses campaigns and returns next page token", () => {
    const result = parseCampaignsResponse(campaignsList);
    expect(result.campaigns).toHaveLength(3);
    expect(result.nextPageToken).toBe("CjsKBRgAIAE");
  });

  test("returns empty when no results", () => {
    const result = parseCampaignsResponse({ results: [] });
    expect(result.campaigns).toHaveLength(0);
    expect(result.nextPageToken).toBeNull();
  });

  test("handles null input", () => {
    const result = parseCampaignsResponse(null);
    expect(result.campaigns).toHaveLength(0);
    expect(result.nextPageToken).toBeNull();
  });

  test("handles non-object input", () => {
    const result = parseCampaignsResponse("not an object");
    expect(result.campaigns).toHaveLength(0);
    expect(result.nextPageToken).toBeNull();
  });

  test("handles missing results field", () => {
    const result = parseCampaignsResponse({ totalResultsCount: "0" });
    expect(result.campaigns).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Ad Groups
// ---------------------------------------------------------------------------

describe("normalizeAdGroup", () => {
  const raw = adGroupsList.results[0] as any;

  test("maps all ad group fields", () => {
    const ag = normalizeAdGroup(raw);
    expect(ag.id).toBe("gads-adgroup:7777777777");
    expect(ag.provider).toBe("google-ads");
    expect(ag.campaignId).toBe("1111111111");
    expect(ag.name).toBe("Search - General Keywords");
    expect(ag.status).toBe("ENABLED");
    expect(ag.type).toBe("SEARCH_STANDARD");
    expect(ag.cpcBid).toBe(2.5);
  });

  test("maps ad group metrics from micros", () => {
    const ag = normalizeAdGroup(raw);
    expect(ag.metrics.impressions).toBe(45200);
    expect(ag.metrics.clicks).toBe(1890);
    expect(ag.metrics.cost).toBe(4725);
  });

  test("handles removed ad group", () => {
    const removed = adGroupsList.results[2] as any;
    const ag = normalizeAdGroup(removed);
    expect(ag.status).toBe("REMOVED");
    expect(ag.type).toBe("SHOPPING_PRODUCT_ADS");
  });

  test("stores raw object", () => {
    const ag = normalizeAdGroup(raw);
    expect(ag.raw).toBe(raw);
  });

  test("handles missing optional fields gracefully", () => {
    const minimal = { ad_group: { resource_name: "customers/1/adGroups/9", id: "9", name: "Test", status: "ENABLED", type: "SEARCH_STANDARD", campaign: "customers/1/campaigns/1" } };
    const ag = normalizeAdGroup(minimal);
    expect(ag.id).toBe("gads-adgroup:9");
    expect(ag.cpcBid).toBe(0);
    expect(ag.metrics.impressions).toBe(0);
  });
});

describe("parseAdGroupsResponse", () => {
  test("parses ad groups and returns next page token", () => {
    const result = parseAdGroupsResponse(adGroupsList);
    expect(result.adGroups).toHaveLength(3);
    expect(result.nextPageToken).toBe("DjsKBxgCIBc");
  });

  test("returns empty when no results", () => {
    const result = parseAdGroupsResponse({ results: [] });
    expect(result.adGroups).toHaveLength(0);
    expect(result.nextPageToken).toBeNull();
  });

  test("handles null input", () => {
    const result = parseAdGroupsResponse(null);
    expect(result.adGroups).toHaveLength(0);
    expect(result.nextPageToken).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Ads
// ---------------------------------------------------------------------------

describe("normalizeAd", () => {
  const raw = adsList.results[0] as any;

  test("maps all ad fields", () => {
    const ad = normalizeAd(raw);
    expect(ad.id).toBe("gads-ad:1010101010");
    expect(ad.provider).toBe("google-ads");
    expect(ad.adGroupId).toBe("7777777777");
    expect(ad.name).toBe("Search Ad - Summer Headline");
    expect(ad.status).toBe("ENABLED");
    expect(ad.type).toBe("EXPANDED_TEXT_AD");
    expect(ad.headline).toBe("Summer Sale - Up to 50% Off");
    expect(ad.description).toBe("Shop our biggest summer deals on all products. Free shipping on orders over $50.");
    expect(ad.finalUrls).toEqual(["https://www.example.com/summer-sale"]);
  });

  test("handles multiple final URLs", () => {
    const multiUrl = adsList.results[2] as any;
    const ad = normalizeAd(multiUrl);
    expect(ad.finalUrls).toEqual([
      "https://www.example.com/electronics",
      "https://www.example.com/deals",
    ]);
  });

  test("handles paused ad", () => {
    const paused = adsList.results[2] as any;
    const ad = normalizeAd(paused);
    expect(ad.status).toBe("PAUSED");
  });

  test("stores raw object", () => {
    const ad = normalizeAd(raw);
    expect(ad.raw).toBe(raw);
  });

  test("handles missing optional fields gracefully", () => {
    const minimal = { ad: { resource_name: "customers/1/ads/9", id: "9", status: "ENABLED", type: "TEXT_AD", ad_group: "customers/1/adGroups/1" } };
    const ad = normalizeAd(minimal);
    expect(ad.id).toBe("gads-ad:9");
    expect(ad.name).toBe("");
    expect(ad.headline).toBe("");
    expect(ad.description).toBe("");
    expect(ad.finalUrls).toEqual([]);
  });

  test("filters non-string final URLs", () => {
    const withBadUrls = {
      ad: {
        resource_name: "customers/1/ads/9",
        id: "9",
        status: "ENABLED",
        type: "TEXT_AD",
        ad_group: "customers/1/adGroups/1",
        final_urls: ["https://example.com", 123, null, "https://other.com"],
      },
    };
    const ad = normalizeAd(withBadUrls as any);
    expect(ad.finalUrls).toEqual(["https://example.com", "https://other.com"]);
  });
});

describe("parseAdsResponse", () => {
  test("parses ads and returns next page token", () => {
    const result = parseAdsResponse(adsList);
    expect(result.ads).toHaveLength(4);
    expect(result.nextPageToken).toBe("EjsKBxgDIB0");
  });

  test("returns empty when no results", () => {
    const result = parseAdsResponse({ results: [] });
    expect(result.ads).toHaveLength(0);
    expect(result.nextPageToken).toBeNull();
  });

  test("handles null input", () => {
    const result = parseAdsResponse(null);
    expect(result.ads).toHaveLength(0);
    expect(result.nextPageToken).toBeNull();
  });
});
