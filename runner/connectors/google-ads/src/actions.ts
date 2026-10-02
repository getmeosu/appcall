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
  normalizeAccessibleCustomer,
  normalizeCustomerClient,
  normalizeUserList,
  parseCampaignsResponse,
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
  return {
    customerId: requireString(input.customerId, "customerId"),
    campaignId: requireString(input.campaignId ?? input.id, "campaignId"),
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
