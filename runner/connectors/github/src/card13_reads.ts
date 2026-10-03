import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

type Page = { perPage?: number; page?: number };

export type ListSubIssuesInput = {
  owner: string;
  repo: string;
  issueNumber: number;
} & Page;

export type GetTeamRepoPermissionInput = {
  org: string;
  teamSlug: string;
  owner: string;
  repo: string;
};

export type GetOrgTeamInput = { org: string; teamSlug: string };
export type ListChildTeamsInput = { org: string; teamSlug: string } & Page;
export type ListTeamInvitationsInput = { org: string; teamSlug: string } & Page;
export type ListRepoTeamsInput = { owner: string; repo: string } & Page;
export type ListUserTeamsInput = Page;
export type ListOrgRoleTeamsInput = { org: string; roleId: number } & Page;
export type GetOrgWorkflowPermissionsInput = { org: string };
export type GetOrgCacheUsageInput = { org: string };
export type GetRepoCacheUsageInput = { owner: string; repo: string };
export type GetOrgActionsPermissionsInput = { org: string };
export type GetRunTimingInput = { owner: string; repo: string; runId: number };
export type GetWorkflowTimingInput = { owner: string; repo: string; workflowId: string };

export type NormalizedSubIssue = {
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
};

export type NormalizedTeam = {
  id: number;
  name: string;
  slug: string;
  description: string;
  privacy: string;
  permission: string;
};

export type NormalizedRoleTeam = NormalizedTeam & { assignment: string };

export type NormalizedTeamInvitation = {
  id: number;
  login: string;
  email: string;
  role: string;
  createdAt: string;
};

export type NormalizedTeamRepoPermission = {
  id: number;
  name: string;
  fullName: string;
  roleName: string;
  permissions: {
    admin: boolean;
    maintain: boolean;
    push: boolean;
    triage: boolean;
    pull: boolean;
  };
};

export type NormalizedOrgWorkflowPermissions = {
  defaultWorkflowPermissions: string;
  canApprovePullRequestReviews: boolean;
};

export type NormalizedOrgActionsPermissions = {
  enabledRepositories: string;
  allowedActions: string;
  shaPinningRequired: boolean;
};

export type NormalizedOrgCacheUsage = {
  totalActiveCachesCount: number;
  totalActiveCachesSizeInBytes: number;
};

export type NormalizedRepoCacheUsage = {
  fullName: string;
  activeCachesCount: number;
  activeCachesSizeInBytes: number;
};

export type NormalizedBillableOs = { totalMs: number; jobs: number };

export type NormalizedRunTiming = {
  runDurationMs: number;
  billable: {
    ubuntu: NormalizedBillableOs;
    macos: NormalizedBillableOs;
    windows: NormalizedBillableOs;
  };
};

export type NormalizedWorkflowTiming = {
  billable: {
    ubuntu: { totalMs: number };
    macos: { totalMs: number };
    windows: { totalMs: number };
  };
};

export function validateListSubIssuesInput(input: unknown): ListSubIssuesInput {
  if (!isRecord(input)) throw new Error("issues.sub_issues.list input must be an object");
  return {
    ...repoScope(input),
    issueNumber: requireId(input.issueNumber, "issueNumber"),
    ...pageInput(input),
  };
}

export function validateGetTeamRepoPermissionInput(input: unknown): GetTeamRepoPermissionInput {
  if (!isRecord(input)) throw new Error("orgs.teams.repos.permission.get input must be an object");
  return { ...teamScope(input), ...repoScope(input) };
}

export function validateGetOrgTeamInput(input: unknown): GetOrgTeamInput {
  if (!isRecord(input)) throw new Error("orgs.teams.get input must be an object");
  return teamScope(input);
}

export function validateListChildTeamsInput(input: unknown): ListChildTeamsInput {
  if (!isRecord(input)) throw new Error("orgs.teams.child.list input must be an object");
  return { ...teamScope(input), ...pageInput(input) };
}

export function validateListTeamInvitationsInput(input: unknown): ListTeamInvitationsInput {
  if (!isRecord(input)) throw new Error("orgs.teams.invitations.list input must be an object");
  return { ...teamScope(input), ...pageInput(input) };
}

export function validateListRepoTeamsInput(input: unknown): ListRepoTeamsInput {
  if (!isRecord(input)) throw new Error("repos.teams.list input must be an object");
  return { ...repoScope(input), ...pageInput(input) };
}

export function validateListUserTeamsInput(input: unknown): ListUserTeamsInput {
  if (!isRecord(input)) throw new Error("user.teams.list input must be an object");
  return pageInput(input);
}

export function validateListOrgRoleTeamsInput(input: unknown): ListOrgRoleTeamsInput {
  if (!isRecord(input)) throw new Error("orgs.organization_roles.teams.list input must be an object");
  return {
    org: requireSingleSegment(input.org, "org"),
    roleId: requireId(input.roleId, "roleId"),
    ...pageInput(input),
  };
}

export function validateGetOrgWorkflowPermissionsInput(input: unknown): GetOrgWorkflowPermissionsInput {
  if (!isRecord(input)) throw new Error("orgs.actions.permissions.workflow.get input must be an object");
  return { org: requireSingleSegment(input.org, "org") };
}

export function validateGetOrgCacheUsageInput(input: unknown): GetOrgCacheUsageInput {
  if (!isRecord(input)) throw new Error("orgs.actions.cache.usage.get input must be an object");
  return { org: requireSingleSegment(input.org, "org") };
}

export function validateGetRepoCacheUsageInput(input: unknown): GetRepoCacheUsageInput {
  if (!isRecord(input)) throw new Error("repos.actions.cache.usage.get input must be an object");
  return repoScope(input);
}

export function validateGetOrgActionsPermissionsInput(input: unknown): GetOrgActionsPermissionsInput {
  if (!isRecord(input)) throw new Error("orgs.actions.permissions.get input must be an object");
  return { org: requireSingleSegment(input.org, "org") };
}

export function validateGetRunTimingInput(input: unknown): GetRunTimingInput {
  if (!isRecord(input)) throw new Error("actions.runs.timing.get input must be an object");
  return { ...repoScope(input), runId: requireId(input.runId, "runId") };
}

export function validateGetWorkflowTimingInput(input: unknown): GetWorkflowTimingInput {
  if (!isRecord(input)) throw new Error("actions.workflows.timing.get input must be an object");
  return { ...repoScope(input), workflowId: requireWorkflowId(input.workflowId) };
}

export function normalizeSubIssue(item: Record<string, unknown>): NormalizedSubIssue {
  return {
    number: typeof item.number === "number" ? item.number : 0,
    title: typeof item.title === "string" ? item.title : "",
    state: typeof item.state === "string" ? item.state : "",
    htmlUrl: typeof item.html_url === "string" ? item.html_url : "",
  };
}

export function normalizeTeam(item: Record<string, unknown>): NormalizedTeam {
  return {
    id: typeof item.id === "number" ? item.id : 0,
    name: typeof item.name === "string" ? item.name : "",
    slug: typeof item.slug === "string" ? item.slug : "",
    description: typeof item.description === "string" ? item.description : "",
    privacy: typeof item.privacy === "string" ? item.privacy : "",
    permission: typeof item.permission === "string" ? item.permission : "",
  };
}

export function normalizeRoleTeam(item: Record<string, unknown>): NormalizedRoleTeam {
  return {
    ...normalizeTeam(item),
    assignment: typeof item.assignment === "string" ? item.assignment : "",
  };
}

export function normalizeTeamInvitation(item: Record<string, unknown>): NormalizedTeamInvitation {
  return {
    id: typeof item.id === "number" ? item.id : 0,
    login: typeof item.login === "string" ? item.login : "",
    email: typeof item.email === "string" ? item.email : "",
    role: typeof item.role === "string" ? item.role : "",
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
  };
}

export function normalizeTeamRepoPermission(item: Record<string, unknown>): NormalizedTeamRepoPermission {
  const permissions = isRecord(item.permissions) ? item.permissions : {};
  return {
    id: typeof item.id === "number" ? item.id : 0,
    name: typeof item.name === "string" ? item.name : "",
    fullName: typeof item.full_name === "string" ? item.full_name : "",
    roleName: typeof item.role_name === "string" ? item.role_name : "",
    permissions: {
      admin: permissions.admin === true,
      maintain: permissions.maintain === true,
      push: permissions.push === true,
      triage: permissions.triage === true,
      pull: permissions.pull === true,
    },
  };
}

export function normalizeOrgWorkflowPermissions(item: Record<string, unknown>): NormalizedOrgWorkflowPermissions {
  return {
    defaultWorkflowPermissions: typeof item.default_workflow_permissions === "string" ? item.default_workflow_permissions : "",
    canApprovePullRequestReviews: item.can_approve_pull_request_reviews === true,
  };
}

export function normalizeOrgActionsPermissions(item: Record<string, unknown>): NormalizedOrgActionsPermissions {
  return {
    enabledRepositories: typeof item.enabled_repositories === "string" ? item.enabled_repositories : "",
    allowedActions: typeof item.allowed_actions === "string" ? item.allowed_actions : "",
    shaPinningRequired: item.sha_pinning_required === true,
  };
}

export function normalizeOrgCacheUsage(item: Record<string, unknown>): NormalizedOrgCacheUsage {
  return {
    totalActiveCachesCount: typeof item.total_active_caches_count === "number" ? item.total_active_caches_count : 0,
    totalActiveCachesSizeInBytes: typeof item.total_active_caches_size_in_bytes === "number" ? item.total_active_caches_size_in_bytes : 0,
  };
}

export function normalizeRepoCacheUsage(item: Record<string, unknown>): NormalizedRepoCacheUsage {
  return {
    fullName: typeof item.full_name === "string" ? item.full_name : "",
    activeCachesCount: typeof item.active_caches_count === "number" ? item.active_caches_count : 0,
    activeCachesSizeInBytes: typeof item.active_caches_size_in_bytes === "number" ? item.active_caches_size_in_bytes : 0,
  };
}

export function normalizeRunTiming(item: Record<string, unknown>): NormalizedRunTiming {
  const billable = isRecord(item.billable) ? item.billable : {};
  return {
    runDurationMs: typeof item.run_duration_ms === "number" ? item.run_duration_ms : 0,
    billable: {
      ubuntu: billableOs(billable.UBUNTU),
      macos: billableOs(billable.MACOS),
      windows: billableOs(billable.WINDOWS),
    },
  };
}

export function normalizeWorkflowTiming(item: Record<string, unknown>): NormalizedWorkflowTiming {
  const billable = isRecord(item.billable) ? item.billable : {};
  return {
    billable: {
      ubuntu: { totalMs: totalMs(billable.UBUNTU) },
      macos: { totalMs: totalMs(billable.MACOS) },
      windows: { totalMs: totalMs(billable.WINDOWS) },
    },
  };
}

export function createCard13ReadsClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const client = options.githubClient ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation: "issues.sub_issues.list",
  });

  return {
    async listSubIssues(input: unknown) {
      const payload = validateListSubIssuesInput(input);
      const path = `${repoPath(payload.owner, payload.repo)}/issues/${payload.issueNumber}/sub_issues${query(pageQuery(payload))}`;
      const response = await client.fetchJSON(path);
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, subIssues: response.body.filter(isRecord).map(normalizeSubIssue) };
      }
      if (response.status === 404) return upstream("Sub-issues not found.");
      return mapRateOrUpstream(response, "GitHub rejected the list sub-issues request.");
    },

    async getTeamRepoPermission(input: unknown) {
      const payload = validateGetTeamRepoPermissionInput(input);
      const path = `${teamPath(payload.org, payload.teamSlug)}/repos/${encodeURIComponent(payload.owner)}/${encodeURIComponent(payload.repo)}`;
      const response = await client.fetchJSON(path);
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, permission: normalizeTeamRepoPermission(response.body) };
      }
      if (response.status === 404) return upstream("Team repository permission not found.");
      return mapRateOrUpstream(response, "GitHub rejected the team repository permission request.");
    },

    async getOrgTeam(input: unknown) {
      const payload = validateGetOrgTeamInput(input);
      const response = await client.fetchJSON(teamPath(payload.org, payload.teamSlug));
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, team: normalizeTeam(response.body) };
      }
      if (response.status === 404) return upstream("Team not found.");
      return mapRateOrUpstream(response, "GitHub rejected the get team request.");
    },

    async listChildTeams(input: unknown) {
      const payload = validateListChildTeamsInput(input);
      return listTeams(client, `${teamPath(payload.org, payload.teamSlug)}/teams${query(pageQuery(payload))}`, "Child teams not found.");
    },

    async listTeamInvitations(input: unknown) {
      const payload = validateListTeamInvitationsInput(input);
      const response = await client.fetchJSON(`${teamPath(payload.org, payload.teamSlug)}/invitations${query(pageQuery(payload))}`);
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, invitations: response.body.filter(isRecord).map(normalizeTeamInvitation) };
      }
      if (response.status === 404) return upstream("Team invitations not found.");
      return mapRateOrUpstream(response, "GitHub rejected the list team invitations request.");
    },

    async listRepoTeams(input: unknown) {
      const payload = validateListRepoTeamsInput(input);
      return listTeams(client, `${repoPath(payload.owner, payload.repo)}/teams${query(pageQuery(payload))}`, "Repository teams not found.");
    },

    async listUserTeams(input: unknown) {
      const payload = validateListUserTeamsInput(input);
      return listTeams(client, `/user/teams${query(pageQuery(payload))}`, "User teams not found.");
    },

    async listOrgRoleTeams(input: unknown) {
      const payload = validateListOrgRoleTeamsInput(input);
      const response = await client.fetchJSON(`/orgs/${encodeURIComponent(payload.org)}/organization-roles/${payload.roleId}/teams${query(pageQuery(payload))}`);
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, teams: response.body.filter(isRecord).map(normalizeRoleTeam) };
      }
      if (response.status === 404) return upstream("Organization role teams not found.");
      return mapRateOrUpstream(response, "GitHub rejected the list organization role teams request.");
    },

    async getOrgWorkflowPermissions(input: unknown) {
      const payload = validateGetOrgWorkflowPermissionsInput(input);
      const response = await client.fetchJSON(`/orgs/${encodeURIComponent(payload.org)}/actions/permissions/workflow`);
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, permissions: normalizeOrgWorkflowPermissions(response.body) };
      }
      if (response.status === 404) return upstream("Organization workflow permissions not found.");
      return mapRateOrUpstream(response, "GitHub rejected the organization workflow permissions request.");
    },

    async getOrgCacheUsage(input: unknown) {
      const payload = validateGetOrgCacheUsageInput(input);
      const response = await client.fetchJSON(`/orgs/${encodeURIComponent(payload.org)}/actions/cache/usage`);
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, usage: normalizeOrgCacheUsage(response.body) };
      }
      if (response.status === 404) return upstream("Organization Actions cache usage not found.");
      return mapRateOrUpstream(response, "GitHub rejected the organization cache usage request.");
    },

    async getRepoCacheUsage(input: unknown) {
      const payload = validateGetRepoCacheUsageInput(input);
      const response = await client.fetchJSON(`${repoPath(payload.owner, payload.repo)}/actions/cache/usage`);
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, usage: normalizeRepoCacheUsage(response.body) };
      }
      if (response.status === 404) return upstream("Repository Actions cache usage not found.");
      return mapRateOrUpstream(response, "GitHub rejected the repository cache usage request.");
    },

    async getOrgActionsPermissions(input: unknown) {
      const payload = validateGetOrgActionsPermissionsInput(input);
      const response = await client.fetchJSON(`/orgs/${encodeURIComponent(payload.org)}/actions/permissions`);
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, permissions: normalizeOrgActionsPermissions(response.body) };
      }
      if (response.status === 404) return upstream("Organization Actions permissions not found.");
      return mapRateOrUpstream(response, "GitHub rejected the organization Actions permissions request.");
    },

    async getRunTiming(input: unknown) {
      const payload = validateGetRunTimingInput(input);
      const response = await client.fetchJSON(`${repoPath(payload.owner, payload.repo)}/actions/runs/${payload.runId}/timing`);
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, timing: normalizeRunTiming(response.body) };
      }
      if (response.status === 404) return upstream("Workflow run timing not found.");
      return mapRateOrUpstream(response, "GitHub rejected the workflow run timing request.");
    },

    async getWorkflowTiming(input: unknown) {
      const payload = validateGetWorkflowTimingInput(input);
      const response = await client.fetchJSON(`${repoPath(payload.owner, payload.repo)}/actions/workflows/${encodeURIComponent(payload.workflowId)}/timing`);
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, timing: normalizeWorkflowTiming(response.body) };
      }
      if (response.status === 404) return upstream("Workflow timing not found.");
      return mapRateOrUpstream(response, "GitHub rejected the workflow timing request.");
    },
  };
}

async function listTeams(client: GitHubClient, path: string, missing: string) {
  const response = await client.fetchJSON(path);
  if (response.status === 200 && Array.isArray(response.body)) {
    return { ok: true as const, teams: response.body.filter(isRecord).map(normalizeTeam) };
  }
  if (response.status === 404) return upstream(missing);
  return mapRateOrUpstream(response, "GitHub rejected the list teams request.");
}

function billableOs(value: unknown): NormalizedBillableOs {
  return {
    totalMs: totalMs(value),
    jobs: isRecord(value) && typeof value.jobs === "number" ? value.jobs : 0,
  };
}

function totalMs(value: unknown): number {
  return isRecord(value) && typeof value.total_ms === "number" ? value.total_ms : 0;
}

function pageQuery(payload: Page): Record<string, number | undefined> {
  return { per_page: payload.perPage, page: payload.page };
}

function query(fields: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

function repoPath(owner: string, repo: string): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function teamPath(org: string, teamSlug: string): string {
  return `/orgs/${encodeURIComponent(org)}/${"teams"}/${encodeURIComponent(teamSlug)}`;
}

function repoScope(input: Record<string, unknown>): { owner: string; repo: string } {
  return {
    owner: requireSingleSegment(input.owner, "owner"),
    repo: requireSingleSegment(input.repo, "repo"),
  };
}

function teamScope(input: Record<string, unknown>): { org: string; teamSlug: string } {
  return {
    org: requireSingleSegment(input.org, "org"),
    teamSlug: requireSingleSegment(input.teamSlug, "teamSlug"),
  };
}

function pageInput(input: Record<string, unknown>): Page {
  return {
    perPage: optionalPage(input.perPage, "perPage", 100),
    page: optionalPage(input.page, "page", 1_000_000),
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

function requireWorkflowId(value: unknown): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 1) return String(value);
  return requireSingleSegment(value, "workflowId");
}

function requireSingleSegment(value: unknown, field: string): string {
  const text = requireString(value, field);
  if (text.includes("/") || text.includes("?") || text.includes("#")) {
    throw new Error(`${field} must be a single path segment`);
  }
  return text;
}

function requireId(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function optionalPage(value: unknown, field: string, max = 100): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${field} must be an integer between 1 and ${max}`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
