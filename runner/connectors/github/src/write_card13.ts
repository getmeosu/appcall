import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

type IssueRef = { owner: string; repo: string; issueNumber: number };
type AddSubIssue = IssueRef & { subIssueId: number };
type TeamRef = { org: string; teamSlug: string };
type TeamRepo = TeamRef & { owner: string; repo: string };
type TeamRepoAdd = TeamRepo & { permission: string };
type TeamRole = TeamRef & { roleId: number };
type UpdateTeam = TeamRef & {
  name?: string;
  description?: string;
  privacy?: string;
  notificationSetting?: string;
  permission?: string;
  parentTeamId?: number;
};

const TEAM_REPO_PERMISSIONS = ["pull", "triage", "push", "maintain", "admin"] as const;
const TEAM_PRIVACY = ["secret", "closed"] as const;
const TEAM_NOTIFICATION = ["notifications_enabled", "notifications_disabled"] as const;
const TEAM_DEFAULT_PERMISSION = ["pull", "push", "admin"] as const;

export function validateAddSubIssueInput(input: unknown): AddSubIssue {
  if (!isRecord(input)) throw new Error("issues.sub_issues.add input must be an object");
  return {
    ...issueRef(input),
    subIssueId: requireId(input.subIssueId ?? input.sub_issue_id, "subIssueId"),
  };
}

export function validateRemoveAllIssueLabelsInput(input: unknown): IssueRef {
  if (!isRecord(input)) throw new Error("issues.labels.remove_all input must be an object");
  return issueRef(input);
}

export function validateAddTeamRepoInput(input: unknown): TeamRepoAdd {
  if (!isRecord(input)) throw new Error("orgs.teams.repos.add input must be an object");
  const permission = input.permission;
  if (typeof permission !== "string" || !TEAM_REPO_PERMISSIONS.includes(permission as (typeof TEAM_REPO_PERMISSIONS)[number])) {
    throw new Error("permission must be pull, triage, push, maintain, or admin");
  }
  return {
    ...teamRepo(input),
    permission,
  };
}

export function validateAssignOrgRoleToTeamInput(input: unknown): TeamRole {
  if (!isRecord(input)) throw new Error("orgs.organization_roles.teams.assign input must be an object");
  return {
    ...teamRef(input),
    roleId: requireId(input.roleId ?? input.role_id, "roleId"),
  };
}

export function validateDeleteOrgTeamInput(input: unknown): TeamRef {
  if (!isRecord(input)) throw new Error("orgs.teams.delete input must be an object");
  return teamRef(input);
}

export function validateRemoveAllOrgRolesFromTeamInput(input: unknown): TeamRef {
  if (!isRecord(input)) throw new Error("orgs.organization_roles.teams.remove_all input must be an object");
  return teamRef(input);
}

export function validateRemoveOrgRoleFromTeamInput(input: unknown): TeamRole {
  if (!isRecord(input)) throw new Error("orgs.organization_roles.teams.remove input must be an object");
  return {
    ...teamRef(input),
    roleId: requireId(input.roleId ?? input.role_id, "roleId"),
  };
}

export function validateRemoveTeamRepoInput(input: unknown): TeamRepo {
  if (!isRecord(input)) throw new Error("orgs.teams.repos.remove input must be an object");
  return teamRepo(input);
}

export function validateUpdateOrgTeamInput(input: unknown): UpdateTeam {
  if (!isRecord(input)) throw new Error("orgs.teams.update input must be an object");
  const out: UpdateTeam = { ...teamRef(input) };
  if (input.name !== undefined) out.name = requireNonEmptyString(input.name, "name");
  if (input.description !== undefined) {
    if (typeof input.description !== "string") throw new Error("description must be a string");
    out.description = input.description;
  }
  if (input.privacy !== undefined) {
    if (typeof input.privacy !== "string" || !TEAM_PRIVACY.includes(input.privacy as (typeof TEAM_PRIVACY)[number])) {
      throw new Error("privacy must be secret or closed");
    }
    out.privacy = input.privacy;
  }
  if (input.notificationSetting !== undefined || input.notification_setting !== undefined) {
    const value = input.notificationSetting ?? input.notification_setting;
    if (typeof value !== "string" || !TEAM_NOTIFICATION.includes(value as (typeof TEAM_NOTIFICATION)[number])) {
      throw new Error("notificationSetting must be notifications_enabled or notifications_disabled");
    }
    out.notificationSetting = value;
  }
  if (input.permission !== undefined) {
    if (typeof input.permission !== "string" || !TEAM_DEFAULT_PERMISSION.includes(input.permission as (typeof TEAM_DEFAULT_PERMISSION)[number])) {
      throw new Error("permission must be pull, push, or admin");
    }
    out.permission = input.permission;
  }
  if (input.parentTeamId !== undefined || input.parent_team_id !== undefined) {
    out.parentTeamId = requireId(input.parentTeamId ?? input.parent_team_id, "parentTeamId");
  }
  return out;
}

export function createWriteCard13Client(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const base = options.githubClient;
  const clientFor = (operation: string) => base ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation,
  });

  return {
    async addSubIssue(input: unknown) {
      const payload = validateAddSubIssueInput(input);
      const response = await clientFor("issues.sub_issues.add").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/issues/${payload.issueNumber}/sub_issues`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sub_issue_id: payload.subIssueId }),
        },
      );
      return jsonBody(response, [201], "issue", "Issue was not found.", "GitHub rejected the add sub-issue request.");
    },
    async removeAllIssueLabels(input: unknown) {
      const payload = validateRemoveAllIssueLabelsInput(input);
      const response = await clientFor("issues.labels.remove_all").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/issues/${payload.issueNumber}/labels`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        { deleted: true, owner: payload.owner, repo: payload.repo, issueNumber: payload.issueNumber },
        "Issue labels were not found.",
        "GitHub rejected the remove all issue labels request.",
      );
    },
    async addTeamRepo(input: unknown) {
      const payload = validateAddTeamRepoInput(input);
      const response = await clientFor("orgs.teams.repos.add").fetchJSON(
        `/orgs/${seg(payload.org)}/teams/${seg(payload.teamSlug)}/repos/${seg(payload.owner)}/${seg(payload.repo)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ permission: payload.permission }),
        },
      );
      return noContent(
        response,
        204,
        {
          added: true,
          org: payload.org,
          teamSlug: payload.teamSlug,
          owner: payload.owner,
          repo: payload.repo,
          permission: payload.permission,
        },
        "Team repository was not found.",
        "GitHub rejected the add team repository request.",
      );
    },
    async assignOrgRoleToTeam(input: unknown) {
      const payload = validateAssignOrgRoleToTeamInput(input);
      const response = await clientFor("orgs.organization_roles.teams.assign").fetchJSON(
        `/orgs/${seg(payload.org)}/organization-roles/teams/${seg(payload.teamSlug)}/${payload.roleId}`,
        { method: "PUT" },
      );
      return noContent(
        response,
        204,
        { assigned: true, org: payload.org, teamSlug: payload.teamSlug, roleId: payload.roleId },
        "Organization role assignment was not found.",
        "GitHub rejected the assign organization role to team request.",
      );
    },
    async deleteOrgTeam(input: unknown) {
      const payload = validateDeleteOrgTeamInput(input);
      const response = await clientFor("orgs.teams.delete").fetchJSON(
        `/orgs/${seg(payload.org)}/teams/${seg(payload.teamSlug)}`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        { deleted: true, org: payload.org, teamSlug: payload.teamSlug },
        "Team was not found.",
        "GitHub rejected the delete team request.",
      );
    },
    async removeAllOrgRolesFromTeam(input: unknown) {
      const payload = validateRemoveAllOrgRolesFromTeamInput(input);
      const response = await clientFor("orgs.organization_roles.teams.remove_all").fetchJSON(
        `/orgs/${seg(payload.org)}/organization-roles/teams/${seg(payload.teamSlug)}`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        { removed: true, org: payload.org, teamSlug: payload.teamSlug },
        "Organization roles for the team were not found.",
        "GitHub rejected the remove all organization roles from team request.",
      );
    },
    async removeOrgRoleFromTeam(input: unknown) {
      const payload = validateRemoveOrgRoleFromTeamInput(input);
      const response = await clientFor("orgs.organization_roles.teams.remove").fetchJSON(
        `/orgs/${seg(payload.org)}/organization-roles/teams/${seg(payload.teamSlug)}/${payload.roleId}`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        { removed: true, org: payload.org, teamSlug: payload.teamSlug, roleId: payload.roleId },
        "Organization role was not found.",
        "GitHub rejected the remove organization role from team request.",
      );
    },
    async removeTeamRepo(input: unknown) {
      const payload = validateRemoveTeamRepoInput(input);
      const response = await clientFor("orgs.teams.repos.remove").fetchJSON(
        `/orgs/${seg(payload.org)}/teams/${seg(payload.teamSlug)}/repos/${seg(payload.owner)}/${seg(payload.repo)}`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        {
          removed: true,
          org: payload.org,
          teamSlug: payload.teamSlug,
          owner: payload.owner,
          repo: payload.repo,
        },
        "Team repository was not found.",
        "GitHub rejected the remove team repository request.",
      );
    },
    async updateOrgTeam(input: unknown) {
      const payload = validateUpdateOrgTeamInput(input);
      const body: Record<string, unknown> = {};
      if (payload.name !== undefined) body.name = payload.name;
      if (payload.description !== undefined) body.description = payload.description;
      if (payload.privacy !== undefined) body.privacy = payload.privacy;
      if (payload.notificationSetting !== undefined) body.notification_setting = payload.notificationSetting;
      if (payload.permission !== undefined) body.permission = payload.permission;
      if (payload.parentTeamId !== undefined) body.parent_team_id = payload.parentTeamId;
      const response = await clientFor("orgs.teams.update").fetchJSON(
        `/orgs/${seg(payload.org)}/teams/${seg(payload.teamSlug)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      return jsonBody(response, [200], "team", "Team was not found.", "GitHub rejected the update team request.");
    },
  };
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

function jsonBody(
  response: { status: number; headers: Record<string, string>; body: unknown },
  success: number[],
  key: string,
  missing: string,
  rejected: string,
) {
  if (success.includes(response.status) && isRecord(response.body)) {
    return { ok: true as const, [key]: response.body };
  }
  if (response.status === 404) return upstream(missing);
  return mapRateOrUpstream(response, rejected);
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

function issueRef(input: Record<string, unknown>): IssueRef {
  return {
    owner: requireSingleSegment(input.owner, "owner"),
    repo: requireSingleSegment(input.repo, "repo"),
    issueNumber: requireId(input.issueNumber ?? input.issue_number, "issueNumber"),
  };
}

function teamRef(input: Record<string, unknown>): TeamRef {
  return {
    org: requireSingleSegment(input.org, "org"),
    teamSlug: requireSingleSegment(input.teamSlug ?? input.team_slug, "teamSlug"),
  };
}

function teamRepo(input: Record<string, unknown>): TeamRepo {
  return {
    ...teamRef(input),
    owner: requireSingleSegment(input.owner, "owner"),
    repo: requireSingleSegment(input.repo, "repo"),
  };
}

function seg(value: string): string {
  return encodeURIComponent(value);
}

function requireSingleSegment(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  if (value.includes("/") || value.includes("?") || value.includes("#")) {
    throw new Error(`${field} must be a single path segment`);
  }
  return value;
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
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
