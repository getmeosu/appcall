import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";
import { normalizeGitHubRepo, type GitHubRepo } from "./repos";
import { normalizeGitHubTeam, type GitHubTeam } from "./notifications_social";
import { normalizeGitHubUser, type GitHubUser } from "./users";

export type GitHubHook = {
  id: number;
  name?: string;
  active?: boolean;
  events?: string[];
  config?: { url?: string; content_type?: string; insecure_ssl?: string };
  url?: string;
  [key: string]: unknown;
};

export type NormalizedHook = {
  id: string;
  provider: "github";
  hookId: number;
  name: string;
  active: boolean;
  events: string[];
  url: string;
  configUrl: string;
  contentType: string;
  modelVersion: "2026-05-16";
  raw: GitHubHook;
};

export type GitHubHookConfig = {
  url?: string;
  content_type?: string;
  insecure_ssl?: string | number;
  [key: string]: unknown;
};

export type NormalizedHookConfig = {
  url: string;
  contentType: string;
  insecureSsl: string;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeGitHubHookConfig(config: GitHubHookConfig): NormalizedHookConfig {
  const insecure = config.insecure_ssl;
  return {
    url: typeof config.url === "string" ? config.url : "",
    contentType: typeof config.content_type === "string" ? config.content_type : "",
    insecureSsl: insecure === undefined || insecure === null ? "" : String(insecure),
    modelVersion: "2026-05-16",
    raw: config as unknown as Record<string, unknown>,
  };
}

export type GitHubHookDelivery = {
  id: number;
  guid?: string;
  delivered_at?: string;
  redelivery?: boolean;
  duration?: number;
  status?: string;
  status_code?: number;
  event?: string;
  action?: string | null;
  [key: string]: unknown;
};

export type NormalizedHookDelivery = {
  id: string;
  provider: "github";
  deliveryId: number;
  guid: string;
  deliveredAt: string;
  redelivery: boolean;
  duration: number;
  status: string;
  statusCode: number;
  event: string;
  action: string;
  modelVersion: "2026-05-16";
  raw: GitHubHookDelivery;
};

export function normalizeGitHubHookDelivery(delivery: GitHubHookDelivery): NormalizedHookDelivery {
  return {
    id: `gh-hook-delivery:${delivery.id}`,
    provider: "github",
    deliveryId: delivery.id,
    guid: typeof delivery.guid === "string" ? delivery.guid : "",
    deliveredAt: typeof delivery.delivered_at === "string" ? delivery.delivered_at : "",
    redelivery: delivery.redelivery === true,
    duration: typeof delivery.duration === "number" ? delivery.duration : 0,
    status: typeof delivery.status === "string" ? delivery.status : "",
    statusCode: typeof delivery.status_code === "number" ? delivery.status_code : 0,
    event: typeof delivery.event === "string" ? delivery.event : "",
    action: typeof delivery.action === "string" ? delivery.action : "",
    modelVersion: "2026-05-16",
    raw: delivery,
  };
}

export function normalizeGitHubHook(hook: GitHubHook): NormalizedHook {
  const config = hook.config ?? {};
  return {
    id: `gh-hook:${hook.id}`,
    provider: "github",
    hookId: hook.id,
    name: hook.name ?? "",
    active: hook.active === true,
    events: Array.isArray(hook.events) ? hook.events.filter((event) => typeof event === "string") : [],
    url: hook.url ?? "",
    configUrl: typeof config.url === "string" ? config.url : "",
    contentType: typeof config.content_type === "string" ? config.content_type : "",
    modelVersion: "2026-05-16",
    raw: hook,
  };
}

export type GitHubRuleset = {
  id: number;
  name?: string;
  target?: string;
  source_type?: string;
  source?: string;
  enforcement?: string;
  rules?: unknown[];
  [key: string]: unknown;
};

export type NormalizedRuleset = {
  id: string;
  provider: "github";
  rulesetId: number;
  name: string;
  target: string;
  sourceType: string;
  source: string;
  enforcement: string;
  modelVersion: "2026-05-16";
  raw: GitHubRuleset;
};

export function normalizeGitHubRuleset(ruleset: GitHubRuleset): NormalizedRuleset {
  return {
    id: `gh-ruleset:${ruleset.id}`,
    provider: "github",
    rulesetId: ruleset.id,
    name: ruleset.name ?? "",
    target: ruleset.target ?? "",
    sourceType: ruleset.source_type ?? "",
    source: ruleset.source ?? "",
    enforcement: ruleset.enforcement ?? "",
    modelVersion: "2026-05-16",
    raw: ruleset,
  };
}

export type GitHubBranchRule = {
  type?: string;
  ruleset_id?: number;
  ruleset_source_type?: string;
  ruleset_source?: string;
  parameters?: Record<string, unknown>;
  [key: string]: unknown;
};

export type NormalizedBranchRule = {
  type: string;
  rulesetId: number;
  rulesetSourceType: string;
  rulesetSource: string;
  parameters: Record<string, unknown>;
  modelVersion: "2026-05-16";
  raw: GitHubBranchRule;
};

export function normalizeGitHubBranchRule(rule: GitHubBranchRule): NormalizedBranchRule {
  return {
    type: rule.type ?? "",
    rulesetId: typeof rule.ruleset_id === "number" ? rule.ruleset_id : 0,
    rulesetSourceType: rule.ruleset_source_type ?? "",
    rulesetSource: rule.ruleset_source ?? "",
    parameters: isRecord(rule.parameters) ? rule.parameters : {},
    modelVersion: "2026-05-16",
    raw: rule,
  };
}

export type GitHubInvitation = {
  id: number;
  permissions?: string;
  created_at?: string;
  html_url?: string;
  url?: string;
  invitee?: GitHubUser | null;
  inviter?: GitHubUser | null;
  [key: string]: unknown;
};

export type NormalizedInvitation = {
  id: string;
  provider: "github";
  invitationId: number;
  permissions: string;
  createdAt: string;
  url: string;
  invitee: string;
  inviter: string;
  modelVersion: "2026-05-16";
  raw: GitHubInvitation;
};

export function normalizeGitHubInvitation(invitation: GitHubInvitation): NormalizedInvitation {
  return {
    id: `gh-invitation:${invitation.id}`,
    provider: "github",
    invitationId: invitation.id,
    permissions: invitation.permissions ?? "",
    createdAt: invitation.created_at ?? "",
    url: invitation.html_url ?? invitation.url ?? "",
    invitee: invitation.invitee?.login ?? "",
    inviter: invitation.inviter?.login ?? "",
    modelVersion: "2026-05-16",
    raw: invitation,
  };
}

type Page = { perPage?: number; page?: number };
type RepoScope = { owner: string; repo: string };

export type GetCollaboratorPermissionInput = RepoScope & { username: string };
export function validateGetCollaboratorPermissionInput(input: unknown): GetCollaboratorPermissionInput {
  if (!isRecord(input)) throw new Error("repos.collaborators.permission.get input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    username: requireString(input.username, "username"),
  };
}

export type GetBranchProtectionInput = RepoScope & { branch: string };
export function validateGetBranchProtectionInput(input: unknown): GetBranchProtectionInput {
  if (!isRecord(input)) throw new Error("branches.protection.get input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    branch: requireString(input.branch, "branch"),
  };
}


export type ListRuleSuitesInput = RepoScope & Page;
export function validateListRuleSuitesInput(input: unknown): ListRuleSuitesInput {
  if (!isRecord(input)) throw new Error("repos.rule_suites.list input must be an object");
  return { ...repoScope(input), ...pageInput(input) };
}

export type GetRuleSuiteInput = RepoScope & { ruleSuiteId: number };
export function validateGetRuleSuiteInput(input: unknown): GetRuleSuiteInput {
  if (!isRecord(input)) throw new Error("repos.rule_suites.get input must be an object");
  return { ...repoScope(input), ruleSuiteId: requirePositive(input.ruleSuiteId, "ruleSuiteId") };
}

export type GetRepoRulesetInput = RepoScope & { rulesetId: number };
export function validateGetRepoRulesetInput(input: unknown): GetRepoRulesetInput {
  if (!isRecord(input)) throw new Error("repos.rulesets.get input must be an object");
  return { ...repoScope(input), rulesetId: requirePositive(input.rulesetId, "rulesetId") };
}

export type ListRepoRulesetsInput = RepoScope & Page;
export function validateListRepoRulesetsInput(input: unknown): ListRepoRulesetsInput {
  if (!isRecord(input)) throw new Error("repos.rulesets.list input must be an object");
  return { ...repoScope(input), ...pageInput(input) };
}

export type GetRulesForBranchInput = RepoScope & { branch: string };
export function validateGetRulesForBranchInput(input: unknown): GetRulesForBranchInput {
  if (!isRecord(input)) throw new Error("repos.rules.for_branch input must be an object");
  return { ...repoScope(input), branch: requireString(input.branch, "branch") };
}

export type ListRepoHooksInput = RepoScope & Page;
export function validateListRepoHooksInput(input: unknown): ListRepoHooksInput {
  if (!isRecord(input)) throw new Error("repos.hooks.list input must be an object");
  return { ...repoScope(input), ...pageInput(input) };
}

export type GetOrgHookInput = { org: string; hookId: number };
export function validateGetOrgHookInput(input: unknown): GetOrgHookInput {
  if (!isRecord(input)) throw new Error("orgs.hooks.get input must be an object");
  return { org: requireString(input.org, "org"), hookId: requirePositive(input.hookId, "hookId") };
}

export type GetRepoHookInput = RepoScope & { hookId: number };
export function validateGetRepoHookInput(input: unknown): GetRepoHookInput {
  if (!isRecord(input)) throw new Error("repos.hooks.get input must be an object");
  return { ...repoScope(input), hookId: requirePositive(input.hookId, "hookId") };
}

export function validateGetOrgHookConfigInput(input: unknown): GetOrgHookInput {
  if (!isRecord(input)) throw new Error("orgs.hooks.config.get input must be an object");
  return { org: requireString(input.org, "org"), hookId: requirePositive(input.hookId, "hookId") };
}

export function validateGetRepoHookConfigInput(input: unknown): GetRepoHookInput {
  if (!isRecord(input)) throw new Error("repos.hooks.config.get input must be an object");
  return { ...repoScope(input), hookId: requirePositive(input.hookId, "hookId") };
}

export type GetOrgHookDeliveryInput = { org: string; hookId: number; deliveryId: number };
export function validateGetOrgHookDeliveryInput(input: unknown): GetOrgHookDeliveryInput {
  if (!isRecord(input)) throw new Error("orgs.hooks.deliveries.get input must be an object");
  return {
    org: requireString(input.org, "org"),
    hookId: requirePositive(input.hookId, "hookId"),
    deliveryId: requirePositive(input.deliveryId, "deliveryId"),
  };
}

export type GetRepoHookDeliveryInput = RepoScope & { hookId: number; deliveryId: number };
export function validateGetRepoHookDeliveryInput(input: unknown): GetRepoHookDeliveryInput {
  if (!isRecord(input)) throw new Error("repos.hooks.deliveries.get input must be an object");
  return {
    ...repoScope(input),
    hookId: requirePositive(input.hookId, "hookId"),
    deliveryId: requirePositive(input.deliveryId, "deliveryId"),
  };
}

export type ListHookDeliveriesInput = { hookId: number; perPage?: number; cursor?: string; status?: string };
export type ListOrgHookDeliveriesInput = ListHookDeliveriesInput & { org: string };
export type ListRepoHookDeliveriesInput = ListHookDeliveriesInput & RepoScope;

function deliveryListInput(input: Record<string, unknown>): ListHookDeliveriesInput {
  const status = optionalString(input.status, "status");
  if (status !== undefined && status !== "success" && status !== "failure") {
    throw new Error("status must be success or failure");
  }
  return {
    hookId: requirePositive(input.hookId, "hookId"),
    perPage: optionalPage(input.perPage, "perPage"),
    cursor: optionalString(input.cursor, "cursor"),
    status,
  };
}

export function validateListOrgHookDeliveriesInput(input: unknown): ListOrgHookDeliveriesInput {
  if (!isRecord(input)) throw new Error("orgs.hooks.deliveries.list input must be an object");
  return { org: requireString(input.org, "org"), ...deliveryListInput(input) };
}

export function validateListRepoHookDeliveriesInput(input: unknown): ListRepoHookDeliveriesInput {
  if (!isRecord(input)) throw new Error("repos.hooks.deliveries.list input must be an object");
  return { ...repoScope(input), ...deliveryListInput(input) };
}

export type GetTeamMembershipInput = { org: string; teamSlug: string; username: string };
export function validateGetTeamMembershipInput(input: unknown): GetTeamMembershipInput {
  if (!isRecord(input)) throw new Error("teams.membership.get input must be an object");
  return {
    org: requireString(input.org, "org"),
    teamSlug: requireString(input.teamSlug, "teamSlug"),
    username: requireString(input.username, "username"),
  };
}

export type ListTeamReposInput = { org: string; teamSlug: string; perPage?: number; page?: number };
export function validateListTeamReposInput(input: unknown): ListTeamReposInput {
  if (!isRecord(input)) throw new Error("teams.repos.list input must be an object");
  return {
    org: requireString(input.org, "org"),
    teamSlug: requireString(input.teamSlug, "teamSlug"),
    ...pageInput(input),
  };
}

export type ListRepoInvitationsInput = RepoScope & Page;
export function validateListRepoInvitationsInput(input: unknown): ListRepoInvitationsInput {
  if (!isRecord(input)) throw new Error("repos.invitations.list input must be an object");
  return { ...repoScope(input), ...pageInput(input) };
}

export type CreateOrgRepoInput = {
  org: string;
  name: string;
  description?: string;
  private?: boolean;
  visibility?: string;
  autoInit?: boolean;
  gitignoreTemplate?: string;
  licenseTemplate?: string;
};
export function validateCreateOrgRepoInput(input: unknown): CreateOrgRepoInput {
  if (!isRecord(input)) throw new Error("orgs.repos.create input must be an object");
  const visibility = optionalString(input.visibility, "visibility");
  if (visibility !== undefined && visibility !== "public" && visibility !== "private" && visibility !== "internal") {
    throw new Error("visibility must be public, private, or internal");
  }
  return {
    org: requireString(input.org, "org"),
    name: requireString(input.name, "name"),
    description: typeof input.description === "string" ? input.description : undefined,
    private: optionalBool(input.private, "private"),
    visibility,
    autoInit: optionalBool(input.autoInit, "autoInit"),
    gitignoreTemplate: optionalString(input.gitignoreTemplate, "gitignoreTemplate"),
    licenseTemplate: optionalString(input.licenseTemplate, "licenseTemplate"),
  };
}

export type CreateTeamInput = {
  org: string;
  name: string;
  description?: string;
  privacy?: string;
  permission?: string;
  maintainers?: string[];
  parentTeamId?: number;
};
export function validateCreateTeamInput(input: unknown): CreateTeamInput {
  if (!isRecord(input)) throw new Error("teams.create input must be an object");
  const privacy = optionalString(input.privacy, "privacy");
  if (privacy !== undefined && privacy !== "secret" && privacy !== "closed") {
    throw new Error("privacy must be secret or closed");
  }
  const permission = optionalString(input.permission, "permission");
  if (permission !== undefined && permission !== "pull" && permission !== "push" && permission !== "admin") {
    throw new Error("permission must be pull, push, or admin");
  }
  return {
    org: requireString(input.org, "org"),
    name: requireString(input.name, "name"),
    description: typeof input.description === "string" ? input.description : undefined,
    privacy,
    permission,
    maintainers: optionalStringList(input.maintainers, "maintainers"),
    parentTeamId: optionalPositive(input.parentTeamId, "parentTeamId"),
  };
}

export type CreateRepoHookInput = {
  owner: string;
  repo: string;
  url: string;
  events: string[];
  name?: string;
  active?: boolean;
  contentType?: string;
  secret?: string;
  insecureSsl?: boolean;
};
export function validateCreateRepoHookInput(input: unknown): CreateRepoHookInput {
  if (!isRecord(input)) throw new Error("repos.hooks.create input must be an object");
  const contentType = optionalString(input.contentType, "contentType");
  if (contentType !== undefined && contentType !== "json" && contentType !== "form") {
    throw new Error("contentType must be json or form");
  }
  const events = optionalStringList(input.events, "events");
  if (!events || events.length === 0) throw new Error("events is required");
  return {
    ...repoScope(input),
    url: requireString(input.url, "url"),
    events,
    name: optionalString(input.name, "name"),
    active: optionalBool(input.active, "active"),
    contentType,
    secret: optionalString(input.secret, "secret"),
    insecureSsl: optionalBool(input.insecureSsl, "insecureSsl"),
  };
}

export type RemoveTeamMembershipInput = { org: string; teamSlug: string; username: string };
export function validateRemoveTeamMembershipInput(input: unknown): RemoveTeamMembershipInput {
  if (!isRecord(input)) throw new Error("teams.membership.remove input must be an object");
  return {
    org: requireString(input.org, "org"),
    teamSlug: requireString(input.teamSlug, "teamSlug"),
    username: requireString(input.username, "username"),
  };
}

export type DispatchRepoInput = { owner: string; repo: string; eventType: string; clientPayload?: Record<string, unknown> };
export function validateDispatchRepoInput(input: unknown): DispatchRepoInput {
  if (!isRecord(input)) throw new Error("repos.dispatch input must be an object");
  let clientPayload: Record<string, unknown> | undefined;
  if (input.clientPayload !== undefined) {
    if (!isRecord(input.clientPayload)) throw new Error("clientPayload must be an object");
    clientPayload = input.clientPayload;
  }
  return {
    ...repoScope(input),
    eventType: requireString(input.eventType, "eventType"),
    clientPayload,
  };
}

function mapError(status: number, headers: Record<string, string>, action: string) {
  if (status === 404) {
    return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: `Not found for ${action}.` } };
  }
  if (status === 422) {
    return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: `Validation failed for ${action}.` } };
  }
  if (status === 429 || (status === 403 && parseGitHubRateLimit(status, headers).limited)) {
    const rateLimit = parseGitHubRateLimit(status, headers);
    return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
  }
  return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: `GitHub rejected the ${action} request.` } };
}

function clientFor(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }, base: GitHubClient | undefined, operation: string) {
  return base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation });
}

function pageQuery(perPage?: number, page?: number): string {
  const params = new URLSearchParams();
  if (perPage) params.set("per_page", String(perPage));
  if (page) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function deliveryQuery(payload: { perPage?: number; cursor?: string; status?: string }): string {
  const params = new URLSearchParams();
  if (payload.perPage) params.set("per_page", String(payload.perPage));
  if (payload.cursor) params.set("cursor", payload.cursor);
  if (payload.status) params.set("status", payload.status);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function repoPath(owner: string, repo: string): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function branchParam(branch: string): string {
  return encodeURIComponent(branch);
}

export function createGovernanceClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const base = options.githubClient;
  return {
    async getCollaboratorPermission(input: unknown) {
      const payload = validateGetCollaboratorPermissionInput(input);
      const client = clientFor(options, base, "repos.collaborators.permission.get");
      const response = await client.fetchJSON(`${repoPath(payload.owner, payload.repo)}/collaborators/${encodeURIComponent(payload.username)}/permission`);
      if (response.status === 200 && isRecord(response.body)) {
        const user = isRecord(response.body.user) ? normalizeGitHubUser(response.body.user as GitHubUser) : undefined;
        return {
          ok: true as const,
          permission: typeof response.body.permission === "string" ? response.body.permission : "",
          roleName: typeof response.body.role_name === "string" ? response.body.role_name : "",
          username: payload.username,
          user,
        };
      }
      return mapError(response.status, response.headers, "repos.collaborators.permission.get");
    },

    async getBranchProtection(input: unknown) {
      const payload = validateGetBranchProtectionInput(input);
      const client = clientFor(options, base, "branches.protection.get");
      const response = await client.fetchJSON(`${repoPath(payload.owner, payload.repo)}/branches/${branchParam(payload.branch)}/protection`);
      if (response.status === 200 && isRecord(response.body)) {
        return {
          ok: true as const,
          protection: {
            url: typeof response.body.url === "string" ? response.body.url : "",
            enforceAdmins: response.body.enforce_admins ?? null,
            requiredStatusChecks: response.body.required_status_checks ?? null,
            requiredPullRequestReviews: response.body.required_pull_request_reviews ?? null,
            restrictions: response.body.restrictions ?? null,
            modelVersion: "2026-05-16" as const,
            raw: response.body,
          },
        };
      }
      return mapError(response.status, response.headers, "branches.protection.get");
    },

    async listRulesets(input: unknown) {
      const payload = validateListRepoRulesetsInput(input);
      const client = clientFor(options, base, "repos.rulesets.list");
      const response = await client.fetchJSON(`${repoPath(payload.owner, payload.repo)}/rulesets${pageQuery(payload.perPage, payload.page)}`);
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, rulesets: (response.body as GitHubRuleset[]).map(normalizeGitHubRuleset) };
      }
      return mapError(response.status, response.headers, "repos.rulesets.list");
    },

    async rulesForBranch(input: unknown) {
      const payload = validateGetRulesForBranchInput(input);
      const client = clientFor(options, base, "repos.rules.for_branch");
      const response = await client.fetchJSON(`${repoPath(payload.owner, payload.repo)}/rules/branches/${branchParam(payload.branch)}`);
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, rules: (response.body as GitHubBranchRule[]).map(normalizeGitHubBranchRule) };
      }
      return mapError(response.status, response.headers, "repos.rules.for_branch");
    },

    async listHooks(input: unknown) {
      const payload = validateListRepoHooksInput(input);
      const client = clientFor(options, base, "repos.hooks.list");
      const response = await client.fetchJSON(`${repoPath(payload.owner, payload.repo)}/hooks${pageQuery(payload.perPage, payload.page)}`);
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, hooks: (response.body as GitHubHook[]).map(normalizeGitHubHook) };
      }
      return mapError(response.status, response.headers, "repos.hooks.list");
    },

    async getOrgHook(input: unknown) {
      const payload = validateGetOrgHookInput(input);
      const client = clientFor(options, base, "orgs.hooks.get");
      const response = await client.fetchJSON(`/orgs/${encodeURIComponent(payload.org)}/hooks/${payload.hookId}`);
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, hook: normalizeGitHubHook(response.body as GitHubHook) };
      }
      return mapError(response.status, response.headers, "orgs.hooks.get");
    },

    async getRepoHook(input: unknown) {
      const payload = validateGetRepoHookInput(input);
      const client = clientFor(options, base, "repos.hooks.get");
      const response = await client.fetchJSON(`${repoPath(payload.owner, payload.repo)}/hooks/${payload.hookId}`);
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, hook: normalizeGitHubHook(response.body as GitHubHook) };
      }
      return mapError(response.status, response.headers, "repos.hooks.get");
    },

    async getOrgHookConfig(input: unknown) {
      const payload = validateGetOrgHookConfigInput(input);
      const client = clientFor(options, base, "orgs.hooks.config.get");
      const response = await client.fetchJSON(`/orgs/${encodeURIComponent(payload.org)}/hooks/${payload.hookId}/config`);
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, config: normalizeGitHubHookConfig(response.body) };
      }
      return mapError(response.status, response.headers, "orgs.hooks.config.get");
    },

    async getRepoHookConfig(input: unknown) {
      const payload = validateGetRepoHookConfigInput(input);
      const client = clientFor(options, base, "repos.hooks.config.get");
      const response = await client.fetchJSON(`${repoPath(payload.owner, payload.repo)}/hooks/${payload.hookId}/config`);
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, config: normalizeGitHubHookConfig(response.body) };
      }
      return mapError(response.status, response.headers, "repos.hooks.config.get");
    },

    async getOrgHookDelivery(input: unknown) {
      const payload = validateGetOrgHookDeliveryInput(input);
      const client = clientFor(options, base, "orgs.hooks.deliveries.get");
      const response = await client.fetchJSON(`/orgs/${encodeURIComponent(payload.org)}/hooks/${payload.hookId}/deliveries/${payload.deliveryId}`);
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, delivery: normalizeGitHubHookDelivery(response.body as GitHubHookDelivery) };
      }
      return mapError(response.status, response.headers, "orgs.hooks.deliveries.get");
    },

    async getRepoHookDelivery(input: unknown) {
      const payload = validateGetRepoHookDeliveryInput(input);
      const client = clientFor(options, base, "repos.hooks.deliveries.get");
      const response = await client.fetchJSON(`${repoPath(payload.owner, payload.repo)}/hooks/${payload.hookId}/deliveries/${payload.deliveryId}`);
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, delivery: normalizeGitHubHookDelivery(response.body as GitHubHookDelivery) };
      }
      return mapError(response.status, response.headers, "repos.hooks.deliveries.get");
    },

    async listOrgHookDeliveries(input: unknown) {
      const payload = validateListOrgHookDeliveriesInput(input);
      const client = clientFor(options, base, "orgs.hooks.deliveries.list");
      const response = await client.fetchJSON(`/orgs/${encodeURIComponent(payload.org)}/hooks/${payload.hookId}/deliveries${deliveryQuery(payload)}`);
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, deliveries: (response.body as GitHubHookDelivery[]).map(normalizeGitHubHookDelivery) };
      }
      return mapError(response.status, response.headers, "orgs.hooks.deliveries.list");
    },

    async listRepoHookDeliveries(input: unknown) {
      const payload = validateListRepoHookDeliveriesInput(input);
      const client = clientFor(options, base, "repos.hooks.deliveries.list");
      const response = await client.fetchJSON(`${repoPath(payload.owner, payload.repo)}/hooks/${payload.hookId}/deliveries${deliveryQuery(payload)}`);
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, deliveries: (response.body as GitHubHookDelivery[]).map(normalizeGitHubHookDelivery) };
      }
      return mapError(response.status, response.headers, "repos.hooks.deliveries.list");
    },

    async getTeamMembership(input: unknown) {
      const payload = validateGetTeamMembershipInput(input);
      const client = clientFor(options, base, "teams.membership.get");
      const response = await client.fetchJSON(`/orgs/${encodeURIComponent(payload.org)}/teams/${encodeURIComponent(payload.teamSlug)}/memberships/${encodeURIComponent(payload.username)}`);
      if (response.status === 200 && isRecord(response.body)) {
        return {
          ok: true as const,
          username: payload.username,
          role: typeof response.body.role === "string" ? response.body.role : "",
          state: typeof response.body.state === "string" ? response.body.state : "",
          url: typeof response.body.url === "string" ? response.body.url : "",
        };
      }
      return mapError(response.status, response.headers, "teams.membership.get");
    },

    async listTeamRepos(input: unknown) {
      const payload = validateListTeamReposInput(input);
      const client = clientFor(options, base, "teams.repos.list");
      const response = await client.fetchJSON(`/orgs/${encodeURIComponent(payload.org)}/teams/${encodeURIComponent(payload.teamSlug)}/repos${pageQuery(payload.perPage, payload.page)}`);
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, repositories: (response.body as GitHubRepo[]).map(normalizeGitHubRepo) };
      }
      return mapError(response.status, response.headers, "teams.repos.list");
    },

    async listInvitations(input: unknown) {
      const payload = validateListRepoInvitationsInput(input);
      const client = clientFor(options, base, "repos.invitations.list");
      const response = await client.fetchJSON(`${repoPath(payload.owner, payload.repo)}/invitations${pageQuery(payload.perPage, payload.page)}`);
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, invitations: (response.body as GitHubInvitation[]).map(normalizeGitHubInvitation) };
      }
      return mapError(response.status, response.headers, "repos.invitations.list");
    },

    async createOrgRepo(input: unknown) {
      const payload = validateCreateOrgRepoInput(input);
      const client = clientFor(options, base, "orgs.repos.create");
      const body: Record<string, unknown> = { name: payload.name };
      if (payload.description !== undefined) body.description = payload.description;
      if (payload.private !== undefined) body.private = payload.private;
      if (payload.visibility !== undefined) body.visibility = payload.visibility;
      if (payload.autoInit !== undefined) body.auto_init = payload.autoInit;
      if (payload.gitignoreTemplate !== undefined) body.gitignore_template = payload.gitignoreTemplate;
      if (payload.licenseTemplate !== undefined) body.license_template = payload.licenseTemplate;
      const response = await client.fetchJSON(`/orgs/${encodeURIComponent(payload.org)}/repos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 201 && isRecord(response.body)) {
        return { ok: true as const, repo: normalizeGitHubRepo(response.body as GitHubRepo) };
      }
      return mapError(response.status, response.headers, "orgs.repos.create");
    },

    async createTeam(input: unknown) {
      const payload = validateCreateTeamInput(input);
      const client = clientFor(options, base, "teams.create");
      const body: Record<string, unknown> = { name: payload.name };
      if (payload.description !== undefined) body.description = payload.description;
      if (payload.privacy !== undefined) body.privacy = payload.privacy;
      if (payload.permission !== undefined) body.permission = payload.permission;
      if (payload.maintainers !== undefined) body.maintainers = payload.maintainers;
      if (payload.parentTeamId !== undefined) body.parent_team_id = payload.parentTeamId;
      const response = await client.fetchJSON(`/orgs/${encodeURIComponent(payload.org)}/teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 201 && isRecord(response.body)) {
        return { ok: true as const, team: normalizeGitHubTeam(response.body as GitHubTeam) };
      }
      return mapError(response.status, response.headers, "teams.create");
    },

    async createHook(input: unknown) {
      const payload = validateCreateRepoHookInput(input);
      const client = clientFor(options, base, "repos.hooks.create");
      const config: Record<string, unknown> = { url: payload.url };
      if (payload.contentType !== undefined) config.content_type = payload.contentType;
      if (payload.secret !== undefined) config.secret = payload.secret;
      if (payload.insecureSsl !== undefined) config.insecure_ssl = payload.insecureSsl ? "1" : "0";
      const body: Record<string, unknown> = {
        name: payload.name ?? "web",
        config,
        events: payload.events,
      };
      if (payload.active !== undefined) body.active = payload.active;
      const response = await client.fetchJSON(`${repoPath(payload.owner, payload.repo)}/hooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 201 && isRecord(response.body)) {
        return { ok: true as const, hook: normalizeGitHubHook(response.body as GitHubHook) };
      }
      return mapError(response.status, response.headers, "repos.hooks.create");
    },

    async removeTeamMembership(input: unknown) {
      const payload = validateRemoveTeamMembershipInput(input);
      const client = clientFor(options, base, "teams.membership.remove");
      const response = await client.fetchJSON(
        `/orgs/${encodeURIComponent(payload.org)}/teams/${encodeURIComponent(payload.teamSlug)}/memberships/${encodeURIComponent(payload.username)}`,
        { method: "DELETE" },
      );
      // Same as repos.contents.delete: 204 is success. 404 is an upstream error
      // (missing org or team is not proof the membership is gone).
      if (response.status === 204) {
        return { ok: true as const, removed: true as const, username: payload.username };
      }
      return mapError(response.status, response.headers, "teams.membership.remove");
    },


    async listRuleSuites(input: unknown) {
      const payload = validateListRuleSuitesInput(input);
      const client = clientFor(options, base, "repos.rule_suites.list");
      const response = await client.fetchJSON(`${repoPath(payload.owner, payload.repo)}/rulesets/rule-suites${pageQuery(payload.perPage, payload.page)}`);
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, ruleSuites: response.body.filter(isRecord).map(normalizeRuleSuite) };
      }
      return mapError(response.status, response.headers, "repos.rule_suites.list");
    },

    async getRuleSuite(input: unknown) {
      const payload = validateGetRuleSuiteInput(input);
      const client = clientFor(options, base, "repos.rule_suites.get");
      const response = await client.fetchJSON(`${repoPath(payload.owner, payload.repo)}/rulesets/rule-suites/${payload.ruleSuiteId}`);
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, ruleSuite: normalizeRuleSuite(response.body) };
      }
      return mapError(response.status, response.headers, "repos.rule_suites.get");
    },

    async getRuleset(input: unknown) {
      const payload = validateGetRepoRulesetInput(input);
      const client = clientFor(options, base, "repos.rulesets.get");
      const response = await client.fetchJSON(`${repoPath(payload.owner, payload.repo)}/rulesets/${payload.rulesetId}`);
      if (response.status === 200 && isRecord(response.body)) {
        const ruleset = response.body as GitHubRuleset;
        return {
          ok: true as const,
          ruleset: {
            ...normalizeGitHubRuleset(ruleset),
            rules: Array.isArray(ruleset.rules) ? ruleset.rules : [],
          },
        };
      }
      return mapError(response.status, response.headers, "repos.rulesets.get");
    },

    async dispatch(input: unknown) {
      const payload = validateDispatchRepoInput(input);
      const client = clientFor(options, base, "repos.dispatch");
      const body: Record<string, unknown> = { event_type: payload.eventType };
      if (payload.clientPayload !== undefined) body.client_payload = payload.clientPayload;
      const response = await client.fetchJSON(`${repoPath(payload.owner, payload.repo)}/dispatches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 204) {
        return { ok: true as const, dispatched: true as const, eventType: payload.eventType };
      }
      return mapError(response.status, response.headers, "repos.dispatch");
    },
  };
}

function repoScope(input: Record<string, unknown>): RepoScope {
  return { owner: requireString(input.owner, "owner"), repo: requireString(input.repo, "repo") };
}

function pageInput(input: Record<string, unknown>): Page {
  return {
    perPage: optionalPage(input.perPage, "perPage"),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

function optionalPage(value: unknown, field: string, max = 100): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${field} must be an integer between 1 and ${max}`);
  }
  return value;
}

function optionalPositive(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive safe integer`);
  }
  return value;
}

function optionalBool(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${field} must be a boolean`);
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} must be a non-empty string`);
  return value;
}

function optionalStringList(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new Error(`${field} must be an array of non-empty strings`);
  }
  return value;
}


type GitHubRuleSuite = {
  id: number;
  actor_name?: string;
  ref?: string;
  result?: string;
  before_sha?: string;
  after_sha?: string;
  [key: string]: unknown;
};

function normalizeRuleSuite(suite: GitHubRuleSuite) {
  return {
    id: `gh-rule-suite:${suite.id}`,
    provider: "github" as const,
    ruleSuiteId: suite.id,
    actorName: suite.actor_name ?? "",
    ref: suite.ref ?? "",
    result: suite.result ?? "",
    beforeSha: suite.before_sha ?? "",
    afterSha: suite.after_sha ?? "",
    modelVersion: "2026-05-16" as const,
    raw: suite,
  };
}

function requirePositive(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive safe integer`);
  }
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
