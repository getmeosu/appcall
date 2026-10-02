import { describe, expect, it } from "bun:test";
import {
  listAccessibleCustomers,
  listSubAccounts,
  getCampaign,
  getCampaignByName,
  mutateCampaigns,
  mutateAdGroups,
  mutateAds,
  mutateKeywords,
  mutateBudgets,
  gaqlSearch,
  gaqlSearchStream,
  createCustomerList,
  mutateCustomerListMembers,
  mutateConversionActions,
  mutateLabels,
  getReport,
} from "../src/actions";
import accessibleCustomers from "../fixtures/accessible_customers.json";
import subAccounts from "../fixtures/sub_accounts.json";
import campaignGet from "../fixtures/campaign_get.json";
import mutateCampaignsFixture from "../fixtures/mutate_campaigns.json";
import mutateAdGroupsFixture from "../fixtures/mutate_ad_groups.json";
import mutateAdsFixture from "../fixtures/mutate_ads.json";
import mutateKeywordsFixture from "../fixtures/mutate_keywords.json";
import mutateBudgetsFixture from "../fixtures/mutate_budgets.json";
import gaqlSearchFixture from "../fixtures/gaql_search.json";
import gaqlSearchStreamFixture from "../fixtures/gaql_search_stream.json";
import customerListCreate from "../fixtures/customer_list_create.json";
import offlineJobCreate from "../fixtures/offline_user_data_job_create.json";
import mutateConversionActionsFixture from "../fixtures/mutate_conversion_actions.json";
import mutateLabelsFixture from "../fixtures/mutate_labels.json";
import reportsCampaign from "../fixtures/reports_campaign.json";

function createMockFetch(status: number, body: unknown) {
  return () => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

function createSequencedFetch(responses: Array<{ status: number; body: unknown }>) {
  let i = 0;
  return () => {
    const next = responses[Math.min(i, responses.length - 1)]!;
    i += 1;
    return Promise.resolve(new Response(JSON.stringify(next.body), { status: next.status, headers: { "content-type": "application/json" } }));
  };
}

const liveAuth = {
  accessToken: "test-token",
  developerToken: "dev-token",
  customerId: "1234567890",
};

describe("customers.listAccessible", () => {
  it("validates without credentials", () => {
    const result = listAccessibleCustomers({}) as any;
    expect(result.connector).toBe("google-ads");
    expect(result.action).toBe("customers.listAccessible");
    expect(result.validated).toEqual({});
  });

  it("lists accessible customers with live auth", async () => {
    const result = await listAccessibleCustomers({
      accessToken: "t",
      developerToken: "d",
      fetch: createMockFetch(200, accessibleCustomers),
    }) as any;
    expect(result.customers).toHaveLength(2);
    expect(result.customers[0].id).toBe("gads-customer:1234567890");
  });
});

describe("customers.listSubAccounts", () => {
  it("requires customerId", () => {
    expect(() => listSubAccounts({})).toThrow("customerId is required");
  });

  it("validates without live auth", () => {
    const result = listSubAccounts({ customerId: "123" }) as any;
    expect(result.validated.customerId).toBe("123");
  });

  it("lists sub accounts with live auth", async () => {
    const result = await listSubAccounts({ ...liveAuth, fetch: createMockFetch(200, subAccounts) }) as any;
    expect(result.customers[0].descriptiveName).toBe("Retail Brand");
  });
});

describe("campaigns.get / getByName", () => {
  it("validates getCampaign", () => {
    const result = getCampaign({ customerId: "1", campaignId: "111" }) as any;
    expect(result.action).toBe("campaigns.get");
    expect(result.validated.campaignId).toBe("111");
  });

  it("fetches campaign live", async () => {
    const result = await getCampaign({ ...liveAuth, campaignId: "1111111111", fetch: createMockFetch(200, campaignGet) }) as any;
    expect(result.campaign.id).toBe("gads-campaign:1111111111");
    expect(result.campaign.name).toBe("Summer Sale 2024");
  });

  it("validates getByName", () => {
    const result = getCampaignByName({ customerId: "1", name: "Summer Sale 2024" }) as any;
    expect(result.validated.name).toBe("Summer Sale 2024");
  });

  it("fetches by name live", async () => {
    const result = await getCampaignByName({ ...liveAuth, name: "Summer Sale 2024", fetch: createMockFetch(200, campaignGet) }) as any;
    expect(result.campaigns).toHaveLength(1);
  });
});

describe("mutate family", () => {
  it("validates campaigns.mutate without credentials", () => {
    const result = mutateCampaigns({
      customerId: "123",
      operations: [{ create: { name: "New", status: "PAUSED" } }],
    }) as any;
    expect(result.action).toBe("campaigns.mutate");
    expect(result.validated.operations).toHaveLength(1);
  });

  it("throws when operations missing", () => {
    expect(() => mutateCampaigns({ customerId: "123" })).toThrow("operations is required");
  });

  it("mutates campaigns live", async () => {
    const result = await mutateCampaigns({
      ...liveAuth,
      operations: [{ create: { name: "X", status: "PAUSED", advertisingChannelType: "SEARCH", campaignBudget: "customers/1234567890/campaignBudgets/1" } }],
      fetch: createMockFetch(200, mutateCampaignsFixture),
    }) as any;
    expect(result.resourceNames[0]).toContain("campaigns/9999999999");
  });

  it("mutates ad groups live", async () => {
    const result = await mutateAdGroups({
      ...liveAuth,
      operations: [{ create: { name: "AG", campaign: "customers/1234567890/campaigns/1" } }],
      fetch: createMockFetch(200, mutateAdGroupsFixture),
    }) as any;
    expect(result.resourceNames[0]).toContain("adGroups/");
  });

  it("mutates ads live", async () => {
    const result = await mutateAds({
      ...liveAuth,
      operations: [{ create: { adGroup: "customers/1234567890/adGroups/1", status: "PAUSED", ad: { responsiveSearchAd: { headlines: [{ text: "Hi" }] }, finalUrls: ["https://example.com"] } } }],
      fetch: createMockFetch(200, mutateAdsFixture),
    }) as any;
    expect(result.resourceNames[0]).toContain("adGroupAds/");
  });

  it("mutates keywords live", async () => {
    const result = await mutateKeywords({
      ...liveAuth,
      operations: [{ create: { adGroup: "customers/1234567890/adGroups/1", status: "ENABLED", keyword: { text: "shoes", matchType: "BROAD" } } }],
      fetch: createMockFetch(200, mutateKeywordsFixture),
    }) as any;
    expect(result.resourceNames[0]).toContain("adGroupCriteria/");
  });

  it("mutates budgets live", async () => {
    const result = await mutateBudgets({
      ...liveAuth,
      operations: [{ create: { name: "B", amountMicros: "1000000" } }],
      fetch: createMockFetch(200, mutateBudgetsFixture),
    }) as any;
    expect(result.resourceNames[0]).toContain("campaignBudgets/");
  });

  it("mutates conversion actions live", async () => {
    const result = await mutateConversionActions({
      ...liveAuth,
      operations: [{ create: { name: "Purchase", type: "UPLOAD_CLICKS", category: "PURCHASE", status: "ENABLED" } }],
      fetch: createMockFetch(200, mutateConversionActionsFixture),
    }) as any;
    expect(result.resourceNames[0]).toContain("conversionActions/");
  });

  it("mutates labels live", async () => {
    const result = await mutateLabels({
      ...liveAuth,
      operations: [{ create: { name: "VIP", textLabel: { backgroundColor: "#0000FF" } } }],
      fetch: createMockFetch(200, mutateLabelsFixture),
    }) as any;
    expect(result.resourceNames[0]).toContain("labels/");
  });
});

describe("gaql.search / searchStream", () => {
  it("validates search", () => {
    const result = gaqlSearch({ customerId: "1", query: "SELECT campaign.id FROM campaign" }) as any;
    expect(result.validated.query).toContain("SELECT");
  });

  it("searches live", async () => {
    const result = await gaqlSearch({
      ...liveAuth,
      query: "SELECT campaign.id FROM campaign",
      fetch: createMockFetch(200, gaqlSearchFixture),
    }) as any;
    expect(result.results).toHaveLength(1);
    expect(result.nextPageToken).toBe("Page2Token");
  });

  it("searchStream aggregates batches", async () => {
    const result = await gaqlSearchStream({
      ...liveAuth,
      query: "SELECT campaign.id FROM campaign",
      fetch: createMockFetch(200, gaqlSearchStreamFixture),
    }) as any;
    expect(result.rowCount).toBe(3);
    expect(result.results).toHaveLength(3);
  });
});

describe("customer_lists", () => {
  it("validates create", () => {
    const result = createCustomerList({ customerId: "1", name: "List A" }) as any;
    expect(result.validated.name).toBe("List A");
  });

  it("creates customer list live", async () => {
    const result = await createCustomerList({
      ...liveAuth,
      name: "Newsletter Subscribers",
      fetch: createMockFetch(200, customerListCreate),
    }) as any;
    expect(result.userList.id).toBe("gads-userlist:555");
  });

  it("requires emails for mutateMembers", () => {
    expect(() => mutateCustomerListMembers({
      customerId: "1",
      resourceName: "customers/1/userLists/1",
    })).toThrow("emails is required");
  });

  it("runs offline user data job path", async () => {
    const fetch = createSequencedFetch([
      { status: 200, body: offlineJobCreate },
      { status: 200, body: {} },
      { status: 200, body: {} },
    ]);
    const result = await mutateCustomerListMembers({
      ...liveAuth,
      resourceName: "customers/1234567890/userLists/555",
      emails: ["a@example.com", "b@example.com"],
      operation: "create",
      fetch,
    }) as any;
    expect(result.jobResourceName).toContain("offlineUserDataJobs/42");
    expect(result.emailCount).toBe(2);
  });
});

describe("reports.get", () => {
  it("rejects unknown report template", () => {
    expect(() => getReport({ customerId: "1", report: "UNKNOWN" })).toThrow("report must be one of");
  });

  it("validates without credentials", () => {
    const result = getReport({ customerId: "1", report: "CAMPAIGN" }) as any;
    expect(result.validated.report).toBe("CAMPAIGN");
  });

  it("runs campaign report live", async () => {
    const result = await getReport({
      ...liveAuth,
      report: "CAMPAIGN",
      maxRows: 10,
      fetch: createMockFetch(200, reportsCampaign),
    }) as any;
    expect(result.report).toBe("CAMPAIGN");
    expect(result.rowCount).toBe(1);
    expect(result.truncated).toBe(false);
  });
});
