// G1 (v0.6.0): management core. Wire shapes, effect classification, per-op
// requiredScopes, permission mapping, Reconcile observe coverage and the
// campaign_groups.list default search criterion.
import { describe, expect, it } from "bun:test";
import { defaultConnectorRegistry as registry } from "../../../bun/src/registry";
import manifest from "../manifest.json";
import { CAMPAIGN_GROUP_DEFAULT_SEARCH, CAMPAIGN_GROUP_STATUS_VALUES, getAnalyticsReport, getCampaign, listCampaignGroups } from "../src/actions";
import {
  CAMPAIGN_GROUP_MUTABLE_INPUTS,
  CAMPAIGN_MUTABLE_INPUTS,
  CREATIVE_MUTABLE_INPUTS,
  createCampaign,
  createCampaignGroup,
  createCreative,
  deleteCampaignGroup,
  deleteCreative,
  getBudgetPricing,
  getCreative,
  searchAdAccounts,
  searchCampaigns,
  updateCampaign,
  updateCampaignGroup,
  updateCreative,
} from "../src/g1-actions";
import {
  adAccountId,
  CAMPAIGN_GROUP_OBSERVE_FIELDS,
  CAMPAIGN_OBSERVE_FIELDS,
  classifyLinkedInFailure,
  CREATIVE_OBSERVE_FIELDS,
  liAdsFailure,
  resolveObserveFields,
} from "../src/g1-runtime";

type Seen = { url: string; method: string; headers: Record<string, string>; body: string | null };
type Reply = { status: number; headers?: Record<string, string>; body?: unknown };

const credential = { accessToken: "fixture-access-value" };
const operations = manifest.operations as unknown as Record<string, Record<string, any>>;

const G1 = {
  reads: ["ad_accounts.search", "campaigns.search", "ad_account_users.list_mine", "ad_account_users.list", "creatives.get", "budget_pricing.get"],
  creates: ["campaign_groups.create", "campaigns.create", "creatives.create"],
  updates: { "campaign_groups.update": "campaign_groups.get", "campaigns.update": "campaigns.get", "creatives.update": "creatives.get" } as Record<string, string>,
  deletes: ["campaign_groups.delete", "campaigns.delete", "creatives.delete"],
};
const ALL_G1 = [...G1.reads, ...G1.creates, ...Object.keys(G1.updates), ...G1.deletes];

function fake(replies: Reply[], calls: Seen[]) {
  return (input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, key) => { headers[key] = value; });
    calls.push({ url: String(input), method: init.method ?? "GET", headers, body: typeof init.body === "string" ? init.body : null });
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)]!;
    const payload = reply.body === undefined || reply.body === null ? null : JSON.stringify(reply.body);
    return Promise.resolve(new Response(payload, { status: reply.status, headers: reply.headers ?? {} }));
  };
}

async function failure(promise: unknown): Promise<any> {
  try { await promise; } catch (error) { return error; }
  throw new Error("expected a failure");
}

describe("G1 manifest contract", () => {
  it("is v0.6.0 with 47 ops and 15 new G1 ops", () => {
    expect(manifest.version).toBe("0.6.0");
    expect(Object.keys(operations)).toHaveLength(47);
    expect(ALL_G1).toHaveLength(15);
    for (const key of ALL_G1) expect(operations[key], key).toBeDefined();
    expect(operations["creative_assets.list"]).toBeDefined();
    expect(operations["ad_accounts.search"]).toBeDefined();
    expect(operations["campaigns.search"]).toBeDefined();
  });

  it("classifies effects: reads and creates/deletes omit every effect key, updates Reconcile on the matching get", () => {
    for (const key of [...G1.reads, ...G1.creates, ...G1.deletes]) {
      expect(operations[key]!.effectPolicy, key).toBeUndefined();
      expect(operations[key]!.reconcile, key).toBeUndefined();
    }
    for (const [key, observe] of Object.entries(G1.updates)) {
      expect(operations[key]!.effectPolicy, key).toBe("Reconcile");
      expect(operations[key]!.reconcile, key).toBe(observe);
      expect(operations[observe]!.sideEffect, observe).toBe("read");
    }
    for (const op of Object.values(operations)) expect(op.effectPolicy).not.toBe("Idempotent");
    for (const key of G1.reads) expect(operations[key]!.sideEffect, key).toBe("read");
    for (const key of [...G1.creates, ...Object.keys(G1.updates)]) expect(operations[key]!.sideEffect, key).toBe("write");
  });

  it("marks every delete destructive with no effect keys", () => {
    for (const key of G1.deletes) {
      const op = operations[key]!;
      expect(op.sideEffect, key).toBe("destructive");
      for (const effectKey of ["effectPolicy", "reconcile", "observe"]) expect(Object.hasOwn(op, effectKey), `${key}.${effectKey}`).toBe(false);
    }
    const destructive = Object.entries(operations).filter(([, op]) => op.sideEffect === "destructive").map(([key]) => key).sort();
    expect(destructive).toEqual([...G1.deletes].sort());
  });

  it("declares op-level requiredScopes and adds nothing to auth.scopes", () => {
    for (const key of G1.reads) expect(operations[key]!.requiredScopes, key).toEqual(["r_ads"]);
    for (const key of [...G1.creates, ...Object.keys(G1.updates), ...G1.deletes]) expect(operations[key]!.requiredScopes, key).toEqual(["rw_ads"]);
    expect(manifest.auth.scopes).toEqual(["r_ads", "rw_ads", "r_ads_reporting", "r_organization_social", "r_organization_admin", "rw_organization_admin"]);
  });

  it("campaign_groups.list status enum matches the code list, creatives.list pageSize max is 100", () => {
    expect(operations["campaign_groups.list"]!.inputSchema.properties.status.enum).toEqual([...CAMPAIGN_GROUP_STATUS_VALUES]);
    expect(operations["creatives.list"]!.inputSchema.properties.pageSize).toMatchObject({ minimum: 1, maximum: 100 });
  });

  it("cursor ops declare an optional nullable nextPageToken output", () => {
    for (const key of ["ad_accounts.search", "campaigns.search", "campaign_groups.list", "creatives.list", "ad_accounts.list", "campaigns.list", "creative_assets.list"]) {
      expect(operations[key]!.outputSchema.properties.nextPageToken.type, key).toEqual(["string", "null"]);
    }
  });
});

describe("Reconcile observe coverage (resolveObserveFields)", () => {
  const pairs = [
    ["campaign_groups.update", CAMPAIGN_GROUP_MUTABLE_INPUTS, CAMPAIGN_GROUP_OBSERVE_FIELDS],
    ["campaigns.update", CAMPAIGN_MUTABLE_INPUTS, CAMPAIGN_OBSERVE_FIELDS],
    ["creatives.update", CREATIVE_MUTABLE_INPUTS, CREATIVE_OBSERVE_FIELDS],
  ] as const;

  it("the observe get's default fields cover every mutable update input", () => {
    for (const [key, mutable, defaults] of pairs) {
      const observed = resolveObserveFields({}, defaults);
      for (const field of mutable) expect(observed, `${key}.${field}`).toContain(field);
      const declared = Object.keys(operations[key]!.inputSchema.properties).filter((name) => !["accountId", "campaignGroupId", "campaignId", "creativeId"].includes(name));
      expect(declared.sort(), key).toEqual([...mutable].sort());
    }
  });

  it("ignores a passed fields value and never projects the observe", async () => {
    for (const [, , defaults] of pairs) expect(resolveObserveFields({ fields: ["id"] }, defaults)).toEqual(defaults);
    const calls: Seen[] = [];
    await getCreative({ ...credential, accountId: "1", creativeId: "2", fields: "id", fetch: fake([{ status: 200, body: { id: "urn:li:sponsoredCreative:2" } }], calls) });
    await getCampaign({ ...credential, accountId: "1", campaignId: "3", fields: "id", fetch: fake([{ status: 200, body: { id: 3 } }], calls) } as never);
    for (const call of calls) expect(call.url).not.toContain("fields=");
    for (const observe of Object.values(G1.updates)) expect(operations[observe]!.inputSchema.properties.fields, observe).toBeUndefined();
    const result: any = registry.executeAction("linkedin-ads", "creatives.update", { ...credential, accountId: "1", creativeId: "2", name: "x", fields: ["id"], fetch: fake([{ status: 204 }], []) });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("INVALID_ACTION_INPUT");
  });

  it("registry dispatch returns the observed get after the write", async () => {
    const calls: Seen[] = [];
    const result: any = registry.executeAction("linkedin-ads", "campaign_groups.update", {
      ...credential, accountId: "7", campaignGroupId: "8", status: "PAUSED",
      fetch: fake([{ status: 204 }, { status: 200, body: { id: 8, name: "G", status: "PAUSED" } }], calls),
    });
    expect(result.ok).toBe(true);
    const output = await result.output;
    expect(output.action).toBe("campaign_groups.get");
    expect(output.campaignGroup.status).toBe("PAUSED");
    expect(calls.map((call) => `${call.method} ${new URL(call.url).pathname}`)).toEqual([
      "POST /rest/adAccounts/7/adCampaignGroups/8",
      "GET /rest/adAccounts/7/adCampaignGroups/8",
    ]);
  });
});

describe("wire shapes", () => {
  it("partial updates POST {patch:{$set}} with X-RestLi-Method PARTIAL_UPDATE and the pinned headers", async () => {
    const calls: Seen[] = [];
    const out: any = await updateCampaign({ ...credential, accountId: "urn:li:sponsoredAccount:5", campaignId: "urn:li:sponsoredCampaign:6", name: "N", dailyBudget: { amount: "10.00", currencyCode: "USD" }, fetch: fake([{ status: 204 }], calls) });
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.url).toBe("https://api.linkedin.com/rest/adAccounts/5/adCampaigns/6");
    expect(calls[0]!.headers["x-restli-method"]).toBe("PARTIAL_UPDATE");
    expect(calls[0]!.headers["linkedin-version"]).toBe("202609");
    expect(calls[0]!.headers["x-restli-protocol-version"]).toBe("2.0.0");
    expect(JSON.parse(calls[0]!.body!)).toEqual({ patch: { $set: { name: "N", dailyBudget: { amount: "10.00", currencyCode: "USD" } } } });
    expect(out.updated).toEqual(["name", "dailyBudget"]);
    expect(() => updateCreative({ ...credential, accountId: "1", creativeId: "2" })).toThrow("at least one field");
  });

  it("creates read the new id from x-restli-id on 201", async () => {
    const group: any = await createCampaignGroup({ ...credential, accountId: "1", name: "G", status: "DRAFT", runSchedule: { start: 1 }, fetch: fake([{ status: 201, headers: { "x-restli-id": "99" } }], []) });
    expect(group).toMatchObject({ campaignGroupId: "99", campaignGroupUrn: "urn:li:sponsoredCampaignGroup:99" });
    const creative: any = await createCreative({ ...credential, accountId: "1", campaign: "2", contentReference: "urn:li:ugcPost:3", intendedStatus: "DRAFT", fetch: fake([{ status: 201, headers: { "x-restli-id": "urn%3Ali%3AsponsoredCreative%3A44" } }], []) });
    expect(creative).toMatchObject({ creativeId: "44", creativeUrn: "urn:li:sponsoredCreative:44" });
    expect(() => createCampaignGroup({ ...credential, accountId: "1", name: "G", status: "DRAFT", runSchedule: { start: 1 }, totalBudget: { amount: "1", currencyCode: "USD" } })).toThrow("runSchedule.end");
  });

  it("campaigns.create requires interfaceLocales targeting, a budget and the documented required fields", () => {
    const base = {
      accountId: "1", campaignGroup: "2", name: "C", type: "SPONSORED_UPDATES", costType: "CPM", unitCost: { amount: "5", currencyCode: "USD" },
      locale: { country: "US", language: "en" }, status: "DRAFT", offsiteDeliveryEnabled: false, politicalIntent: "NOT_POLITICAL",
      dailyBudget: { amount: "50", currencyCode: "USD" },
      targetingCriteria: { include: { and: [{ or: { "urn:li:adTargetingFacet:interfaceLocales": ["urn:li:locale:en_US"] } }] } },
    };
    expect((createCampaign(base) as any).validated.campaignGroup).toBe("urn:li:sponsoredCampaignGroup:2");
    expect(() => createCampaign({ ...base, targetingCriteria: { include: { and: [] } } })).toThrow("interfaceLocales");
    expect(() => createCampaign({ ...base, dailyBudget: undefined })).toThrow("dailyBudget or totalBudget");
  });

  it("deletes DELETE a DRAFT, retire anything else to PENDING_DELETION, and leave removed ones alone", async () => {
    const draft: Seen[] = [];
    const a: any = await deleteCampaignGroup({ ...credential, accountId: "1", campaignGroupId: "2", fetch: fake([{ status: 200, body: { status: "DRAFT" } }, { status: 204 }], draft) });
    expect(draft.map((call) => call.method)).toEqual(["GET", "DELETE"]);
    expect(draft[1]!.headers["x-restli-method"]).toBe("DELETE");
    expect(a).toMatchObject({ method: "DELETE", previousStatus: "DRAFT" });
    const active: Seen[] = [];
    const b: any = await deleteCreative({ ...credential, accountId: "1", creativeId: "3", fetch: fake([{ status: 200, body: { intendedStatus: "ACTIVE" } }, { status: 204 }], active) });
    expect(active[1]!.url).toBe("https://api.linkedin.com/rest/adAccounts/1/creatives/urn%3Ali%3AsponsoredCreative%3A3");
    expect(JSON.parse(active[1]!.body!)).toEqual({ patch: { $set: { intendedStatus: "PENDING_DELETION" } } });
    expect(b).toMatchObject({ method: "PENDING_DELETION", status: "PENDING_DELETION" });
    const gone: Seen[] = [];
    const c: any = await deleteCampaignGroup({ ...credential, accountId: "1", campaignGroupId: "2", fetch: fake([{ status: 200, body: { status: "REMOVED" } }], gone) });
    expect(gone).toHaveLength(1);
    expect(c.method).toBe("NONE");
  });

  it("searches build Rest.li search=(...) with leaves encoded once and return nextPageToken", async () => {
    const calls: Seen[] = [];
    const accounts: any = await searchAdAccounts({ ...credential, type: ["BUSINESS"], test: false, pageToken: "a+b", fetch: fake([{ status: 200, body: { elements: [], metadata: { nextPageToken: "n2" } } }], calls) });
    expect(calls[0]!.url).toBe("https://api.linkedin.com/rest/adAccounts?q=search&search=(type:(values:List(BUSINESS)),test:false)&pageToken=a%2Bb");
    expect(accounts.nextPageToken).toBe("n2");
    const bare: Seen[] = [];
    await searchAdAccounts({ ...credential, fetch: fake([{ status: 200, body: { elements: [] } }], bare) });
    expect(bare[0]!.url).toBe("https://api.linkedin.com/rest/adAccounts?q=search");
    const campaigns: Seen[] = [];
    const out: any = await searchCampaigns({ ...credential, accountId: "1", fetch: fake([{ status: 200, body: { elements: [] } }], campaigns) });
    expect(campaigns[0]!.url).toBe("https://api.linkedin.com/rest/adAccounts/1/adCampaigns?q=search&search=(status:(values:List(ACTIVE,PAUSED,ARCHIVED,COMPLETED,CANCELED,DRAFT,PENDING_DELETION,REMOVED)))");
    expect(out.nextPageToken).toBeNull();
    expect(() => searchCampaigns({ ...credential, accountId: "1", pageSize: 1001 })).toThrow("1 to 1000");
  });

  it("budget_pricing.get uses the criteriaV2 finder with targeting encoded once", async () => {
    const calls: Seen[] = [];
    await getBudgetPricing({ ...credential, accountId: "1", campaignType: "TEXT_AD", bidType: "CPC", matchType: "EXACT", targetingCriteria: "(include:(and:List((or:(urn:li:adTargetingFacet:locations:List(urn:li:geo:1))))))", fetch: fake([{ status: 200, body: { elements: [] } }], calls) });
    expect(calls[0]!.url).toContain("/rest/adBudgetPricing?q=criteriaV2&account=urn%3Ali%3AsponsoredAccount%3A1&");
    expect(calls[0]!.url).not.toContain("%25");
  });
});

describe("campaign_groups.list default search criterion (d)", () => {
  it("sends the documented all-status criterion when status is omitted, never a bare q=search", async () => {
    // GRP (view=li-lms-2026-09) Search for Campaign Groups: "Search criteria is mandatory".
    expect(CAMPAIGN_GROUP_DEFAULT_SEARCH).toBe("(status:(values:List(ACTIVE,ARCHIVED,CANCELED,DRAFT,PAUSED,PENDING_DELETION,REMOVED)))");
    const calls: Seen[] = [];
    await listCampaignGroups({ ...credential, accountId: "1", fetch: fake([{ status: 200, body: { elements: [] } }], calls) });
    expect(calls[0]!.url).toBe(`https://api.linkedin.com/rest/adAccounts/1/adCampaignGroups?q=search&search=${CAMPAIGN_GROUP_DEFAULT_SEARCH}`);
  });
});

describe("input union removal (e)", () => {
  it("analytics fields accepts an array; a direct caller's comma string is normalized", async () => {
    const calls: Seen[] = [];
    await getAnalyticsReport({ ...credential, pivot: "ACCOUNT", accounts: ["1"], dateRangeStart: "2026-09-01", fields: "impressions, clicks", fetch: fake([{ status: 200, body: { elements: [] } }], calls) });
    expect(new URL(calls[0]!.url).searchParams.get("fields")).toBe("dateRange,pivotValues,impressions,clicks");
    const result: any = registry.executeAction("linkedin-ads", "analytics.report.get", { ...credential, pivot: "ACCOUNT", accounts: ["1"], dateRangeStart: "2026-09-01", fields: "impressions" });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("INVALID_ACTION_INPUT");
  });

  it("ad account ids are strings of digits or sponsoredAccount URNs, coerced in the handler", () => {
    expect(adAccountId("123")).toBe("123");
    expect(adAccountId("urn:li:sponsoredAccount:123")).toBe("123");
    expect(adAccountId(123)).toBe("123");
    expect(() => adAccountId("12a")).toThrow("digits");
    expect(() => adAccountId("urn:li:organization:1")).toThrow("digits");
    const result: any = registry.executeAction("linkedin-ads", "campaigns.get", { ...credential, accountId: 1, campaignId: "2" });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("INVALID_ACTION_INPUT");
  });
});

describe("permission mapping", () => {
  it("maps 403 and LinkedIn ACCESS_DENIED / serviceErrorCode 100 to CONNECTOR_CAPABILITY_MISSING", () => {
    expect(classifyLinkedInFailure(403, {})).toBe("permission_missing");
    expect(classifyLinkedInFailure(401, { serviceErrorCode: 100, message: "Not enough permissions to access" })).toBe("permission_missing");
    expect(classifyLinkedInFailure(400, { code: "ACCESS_DENIED" })).toBe("permission_missing");
    const error: any = liAdsFailure("campaigns.update", 403, { status: 403, serviceErrorCode: 100 });
    expect(error).toMatchObject({
      code: "CONNECTOR_CAPABILITY_MISSING", reason: "permission_missing", missingScopes: ["rw_ads"], requiredScopes: ["rw_ads"], reconsentRequired: true,
    });
  });

  it("surfaces CONNECTOR_CAPABILITY_MISSING through registry dispatch on a 403", async () => {
    for (const [operation, input, scopes] of [
      ["creatives.get", { accountId: "1", creativeId: "2" }, ["r_ads"]],
      ["campaign_groups.create", { accountId: "1", name: "G", status: "DRAFT", runSchedule: { start: 1 } }, ["rw_ads"]],
    ] as const) {
      const result: any = registry.executeAction("linkedin-ads", operation, { ...credential, ...input, fetch: fake([{ status: 403, body: { status: 403, serviceErrorCode: 100, code: "ACCESS_DENIED", message: "Not enough permissions to access: partnerApiAdAccounts" } }], []) });
      expect(result.ok).toBe(true);
      const error = await failure(result.output);
      expect(error, operation).toMatchObject({ code: "CONNECTOR_CAPABILITY_MISSING", reason: "permission_missing", missingScopes: scopes, requiredScopes: scopes, reconsentRequired: true });
    }
  });

  it("keeps plain 400 and 422 as CONNECTOR_UPSTREAM_ERROR and 429 as rate limited", async () => {
    for (const status of [400, 422]) {
      const error = await failure(updateCampaignGroup({ ...credential, accountId: "1", campaignGroupId: "2", name: "x", fetch: fake([{ status, body: { status, message: "Invalid field value", errorDetails: { inputErrors: [{ code: "FIELD_VALUE_TOO_LOW" }] } } }], []) }));
      expect(error.code, String(status)).toBe("CONNECTOR_UPSTREAM_ERROR");
      expect(error.reason).toBeUndefined();
    }
    const limited = await failure(searchCampaigns({ ...credential, accountId: "1", fetch: fake([{ status: 429, headers: { "retry-after": "12" }, body: {} }], []) }));
    expect(limited).toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 12 });
  });
});
