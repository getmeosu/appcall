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

// L2-17 batch: the next 48 missing_http rows implemented as declarative operations.
const batch3Tools: Array<[string, string]> = [
  ["PLANETSCALE_GET_WEBHOOK", "webhooks.get"],
  ["PLANETSCALE_LINT_BRANCH_SCHEMA", "branchSchemas.lint"],
  ["PLANETSCALE_LIST_ADMIN_PARAMETERS", "adminParameters.list"],
  ["PLANETSCALE_LIST_ADMIN_SIZE_SKUS", "adminSizeSkus.list"],
  ["PLANETSCALE_LIST_AUDIT_LOGS", "auditLogs.list"],
  ["PLANETSCALE_LIST_BACKUPS", "backups.list"],
  ["PLANETSCALE_LIST_BACKUP_POLICIES", "backupPolicies.list"],
  ["PLANETSCALE_LIST_BOUNCERS", "bouncers.list"],
  ["PLANETSCALE_LIST_BOUNCER_RESIZE_REQUESTS", "bouncerResizeRequests.list"],
  ["PLANETSCALE_LIST_BRANCH_ANOMALIES", "branchAnomalies.list"],
  ["PLANETSCALE_LIST_BRANCH_BOUNCER_RESIZE_REQUESTS", "branchBouncerResizeRequests.list"],
  ["PLANETSCALE_LIST_BRANCH_CHANGE_REQUESTS", "branchChangeRequests.list"],
  ["PLANETSCALE_LIST_BRANCH_QUERIES", "branchQueries.list"],
  ["PLANETSCALE_LIST_BRANCH_QUERY_ERRORS", "branchQueryErrors.list"],
  ["PLANETSCALE_LIST_BRANCH_QUERY_TAGS", "branchQueryTags.list"],
  ["PLANETSCALE_LIST_BRANCH_QUERY_TAG_SUMMARIES", "branchQueryTagSummaries.list"],
  ["PLANETSCALE_LIST_BRANCH_RESIZE_REQUESTS", "branchResizeRequests.list"],
  ["PLANETSCALE_LIST_CLUSTER_SIZE_SKUS", "clusterSizeSkus.list"],
  ["PLANETSCALE_LIST_DATABASE_POSTGRES_CIDRS", "databaseCidrs.list"],
  ["PLANETSCALE_LIST_DATABASE_REGIONS", "databaseRegions.list"],
  ["PLANETSCALE_LIST_DEPLOY_OPERATIONS", "deployOperations.list"],
  ["PLANETSCALE_LIST_DEPLOY_REQUESTS", "deployRequests.list"],
  ["PLANETSCALE_LIST_DEPLOY_REQUEST_REVIEWS", "deployRequestReviews.list"],
  ["PLANETSCALE_LIST_EXTENSIONS", "extensions.list"],
  ["PLANETSCALE_LIST_GENERATED_QUERY_PATTERNS_REPORTS", "queryPatternsReports.list"],
  ["PLANETSCALE_LIST_INSIGHTS_AGENT_RUNS", "insightsAgentRuns.list"],
  ["PLANETSCALE_LIST_INSIGHTS_AGENT_SCHEDULES", "insightsAgentSchedules.list"],
  ["PLANETSCALE_LIST_INVOICES", "invoices.list"],
  ["PLANETSCALE_LIST_MAINTENANCE_SCHEDULES", "maintenanceSchedules.list"],
  ["PLANETSCALE_LIST_MAINTENANCE_WINDOWS", "maintenanceWindows.list"],
  ["PLANETSCALE_LIST_NEKI_CHANGE_REQUESTS", "nekiChangeRequests.list"],
  ["PLANETSCALE_LIST_ORGANIZATION_MEMBERS", "organizationMembers.list"],
  ["PLANETSCALE_LIST_ORGANIZATION_SSO_DOMAINS", "ssoDomains.list"],
  ["PLANETSCALE_LIST_ORGANIZATION_TEAMS", "teams.list"],
  ["PLANETSCALE_LIST_ORGANIZATION_TEAM_MEMBERS", "teamMembers.list"],
  ["PLANETSCALE_LIST_PARAMETERS", "parameters.list"],
  ["PLANETSCALE_LIST_PASSWORDS", "passwords.list"],
  ["PLANETSCALE_LIST_POSTGRES_VERSIONS", "postgresVersions.list"],
  ["PLANETSCALE_LIST_READ_ONLY_REGIONS", "readOnlyRegions.list"],
  ["PLANETSCALE_LIST_READ_ONLY_REPLICAS", "dedicatedReadReplicas.list"],
  ["PLANETSCALE_LIST_READ_ONLY_REPLICA_CHANGE_REQUESTS", "dedicatedReadReplicaChangeRequests.list"],
  ["PLANETSCALE_LIST_REGIONS_FOR_ORGANIZATION", "regions.list"],
  ["PLANETSCALE_LIST_ROLES", "roles.list"],
  ["PLANETSCALE_LIST_ROUTERS", "routers.list"],
  ["PLANETSCALE_LIST_ROUTER_PARAMETERS", "routerParameters.list"],
  ["PLANETSCALE_LIST_ROUTER_SIZE_SKUS", "routerSizeSkus.list"],
  ["PLANETSCALE_LIST_SCHEMA_RECOMMENDATIONS", "schemaRecommendations.list"],
  ["PLANETSCALE_LIST_SHARDS", "shards.list"],
];

// L2-23 batch: the final 47 missing_http rows implemented as declarative operations.
// PLANETSCALE_OAUTH_TOKEN_INFO is reclassified to missing_still (OAuth-only route on
// auth.planetscale.com requiring a Bearer access token this service-token connector
// does not carry).
const batch4Tools: Array<[string, string]> = [
  ["PLANETSCALE_LIST_SHARD_CONFIGURATION_PROFILES", "configurationProfiles.list"],
  ["PLANETSCALE_LIST_SHARD_CONFIGURATION_PROFILE_EXTENSIONS", "configurationProfileExtensions.list"],
  ["PLANETSCALE_LIST_SHARD_CONFIGURATION_PROFILE_PARAMETERS", "configurationProfileParameters.list"],
  ["PLANETSCALE_LIST_SHARD_CONFIGURATION_PROFILE_SHARDS", "configurationProfileShards.list"],
  ["PLANETSCALE_LIST_SIDECARS", "sidecars.list"],
  ["PLANETSCALE_LIST_SIDECAR_PARAMETERS", "sidecarParameters.list"],
  ["PLANETSCALE_LIST_SWITCHOVERS", "switchovers.list"],
  ["PLANETSCALE_LIST_TRAFFIC_BUDGETS", "trafficBudgets.list"],
  ["PLANETSCALE_LIST_TRAFFIC_BUDGETS_FOR_QUERY", "queryTrafficBudgets.list"],
  ["PLANETSCALE_LIST_WEBHOOKS", "webhooks.list"],
  ["PLANETSCALE_PROMOTE_BRANCH", "branches.promote"],
  ["PLANETSCALE_QUEUE_DEPLOY_REQUEST", "deployRequests.queue"],
  ["PLANETSCALE_RENEW_PASSWORD", "passwords.renew"],
  ["PLANETSCALE_RENEW_ROLE", "roles.renew"],
  ["PLANETSCALE_RESET_DEFAULT_ROLE", "roles.resetDefault"],
  ["PLANETSCALE_RESET_ROLE", "roles.reset"],
  ["PLANETSCALE_REVIEW_DEPLOY_REQUEST", "deployRequestReviews.create"],
  ["PLANETSCALE_SET_DEFAULT_SHARD_CONFIGURATION_PROFILE", "configurationProfiles.setDefault"],
  ["PLANETSCALE_SKIP_REVERT_PERIOD", "deployRequests.skipRevert"],
  ["PLANETSCALE_UPDATE_ADMIN", "admins.update"],
  ["PLANETSCALE_UPDATE_AUTO_APPLY", "deployRequests.updateAutoApply"],
  ["PLANETSCALE_UPDATE_AUTO_DELETE_BRANCH", "deployRequests.updateAutoDeleteBranch"],
  ["PLANETSCALE_UPDATE_BACKUP", "backups.update"],
  ["PLANETSCALE_UPDATE_BACKUP_POLICY", "backupPolicies.update"],
  ["PLANETSCALE_UPDATE_BOUNCER_RESIZE_REQUEST", "bouncerResizeRequests.upsert"],
  ["PLANETSCALE_UPDATE_BRANCH", "branches.update"],
  ["PLANETSCALE_UPDATE_BRANCH_CHANGE_REQUEST", "branchChangeRequests.upsert"],
  ["PLANETSCALE_UPDATE_BRANCH_RESIZE_REQUEST", "branchResizeRequests.upsert"],
  ["PLANETSCALE_UPDATE_DATABASE_POSTGRES_CIDR", "databaseCidrs.update"],
  ["PLANETSCALE_UPDATE_DATABASE_SETTINGS", "databases.update"],
  ["PLANETSCALE_UPDATE_DATABASE_THROTTLER", "databaseThrottlers.update"],
  ["PLANETSCALE_UPDATE_DATA_TOPOLOGY", "dataTopologies.update"],
  ["PLANETSCALE_UPDATE_DEPLOY_REQUEST_THROTTLER", "deployRequestThrottlers.update"],
  ["PLANETSCALE_UPDATE_INSIGHTS_AGENT_SCHEDULE", "insightsAgentSchedules.update"],
  ["PLANETSCALE_UPDATE_ORGANIZATION", "organizations.update"],
  ["PLANETSCALE_UPDATE_ORGANIZATION_MEMBERSHIP", "memberships.update"],
  ["PLANETSCALE_UPDATE_ORGANIZATION_TEAM", "teams.update"],
  ["PLANETSCALE_UPDATE_PASSWORD", "passwords.update"],
  ["PLANETSCALE_UPDATE_READ_ONLY_REPLICA", "dedicatedReadReplicas.update"],
  ["PLANETSCALE_UPDATE_ROLE", "roles.update"],
  ["PLANETSCALE_UPDATE_ROUTER", "routers.update"],
  ["PLANETSCALE_UPDATE_SAFE_MIGRATIONS", "safeMigrations.update"],
  ["PLANETSCALE_UPDATE_SHARD_CONFIGURATION_PROFILE", "configurationProfiles.update"],
  ["PLANETSCALE_UPDATE_SHARD_CONFIGURATION_PROFILE_SHARD", "configurationProfileShards.update"],
  ["PLANETSCALE_UPDATE_SIDECAR", "sidecars.update"],
  ["PLANETSCALE_UPDATE_TRAFFIC_BUDGET", "trafficBudgets.update"],
  ["PLANETSCALE_UPDATE_WEBHOOK", "webhooks.update"],
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

  test("the 48 batch-3 tools are mapped to compiled declarative actions", () => {
    const mapped = new Map(coverage.mapped.map((row) => [row.tool, row.operation]));
    for (const [tool, operation] of batch3Tools) {
      expect(mapped.get(tool), tool).toBe(operation);
      const definition = operations[operation];
      expect(definition?.request?.method, tool).toBe("GET");
      expect(typeof definition?.request?.path, tool).toBe("string");
      expect(typeof actions[operation], tool).toBe("function");
    }
  });

  test("the 47 batch-4 tools are mapped to compiled declarative actions", () => {
    const mapped = new Map(coverage.mapped.map((row) => [row.tool, row.operation]));
    for (const [tool, operation] of batch4Tools) {
      expect(mapped.get(tool), tool).toBe(operation);
      const definition = operations[operation];
      expect(typeof definition?.request?.method, tool).toBe("string");
      expect(typeof definition?.request?.path, tool).toBe("string");
      expect(typeof actions[operation], tool).toBe("function");
    }
  });

  test("missing_http is empty and every source slug is accounted for exactly once", () => {
    expect(coverage.missing_http).toEqual([]);
    expect(coverage.missing_still.map((row) => row.tool)).toContain("PLANETSCALE_OAUTH_TOKEN_INFO");
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
