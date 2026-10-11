import { createLinkedInAdsClient } from "./http";
import { parseAdAccountsResponse } from "./objects";
import type { NormalizedAdAccount } from "./objects";
import { parseCampaignsResponse } from "./objects";
import type { NormalizedCampaign } from "./objects";
import { parseCreativeAssetsResponse } from "./objects";
import type { NormalizedCreativeAsset } from "./objects";
import { asId, assertRestli, assertToken, pageSize, qs, resourceId, restliList, stringList } from "./restli";

type Live = { accessToken?: unknown; fetch?: unknown; response?: unknown };

export type CampaignsListSyncInput = Live & {
  response?: unknown;
  adAccountId?: unknown;
  accountId?: unknown;
  q?: unknown;
  ids?: unknown;
  search?: unknown;
  status?: unknown;
  pageSize?: unknown;
  pageToken?: unknown;
  sortOrder?: unknown;
};
export type CampaignsListSyncResult = { provider: "linkedin-ads"; operation: "campaigns.list"; items: NormalizedCampaign[]; nextStart: number | null };

export type AdAccountsListSyncInput = Live & {
  response?: unknown;
  search?: unknown;
  status?: unknown;
  type?: unknown;
  test?: unknown;
  name?: unknown;
  id?: unknown;
  reference?: unknown;
  page_size?: unknown;
  pageSize?: unknown;
  page_token?: unknown;
  pageToken?: unknown;
  sort_order?: unknown;
  sortOrder?: unknown;
};
export type AdAccountsListSyncResult = { provider: "linkedin-ads"; operation: "ad_accounts.list"; items: NormalizedAdAccount[]; nextStart: number | null };

export type CreativeAssetsListSyncInput = Live & {
  response?: unknown;
  accountId?: unknown;
  adAccountId?: unknown;
  intendedStatuses?: unknown;
  pageSize?: unknown;
  page_size?: unknown;
};
export type CreativeAssetsListSyncResult = { provider: "linkedin-ads"; operation: "creative_assets.list"; items: NormalizedCreativeAsset[]; nextStart: number | null };

function hasLiveAuth(input: Live): input is Live & { accessToken: string } {
  return typeof input.accessToken === "string" && input.accessToken.length > 0;
}

function client(input: Live & { accessToken: string }, operation: string) {
  return createLinkedInAdsClient({
    accessToken: input.accessToken,
    fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    operation,
  });
}

function upstream(status: number): never {
  if (status === 429) {
    throw Object.assign(new Error("LinkedIn Ads rate limit exceeded."), { code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 30 });
  }
  throw Object.assign(new Error("LinkedIn Ads rejected the request."), { code: "CONNECTOR_UPSTREAM_ERROR" });
}

function searchValues(value: unknown, field: string): string[] | undefined {
  return stringList(value, field, /^[A-Za-z0-9_.:-]{1,200}$/, 50);
}

function searchExpression(clauses: string[], raw: unknown): string | undefined {
  if (typeof raw === "string" && raw !== "") return assertRestli(raw, "search");
  if (clauses.length === 0) return undefined;
  return `(${clauses.join(",")})`;
}

function clause(field: string, values: string[] | undefined): string | undefined {
  if (!values) return undefined;
  return `${field}:(values:List(${values.join(",")}))`;
}

async function fetchJSON(input: Live & { accessToken: string }, operation: string, path: string): Promise<unknown> {
  const response = await client(input, operation).fetchJSON(path, { method: "GET", headers: { "X-RestLi-Method": "FINDER" } });
  if (response.status < 200 || response.status >= 300) upstream(response.status);
  return response.body;
}

export function executeCampaignsListSync(input: CampaignsListSyncInput): CampaignsListSyncResult | Promise<CampaignsListSyncResult> {
  if (hasLiveAuth(input)) {
    const account = asId(input.adAccountId) ?? asId(input.accountId);
    if (!account) throw new Error("adAccountId is required");
    const accountId = resourceId(account, ["urn:li:sponsoredAccount:"]);
    const ids = stringList(input.ids, "ids", /^[0-9]{1,20}$/, 100);
    const pairs: Array<[string, string]> = [];
    if (ids) {
      pairs.push(["ids", restliList(ids)]);
    } else {
      const status = searchValues(input.status, "status");
      const search = searchExpression([clause("status", status)].filter((item): item is string => !!item), input.search);
      pairs.push(["q", typeof input.q === "string" && input.q !== "" ? assertToken(input.q, "q") : "search"]);
      if (search) pairs.push(["search", search]);
      const size = pageSize(input.pageSize);
      if (size) pairs.push(["pageSize", size]);
      if (typeof input.pageToken === "string" && input.pageToken !== "") pairs.push(["pageToken", assertRestli(input.pageToken, "pageToken")]);
      if (typeof input.sortOrder === "string" && input.sortOrder !== "") pairs.push(["sortOrder", assertToken(input.sortOrder, "sortOrder")]);
    }
    return fetchJSON(input, "campaigns.list", `/rest/adAccounts/${accountId}/adCampaigns?${qs(pairs)}`).then((body) => {
      const parsed = parseCampaignsResponse(body);
      return { provider: "linkedin-ads", operation: "campaigns.list", items: parsed.campaigns, nextStart: parsed.nextStart };
    });
  }
  const parsed = parseCampaignsResponse(input.response);
  return { provider: "linkedin-ads", operation: "campaigns.list", items: parsed.campaigns, nextStart: parsed.nextStart };
}

export function executeAdAccountsListSync(input: AdAccountsListSyncInput): AdAccountsListSyncResult | Promise<AdAccountsListSyncResult> {
  if (hasLiveAuth(input)) {
    const clauses = [
      clause("status", searchValues(input.status, "status")),
      clause("type", searchValues(input.type, "type")),
      clause("name", searchValues(input.name, "name")),
      clause("id", searchValues(input.id, "id")),
      clause("reference", searchValues(input.reference, "reference")),
    ].filter((item): item is string => !!item);
    if (typeof input.test === "boolean") clauses.push(`test:(values:List(${input.test}))`);
    const search = searchExpression(clauses, input.search);
    const pairs: Array<[string, string]> = [["q", "search"]];
    if (search) pairs.push(["search", search]);
    const size = pageSize(input.pageSize ?? input.page_size, "page_size");
    if (size) pairs.push(["pageSize", size]);
    const token = input.pageToken ?? input.page_token;
    if (typeof token === "string" && token !== "") pairs.push(["pageToken", assertRestli(token, "pageToken")]);
    const sort = input.sortOrder ?? input.sort_order;
    if (typeof sort === "string" && sort !== "") pairs.push(["sortOrder", assertToken(sort, "sortOrder")]);
    return fetchJSON(input, "ad_accounts.list", `/rest/adAccounts?${qs(pairs)}`).then((body) => {
      const parsed = parseAdAccountsResponse(body);
      return { provider: "linkedin-ads", operation: "ad_accounts.list", items: parsed.adAccounts, nextStart: parsed.nextStart };
    });
  }
  const parsed = parseAdAccountsResponse(input.response);
  return { provider: "linkedin-ads", operation: "ad_accounts.list", items: parsed.adAccounts, nextStart: parsed.nextStart };
}

export function executeCreativeAssetsListSync(input: CreativeAssetsListSyncInput): CreativeAssetsListSyncResult | Promise<CreativeAssetsListSyncResult> {
  if (hasLiveAuth(input)) {
    const account = asId(input.accountId) ?? asId(input.adAccountId);
    if (!account) throw new Error("accountId is required");
    const accountId = resourceId(account, ["urn:li:sponsoredAccount:"]);
    const statuses = searchValues(input.intendedStatuses, "intendedStatuses");
    const pairs: Array<[string, string]> = [["q", "criteria"]];
    if (statuses) pairs.push(["intendedStatuses", restliList(statuses)]);
    const size = pageSize(input.pageSize ?? input.page_size, "pageSize");
    if (size) pairs.push(["pageSize", size]);
    return fetchJSON(input, "creative_assets.list", `/rest/adAccounts/${accountId}/creatives?${qs(pairs)}`).then((body) => {
      const parsed = parseCreativeAssetsResponse(body);
      return { provider: "linkedin-ads", operation: "creative_assets.list", items: parsed.creativeAssets, nextStart: parsed.nextStart };
    });
  }
  const parsed = parseCreativeAssetsResponse(input.response);
  return { provider: "linkedin-ads", operation: "creative_assets.list", items: parsed.creativeAssets, nextStart: parsed.nextStart };
}

