import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

type OwnerRepo = { owner: string; repo: string };
type BranchScope = OwnerRepo & { branch: string };

export type BranchProtectionInput = BranchScope;
export type DeleteDeploymentProtectionRuleInput = OwnerRepo & { environmentName: string; protectionRuleId: number };
export type RestrictionAppsInput = BranchScope & { apps: string[] };
export type StatusCheckContextsInput = BranchScope & { contexts: string[] };
export type RestrictionTeamsInput = BranchScope & { teams: string[] };
export type RestrictionUsersInput = BranchScope & { users: string[] };

export type StatusCheck = { context: string; appId?: number };
export type ActorLists = { users?: string[]; teams?: string[]; apps?: string[] };

export type RequiredStatusChecks = { strict: boolean; contexts: string[]; checks?: StatusCheck[] };
export type RequiredPullRequestReviews = {
  dismissalRestrictions?: ActorLists;
  dismissStaleReviews?: boolean;
  requireCodeOwnerReviews?: boolean;
  requiredApprovingReviewCount?: number;
  requireLastPushApproval?: boolean;
  bypassPullRequestAllowances?: ActorLists;
};
export type PushRestrictions = { users: string[]; teams: string[]; apps?: string[] };

export type UpdateBranchProtectionInput = BranchScope & {
  requiredStatusChecks: RequiredStatusChecks | null;
  enforceAdmins: boolean | null;
  requiredPullRequestReviews: RequiredPullRequestReviews | null;
  restrictions: PushRestrictions | null;
  requiredLinearHistory?: boolean;
  allowForcePushes?: boolean | null;
  allowDeletions?: boolean;
  blockCreations?: boolean;
  requiredConversationResolution?: boolean;
  lockBranch?: boolean;
  allowForkSyncing?: boolean;
};

export type UpdatePullRequestReviewProtectionInput = BranchScope & RequiredPullRequestReviews;
export type UpdateStatusCheckProtectionInput = BranchScope & { strict?: boolean; contexts?: string[]; checks?: StatusCheck[] };

export function validateDeleteDeploymentProtectionRuleInput(input: unknown): DeleteDeploymentProtectionRuleInput {
  if (!isRecord(input)) throw new Error("repos.environments.deployment_protection_rules.delete input must be an object");
  return {
    owner: requireSingleSegment(input.owner, "owner"),
    repo: requireSingleSegment(input.repo, "repo"),
    environmentName: requirePathText(input.environmentName, "environmentName"),
    protectionRuleId: requireId(input.protectionRuleId, "protectionRuleId"),
  };
}

export function validateRemoveRestrictionAppsInput(input: unknown): RestrictionAppsInput {
  if (!isRecord(input)) throw new Error("branches.protection.restrictions.apps.delete input must be an object");
  return { ...branchScope(input), apps: requireSlugList(input.apps, "apps") };
}

export function validateRemoveStatusCheckContextsInput(input: unknown): StatusCheckContextsInput {
  if (!isRecord(input)) throw new Error("branches.protection.required_status_checks.contexts.delete input must be an object");
  return { ...branchScope(input), contexts: requireStringList(input.contexts, "contexts") };
}

export function validateDeleteRequiredStatusChecksInput(input: unknown): BranchProtectionInput {
  if (!isRecord(input)) throw new Error("branches.protection.required_status_checks.delete input must be an object");
  return branchScope(input);
}

export function validateRemoveRestrictionTeamsInput(input: unknown): RestrictionTeamsInput {
  if (!isRecord(input)) throw new Error("branches.protection.restrictions.teams.delete input must be an object");
  return { ...branchScope(input), teams: requireSlugList(input.teams, "teams") };
}

export function validateRemoveRestrictionUsersInput(input: unknown): RestrictionUsersInput {
  if (!isRecord(input)) throw new Error("branches.protection.restrictions.users.delete input must be an object");
  return { ...branchScope(input), users: requireSlugList(input.users, "users") };
}

export function validateCreateEnforceAdminsInput(input: unknown): BranchProtectionInput {
  if (!isRecord(input)) throw new Error("branches.protection.enforce_admins.create input must be an object");
  return branchScope(input);
}

export function validateSetRestrictionAppsInput(input: unknown): RestrictionAppsInput {
  if (!isRecord(input)) throw new Error("branches.protection.restrictions.apps.set input must be an object");
  return { ...branchScope(input), apps: requireSlugList(input.apps, "apps") };
}

export function validateSetStatusCheckContextsInput(input: unknown): StatusCheckContextsInput {
  if (!isRecord(input)) throw new Error("branches.protection.required_status_checks.contexts.set input must be an object");
  return { ...branchScope(input), contexts: requireStringList(input.contexts, "contexts") };
}

export function validateSetRestrictionTeamsInput(input: unknown): RestrictionTeamsInput {
  if (!isRecord(input)) throw new Error("branches.protection.restrictions.teams.set input must be an object");
  return { ...branchScope(input), teams: requireSlugList(input.teams, "teams") };
}

export function validateSetRestrictionUsersInput(input: unknown): RestrictionUsersInput {
  if (!isRecord(input)) throw new Error("branches.protection.restrictions.users.set input must be an object");
  return { ...branchScope(input), users: requireSlugList(input.users, "users") };
}

export function validateUpdateBranchProtectionInput(input: unknown): UpdateBranchProtectionInput {
  if (!isRecord(input)) throw new Error("branches.protection.update input must be an object");
  return {
    ...branchScope(input),
    requiredStatusChecks: requireNullable(input, "requiredStatusChecks", parseRequiredStatusChecks),
    enforceAdmins: requireNullable(input, "enforceAdmins", (value) => requireBoolean(value, "enforceAdmins")),
    requiredPullRequestReviews: requireNullable(input, "requiredPullRequestReviews", (value) => {
      if (!isRecord(value)) throw new Error("requiredPullRequestReviews must be an object or null");
      return parseReviewSettings(value);
    }),
    restrictions: requireNullable(input, "restrictions", parsePushRestrictions),
    requiredLinearHistory: optionalBoolean(input.requiredLinearHistory, "requiredLinearHistory"),
    allowForcePushes: input.allowForcePushes === null ? null : optionalBoolean(input.allowForcePushes, "allowForcePushes"),
    allowDeletions: optionalBoolean(input.allowDeletions, "allowDeletions"),
    blockCreations: optionalBoolean(input.blockCreations, "blockCreations"),
    requiredConversationResolution: optionalBoolean(input.requiredConversationResolution, "requiredConversationResolution"),
    lockBranch: optionalBoolean(input.lockBranch, "lockBranch"),
    allowForkSyncing: optionalBoolean(input.allowForkSyncing, "allowForkSyncing"),
  };
}

export function validateUpdatePullRequestReviewProtectionInput(input: unknown): UpdatePullRequestReviewProtectionInput {
  if (!isRecord(input)) throw new Error("branches.protection.required_pull_request_reviews.update input must be an object");
  return { ...branchScope(input), ...parseReviewSettings(input) };
}

export function validateUpdateStatusCheckProtectionInput(input: unknown): UpdateStatusCheckProtectionInput {
  if (!isRecord(input)) throw new Error("branches.protection.required_status_checks.update input must be an object");
  return {
    ...branchScope(input),
    strict: optionalBoolean(input.strict, "strict"),
    contexts: input.contexts === undefined ? undefined : requireStringArray(input.contexts, "contexts"),
    checks: input.checks === undefined ? undefined : parseChecks(input.checks),
  };
}

export function createWriteCard5Client(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const base = options.githubClient;
  const clientFor = (operation: string) => base ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation,
  });

  return {
    async deleteDeploymentProtectionRule(input: unknown) {
      const payload = validateDeleteDeploymentProtectionRuleInput(input);
      const response = await clientFor("repos.environments.deployment_protection_rules.delete").fetchJSON(
        `/repos/${encodeURIComponent(payload.owner)}/${encodeURIComponent(payload.repo)}/environments/${encodeURIComponent(payload.environmentName)}/deployment_protection_rules/${payload.protectionRuleId}`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        { deleted: true, owner: payload.owner, repo: payload.repo, environmentName: payload.environmentName, protectionRuleId: payload.protectionRuleId },
        "Deployment protection rule was not found.",
        "GitHub rejected the disable deployment protection rule request.",
      );
    },
    async removeRestrictionApps(input: unknown) {
      const payload = validateRemoveRestrictionAppsInput(input);
      const response = await clientFor("branches.protection.restrictions.apps.delete").fetchJSON(
        protectionPath(payload, "/restrictions/apps"),
        jsonInit("DELETE", { apps: payload.apps }),
      );
      return jsonArray(response, 200, "apps", "Branch protection was not found.", "GitHub rejected the remove app access restrictions request.");
    },
    async removeStatusCheckContexts(input: unknown) {
      const payload = validateRemoveStatusCheckContextsInput(input);
      const response = await clientFor("branches.protection.required_status_checks.contexts.delete").fetchJSON(
        protectionPath(payload, "/required_status_checks/contexts"),
        jsonInit("DELETE", { contexts: payload.contexts }),
      );
      return jsonArray(response, 200, "contexts", "Branch protection was not found.", "GitHub rejected the remove status check contexts request.");
    },
    async deleteRequiredStatusChecks(input: unknown) {
      const payload = validateDeleteRequiredStatusChecksInput(input);
      const response = await clientFor("branches.protection.required_status_checks.delete").fetchJSON(
        protectionPath(payload, "/required_status_checks"),
        { method: "DELETE" },
      );
      return noContent(response, 204, deleted(payload), "Status check protection was not found.", "GitHub rejected the remove status check protection request.");
    },
    async removeRestrictionTeams(input: unknown) {
      const payload = validateRemoveRestrictionTeamsInput(input);
      const response = await clientFor("branches.protection.restrictions.teams.delete").fetchJSON(
        protectionPath(payload, "/restrictions/teams"),
        jsonInit("DELETE", { teams: payload.teams }),
      );
      return jsonArray(response, 200, "teams", "Branch protection was not found.", "GitHub rejected the remove team access restrictions request.");
    },
    async removeRestrictionUsers(input: unknown) {
      const payload = validateRemoveRestrictionUsersInput(input);
      const response = await clientFor("branches.protection.restrictions.users.delete").fetchJSON(
        protectionPath(payload, "/restrictions/users"),
        jsonInit("DELETE", { users: payload.users }),
      );
      return jsonArray(response, 200, "users", "Branch protection was not found.", "GitHub rejected the remove user access restrictions request.");
    },
    async createEnforceAdmins(input: unknown) {
      const payload = validateCreateEnforceAdminsInput(input);
      const response = await clientFor("branches.protection.enforce_admins.create").fetchJSON(
        protectionPath(payload, "/enforce_admins"),
        { method: "POST" },
      );
      return jsonBody(response, 200, "protection", "Branch protection was not found.", "GitHub rejected the set admin branch protection request.");
    },
    async setRestrictionApps(input: unknown) {
      const payload = validateSetRestrictionAppsInput(input);
      const response = await clientFor("branches.protection.restrictions.apps.set").fetchJSON(
        protectionPath(payload, "/restrictions/apps"),
        jsonInit("PUT", { apps: payload.apps }),
      );
      return jsonArray(response, 200, "apps", "Branch protection was not found.", "GitHub rejected the set app access restrictions request.");
    },
    async setStatusCheckContexts(input: unknown) {
      const payload = validateSetStatusCheckContextsInput(input);
      const response = await clientFor("branches.protection.required_status_checks.contexts.set").fetchJSON(
        protectionPath(payload, "/required_status_checks/contexts"),
        jsonInit("PUT", { contexts: payload.contexts }),
      );
      return jsonArray(response, 200, "contexts", "Branch protection was not found.", "GitHub rejected the set status check contexts request.");
    },
    async setRestrictionTeams(input: unknown) {
      const payload = validateSetRestrictionTeamsInput(input);
      const response = await clientFor("branches.protection.restrictions.teams.set").fetchJSON(
        protectionPath(payload, "/restrictions/teams"),
        jsonInit("PUT", { teams: payload.teams }),
      );
      return jsonArray(response, 200, "teams", "Branch protection was not found.", "GitHub rejected the set team access restrictions request.");
    },
    async setRestrictionUsers(input: unknown) {
      const payload = validateSetRestrictionUsersInput(input);
      const response = await clientFor("branches.protection.restrictions.users.set").fetchJSON(
        protectionPath(payload, "/restrictions/users"),
        jsonInit("PUT", { users: payload.users }),
      );
      return jsonArray(response, 200, "users", "Branch protection was not found.", "GitHub rejected the set user access restrictions request.");
    },
    async updateBranchProtection(input: unknown) {
      const payload = validateUpdateBranchProtectionInput(input);
      const response = await clientFor("branches.protection.update").fetchJSON(
        protectionPath(payload, ""),
        jsonInit("PUT", updateProtectionBody(payload)),
      );
      return jsonBody(response, 200, "protection", "Branch was not found.", "GitHub rejected the update branch protection request.");
    },
    async updatePullRequestReviewProtection(input: unknown) {
      const payload = validateUpdatePullRequestReviewProtectionInput(input);
      const response = await clientFor("branches.protection.required_pull_request_reviews.update").fetchJSON(
        protectionPath(payload, "/required_pull_request_reviews"),
        jsonInit("PATCH", reviewSettingsBody(payload)),
      );
      return jsonBody(response, 200, "protection", "Pull request review protection was not found.", "GitHub rejected the update pull request review protection request.");
    },
    async updateStatusCheckProtection(input: unknown) {
      const payload = validateUpdateStatusCheckProtectionInput(input);
      const response = await clientFor("branches.protection.required_status_checks.update").fetchJSON(
        protectionPath(payload, "/required_status_checks"),
        jsonInit("PATCH", compact({
          strict: payload.strict,
          contexts: payload.contexts,
          checks: payload.checks ? checksBody(payload.checks) : undefined,
        })),
      );
      return jsonBody(response, 200, "protection", "Status check protection was not found.", "GitHub rejected the update status check protection request.");
    },
  };
}

function updateProtectionBody(payload: UpdateBranchProtectionInput): Record<string, unknown> {
  const checks = payload.requiredStatusChecks;
  const restrictions = payload.restrictions;
  return compact({
    required_status_checks: checks === null
      ? null
      : compact({ strict: checks.strict, contexts: checks.contexts, checks: checks.checks ? checksBody(checks.checks) : undefined }),
    enforce_admins: payload.enforceAdmins,
    required_pull_request_reviews: payload.requiredPullRequestReviews === null ? null : reviewSettingsBody(payload.requiredPullRequestReviews),
    restrictions: restrictions === null ? null : compact({ users: restrictions.users, teams: restrictions.teams, apps: restrictions.apps }),
    required_linear_history: payload.requiredLinearHistory,
    allow_force_pushes: payload.allowForcePushes,
    allow_deletions: payload.allowDeletions,
    block_creations: payload.blockCreations,
    required_conversation_resolution: payload.requiredConversationResolution,
    lock_branch: payload.lockBranch,
    allow_fork_syncing: payload.allowForkSyncing,
  });
}

function reviewSettingsBody(settings: RequiredPullRequestReviews): Record<string, unknown> {
  return compact({
    dismissal_restrictions: settings.dismissalRestrictions ? compact({ ...settings.dismissalRestrictions }) : undefined,
    dismiss_stale_reviews: settings.dismissStaleReviews,
    require_code_owner_reviews: settings.requireCodeOwnerReviews,
    required_approving_review_count: settings.requiredApprovingReviewCount,
    require_last_push_approval: settings.requireLastPushApproval,
    bypass_pull_request_allowances: settings.bypassPullRequestAllowances ? compact({ ...settings.bypassPullRequestAllowances }) : undefined,
  });
}

function checksBody(checks: StatusCheck[]): Record<string, unknown>[] {
  return checks.map((check) => compact({ context: check.context, app_id: check.appId }));
}

function parseRequiredStatusChecks(value: unknown): RequiredStatusChecks {
  if (!isRecord(value)) throw new Error("requiredStatusChecks must be an object or null");
  return {
    strict: requireBoolean(value.strict, "requiredStatusChecks.strict"),
    contexts: requireStringArray(value.contexts, "requiredStatusChecks.contexts"),
    checks: value.checks === undefined ? undefined : parseChecks(value.checks),
  };
}

function parsePushRestrictions(value: unknown): PushRestrictions {
  if (!isRecord(value)) throw new Error("restrictions must be an object or null");
  return {
    users: requireSlugArray(value.users, "restrictions.users"),
    teams: requireSlugArray(value.teams, "restrictions.teams"),
    apps: value.apps === undefined ? undefined : requireSlugArray(value.apps, "restrictions.apps"),
  };
}

function parseReviewSettings(value: Record<string, unknown>): RequiredPullRequestReviews {
  const count = value.requiredApprovingReviewCount;
  if (count !== undefined && (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0 || count > 6)) {
    throw new Error("requiredApprovingReviewCount must be an integer from 0 to 6");
  }
  return compact({
    dismissalRestrictions: optionalActorLists(value.dismissalRestrictions, "dismissalRestrictions"),
    dismissStaleReviews: optionalBoolean(value.dismissStaleReviews, "dismissStaleReviews"),
    requireCodeOwnerReviews: optionalBoolean(value.requireCodeOwnerReviews, "requireCodeOwnerReviews"),
    requiredApprovingReviewCount: count as number | undefined,
    requireLastPushApproval: optionalBoolean(value.requireLastPushApproval, "requireLastPushApproval"),
    bypassPullRequestAllowances: optionalActorLists(value.bypassPullRequestAllowances, "bypassPullRequestAllowances"),
  }) as RequiredPullRequestReviews;
}

function optionalActorLists(value: unknown, field: string): ActorLists | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error(`${field} must be an object`);
  return compact({
    users: value.users === undefined ? undefined : requireSlugArray(value.users, `${field}.users`),
    teams: value.teams === undefined ? undefined : requireSlugArray(value.teams, `${field}.teams`),
    apps: value.apps === undefined ? undefined : requireSlugArray(value.apps, `${field}.apps`),
  }) as ActorLists;
}

function parseChecks(value: unknown): StatusCheck[] {
  if (!Array.isArray(value)) throw new Error("checks must be an array");
  return value.map((item) => {
    if (!isRecord(item)) throw new Error("checks items must be objects");
    const context = item.context;
    if (typeof context !== "string" || context.length === 0) throw new Error("checks.context is required");
    let appId: number | undefined;
    if (item.appId !== undefined) {
      if (typeof item.appId !== "number" || !Number.isSafeInteger(item.appId) || (item.appId < 1 && item.appId !== -1)) {
        throw new Error("checks.appId must be a positive integer or -1");
      }
      appId = item.appId;
    }
    return appId === undefined ? { context } : { context, appId };
  });
}

function requireNullable<T>(input: Record<string, unknown>, field: string, parse: (value: unknown) => T): T | null {
  if (!(field in input) || input[field] === undefined) throw new Error(`${field} is required (use null to disable)`);
  if (input[field] === null) return null;
  return parse(input[field]);
}

function compact(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) out[key] = item;
  }
  return out;
}

function deleted(payload: BranchProtectionInput): Record<string, unknown> {
  return { deleted: true, owner: payload.owner, repo: payload.repo, branch: payload.branch };
}

function protectionPath(payload: BranchProtectionInput, suffix: string): string {
  return `/repos/${encodeURIComponent(payload.owner)}/${encodeURIComponent(payload.repo)}/branches/${encodeURIComponent(payload.branch)}/protection${suffix}`;
}

function jsonInit(method: string, body: Record<string, unknown>): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function jsonBody(
  response: { status: number; headers: Record<string, string>; body: unknown },
  success: number,
  field: string,
  missing: string,
  rejected: string,
) {
  if (response.status === success && isRecord(response.body)) {
    return { ok: true as const, [field]: response.body };
  }
  if (response.status === 404) return upstream(missing);
  return mapRateOrUpstream(response, rejected);
}

function jsonArray(
  response: { status: number; headers: Record<string, string>; body: unknown },
  success: number,
  field: string,
  missing: string,
  rejected: string,
) {
  if (response.status === success && Array.isArray(response.body)) {
    return { ok: true as const, [field]: response.body };
  }
  if (response.status === 404) return upstream(missing);
  return mapRateOrUpstream(response, rejected);
}

function noContent(
  response: { status: number; headers: Record<string, string> },
  success: number,
  value: Record<string, unknown>,
  missing: string,
  rejected: string,
) {
  if (response.status === success) return { ok: true as const, ...value };
  if (response.status === 404) return upstream(missing);
  return mapRateOrUpstream(response, rejected);
}

function branchScope(input: Record<string, unknown>): BranchProtectionInput {
  return {
    owner: requireSingleSegment(input.owner, "owner"),
    repo: requireSingleSegment(input.repo, "repo"),
    branch: requirePathText(input.branch, "branch"),
  };
}

function upstream(message: string) {
  return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message } };
}

function mapRateOrUpstream(response: { status: number; headers: Record<string, string> }, message: string) {
  if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
    const rateLimit = parseGitHubRateLimit(response.status, response.headers);
    return {
      ok: false as const,
      error: {
        code: "CONNECTOR_RATE_LIMITED" as const,
        message: "GitHub rate limit exceeded.",
        retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined,
      },
    };
  }
  return upstream(message);
}

function requireSingleSegment(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  if (value.includes("/") || value.includes("?") || value.includes("#")) {
    throw new Error(`${field} must be a single path segment`);
  }
  return value;
}

function requirePathText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  if (value.includes("?") || value.includes("#")) throw new Error(`${field} must not include a query or fragment`);
  return value;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${field} must be a boolean`);
  return value;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  return requireBoolean(value, field);
}

function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new Error(`${field} must be an array of strings`);
  }
  return value;
}

function requireStringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new Error(`${field} must be a non-empty array of strings`);
  }
  return value;
}

function requireSlugArray(value: unknown, field: string): string[] {
  const items = requireStringArray(value, field);
  for (const item of items) requireSingleSegment(item, field);
  return items;
}

function requireSlugList(value: unknown, field: string): string[] {
  const items = requireStringList(value, field);
  for (const item of items) requireSingleSegment(item, field);
  return items;
}

function requireId(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
