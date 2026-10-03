import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";
import { normalizeGitHubOrg, type GitHubOrg } from "./orgs";
import { normalizeGitHubEvent, normalizeGitHubUser, type GitHubEvent, type GitHubUser } from "./users";

type OrgName = { org: string };
type OrgUser = OrgName & { username: string };
type Page = { perPage?: number; page?: number };
type OrgPage = OrgName & Page;
type SincePage = { since?: number; perPage?: number };
type UserOrgs = { username: string } & Page;
type UserOrgEvents = { username: string; org: string } & Page;
type OutsideCollaborators = OrgPage & { filter?: "2fa_disabled" | "2fa_insecure" | "all" };
type RoleGet = OrgName & { roleId: number };

export type NormalizedOrganizationRole = {
  id: number;
  name: string;
  description: string;
  permissions: string[];
  source: string;
  baseRole: string;
  createdAt: string;
  updatedAt: string;
};

export type NormalizedOrgInteractionLimits = {
  limit: string;
  origin: string;
  expiresAt: string;
};

export function validateCheckOrgBlockInput(input: unknown): OrgUser {
  return orgUser(input, "orgs.blocks.check");
}

export function validateCheckPublicMemberInput(input: unknown): OrgUser {
  return orgUser(input, "orgs.public_members.check");
}

export function validateGetOrganizationRoleInput(input: unknown): RoleGet {
  if (!isRecord(input)) throw new Error("orgs.organization_roles.get input must be an object");
  return { org: segment(input.org, "org"), roleId: positiveInt(input.roleId, "roleId") };
}

export function validateGetOrgInteractionLimitsInput(input: unknown): OrgName {
  if (!isRecord(input)) throw new Error("orgs.interaction_limits.get input must be an object");
  return { org: segment(input.org, "org") };
}

export function validateListPublicOrgsInput(input: unknown): SincePage {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) throw new Error("orgs.public.list input must be an object");
  return {
    since: optionalNonNegative(input.since, "since"),
    perPage: optionalPage(input.perPage, "perPage"),
  };
}

export function validateListUserOrgsInput(input: unknown): UserOrgs {
  if (!isRecord(input)) throw new Error("users.orgs.list input must be an object");
  return { username: segment(input.username, "username"), ...page(input) };
}

export function validateListUserOrgEventsInput(input: unknown): UserOrgEvents {
  if (!isRecord(input)) throw new Error("users.events.orgs.list input must be an object");
  return { username: segment(input.username, "username"), org: segment(input.org, "org"), ...page(input) };
}

export function validateListOutsideCollaboratorsInput(input: unknown): OutsideCollaborators {
  if (!isRecord(input)) throw new Error("orgs.outside_collaborators.list input must be an object");
  return { org: segment(input.org, "org"), filter: optionalFilter(input.filter), ...page(input) };
}

export function validateListOrgEventsInput(input: unknown): OrgPage {
  return orgPage(input, "orgs.events.list");
}

export function validateListPublicMembersInput(input: unknown): OrgPage {
  return orgPage(input, "orgs.public_members.list");
}

export function validateListOrgBlocksInput(input: unknown): OrgPage {
  return orgPage(input, "orgs.blocks.list");
}

export function normalizeOrganizationRole(item: Record<string, unknown>): NormalizedOrganizationRole {
  const permissions = Array.isArray(item.permissions)
    ? item.permissions.filter((value): value is string => typeof value === "string")
    : [];
  return {
    id: typeof item.id === "number" ? item.id : 0,
    name: typeof item.name === "string" ? item.name : "",
    description: typeof item.description === "string" ? item.description : "",
    permissions,
    source: typeof item.source === "string" ? item.source : "",
    baseRole: typeof item.base_role === "string" ? item.base_role : "",
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
    updatedAt: typeof item.updated_at === "string" ? item.updated_at : "",
  };
}

export function normalizeOrgInteractionLimits(item: Record<string, unknown>): NormalizedOrgInteractionLimits {
  return {
    limit: typeof item.limit === "string" ? item.limit : "",
    origin: typeof item.origin === "string" ? item.origin : "",
    expiresAt: typeof item.expires_at === "string" ? item.expires_at : "",
  };
}

export function createOrgsReadsClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const client = options.githubClient ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation: "orgs.blocks.check",
  });

  return {
    async checkBlock(input: unknown) {
      const payload = validateCheckOrgBlockInput(input);
      const result = await check(client, `/orgs/${enc(payload.org)}/blocks/${enc(payload.username)}`, "orgs.blocks.check");
      if (!result.ok) return result;
      return { ok: true as const, isBlocked: result.yes, username: payload.username };
    },

    async checkPublicMember(input: unknown) {
      const payload = validateCheckPublicMemberInput(input);
      const result = await check(client, `/orgs/${enc(payload.org)}/public_members/${enc(payload.username)}`, "orgs.public_members.check");
      if (!result.ok) return result;
      return { ok: true as const, isPublicMember: result.yes, username: payload.username };
    },

    async getOrganizationRole(input: unknown) {
      const payload = validateGetOrganizationRoleInput(input);
      const result = await read(client, `/orgs/${enc(payload.org)}/organization-roles/${payload.roleId}`, "orgs.organization_roles.get", "GitHub organization role was not found.");
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the orgs.organization_roles.get request.");
      return { ok: true as const, role: normalizeOrganizationRole(result.body) };
    },

    async getInteractionLimits(input: unknown) {
      const payload = validateGetOrgInteractionLimitsInput(input);
      const result = await read(client, `/orgs/${enc(payload.org)}/interaction-limits`, "orgs.interaction_limits.get", "GitHub organization interaction limits were not found.");
      if (!result.ok) return result;
      const body = isRecord(result.body) ? result.body : {};
      const limits = normalizeOrgInteractionLimits(body);
      return { ok: true as const, limits, present: limits.limit.length > 0 };
    },

    async listPublicOrgs(input: unknown) {
      const payload = validateListPublicOrgsInput(input);
      const params = new URLSearchParams();
      if (payload.since !== undefined) params.set("since", String(payload.since));
      if (payload.perPage) params.set("per_page", String(payload.perPage));
      const result = await read(client, `/organizations${qs(params)}`, "orgs.public.list", "GitHub organizations list was not found.");
      if (!result.ok) return result;
      if (!Array.isArray(result.body)) return upstream("GitHub rejected the orgs.public.list request.");
      return { ok: true as const, organizations: result.body.filter(isRecord).map((org) => normalizeGitHubOrg(org as GitHubOrg)) };
    },

    async listUserOrgs(input: unknown) {
      const payload = validateListUserOrgsInput(input);
      const result = await read(client, `/users/${enc(payload.username)}/orgs${pageQuery(payload)}`, "users.orgs.list", "GitHub user organizations were not found.");
      if (!result.ok) return result;
      if (!Array.isArray(result.body)) return upstream("GitHub rejected the users.orgs.list request.");
      return { ok: true as const, organizations: result.body.filter(isRecord).map((org) => normalizeGitHubOrg(org as GitHubOrg)) };
    },

    async listUserOrgEvents(input: unknown) {
      const payload = validateListUserOrgEventsInput(input);
      const result = await read(client, `/users/${enc(payload.username)}/events/orgs/${enc(payload.org)}${pageQuery(payload)}`, "users.events.orgs.list", "GitHub organization events for the user were not found.");
      if (!result.ok) return result;
      if (!Array.isArray(result.body)) return upstream("GitHub rejected the users.events.orgs.list request.");
      return { ok: true as const, events: result.body.filter(isRecord).map((event) => normalizeGitHubEvent(event as GitHubEvent)) };
    },

    async listOutsideCollaborators(input: unknown) {
      const payload = validateListOutsideCollaboratorsInput(input);
      const params = new URLSearchParams();
      if (payload.filter) params.set("filter", payload.filter);
      if (payload.perPage) params.set("per_page", String(payload.perPage));
      if (payload.page) params.set("page", String(payload.page));
      const result = await read(client, `/orgs/${enc(payload.org)}/outside_collaborators${qs(params)}`, "orgs.outside_collaborators.list", "GitHub outside collaborators were not found.");
      if (!result.ok) return result;
      if (!Array.isArray(result.body)) return upstream("GitHub rejected the orgs.outside_collaborators.list request.");
      return { ok: true as const, collaborators: result.body.filter(isRecord).map((user) => normalizeGitHubUser(user as GitHubUser)) };
    },

    async listOrgEvents(input: unknown) {
      const payload = validateListOrgEventsInput(input);
      const result = await read(client, `/orgs/${enc(payload.org)}/events${pageQuery(payload)}`, "orgs.events.list", "GitHub organization events were not found.");
      if (!result.ok) return result;
      if (!Array.isArray(result.body)) return upstream("GitHub rejected the orgs.events.list request.");
      return { ok: true as const, events: result.body.filter(isRecord).map((event) => normalizeGitHubEvent(event as GitHubEvent)) };
    },

    async listPublicMembers(input: unknown) {
      const payload = validateListPublicMembersInput(input);
      const result = await read(client, `/orgs/${enc(payload.org)}/public_members${pageQuery(payload)}`, "orgs.public_members.list", "GitHub public members were not found.");
      if (!result.ok) return result;
      if (!Array.isArray(result.body)) return upstream("GitHub rejected the orgs.public_members.list request.");
      return { ok: true as const, members: result.body.filter(isRecord).map((user) => normalizeGitHubUser(user as GitHubUser)) };
    },

    async listBlocks(input: unknown) {
      const payload = validateListOrgBlocksInput(input);
      const result = await read(client, `/orgs/${enc(payload.org)}/blocks${pageQuery(payload)}`, "orgs.blocks.list", "GitHub blocked users were not found.");
      if (!result.ok) return result;
      if (!Array.isArray(result.body)) return upstream("GitHub rejected the orgs.blocks.list request.");
      return { ok: true as const, users: result.body.filter(isRecord).map((user) => normalizeGitHubUser(user as GitHubUser)) };
    },
  };
}

async function check(client: GitHubClient, path: string, operation: string) {
  const response = await client.fetchJSON(path);
  const limited = rate(response.status, response.headers);
  if (limited) return limited;
  // 204 is yes. 404 is no. Neither is CONNECTOR_UPSTREAM_ERROR.
  if (response.status === 204) return { ok: true as const, yes: true as const };
  if (response.status === 404) return { ok: true as const, yes: false as const };
  return upstream(`GitHub rejected the ${operation} request.`);
}

async function read(client: GitHubClient, path: string, operation: string, missing: string) {
  const response = await client.fetchJSON(path);
  const limited = rate(response.status, response.headers);
  if (limited) return limited;
  if (response.status === 404) return upstream(missing);
  if (response.status === 200) return { ok: true as const, body: response.body };
  return upstream(`GitHub rejected the ${operation} request.`);
}

function rate(status: number, headers: Record<string, string>) {
  const parsed = parseGitHubRateLimit(status, headers);
  if (!parsed.limited) return null;
  return {
    ok: false as const,
    error: {
      code: "CONNECTOR_RATE_LIMITED" as const,
      message: "GitHub rate limit exceeded.",
      retryAfterSeconds: parsed.retryAfterSeconds,
    },
  };
}

function upstream(message: string) {
  return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message } };
}

function orgUser(input: unknown, operation: string): OrgUser {
  if (!isRecord(input)) throw new Error(`${operation} input must be an object`);
  return { org: segment(input.org, "org"), username: segment(input.username, "username") };
}

function orgPage(input: unknown, operation: string): OrgPage {
  if (!isRecord(input)) throw new Error(`${operation} input must be an object`);
  return { org: segment(input.org, "org"), ...page(input) };
}

function page(input: Record<string, unknown>): Page {
  return {
    perPage: optionalPage(input.perPage, "perPage"),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

function pageQuery(payload: Page): string {
  const params = new URLSearchParams();
  if (payload.perPage) params.set("per_page", String(payload.perPage));
  if (payload.page) params.set("page", String(payload.page));
  return qs(params);
}

function qs(params: URLSearchParams): string {
  const text = params.toString();
  return text ? `?${text}` : "";
}

function enc(value: string): string {
  return encodeURIComponent(value);
}

function segment(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  if (value.includes("/") || value.includes("?") || value.includes("#")) {
    throw new Error(`${field} must be a single path segment`);
  }
  return value;
}

function positiveInt(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function optionalNonNegative(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be an integer greater than or equal to 0`);
  }
  return value;
}

function optionalPage(value: unknown, field: string, max = 100): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${field} must be an integer between 1 and ${max}`);
  }
  return value;
}

function optionalFilter(value: unknown): "2fa_disabled" | "2fa_insecure" | "all" | undefined {
  if (value === undefined) return undefined;
  if (value !== "2fa_disabled" && value !== "2fa_insecure" && value !== "all") {
    throw new Error("filter must be 2fa_disabled, 2fa_insecure, or all");
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
