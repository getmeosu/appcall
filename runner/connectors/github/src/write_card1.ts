import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";
import { normalizeGitHubOrg, type GitHubOrg } from "./orgs";

type OrgUser = { org: string; username: string };
type OrgUserRole = OrgUser & { roleId: number };
type OrgMigrationRepo = { org: string; migrationId: number; repoName: string };

const LIMITS = ["existing_users", "contributors_only", "collaborators_only"] as const;
const EXPIRIES = ["one_day", "three_days", "one_week", "one_month", "six_months"] as const;
const REPO_PERMISSIONS = ["read", "write", "admin", "none"] as const;

export type UpdateOrgInput = {
  org: string;
  billingEmail?: string;
  company?: string;
  email?: string;
  twitterUsername?: string;
  location?: string;
  name?: string;
  description?: string;
  blog?: string;
  hasOrganizationProjects?: boolean;
  hasRepositoryProjects?: boolean;
  defaultRepositoryPermission?: (typeof REPO_PERMISSIONS)[number];
  membersCanCreateRepositories?: boolean;
  membersCanCreateInternalRepositories?: boolean;
  membersCanCreatePrivateRepositories?: boolean;
  membersCanCreatePublicRepositories?: boolean;
  membersCanCreatePages?: boolean;
  membersCanCreatePublicPages?: boolean;
  membersCanCreatePrivatePages?: boolean;
  membersCanForkPrivateRepositories?: boolean;
  webCommitSignoffRequired?: boolean;
  deployKeysEnabledForRepositories?: boolean;
};

export function validateAssignOrgRoleInput(input: unknown): OrgUserRole {
  return orgUserRole(input, "orgs.organization_roles.users.assign");
}

export function validateBlockOrgUserInput(input: unknown): OrgUser {
  return orgUser(input, "orgs.blocks.block");
}

export function validateDeleteOrgInput(input: unknown): { org: string } {
  if (!isRecord(input)) throw new Error("orgs.delete input must be an object");
  return { org: requireSingleSegment(input.org, "org") };
}

export function validateRemoveAllOrgRolesInput(input: unknown): OrgUser {
  return orgUser(input, "orgs.organization_roles.users.remove_all");
}

export function validateRemoveOrgMemberInput(input: unknown): OrgUser {
  return orgUser(input, "orgs.members.remove");
}

export function validateRemoveOrgRoleInput(input: unknown): OrgUserRole {
  return orgUserRole(input, "orgs.organization_roles.users.remove");
}

export function validateDeleteOrgPropertySchemaInput(input: unknown): { org: string; customPropertyName: string } {
  if (!isRecord(input)) throw new Error("orgs.properties.schema.delete input must be an object");
  return {
    org: requireSingleSegment(input.org, "org"),
    customPropertyName: requireSingleSegment(input.customPropertyName, "customPropertyName"),
  };
}

export function validateDeleteOrgInteractionLimitsInput(input: unknown): { org: string } {
  if (!isRecord(input)) throw new Error("orgs.interaction_limits.delete input must be an object");
  return { org: requireSingleSegment(input.org, "org") };
}

export function validateRemoveOutsideCollaboratorInput(input: unknown): OrgUser {
  return orgUser(input, "orgs.outside_collaborators.remove");
}

export function validateSetOrgInteractionLimitsInput(input: unknown): { org: string; limit: string; expiry?: string } {
  if (!isRecord(input)) throw new Error("orgs.interaction_limits.set input must be an object");
  if (typeof input.limit !== "string" || !LIMITS.includes(input.limit as (typeof LIMITS)[number])) {
    throw new Error("limit must be existing_users, contributors_only, or collaborators_only");
  }
  let expiry: string | undefined;
  if (input.expiry !== undefined) {
    if (typeof input.expiry !== "string" || !EXPIRIES.includes(input.expiry as (typeof EXPIRIES)[number])) {
      throw new Error("expiry must be one_day, three_days, one_week, one_month, or six_months");
    }
    expiry = input.expiry;
  }
  return { org: requireSingleSegment(input.org, "org"), limit: input.limit, expiry };
}

export function validateUnblockOrgUserInput(input: unknown): OrgUser {
  return orgUser(input, "orgs.blocks.unblock");
}

export function validateUnlockOrgMigrationRepoInput(input: unknown): OrgMigrationRepo {
  if (!isRecord(input)) throw new Error("orgs.migrations.repos.unlock input must be an object");
  return {
    org: requireSingleSegment(input.org, "org"),
    migrationId: requireId(input.migrationId, "migrationId"),
    repoName: requireSingleSegment(input.repoName, "repoName"),
  };
}

export function validateUpdateOrgInput(input: unknown): UpdateOrgInput {
  if (!isRecord(input)) throw new Error("orgs.update input must be an object");
  if ("login" in input) throw new Error("orgs.update cannot change the organization login");
  const permission = input.defaultRepositoryPermission;
  if (permission !== undefined && (typeof permission !== "string" || !REPO_PERMISSIONS.includes(permission as (typeof REPO_PERMISSIONS)[number]))) {
    throw new Error("defaultRepositoryPermission must be read, write, admin, or none");
  }
  return {
    org: requireSingleSegment(input.org, "org"),
    billingEmail: optionalString(input.billingEmail, "billingEmail"),
    company: optionalString(input.company, "company"),
    email: optionalString(input.email, "email"),
    twitterUsername: optionalString(input.twitterUsername, "twitterUsername"),
    location: optionalString(input.location, "location"),
    name: optionalString(input.name, "name"),
    description: optionalString(input.description, "description"),
    blog: optionalString(input.blog, "blog"),
    hasOrganizationProjects: optionalBoolean(input.hasOrganizationProjects, "hasOrganizationProjects"),
    hasRepositoryProjects: optionalBoolean(input.hasRepositoryProjects, "hasRepositoryProjects"),
    defaultRepositoryPermission: permission as UpdateOrgInput["defaultRepositoryPermission"],
    membersCanCreateRepositories: optionalBoolean(input.membersCanCreateRepositories, "membersCanCreateRepositories"),
    membersCanCreateInternalRepositories: optionalBoolean(input.membersCanCreateInternalRepositories, "membersCanCreateInternalRepositories"),
    membersCanCreatePrivateRepositories: optionalBoolean(input.membersCanCreatePrivateRepositories, "membersCanCreatePrivateRepositories"),
    membersCanCreatePublicRepositories: optionalBoolean(input.membersCanCreatePublicRepositories, "membersCanCreatePublicRepositories"),
    membersCanCreatePages: optionalBoolean(input.membersCanCreatePages, "membersCanCreatePages"),
    membersCanCreatePublicPages: optionalBoolean(input.membersCanCreatePublicPages, "membersCanCreatePublicPages"),
    membersCanCreatePrivatePages: optionalBoolean(input.membersCanCreatePrivatePages, "membersCanCreatePrivatePages"),
    membersCanForkPrivateRepositories: optionalBoolean(input.membersCanForkPrivateRepositories, "membersCanForkPrivateRepositories"),
    webCommitSignoffRequired: optionalBoolean(input.webCommitSignoffRequired, "webCommitSignoffRequired"),
    deployKeysEnabledForRepositories: optionalBoolean(input.deployKeysEnabledForRepositories, "deployKeysEnabledForRepositories"),
  };
}

export function createWriteCard1Client(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const base = options.githubClient;
  const clientFor = (operation: string) => base ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation,
  });

  return {
    async assignOrgRole(input: unknown) {
      const payload = validateAssignOrgRoleInput(input);
      const response = await clientFor("orgs.organization_roles.users.assign").fetchJSON(
        `${orgPath(payload.org)}/organization-roles/users/${encodeURIComponent(payload.username)}/${payload.roleId}`,
        { method: "PUT" },
      );
      return noContent(response, 204, { assigned: true, org: payload.org, username: payload.username, roleId: payload.roleId }, "Organization role assignment was not found.", "GitHub rejected the assign organization role request.");
    },
    async blockOrgUser(input: unknown) {
      const payload = validateBlockOrgUserInput(input);
      const response = await clientFor("orgs.blocks.block").fetchJSON(
        `${orgPath(payload.org)}/blocks/${encodeURIComponent(payload.username)}`,
        { method: "PUT" },
      );
      return noContent(response, 204, { blocked: true, org: payload.org, username: payload.username }, "Organization block was not found.", "GitHub rejected the block user request.");
    },
    async deleteOrg(input: unknown) {
      const payload = validateDeleteOrgInput(input);
      const response = await clientFor("orgs.delete").fetchJSON(orgPath(payload.org), { method: "DELETE" });
      return noContent(response, 202, { deleted: true, org: payload.org }, "Organization not found.", "GitHub rejected the delete organization request.");
    },
    async removeAllOrgRoles(input: unknown) {
      const payload = validateRemoveAllOrgRolesInput(input);
      const response = await clientFor("orgs.organization_roles.users.remove_all").fetchJSON(
        `${orgPath(payload.org)}/organization-roles/users/${encodeURIComponent(payload.username)}`,
        { method: "DELETE" },
      );
      return noContent(response, 204, { removed: true, org: payload.org, username: payload.username }, "Organization roles for the user were not found.", "GitHub rejected the remove all organization roles request.");
    },
    async removeOrgMember(input: unknown) {
      const payload = validateRemoveOrgMemberInput(input);
      const response = await clientFor("orgs.members.remove").fetchJSON(
        `${orgPath(payload.org)}/members/${encodeURIComponent(payload.username)}`,
        { method: "DELETE" },
      );
      return noContent(response, 204, { removed: true, org: payload.org, username: payload.username }, "Organization member was not found.", "GitHub rejected the remove organization member request.");
    },
    async removeOrgRole(input: unknown) {
      const payload = validateRemoveOrgRoleInput(input);
      const response = await clientFor("orgs.organization_roles.users.remove").fetchJSON(
        `${orgPath(payload.org)}/organization-roles/users/${encodeURIComponent(payload.username)}/${payload.roleId}`,
        { method: "DELETE" },
      );
      return noContent(response, 204, { removed: true, org: payload.org, username: payload.username, roleId: payload.roleId }, "Organization role was not found.", "GitHub rejected the remove organization role request.");
    },
    async deleteOrgPropertySchema(input: unknown) {
      const payload = validateDeleteOrgPropertySchemaInput(input);
      const response = await clientFor("orgs.properties.schema.delete").fetchJSON(
        `${orgPath(payload.org)}/properties/schema/${encodeURIComponent(payload.customPropertyName)}`,
        { method: "DELETE" },
      );
      return noContent(response, 204, { deleted: true, org: payload.org, customPropertyName: payload.customPropertyName }, "Organization property schema was not found.", "GitHub rejected the delete organization property request.");
    },
    async deleteOrgInteractionLimits(input: unknown) {
      const payload = validateDeleteOrgInteractionLimitsInput(input);
      const response = await clientFor("orgs.interaction_limits.delete").fetchJSON(
        `${orgPath(payload.org)}/interaction-limits`,
        { method: "DELETE" },
      );
      return noContent(response, 204, { deleted: true, org: payload.org }, "Organization interaction limits were not found.", "GitHub rejected the delete organization interaction limits request.");
    },
    async removeOutsideCollaborator(input: unknown) {
      const payload = validateRemoveOutsideCollaboratorInput(input);
      const response = await clientFor("orgs.outside_collaborators.remove").fetchJSON(
        `${orgPath(payload.org)}/outside_collaborators/${encodeURIComponent(payload.username)}`,
        { method: "DELETE" },
      );
      return noContent(response, 204, { removed: true, org: payload.org, username: payload.username }, "Outside collaborator was not found.", "GitHub rejected the remove outside collaborator request.");
    },
    async setOrgInteractionLimits(input: unknown) {
      const payload = validateSetOrgInteractionLimitsInput(input);
      const body: Record<string, string> = { limit: payload.limit };
      if (payload.expiry !== undefined) body.expiry = payload.expiry;
      const response = await clientFor("orgs.interaction_limits.set").fetchJSON(
        `${orgPath(payload.org)}/interaction-limits`,
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
      if (response.status === 200 && isRecord(response.body)) return { ok: true as const, limits: response.body };
      if (response.status === 404) return upstream("Organization interaction limits were not found.");
      return mapRateOrUpstream(response, "GitHub rejected the set organization interaction limits request.");
    },
    async unblockOrgUser(input: unknown) {
      const payload = validateUnblockOrgUserInput(input);
      const response = await clientFor("orgs.blocks.unblock").fetchJSON(
        `${orgPath(payload.org)}/blocks/${encodeURIComponent(payload.username)}`,
        { method: "DELETE" },
      );
      return noContent(response, 204, { unblocked: true, org: payload.org, username: payload.username }, "Organization block was not found.", "GitHub rejected the unblock user request.");
    },
    async unlockOrgMigrationRepo(input: unknown) {
      const payload = validateUnlockOrgMigrationRepoInput(input);
      const response = await clientFor("orgs.migrations.repos.unlock").fetchJSON(
        `${orgPath(payload.org)}/migrations/${payload.migrationId}/repos/${encodeURIComponent(payload.repoName)}/lock`,
        { method: "DELETE" },
      );
      return noContent(response, 204, { unlocked: true, org: payload.org, migrationId: payload.migrationId, repoName: payload.repoName }, "Organization migration repository lock was not found.", "GitHub rejected the unlock migration repository request.");
    },
    async updateOrg(input: unknown) {
      const payload = validateUpdateOrgInput(input);
      const body = updateBody(payload);
      const response = await clientFor("orgs.update").fetchJSON(orgPath(payload.org), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, organization: normalizeGitHubOrg(response.body as GitHubOrg) };
      }
      if (response.status === 404) return upstream("Organization not found.");
      if (response.status === 409) return upstream("Organization update conflict.");
      if (response.status === 422) return upstream("Organization update validation failed.");
      return mapRateOrUpstream(response, "GitHub rejected the update organization request.");
    },
  };
}

function updateBody(payload: UpdateOrgInput): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const pairs: Array<[keyof UpdateOrgInput, string]> = [
    ["billingEmail", "billing_email"],
    ["company", "company"],
    ["email", "email"],
    ["twitterUsername", "twitter_username"],
    ["location", "location"],
    ["name", "name"],
    ["description", "description"],
    ["blog", "blog"],
    ["hasOrganizationProjects", "has_organization_projects"],
    ["hasRepositoryProjects", "has_repository_projects"],
    ["defaultRepositoryPermission", "default_repository_permission"],
    ["membersCanCreateRepositories", "members_can_create_repositories"],
    ["membersCanCreateInternalRepositories", "members_can_create_internal_repositories"],
    ["membersCanCreatePrivateRepositories", "members_can_create_private_repositories"],
    ["membersCanCreatePublicRepositories", "members_can_create_public_repositories"],
    ["membersCanCreatePages", "members_can_create_pages"],
    ["membersCanCreatePublicPages", "members_can_create_public_pages"],
    ["membersCanCreatePrivatePages", "members_can_create_private_pages"],
    ["membersCanForkPrivateRepositories", "members_can_fork_private_repositories"],
    ["webCommitSignoffRequired", "web_commit_signoff_required"],
    ["deployKeysEnabledForRepositories", "deploy_keys_enabled_for_repositories"],
  ];
  for (const [field, wire] of pairs) {
    if (payload[field] !== undefined) body[wire] = payload[field];
  }
  return body;
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

function orgPath(org: string): string {
  return `/orgs/${encodeURIComponent(org)}`;
}

function orgUser(input: unknown, action: string): OrgUser {
  if (!isRecord(input)) throw new Error(`${action} input must be an object`);
  return {
    org: requireSingleSegment(input.org, "org"),
    username: requireSingleSegment(input.username, "username"),
  };
}

function orgUserRole(input: unknown, action: string): OrgUserRole {
  if (!isRecord(input)) throw new Error(`${action} input must be an object`);
  return { ...orgUser(input, action), roleId: requireId(input.roleId, "roleId") };
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

function requireId(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  return value;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${field} must be a boolean`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
