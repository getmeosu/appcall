import { describe, expect, test } from "bun:test";
import {
  executeCampaignsListSync,
  executeAdGroupsListSync,
  executeAdsListSync,
} from "../src/sync";
import campaignsList from "../fixtures/campaigns_list.json";
import adGroupsList from "../fixtures/ad_groups_list.json";
import adsList from "../fixtures/ads_list.json";

describe("campaigns.list sync", () => {
  test("returns normalized campaigns with page token", () => {
    const result = executeCampaignsListSync({ response: campaignsList });

    expect(result.provider).toBe("google-ads");
    expect(result.operation).toBe("campaigns.list");
    expect(result.items).toHaveLength(3);
    expect(result.items[0].id).toBe("gads-campaign:1111111111");
    expect(result.items[0].name).toBe("Summer Sale 2024");
    expect(result.items[0].status).toBe("ENABLED");
    expect(result.items[0].budget).toBe(5000);
    expect(result.items[0].biddingStrategy).toBe("MAXIMIZE_CLICKS");
    expect(result.items[0].metrics.impressions).toBe(125430);
    expect(result.items[0].metrics.clicks).toBe(3842);
    expect(result.items[0].metrics.cost).toBe(19210);
    expect(result.nextPageToken).toBe("CjsKBRgAIAE");
  });

  test("returns no page token on last page", () => {
    const result = executeCampaignsListSync({ response: { ...campaignsList, nextPageToken: "" } });
    expect(result.items).toHaveLength(3);
    expect(result.nextPageToken).toBeNull();
  });

  test("throws on non-object response", () => {
    expect(() => executeCampaignsListSync({ response: "not an object" })).toThrow("response must be an object");
  });

  test("throws on array response", () => {
    expect(() => executeCampaignsListSync({ response: [1, 2] })).toThrow("response must be an object");
  });

  test("handles empty results", () => {
    const result = executeCampaignsListSync({ response: { results: [] } });
    expect(result.items).toHaveLength(0);
    expect(result.nextPageToken).toBeNull();
  });
});

describe("ad_groups.list sync", () => {
  test("returns normalized ad groups with page token", () => {
    const result = executeAdGroupsListSync({ response: adGroupsList });

    expect(result.provider).toBe("google-ads");
    expect(result.operation).toBe("ad_groups.list");
    expect(result.items).toHaveLength(3);
    expect(result.items[0].id).toBe("gads-adgroup:7777777777");
    expect(result.items[0].name).toBe("Search - General Keywords");
    expect(result.items[0].campaignId).toBe("1111111111");
    expect(result.items[0].type).toBe("SEARCH_STANDARD");
    expect(result.items[0].cpcBid).toBe(2.5);
    expect(result.items[0].metrics.impressions).toBe(45200);
    expect(result.nextPageToken).toBe("DjsKBxgCIBc");
  });

  test("throws on non-object response", () => {
    expect(() => executeAdGroupsListSync({ response: null })).toThrow("response must be an object");
  });

  test("handles empty results", () => {
    const result = executeAdGroupsListSync({ response: { results: [] } });
    expect(result.items).toHaveLength(0);
    expect(result.nextPageToken).toBeNull();
  });
});

describe("ads.list sync", () => {
  test("returns normalized ads with page token", () => {
    const result = executeAdsListSync({ response: adsList });

    expect(result.provider).toBe("google-ads");
    expect(result.operation).toBe("ads.list");
    expect(result.items).toHaveLength(4);
    expect(result.items[0].id).toBe("gads-ad:1010101010");
    expect(result.items[0].name).toBe("Search Ad - Summer Headline");
    expect(result.items[0].adGroupId).toBe("7777777777");
    expect(result.items[0].type).toBe("EXPANDED_TEXT_AD");
    expect(result.items[0].headline).toBe("Summer Sale - Up to 50% Off");
    expect(result.items[0].finalUrls).toEqual(["https://www.example.com/summer-sale"]);
    expect(result.nextPageToken).toBe("EjsKBxgDIB0");
  });

  test("handles ad with multiple final URLs", () => {
    const result = executeAdsListSync({ response: adsList });
    const shoppingAd = result.items[2];
    expect(shoppingAd.finalUrls).toEqual([
      "https://www.example.com/electronics",
      "https://www.example.com/deals",
    ]);
  });

  test("throws on non-object response", () => {
    expect(() => executeAdsListSync({ response: null })).toThrow("response must be an object");
  });

  test("handles empty results", () => {
    const result = executeAdsListSync({ response: { results: [] } });
    expect(result.items).toHaveLength(0);
    expect(result.nextPageToken).toBeNull();
  });
});
