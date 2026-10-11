import { createGitHubClient, type GitHubClient } from "./http";
import { connection, gqlRequest, isRecord, recordAt, type GraphqlError } from "./graphql";

// FIX-G12C: the 12 G12 GraphQL ops that main shipped as declarative request blocks
// (issueCount / __typename / { id } / clientMutationId selections, HTTP 200 = success)
// now run through src/graphql.ts gqlRequest: errors[] on 200 → CONNECTOR_UPSTREAM_ERROR,
// RATE_LIMITED → CONNECTOR_RATE_LIMITED, a missing per-op scope → CONNECTOR_CAPABILITY_MISSING,
// X-Github-Next-Global-ID: 1 on POST /graphql only. Op ids are main's. Mutations are
// never retried. Per-op scopes live in G12C_REQUIRED_SCOPES (and the manifest's
// requiredScopes); manifest.auth.scopes is unchanged.

export const G12C_REQUIRED_SCOPES: Record<string, readonly string[]> = {
  "graphql.search": [],
  "graphql.sponsorables.list": [],
  "graphql.enterprise.member_invitation.get": ["read:enterprise"],
  "graphql.enterprise.admin_invitation.get": ["read:enterprise"],
  "graphql.organizations.follow": ["user"],
  "graphql.organizations.unfollow": ["user"],
  "graphql.user_status.update": ["user"],
  "graphql.interaction_limits.set_user": ["user"],
  "graphql.user_lists.create": ["user"],
  "graphql.user_lists.update": ["user"],
  "graphql.user_lists.delete": ["user"],
  "graphql.user_lists.items.update": ["user"],
};

export const SEARCH_TYPES = [
  "DISCUSSION",
  "ISSUE",
  "ISSUE_ADVANCED",
  "ISSUE_HYBRID",
  "ISSUE_SEMANTIC",
  "REPOSITORY",
  "USER",
] as const;
export const DEPENDENCY_GRAPH_ECOSYSTEMS = [
  "ACTIONS",
  "COMPOSER",
  "GO",
  "MAVEN",
  "NPM",
  "NUGET",
  "PIP",
  "PUB",
  "RUBYGEMS",
  "RUST",
  "SWIFT",
] as const;
export const ENTERPRISE_ADMIN_ROLES = ["BILLING_MANAGER", "OWNER", "UNAFFILIATED"] as const;
export const INTERACTION_LIMITS = [
  "COLLABORATORS_ONLY",
  "CONTRIBUTORS_ONLY",
  "EXISTING_USERS",
  "NO_LIMIT",
] as const;
export const INTERACTION_LIMIT_EXPIRIES = [
  "ONE_DAY",
  "THREE_DAYS",
  "ONE_WEEK",
  "ONE_MONTH",
  "SIX_MONTHS",
] as const;

const PAGE_INFO = "pageInfo { hasNextPage endCursor hasPreviousPage startCursor }";

// Fields that share a response key across fragments must have identical types under strict
// GraphQL validation (OverlappingFieldsCanBeMerged): name is String! on Repository/App/
// MarketplaceListing but String on User/Organization, and state is IssueState! vs
// PullRequestState!. Those are aliased per fragment and folded back by normalizeSearchNode,
// so the normalized output keeps name/state.
const SEARCH_NODE_FIELDS = `
  __typename
  ... on Repository { id name nameWithOwner url description isPrivate stargazerCount }
  ... on Issue { id number title url issueState: state createdAt repository { nameWithOwner } }
  ... on PullRequest { id number title url pullRequestState: state createdAt repository { nameWithOwner } }
  ... on Discussion { id number title url createdAt repository { nameWithOwner } }
  ... on User { id login profileName: name url }
  ... on Organization { id login profileName: name url }
  ... on App { id slug name url }
  ... on MarketplaceListing { id slug name }
`;

const SEARCH_ALIASES: Record<string, string> = { issueState: "state", pullRequestState: "state", profileName: "name" };

export function normalizeSearchNode(node: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) out[SEARCH_ALIASES[key] ?? key] = value;
  return out;
}

const SPONSORABLE_FIELDS = `
  __typename
  ... on User { id login name url hasSponsorsListing viewerCanSponsor viewerIsSponsoring }
  ... on Organization { id login name url hasSponsorsListing viewerCanSponsor viewerIsSponsoring }
`;

const INVITATION_FIELDS = `
  id
  createdAt
  email
  enterprise { id slug name }
  invitee { id login }
  inviter { id login }
`;

const ORG_FOLLOW_FIELDS = "organization { id login viewerIsFollowing }";

const STATUS_FIELDS = `
  status {
    emoji
    message
    expiresAt
    indicatesLimitedAvailability
    organization { id }
  }
`;

const USER_LIST_FIELDS = `
  id
  name
  slug
  description
  isPrivate
  createdAt
  updatedAt
  lastAddedAt
`;

type Ok<T> = { ok: true } & T;
type Result<T> = Ok<T> | GraphqlError;

export type SearchInput = { query: string; type: (typeof SEARCH_TYPES)[number]; first: number; after?: string };
export type SponsorablesInput = {
  first: number;
  after?: string;
  orderDirection?: "ASC" | "DESC";
  onlyDependencies?: boolean;
  orgLoginForDependencies?: string;
  ecosystem?: (typeof DEPENDENCY_GRAPH_ECOSYSTEMS)[number];
};
export type UserStatusInput = {
  message: string;
  emoji?: string;
  expiresAt?: string;
  limitedAvailability?: boolean;
  organizationId?: string;
};

function objectInput(input: unknown, op: string): Record<string, unknown> {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) throw new Error(`${op} input must be an object`);
  return input;
}

export function validateSearchGraphqlInput(input: unknown): SearchInput {
  const raw = objectInput(input, "graphql.search");
  const out: SearchInput = {
    query: requireString(raw.query, "query"),
    type: requireEnum(raw.type, "type", SEARCH_TYPES),
    first: raw.first === undefined ? 10 : requireInt(raw.first, "first", 1, 100),
  };
  if (raw.after !== undefined) out.after = requireString(raw.after, "after");
  return out;
}

export function validateListGraphqlSponsorablesInput(input: unknown): SponsorablesInput {
  const raw = objectInput(input, "graphql.sponsorables.list");
  const out: SponsorablesInput = {
    first: raw.first === undefined ? 10 : requireInt(raw.first, "first", 1, 100),
  };
  if (raw.after !== undefined) out.after = requireString(raw.after, "after");
  if (raw.orderDirection !== undefined) out.orderDirection = requireEnum(raw.orderDirection, "orderDirection", ["ASC", "DESC"] as const);
  if (raw.onlyDependencies !== undefined) out.onlyDependencies = requireBoolean(raw.onlyDependencies, "onlyDependencies");
  if (raw.orgLoginForDependencies !== undefined) {
    out.orgLoginForDependencies = requireString(raw.orgLoginForDependencies, "orgLoginForDependencies");
  }
  if (raw.ecosystem !== undefined) out.ecosystem = requireEnum(raw.ecosystem, "ecosystem", DEPENDENCY_GRAPH_ECOSYSTEMS);
  return out;
}

export function validateGetEnterpriseMemberInvitationInput(input: unknown): { enterpriseSlug: string; userLogin: string } {
  const raw = objectInput(input, "graphql.enterprise.member_invitation.get");
  return {
    enterpriseSlug: requireString(raw.enterpriseSlug, "enterpriseSlug"),
    userLogin: requireString(raw.userLogin, "userLogin"),
  };
}

export function validateGetEnterpriseAdminInvitationInput(input: unknown): {
  enterpriseSlug: string;
  role: (typeof ENTERPRISE_ADMIN_ROLES)[number];
  userLogin: string;
} {
  const raw = objectInput(input, "graphql.enterprise.admin_invitation.get");
  return {
    enterpriseSlug: requireString(raw.enterpriseSlug, "enterpriseSlug"),
    role: requireEnum(raw.role, "role", ENTERPRISE_ADMIN_ROLES),
    userLogin: requireString(raw.userLogin, "userLogin"),
  };
}

export function validateFollowOrganizationInput(input: unknown): { organizationId: string } {
  const raw = objectInput(input, "graphql.organizations.follow");
  return { organizationId: requireString(raw.organizationId, "organizationId") };
}

export function validateUnfollowOrganizationInput(input: unknown): { organizationId: string } {
  const raw = objectInput(input, "graphql.organizations.unfollow");
  return { organizationId: requireString(raw.organizationId, "organizationId") };
}

export function validateUpdateUserStatusInput(input: unknown): UserStatusInput {
  const raw = objectInput(input, "graphql.user_status.update");
  const out: UserStatusInput = { message: requireString(raw.message, "message") };
  if (raw.emoji !== undefined) out.emoji = requireString(raw.emoji, "emoji");
  if (raw.expiresAt !== undefined) out.expiresAt = requireDateTime(raw.expiresAt, "expiresAt");
  if (raw.limitedAvailability !== undefined) {
    out.limitedAvailability = requireBoolean(raw.limitedAvailability, "limitedAvailability");
  }
  if (raw.organizationId !== undefined) out.organizationId = requireString(raw.organizationId, "organizationId");
  return out;
}

export function validateSetUserInteractionLimitInput(input: unknown): {
  userId: string;
  limit: (typeof INTERACTION_LIMITS)[number];
  expiry?: (typeof INTERACTION_LIMIT_EXPIRIES)[number];
} {
  const raw = objectInput(input, "graphql.interaction_limits.set_user");
  return {
    userId: requireString(raw.userId, "userId"),
    limit: requireEnum(raw.limit, "limit", INTERACTION_LIMITS),
    ...(raw.expiry !== undefined ? { expiry: requireEnum(raw.expiry, "expiry", INTERACTION_LIMIT_EXPIRIES) } : {}),
  };
}

export function validateCreateUserListInput(input: unknown): { name: string; description?: string; isPrivate?: boolean } {
  const raw = objectInput(input, "graphql.user_lists.create");
  return {
    name: requireString(raw.name, "name"),
    ...(raw.description !== undefined ? { description: requireText(raw.description, "description") } : {}),
    ...(raw.isPrivate !== undefined ? { isPrivate: requireBoolean(raw.isPrivate, "isPrivate") } : {}),
  };
}

export function validateUpdateUserListInput(input: unknown): {
  listId: string;
  name?: string;
  description?: string;
  isPrivate?: boolean;
} {
  const raw = objectInput(input, "graphql.user_lists.update");
  const out = {
    listId: requireString(raw.listId, "listId"),
    ...(raw.name !== undefined ? { name: requireString(raw.name, "name") } : {}),
    ...(raw.description !== undefined ? { description: requireText(raw.description, "description") } : {}),
    ...(raw.isPrivate !== undefined ? { isPrivate: requireBoolean(raw.isPrivate, "isPrivate") } : {}),
  };
  if (out.name === undefined && out.description === undefined && out.isPrivate === undefined) {
    throw new Error("graphql.user_lists.update needs at least one of name, description, isPrivate");
  }
  return out;
}

export function validateDeleteUserListInput(input: unknown): { listId: string } {
  const raw = objectInput(input, "graphql.user_lists.delete");
  return { listId: requireString(raw.listId, "listId") };
}

export function validateUpdateUserListsForItemInput(input: unknown): {
  itemId: string;
  listIds: string[];
  suggestedListIds?: string[];
} {
  const raw = objectInput(input, "graphql.user_lists.items.update");
  return {
    itemId: requireString(raw.itemId, "itemId"),
    listIds: requireIdList(raw.listIds, "listIds"),
    ...(raw.suggestedListIds !== undefined ? { suggestedListIds: requireIdList(raw.suggestedListIds, "suggestedListIds") } : {}),
  };
}

export function createGapG12cClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const clientFor = (operation: string) =>
    options.githubClient ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation });
  const run = (
    operation: string,
    document: string,
    variables: Record<string, unknown>,
    allowNotFound = false,
  ) =>
    gqlRequest(clientFor(operation), document, variables, {
      allowNotFound,
      requiredScopes: G12C_REQUIRED_SCOPES[operation] ?? [],
      operation,
    });


  return {
    async search(input: unknown): Promise<Result<{
      items: Record<string, unknown>[];
      pageInfo: ReturnType<typeof connection>["pageInfo"];
      counts: Record<string, number>;
    }>> {
      const p = validateSearchGraphqlInput(input);
      const result = await run(
        "graphql.search",
        `query Search($query: String!, $type: SearchType!, $first: Int!, $after: String) {
          search(query: $query, type: $type, first: $first, after: $after) {
            issueCount repositoryCount userCount discussionCount
            ${PAGE_INFO}
            nodes { ${SEARCH_NODE_FIELDS} }
          }
        }`,
        { query: p.query, type: p.type, first: p.first, after: p.after ?? null },
      );
      if (!result.ok) return result;
      const raw = recordAt(result.data, "search");
      if (!raw) return upstream("GitHub returned no search connection.");
      const conn = connection(raw, normalizeSearchNode);
      const counts: Record<string, number> = {};
      for (const key of ["issueCount", "repositoryCount", "userCount", "discussionCount"]) {
        if (typeof raw[key] === "number") counts[key] = raw[key] as number;
      }
      return { ok: true, items: conn.items, pageInfo: conn.pageInfo, counts };
    },

    async listSponsorables(input: unknown): Promise<Result<{
      items: Record<string, unknown>[];
      pageInfo: ReturnType<typeof connection>["pageInfo"];
      totalCount?: number;
    }>> {
      const p = validateListGraphqlSponsorablesInput(input);
      const result = await run(
        "graphql.sponsorables.list",
        `query Sponsorables($first: Int!, $after: String, $orderBy: SponsorableOrder, $onlyDependencies: Boolean, $orgLoginForDependencies: String, $ecosystem: DependencyGraphEcosystem) {
          sponsorables(first: $first, after: $after, orderBy: $orderBy, onlyDependencies: $onlyDependencies, orgLoginForDependencies: $orgLoginForDependencies, ecosystem: $ecosystem) {
            totalCount
            ${PAGE_INFO}
            nodes { ${SPONSORABLE_FIELDS} }
          }
        }`,
        {
          first: p.first,
          after: p.after ?? null,
          orderBy: { field: "LOGIN", direction: p.orderDirection ?? "ASC" },
          onlyDependencies: p.onlyDependencies ?? false,
          orgLoginForDependencies: p.orgLoginForDependencies ?? null,
          ecosystem: p.ecosystem ?? null,
        },
      );
      if (!result.ok) return result;
      const raw = recordAt(result.data, "sponsorables");
      if (!raw) return upstream("GitHub returned no sponsorables connection.");
      const conn = connection(raw, (node) => node);
      return { ok: true, ...conn };
    },

    async getMemberInvitation(input: unknown): Promise<Result<{ found: boolean; invitation: Record<string, unknown> | null }>> {
      const p = validateGetEnterpriseMemberInvitationInput(input);
      const result = await run(
        "graphql.enterprise.member_invitation.get",
        `query EnterpriseMemberInvitation($enterpriseSlug: String!, $userLogin: String!) {
          enterpriseMemberInvitation(enterpriseSlug: $enterpriseSlug, userLogin: $userLogin) { ${INVITATION_FIELDS} }
        }`,
        p,
        true,
      );
      if (!result.ok) return result;
      if ("notFound" in result && result.notFound) return { ok: true, found: false, invitation: null };
      const invitation = recordAt(result.data, "enterpriseMemberInvitation");
      return { ok: true, found: invitation !== null, invitation };
    },

    async getAdminInvitation(input: unknown): Promise<Result<{ found: boolean; invitation: Record<string, unknown> | null }>> {
      const p = validateGetEnterpriseAdminInvitationInput(input);
      const result = await run(
        "graphql.enterprise.admin_invitation.get",
        `query EnterpriseAdministratorInvitation($enterpriseSlug: String!, $role: EnterpriseAdministratorRole!, $userLogin: String!) {
          enterpriseAdministratorInvitation(enterpriseSlug: $enterpriseSlug, role: $role, userLogin: $userLogin) { ${INVITATION_FIELDS} role }
        }`,
        p,
        true,
      );
      if (!result.ok) return result;
      if ("notFound" in result && result.notFound) return { ok: true, found: false, invitation: null };
      const invitation = recordAt(result.data, "enterpriseAdministratorInvitation");
      return { ok: true, found: invitation !== null, invitation };
    },

    async followOrganization(input: unknown): Promise<Result<{ organization: Record<string, unknown> | null }>> {
      const p = validateFollowOrganizationInput(input);
      const result = await run(
        "graphql.organizations.follow",
        `mutation FollowOrganization($input: FollowOrganizationInput!) {
          followOrganization(input: $input) { ${ORG_FOLLOW_FIELDS} }
        }`,
        { input: { organizationId: p.organizationId } },
      );
      if (!result.ok) return result;
      const payload = recordAt(result.data, "followOrganization");
      if (!payload) return upstream("GitHub returned no followOrganization payload.");
      return { ok: true, organization: recordAt(payload, "organization") };
    },

    async unfollowOrganization(input: unknown): Promise<Result<{ organization: Record<string, unknown> | null }>> {
      const p = validateUnfollowOrganizationInput(input);
      const result = await run(
        "graphql.organizations.unfollow",
        `mutation UnfollowOrganization($input: UnfollowOrganizationInput!) {
          unfollowOrganization(input: $input) { ${ORG_FOLLOW_FIELDS} }
        }`,
        { input: { organizationId: p.organizationId } },
      );
      if (!result.ok) return result;
      const payload = recordAt(result.data, "unfollowOrganization");
      if (!payload) return upstream("GitHub returned no unfollowOrganization payload.");
      return { ok: true, organization: recordAt(payload, "organization") };
    },

    async updateUserStatus(input: unknown): Promise<Result<{ status: Record<string, unknown> | null }>> {
      const p = validateUpdateUserStatusInput(input);
      const result = await run(
        "graphql.user_status.update",
        `mutation ChangeUserStatus($input: ChangeUserStatusInput!) {
          changeUserStatus(input: $input) { ${STATUS_FIELDS} }
        }`,
        { input: { ...p } },
      );
      if (!result.ok) return result;
      const payload = recordAt(result.data, "changeUserStatus");
      if (!payload) return upstream("GitHub returned no changeUserStatus payload.");
      return { ok: true, status: recordAt(payload, "status") };
    },

    async setUserInteractionLimit(input: unknown): Promise<Result<{
      user: Record<string, unknown> | null;
      limit: Record<string, unknown> | null;
    }>> {
      const p = validateSetUserInteractionLimitInput(input);
      const result = await run(
        "graphql.interaction_limits.set_user",
        `mutation SetUserInteractionLimit($input: SetUserInteractionLimitInput!) {
          setUserInteractionLimit(input: $input) {
            user { id login interactionAbility { limit expiresAt origin } }
          }
        }`,
        { input: { ...p } },
      );
      if (!result.ok) return result;
      const payload = recordAt(result.data, "setUserInteractionLimit");
      if (!payload) return upstream("GitHub returned no setUserInteractionLimit payload.");
      const user = recordAt(payload, "user");
      return { ok: true, user, limit: recordAt(user, "interactionAbility") };
    },

    async createUserList(input: unknown): Promise<Result<{ list: Record<string, unknown> }>> {
      const p = validateCreateUserListInput(input);
      const result = await run(
        "graphql.user_lists.create",
        `mutation CreateUserList($input: CreateUserListInput!) {
          createUserList(input: $input) { list { ${USER_LIST_FIELDS} } }
        }`,
        { input: { ...p } },
      );
      if (!result.ok) return result;
      const payload = recordAt(result.data, "createUserList");
      if (!payload) return upstream("GitHub returned no createUserList payload.");
      const list = recordAt(payload, "list");
      if (!list) return upstream("GitHub did not return the created list.");
      return { ok: true, list };
    },

    async updateUserList(input: unknown): Promise<Result<{ list: Record<string, unknown> }>> {
      const p = validateUpdateUserListInput(input);
      const result = await run(
        "graphql.user_lists.update",
        `mutation UpdateUserList($input: UpdateUserListInput!) {
          updateUserList(input: $input) { list { ${USER_LIST_FIELDS} } }
        }`,
        { input: { ...p } },
      );
      if (!result.ok) return result;
      const payload = recordAt(result.data, "updateUserList");
      if (!payload) return upstream("GitHub returned no updateUserList payload.");
      const list = recordAt(payload, "list");
      if (!list) return upstream("GitHub did not return the updated list.");
      return { ok: true, list };
    },

    async deleteUserList(input: unknown): Promise<Result<{ deleted: true; listId: string; user: Record<string, unknown> | null }>> {
      const p = validateDeleteUserListInput(input);
      const result = await run(
        "graphql.user_lists.delete",
        `mutation DeleteUserList($input: DeleteUserListInput!) {
          deleteUserList(input: $input) { user { id login } }
        }`,
        { input: { listId: p.listId } },
      );
      if (!result.ok) return result;
      const payload = recordAt(result.data, "deleteUserList");
      if (!payload) return upstream("GitHub returned no deleteUserList payload.");
      return { ok: true, deleted: true, listId: p.listId, user: recordAt(payload, "user") };
    },

    async updateUserListsForItem(input: unknown): Promise<Result<{
      lists: Record<string, unknown>[];
      item: Record<string, unknown> | null;
    }>> {
      const p = validateUpdateUserListsForItemInput(input);
      const result = await run(
        "graphql.user_lists.items.update",
        `mutation UpdateUserListsForItem($input: UpdateUserListsForItemInput!) {
          updateUserListsForItem(input: $input) {
            lists { ${USER_LIST_FIELDS} }
            item { __typename ... on Repository { id nameWithOwner url } }
          }
        }`,
        { input: { ...p } },
      );
      if (!result.ok) return result;
      const payload = recordAt(result.data, "updateUserListsForItem");
      if (!payload) return upstream("GitHub returned no updateUserListsForItem payload.");
      const lists = Array.isArray(payload.lists) ? payload.lists.filter(isRecord) : [];
      return { ok: true, lists, item: recordAt(payload, "item") };
    },
  };
}

function upstream(message: string): GraphqlError {
  return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message, retryAfterSeconds: undefined } };
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${name} must be a non-empty string`);
  return value.trim();
}

function requireText(value: unknown, name: string): string {
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
  return value;
}

function requireBoolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${name} must be a boolean`);
  return value;
}

function requireInt(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function requireEnum<T extends string>(value: unknown, name: string, allowed: readonly T[]): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new Error(`${name} must be one of ${allowed.join(", ")}`);
  }
  return value as T;
}

function requireDateTime(value: unknown, name: string): string {
  const text = requireString(value, name);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(text) || Number.isNaN(Date.parse(text))) {
    throw new Error(`${name} must be an ISO 8601 date-time with a zone`);
  }
  return text;
}

function requireIdList(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error(`${name} must be an array of at most 100 node ids`);
  return value.map((item, index) => {
    if (typeof item !== "string" || item.trim().length === 0) throw new Error(`${name}[${index}] must be a non-empty string`);
    return item.trim();
  });
}
