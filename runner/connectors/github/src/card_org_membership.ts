import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

type Page = { perPage?: number; page?: number };
type OrgName = { org: string };
type OrgUser = OrgName & { username: string };

export type UpdateOrgInput = OrgName & {
  name?: string;
  email?: string;
  description?: string;
  company?: string;
  location?: string;
  twitterUsername?: string;
  blog?: string;
  billingEmail?: string;
  defaultRepositoryPermission?: string;
  membersCanCreateRepositories?: boolean;
};

export type BlockOrgUserInput = OrgUser;
export type ListOrgInvitationsInput = OrgName & Page & { role?: string };
export type CreateOrgInvitationInput = OrgName & {
  email?: string;
  inviteeId?: number;
  role?: string;
  teamIds?: number[];
};
export type CancelOrgInvitationInput = OrgName & { invitationId: number };
export type GetOrgMembershipInput = OrgUser;
export type UpdateOrgMembershipInput = OrgUser & { role?: string };
export type RemoveOrgMembershipInput = OrgUser;
export type GetGitRefInput = { owner: string; repo: string; ref: string };

export type NormalizedOrgProfile = {
  login: string;
  name: string;
  description: string;
  company: string;
  location: string;
  email: string;
  blog: string;
};

export type NormalizedOrgInvitation = {
  id: number;
  login: string;
  email: string;
  role: string;
  createdAt: string;
  inviter: string;
};

export type NormalizedOrgMembership = {
  url: string;
  state: string;
  role: string;
  user: string;
  organization: string;
};

export type NormalizedGitRef = { ref: string; sha: string; url: string };

const ORG_PERMISSION = new Set(["read", "write", "admin", "none"]);
const INVITE_ROLES = new Set(["admin", "direct_member", "billing_manager", "reinstated_member"]);
const INVITE_LIST_ROLES = new Set(["all", "admin", "direct_member", "billing_manager", "hiring_manager"]);
const MEMBER_ROLES = new Set(["admin", "member"]);

export function validateUpdateOrgInput(input: unknown): UpdateOrgInput {
  const record = requireObject(input, "orgs.update");
  return omitUndefined({
    org: segment(record.org, "org"),
    name: optionalLine(record.name, "name"),
    email: optionalLine(record.email, "email"),
    description: optionalLine(record.description, "description"),
    company: optionalLine(record.company, "company"),
    location: optionalLine(record.location, "location"),
    twitterUsername: optionalLine(record.twitterUsername, "twitterUsername"),
    blog: optionalLine(record.blog, "blog"),
    billingEmail: optionalLine(record.billingEmail, "billingEmail"),
    defaultRepositoryPermission: optionalEnum(record.defaultRepositoryPermission, "defaultRepositoryPermission", ORG_PERMISSION),
    membersCanCreateRepositories: optionalBoolean(record.membersCanCreateRepositories, "membersCanCreateRepositories"),
  });
}

export function validateBlockOrgUserInput(input: unknown): BlockOrgUserInput {
  return orgUser(input, "orgs.blocks.block");
}

export function validateUnblockOrgUserInput(input: unknown): BlockOrgUserInput {
  return orgUser(input, "orgs.blocks.unblock");
}

export function validateListOrgInvitationsInput(input: unknown): ListOrgInvitationsInput {
  const record = requireObject(input, "orgs.invitations.list");
  return omitUndefined({
    org: segment(record.org, "org"),
    role: optionalEnum(record.role, "role", INVITE_LIST_ROLES),
    ...pageInput(record),
  });
}

export function validateCreateOrgInvitationInput(input: unknown): CreateOrgInvitationInput {
  const record = requireObject(input, "orgs.invitations.create");
  const email = optionalLine(record.email, "email");
  const inviteeId = optionalId(record.inviteeId ?? record.invitee_id, "invitee_id");
  if (email === undefined && inviteeId === undefined) {
    throw new Error("email or invitee_id is required");
  }
  const teamIds = optionalIdList(record.teamIds ?? record.team_ids, "team_ids");
  return omitUndefined({
    org: segment(record.org, "org"),
    email,
    inviteeId,
    role: optionalEnum(record.role, "role", INVITE_ROLES),
    teamIds,
  });
}

export function validateCancelOrgInvitationInput(input: unknown): CancelOrgInvitationInput {
  const record = requireObject(input, "orgs.invitations.cancel");
  return {
    org: segment(record.org, "org"),
    invitationId: requireId(record.invitationId ?? record.invitation_id, "invitation_id"),
  };
}

export function validateGetOrgMembershipInput(input: unknown): GetOrgMembershipInput {
  return orgUser(input, "orgs.memberships.get");
}

export function validateUpdateOrgMembershipInput(input: unknown): UpdateOrgMembershipInput {
  const record = requireObject(input, "orgs.memberships.update");
  return omitUndefined({
    ...orgUser(record, "orgs.memberships.update"),
    role: optionalEnum(record.role, "role", MEMBER_ROLES),
  });
}

export function validateRemoveOrgMembershipInput(input: unknown): RemoveOrgMembershipInput {
  return orgUser(input, "orgs.memberships.remove");
}

export function validateGetGitRefInput(input: unknown): GetGitRefInput {
  const record = requireObject(input, "git.ref.get");
  return {
    owner: segment(record.owner, "owner"),
    repo: segment(record.repo, "repo"),
    ref: requireRef(record.ref),
  };
}

export function createOrgMembershipClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const client = options.githubClient ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation: "orgs.update",
  });

  return {
    async updateOrg(input: unknown) {
      const payload = validateUpdateOrgInput(input);
      const body: Record<string, unknown> = {};
      if (payload.name !== undefined) body.name = payload.name;
      if (payload.email !== undefined) body.email = payload.email;
      if (payload.description !== undefined) body.description = payload.description;
      if (payload.company !== undefined) body.company = payload.company;
      if (payload.location !== undefined) body.location = payload.location;
      if (payload.twitterUsername !== undefined) body.twitter_username = payload.twitterUsername;
      if (payload.blog !== undefined) body.blog = payload.blog;
      if (payload.billingEmail !== undefined) body.billing_email = payload.billingEmail;
      if (payload.defaultRepositoryPermission !== undefined) {
        body.default_repository_permission = payload.defaultRepositoryPermission;
      }
      if (payload.membersCanCreateRepositories !== undefined) {
        body.members_can_create_repositories = payload.membersCanCreateRepositories;
      }
      const response = await client.fetchJSON(`/orgs/${seg(payload.org)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 404) return upstream("Organization not found.");
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, organization: normalizeOrgProfile(response.body) };
      }
      return upstream("GitHub rejected the orgs.update request.");
    },

    async blockUser(input: unknown) {
      const payload = validateBlockOrgUserInput(input);
      const response = await client.fetchJSON(
        `/orgs/${seg(payload.org)}/blocks/${seg(payload.username)}`,
        { method: "PUT", headers: { "Content-Length": "0" } },
      );
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 204 || response.status === 200) {
        return { ok: true as const, blocked: true as const, username: payload.username };
      }
      if (response.status === 404) return upstream("Organization or user not found.");
      return upstream("GitHub rejected the orgs.blocks.block request.");
    },

    async unblockUser(input: unknown) {
      const payload = validateUnblockOrgUserInput(input);
      const response = await client.fetchJSON(
        `/orgs/${seg(payload.org)}/blocks/${seg(payload.username)}`,
        { method: "DELETE" },
      );
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 204 || response.status === 200 || response.status === 404) {
        return { ok: true as const, blocked: false as const, username: payload.username };
      }
      return upstream("GitHub rejected the orgs.blocks.unblock request.");
    },

    async listInvitations(input: unknown) {
      const payload = validateListOrgInvitationsInput(input);
      const params = new URLSearchParams();
      if (payload.role) params.set("role", payload.role);
      if (payload.perPage) params.set("per_page", String(payload.perPage));
      if (payload.page) params.set("page", String(payload.page));
      const qs = params.toString() ? `?${params.toString()}` : "";
      const response = await client.fetchJSON(`/orgs/${seg(payload.org)}/invitations${qs}`);
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 404) return upstream("Organization invitations were not found.");
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, invitations: response.body.filter(isRecord).map(normalizeInvitation) };
      }
      return upstream("GitHub rejected the orgs.invitations.list request.");
    },

    async createInvitation(input: unknown) {
      const payload = validateCreateOrgInvitationInput(input);
      const body: Record<string, unknown> = {};
      if (payload.email !== undefined) body.email = payload.email;
      if (payload.inviteeId !== undefined) body.invitee_id = payload.inviteeId;
      if (payload.role !== undefined) body.role = payload.role;
      if (payload.teamIds !== undefined) body.team_ids = payload.teamIds;
      const response = await client.fetchJSON(`/orgs/${seg(payload.org)}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 404) return upstream("Organization not found.");
      if (response.status === 201 && isRecord(response.body)) {
        return { ok: true as const, invitation: normalizeInvitation(response.body) };
      }
      return upstream("GitHub rejected the orgs.invitations.create request.");
    },

    async cancelInvitation(input: unknown) {
      const payload = validateCancelOrgInvitationInput(input);
      const response = await client.fetchJSON(
        `/orgs/${seg(payload.org)}/invitations/${payload.invitationId}`,
        { method: "DELETE" },
      );
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 204) {
        return { ok: true as const, cancelled: true as const, invitationId: payload.invitationId };
      }
      if (response.status === 404) return upstream("Organization invitation not found.");
      return upstream("GitHub rejected the orgs.invitations.cancel request.");
    },

    async getMembership(input: unknown) {
      const payload = validateGetOrgMembershipInput(input);
      const response = await client.fetchJSON(
        `/orgs/${seg(payload.org)}/memberships/${seg(payload.username)}`,
      );
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 404) return upstream("Organization membership was not found.");
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, membership: normalizeMembership(response.body) };
      }
      return upstream("GitHub rejected the orgs.memberships.get request.");
    },

    async updateMembership(input: unknown) {
      const payload = validateUpdateOrgMembershipInput(input);
      const body: Record<string, unknown> = {};
      if (payload.role !== undefined) body.role = payload.role;
      const response = await client.fetchJSON(
        `/orgs/${seg(payload.org)}/memberships/${seg(payload.username)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 404) return upstream("Organization or user not found.");
      if ((response.status === 200 || response.status === 201) && isRecord(response.body)) {
        return { ok: true as const, membership: normalizeMembership(response.body) };
      }
      return upstream("GitHub rejected the orgs.memberships.update request.");
    },

    async removeMembership(input: unknown) {
      const payload = validateRemoveOrgMembershipInput(input);
      const response = await client.fetchJSON(
        `/orgs/${seg(payload.org)}/memberships/${seg(payload.username)}`,
        { method: "DELETE" },
      );
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 204 || response.status === 200 || response.status === 404) {
        return { ok: true as const, removed: true as const, username: payload.username };
      }
      return upstream("GitHub rejected the orgs.memberships.remove request.");
    },

    async getRef(input: unknown) {
      const payload = validateGetGitRefInput(input);
      const response = await client.fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/git/ref/${encodeRefPath(payload.ref)}`,
      );
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 404) return upstream("Ref not found.");
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, ref: normalizeGitRef(response.body, payload.ref) };
      }
      return upstream("GitHub rejected the git.ref.get request.");
    },
  };
}

function normalizeOrgProfile(item: Record<string, unknown>): NormalizedOrgProfile {
  return {
    login: typeof item.login === "string" ? item.login : "",
    name: typeof item.name === "string" ? item.name : "",
    description: typeof item.description === "string" ? item.description : "",
    company: typeof item.company === "string" ? item.company : "",
    location: typeof item.location === "string" ? item.location : "",
    email: typeof item.email === "string" ? item.email : "",
    blog: typeof item.blog === "string" ? item.blog : "",
  };
}

function normalizeInvitation(item: Record<string, unknown>): NormalizedOrgInvitation {
  const inviter = isRecord(item.inviter) ? item.inviter : {};
  return {
    id: typeof item.id === "number" ? item.id : 0,
    login: typeof item.login === "string" ? item.login : "",
    email: typeof item.email === "string" ? item.email : "",
    role: typeof item.role === "string" ? item.role : "",
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
    inviter: typeof inviter.login === "string" ? inviter.login : "",
  };
}

function normalizeMembership(item: Record<string, unknown>): NormalizedOrgMembership {
  const user = isRecord(item.user) ? item.user : {};
  const organization = isRecord(item.organization) ? item.organization : {};
  return {
    url: typeof item.url === "string" ? item.url : "",
    state: typeof item.state === "string" ? item.state : "",
    role: typeof item.role === "string" ? item.role : "",
    user: typeof user.login === "string" ? user.login : "",
    organization: typeof organization.login === "string" ? organization.login : "",
  };
}

function normalizeGitRef(item: Record<string, unknown>, fallback: string): NormalizedGitRef {
  const object = isRecord(item.object) ? item.object : {};
  return {
    ref: typeof item.ref === "string" ? item.ref : fallback,
    sha: typeof object.sha === "string" ? object.sha : "",
    url: typeof item.url === "string" ? item.url : "",
  };
}

function rate(status: number, headers: Record<string, string>) {
  if (status === 429 || (status === 403 && parseGitHubRateLimit(status, headers).limited)) {
    const parsed = parseGitHubRateLimit(status, headers);
    return {
      ok: false as const,
      error: {
        code: "CONNECTOR_RATE_LIMITED" as const,
        message: "GitHub rate limit exceeded.",
        retryAfterSeconds: parsed.limited ? parsed.retryAfterSeconds : undefined,
      },
    };
  }
  return null;
}

function upstream(message: string) {
  return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message } };
}

function orgUser(input: unknown, action: string): OrgUser {
  const record = isRecord(input) ? input : requireObject(input, action);
  return { org: segment(record.org, "org"), username: segment(record.username, "username") };
}

function pageInput(input: Record<string, unknown>): Page {
  return omitUndefined({
    perPage: optionalPage(input.perPage, "perPage", 100),
    page: optionalPage(input.page, "page", 1_000_000),
  });
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function requireObject(input: unknown, action: string): Record<string, unknown> {
  if (!isRecord(input)) throw new Error(`${action} input must be an object`);
  return input;
}

function segment(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  if (value.includes("/") || value.includes("?") || value.includes("#")) {
    throw new Error(`${field} must be a single path segment`);
  }
  return value;
}

function requireRef(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new Error("ref is required");
  if (value.includes("?") || value.includes("#")) throw new Error("ref must not contain query or fragment");
  const normalized = value.startsWith("refs/") ? value.slice("refs/".length) : value;
  if (normalized.length === 0) throw new Error("ref is required");
  return value;
}

function encodeRefPath(ref: string): string {
  const normalized = ref.startsWith("refs/") ? ref.slice("refs/".length) : ref;
  return normalized.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function requireId(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function optionalId(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  return requireId(value, field);
}

function optionalIdList(value: unknown, field: string): number[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${field} must be a non-empty array`);
  return value.map((item, index) => requireId(item, `${field}[${index}]`));
}

function optionalLine(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  if (/[\r\n]/.test(value)) throw new Error(`${field} must be a single line`);
  return value;
}

function optionalEnum(value: unknown, field: string, allowed: Set<string>): string | undefined {
  const text = optionalLine(value, field);
  if (text === undefined) return undefined;
  if (!allowed.has(text)) throw new Error(`${field} is not a documented value`);
  return text;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${field} must be a boolean`);
  return value;
}

function optionalPage(value: unknown, field: string, max = 100): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${field} must be an integer between 1 and ${max}`);
  }
  return value;
}

function seg(value: string): string {
  return encodeURIComponent(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
