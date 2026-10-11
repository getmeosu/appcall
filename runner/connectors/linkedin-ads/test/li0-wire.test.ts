// LI-0 wire tests: one pinned LinkedIn-Version (202609) on every /rest/ call,
// Rest.li 2.0 URN encoding (leaves encoded exactly once, structure raw), and
// cursor paging where LinkedIn moved off start/count. Every op is replayed
// through the real registry dispatch against its fixtures/cases exchange.
import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultConnectorRegistry as registry } from "../../../bun/src/registry";
import manifest from "../manifest.json";
import { analyticsFields, DEFAULT_ANALYTICS_FIELDS, getAnalyticsReport, listCampaignGroups, listCreatives } from "../src/actions";
import { getAudienceCounts, getLeadForm, listLeadForms } from "../src/extended-actions";
import { createLinkedInAdsClient, isVersionedPath, LINKEDIN_VERSION, withRestliHeaders } from "../src/http";
import {
  getNetworkSize,
  getOrgShareStatistics,
  listOrganizationAcls,
  listPosts,
  lookupOrganizations,
  updateOrganizationAcl,
} from "../src/parity-actions";
import { enc, pageTokenValue, restliExpression } from "../src/restli";
import { executeAdAccountsListSync, executeCampaignsListSync, executeCreativeAssetsListSync } from "../src/sync";

type Seen = { url: string; method: string; headers: Record<string, string>; body: string | null };
type Exchange = {
  request: { method: string; url: string; headers: Record<string, string>; body: string | null };
  response: { status: number; headers: Record<string, string>; body: unknown };
};
type Case = { id: string; operation: string; input: Record<string, unknown>; exchanges: Exchange[] };

const credential = { accessToken: "fixture-access-value" };
const casesDir = join(import.meta.dir, "../fixtures/cases");
const cases: Case[] = readdirSync(casesDir)
  .filter((name) => name.endsWith(".json"))
  .sort()
  .map((name) => JSON.parse(readFileSync(join(casesDir, name), "utf8")));
const operations = manifest.operations as Record<string, { kind: string }>;

function headerRecord(init: RequestInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  new Headers(init?.headers).forEach((value, key) => { out[key] = value; });
  return out;
}

function recorder(response: { status: number; headers?: Record<string, string>; body: unknown }, calls: Seen[]) {
  return (input: RequestInfo | URL, init: RequestInit = {}) => {
    calls.push({
      url: String(input),
      method: init.method ?? "GET",
      headers: headerRecord(init),
      body: typeof init.body === "string" ? init.body : null,
    });
    const payload = response.body === null || response.body === undefined ? "" : JSON.stringify(response.body);
    return Promise.resolve(new Response(payload === "" ? null : payload, { status: response.status, headers: response.headers ?? {} }));
  };
}

async function dispatch(operation: string, input: Record<string, unknown>): Promise<{ ok: boolean; output?: unknown; code?: string }> {
  const kind = operations[operation]?.kind;
  const result: any = operation === "healthcheck"
    ? registry.healthcheck("linkedin-ads", input)
    : kind === "sync"
      ? registry.executeSync("linkedin-ads", operation, input)
      : registry.executeAction("linkedin-ads", operation, input);
  if (!result?.ok) return result;
  return { ok: true, output: await result.output };
}

function assertPinned(call: Seen) {
  const url = new URL(call.url);
  expect(url.origin).toBe("https://api.linkedin.com");
  expect(url.pathname.startsWith("/rest/"), call.url).toBe(true);
  expect(call.headers["linkedin-version"], call.url).toBe("202609");
  expect(call.headers["x-restli-protocol-version"], call.url).toBe("2.0.0");
  expect(call.url.includes("%25"), call.url).toBe(false);
}

describe("fixture coverage", () => {
  it("has exactly one live-shaped 202609 case per manifest op", () => {
    const ops = cases.map((item) => item.operation).sort();
    expect(ops).toEqual(Object.keys(operations).sort());
    expect(ops).toHaveLength(32);
    for (const item of cases) {
      const request = item.exchanges[0]!.request;
      expect(request.headers["LinkedIn-Version"], item.id).toBe("202609");
      expect(request.headers["X-Restli-Protocol-Version"], item.id).toBe("2.0.0");
      expect(request.url.includes("%25"), item.id).toBe(false);
      expect(JSON.stringify(item).toLowerCase().includes("bearer"), item.id).toBe(false);
    }
  });
});

describe("replay every op through registry dispatch", () => {
  for (const item of cases) {
    it(`${item.operation} sends the documented 202609 request`, async () => {
      const exchange = item.exchanges[0]!;
      const calls: Seen[] = [];
      const result = await dispatch(item.operation, { ...credential, ...item.input, fetch: recorder(exchange.response, calls) });
      expect(result.ok, JSON.stringify(result)).toBe(true);
      expect(calls).toHaveLength(1);
      const call = calls[0]!;
      expect(call.url).toBe(exchange.request.url);
      expect(call.method).toBe(exchange.request.method);
      assertPinned(call);
      if (exchange.request.body === null) expect(call.body).toBeNull();
      else expect(JSON.parse(call.body ?? "null")).toEqual(JSON.parse(exchange.request.body));
    });
  }

  it("never carries a caller-chosen version: linkedin_version is no longer an input", async () => {
    for (const operation of ["posts.list", "organizations.lookup"]) {
      const item = cases.find((entry) => entry.operation === operation)!;
      const calls: Seen[] = [];
      const result = await dispatch(operation, { ...credential, ...item.input, linkedin_version: "202401", fetch: recorder(item.exchanges[0]!.response, calls) });
      expect(result.ok).toBe(false);
      expect(result.code).toBe("INVALID_ACTION_INPUT");
      expect(calls).toHaveLength(0);
      const schema = (manifest.operations as any)[operation].inputSchema.properties;
      expect(schema.linkedin_version).toBeUndefined();
    }
  });
});

describe("pinned header mechanism", () => {
  it("pins 202609 locally in http.ts and in the manifest http.headers", () => {
    expect(LINKEDIN_VERSION).toBe("202609");
    expect(manifest.http.headers["LinkedIn-Version"]).toBe("202609");
    expect(manifest.http.headers["X-Restli-Protocol-Version"]).toBe("2.0.0");
    const source = readFileSync(join(import.meta.dir, "../src/http.ts"), "utf8");
    expect(source).not.toMatch(/from "\.\.\/\.\.\/linkedin\//);
  });

  it("overrides caller copies case-insensitively on /rest/ and never sends the version on /v2/", () => {
    const rest = withRestliHeaders("/rest/adAccounts", { "linkedin-version": "202401", "X-RESTLI-PROTOCOL-VERSION": "1.0.0", Accept: "application/json" });
    expect(rest).toEqual({ Accept: "application/json", "X-Restli-Protocol-Version": "2.0.0", "LinkedIn-Version": "202609" });
    const v2 = withRestliHeaders("https://api.linkedin.com/v2/userinfo", { "LinkedIn-Version": "202609" });
    expect(Object.keys(v2).map((key) => key.toLowerCase())).not.toContain("linkedin-version");
    expect(v2["X-Restli-Protocol-Version"]).toBe("2.0.0");
    expect(isVersionedPath("/rest/posts")).toBe(true);
    expect(isVersionedPath("/v2/me")).toBe(false);
    expect(isVersionedPath("https://evil.example/rest/posts")).toBe(false);
  });

  it("drops caller-supplied version headers at the client for /rest/ and /v2/ requests", async () => {
    const calls: Seen[] = [];
    const client = createLinkedInAdsClient({ ...credential, fetch: recorder({ status: 200, body: {} }, calls) as typeof fetch, operation: "healthcheck" });
    await client.fetchJSON("/rest/adAccounts?q=search&pageSize=1", { method: "GET", headers: { "LinkedIn-Version": "202401", "x-restli-protocol-version": "1.0.0" } });
    await client.fetchJSON("/rest/adAccounts?q=search&pageSize=1", { method: "GET", headers: new Headers({ "linkedin-version": "202401" }) });
    await client.fetchJSON("/v2/me", { method: "GET", headers: { "LinkedIn-Version": "202609" } });
    expect(calls[0]!.headers["linkedin-version"]).toBe("202609");
    expect(calls[0]!.headers["x-restli-protocol-version"]).toBe("2.0.0");
    expect(calls[1]!.headers["linkedin-version"]).toBe("202609");
    expect(calls[2]!.headers["linkedin-version"]).toBeUndefined();
    expect(calls[2]!.headers["x-restli-protocol-version"]).toBe("2.0.0");
  });

  it("ignores a stray linkedin_version when a handler is called directly", async () => {
    for (const run of [
      (fetch: unknown) => listPosts({ ...credential, q: "author", author: "urn:li:organization:1", linkedin_version: "202401", fetch }),
      (fetch: unknown) => lookupOrganizations({ ...credential, ids: ["1"], linkedin_version: "202401", fetch }),
    ]) {
      const calls: Seen[] = [];
      await run(recorder({ status: 200, body: { elements: [] } }, calls));
      expect(calls[0]!.headers["linkedin-version"]).toBe("202609");
    }
  });
});

describe("Rest.li 2.0 URN encoding", () => {
  async function urlOf(run: (fetch: unknown) => unknown): Promise<string> {
    const calls: Seen[] = [];
    await run(recorder({ status: 200, body: { elements: [] } }, calls));
    return calls[0]!.url;
  }

  it("encodes a leaf exactly once, Rest.li delimiters included", () => {
    expect(enc("urn:li:sponsoredAccount:123")).toBe("urn%3Ali%3AsponsoredAccount%3A123");
    expect(enc("urn:li:x:(a,b)")).toBe("urn%3Ali%3Ax%3A%28a%2Cb%29");
    expect(enc("100%")).toBe("100%25");
  });

  it("encodes whole-URN path keys once", async () => {
    const network = await urlOf((fetch) => getNetworkSize({ ...credential, organization_urn: "urn:li:organization:123", fetch }));
    expect(new URL(network).pathname).toBe("/rest/networkSizes/urn%3Ali%3Aorganization%3A123");
    const form = await urlOf((fetch) => getLeadForm({ ...credential, leadFormId: "6755260984438374400", fetch }));
    expect(new URL(form).pathname).toBe("/rest/leadForms/6755260984438374400");
    const acl = await urlOf((fetch) => updateOrganizationAcl({ ...credential, role: "ADMINISTRATOR", state: "APPROVED", organization: "123", roleAssignee: "abc", fetch }));
    expect(acl).toBe("https://api.linkedin.com/rest/organizationAcls/(organization:urn%3Ali%3Aorganization%3A123,role:ADMINISTRATOR,roleAssignee:urn%3Ali%3Aperson%3Aabc)");
  });

  it("encodes bare query URNs once", async () => {
    const posts = await urlOf((fetch) => listPosts({ ...credential, q: "dscAdAccount", dscAdAccount: "123", fetch }));
    expect(posts).toContain("dscAdAccount=urn%3Ali%3AsponsoredAccount%3A123");
    const acls = await urlOf((fetch) => listOrganizationAcls({ ...credential, q: "organization", organization: "urn:li:organization:5", fetch }));
    expect(acls).toContain("organization=urn%3Ali%3Aorganization%3A5");
  });

  it("keeps List(...) and (key:value) delimiters raw with URN leaves encoded once", async () => {
    const analytics = await urlOf((fetch) => getAnalyticsReport({ ...credential, pivot: "ACCOUNT", accounts: ["123", "urn:li:sponsoredAccount:456"], dateRangeStart: "2026-09-01", fetch }));
    expect(analytics).toContain("accounts=List(urn%3Ali%3AsponsoredAccount%3A123,urn%3Ali%3AsponsoredAccount%3A456)");
    expect(analytics).toContain("dateRange=(start:(year:2026,month:9,day:1))");
    const shares = await urlOf((fetch) => getOrgShareStatistics({ ...credential, organizationalEntity: "1", ugcPosts: ["urn:li:ugcPost:9"], fetch }));
    expect(shares).toContain("ugcPosts=List(urn%3Ali%3AugcPost%3A9)");
    const ids = await urlOf((fetch) => listPosts({ ...credential, ids: ["urn:li:share:1", "urn:li:ugcPost:2"], fetch }));
    expect(ids).toContain("ids=List(urn%3Ali%3Ashare%3A1,urn%3Ali%3AugcPost%3A2)");
    const owner = await urlOf((fetch) => listLeadForms({ ...credential, owner_sponsored_account: "77", fetch }));
    expect(owner).toContain("owner=(sponsoredAccount:urn%3Ali%3AsponsoredAccount%3A77)");
    const lookup = await urlOf((fetch) => lookupOrganizations({ ...credential, ids: ["1", "2"], fetch }));
    expect(lookup).toContain("ids=List(1,2)");
    for (const url of [analytics, shares, ids, owner, lookup]) {
      expect(url).not.toContain("%25");
      expect(url).not.toMatch(/%28|%29|List%28/);
    }
  });

  it("normalizes caller targeting criteria to single encoding and refuses double encoding", async () => {
    const raw = "(include:(and:List((or:(urn:li:adTargetingFacet:locations:List(urn:li:geo:1))))))";
    const encoded = "(include:(and:List((or:(urn%3Ali%3AadTargetingFacet%3Alocations:List(urn%3Ali%3Ageo%3A1))))))";
    expect(restliExpression(raw, "targetingCriteria")).toBe(encoded);
    expect(restliExpression(encoded, "targetingCriteria")).toBe(encoded);
    expect(() => restliExpression("(include:(and:List(urn%253Ali%253Ageo%253A1)))", "targetingCriteria")).toThrow("double-encoded");
    const counts = await urlOf((fetch) => getAudienceCounts({ ...credential, targetingCriteria: raw, fetch }));
    expect(counts).toContain(`targetingCriteria=${encoded}`);
  });

  it("encodes sync search leaves once and uses the scalar test flag", async () => {
    const accounts = await urlOf((fetch) => executeAdAccountsListSync({ ...credential, reference: ["urn:li:organization:2414183"], test: true, fetch }));
    expect(accounts).toContain("search=(reference:(values:List(urn%3Ali%3Aorganization%3A2414183)),test:true)");
    const search = await urlOf((fetch) => executeCampaignsListSync({ ...credential, adAccountId: "1", search: "(campaignGroup:(values:List(urn:li:sponsoredCampaignGroup:9)))", fetch }));
    expect(search).toContain("search=(campaignGroup:(values:List(urn%3Ali%3AsponsoredCampaignGroup%3A9)))");
  });
});

describe("cursor paging", () => {
  async function call(run: (fetch: unknown) => unknown, body: unknown = { elements: [], metadata: { nextPageToken: "abc" } }): Promise<{ url: string; method: string; out: any }> {
    const calls: Seen[] = [];
    const out = await run(recorder({ status: 200, body }, calls));
    return { url: calls[0]!.url, method: calls[0]!.headers["x-restli-method"] ?? "", out };
  }

  it("campaign_groups.list sends search=(...) and pageSize/pageToken, not start/count", async () => {
    const first = await call((fetch) => listCampaignGroups({ ...credential, accountId: "506223315", status: "ACTIVE", pageSize: 2, fetch }));
    expect(first.url).toBe("https://api.linkedin.com/rest/adAccounts/506223315/adCampaignGroups?q=search&search=(status:(values:List(ACTIVE)))&pageSize=2");
    expect(first.method).toBe("FINDER");
    expect(first.out).toEqual({ connector: "linkedin-ads", action: "campaign_groups.list", source: "connector", campaignGroups: [], nextStart: null, count: 0 });
    const next = await call((fetch) => listCampaignGroups({ ...credential, accountId: "506223315", pageToken: "cursor-page-2", fetch }));
    expect(next.url).toBe("https://api.linkedin.com/rest/adAccounts/506223315/adCampaignGroups?q=search&pageToken=cursor-page-2");
    const alias = await call((fetch) => listCampaignGroups({ ...credential, accountId: "1", count: 25, start: 0, fetch }));
    expect(alias.url).toBe("https://api.linkedin.com/rest/adAccounts/1/adCampaignGroups?q=search&pageSize=25");
    expect(alias.url).not.toMatch(/[?&](start|count)=/);
    expect(() => listCampaignGroups({ ...credential, accountId: "1", start: 10 })).toThrow("pageToken");
    expect(() => listCampaignGroups({ ...credential, accountId: "1", pageSize: 1001, fetch: () => undefined })).toThrow("1 to 1000");
    expect(() => listCampaignGroups({ ...credential, accountId: "1", status: "ACTIVE)" })).toThrow("status");
  });

  it("creatives.list caps pageSize at 100, encodes the token once and refuses start offsets", async () => {
    const next = await call((fetch) => listCreatives({ ...credential, accountId: "1", pageSize: 100, pageToken: "a+b/c=", fetch }));
    expect(next.url).toBe("https://api.linkedin.com/rest/adAccounts/1/creatives?q=criteria&pageToken=a%2Bb%2Fc%3D&pageSize=100");
    expect(() => listCreatives({ ...credential, accountId: "1", count: 101, fetch: () => undefined })).toThrow("1 to 100");
    expect(() => listCreatives({ ...credential, accountId: "1", start: 5 })).toThrow("pageToken");
  });

  it("sync search finders pass pageToken encoded once and reject pre-encoded tokens", async () => {
    const campaigns = await call((fetch) => executeCampaignsListSync({ ...credential, adAccountId: "1", pageSize: 5, pageToken: "tok=", fetch }));
    expect(campaigns.url).toBe("https://api.linkedin.com/rest/adAccounts/1/adCampaigns?q=search&pageSize=5&pageToken=tok%3D");
    const accounts = await call((fetch) => executeAdAccountsListSync({ ...credential, page_token: "tok", fetch }));
    expect(accounts.url).toBe("https://api.linkedin.com/rest/adAccounts?q=search&pageToken=tok");
    expect(() => pageTokenValue("tok%3D")).toThrow();
    expect(() => executeCreativeAssetsListSync({ ...credential, accountId: "1", pageSize: 101 })).toThrow("1 to 100");
    const batch = await call((fetch) => executeCampaignsListSync({ ...credential, adAccountId: "1", ids: ["7", "8"], fetch }));
    expect(batch.url).toBe("https://api.linkedin.com/rest/adAccounts/1/adCampaigns?ids=List(7,8)");
    expect(batch.method).toBe("BATCH_GET");
  });

  it("healthcheck asks for one account with pageSize, not count", async () => {
    const calls: Seen[] = [];
    const result: any = registry.healthcheck("linkedin-ads", { ...credential, fetch: recorder({ status: 200, body: { elements: [] } }, calls) });
    await result.output;
    expect(calls[0]!.url).toBe("https://api.linkedin.com/rest/adAccounts?q=search&pageSize=1");
  });
});

describe("analytics default projection", () => {
  it("requests costInLocalCurrency by default so cost is not 0", async () => {
    expect(DEFAULT_ANALYTICS_FIELDS).toContain("costInLocalCurrency");
    expect(DEFAULT_ANALYTICS_FIELDS.length - 2).toBeLessThanOrEqual(20);
    const item = cases.find((entry) => entry.operation === "analytics.report.get")!;
    const calls: Seen[] = [];
    const out: any = await getAnalyticsReport({ ...credential, ...item.input, fetch: recorder(item.exchanges[0]!.response, calls) });
    expect(new URL(calls[0]!.url).searchParams.get("fields")?.split(",")).toContain("costInLocalCurrency");
    expect(out.rows[0].costInLocalCurrency).toBeCloseTo(19.91833, 5);
    expect(out.rows[0].impressions).toBe(1520);
  });

  it("always adds dateRange and pivotValues to caller fields and caps at 20 metrics", () => {
    expect(analyticsFields(["costInLocalCurrency"])).toEqual(["dateRange", "pivotValues", "costInLocalCurrency"]);
    expect(analyticsFields(undefined)).toEqual([...DEFAULT_ANALYTICS_FIELDS]);
    expect(() => analyticsFields(Array.from({ length: 21 }, (_, n) => `metric${n}`))).toThrow("20 metrics");
  });
});
