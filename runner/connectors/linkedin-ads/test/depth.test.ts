import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import { listCreatives, getAnalyticsReport, getAdAccount } from "../src/actions";
import {
  getAudienceCounts,
  getCampaignGroup,
  getLeadForm,
  getSupplyForecasts,
  listLeadForms,
  listTargetingEntities,
  listTargetingFacets,
} from "../src/extended-actions";
import { healthcheck } from "../src/healthcheck";
import { executeAdAccountsListSync, executeCampaignsListSync, executeCreativeAssetsListSync } from "../src/sync";

const campaignsList = { elements: [{ id: "urn:li:sponsoredCampaign:1", name: "Launch", status: "ACTIVE" }], paging: { count: 1, links: [] } };

type Seen = { url: string; method?: string; headers?: HeadersInit };

function mockFetch(body: unknown, seen?: (call: Seen) => void) {
  return (input: RequestInfo | URL, init: RequestInit = {}) => {
    seen?.({ url: String(input), method: init.method, headers: init.headers });
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
  };
}

const auth = { accessToken: "fixture-token" };
const elements = { elements: [{ id: 1 }], paging: { count: 1, links: [] } };

describe("declarative requests", () => {
  const compiled = compileDeclarativeConnector(manifest as never);

  it("compiles every action and leaves sync requests declared", () => {
    for (const [key, operation] of Object.entries(manifest.operations)) {
      expect(operation.request.method, key).toMatch(/^(GET|POST|PUT)$/);
      expect(operation.request.path.startsWith("/rest/"), key).toBe(true);
      if (operation.kind === "action") expect(typeof compiled.actions[key], key).toBe("function");
      else expect(compiled.actions[key], key).toBeUndefined();
    }
    expect(Object.keys(manifest.operations)).toHaveLength(32);
  });
});

describe("search sync handlers", () => {
  it("still normalizes an already fetched campaigns payload", () => {
    const result = executeCampaignsListSync({ response: campaignsList });
    expect(result).not.toBeInstanceOf(Promise);
    if (result instanceof Promise) return;
    expect(result.operation).toBe("campaigns.list");
    expect(result.items.length).toBeGreaterThan(0);
  });

  it("searches the versioned campaigns and accounts finders", async () => {
    let campaignUrl = "";
    await executeCampaignsListSync({
      ...auth,
      adAccountId: 520376796,
      status: ["ACTIVE"],
      pageSize: 25,
      fetch: mockFetch(elements, (call) => { campaignUrl = call.url; }),
    });
    const campaigns = new URL(campaignUrl);
    expect(campaigns.pathname).toBe("/rest/adAccounts/520376796/adCampaigns");
    expect(campaignUrl).toContain("q=search");
    expect(campaignUrl).toContain("status:(values:List(ACTIVE))");

    let accountUrl = "";
    await executeAdAccountsListSync({
      ...auth,
      test: false,
      fetch: mockFetch(elements, (call) => { accountUrl = call.url; }),
    });
    expect(new URL(accountUrl).pathname).toBe("/rest/adAccounts");
    expect(accountUrl).toContain("search=(test:false)");

    let creativeUrl = "";
    await executeCreativeAssetsListSync({
      ...auth,
      accountId: "520376796",
      intendedStatuses: ["ACTIVE"],
      fetch: mockFetch(elements, (call) => { creativeUrl = call.url; }),
    });
    const creatives = new URL(creativeUrl);
    expect(creatives.pathname).toBe("/rest/adAccounts/520376796/creatives");
    expect(creatives.searchParams.get("q")).toBe("criteria");
    expect(creativeUrl).toContain("intendedStatuses=List(ACTIVE)");
  });
});

describe("extended handlers", () => {
  it("gets a campaign group and a lead form", async () => {
    let groupUrl = "";
    await getCampaignGroup({
      ...auth,
      ad_account_id: "9",
      ad_campaign_group_id: "4",
      fetch: mockFetch({ id: 4, name: "Group" }, (call) => { groupUrl = call.url; }),
    });
    expect(new URL(groupUrl).pathname).toBe("/rest/adAccounts/9/adCampaignGroups/4");

    let formUrl = "";
    const form = await getLeadForm({
      ...auth,
      form_id: "6083",
      fetch: mockFetch({ id: 6083, name: "Contact" }, (call) => { formUrl = call.url; }),
    }) as any;
    expect(new URL(formUrl).pathname).toBe("/rest/leadForms/6083");
    expect(form.leadForm.name).toBe("Contact");
  });

  it("supports every targeting entity finder and audience counts", async () => {
    let facetUrl = "";
    await listTargetingFacets({ ...auth, fetch: mockFetch(elements, (call) => { facetUrl = call.url; }) });
    expect(new URL(facetUrl).pathname).toBe("/rest/adTargetingFacets");

    let typeahead = "";
    await listTargetingEntities({
      ...auth,
      q: "typeahead",
      facet: "urn:li:adTargetingFacet:skills",
      query: "java",
      locale_language: "en",
      locale_country: "US",
      fetch: mockFetch(elements, (call) => { typeahead = call.url; }),
    });
    expect(typeahead).toContain("q=typeahead");
    expect(typeahead).toContain("facet=urn%3Ali%3AadTargetingFacet%3Askills");
    expect(typeahead).toContain("query=java");
    expect(typeahead).toContain("locale=(language:en,country:US)");

    let similar = "";
    await listTargetingEntities({
      ...auth,
      facetUrn: "urn:li:adTargetingFacet:titles",
      entityType: "TITLE",
      entityUrns: ["urn:li:title:1"],
      fetch: mockFetch(elements, (call) => { similar = call.url; }),
    });
    expect(similar).toContain("q=similarEntities");
    expect(similar).toContain("entities=List(urn%3Ali%3Atitle%3A1)");

    let counts = "";
    await getAudienceCounts({
      ...auth,
      targeting_criteria: "(include:(and:List((or:(urn%3Ali%3AadTargetingFacet%3Alocations:List(urn%3Ali%3Ageo%3A1))))))",
      fetch: mockFetch(elements, (call) => { counts = call.url; }),
    });
    expect(counts).toContain("/rest/audienceCounts?");
    expect(counts).toContain("q=targetingCriteriaV2");
    expect(counts).toContain("urn%3Ali%3AadTargetingFacet%3Alocations");
  });

  it("forwards supply forecast bid and budget fields and lists lead forms by owner or ids", async () => {
    let forecast = "";
    await getSupplyForecasts({
      ...auth,
      account: "urn:li:sponsoredAccount:55",
      campaignType: "SPONSORED_UPDATES",
      timeRange: { start: 1000, end: 2000 },
      targetingCriteria: "(include:(and:List((or:(urn%3Ali%3AadTargetingFacet%3Alocations:List(urn%3Ali%3Ageo%3A1))))))",
      dailyBudget: { amount: "300", currencyCode: "USD" },
      competingBid: { bidType: "CPM", bidPrice: { amount: "10", currencyCode: "USD" } },
      objectiveType: "WEBSITE_VISITS",
      enableAudienceNetwork: true,
      fetch: mockFetch(elements, (call) => { forecast = call.url; }),
    });
    expect(forecast).toContain("/rest/adSupplyForecasts?");
    expect(forecast).toContain("q=criteriaV2");
    expect(forecast).toContain("timeRange=(start:1000,end:2000)");
    expect(forecast).toContain("dailyBudget=(amount:300,currencyCode:USD)");
    expect(forecast).toContain("competingBid=(bidType:CPM,bidPrice:(amount:10,currencyCode:USD))");
    expect(forecast).toContain("objectiveType=WEBSITE_VISITS");
    expect(forecast).toContain("enableAudienceNetwork=true");

    let forms = "";
    await listLeadForms({
      ...auth,
      owner_sponsored_account: "77",
      count: 10,
      fetch: mockFetch(elements, (call) => { forms = call.url; }),
    });
    expect(forms).toContain("q=owner");
    expect(forms).toContain("owner=(sponsoredAccount:urn%3Ali%3AsponsoredAccount%3A77)");

    let batch = "";
    await listLeadForms({ ...auth, ids: ["6083"], fetch: mockFetch({ results: { "6083": { id: 6083 } } }, (call) => { batch = call.url; }) });
    expect(batch).toContain("ids=List(6083)");
  });
});

describe("core action aliases", () => {
  it("reads Composio ad account ids and creative criteria", async () => {
    let accountUrl = "";
    await getAdAccount({ ...auth, ad_account_id: 42, fetch: mockFetch({ id: 42, name: "Acme" }, (call) => { accountUrl = call.url; }) });
    expect(new URL(accountUrl).pathname).toBe("/rest/adAccounts/42");

    let creativeUrl = "";
    await listCreatives({
      ...auth,
      ad_account_id: "520376796",
      campaigns: ["urn:li:sponsoredCampaign:360035215"],
      intended_statuses: ["ACTIVE"],
      sort_order: "ASCENDING",
      fetch: mockFetch(elements, (call) => { creativeUrl = call.url; }),
    });
    expect(creativeUrl).toContain("/rest/adAccounts/520376796/creatives?");
    expect(creativeUrl).toContain("q=criteria");
    expect(creativeUrl).toContain("campaigns=List(urn%3Ali%3AsponsoredCampaign%3A360035215)");
    expect(creativeUrl).toContain("intendedStatuses=List(ACTIVE)");
  });

  it("accepts a Composio dateRange object and statistics finder", async () => {
    let url = "";
    await getAnalyticsReport({
      ...auth,
      q: "statistics",
      pivot: "CAMPAIGN",
      dateRange: { start: { year: 2024, month: 1, day: 1 }, end: { year: 2024, month: 1, day: 31 } },
      accounts: ["525410360"],
      fields: "impressions,clicks",
      fetch: mockFetch({ elements: [] }, (call) => { url = call.url; }),
    });
    expect(url).toContain("q=statistics");
    expect(url).toContain("pivots=List(CAMPAIGN)");
    expect(url).toContain("dateRange=(start:(year:2024,month:1,day:1),end:(year:2024,month:1,day:31))");
    expect(url).toContain("accounts=List(urn%3Ali%3AsponsoredAccount%3A525410360)");
    expect(url).toContain("fields=dateRange,pivotValues,impressions,clicks");
  });
});

describe("healthcheck", () => {
  it("stays credential-free without a token and calls ad accounts with one", async () => {
    expect(healthcheck()).toEqual({ connector: "linkedin-ads", status: "ok", source: "connector" });
    let url = "";
    let headers: HeadersInit | undefined;
    const live = await healthcheck({
      ...auth,
      fetch: mockFetch(elements, (call) => { url = call.url; headers = call.headers; }),
    });
    expect(live).toEqual({ connector: "linkedin-ads", status: "ok", source: "provider" });
    expect(new URL(url).pathname).toBe("/rest/adAccounts");
    const headerMap = headers as Record<string, string>;
    expect(headerMap["LinkedIn-Version"]).toBe("202609");
    expect(url).toContain("pageSize=1");
    expect(headerMap["Content-Type"]).toBeUndefined();
  });
});

describe("fixtures", () => {
  it("keeps request bodies null or compact JSON", () => {
    const root = join(import.meta.dir, "../fixtures");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith(".json")) files.push(path);
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThan(20);
    const seenOps = new Set<string>();
    for (const file of files) {
      const parsed = JSON.parse(readFileSync(file, "utf8"));
      const visit = (value: unknown) => {
        if (!value || typeof value !== "object") return;
        if (Array.isArray(value)) { value.forEach(visit); return; }
        const record = value as Record<string, unknown>;
        if ("body" in record && record.request === undefined && Object.keys(record).includes("method")) {
          const body = record.body;
          if (body !== null) {
            expect(typeof body, file).toBe("string");
            expect(JSON.stringify(JSON.parse(String(body))), file).toBe(body);
          }
        }
        if (typeof record.operation === "string") seenOps.add(record.operation);
        Object.values(record).forEach(visit);
      };
      visit(parsed);
    }
    for (const key of Object.keys(manifest.operations)) expect(seenOps.has(key), key).toBe(true);
  });
});
