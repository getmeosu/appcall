import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import coverage from "../../planetscale.coverage.json";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, any>>;
const { actions } = compileDeclarativeConnector(manifest as never);

// L2-5 batch: the first 48 missing_http rows implemented as declarative operations.
const batchTools: Array<[string, string]> = [
  ["PLANETSCALE_ADD_ORGANIZATION_TEAM_MEMBER", "teamMembers.add"],
  ["PLANETSCALE_ASSIGN_SHARD_CONFIGURATION_PROFILE_SHARDS", "configurationProfileShards.assign"],
  ["PLANETSCALE_BULK_CREATE_SHARD_CONFIGURATION_PROFILE_SHARDS", "configurationProfileShards.bulkCreate"],
  ["PLANETSCALE_CANCEL_DEPLOY_REQUEST", "deployRequests.cancel"],
  ["PLANETSCALE_CHECK_DEPLOY_REQUEST_STORAGE", "deployRequests.checkStorage"],
  ["PLANETSCALE_CLOSE_DEPLOY_REQUEST", "deployRequests.close"],
  ["PLANETSCALE_COMPLETE_ERRORED_DEPLOY", "deployRequests.completeDeploy"],
  ["PLANETSCALE_COMPLETE_GATED_DEPLOY_REQUEST", "deployRequests.applyDeploy"],
  ["PLANETSCALE_COMPLETE_REVERT", "deployRequests.revert"],
  ["PLANETSCALE_CONFIGURE_ORGANIZATION_SSO", "sso.configure"],
  ["PLANETSCALE_CREATE_BACKUP", "backups.create"],
  ["PLANETSCALE_CREATE_BACKUP_POLICY", "backupPolicies.create"],
  ["PLANETSCALE_CREATE_BOUNCER", "bouncers.create"],
  ["PLANETSCALE_CREATE_BRANCH", "branches.create"],
  ["PLANETSCALE_CREATE_BRANCH_LOG_SIGNATURE", "branchLogSignatures.create"],
  ["PLANETSCALE_CREATE_DATABASE", "databases.create"],
  ["PLANETSCALE_CREATE_DATABASE_POSTGRES_CIDR", "databaseCidrs.create"],
  ["PLANETSCALE_CREATE_DEPLOY_REQUEST", "deployRequests.create"],
  ["PLANETSCALE_CREATE_INSIGHTS_AGENT_RUN", "insightsAgentRuns.create"],
  ["PLANETSCALE_CREATE_ORGANIZATION_SSO_DOMAIN", "ssoDomains.create"],
  ["PLANETSCALE_CREATE_ORGANIZATION_TEAM", "teams.create"],
  ["PLANETSCALE_CREATE_PASSWORD", "passwords.create"],
  ["PLANETSCALE_CREATE_PAYMENT_METHOD_SETUP", "paymentMethodSetups.create"],
  ["PLANETSCALE_CREATE_QUERY_PATTERNS_REPORT", "queryPatternsReports.create"],
  ["PLANETSCALE_CREATE_READ_ONLY_REPLICA", "dedicatedReadReplicas.create"],
  ["PLANETSCALE_CREATE_ROLE", "roles.create"],
  ["PLANETSCALE_CREATE_ROUTER", "routers.create"],
  ["PLANETSCALE_CREATE_SHARD_CONFIGURATION_PROFILE", "configurationProfiles.create"],
  ["PLANETSCALE_CREATE_SHARD_CONFIGURATION_PROFILE_SHARD", "configurationProfileShards.create"],
  ["PLANETSCALE_CREATE_SWITCHOVER", "switchovers.create"],
  ["PLANETSCALE_CREATE_TRAFFIC_BUDGET", "trafficBudgets.create"],
  ["PLANETSCALE_CREATE_TRAFFIC_RULE", "trafficRules.create"],
  ["PLANETSCALE_CREATE_WEBHOOK", "webhooks.create"],
  ["PLANETSCALE_DEMOTE_BRANCH", "branches.demote"],
  ["PLANETSCALE_DISABLE_ORGANIZATION_SSO", "sso.disable"],
  ["PLANETSCALE_DISABLE_ORGANIZATION_SSO_DIRECTORY", "ssoDirectories.disable"],
  ["PLANETSCALE_DISABLE_SAFE_MIGRATIONS", "safeMigrations.disable"],
  ["PLANETSCALE_DISMISS_SCHEMA_RECOMMENDATION", "schemaRecommendations.dismiss"],
  ["PLANETSCALE_ENABLE_ORGANIZATION_SSO", "sso.enable"],
  ["PLANETSCALE_ENABLE_ORGANIZATION_SSO_DIRECTORY", "ssoDirectories.enable"],
  ["PLANETSCALE_ENABLE_SAFE_MIGRATIONS", "safeMigrations.enable"],
  ["PLANETSCALE_FORCE_CUTOVER_DEPLOY_REQUEST", "deployRequests.forceCutover"],
  ["PLANETSCALE_GET_ADMIN", "admins.get"],
  ["PLANETSCALE_GET_BACKUP", "backups.get"],
  ["PLANETSCALE_GET_BACKUP_POLICY", "backupPolicies.get"],
  ["PLANETSCALE_GET_BOUNCER", "bouncers.get"],
  ["PLANETSCALE_GET_BRANCH", "branches.get"],
  ["PLANETSCALE_GET_BRANCH_ANOMALY", "branchAnomalies.get"],
];

// L2-11 batch: the next 48 missing_http rows implemented as declarative operations.
const batch2Tools: Array<[string, string]> = [
  ["PLANETSCALE_GET_BRANCH_CHANGE_REQUEST", "branchChangeRequests.get"],
  ["PLANETSCALE_GET_BRANCH_METRICS", "branchMetrics.get"],
  ["PLANETSCALE_GET_BRANCH_QUERY", "branchQueries.get"],
  ["PLANETSCALE_GET_BRANCH_QUERY_ERROR", "branchQueryErrors.get"],
  ["PLANETSCALE_GET_BRANCH_QUERY_METRICS", "branchQueryMetrics.get"],
  ["PLANETSCALE_GET_BRANCH_QUERY_TAG", "branchQueryTags.get"],
  ["PLANETSCALE_GET_BRANCH_RESIZE_REQUEST", "branchResizeRequests.get"],
  ["PLANETSCALE_GET_BRANCH_SCHEMA", "branchSchemas.get"],
  ["PLANETSCALE_GET_BRANCH_TAG_METRICS", "branchTagMetrics.get"],
  ["PLANETSCALE_GET_CURRENT_USER", "users.current"],
  ["PLANETSCALE_GET_DATABASE_POSTGRES_CIDR", "databaseCidrs.get"],
  ["PLANETSCALE_GET_DATABASE_THROTTLER", "databaseThrottlers.get"],
  ["PLANETSCALE_GET_DATA_TOPOLOGY", "dataTopologies.get"],
  ["PLANETSCALE_GET_DEFAULT_ROLE", "defaultRoles.get"],
  ["PLANETSCALE_GET_DEPLOYMENT", "deployments.get"],
  ["PLANETSCALE_GET_DEPLOY_QUEUE", "deployQueues.get"],
  ["PLANETSCALE_GET_DEPLOY_REQUEST", "deployRequests.get"],
  ["PLANETSCALE_GET_DEPLOY_REQUEST_THROTTLER", "deployRequestThrottlers.get"],
  ["PLANETSCALE_GET_INSIGHTS_AGENT_RUN", "insightsAgentRuns.get"],
  ["PLANETSCALE_GET_INSTANT_BRANCH_METRICS", "instantBranchMetrics.get"],
  ["PLANETSCALE_GET_INSTANT_TABLET_METRICS", "instantTabletMetrics.get"],
  ["PLANETSCALE_GET_INVOICE", "invoices.get"],
  ["PLANETSCALE_GET_INVOICE_LINE_ITEMS", "invoiceLineItems.get"],
  ["PLANETSCALE_GET_MAINTENANCE_SCHEDULE", "maintenanceSchedules.get"],
  ["PLANETSCALE_GET_NEKI_CHANGE_REQUEST", "nekiChangeRequests.get"],
  ["PLANETSCALE_GET_ORGANIZATION", "organizations.get"],
  ["PLANETSCALE_GET_ORGANIZATION_BILLING_PAYMENT_METHOD", "billingPaymentMethods.get"],
  ["PLANETSCALE_GET_ORGANIZATION_MEMBERSHIP", "memberships.get"],
  ["PLANETSCALE_GET_ORGANIZATION_SSO", "sso.get"],
  ["PLANETSCALE_GET_ORGANIZATION_SSO_DOMAIN", "ssoDomains.get"],
  ["PLANETSCALE_GET_ORGANIZATION_TEAM", "teams.get"],
  ["PLANETSCALE_GET_ORGANIZATION_TEAM_MEMBER", "teamMembers.get"],
  ["PLANETSCALE_GET_PASSWORD", "passwords.get"],
  ["PLANETSCALE_GET_PAYMENT_METHOD_SETUP", "paymentMethodSetups.get"],
  ["PLANETSCALE_GET_QUERY_PATTERNS_REPORT_STATUS", "queryPatternsReports.get"],
  ["PLANETSCALE_GET_QUERY_STATISTICS", "queryStatistics.get"],
  ["PLANETSCALE_GET_QUERY_SUMMARY", "querySummaries.get"],
  ["PLANETSCALE_GET_READ_ONLY_REPLICA", "dedicatedReadReplicas.get"],
  ["PLANETSCALE_GET_ROLE", "roles.get"],
  ["PLANETSCALE_GET_ROUTER", "routers.get"],
  ["PLANETSCALE_GET_SCHEMA_RECOMMENDATION", "schemaRecommendations.get"],
  ["PLANETSCALE_GET_SHARD", "shards.get"],
  ["PLANETSCALE_GET_SHARD_CONFIGURATION_PROFILE", "configurationProfiles.get"],
  ["PLANETSCALE_GET_SHARD_CONFIGURATION_PROFILE_SHARD", "configurationProfileShards.get"],
  ["PLANETSCALE_GET_SIDECAR", "sidecars.get"],
  ["PLANETSCALE_GET_SWITCHOVER", "switchovers.get"],
  ["PLANETSCALE_GET_TABLET_METRICS", "tabletMetrics.get"],
  ["PLANETSCALE_GET_TRAFFIC_BUDGET", "trafficBudgets.get"],
];

describe("PlanetScale contract", () => {
  test("coverage artifact accounts for all 245 tools exactly once", () => {
    const tools = [...coverage.mapped, ...coverage.missing_http, ...coverage.missing_still].map((row) => row.tool);
    expect(coverage.composio_tools).toBe(245);
    expect(coverage.full_depth).toBe(true);
    expect(tools).toHaveLength(245);
    expect(new Set(tools).size).toBe(245);
  });

  test("the 48 batch tools are mapped to compiled declarative actions", () => {
    const mapped = new Map(coverage.mapped.map((row) => [row.tool, row.operation]));
    for (const [tool, operation] of batchTools) {
      expect(mapped.get(tool), tool).toBe(operation);
      const definition = operations[operation];
      expect(typeof definition?.request?.method, tool).toBe("string");
      expect(typeof definition?.request?.path, tool).toBe("string");
      expect(typeof actions[operation], tool).toBe("function");
    }
  });

  test("the 48 batch-2 tools are mapped to compiled declarative actions", () => {
    const mapped = new Map(coverage.mapped.map((row) => [row.tool, row.operation]));
    for (const [tool, operation] of batch2Tools) {
      expect(mapped.get(tool), tool).toBe(operation);
      const definition = operations[operation];
      expect(definition?.request?.method, tool).toBe("GET");
      expect(typeof definition?.request?.path, tool).toBe("string");
      expect(typeof actions[operation], tool).toBe("function");
    }
  });

  test("every mapped tool resolves to a compiled declarative action", () => {
    for (const row of coverage.mapped) {
      const definition = operations[row.operation];
      expect(typeof definition?.request?.method, row.tool).toBe("string");
      expect(typeof definition?.request?.path, row.tool).toBe("string");
      expect(typeof actions[row.operation], row.tool).toBe("function");
    }
  });

  test("declares bounded strict-generated JSON actions with method-derived side effects", () => {
    for (const [name, operation] of Object.entries(operations)) {
      expect(operation.kind, name).toBe("action");
      expect(operation.validationMode, name).toBe("strict-generated");
      expect(operation.responseFormat, name).toBe("json");
      expect(operation.enforceOutputSchema, name).toBe(true);
      expect(operation.outputSchema.type, name).toBe("object");
      expect(typeof operation.title, name).toBe("string");
      expect(typeof operation.description, name).toBe("string");
      expect(operation.inputSchema.type, name).toBe("object");
      expect(operation.inputSchema.additionalProperties, name).toBe(false);
      const method = operation.request.method;
      expect(operation.sideEffect, name).toBe(method === "DELETE" ? "destructive" : method === "GET" ? "read" : "write");
      expect(operation.request.success.length, name).toBeGreaterThan(0);
      for (const status of operation.request.success) expect([200, 201], name).toContain(status);
      expect(operation.timeoutMs, name).toBeGreaterThanOrEqual(1);
      expect(operation.maxResponseBytes, name).toBeGreaterThanOrEqual(operation.maxInputBytes);
    }
  });
});
