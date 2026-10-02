import { describe, expect, test } from "bun:test";
import {
  normalizeCampaign,
  parseCampaignsResponse,
  normalizeAdGroup,
  parseAdGroupsResponse,
  normalizeAd,
  parseAdsResponse,
  normalizeKeyword,
  parseKeywordsResponse,
  normalizeBudget,
  parseBudgetsResponse,
  normalizeUserList,
  parseUserListsResponse,
  normalizeConversionAction,
  parseConversionActionsResponse,
  normalizeAccessibleCustomer,
  parseAccessibleCustomersResponse,
  normalizeCustomerClient,
  parseCustomerClientsResponse,
  parseMutateResponse,
  aggregateSearchStreamBatches,
} from "../src/objects";
import campaignsList from "../fixtures/campaigns_list.json";
import adGroupsList from "../fixtures/ad_groups_list.json";
import adsList from "../fixtures/ads_list.json";
import keywordsList from "../fixtures/keywords_list.json";
import budgetsList from "../fixtures/budgets_list.json";
import customerLists from "../fixtures/customer_lists_list.json";
import conversionActions from "../fixtures/conversion_actions_list.json";
import accessibleCustomers from "../fixtures/accessible_customers.json";
import subAccounts from "../fixtures/sub_accounts.json";
import mutateCampaigns from "../fixtures/mutate_campaigns.json";
import gaqlSearchStream from "../fixtures/gaql_search_stream.json";

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
    expect(ag.name).toBe("Search - General Keywords");
    expect(ag.campaignId).toBe("1111111111");
    expect(ag.type).toBe("SEARCH_STANDARD");
    expect(ag.cpcBid).toBe(2.5);
  });

  test("maps metrics", () => {
    const ag = normalizeAdGroup(raw);
    expect(ag.metrics.impressions).toBe(45200);
  });

  test("handles missing metrics", () => {
    const minimal = { ad_group: { resource_name: "customers/1/adGroups/9", id: "9", name: "Test", status: "ENABLED", type: "SEARCH_STANDARD", campaign: "customers/1/campaigns/1" } };
    const ag = normalizeAdGroup(minimal);
    expect(ag.metrics.impressions).toBe(0);
  });
});

describe("parseAdGroupsResponse", () => {
  test("parses ad groups", () => {
    const result = parseAdGroupsResponse(adGroupsList);
    expect(result.adGroups).toHaveLength(3);
    expect(result.nextPageToken).toBe("DjsKBxgCIBc");
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
    expect(ad.adGroupId).toBe("7777777777");
    expect(ad.headline).toBe("Summer Sale - Up to 50% Off");
    expect(ad.finalUrls).toEqual(["https://www.example.com/summer-sale"]);
  });

  test("handles missing optional fields", () => {
    const minimal = { ad: { resource_name: "customers/1/ads/9", id: "9", status: "ENABLED", type: "TEXT_AD", ad_group: "customers/1/adGroups/1" } };
    const ad = normalizeAd(minimal);
    expect(ad.name).toBe("");
    expect(ad.finalUrls).toEqual([]);
  });
});

describe("parseAdsResponse", () => {
  test("parses ads", () => {
    const result = parseAdsResponse(adsList);
    expect(result.ads).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// Keywords / Budgets / User lists / Conversion actions
// ---------------------------------------------------------------------------

describe("normalizeKeyword", () => {
  test("maps keyword fields", () => {
    const k = normalizeKeyword(keywordsList.results[0] as any);
    expect(k.id).toBe("gads-keyword:111");
    expect(k.text).toBe("summer sale");
    expect(k.matchType).toBe("BROAD");
    expect(k.adGroupId).toBe("7777777777");
    expect(k.cpcBid).toBe(1.5);
    expect(k.negative).toBe(false);
    expect(k.metrics.impressions).toBe(1000);
  });
});

describe("parseKeywordsResponse", () => {
  test("parses keywords", () => {
    const result = parseKeywordsResponse(keywordsList);
    expect(result.keywords).toHaveLength(2);
    expect(result.nextPageToken).toBe("KwPage1");
  });
});

describe("normalizeBudget", () => {
  test("maps budget fields", () => {
    const b = normalizeBudget(budgetsList.results[0] as any);
    expect(b.id).toBe("gads-budget:2222222222");
    expect(b.name).toBe("Summer Budget");
    expect(b.amount).toBe(5000);
    expect(b.explicitlyShared).toBe(false);
  });

  test("maps shared budget", () => {
    const b = normalizeBudget(budgetsList.results[1] as any);
    expect(b.explicitlyShared).toBe(true);
    expect(b.amount).toBe(10000);
  });
});

describe("parseBudgetsResponse", () => {
  test("parses budgets", () => {
    const result = parseBudgetsResponse(budgetsList);
    expect(result.budgets).toHaveLength(2);
  });
});

describe("normalizeUserList", () => {
  test("maps user list fields", () => {
    const u = normalizeUserList(customerLists.results[0] as any);
    expect(u.id).toBe("gads-userlist:555");
    expect(u.name).toBe("Newsletter Subscribers");
    expect(u.sizeForDisplay).toBe(12000);
    expect(u.type).toBe("CRM_BASED");
  });
});

describe("parseUserListsResponse", () => {
  test("parses user lists", () => {
    const result = parseUserListsResponse(customerLists);
    expect(result.userLists).toHaveLength(1);
    expect(result.nextPageToken).toBe("UlNext");
  });
});

describe("normalizeConversionAction", () => {
  test("maps conversion action fields", () => {
    const c = normalizeConversionAction(conversionActions.results[0] as any);
    expect(c.id).toBe("gads-conversion:777");
    expect(c.name).toBe("Purchase");
    expect(c.primaryForGoal).toBe(true);
  });
});

describe("parseConversionActionsResponse", () => {
  test("parses conversion actions", () => {
    const result = parseConversionActionsResponse(conversionActions);
    expect(result.conversionActions).toHaveLength(2);
  });
});

describe("accessible customers + sub accounts", () => {
  test("parses accessible customer resource names", () => {
    const names = parseAccessibleCustomersResponse(accessibleCustomers);
    expect(names).toEqual(["customers/1234567890", "customers/9876543210"]);
    const normalized = names.map(normalizeAccessibleCustomer);
    expect(normalized[0].id).toBe("gads-customer:1234567890");
  });

  test("normalizes customer client", () => {
    const c = normalizeCustomerClient(subAccounts.results[0] as any);
    expect(c.id).toBe("gads-customer:1111111111");
    expect(c.descriptiveName).toBe("Retail Brand");
    expect(c.manager).toBe(false);
    expect(c.currencyCode).toBe("USD");
  });

  test("parseCustomerClientsResponse", () => {
    const result = parseCustomerClientsResponse(subAccounts);
    expect(result.customers).toHaveLength(1);
  });
});

describe("parseMutateResponse + searchStream aggregate", () => {
  test("parses mutate resource names", () => {
    const parsed = parseMutateResponse(mutateCampaigns);
    expect(parsed.resourceNames).toEqual(["customers/1234567890/campaigns/9999999999"]);
  });

  test("aggregates searchStream batches", () => {
    const agg = aggregateSearchStreamBatches(gaqlSearchStream);
    expect(agg.results).toHaveLength(3);
    expect(agg.fieldMask).toContain("campaign.id");
  });
});
