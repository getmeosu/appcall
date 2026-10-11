import { describe, expect, it } from "bun:test";
import {
  listAccessibleCustomers,
  listSubAccounts,
  getCampaign,
  getCampaignByName,
  getAdGroup,
  getAd,
  getKeyword,
  getBudget,
  getConversionAction,
  mutateCampaigns,
  rewriteCampaignCreateOperations,
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
import adGroupGet from "../fixtures/ad_group_get.json";
import adGet from "../fixtures/ad_get.json";
import keywordGet from "../fixtures/keyword_get.json";
import budgetGet from "../fixtures/budget_get.json";
import conversionActionGet from "../fixtures/conversion_action_get.json";
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
import { GOOGLE_ADS_API_VERSION, GOOGLE_ADS_BASE_URL } from "../src/http";

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

  it("extracts campaignId from mutate-shaped operations for Reconcile", () => {
    const result = getCampaign({
      customerId: "1",
      operations: [{ update: { resourceName: "customers/1/campaigns/999" } }],
    }) as any;
    expect(result.validated.campaignId).toBe("999");
  });
});

describe("companion gets (read-back for mutate ops)", () => {
  it("validates and fetches ad_groups.get", async () => {
    const dry = getAdGroup({ customerId: "1", adGroupId: "7777777777" }) as any;
    expect(dry.action).toBe("ad_groups.get");
    expect(dry.validated.adGroupId).toBe("7777777777");
    const live = await getAdGroup({
      ...liveAuth,
      adGroupId: "7777777777",
      fetch: createMockFetch(200, adGroupGet),
    }) as any;
    expect(live.adGroup.id).toBe("gads-adgroup:7777777777");
  });

  it("validates and fetches ads.get", async () => {
    const dry = getAd({ customerId: "1", adId: "1010101010" }) as any;
    expect(dry.action).toBe("ads.get");
    expect(dry.validated.adId).toBe("1010101010");
    const live = await getAd({
      ...liveAuth,
      adId: "1010101010",
      fetch: createMockFetch(200, adGet),
    }) as any;
    expect(live.ad.id).toBe("gads-ad:1010101010");
  });

  it("extracts adId from compound adGroupAds resourceName", () => {
    const result = getAd({
      customerId: "1",
      resourceName: "customers/1/adGroupAds/7777777777~1010101010",
    }) as any;
    expect(result.validated.adId).toBe("1010101010");
  });

  it("validates and fetches keywords.get", async () => {
    const dry = getKeyword({ customerId: "1", criterionId: "111" }) as any;
    expect(dry.action).toBe("keywords.get");
    expect(dry.validated.criterionId).toBe("111");
    const live = await getKeyword({
      ...liveAuth,
      criterionId: "111",
      fetch: createMockFetch(200, keywordGet),
    }) as any;
    expect(live.keyword.id).toBe("gads-keyword:111");
  });

  it("validates and fetches budgets.get", async () => {
    const dry = getBudget({ customerId: "1", budgetId: "2222222222" }) as any;
    expect(dry.action).toBe("budgets.get");
    expect(dry.validated.budgetId).toBe("2222222222");
    const live = await getBudget({
      ...liveAuth,
      budgetId: "2222222222",
      fetch: createMockFetch(200, budgetGet),
    }) as any;
    expect(live.budget.id).toBe("gads-budget:2222222222");
  });

  it("validates and fetches conversion_actions.get", async () => {
    const dry = getConversionAction({ customerId: "1", conversionActionId: "777" }) as any;
    expect(dry.action).toBe("conversion_actions.get");
    expect(dry.validated.conversionActionId).toBe("777");
    const live = await getConversionAction({
      ...liveAuth,
      conversionActionId: "777",
      fetch: createMockFetch(200, conversionActionGet),
    }) as any;
    expect(live.conversionAction.id).toBe("gads-conversion:777");
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


describe("campaign date fields + EU political (v25)", () => {
  it("campaigns.get GAQL selects start_date_time/end_date_time", async () => {
    let body = "";
    await getCampaign({
      ...liveAuth,
      campaignId: "1111111111",
      fetch: async (_input, init) => {
        body = String(init?.body ?? "");
        return new Response(JSON.stringify(campaignGet), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    expect(body).toContain("campaign.start_date_time");
    expect(body).toContain("campaign.end_date_time");
    expect(body).not.toContain("campaign.start_date,");
    expect(body).not.toContain("campaign.end_date ");
  });

  it("campaigns.getByName GAQL selects start_date_time/end_date_time", async () => {
    let body = "";
    await getCampaignByName({
      ...liveAuth,
      name: "Summer Sale 2024",
      fetch: async (_input, init) => {
        body = String(init?.body ?? "");
        return new Response(JSON.stringify(campaignGet), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    expect(body).toContain("campaign.start_date_time");
    expect(body).toContain("campaign.end_date_time");
    expect(body).not.toContain("campaign.start_date,");
  });

  it("campaigns.mutate create maps startDate/endDate to start_date_time/end_date_time", async () => {
    let body = "";
    await mutateCampaigns({
      ...liveAuth,
      operations: [
        {
          create: {
            name: "X",
            status: "PAUSED",
            startDate: "2026-01-01",
            endDate: "2026-12-31",
          },
        },
      ],
      fetch: async (_input, init) => {
        body = String(init?.body ?? "");
        return new Response(JSON.stringify(mutateCampaignsFixture), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    const parsed = JSON.parse(body);
    const create = parsed.operations[0].create;
    expect(create.start_date_time).toBe("2026-01-01");
    expect(create.end_date_time).toBe("2026-12-31");
    expect(create.startDate).toBeUndefined();
    expect(create.endDate).toBeUndefined();
    expect(create.start_date).toBeUndefined();
    expect(create.end_date).toBeUndefined();
  });

  it("campaigns.mutate create renames legacy start_date/end_date fields", () => {
    const ops = rewriteCampaignCreateOperations([
      { create: { name: "Y", start_date: "2026-02-01", end_date: "2026-03-01" } },
    ]);
    const create = (ops[0] as any).create;
    expect(create.start_date_time).toBe("2026-02-01");
    expect(create.end_date_time).toBe("2026-03-01");
    expect(create.start_date).toBeUndefined();
    expect(create.end_date).toBeUndefined();
  });

  it("campaigns.mutate passes containsEuPoliticalAdvertising through and never defaults it", async () => {
    const dry = mutateCampaigns({
      customerId: "123",
      operations: [{ create: { name: "New", status: "PAUSED" } }],
    }) as any;
    expect(dry.validated.operations[0].create.contains_eu_political_advertising).toBeUndefined();

    let bodyWithout = "";
    await mutateCampaigns({
      ...liveAuth,
      operations: [{ create: { name: "X", status: "PAUSED" } }],
      fetch: async (_input, init) => {
        bodyWithout = String(init?.body ?? "");
        return new Response(JSON.stringify(mutateCampaignsFixture), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    expect(bodyWithout).not.toContain("contains_eu_political_advertising");

    let bodyWith = "";
    await mutateCampaigns({
      ...liveAuth,
      containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
      operations: [{ create: { name: "X", status: "PAUSED" } }],
      fetch: async (_input, init) => {
        bodyWith = String(init?.body ?? "");
        return new Response(JSON.stringify(mutateCampaignsFixture), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    const parsed = JSON.parse(bodyWith);
    expect(parsed.operations[0].create.contains_eu_political_advertising).toBe(
      "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
    );
  });

  it("surfaces a clear connector error when upstream requires EU political declaration", async () => {
    const upstream = {
      error: {
        code: 400,
        status: 400,
        message: "The required field was not present.",
        details: [
          {
            errors: [
              {
                errorCode: { fieldError: "REQUIRED" },
                message: "contains_eu_political_advertising is required",
              },
            ],
          },
        ],
      },
    };
    try {
      await mutateCampaigns({
        ...liveAuth,
        operations: [{ create: { name: "X", status: "PAUSED" } }],
        fetch: async () =>
          new Response(JSON.stringify(upstream), {
            status: 400,
            headers: { "content-type": "application/json" },
          }),
      });
      throw new Error("expected mutateCampaigns to throw");
    } catch (err: any) {
      expect(err.ok).toBe(false);
      expect(err.code).toBe("CONNECTOR_UPSTREAM_ERROR");
      expect(err.message).toContain("containsEuPoliticalAdvertising");
      expect(err.message).toContain("never defaults");
    }
  });
});

describe("API version pin", () => {
  it("pins GOOGLE_ADS_API_VERSION to v25 and uses it in request URLs", async () => {
    expect(GOOGLE_ADS_API_VERSION).toBe("v25");
    expect(GOOGLE_ADS_BASE_URL).toBe("https://googleads.googleapis.com/v25");
    let seen = "";
    const result = await listAccessibleCustomers({
      accessToken: "t",
      developerToken: "d",
      fetch: async (input) => {
        seen = String(input);
        return new Response(JSON.stringify(accessibleCustomers), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    }) as any;
    expect(seen).toContain("https://googleads.googleapis.com/v25/");
    expect(seen).not.toContain("/v19/");
    expect(result.customers).toHaveLength(2);
  });
});
