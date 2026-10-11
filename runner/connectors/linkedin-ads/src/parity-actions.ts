import { createLinkedInAdsClient } from "./http";
import { enc, qs } from "./restli";

type Pairs = Array<[string, string]>;

type Input = Record<string, unknown>;
type ActionResult = Record<string, unknown> | Promise<Record<string, unknown>>;

const CONNECTOR = "linkedin-ads";
const ACL_ROLES = new Set([
  "ADMINISTRATOR",
  "DIRECT_SPONSORED_CONTENT_POSTER",
  "RECRUITING_POSTER",
  "LEAD_CAPTURE_ADMINISTRATOR",
  "LEAD_GEN_FORMS_MANAGER",
  "ANALYST",
  "CURATOR",
  "CONTENT_ADMINISTRATOR",
]);
const ACL_STATES = new Set(["APPROVED", "REJECTED", "REQUESTED", "REVOKED"]);
const LEAD_FORM_STATES = new Set(["DRAFT", "PUBLISHED", "ARCHIVED"]);
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function record(value: unknown): value is Input {
  return isRecord(value);
}
function requiredString(input: Input, key: string, aliases: string[] = []): string {
  const raw = input[key] ?? aliases.map((alias) => input[alias]).find((value) => typeof value === "string");
  if (typeof raw !== "string" || raw.trim() === "") throw new Error(`${key} is required`);
  return raw.trim();
}
function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}
function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${field} must be a boolean`);
  return value;
}
function boundedId(value: string, field: string, urnPrefix?: string): string {
  const id = urnPrefix && value.startsWith(urnPrefix) ? value.slice(urnPrefix.length) : value;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error(`${field} must be a LinkedIn resource ID or URN`);
  return id;
}
function hasLiveAuth(input: unknown): input is Input & { accessToken: string } {
  return record(input) && typeof input.accessToken === "string" && input.accessToken.length > 0;
}
function liveClient(input: Input, operation: string) {
  return createLinkedInAdsClient({
    accessToken: String(input.accessToken),
    fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    operation,
  });
}
function upstreamError(status: number, headers: Record<string, string>): Error {
  if (status === 429) {
    const raw = headers["retry-after"] ?? headers["Retry-After"] ?? headers["x-ratelimit-reset"];
    const seconds = Number(raw);
    return Object.assign(new Error("LinkedIn Ads rate limit exceeded."), {
      code: "CONNECTOR_RATE_LIMITED",
      retryAfterSeconds: Number.isFinite(seconds) && seconds > 0 ? seconds : 30,
    });
  }
  return Object.assign(new Error("LinkedIn Ads rejected the request."), { code: "CONNECTOR_UPSTREAM_ERROR" });
}
function ok(status: number): boolean {
  return status >= 200 && status < 300;
}
function header(headers: Record<string, string>, name: string): string | undefined {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted && value) return value;
  }
  return undefined;
}
function elements(body: Record<string, unknown>): unknown[] {
  return Array.isArray(body.elements) ? body.elements : [];
}
function nextStart(body: Record<string, unknown>): number | null {
  if (!isRecord(body.paging) || !Array.isArray(body.paging.links)) return null;
  const link = body.paging.links.find((item) => isRecord(item) && item.rel === "next" && typeof item.uri === "string");
  if (!isRecord(link) || typeof link.uri !== "string") return null;
  const start = new URL(link.uri, "https://api.linkedin.com").searchParams.get("start");
  return start && /^\d+$/.test(start) ? Number(start) : null;
}
function pagingCount(body: Record<string, unknown>): number {
  return isRecord(body.paging) && typeof body.paging.count === "number" ? body.paging.count : 0;
}
// Index-paged finders only (leadForms, conversions, dmpSegments, organizationAcls,
// organizations, posts, events still document start/count in 202609).
function optionalPaging(input: Input, params: Pairs): void {
  const count = input.count ?? input.page_size;
  const start = input.start ?? (typeof input.page_token === "string" && /^\d+$/.test(input.page_token) ? Number(input.page_token) : undefined);
  for (const [key, value] of [["start", start], ["count", count]] as const) {
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > (key === "count" ? 1000 : 1_000_000)) {
      throw new Error(`${key} must be a non-negative integer${key === "count" ? " no greater than 1000" : ""}`);
    }
    params.push([key, String(value)]);
  }
  if (typeof input.page_token === "string" && input.page_token !== "" && !/^\d+$/.test(input.page_token)) {
    if (input.page_token.length > 512) throw new Error("page_token is too long");
    params.push(["pageToken", enc(input.page_token)]);
  }
}
function toUrn(value: string, field: string, prefix: string): string {
  return `${prefix}${boundedId(value, field, prefix)}`;
}
function organizationUrn(value: string, field = "organization"): string {
  if (value.startsWith("urn:li:organizationBrand:")) return toUrn(value, field, "urn:li:organizationBrand:");
  return toUrn(value, field, "urn:li:organization:");
}
function personUrn(value: string, field = "roleAssignee"): string {
  return toUrn(value, field, "urn:li:person:");
}
function sponsoredAccountUrn(value: string, field = "account"): string {
  return toUrn(value, field, "urn:li:sponsoredAccount:");
}
/** Rest.li 2.0 List(...) with every leaf encoded once and the delimiters raw. */
function encodeRestliList(values: string[]): string {
  return `List(${values.map(enc).join(",")})`;
}
/**
 * Rest.li 2.0 record timeIntervals=(timeRange:(start:..,end:..),timeGranularityType:DAY)
 * (organization page / follower / share statistics, "Restli 2.0" samples). The dotted
 * timeIntervals.timeRange.start form is the Rest.li 1.0 syntax.
 */
function applyTimeIntervals(input: Input, params: Pairs): void {
  const raw = input.timeIntervals;
  if (raw === undefined) return;
  if (!isRecord(raw)) throw new Error("timeIntervals must be an object");
  const parts: string[] = [];
  const range = raw.timeRange;
  if (range !== undefined) {
    if (!isRecord(range)) throw new Error("timeIntervals.timeRange must be an object");
    const bounds: string[] = [];
    for (const key of ["start", "end"] as const) {
      const value = range[key];
      if (value === undefined) continue;
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
        throw new Error(`timeIntervals.timeRange.${key} must be a Unix timestamp in milliseconds`);
      }
      bounds.push(`${key}:${value}`);
    }
    if (bounds.length > 0) parts.push(`timeRange:(${bounds.join(",")})`);
  }
  const gran = raw.timeGranularityType;
  if (gran !== undefined) {
    if (gran !== "DAY" && gran !== "MONTH") throw new Error("timeIntervals.timeGranularityType must be DAY or MONTH");
    parts.push(`timeGranularityType:${gran}`);
  }
  if (parts.length > 0) params.push(["timeIntervals", `(${parts.join(",")})`]);
}
function requiredStringArray(value: unknown, field: string, min = 1, max = 50): string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new Error(`${field} must contain ${min} to ${max} values`);
  }
  if (!value.every((item) => typeof item === "string" && item.length > 0 && item.length <= 256)) {
    throw new Error(`${field} must be an array of LinkedIn URNs or identifiers`);
  }
  return value as string[];
}
async function send(input: Input, operation: string, path: string, init: RequestInit = {}): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
  return liveClient(input, operation).fetchJSON(path, init);
}
function result(operation: string, extra: Record<string, unknown>): Record<string, unknown> {
  return { connector: CONNECTOR, action: operation, source: "connector", ...extra };
}

export function createAdAccount(value: unknown): ActionResult {
  if (!record(value)) throw new Error("ad_accounts.create input must be an object");
  const name = requiredString(value, "name");
  if (name.length > 256) throw new Error("name must be 256 characters or fewer");
  const type = requiredString(value, "type").toUpperCase();
  if (type !== "BUSINESS") throw new Error("type must be BUSINESS");
  const reference = requiredString(value, "reference");
  if (!reference.startsWith("urn:li:person:") && !reference.startsWith("urn:li:organization:")) {
    throw new Error("reference must be a person or organization URN");
  }
  const currency = (optionalString(value.currency) ?? "USD").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("currency must be a 3-letter ISO code");
  const body: Input = { name, type, currency, reference };
  for (const field of [
    "test",
    "notifiedOnEndOfCampaign",
    "notifiedOnCreativeApproval",
    "notifiedOnCreativeRejection",
    "notifiedOnNewFeaturesEnabled",
    "notifiedOnCampaignOptimization",
  ] as const) {
    const flag = optionalBoolean(value[field], field);
    if (flag !== undefined) body[field] = flag;
  }
  if (!hasLiveAuth(value)) return result("ad_accounts.create", { adAccount: null, validated: body });
  return send(value, "ad_accounts.create", "/rest/adAccounts", { method: "POST", body: JSON.stringify(body) }).then((response) => {
    if (!ok(response.status)) throw upstreamError(response.status, response.headers);
    const created = isRecord(response.body) ? response.body : {};
    const id = created.id ?? header(response.headers, "x-restli-id") ?? null;
    return result("ad_accounts.create", { adAccount: { ...created, id } });
  });
}

function leadFormOwner(raw: unknown): Input {
  if (!isRecord(raw)) throw new Error("owner is required");
  const sponsored = optionalString(raw.sponsoredAccount);
  const organization = optionalString(raw.organization);
  if (Boolean(sponsored) === Boolean(organization)) throw new Error("owner must include sponsoredAccount or organization");
  if (sponsored) return { sponsoredAccount: sponsoredAccountUrn(sponsored, "owner.sponsoredAccount") };
  return { organization: organizationUrn(organization!, "owner.organization") };
}

function leadFormLocale(raw: unknown): { language: string; country: string } {
  if (!isRecord(raw)) throw new Error("creationLocale is required");
  const language = requiredString(raw, "language");
  const country = requiredString(raw, "country");
  if (!/^[a-z]{2}$/.test(language) || !/^[A-Z]{2}$/.test(country)) throw new Error("creationLocale must use ISO language and country codes");
  return { language, country };
}

function leadFormContent(raw: unknown): Input {
  if (!isRecord(raw)) throw new Error("content is required");
  if (!Array.isArray(raw.questions) || raw.questions.length < 1 || raw.questions.length > 20) {
    throw new Error("content.questions must contain 1 to 20 questions");
  }
  const encoded = JSON.stringify(raw);
  if (encoded.length > 32_000) throw new Error("content is too large");
  return raw;
}

function hiddenFields(raw: unknown): Input[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length > 20) throw new Error("hiddenFields must contain at most 20 fields");
  return raw.map((item, index) => {
    if (!isRecord(item)) throw new Error(`hiddenFields[${index}] must be an object`);
    const name = requiredString(item, "name");
    const value = requiredString(item, "value");
    if (name.length > 256 || value.length > 256) throw new Error("hiddenFields name and value must be 256 characters or fewer");
    return { name, value };
  });
}

export function createLeadForm(value: unknown): ActionResult {
  if (!record(value)) throw new Error("lead_forms.create input must be an object");
  const name = requiredString(value, "name");
  if (name.length > 256) throw new Error("name must be 256 characters or fewer");
  const state = requiredString(value, "state").toUpperCase();
  if (!LEAD_FORM_STATES.has(state)) throw new Error("state must be DRAFT, PUBLISHED, or ARCHIVED");
  const body: Input = {
    name,
    state,
    owner: leadFormOwner(value.owner),
    creationLocale: leadFormLocale(value.creationLocale),
    content: leadFormContent(value.content),
  };
  const hidden = hiddenFields(value.hiddenFields);
  if (hidden) body.hiddenFields = hidden;
  if (!hasLiveAuth(value)) return result("lead_forms.create", { leadForm: null, validated: body });
  return send(value, "lead_forms.create", "/rest/leadForms", { method: "POST", body: JSON.stringify(body) }).then((response) => {
    if (!ok(response.status)) throw upstreamError(response.status, response.headers);
    const created = isRecord(response.body) ? response.body : {};
    const id = created.id ?? header(response.headers, "x-restli-id") ?? null;
    return result("lead_forms.create", { leadForm: { ...created, id } });
  });
}

export function getNetworkSize(value: unknown): ActionResult {
  if (!record(value)) throw new Error("organizations.network_size.get input must be an object");
  const organizationUrnValue = organizationUrn(requiredString(value, "organization_urn", ["organizationUrn", "organization"]), "organization_urn");
  const edgeType = (optionalString(value.edge_type) ?? optionalString(value.edgeType) ?? "COMPANY_FOLLOWED_BY_MEMBER").toUpperCase();
  if (edgeType !== "COMPANY_FOLLOWED_BY_MEMBER") throw new Error("edge_type must be COMPANY_FOLLOWED_BY_MEMBER");
  const validated = { organization_urn: organizationUrnValue, edge_type: edgeType };
  if (!hasLiveAuth(value)) return result("organizations.network_size.get", { firstDegreeSize: null, networkSize: null, validated });
  const params: Pairs = [["edgeType", edgeType]];
  return send(value, "organizations.network_size.get", `/rest/networkSizes/${enc(organizationUrnValue)}?${qs(params)}`, { method: "GET" }).then((response) => {
    if (!ok(response.status) || !isRecord(response.body)) throw upstreamError(response.status, response.headers);
    return result("organizations.network_size.get", { firstDegreeSize: response.body.firstDegreeSize ?? null, networkSize: response.body });
  });
}

export function listOrganizationAcls(value: unknown): ActionResult {
  if (!record(value)) throw new Error("organizations.acls.list input must be an object");
  const q = requiredString(value, "q");
  if (q !== "organization" && q !== "roleAssignee") throw new Error("q must be organization or roleAssignee");
  const params: Pairs = [["q", q]];
  if (q === "organization") {
    params.push(["organization", enc(organizationUrn(requiredString(value, "organization"), "organization"))]);
  } else if (optionalString(value.organization)) {
    params.push(["organization", enc(organizationUrn(String(value.organization), "organization"))]);
  }
  const role = optionalString(value.role);
  if (role) {
    if (!ACL_ROLES.has(role)) throw new Error("role is not a supported organization ACL role");
    params.push(["role", role]);
  }
  const state = optionalString(value.state);
  if (state) {
    if (!ACL_STATES.has(state)) throw new Error("state must be APPROVED, REJECTED, REQUESTED, or REVOKED");
    params.push(["state", state]);
  }
  optionalPaging(value, params);
  if (!hasLiveAuth(value)) return result("organizations.acls.list", { acls: [], validated: { q } });
  return send(value, "organizations.acls.list", `/rest/organizationAcls?${qs(params)}`, { method: "GET", headers: { "X-RestLi-Method": "FINDER" } }).then((response) => {
    if (!ok(response.status) || !isRecord(response.body)) throw upstreamError(response.status, response.headers);
    return result("organizations.acls.list", { acls: elements(response.body), nextStart: nextStart(response.body), count: pagingCount(response.body) });
  });
}

export function getOrganizationPageStatistics(value: unknown): ActionResult {
  if (!record(value)) throw new Error("organizations.page_statistics.get input must be an object");
  const organization = organizationUrn(requiredString(value, "organization", ["organizationUrn"]), "organization");
  const params: Pairs = [["q", "organization"], ["organization", enc(organization)]];
  applyTimeIntervals(value, params);
  if (!hasLiveAuth(value)) return result("organizations.page_statistics.get", { pageStatistics: [], validated: { organization } });
  return send(value, "organizations.page_statistics.get", `/rest/organizationPageStatistics?${qs(params)}`, { method: "GET", headers: { "X-RestLi-Method": "FINDER" } }).then((response) => {
    if (!ok(response.status) || !isRecord(response.body)) throw upstreamError(response.status, response.headers);
    return result("organizations.page_statistics.get", { pageStatistics: elements(response.body) });
  });
}

export function getOrgFollowerStatistics(value: unknown): ActionResult {
  if (!record(value)) throw new Error("organizations.follower_statistics.get input must be an object");
  const organizationalEntity = organizationUrn(requiredString(value, "organizationalEntity", ["organization"]), "organizationalEntity");
  const params: Pairs = [["q", "organizationalEntity"], ["organizationalEntity", enc(organizationalEntity)]];
  applyTimeIntervals(value, params);
  if (!hasLiveAuth(value)) return result("organizations.follower_statistics.get", { followerStatistics: [], validated: { organizationalEntity } });
  return send(value, "organizations.follower_statistics.get", `/rest/organizationalEntityFollowerStatistics?${qs(params)}`, { method: "GET", headers: { "X-RestLi-Method": "FINDER" } }).then((response) => {
    if (!ok(response.status) || !isRecord(response.body)) throw upstreamError(response.status, response.headers);
    return result("organizations.follower_statistics.get", { followerStatistics: elements(response.body) });
  });
}

export function getOrgShareStatistics(value: unknown): ActionResult {
  if (!record(value)) throw new Error("organizations.share_statistics.get input must be an object");
  const organizationalEntity = organizationUrn(requiredString(value, "organizationalEntity", ["organization"]), "organizationalEntity");
  const params: Pairs = [["q", "organizationalEntity"], ["organizationalEntity", enc(organizationalEntity)]];
  const shares = value.shares === undefined ? undefined : requiredStringArray(value.shares, "shares");
  const ugcPosts = value.ugcPosts === undefined ? undefined : requiredStringArray(value.ugcPosts, "ugcPosts");
  if (shares) params.push(["shares", encodeRestliList(shares.map((item) => toUrn(item, "shares", "urn:li:share:")))]);
  if (ugcPosts) params.push(["ugcPosts", encodeRestliList(ugcPosts.map((item) => toUrn(item, "ugcPosts", "urn:li:ugcPost:")))]);
  if (!shares && !ugcPosts) applyTimeIntervals(value, params);
  if (!hasLiveAuth(value)) return result("organizations.share_statistics.get", { shareStatistics: [], validated: { organizationalEntity } });
  return send(value, "organizations.share_statistics.get", `/rest/organizationalEntityShareStatistics?${qs(params)}`, { method: "GET", headers: { "X-RestLi-Method": "FINDER" } }).then((response) => {
    if (!ok(response.status) || !isRecord(response.body)) throw upstreamError(response.status, response.headers);
    return result("organizations.share_statistics.get", { shareStatistics: elements(response.body) });
  });
}

export function listConversionRules(value: unknown): ActionResult {
  if (!record(value)) throw new Error("conversion_rules.list input must be an object");
  const account = sponsoredAccountUrn(requiredString(value, "account", ["accountId"]), "account");
  const params: Pairs = [["q", "account"], ["account", enc(account)]];
  optionalPaging(value, params);
  if (!hasLiveAuth(value)) return result("conversion_rules.list", { conversionRules: [], validated: { account } });
  return send(value, "conversion_rules.list", `/rest/conversions?${qs(params)}`, { method: "GET", headers: { "X-RestLi-Method": "FINDER" } }).then((response) => {
    if (!ok(response.status) || !isRecord(response.body)) throw upstreamError(response.status, response.headers);
    return result("conversion_rules.list", { conversionRules: elements(response.body), nextStart: nextStart(response.body), count: pagingCount(response.body) });
  });
}

export function listDmpSegments(value: unknown): ActionResult {
  if (!record(value)) throw new Error("dmp_segments.list input must be an object");
  const params: Pairs = [];
  const ids = value.ids === undefined ? undefined : requiredStringArray(value.ids, "ids").map((id) => boundedId(id, "ids"));
  const account = optionalString(value.account);
  if (ids) params.push(["ids", encodeRestliList(ids)]);
  else {
    const q = optionalString(value.q) ?? "account";
    if (q !== "account") throw new Error("q must be account when listing DMP segments");
    if (!account) throw new Error("account is required");
    params.push(["q", q], ["account", enc(sponsoredAccountUrn(account, "account"))]);
    optionalPaging(value, params);
  }
  if (!hasLiveAuth(value)) return result("dmp_segments.list", { dmpSegments: [], validated: { account, ids } });
  return send(value, "dmp_segments.list", `/rest/dmpSegments?${qs(params)}`, { method: "GET", headers: { "X-RestLi-Method": ids ? "BATCH_GET" : "FINDER" } }).then((response) => {
    if (!ok(response.status) || !isRecord(response.body)) throw upstreamError(response.status, response.headers);
    return result("dmp_segments.list", { dmpSegments: elements(response.body), nextStart: nextStart(response.body), count: pagingCount(response.body) });
  });
}

function numericIds(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) throw new Error(`${field} must contain 1 to 50 numeric IDs`);
  return value.map((item) => {
    if (typeof item === "number" && Number.isSafeInteger(item) && item > 0) return String(item);
    if (typeof item === "string" && /^[0-9]{1,20}$/.test(item)) return item;
    throw new Error(`${field} must contain numeric organization IDs`);
  });
}

export function listOrganizations(value: unknown): ActionResult {
  if (!record(value)) throw new Error("organizations.list input must be an object");
  const params: Pairs = [];
  const batch = value.ids !== undefined;
  if (batch) {
    params.push(["ids", encodeRestliList(numericIds(value.ids, "ids"))]);
  } else {
    const q = requiredString(value, "q");
    if (q !== "vanityName" && q !== "parentOrganization") throw new Error("q must be vanityName or parentOrganization");
    params.push(["q", q]);
    if (q === "vanityName") {
      const vanityName = requiredString(value, "vanityName");
      if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,99}$/.test(vanityName)) throw new Error("vanityName must be a LinkedIn vanity slug");
      params.push(["vanityName", enc(vanityName)]);
    } else {
      params.push(["parent", enc(organizationUrn(requiredString(value, "parent"), "parent"))]);
    }
    optionalPaging(value, params);
  }
  if (!hasLiveAuth(value)) return result("organizations.list", { organizations: [], validated: {} });
  return send(value, "organizations.list", `/rest/organizations?${qs(params)}`, { method: "GET", headers: { "X-RestLi-Method": batch ? "BATCH_GET" : "FINDER" } }).then((response) => {
    if (!ok(response.status) || !isRecord(response.body)) throw upstreamError(response.status, response.headers);
    return result("organizations.list", { organizations: elements(response.body), nextStart: nextStart(response.body), count: pagingCount(response.body) });
  });
}

export function lookupOrganizations(value: unknown): ActionResult {
  if (!record(value)) throw new Error("organizations.lookup input must be an object");
  const ids = numericIds(value.ids, "ids");
  const params: Pairs = [["ids", encodeRestliList(ids)]];
  if (!hasLiveAuth(value)) return result("organizations.lookup", { organizations: [], validated: { ids } });
  // One pinned LinkedIn-Version for every call; the former linkedin_version override is gone.
  return send(value, "organizations.lookup", `/rest/organizationsLookup?${qs(params)}`, { method: "GET", headers: { "X-RestLi-Method": "BATCH_GET" } }).then((response) => {
    if (!ok(response.status) || !isRecord(response.body)) throw upstreamError(response.status, response.headers);
    const results = isRecord(response.body.results) ? Object.values(response.body.results).filter(isRecord) : elements(response.body);
    return result("organizations.lookup", { organizations: results, results: response.body.results ?? null });
  });
}

export function listPosts(value: unknown): ActionResult {
  if (!record(value)) throw new Error("posts.list input must be an object");
  const params: Pairs = [];
  const batch = value.ids !== undefined;
  if (batch) {
    const ids = requiredStringArray(value.ids, "ids");
    params.push(["ids", encodeRestliList(ids.map((id) => {
      if (id.startsWith("urn:li:ugcPost:")) return toUrn(id, "ids", "urn:li:ugcPost:");
      if (id.startsWith("urn:li:share:")) return toUrn(id, "ids", "urn:li:share:");
      throw new Error("ids must be share or ugcPost URNs");
    }))]);
  } else {
    const q = requiredString(value, "q");
    if (q !== "author" && q !== "dscAdAccount") throw new Error("q must be author or dscAdAccount");
    params.push(["q", q]);
    if (q === "author") {
      const author = requiredString(value, "author");
      params.push(["author", enc(author.startsWith("urn:li:person:") ? personUrn(author, "author") : organizationUrn(author, "author"))]);
    } else {
      const account = requiredString(value, "dscAdAccount", ["author"]);
      params.push(["dscAdAccount", enc(sponsoredAccountUrn(account, "dscAdAccount"))]);
    }
    const sortBy = optionalString(value.sort_by) ?? optionalString(value.sortBy);
    if (sortBy) {
      if (sortBy !== "LAST_MODIFIED" && sortBy !== "CREATED") throw new Error("sort_by must be LAST_MODIFIED or CREATED");
      params.push(["sortBy", sortBy]);
    }
    optionalPaging(value, params);
  }
  if (!hasLiveAuth(value)) return result("posts.list", { posts: [], validated: {} });
  // One pinned LinkedIn-Version for every call; the former linkedin_version override is gone.
  return send(value, "posts.list", `/rest/posts?${qs(params)}`, { method: "GET", headers: { "X-RestLi-Method": batch ? "BATCH_GET" : "FINDER" } }).then((response) => {
    if (!ok(response.status) || !isRecord(response.body)) throw upstreamError(response.status, response.headers);
    return result("posts.list", { posts: elements(response.body), nextStart: nextStart(response.body), count: pagingCount(response.body) });
  });
}

export function registerUpload(value: unknown): ActionResult {
  if (!record(value)) throw new Error("uploads.register input must be an object");
  const ownerRaw = requiredString(value, "owner");
  const owner = ownerRaw.startsWith("urn:li:person:") ? personUrn(ownerRaw, "owner") : organizationUrn(ownerRaw, "owner");
  const recipes = requiredStringArray(value.recipes, "recipes", 1, 5);
  if (!recipes.every((recipe) => recipe.startsWith("urn:li:digitalmediaRecipe:") && recipe.length <= 256)) {
    throw new Error("recipes must be digitalmediaRecipe URNs");
  }
  if (!Array.isArray(value.serviceRelationships) || value.serviceRelationships.length < 1 || value.serviceRelationships.length > 5) {
    throw new Error("serviceRelationships must contain 1 to 5 relationships");
  }
  const serviceRelationships = value.serviceRelationships.map((item, index) => {
    if (!isRecord(item)) throw new Error(`serviceRelationships[${index}] must be an object`);
    const identifier = requiredString(item, "identifier");
    const relationshipType = requiredString(item, "relationshipType");
    if (identifier !== "urn:li:userGeneratedContent") throw new Error("serviceRelationships identifier must be urn:li:userGeneratedContent");
    if (relationshipType !== "OWNER" && relationshipType !== "GENERIC" && relationshipType !== "CREATOR") {
      throw new Error("serviceRelationships relationshipType is not supported");
    }
    return { identifier, relationshipType };
  });
  const mechanisms = requiredStringArray(value.supportedUploadMechanism, "supportedUploadMechanism", 1, 2);
  if (!mechanisms.every((item) => item === "SYNCHRONOUS_UPLOAD" || item === "MULTIPART_UPLOAD")) {
    throw new Error("supportedUploadMechanism must be SYNCHRONOUS_UPLOAD or MULTIPART_UPLOAD");
  }
  const registerUploadRequest = { owner, recipes, serviceRelationships, supportedUploadMechanism: mechanisms };
  if (!hasLiveAuth(value)) return result("uploads.register", { upload: null, validated: registerUploadRequest });
  return send(value, "uploads.register", "/rest/assets?action=registerUpload", {
    method: "POST",
    body: JSON.stringify({ registerUploadRequest }),
  }).then((response) => {
    if (!ok(response.status) || !isRecord(response.body)) throw upstreamError(response.status, response.headers);
    const upload = isRecord(response.body.value) ? response.body.value : response.body;
    return result("uploads.register", { upload });
  });
}

export function searchEvents(value: unknown): ActionResult {
  if (!record(value)) throw new Error("events.search input must be an object");
  const organizerRaw = requiredString(value, "organizer");
  const organizer = organizerRaw.startsWith("urn:li:person:") ? personUrn(organizerRaw, "organizer") : organizationUrn(organizerRaw, "organizer");
  const q = optionalString(value.q) ?? "eventsByOrganizer";
  if (q !== "eventsByOrganizer" && q !== "organizerLeadGenFormEnabledEvents") throw new Error("q must be eventsByOrganizer or organizerLeadGenFormEnabledEvents");
  const params: Pairs = [["q", q], ["organizer", enc(organizer)]];
  const sortOrder = optionalString(value.sortOrder);
  if (sortOrder) {
    if (sortOrder !== "START_TIME_ASC" && sortOrder !== "END_TIME_DESC") throw new Error("sortOrder is not supported");
    params.push(["sortOrder", sortOrder]);
  }
  const entryCriteria = optionalString(value.entryCriteria);
  if (entryCriteria) {
    if (entryCriteria !== "PUBLIC" && entryCriteria !== "GATED") throw new Error("entryCriteria must be PUBLIC or GATED");
    params.push(["entryCriteria", entryCriteria]);
  }
  const lifeCycleState = optionalString(value.lifeCycleState);
  if (lifeCycleState) {
    if (!["UPCOMING", "ONGOING", "PAST"].includes(lifeCycleState)) throw new Error("lifeCycleState must be UPCOMING, ONGOING, or PAST");
    // Rest.li 2.0 record, not URL-encoded (Events API: timeBasedFilter=(lifeCycleState:PAST)).
    params.push(["timeBasedFilter", `(lifeCycleState:${lifeCycleState})`]);
  }
  const excludeCancelled = optionalBoolean(value.excludeCancelled, "excludeCancelled");
  if (excludeCancelled !== undefined) params.push(["excludeCancelled", String(excludeCancelled)]);
  optionalPaging(value, params);
  if (!hasLiveAuth(value)) return result("events.search", { events: [], validated: { organizer, q } });
  return send(value, "events.search", `/rest/events?${qs(params)}`, { method: "GET", headers: { "X-RestLi-Method": "FINDER" } }).then((response) => {
    if (!ok(response.status) || !isRecord(response.body)) throw upstreamError(response.status, response.headers);
    return result("events.search", { events: elements(response.body), nextStart: nextStart(response.body), count: pagingCount(response.body) });
  });
}

export function updateLeadForm(value: unknown): ActionResult {
  if (!record(value)) throw new Error("lead_forms.update input must be an object");
  const formId = boundedId(requiredString(value, "form_id", ["formId", "leadFormId"]), "form_id");
  if (!isRecord(value.patch) || !isRecord(value.patch.$set) || Object.keys(value.patch.$set).length === 0) {
    throw new Error("patch.$set must include at least one field");
  }
  const encoded = JSON.stringify(value.patch);
  if (encoded.length > 32_000) throw new Error("patch is too large");
  const patch = { $set: value.patch.$set };
  if (!hasLiveAuth(value)) return result("lead_forms.update", { leadForm: null, leadFormId: formId, validated: { form_id: formId, patch } });
  return send(value, "lead_forms.update", `/rest/leadForms/${enc(formId)}`, {
    method: "POST",
    headers: { "X-RestLi-Method": "PARTIAL_UPDATE" },
    body: JSON.stringify({ patch }),
  }).then((response) => {
    if (!ok(response.status)) throw upstreamError(response.status, response.headers);
    const leadForm = isRecord(response.body) ? response.body : { id: formId };
    return result("lead_forms.update", { leadForm, leadFormId: formId });
  });
}

export function updateOrganizationAcl(value: unknown): ActionResult {
  if (!record(value)) throw new Error("organizations.acls.update input must be an object");
  const role = requiredString(value, "role");
  if (!ACL_ROLES.has(role)) throw new Error("role is not a supported organization ACL role");
  const state = requiredString(value, "state");
  if (!ACL_STATES.has(state)) throw new Error("state must be APPROVED, REJECTED, REQUESTED, or REVOKED");
  const organization = organizationUrn(requiredString(value, "organization"), "organization");
  const roleAssignee = personUrn(requiredString(value, "roleAssignee"), "roleAssignee");
  const body = { role, state, organization, roleAssignee };
  if (!hasLiveAuth(value)) return result("organizations.acls.update", { acl: null, validated: body });
  // Compound key as documented: raw (key:value) structure, URN leaves encoded once.
  const path = `/rest/organizationAcls/(organization:${enc(organization)},role:${role},roleAssignee:${enc(roleAssignee)})`;
  return send(value, "organizations.acls.update", path, { method: "PUT", body: JSON.stringify(body) }).then((response) => {
    if (!ok(response.status)) throw upstreamError(response.status, response.headers);
    const acl = isRecord(response.body) ? response.body : body;
    return result("organizations.acls.update", { acl });
  });
}
