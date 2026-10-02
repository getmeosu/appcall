import { describe, expect, it } from "bun:test";
import {
  getCampaign,
  getAdAccount,
  listCampaignGroups,
  listCreatives,
  getAnalyticsReport,
} from "../src/actions";
import campaignGet from "../fixtures/campaign_get.json";
import adAccountGet from "../fixtures/ad_account_get.json";
import campaignGroupsList from "../fixtures/campaign_groups_list.json";
import creativesList from "../fixtures/creatives_list.json";
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

describe("campaigns.get", () => {
  it("requires accountId and campaignId", () => {
    expect(() => getCampaign({})).toThrow("accountId is required");
    expect(() => getCampaign({ accountId: "555" })).toThrow("campaignId is required");
  });

  it("validates without credentials", () => {
    const result = getCampaign({ accountId: "555666777", campaignId: "111222333" }) as any;
    expect(result.connector).toBe("linkedin-ads");
    expect(result.action).toBe("campaigns.get");
    expect(result.validated.accountId).toBe("555666777");
    expect(result.validated.campaignId).toBe("111222333");
  });

  it("fetches campaign live with mocked fetch", async () => {
    const result = (await getCampaign({
      ...liveAuth,
      accountId: "555666777",
      campaignId: "111222333",
      fetch: createMockFetch(200, campaignGet),
    })) as any;
    expect(result.campaign.id).toBe("li-ads-campaign:111222333");
    expect(result.campaign.name).toBe("Q1 Brand Awareness - US");
    expect(result.campaign.status).toBe("ACTIVE");
    expect(result.campaign.accountId).toBe("555666777");
    expect(result.campaign.budget).toBe(15000);
  });

  it("accepts URN ids", () => {
    const result = getCampaign({
      accountId: "urn:li:sponsoredAccount:555666777",
      campaignId: "urn:li:sponsoredCampaign:111222333",
    }) as any;
    expect(result.validated.accountId).toContain("555666777");
  });
});

describe("ad_accounts.get", () => {
  it("requires accountId", () => {
    expect(() => getAdAccount({})).toThrow("accountId is required");
  });

  it("validates without credentials", () => {
    const result = getAdAccount({ accountId: "555666777" }) as any;
    expect(result.action).toBe("ad_accounts.get");
    expect(result.validated.accountId).toBe("555666777");
  });

  it("fetches ad account live with mocked fetch", async () => {
    const result = (await getAdAccount({
      ...liveAuth,
      accountId: "555666777",
      fetch: createMockFetch(200, adAccountGet),
    })) as any;
    expect(result.adAccount.id).toBe("li-ads-account:555666777");
    expect(result.adAccount.name).toBe("TechCo Inc - Marketing");
    expect(result.adAccount.currency).toBe("USD");
  });
});

describe("campaign_groups.list", () => {
  it("requires accountId", () => {
    expect(() => listCampaignGroups({})).toThrow("accountId is required");
  });

  it("validates without credentials", () => {
    const result = listCampaignGroups({ accountId: "555666777", start: 0, count: 10 }) as any;
    expect(result.action).toBe("campaign_groups.list");
    expect(result.validated.accountId).toBe("555666777");
    expect(result.validated.start).toBe(0);
    expect(result.validated.count).toBe(10);
  });

  it("lists campaign groups live with mocked fetch", async () => {
    const result = (await listCampaignGroups({
      ...liveAuth,
      accountId: "555666777",
      fetch: createMockFetch(200, campaignGroupsList),
    })) as any;
    expect(result.campaignGroups).toHaveLength(2);
    expect(result.campaignGroups[0].id).toBe("li-ads-campaign-group:999888777");
    expect(result.campaignGroups[0].name).toBe("Q1 Brand Pod");
    expect(result.nextStart).toBe(10);
  });
});

describe("creatives.list", () => {
  it("requires accountId", () => {
    expect(() => listCreatives({})).toThrow("accountId is required");
  });

  it("validates without credentials", () => {
    const result = listCreatives({ accountId: "555666777", campaignId: "111222333" }) as any;
    expect(result.action).toBe("creatives.list");
    expect(result.validated.campaignId).toBe("111222333");
  });

  it("lists creatives live with mocked fetch", async () => {
    const result = (await listCreatives({
      ...liveAuth,
      accountId: "555666777",
      fetch: createMockFetch(200, creativesList),
    })) as any;
    expect(result.creatives).toHaveLength(3);
    expect(result.creatives[0].id).toBe("li-ads-creative:1234567890");
    expect(result.creatives[0].campaignId).toBe("111222333");
    expect(result.creatives[0].intendedStatus).toBe("ACTIVE");
    expect(result.nextStart).toBe(10);
  });
});

describe("analytics.report.get", () => {
  it("requires pivot and date range and a facet", () => {
    expect(() => getAnalyticsReport({})).toThrow("pivot is required");
    expect(() =>
      getAnalyticsReport({ pivot: "CAMPAIGN", dateRangeStart: "2024-01-01" }),
    ).toThrow("at least one of accounts, campaigns, campaignGroups, or creatives is required");
  });

  it("rejects unknown pivot", () => {
    expect(() =>
      getAnalyticsReport({
        pivot: "NOPE",
        dateRangeStart: "2024-01-01",
        campaigns: ["111"],
      }),
    ).toThrow("pivot must be one of");
  });

  it("validates without credentials", () => {
    const result = getAnalyticsReport({
      pivot: "CAMPAIGN",
      timeGranularity: "ALL",
      dateRangeStart: "2024-01-01",
      dateRangeEnd: "2024-03-31",
      campaigns: ["111222333"],
      fields: ["impressions", "clicks", "costInLocalCurrency", "pivotValues", "dateRange"],
    }) as any;
    expect(result.action).toBe("analytics.report.get");
    expect(result.validated.pivot).toBe("CAMPAIGN");
    expect(result.validated.dateRangeStart).toEqual({ year: 2024, month: 1, day: 1 });
    expect(result.validated.campaigns).toEqual(["111222333"]);
  });

  it("fetches analytics live with mocked fetch", async () => {
    const result = (await getAnalyticsReport({
      ...liveAuth,
      pivot: "CAMPAIGN",
      timeGranularity: "ALL",
      dateRangeStart: { year: 2024, month: 1, day: 1 },
      dateRangeEnd: { year: 2024, month: 3, day: 31 },
      accounts: ["555666777"],
      fields: ["impressions", "clicks", "costInLocalCurrency", "pivotValues", "dateRange"],
      fetch: createMockFetch(200, analyticsReport),
    })) as any;
    expect(result.rows).toHaveLength(2);
    expect(result.rowCount).toBe(2);
    expect(result.rows[0].impressions).toBe(54494);
    expect(result.rows[0].clicks).toBe(177);
    expect(result.rows[0].costInLocalCurrency).toBe(12450.75);
    expect(result.rows[0].pivotValues[0]).toContain("111222333");
  });
});
