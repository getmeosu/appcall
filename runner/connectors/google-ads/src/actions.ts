import { createHash } from "crypto";
import {
  createGoogleAdsClient,
  parseGoogleAdsRateLimitMetadata,
  parseGoogleAdsError,
  sanitizeCustomerId,
  isRecord,
  type GoogleAdsClientOptions,
} from "./http";
import {
  normalizeCampaign,
  normalizeAdGroup,
  normalizeAd,
  normalizeKeyword,
  normalizeBudget,
  normalizeConversionAction,
  normalizeAccessibleCustomer,
  normalizeCustomerClient,
  normalizeUserList,
  parseCampaignsResponse,
  parseAdGroupsResponse,
  parseAdsResponse,
  parseKeywordsResponse,
  parseBudgetsResponse,
  parseConversionActionsResponse,
  parseAccessibleCustomersResponse,
  parseCustomerClientsResponse,
  parseUserListsResponse,
  parseMutateResponse,
  parseSearchResponse,
  aggregateSearchStreamBatches,
  extractIdFromResourceName,
} from "./objects";

type ActionResult = Record<string, unknown> | Promise<Record<string, unknown>>;

// ---------------------------------------------------------------------------
// Live-auth detection: accessToken + developerToken (+ customerId for scoped)
// ---------------------------------------------------------------------------

function hasLiveAuth(input: unknown, requireCustomerId = true): input is Record<string, unknown> & {
  accessToken: string;
  developerToken: string;
  customerId?: string;
} {
  if (!isRecord(input)) return false;
  if (typeof input.accessToken !== "string" || input.accessToken.length === 0) return false;
  if (typeof input.developerToken !== "string" || input.developerToken.length === 0) return false;
  if (requireCustomerId) {
    if (typeof input.customerId !== "string" || input.customerId.length === 0) return false;
  }
  return true;
}

function clientOpts(input: Record<string, unknown>, operation: string): GoogleAdsClientOptions {
  return {
    accessToken: String(input.accessToken),
    developerToken: String(input.developerToken),
    loginCustomerId: typeof input.loginCustomerId === "string" ? input.loginCustomerId : undefined,
    fetch: typeof input.fetch === "function" ? (input.fetch as typeof fetch) : undefined,
    operation,
  };
}

function customerPath(customerId: string, suffix: string): string {
  return `/customers/${sanitizeCustomerId(customerId)}${suffix}`;
}

function handleError(result: { status: number; headers: Record<string, string>; body: unknown }) {
  const rateLimit = parseGoogleAdsRateLimitMetadata(result.status, result.headers);
  if (rateLimit.limited) {
    return {
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "Google Ads rate limit exceeded.",
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    };
  }
  const parsed = parseGoogleAdsError(result.body);
  if (parsed) {
    return { ok: false, code: parsed.code, message: parsed.message, providerError: parsed.providerError };
  }
  return { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "Google Ads rejected the request." };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalBool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function requireOperations(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("operations is required");
  return value;
}

function escapeGaqlLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function hashEmailSha256(email: string): string {
  const normalized = email.trim().toLowerCase();
  return createHash("sha256").update(normalized).digest("hex");
}

function mutateBody(payload: {
  operations: unknown[];
  validateOnly?: boolean;
  partialFailure?: boolean;
  responseContentType?: string;
}): Record<string, unknown> {
  const body: Record<string, unknown> = { operations: payload.operations };
  if (payload.validateOnly != null) body.validateOnly = payload.validateOnly;
  if (payload.partialFailure != null) body.partialFailure = payload.partialFailure;
  if (payload.responseContentType) body.responseContentType = payload.responseContentType;
  return body;
}

async function postMutate(
  input: Record<string, unknown>,
  action: string,
  pathSuffix: string,
  payload: { operations: unknown[]; validateOnly?: boolean; partialFailure?: boolean; responseContentType?: string },
): Promise<Record<string, unknown>> {
  const customerId = sanitizeCustomerId(String(input.customerId));
  const result = await createGoogleAdsClient(clientOpts(input, action)).fetchJSON(
    customerPath(customerId, pathSuffix),
    { method: "POST", body: JSON.stringify(mutateBody(payload)) },
  );
  if (result.status >= 200 && result.status < 300) {
    const parsed = parseMutateResponse(result.body);
    return {
      connector: "google-ads",
      action,
      source: "connector",
      resourceNames: parsed.resourceNames,
      partialFailureError: parsed.partialFailureError,
      raw: result.body,
    };
  }
  throw handleError(result);
}

// ---------------------------------------------------------------------------
// customers.listAccessible
// ---------------------------------------------------------------------------

export type ListAccessibleCustomersInput = Record<string, never>;

export function listAccessibleCustomers(input: unknown): ActionResult {
  if (hasLiveAuth(input, false)) {
    return createGoogleAdsClient(clientOpts(input, "customers.listAccessible"))
      .fetchJSON("/customers:listAccessibleCustomers", { method: "GET" })
      .then((result) => {
        if (result.status === 200) {
          const names = parseAccessibleCustomersResponse(result.body);
          return {
            connector: "google-ads",
            action: "customers.listAccessible",
            source: "connector",
            customers: names.map(normalizeAccessibleCustomer),
            resourceNames: names,
          };
        }
        throw handleError(result);
      });
  }
  return {
    connector: "google-ads",
    action: "customers.listAccessible",
    source: "connector",
    validated: {},
  };
}

// ---------------------------------------------------------------------------
// customers.listSubAccounts
// ---------------------------------------------------------------------------

export type ListSubAccountsInput = { customerId: string; pageToken?: string };

export function listSubAccounts(input: unknown): ActionResult {
  const validated = validateListSubAccountsInput(input);
  if (hasLiveAuth(input, true)) {
    const customerId = sanitizeCustomerId(validated.customerId);
    const query =
      "SELECT customer_client.client_customer, customer_client.descriptive_name, customer_client.id, " +
      "customer_client.manager, customer_client.status, customer_client.level, customer_client.currency_code, " +
      "customer_client.time_zone, customer_client.resource_name FROM customer_client WHERE customer_client.level <= 1";
    const body: Record<string, unknown> = { query };
    if (validated.pageToken) body.pageToken = validated.pageToken;
    return createGoogleAdsClient(clientOpts(input, "customers.listSubAccounts"))
      .fetchJSON(customerPath(customerId, "/googleAds:search"), { method: "POST", body: JSON.stringify(body) })
      .then((result) => {
        if (result.status === 200) {
          const parsed = parseCustomerClientsResponse(result.body);
          return {
            connector: "google-ads",
            action: "customers.listSubAccounts",
            source: "connector",
            customers: parsed.customers.map(normalizeCustomerClient),
            nextPageToken: parsed.nextPageToken,
          };
        }
        throw handleError(result);
      });
  }
  return { connector: "google-ads", action: "customers.listSubAccounts", source: "connector", validated };
}

function validateListSubAccountsInput(input: unknown): ListSubAccountsInput {
  if (!isRecord(input)) throw new Error("listSubAccounts input must be an object");
  return {
    customerId: requireString(input.customerId, "customerId"),
    pageToken: optionalString(input.pageToken),
  };
}


// ---------------------------------------------------------------------------
// Reconcile ID extraction — runner passes mutate input to the get op.
// Accept explicit IDs, resourceName, resourceNames[0], or operations update/remove.
// ---------------------------------------------------------------------------

function trailingResourceId(resourceName: string): string {
  const trailing = extractIdFromResourceName(resourceName);
  // adGroupAds / adGroupCriteria use adGroupId~entityId
  const tilde = trailing.lastIndexOf("~");
  return tilde >= 0 ? trailing.slice(tilde + 1) : trailing;
}

function extractIdFromMutateShapedInput(
  input: Record<string, unknown>,
  explicitKeys: string[],
): string | undefined {
  for (const key of explicitKeys) {
    const value = input[key];
    if (typeof value === "string" && value.length > 0) {
      return value.includes("/") ? trailingResourceId(value) : value;
    }
  }
  if (typeof input.resourceName === "string" && input.resourceName.length > 0) {
    return trailingResourceId(input.resourceName);
  }
  if (Array.isArray(input.resourceNames)) {
    const first = input.resourceNames[0];
    if (typeof first === "string" && first.length > 0) return trailingResourceId(first);
  }
  if (Array.isArray(input.operations) && input.operations.length > 0) {
    const op = input.operations[0];
    if (isRecord(op)) {
      if (typeof op.remove === "string" && op.remove.length > 0) {
        return trailingResourceId(op.remove);
      }
      const update = op.update;
      if (isRecord(update)) {
        const rn = update.resourceName ?? update.resource_name;
        if (typeof rn === "string" && rn.length > 0) return trailingResourceId(rn);
      }
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// campaigns.get
// ---------------------------------------------------------------------------

export type CampaignsGetInput = { customerId: string; campaignId: string };

export function getCampaign(input: unknown): ActionResult {
  const validated = validateCampaignsGetInput(input);
  if (hasLiveAuth(input, true)) {
    const customerId = sanitizeCustomerId(validated.customerId);
    const query =
      `SELECT campaign.id, campaign.name, campaign.status, campaign.resource_name, ` +
      `campaign.bidding_strategy_type, campaign.start_date, campaign.end_date ` +
      `FROM campaign WHERE campaign.id = ${escapeGaqlLiteral(validated.campaignId)}`;
    return createGoogleAdsClient(clientOpts(input, "campaigns.get"))
      .fetchJSON(customerPath(customerId, "/googleAds:search"), {
        method: "POST",
        body: JSON.stringify({ query }),
      })
      .then((result) => {
        if (result.status === 200) {
          const parsed = parseCampaignsResponse(result.body);
          const campaign = parsed.campaigns[0] ? normalizeCampaign(parsed.campaigns[0]) : null;
          return { connector: "google-ads", action: "campaigns.get", source: "connector", campaign };
        }
        throw handleError(result);
      });
  }
  return { connector: "google-ads", action: "campaigns.get", source: "connector", validated };
}

function validateCampaignsGetInput(input: unknown): CampaignsGetInput {
  if (!isRecord(input)) throw new Error("campaigns.get input must be an object");
  const campaignId = extractIdFromMutateShapedInput(input, ["campaignId", "id"]);
  return {
    customerId: requireString(input.customerId, "customerId"),
    campaignId: requireString(campaignId, "campaignId"),
  };
}

// ---------------------------------------------------------------------------
// campaigns.getByName
// ---------------------------------------------------------------------------

export type CampaignsGetByNameInput = { customerId: string; name: string };

export function getCampaignByName(input: unknown): ActionResult {
  const validated = validateCampaignsGetByNameInput(input);
  if (hasLiveAuth(input, true)) {
    const customerId = sanitizeCustomerId(validated.customerId);
    const query =
      `SELECT campaign.id, campaign.name, campaign.status, campaign.resource_name, ` +
      `campaign.bidding_strategy_type, campaign.start_date, campaign.end_date ` +
      `FROM campaign WHERE campaign.name = '${escapeGaqlLiteral(validated.name)}'`;
    return createGoogleAdsClient(clientOpts(input, "campaigns.getByName"))
      .fetchJSON(customerPath(customerId, "/googleAds:search"), {
        method: "POST",
        body: JSON.stringify({ query }),
      })
      .then((result) => {
        if (result.status === 200) {
          const parsed = parseCampaignsResponse(result.body);
          return {
            connector: "google-ads",
            action: "campaigns.getByName",
            source: "connector",
            campaigns: parsed.campaigns.map(normalizeCampaign),
          };
        }
        throw handleError(result);
      });
  }
  return { connector: "google-ads", action: "campaigns.getByName", source: "connector", validated };
}

function validateCampaignsGetByNameInput(input: unknown): CampaignsGetByNameInput {
  if (!isRecord(input)) throw new Error("campaigns.getByName input must be an object");
  return {
    customerId: requireString(input.customerId, "customerId"),
    name: requireString(input.name, "name"),
  };
}

// ---------------------------------------------------------------------------
// ad_groups.get
// ---------------------------------------------------------------------------

export type AdGroupsGetInput = { customerId: string; adGroupId: string };

export function getAdGroup(input: unknown): ActionResult {
  const validated = validateAdGroupsGetInput(input);
  if (hasLiveAuth(input, true)) {
    const customerId = sanitizeCustomerId(validated.customerId);
    const query =
      `SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.resource_name, ` +
      `ad_group.type, ad_group.campaign, ad_group.cpc_bid_micros ` +
      `FROM ad_group WHERE ad_group.id = ${escapeGaqlLiteral(validated.adGroupId)}`;
    return createGoogleAdsClient(clientOpts(input, "ad_groups.get"))
      .fetchJSON(customerPath(customerId, "/googleAds:search"), {
        method: "POST",
        body: JSON.stringify({ query }),
      })
      .then((result) => {
        if (result.status === 200) {
          const parsed = parseAdGroupsResponse(result.body);
          const adGroup = parsed.adGroups[0] ? normalizeAdGroup(parsed.adGroups[0]) : null;
          return { connector: "google-ads", action: "ad_groups.get", source: "connector", adGroup };
        }
        throw handleError(result);
      });
  }
  return { connector: "google-ads", action: "ad_groups.get", source: "connector", validated };
}

function validateAdGroupsGetInput(input: unknown): AdGroupsGetInput {
  if (!isRecord(input)) throw new Error("ad_groups.get input must be an object");
  const adGroupId = extractIdFromMutateShapedInput(input, ["adGroupId", "id"]);
  return {
    customerId: requireString(input.customerId, "customerId"),
    adGroupId: requireString(adGroupId, "adGroupId"),
  };
}

// ---------------------------------------------------------------------------
// ads.get
// ---------------------------------------------------------------------------

export type AdsGetInput = { customerId: string; adId: string };

export function getAd(input: unknown): ActionResult {
  const validated = validateAdsGetInput(input);
  if (hasLiveAuth(input, true)) {
    const customerId = sanitizeCustomerId(validated.customerId);
    // Fixture/normalize shape uses `ad`; query by ad.id for thin get.
    const query =
      `SELECT ad.id, ad.name, ad.status, ad.resource_name, ad.type, ad.ad_group, ` +
      `ad.headline, ad.description, ad.final_urls ` +
      `FROM ad WHERE ad.id = ${escapeGaqlLiteral(validated.adId)}`;
    return createGoogleAdsClient(clientOpts(input, "ads.get"))
      .fetchJSON(customerPath(customerId, "/googleAds:search"), {
        method: "POST",
        body: JSON.stringify({ query }),
      })
      .then((result) => {
        if (result.status === 200) {
          const parsed = parseAdsResponse(result.body);
          const ad = parsed.ads[0] ? normalizeAd(parsed.ads[0]) : null;
          return { connector: "google-ads", action: "ads.get", source: "connector", ad };
        }
        throw handleError(result);
      });
  }
  return { connector: "google-ads", action: "ads.get", source: "connector", validated };
}

function validateAdsGetInput(input: unknown): AdsGetInput {
  if (!isRecord(input)) throw new Error("ads.get input must be an object");
  const adId = extractIdFromMutateShapedInput(input, ["adId", "id"]);
  return {
    customerId: requireString(input.customerId, "customerId"),
    adId: requireString(adId, "adId"),
  };
}

// ---------------------------------------------------------------------------
// keywords.get
// ---------------------------------------------------------------------------

export type KeywordsGetInput = { customerId: string; criterionId: string };

export function getKeyword(input: unknown): ActionResult {
  const validated = validateKeywordsGetInput(input);
  if (hasLiveAuth(input, true)) {
    const customerId = sanitizeCustomerId(validated.customerId);
    const query =
      `SELECT ad_group_criterion.criterion_id, ad_group_criterion.status, ad_group_criterion.resource_name, ` +
      `ad_group_criterion.type, ad_group_criterion.ad_group, ad_group_criterion.keyword.text, ` +
      `ad_group_criterion.keyword.match_type, ad_group_criterion.cpc_bid_micros, ad_group_criterion.negative ` +
      `FROM ad_group_criterion WHERE ad_group_criterion.type = 'KEYWORD' ` +
      `AND ad_group_criterion.criterion_id = ${escapeGaqlLiteral(validated.criterionId)}`;
    return createGoogleAdsClient(clientOpts(input, "keywords.get"))
      .fetchJSON(customerPath(customerId, "/googleAds:search"), {
        method: "POST",
        body: JSON.stringify({ query }),
      })
      .then((result) => {
        if (result.status === 200) {
          const parsed = parseKeywordsResponse(result.body);
          const keyword = parsed.keywords[0] ? normalizeKeyword(parsed.keywords[0]) : null;
          return { connector: "google-ads", action: "keywords.get", source: "connector", keyword };
        }
        throw handleError(result);
      });
  }
  return { connector: "google-ads", action: "keywords.get", source: "connector", validated };
}

function validateKeywordsGetInput(input: unknown): KeywordsGetInput {
  if (!isRecord(input)) throw new Error("keywords.get input must be an object");
  const criterionId = extractIdFromMutateShapedInput(input, ["criterionId", "keywordId", "id"]);
  return {
    customerId: requireString(input.customerId, "customerId"),
    criterionId: requireString(criterionId, "criterionId"),
  };
}

// ---------------------------------------------------------------------------
// budgets.get
// ---------------------------------------------------------------------------

export type BudgetsGetInput = { customerId: string; budgetId: string };

export function getBudget(input: unknown): ActionResult {
  const validated = validateBudgetsGetInput(input);
  if (hasLiveAuth(input, true)) {
    const customerId = sanitizeCustomerId(validated.customerId);
    const query =
      `SELECT campaign_budget.id, campaign_budget.name, campaign_budget.status, campaign_budget.resource_name, ` +
      `campaign_budget.amount_micros, campaign_budget.delivery_method, campaign_budget.period, ` +
      `campaign_budget.explicitly_shared ` +
      `FROM campaign_budget WHERE campaign_budget.id = ${escapeGaqlLiteral(validated.budgetId)}`;
    return createGoogleAdsClient(clientOpts(input, "budgets.get"))
      .fetchJSON(customerPath(customerId, "/googleAds:search"), {
        method: "POST",
        body: JSON.stringify({ query }),
      })
      .then((result) => {
        if (result.status === 200) {
          const parsed = parseBudgetsResponse(result.body);
          const budget = parsed.budgets[0] ? normalizeBudget(parsed.budgets[0]) : null;
          return { connector: "google-ads", action: "budgets.get", source: "connector", budget };
        }
        throw handleError(result);
      });
  }
  return { connector: "google-ads", action: "budgets.get", source: "connector", validated };
}

function validateBudgetsGetInput(input: unknown): BudgetsGetInput {
  if (!isRecord(input)) throw new Error("budgets.get input must be an object");
  const budgetId = extractIdFromMutateShapedInput(input, ["budgetId", "id"]);
  return {
    customerId: requireString(input.customerId, "customerId"),
    budgetId: requireString(budgetId, "budgetId"),
  };
}

// ---------------------------------------------------------------------------
// conversion_actions.get
// ---------------------------------------------------------------------------

export type ConversionActionsGetInput = { customerId: string; conversionActionId: string };

export function getConversionAction(input: unknown): ActionResult {
  const validated = validateConversionActionsGetInput(input);
  if (hasLiveAuth(input, true)) {
    const customerId = sanitizeCustomerId(validated.customerId);
    const query =
      `SELECT conversion_action.id, conversion_action.name, conversion_action.status, ` +
      `conversion_action.resource_name, conversion_action.type, conversion_action.category, ` +
      `conversion_action.primary_for_goal ` +
      `FROM conversion_action WHERE conversion_action.id = ${escapeGaqlLiteral(validated.conversionActionId)}`;
    return createGoogleAdsClient(clientOpts(input, "conversion_actions.get"))
      .fetchJSON(customerPath(customerId, "/googleAds:search"), {
        method: "POST",
        body: JSON.stringify({ query }),
      })
      .then((result) => {
        if (result.status === 200) {
          const parsed = parseConversionActionsResponse(result.body);
          const conversionAction = parsed.conversionActions[0]
            ? normalizeConversionAction(parsed.conversionActions[0])
            : null;
          return {
            connector: "google-ads",
            action: "conversion_actions.get",
            source: "connector",
            conversionAction,
          };
        }
        throw handleError(result);
      });
  }
  return { connector: "google-ads", action: "conversion_actions.get", source: "connector", validated };
}

function validateConversionActionsGetInput(input: unknown): ConversionActionsGetInput {
  if (!isRecord(input)) throw new Error("conversion_actions.get input must be an object");
  const conversionActionId = extractIdFromMutateShapedInput(input, ["conversionActionId", "id"]);
  return {
    customerId: requireString(input.customerId, "customerId"),
    conversionActionId: requireString(conversionActionId, "conversionActionId"),
  };
}

// ---------------------------------------------------------------------------
// Shared mutate validators
// ---------------------------------------------------------------------------

export type MutateInput = {
  customerId: string;
  operations: unknown[];
  validateOnly?: boolean;
  partialFailure?: boolean;
  responseContentType?: string;
};

function validateMutateInput(input: unknown, label: string): MutateInput {
  if (!isRecord(input)) throw new Error(`${label} input must be an object`);
  return {
    customerId: requireString(input.customerId, "customerId"),
    operations: requireOperations(input.operations),
    validateOnly: optionalBool(input.validateOnly),
    partialFailure: optionalBool(input.partialFailure),
    responseContentType: optionalString(input.responseContentType),
  };
}

function mutateAction(
  input: unknown,
  action: string,
  pathSuffix: string,
): ActionResult {
  const validated = validateMutateInput(input, action);
  if (hasLiveAuth(input, true)) {
    return postMutate(input, action, pathSuffix, validated);
  }
  return { connector: "google-ads", action, source: "connector", validated };
}

export function mutateCampaigns(input: unknown): ActionResult {
  return mutateAction(input, "campaigns.mutate", "/campaigns:mutate");
}

export function mutateAdGroups(input: unknown): ActionResult {
  return mutateAction(input, "ad_groups.mutate", "/adGroups:mutate");
}

export function mutateAds(input: unknown): ActionResult {
  return mutateAction(input, "ads.mutate", "/adGroupAds:mutate");
}

export function mutateKeywords(input: unknown): ActionResult {
  return mutateAction(input, "keywords.mutate", "/adGroupCriteria:mutate");
}

export function mutateBudgets(input: unknown): ActionResult {
  return mutateAction(input, "budgets.mutate", "/campaignBudgets:mutate");
}

export function mutateConversionActions(input: unknown): ActionResult {
  return mutateAction(input, "conversion_actions.mutate", "/conversionActions:mutate");
}

export function mutateLabels(input: unknown): ActionResult {
  return mutateAction(input, "labels.mutate", "/labels:mutate");
}

// ---------------------------------------------------------------------------
// gaql.search
// ---------------------------------------------------------------------------

export type GaqlSearchInput = {
  customerId: string;
  query: string;
  pageToken?: string;
  pageSize?: number;
};

export function gaqlSearch(input: unknown): ActionResult {
  const validated = validateGaqlSearchInput(input);
  if (hasLiveAuth(input, true)) {
    const customerId = sanitizeCustomerId(validated.customerId);
    const body: Record<string, unknown> = { query: validated.query };
    if (validated.pageToken) body.pageToken = validated.pageToken;
    if (validated.pageSize != null) body.pageSize = validated.pageSize;
    return createGoogleAdsClient(clientOpts(input, "gaql.search"))
      .fetchJSON(customerPath(customerId, "/googleAds:search"), {
        method: "POST",
        body: JSON.stringify(body),
      })
      .then((result) => {
        if (result.status === 200) {
          const parsed = parseSearchResponse(result.body);
          return {
            connector: "google-ads",
            action: "gaql.search",
            source: "connector",
            results: parsed.results,
            nextPageToken: parsed.nextPageToken,
          };
        }
        throw handleError(result);
      });
  }
  return { connector: "google-ads", action: "gaql.search", source: "connector", validated };
}

function validateGaqlSearchInput(input: unknown): GaqlSearchInput {
  if (!isRecord(input)) throw new Error("gaql.search input must be an object");
  return {
    customerId: requireString(input.customerId, "customerId"),
    query: requireString(input.query, "query"),
    pageToken: optionalString(input.pageToken),
    pageSize: typeof input.pageSize === "number" ? input.pageSize : undefined,
  };
}

// ---------------------------------------------------------------------------
// gaql.searchStream
// ---------------------------------------------------------------------------

export type GaqlSearchStreamInput = {
  customerId: string;
  query: string;
  summaryRowSetting?: string;
};

export function gaqlSearchStream(input: unknown): ActionResult {
  const validated = validateGaqlSearchStreamInput(input);
  if (hasLiveAuth(input, true)) {
    const customerId = sanitizeCustomerId(validated.customerId);
    const body: Record<string, unknown> = { query: validated.query };
    if (validated.summaryRowSetting) body.summaryRowSetting = validated.summaryRowSetting;
    return createGoogleAdsClient(clientOpts(input, "gaql.searchStream"))
      .fetchJSON(customerPath(customerId, "/googleAds:searchStream"), {
        method: "POST",
        body: JSON.stringify(body),
      })
      .then((result) => {
        if (result.status === 200) {
          const aggregated = aggregateSearchStreamBatches(result.body);
          return {
            connector: "google-ads",
            action: "gaql.searchStream",
            source: "connector",
            results: aggregated.results,
            fieldMask: aggregated.fieldMask,
            rowCount: aggregated.results.length,
          };
        }
        throw handleError(result);
      });
  }
  return { connector: "google-ads", action: "gaql.searchStream", source: "connector", validated };
}

function validateGaqlSearchStreamInput(input: unknown): GaqlSearchStreamInput {
  if (!isRecord(input)) throw new Error("gaql.searchStream input must be an object");
  return {
    customerId: requireString(input.customerId, "customerId"),
    query: requireString(input.query, "query"),
    summaryRowSetting: optionalString(input.summaryRowSetting),
  };
}

// ---------------------------------------------------------------------------
// customer_lists.create
// ---------------------------------------------------------------------------

export type CustomerListsCreateInput = {
  customerId: string;
  name: string;
  description?: string;
};

export function createCustomerList(input: unknown): ActionResult {
  const validated = validateCustomerListsCreateInput(input);
  if (hasLiveAuth(input, true)) {
    const createPayload: Record<string, unknown> = {
      name: validated.name,
      membershipStatus: "OPEN",
      membershipLifeSpan: "10000",
      crmBasedUserList: {
        uploadKeyType: "CONTACT_INFO",
        dataSourceType: "FIRST_PARTY",
      },
    };
    if (validated.description) createPayload.description = validated.description;
    return postMutate(input as Record<string, unknown>, "customer_lists.create", "/userLists:mutate", {
      operations: [{ create: createPayload }],
    }).then((result) => {
      const resourceName = Array.isArray(result.resourceNames) ? (result.resourceNames as string[])[0] : undefined;
      return {
        ...result,
        userList: resourceName
          ? {
              id: `gads-userlist:${extractIdFromResourceName(resourceName)}`,
              provider: "google-ads",
              name: validated.name,
              description: validated.description ?? "",
              resourceName,
            }
          : null,
      };
    });
  }
  return { connector: "google-ads", action: "customer_lists.create", source: "connector", validated };
}

function validateCustomerListsCreateInput(input: unknown): CustomerListsCreateInput {
  if (!isRecord(input)) throw new Error("customer_lists.create input must be an object");
  return {
    customerId: requireString(input.customerId, "customerId"),
    name: requireString(input.name, "name"),
    description: optionalString(input.description),
  };
}

// ---------------------------------------------------------------------------
// customer_lists.mutateMembers (Composio ADD_OR_REMOVE path via OfflineUserDataJob)
// ---------------------------------------------------------------------------

export type CustomerListsMutateMembersInput = {
  customerId: string;
  resourceName: string;
  emails: string[];
  operation?: "create" | "remove";
};

export function mutateCustomerListMembers(input: unknown): ActionResult {
  const validated = validateMutateMembersInput(input);
  if (hasLiveAuth(input, true)) {
    const customerId = sanitizeCustomerId(validated.customerId);
    const client = createGoogleAdsClient(clientOpts(input, "customer_lists.mutateMembers"));
    const opKind = validated.operation === "remove" ? "remove" : "create";

    return (async () => {
      const createJob = await client.fetchJSON(customerPath(customerId, "/offlineUserDataJobs:create"), {
        method: "POST",
        body: JSON.stringify({
          job: {
            type: "CUSTOMER_MATCH_USER_LIST",
            customerMatchUserListMetadata: {
              userList: validated.resourceName,
            },
          },
        }),
      });
      if (createJob.status < 200 || createJob.status >= 300) throw handleError(createJob);
      const jobBody = isRecord(createJob.body) ? createJob.body : {};
      const resourceName = typeof jobBody.resourceName === "string"
        ? jobBody.resourceName
        : typeof jobBody.resource_name === "string"
          ? jobBody.resource_name
          : "";
      if (!resourceName) throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "Missing offlineUserDataJob resource name" };

      const userIdentifiers = validated.emails.map((email) => ({
        hashedEmail: hashEmailSha256(email),
      }));
      const operations = [
        {
          [opKind]: {
            userIdentifiers,
          },
        },
      ];
      const addOps = await client.fetchJSON(`/${resourceName}:addOperations`, {
        method: "POST",
        body: JSON.stringify({ operations, enablePartialFailure: true }),
      });
      if (addOps.status < 200 || addOps.status >= 300) throw handleError(addOps);

      const run = await client.fetchJSON(`/${resourceName}:run`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (run.status < 200 || run.status >= 300) throw handleError(run);

      return {
        connector: "google-ads",
        action: "customer_lists.mutateMembers",
        source: "connector",
        jobResourceName: resourceName,
        emailCount: validated.emails.length,
        operation: opKind,
        raw: { createJob: createJob.body, addOperations: addOps.body, run: run.body },
      };
    })();
  }
  return { connector: "google-ads", action: "customer_lists.mutateMembers", source: "connector", validated };
}

function validateMutateMembersInput(input: unknown): CustomerListsMutateMembersInput {
  if (!isRecord(input)) throw new Error("customer_lists.mutateMembers input must be an object");
  if (!Array.isArray(input.emails) || input.emails.length === 0) throw new Error("emails is required");
  const emails = input.emails.filter((e): e is string => typeof e === "string" && e.length > 0);
  if (emails.length === 0) throw new Error("emails is required");
  const operation = input.operation === "remove" ? "remove" : input.operation === "create" ? "create" : undefined;
  return {
    customerId: requireString(input.customerId, "customerId"),
    resourceName: requireString(input.resourceName, "resourceName"),
    emails,
    operation,
  };
}

// ---------------------------------------------------------------------------
// reports.get — bounded LAST_30_DAYS templates
// ---------------------------------------------------------------------------

const REPORT_QUERIES: Record<string, string> = {
  CUSTOMER:
    "SELECT customer.id, customer.descriptive_name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions " +
    "FROM customer WHERE segments.date DURING LAST_30_DAYS",
  CAMPAIGN:
    "SELECT campaign.id, campaign.name, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions " +
    "FROM campaign WHERE segments.date DURING LAST_30_DAYS",
  AD_GROUP_AD:
    "SELECT ad_group.id, ad_group.name, ad_group_ad.ad.id, ad_group_ad.status, metrics.impressions, metrics.clicks, metrics.cost_micros " +
    "FROM ad_group_ad WHERE segments.date DURING LAST_30_DAYS",
  KEYWORD:
    "SELECT ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, " +
    "metrics.impressions, metrics.clicks, metrics.cost_micros FROM keyword_view WHERE segments.date DURING LAST_30_DAYS",
};

export type ReportsGetInput = {
  customerId: string;
  report: "CUSTOMER" | "CAMPAIGN" | "AD_GROUP_AD" | "KEYWORD";
  startDate?: string;
  endDate?: string;
  maxRows?: number;
};

export function getReport(input: unknown): ActionResult {
  const validated = validateReportsGetInput(input);
  if (hasLiveAuth(input, true)) {
    const customerId = sanitizeCustomerId(validated.customerId);
    let query = REPORT_QUERIES[validated.report];
    if (validated.startDate && validated.endDate) {
      query = query.replace(
        "segments.date DURING LAST_30_DAYS",
        `segments.date BETWEEN '${escapeGaqlLiteral(validated.startDate)}' AND '${escapeGaqlLiteral(validated.endDate)}'`,
      );
    }
    const limit = validated.maxRows != null ? validated.maxRows + 1 : undefined;
    if (limit != null) query = `${query} LIMIT ${limit}`;

    return createGoogleAdsClient(clientOpts(input, "reports.get"))
      .fetchJSON(customerPath(customerId, "/googleAds:searchStream"), {
        method: "POST",
        body: JSON.stringify({ query }),
      })
      .then((result) => {
        if (result.status === 200) {
          const aggregated = aggregateSearchStreamBatches(result.body);
          let rows = aggregated.results;
          let truncated = false;
          if (validated.maxRows != null && rows.length > validated.maxRows) {
            rows = rows.slice(0, validated.maxRows);
            truncated = true;
          }
          return {
            connector: "google-ads",
            action: "reports.get",
            source: "connector",
            report: validated.report,
            results: rows,
            rowCount: rows.length,
            truncated,
          };
        }
        throw handleError(result);
      });
  }
  return { connector: "google-ads", action: "reports.get", source: "connector", validated };
}

function validateReportsGetInput(input: unknown): ReportsGetInput {
  if (!isRecord(input)) throw new Error("reports.get input must be an object");
  const report = requireString(input.report, "report");
  if (!(report in REPORT_QUERIES)) {
    throw new Error("report must be one of CUSTOMER, CAMPAIGN, AD_GROUP_AD, KEYWORD");
  }
  return {
    customerId: requireString(input.customerId, "customerId"),
    report: report as ReportsGetInput["report"],
    startDate: optionalString(input.startDate),
    endDate: optionalString(input.endDate),
    maxRows: typeof input.maxRows === "number" ? input.maxRows : undefined,
  };
}

// Re-export normalize helpers used by fixture tests for mutate response parsing
export { parseMutateResponse, normalizeUserList, parseUserListsResponse };
