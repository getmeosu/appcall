import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import manifest from "../manifest.json";
import coverage from "../../shopify.coverage.json";

// L2-19: the 41 Composio shopify slugs whose `missing_http` backlog entries are
// documented Admin GraphQL 2026-10 operations on POST /graphql.json. Each row
// records the Composio slug, the AppCall operation key, the GraphQL operation
// name, its kind, side effect, and the primary Shopify reference page.
type Row = {
  tool: string;
  operation: string;
  gql: string;
  kind: "query" | "mutation";
  sideEffect: "read" | "write" | "destructive";
  docs: string;
};

const DOC_BASE = "https://shopify.dev/docs/api/admin-graphql/2026-10";
const doc = (path: string) => `${DOC_BASE}/${path}`;

const ROWS: Row[] = [
  { tool: "SHOPIFY_GET_APP_BY_HANDLE", operation: "app.get-by-handle", gql: "appByHandle", kind: "query", sideEffect: "read", docs: doc("queries/appByHandle") },
  { tool: "SHOPIFY_GET_APP_INSTALLATION", operation: "app-installations.get", gql: "appInstallation", kind: "query", sideEffect: "read", docs: doc("queries/appInstallation") },
  { tool: "SHOPIFY_GET_CHECKOUTS_COUNT", operation: "abandoned-checkouts.count", gql: "abandonedCheckoutsCount", kind: "query", sideEffect: "read", docs: doc("queries/abandonedCheckoutsCount") },
  { tool: "SHOPIFY_GET_COLLECTION_BY_IDENTIFIER", operation: "collections.get-by-identifier", gql: "collectionByIdentifier", kind: "query", sideEffect: "read", docs: doc("queries/collectionByIdentifier") },
  { tool: "SHOPIFY_GET_LOCATIONS_COUNT", operation: "graphql.locations.count", gql: "locationsCount", kind: "query", sideEffect: "read", docs: doc("queries/locationsCount") },
  { tool: "SHOPIFY_GET_SEGMENTS_COUNT", operation: "segments.count", gql: "segmentsCount", kind: "query", sideEffect: "read", docs: doc("queries/segmentsCount") },
  { tool: "SHOPIFY_GET_WEBHOOK_SUBSCRIPTIONS_COUNT", operation: "webhook-subscriptions.count", gql: "webhookSubscriptionsCount", kind: "query", sideEffect: "read", docs: doc("queries/webhookSubscriptionsCount") },
  { tool: "SHOPIFY_LIST_AVAILABLE_LOCALES", operation: "available-locales.list", gql: "availableLocales", kind: "query", sideEffect: "read", docs: doc("queries/availableLocales") },
  { tool: "SHOPIFY_LIST_CHANNELS", operation: "channels.list", gql: "channels", kind: "query", sideEffect: "read", docs: doc("queries/channels") },
  { tool: "SHOPIFY_QUERY_APP_BY_KEY", operation: "app.get-by-key", gql: "appByKey", kind: "query", sideEffect: "read", docs: doc("queries/appByKey") },
  { tool: "SHOPIFY_QUERY_BUSINESS_ENTITIES", operation: "business-entities.list", gql: "businessEntities", kind: "query", sideEffect: "read", docs: doc("queries/businessEntities") },
  { tool: "SHOPIFY_QUERY_BUSINESS_ENTITY", operation: "business-entities.get", gql: "businessEntity", kind: "query", sideEffect: "read", docs: doc("queries/businessEntity") },
  { tool: "SHOPIFY_QUERY_CHANNEL", operation: "channels.get", gql: "channel", kind: "query", sideEffect: "read", docs: doc("queries/channel") },
  { tool: "SHOPIFY_QUERY_CONSENT_POLICY_REGIONS", operation: "consent-policy-regions.list", gql: "consentPolicyRegions", kind: "query", sideEffect: "read", docs: doc("queries/consentPolicyRegions") },
  { tool: "SHOPIFY_QUERY_CURRENT_APP_INSTALLATION", operation: "app-installations.current", gql: "currentAppInstallation", kind: "query", sideEffect: "read", docs: doc("queries/currentAppInstallation") },
  { tool: "SHOPIFY_QUERY_DELETION_EVENTS", operation: "deletion-events.list", gql: "deletionEvents", kind: "query", sideEffect: "read", docs: doc("queries/deletionEvents") },
  { tool: "SHOPIFY_QUERY_DISPUTES", operation: "graphql.disputes.list", gql: "disputes", kind: "query", sideEffect: "read", docs: doc("queries/disputes") },
  { tool: "SHOPIFY_QUERY_DOMAIN", operation: "domains.get", gql: "domain", kind: "query", sideEffect: "read", docs: doc("queries/domain") },
  { tool: "SHOPIFY_QUERY_EVENTS", operation: "graphql.events.list", gql: "events", kind: "query", sideEffect: "read", docs: doc("queries/events") },
  { tool: "SHOPIFY_QUERY_EVENTS_COUNT", operation: "graphql.events.count", gql: "eventsCount", kind: "query", sideEffect: "read", docs: doc("queries/eventsCount") },
  { tool: "SHOPIFY_QUERY_METAFIELD_DEFINITION", operation: "metafield-definitions.get", gql: "metafieldDefinition", kind: "query", sideEffect: "read", docs: doc("queries/metafieldDefinition") },
  { tool: "SHOPIFY_QUERY_METAFIELD_DEFINITIONS", operation: "metafield-definitions.list", gql: "metafieldDefinitions", kind: "query", sideEffect: "read", docs: doc("queries/metafieldDefinitions") },
  { tool: "SHOPIFY_QUERY_METAFIELD_DEFINITION_TYPES", operation: "metafield-definition-types.list", gql: "metafieldDefinitionTypes", kind: "query", sideEffect: "read", docs: doc("queries/metafieldDefinitionTypes") },
  { tool: "SHOPIFY_QUERY_NODE", operation: "nodes.get", gql: "node", kind: "query", sideEffect: "read", docs: doc("queries/node") },
  { tool: "SHOPIFY_QUERY_PRODUCT_DUPLICATE_JOB", operation: "product-duplicate-jobs.get", gql: "productDuplicateJob", kind: "query", sideEffect: "read", docs: doc("queries/productDuplicateJob") },
  { tool: "SHOPIFY_QUERY_PUBLICATION", operation: "publications.get", gql: "publication", kind: "query", sideEffect: "read", docs: doc("queries/publication") },
  { tool: "SHOPIFY_QUERY_SERVER_PIXEL", operation: "server-pixels.get", gql: "serverPixel", kind: "query", sideEffect: "read", docs: doc("queries/serverPixel") },
  { tool: "SHOPIFY_QUERY_SHOP", operation: "shops.current", gql: "shop", kind: "query", sideEffect: "read", docs: doc("queries/shop") },
  { tool: "SHOPIFY_QUERY_SHOPIFY_FUNCTIONS", operation: "shopify-functions.list", gql: "shopifyFunctions", kind: "query", sideEffect: "read", docs: doc("queries/shopifyFunctions") },
  { tool: "SHOPIFY_QUERY_SHOP_BILLING_PREFERENCES", operation: "shops.billing-preferences", gql: "shopBillingPreferences", kind: "query", sideEffect: "read", docs: doc("queries/shopBillingPreferences") },
  { tool: "SHOPIFY_QUERY_SHOP_PAY_PAYMENT_REQUEST_RECEIPTS", operation: "shop-pay-payment-request-receipts.list", gql: "shopPayPaymentRequestReceipts", kind: "query", sideEffect: "read", docs: doc("queries/shopPayPaymentRequestReceipts") },
  { tool: "SHOPIFY_QUERY_STANDARD_METAFIELD_DEFINITION_TEMPLATES", operation: "standard-metafield-definition-templates.list", gql: "standardMetafieldDefinitionTemplates", kind: "query", sideEffect: "read", docs: doc("queries/standardMetafieldDefinitionTemplates") },
  { tool: "SHOPIFY_QUERY_WEBHOOK_SUBSCRIPTION", operation: "webhook-subscriptions.get", gql: "webhookSubscription", kind: "query", sideEffect: "read", docs: doc("queries/webhookSubscription") },
  { tool: "SHOPIFY_QUERY_WEBHOOK_SUBSCRIPTIONS", operation: "webhook-subscriptions.list", gql: "webhookSubscriptions", kind: "query", sideEffect: "read", docs: doc("queries/webhookSubscriptions") },
  { tool: "SHOPIFY_CREATE_DELEGATE_ACCESS_TOKEN", operation: "delegate-access-tokens.create", gql: "delegateAccessTokenCreate", kind: "mutation", sideEffect: "write", docs: doc("mutations/delegateAccessTokenCreate") },
  { tool: "SHOPIFY_CREATE_WEBHOOK_SUBSCRIPTION", operation: "webhook-subscriptions.create", gql: "webhookSubscriptionCreate", kind: "mutation", sideEffect: "write", docs: doc("mutations/webhookSubscriptionCreate") },
  { tool: "SHOPIFY_DELETE_SAVED_SEARCH", operation: "saved-searches.delete", gql: "savedSearchDelete", kind: "mutation", sideEffect: "destructive", docs: doc("mutations/savedSearchDelete") },
  { tool: "SHOPIFY_DELETE_WEBHOOK_SUBSCRIPTION", operation: "webhook-subscriptions.delete", gql: "webhookSubscriptionDelete", kind: "mutation", sideEffect: "destructive", docs: doc("mutations/webhookSubscriptionDelete") },
  { tool: "SHOPIFY_DELETE_WEB_PRESENCE", operation: "web-presences.delete", gql: "webPresenceDelete", kind: "mutation", sideEffect: "destructive", docs: doc("mutations/webPresenceDelete") },
  { tool: "SHOPIFY_REVOKE_APP_ACCESS_SCOPES", operation: "app-access-scopes.revoke", gql: "appRevokeAccessScopes", kind: "mutation", sideEffect: "write", docs: doc("mutations/appRevokeAccessScopes") },
  { tool: "SHOPIFY_UPDATE_WEBHOOK_SUBSCRIPTION", operation: "webhook-subscriptions.update", gql: "webhookSubscriptionUpdate", kind: "mutation", sideEffect: "write", docs: doc("mutations/webhookSubscriptionUpdate") },
];

type Operation = {
  kind: string;
  sideEffect?: string;
  effectPolicy?: string;
  reconcile?: string;
  title?: string;
  description?: string;
  validationMode?: string;
  responseFormat?: string;
  enforceOutputSchema?: boolean;
  inputSchema?: { properties?: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
  outputSchema?: { required?: string[] };
  request?: { method?: string; path?: string; success?: number[]; body?: { query?: string; variables?: Record<string, string> } };
};

const ops = manifest.operations as unknown as Record<string, Operation>;

function fixtureFile(kind: "cases" | "responses" | "expected", name: string): string {
  return readFileSync(new URL(`../fixtures/${kind}/${name}.json`, import.meta.url), "utf8");
}

describe("shopify L2-19 Admin GraphQL backlog", () => {
  test("declares all 41 rows as strict-generated POST /graphql.json actions", () => {
    expect(ROWS).toHaveLength(41);
    expect(new Set(ROWS.map((row) => row.tool)).size).toBe(41);
    expect(new Set(ROWS.map((row) => row.operation)).size).toBe(41);
    for (const row of ROWS) {
      const op = ops[row.operation];
      expect(op, row.operation).toBeDefined();
      expect(op.kind, row.operation).toBe("action");
      expect(op.request?.method, row.operation).toBe("POST");
      expect(op.request?.path, row.operation).toBe("/graphql.json");
      expect(op.request?.success, row.operation).toEqual([200]);
      expect(op.responseFormat, row.operation).toBe("json");
      expect(op.validationMode, row.operation).toBe("strict-generated");
      expect(op.enforceOutputSchema, row.operation).toBe(true);
      expect(op.title, row.operation).toBe(row.gql);
      expect(op.description, row.operation).toContain(`POST /graphql.json Shopify Admin GraphQL 2026-10 ${row.kind} ${row.gql}.`);
      expect(op.description, row.operation).toContain(row.docs);
      expect(op.inputSchema?.additionalProperties, row.operation).toBe(false);
      expect(op.outputSchema?.required, row.operation).toEqual(["data"]);
    }
  });

  test("GraphQL documents open with their operation type and bind exactly the declared inputs", () => {
    for (const row of ROWS) {
      const op = ops[row.operation];
      const query = (op.request?.body?.query ?? "").trimStart();
      expect(query.startsWith(`${row.kind} `), row.operation).toBe(true);
      expect(query, row.operation).toContain(row.gql);

      const declared = Object.keys(op.inputSchema?.properties ?? {}).sort();
      const bound = Object.keys(op.request?.body?.variables ?? {}).sort();
      expect(bound, row.operation).toEqual(declared);
      for (const [name, template] of Object.entries(op.request?.body?.variables ?? {})) {
        expect(template, `${row.operation}.${name}`).toBe(`{{${name}}}`);
      }
      for (const name of op.inputSchema?.required ?? []) {
        expect(bound, `${row.operation} required ${name}`).toContain(name);
      }
    }
  });

  test("side effects follow the operation type; deletes are destructive without effect keys", () => {
    for (const row of ROWS) {
      const op = ops[row.operation];
      expect(op.sideEffect, row.operation).toBe(row.sideEffect);
      if (row.kind === "query") expect(op.sideEffect, row.operation).toBe("read");
      if (row.kind === "mutation") expect(op.sideEffect, row.operation).not.toBe("read");
      if (op.sideEffect === "destructive") {
        expect(op.effectPolicy, row.operation).toBeUndefined();
        expect(op.reconcile, row.operation).toBeUndefined();
      }
    }
    const deletes = ROWS.filter((row) => row.sideEffect === "destructive").map((row) => row.operation);
    expect(deletes).toEqual(["saved-searches.delete", "webhook-subscriptions.delete", "web-presences.delete"]);
  });

  test("every row ships three fixtures: case, response, expected", () => {
    for (const row of ROWS) {
      const key = row.operation;
      const fixtureCase = JSON.parse(fixtureFile("cases", `${key}-success`)) as {
        id: string;
        operation: string;
        input: Record<string, unknown>;
        exchanges: Array<{ request: { method: string; body: string }; response: { bodyFile: string } }>;
        expected: { kind: string; resultFile: string };
      };
      expect(fixtureCase.id, key).toBe(`${key}-success`);
      expect(fixtureCase.operation, key).toBe(key);
      expect(fixtureCase.exchanges).toHaveLength(1);
      expect(fixtureCase.exchanges[0]?.request.method, key).toBe("POST");
      expect(fixtureCase.exchanges[0]?.response.bodyFile, key).toBe(`../responses/${key}-success-0.json`);
      expect(fixtureCase.expected.kind, key).toBe("success");
      expect(fixtureCase.expected.resultFile, key).toBe(`../expected/${key}-success.json`);
      const response = JSON.parse(fixtureFile("responses", `${key}-success-0`)) as Record<string, unknown>;
      const expected = JSON.parse(fixtureFile("expected", `${key}-success`)) as Record<string, unknown>;
      expect(Object.keys(response), key).toEqual(["data"]);
      expect(expected, key).toEqual({ connector: "shopify", action: key, source: "provider", data: response });
      for (const name of Object.keys(fixtureCase.input)) {
        expect(op_input_property(ops[key], name), `${key}.${name}`).toBeDefined();
      }
      for (const name of ops[key].inputSchema?.required ?? []) {
        expect(Object.hasOwn(fixtureCase.input, name), `${key} fixture supplies ${name}`).toBe(true);
      }
    }
  });

  test("the coverage artifact maps every slug to its operation with an empty missing_http", () => {
    const mapped = new Map(coverage.mapped.map((row: { tool: string; operation: string }) => [row.tool, row.operation]));
    for (const row of ROWS) {
      expect(mapped.get(row.tool), row.tool).toBe(row.operation);
    }
    expect(coverage.missing_http).toEqual([]);
    expect(coverage.mapped).toHaveLength(402);
    expect(coverage.composio_tools).toBe(407);
    expect(coverage.mapped.length + coverage.missing_http.length + coverage.missing_still.length).toBe(407);
    expect(coverage.full_depth).toBe(true);
  });
});

function op_input_property(op: Operation | undefined, name: string): unknown {
  return op?.inputSchema?.properties?.[name];
}
