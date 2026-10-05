import { describe, expect, test } from "bun:test";
import {
  executeCampaignsListSync,
  executeAdGroupsListSync,
  executeAdsListSync,
  executeKeywordsListSync,
  executeBudgetsListSync,
  executeCustomerListsListSync,
  executeConversionActionsListSync,
} from "../src/sync";
import campaignsList from "../fixtures/campaigns_list.json";
import adGroupsList from "../fixtures/ad_groups_list.json";
import adsList from "../fixtures/ads_list.json";
import keywordsList from "../fixtures/keywords_list.json";
import budgetsList from "../fixtures/budgets_list.json";
import customerLists from "../fixtures/customer_lists_list.json";
import conversionActions from "../fixtures/conversion_actions_list.json";

describe("campaigns.list sync", () => {
  test("maps fixture start_date_time/end_date_time to public startDate/endDate", () => {
    const result = executeCampaignsListSync({ response: campaignsList });
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0]!.startDate).toBe("2024-06-01 00:00:00");
    expect(result.items[0]!.endDate).toBe("2024-08-31 00:00:00");
    // fixture uses v25 field names
    expect(JSON.stringify(campaignsList)).toContain("start_date_time");
    expect(JSON.stringify(campaignsList)).not.toContain('"start_date"');
  });

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

describe("keywords.list sync", () => {
  test("returns normalized keywords", () => {
    const result = executeKeywordsListSync({ response: keywordsList });
    expect(result.operation).toBe("keywords.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].text).toBe("summer sale");
    expect(result.nextPageToken).toBe("KwPage1");
  });
});

describe("budgets.list sync", () => {
  test("returns normalized budgets", () => {
    const result = executeBudgetsListSync({ response: budgetsList });
    expect(result.operation).toBe("budgets.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].amount).toBe(5000);
  });
});

describe("customer_lists.list sync", () => {
  test("returns normalized user lists", () => {
    const result = executeCustomerListsListSync({ response: customerLists });
    expect(result.operation).toBe("customer_lists.list");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe("Newsletter Subscribers");
  });
});

describe("conversion_actions.list sync", () => {
  test("returns normalized conversion actions", () => {
    const result = executeConversionActionsListSync({ response: conversionActions });
    expect(result.operation).toBe("conversion_actions.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].name).toBe("Purchase");
  });
});
