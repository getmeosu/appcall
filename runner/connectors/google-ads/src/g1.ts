/**
 * Ads G1 — assets / asset links / bidding / labels.get / tag snippets (+0 Composio seats beyond tip).
 * Locked: all six *:mutate ops and assets.callout.create omit effectPolicy/reconcile.
 * Paths are v25 via GOOGLE_ADS_BASE_URL. Never select segments.click_type on asset views.
 */
import {
  createGoogleAdsClient,
  sanitizeCustomerId,
  isRecord,
  parseGoogleAdsRateLimitMetadata,
  parseGoogleAdsError,
  type GoogleAdsClientOptions,
} from "./http";
import {
  parseMutateResponse,
  parseSearchResponse,
  extractIdFromResourceName,
} from "./objects";

type ActionResult = Record<string, unknown> | Promise<Record<string, unknown>>;

function hasLiveAuth(input: unknown, requireCustomerId = true): input is Record<string, unknown> & {
  accessToken: string;
  customerId?: string;
} {
  if (!isRecord(input)) return false;
  if (typeof input.accessToken !== "string" || input.accessToken.length === 0) return false;
  if (requireCustomerId) {
    if (typeof input.customerId !== "string" || input.customerId.length === 0) return false;
  }
  return true;
}

function optionalDeveloperToken(input: Record<string, unknown>): string | undefined {
  const value = input.developerToken;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function clientOpts(input: Record<string, unknown>, operation: string): GoogleAdsClientOptions {
  return {
    accessToken: String(input.accessToken),
    developerToken: optionalDeveloperToken(input),
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

type MutateInput = {
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

function mutateAction(input: unknown, action: string, pathSuffix: string): ActionResult {
  const validated = validateMutateInput(input, action);
  if (hasLiveAuth(input, true)) {
    return postMutate(input, action, pathSuffix, validated);
  }
  return { connector: "google-ads", action, source: "connector", validated };
}

async function gaqlSearchLive(
  input: Record<string, unknown>,
  action: string,
  query: string,
  pageToken?: string,
): Promise<{ results: Record<string, unknown>[]; nextPageToken: string | null; raw: unknown }> {
  const customerId = sanitizeCustomerId(String(input.customerId));
  const body: Record<string, unknown> = { query };
  if (pageToken) body.pageToken = pageToken;
  const result = await createGoogleAdsClient(clientOpts(input, action)).fetchJSON(
    customerPath(customerId, "/googleAds:search"),
    { method: "POST", body: JSON.stringify(body) },
  );
  if (result.status !== 200) throw handleError(result);
  const parsed = parseSearchResponse(result.body);
  return { results: parsed.results, nextPageToken: parsed.nextPageToken, raw: result.body };
}

function firstResource(row: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = row[key];
  return isRecord(value) ? value : null;
}

// ---------------------------------------------------------------------------
// assets.get / assets.list / assets.mutate / assets.callout.create
// ---------------------------------------------------------------------------

export function getAsset(input: unknown): ActionResult {
  if (!isRecord(input)) throw new Error("assets.get input must be an object");
  const validated = {
    customerId: requireString(input.customerId, "customerId"),
    assetId: requireString(input.assetId, "assetId"),
  };
  if (!hasLiveAuth(input, true)) {
    return { connector: "google-ads", action: "assets.get", source: "connector", validated };
  }
  const query =
    `SELECT asset.id, asset.name, asset.type, asset.resource_name, asset.final_urls ` +
    `FROM asset WHERE asset.id = ${escapeGaqlLiteral(validated.assetId)}`;
  return gaqlSearchLive(input, "assets.get", query).then(({ results, raw }) => {
    const asset = results[0] ? firstResource(results[0]!, "asset") : null;
    return {
      connector: "google-ads",
      action: "assets.get",
      source: "connector",
      asset: asset
        ? {
            id: `gads-asset:${asset.id ?? validated.assetId}`,
            provider: "google-ads",
            name: typeof asset.name === "string" ? asset.name : "",
            type: typeof asset.type === "string" ? asset.type : "",
            resourceName: typeof asset.resource_name === "string" ? asset.resource_name : "",
            raw: results[0],
          }
        : null,
      raw,
    };
  });
}

export function listAssets(input: unknown): ActionResult {
  if (!isRecord(input)) throw new Error("assets.list input must be an object");
  const validated = {
    customerId: requireString(input.customerId, "customerId"),
    pageToken: optionalString(input.pageToken),
  };
  if (!hasLiveAuth(input, true)) {
    return { connector: "google-ads", action: "assets.list", source: "connector", validated };
  }
  const query =
    `SELECT asset.id, asset.name, asset.type, asset.resource_name, asset.final_urls FROM asset`;
  return gaqlSearchLive(input, "assets.list", query, validated.pageToken).then(
    ({ results, nextPageToken, raw }) => ({
      connector: "google-ads",
      action: "assets.list",
      source: "connector",
      assets: results.map((row) => {
        const asset = firstResource(row, "asset") ?? {};
        return {
          id: `gads-asset:${asset.id ?? ""}`,
          provider: "google-ads",
          name: typeof asset.name === "string" ? asset.name : "",
          type: typeof asset.type === "string" ? asset.type : "",
          resourceName: typeof asset.resource_name === "string" ? asset.resource_name : "",
          raw: row,
        };
      }),
      nextPageToken,
      raw,
    }),
  );
}

export function mutateAssets(input: unknown): ActionResult {
  return mutateAction(input, "assets.mutate", "/assets:mutate");
}

export function createCalloutAsset(input: unknown): ActionResult {
  if (!isRecord(input)) throw new Error("assets.callout.create input must be an object");
  const validated = {
    customerId: requireString(input.customerId, "customerId"),
    calloutText: requireString(input.calloutText, "calloutText"),
    name: optionalString(input.name),
    validateOnly: optionalBool(input.validateOnly),
    partialFailure: optionalBool(input.partialFailure),
    responseContentType: optionalString(input.responseContentType),
  };
  if (!hasLiveAuth(input, true)) {
    return { connector: "google-ads", action: "assets.callout.create", source: "connector", validated };
  }
  const create: Record<string, unknown> = {
    type: "CALLOUT",
    calloutAsset: { calloutText: validated.calloutText },
  };
  if (validated.name) create.name = validated.name;
  return postMutate(input, "assets.callout.create", "/assets:mutate", {
    operations: [{ create }],
    validateOnly: validated.validateOnly,
    partialFailure: validated.partialFailure,
    responseContentType: validated.responseContentType,
  }).then((result) => {
    const resourceName = Array.isArray(result.resourceNames)
      ? (result.resourceNames as string[])[0]
      : undefined;
    return {
      ...result,
      asset: resourceName
        ? {
            id: `gads-asset:${extractIdFromResourceName(resourceName)}`,
            provider: "google-ads",
            calloutText: validated.calloutText,
            name: validated.name ?? "",
            resourceName,
          }
        : null,
    };
  });
}

// ---------------------------------------------------------------------------
// campaign_assets / ad_group_assets / customer_assets
// ---------------------------------------------------------------------------

/** Asset-view GAQL must never select segments.click_type (removed v24). */
export function getCampaignAsset(input: unknown): ActionResult {
  if (!isRecord(input)) throw new Error("campaign_assets.get input must be an object");
  const validated = {
    customerId: requireString(input.customerId, "customerId"),
    campaignId: requireString(input.campaignId, "campaignId"),
    assetId: requireString(input.assetId, "assetId"),
    fieldType: requireString(input.fieldType, "fieldType"),
  };
  if (!hasLiveAuth(input, true)) {
    return { connector: "google-ads", action: "campaign_assets.get", source: "connector", validated };
  }
  const query =
    `SELECT campaign_asset.resource_name, campaign_asset.campaign, campaign_asset.asset, ` +
    `campaign_asset.field_type, campaign_asset.status ` +
    `FROM campaign_asset WHERE campaign.id = ${escapeGaqlLiteral(validated.campaignId)} ` +
    `AND asset.id = ${escapeGaqlLiteral(validated.assetId)} ` +
    `AND campaign_asset.field_type = '${escapeGaqlLiteral(validated.fieldType)}'`;
  return gaqlSearchLive(input, "campaign_assets.get", query).then(({ results, raw }) => ({
    connector: "google-ads",
    action: "campaign_assets.get",
    source: "connector",
    campaignAsset: results[0] ? firstResource(results[0]!, "campaign_asset") : null,
    raw,
  }));
}

export function mutateCampaignAssets(input: unknown): ActionResult {
  return mutateAction(input, "campaign_assets.mutate", "/campaignAssets:mutate");
}

export function getAdGroupAsset(input: unknown): ActionResult {
  if (!isRecord(input)) throw new Error("ad_group_assets.get input must be an object");
  const validated = {
    customerId: requireString(input.customerId, "customerId"),
    adGroupId: requireString(input.adGroupId, "adGroupId"),
    assetId: requireString(input.assetId, "assetId"),
    fieldType: requireString(input.fieldType, "fieldType"),
  };
  if (!hasLiveAuth(input, true)) {
    return { connector: "google-ads", action: "ad_group_assets.get", source: "connector", validated };
  }
  const query =
    `SELECT ad_group_asset.resource_name, ad_group_asset.ad_group, ad_group_asset.asset, ` +
    `ad_group_asset.field_type, ad_group_asset.status ` +
    `FROM ad_group_asset WHERE ad_group.id = ${escapeGaqlLiteral(validated.adGroupId)} ` +
    `AND asset.id = ${escapeGaqlLiteral(validated.assetId)} ` +
    `AND ad_group_asset.field_type = '${escapeGaqlLiteral(validated.fieldType)}'`;
  return gaqlSearchLive(input, "ad_group_assets.get", query).then(({ results, raw }) => ({
    connector: "google-ads",
    action: "ad_group_assets.get",
    source: "connector",
    adGroupAsset: results[0] ? firstResource(results[0]!, "ad_group_asset") : null,
    raw,
  }));
}

export function mutateAdGroupAssets(input: unknown): ActionResult {
  return mutateAction(input, "ad_group_assets.mutate", "/adGroupAssets:mutate");
}

export function getCustomerAsset(input: unknown): ActionResult {
  if (!isRecord(input)) throw new Error("customer_assets.get input must be an object");
  const validated = {
    customerId: requireString(input.customerId, "customerId"),
    assetId: requireString(input.assetId, "assetId"),
    fieldType: requireString(input.fieldType, "fieldType"),
  };
  if (!hasLiveAuth(input, true)) {
    return { connector: "google-ads", action: "customer_assets.get", source: "connector", validated };
  }
  const query =
    `SELECT customer_asset.resource_name, customer_asset.asset, customer_asset.field_type, ` +
    `customer_asset.status FROM customer_asset WHERE asset.id = ${escapeGaqlLiteral(validated.assetId)} ` +
    `AND customer_asset.field_type = '${escapeGaqlLiteral(validated.fieldType)}'`;
  return gaqlSearchLive(input, "customer_assets.get", query).then(({ results, raw }) => ({
    connector: "google-ads",
    action: "customer_assets.get",
    source: "connector",
    customerAsset: results[0] ? firstResource(results[0]!, "customer_asset") : null,
    raw,
  }));
}

export function mutateCustomerAssets(input: unknown): ActionResult {
  return mutateAction(input, "customer_assets.mutate", "/customerAssets:mutate");
}

// ---------------------------------------------------------------------------
// labels.get / bidding_strategies.* / portfolio_bidding_strategies.mutate
// ---------------------------------------------------------------------------

export function getLabel(input: unknown): ActionResult {
  if (!isRecord(input)) throw new Error("labels.get input must be an object");
  const validated = {
    customerId: requireString(input.customerId, "customerId"),
    labelId: requireString(input.labelId, "labelId"),
  };
  if (!hasLiveAuth(input, true)) {
    return { connector: "google-ads", action: "labels.get", source: "connector", validated };
  }
  const query =
    `SELECT label.id, label.name, label.status, label.resource_name, label.text_label.background_color ` +
    `FROM label WHERE label.id = ${escapeGaqlLiteral(validated.labelId)}`;
  return gaqlSearchLive(input, "labels.get", query).then(({ results, raw }) => {
    const label = results[0] ? firstResource(results[0]!, "label") : null;
    return {
      connector: "google-ads",
      action: "labels.get",
      source: "connector",
      label: label
        ? {
            id: `gads-label:${label.id ?? validated.labelId}`,
            provider: "google-ads",
            name: typeof label.name === "string" ? label.name : "",
            status: typeof label.status === "string" ? label.status : "",
            resourceName: typeof label.resource_name === "string" ? label.resource_name : "",
            raw: results[0],
          }
        : null,
      raw,
    };
  });
}

export function getBiddingStrategy(input: unknown): ActionResult {
  if (!isRecord(input)) throw new Error("bidding_strategies.get input must be an object");
  const validated = {
    customerId: requireString(input.customerId, "customerId"),
    biddingStrategyId: requireString(input.biddingStrategyId, "biddingStrategyId"),
  };
  if (!hasLiveAuth(input, true)) {
    return { connector: "google-ads", action: "bidding_strategies.get", source: "connector", validated };
  }
  const query =
    `SELECT bidding_strategy.id, bidding_strategy.name, bidding_strategy.type, ` +
    `bidding_strategy.status, bidding_strategy.resource_name ` +
    `FROM bidding_strategy WHERE bidding_strategy.id = ${escapeGaqlLiteral(validated.biddingStrategyId)}`;
  return gaqlSearchLive(input, "bidding_strategies.get", query).then(({ results, raw }) => {
    const strategy = results[0] ? firstResource(results[0]!, "bidding_strategy") : null;
    return {
      connector: "google-ads",
      action: "bidding_strategies.get",
      source: "connector",
      biddingStrategy: strategy
        ? {
            id: `gads-bidding:${strategy.id ?? validated.biddingStrategyId}`,
            provider: "google-ads",
            name: typeof strategy.name === "string" ? strategy.name : "",
            type: typeof strategy.type === "string" ? strategy.type : "",
            status: typeof strategy.status === "string" ? strategy.status : "",
            resourceName: typeof strategy.resource_name === "string" ? strategy.resource_name : "",
            raw: results[0],
          }
        : null,
      raw,
    };
  });
}

export function mutateBiddingStrategies(input: unknown): ActionResult {
  return mutateAction(input, "bidding_strategies.mutate", "/biddingStrategies:mutate");
}

/** Same REST collection as bidding_strategies.mutate; typed portfolio Target CPA/ROAS creates. */
export function mutatePortfolioBiddingStrategies(input: unknown): ActionResult {
  return mutateAction(input, "portfolio_bidding_strategies.mutate", "/biddingStrategies:mutate");
}

// ---------------------------------------------------------------------------
// conversion_actions.tag_snippets.get
// ---------------------------------------------------------------------------

export function getConversionActionTagSnippets(input: unknown): ActionResult {
  if (!isRecord(input)) throw new Error("conversion_actions.tag_snippets.get input must be an object");
  const validated = {
    customerId: requireString(input.customerId, "customerId"),
    conversionActionId: requireString(input.conversionActionId, "conversionActionId"),
  };
  if (!hasLiveAuth(input, true)) {
    return {
      connector: "google-ads",
      action: "conversion_actions.tag_snippets.get",
      source: "connector",
      validated,
    };
  }
  const query =
    `SELECT conversion_action.id, conversion_action.name, conversion_action.resource_name, ` +
    `conversion_action.tag_snippets ` +
    `FROM conversion_action WHERE conversion_action.id = ${escapeGaqlLiteral(validated.conversionActionId)}`;
  return gaqlSearchLive(input, "conversion_actions.tag_snippets.get", query).then(({ results, raw }) => {
    const conversionAction = results[0] ? firstResource(results[0]!, "conversion_action") : null;
    const tagSnippets = conversionAction && Array.isArray(conversionAction.tag_snippets)
      ? conversionAction.tag_snippets
      : [];
    return {
      connector: "google-ads",
      action: "conversion_actions.tag_snippets.get",
      source: "connector",
      conversionActionId: validated.conversionActionId,
      tagSnippets,
      raw,
    };
  });
}
