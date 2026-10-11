import { createGitHubClient, type GitHubClient } from "./http";
import { gqlRequest, isRecord, recordAt, type GraphqlError } from "./graphql";

// FIX-G13C: the 10 G13 GraphQL ops that main shipped as declarative request blocks
// (clientMutationId selections, HTTP 200 = success, graphql.query accepting mutations)
// now run through src/graphql.ts gqlRequest, as FIX-G12C: errors[] on 200 →
// CONNECTOR_UPSTREAM_ERROR, RATE_LIMITED → CONNECTOR_RATE_LIMITED, a missing per-op scope →
// CONNECTOR_CAPABILITY_MISSING (meta-ads shape), X-Github-Next-Global-ID on POST /graphql only.
// No op is ever retried (sponsorships.create moves money). auth.scopes is unchanged.

export const G13C_REQUIRED_SCOPES: Record<string, readonly string[]> = {
  "graphql.sponsorships.create": ["user"],
  "graphql.sponsorships.cancel": ["user"],
  "graphql.sponsors.tiers.create": ["user"],
  "graphql.sponsors.tiers.publish": ["user"],
  "graphql.sponsors.tiers.retire": ["user"],
  "graphql.projects_v2.create": ["project"],
  "graphql.projects_v2.item_field.clear": ["project"],
  "graphql.migrations.abort": ["repo", "admin:org", "workflow"],
  "graphql.subscriptions.update": [],
  "graphql.query": [],
};

export const SPONSORSHIP_MAX_USD = 12000;
export const SPONSORSHIP_PRIVACY = ["PUBLIC", "PRIVATE"] as const;
export const SUBSCRIPTION_STATES = ["IGNORED", "SUBSCRIBED", "UNSUBSCRIBED"] as const;

const TIER_FIELDS = "id name description monthlyPriceInDollars isOneTime isCustomAmount createdAt updatedAt";
const LOGIN_OF = "__typename ... on User { id login } ... on Organization { id login }";
const SPONSORSHIP_FIELDS = `
  id
  createdAt
  isActive
  isOneTimePayment
  privacyLevel
  tierSelectedAt
  tier { ${TIER_FIELDS} }
  sponsorable { ${LOGIN_OF} }
  sponsorEntity { ${LOGIN_OF} }
`;

type Ok<T> = { ok: true } & T;
type Result<T> = Ok<T> | GraphqlError;

export type CreateSponsorshipInput = {
  sponsorableLogin: string;
  amount?: number;
  tierId?: string;
  isRecurring?: boolean;
  sponsorLogin?: string;
  privacyLevel?: (typeof SPONSORSHIP_PRIVACY)[number];
  receiveEmails?: boolean;
};

function objectInput(input: unknown, op: string): Record<string, unknown> {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) throw new Error(`${op} input must be an object`);
  return input;
}

export function validateCreateSponsorshipInput(input: unknown): CreateSponsorshipInput {
  const raw = objectInput(input, "graphql.sponsorships.create");
  const out: CreateSponsorshipInput = { sponsorableLogin: requireString(raw.sponsorableLogin, "sponsorableLogin") };
  const hasAmount = raw.amount !== undefined;
  const hasTier = raw.tierId !== undefined;
  // Never infer the amount: exactly one of amount (whole USD) or tierId.
  if (hasAmount === hasTier) throw new Error("graphql.sponsorships.create needs exactly one of amount or tierId");
  if (hasTier) {
    out.tierId = requireString(raw.tierId, "tierId");
    if (raw.isRecurring !== undefined) {
      throw new Error("isRecurring is set by the tier; omit it when tierId is given");
    }
  } else {
    out.amount = requireInt(raw.amount, "amount", 1, SPONSORSHIP_MAX_USD);
    if (raw.isRecurring === undefined) throw new Error("isRecurring is required when amount is given without tierId");
    out.isRecurring = requireBoolean(raw.isRecurring, "isRecurring");
  }
  if (raw.sponsorLogin !== undefined) out.sponsorLogin = requireString(raw.sponsorLogin, "sponsorLogin");
  if (raw.privacyLevel !== undefined) out.privacyLevel = requireEnum(raw.privacyLevel, "privacyLevel", SPONSORSHIP_PRIVACY);
  if (raw.receiveEmails !== undefined) out.receiveEmails = requireBoolean(raw.receiveEmails, "receiveEmails");
  return out;
}

export function validateCancelSponsorshipInput(input: unknown): { sponsorLogin: string; sponsorableLogin: string } {
  const raw = objectInput(input, "graphql.sponsorships.cancel");
  return {
    sponsorLogin: requireString(raw.sponsorLogin, "sponsorLogin"),
    sponsorableLogin: requireString(raw.sponsorableLogin, "sponsorableLogin"),
  };
}

export function validateCreateSponsorsTierInput(input: unknown): {
  amount: number;
  description: string;
  isRecurring?: boolean;
  publish?: boolean;
  sponsorableLogin?: string;
  repositoryOwnerLogin?: string;
  repositoryName?: string;
  welcomeMessage?: string;
} {
  const raw = objectInput(input, "graphql.sponsors.tiers.create");
  const out = {
    amount: requireInt(raw.amount, "amount", 1, SPONSORSHIP_MAX_USD),
    description: requireString(raw.description, "description"),
    ...(raw.isRecurring !== undefined ? { isRecurring: requireBoolean(raw.isRecurring, "isRecurring") } : {}),
    ...(raw.publish !== undefined ? { publish: requireBoolean(raw.publish, "publish") } : {}),
    ...(raw.sponsorableLogin !== undefined ? { sponsorableLogin: requireString(raw.sponsorableLogin, "sponsorableLogin") } : {}),
    ...(raw.repositoryOwnerLogin !== undefined
      ? { repositoryOwnerLogin: requireString(raw.repositoryOwnerLogin, "repositoryOwnerLogin") }
      : {}),
    ...(raw.repositoryName !== undefined ? { repositoryName: requireString(raw.repositoryName, "repositoryName") } : {}),
    ...(raw.welcomeMessage !== undefined ? { welcomeMessage: requireText(raw.welcomeMessage, "welcomeMessage") } : {}),
  };
  if ((out.repositoryOwnerLogin === undefined) !== (out.repositoryName === undefined)) {
    throw new Error("repositoryOwnerLogin and repositoryName go together");
  }
  return out;
}

export function validatePublishSponsorsTierInput(input: unknown): { tierId: string } {
  const raw = objectInput(input, "graphql.sponsors.tiers.publish");
  return { tierId: requireString(raw.tierId, "tierId") };
}

export function validateRetireSponsorsTierInput(input: unknown): { tierId: string } {
  const raw = objectInput(input, "graphql.sponsors.tiers.retire");
  return { tierId: requireString(raw.tierId, "tierId") };
}

export function validateCreateProjectV2Input(input: unknown): {
  ownerId: string;
  title: string;
  repositoryId?: string;
  teamId?: string;
} {
  const raw = objectInput(input, "graphql.projects_v2.create");
  return {
    ownerId: requireString(raw.ownerId, "ownerId"),
    title: requireString(raw.title, "title"),
    ...(raw.repositoryId !== undefined ? { repositoryId: requireString(raw.repositoryId, "repositoryId") } : {}),
    ...(raw.teamId !== undefined ? { teamId: requireString(raw.teamId, "teamId") } : {}),
  };
}

export function validateClearProjectV2ItemFieldInput(input: unknown): { projectId: string; itemId: string; fieldId: string } {
  const raw = objectInput(input, "graphql.projects_v2.item_field.clear");
  return {
    projectId: requireString(raw.projectId, "projectId"),
    itemId: requireString(raw.itemId, "itemId"),
    fieldId: requireString(raw.fieldId, "fieldId"),
  };
}

export function validateAbortRepositoryMigrationInput(input: unknown): { migrationId: string } {
  const raw = objectInput(input, "graphql.migrations.abort");
  return { migrationId: requireString(raw.migrationId, "migrationId") };
}

/** Team node ids: new format "T_…", legacy base64 "04:Team<n>". Team subscriptions were removed 2026-07-01. */
export function isTeamNodeId(id: string): boolean {
  if (/^T_/.test(id)) return true;
  if (!/^[A-Za-z0-9+/]+=*$/.test(id)) return false;
  try {
    return /^\d+:Team\d+$/.test(atob(id));
  } catch {
    return false;
  }
}

export function validateUpdateSubscriptionInput(input: unknown): {
  subscribableId: string;
  state: (typeof SUBSCRIPTION_STATES)[number];
} {
  const raw = objectInput(input, "graphql.subscriptions.update");
  const subscribableId = requireString(raw.subscribableId, "subscribableId");
  if (isTeamNodeId(subscribableId)) {
    throw new Error("Team subscriptions were removed by GitHub on 2026-07-01; subscribableId must not be a Team");
  }
  return { subscribableId, state: requireEnum(raw.state, "state", SUBSCRIPTION_STATES) };
}

export type GraphqlQueryBody = { query: string; variables?: Record<string, unknown>; operationName?: string };

export function validateRunGraphqlQueryInput(input: unknown): GraphqlQueryBody {
  const raw = objectInput(input, "graphql.query");
  if (!isRecord(raw.body)) throw new Error("body must be an object with query and optional variables");
  const body = raw.body;
  for (const key of Object.keys(body)) {
    if (key !== "query" && key !== "variables" && key !== "operationName") {
      throw new Error(`body.${key} is not allowed (query, variables, operationName)`);
    }
  }
  const query = requireString(body.query, "body.query");
  const kinds = graphqlOperationKinds(query);
  if (kinds.length === 0) throw new Error("body.query must contain a query operation");
  const forbidden = kinds.filter((kind) => kind !== "query");
  if (forbidden.length > 0) {
    throw new Error(`graphql.query is read only: ${[...new Set(forbidden)].join(", ")} operations are rejected`);
  }
  const out: GraphqlQueryBody = { query };
  if (body.variables !== undefined) {
    if (!isRecord(body.variables)) throw new Error("body.variables must be an object");
    out.variables = body.variables;
  }
  if (body.operationName !== undefined) out.operationName = requireString(body.operationName, "body.operationName");
  return out;
}

/**
 * Operation types of every executable definition in a GraphQL document
 * ("query" for the anonymous shorthand). Fragments are skipped. Strings, block
 * strings and comments are lexed out so keywords inside them never count.
 * Throws on unbalanced braces, unterminated strings, non-executable definitions and any
 * string or block string outside parentheses/braces (descriptions are not executable).
 */
export function graphqlOperationKinds(document: string): string[] {
  const kinds: string[] = [];
  let i = 0;
  let depth = 0;
  let parens = 0;
  let expectDefinition = true;
  const n = document.length;
  while (i < n) {
    const ch = document[i]!;
    if (ch === "#") {
      while (i < n && document[i] !== "\n" && document[i] !== "\r") i += 1;
      continue;
    }
    if (ch === '"') {
      // Descriptions are not valid in executable documents, and a top-level string would
      // otherwise hide the next definition keyword from this lexer: reject it outright.
      if (depth === 0 && parens === 0) {
        throw new Error("body.query has a top-level string or block string; descriptions are not allowed in executable documents");
      }
      if (document.startsWith('"""', i)) {
        i += 3;
        let closed = false;
        while (i < n) {
          if (document.startsWith('\\"""', i)) {
            i += 4;
            continue;
          }
          if (document.startsWith('"""', i)) {
            i += 3;
            closed = true;
            break;
          }
          i += 1;
        }
        if (!closed) throw new Error("body.query has an unterminated block string");
      } else {
        i += 1;
        let closed = false;
        while (i < n) {
          const c = document[i]!;
          if (c === "\\") {
            i += 2;
            continue;
          }
          if (c === "\n" || c === "\r") break;
          i += 1;
          if (c === '"') {
            closed = true;
            break;
          }
        }
        if (!closed) throw new Error("body.query has an unterminated string");
      }
      continue;
    }
    if (ch === "{") {
      if (depth === 0 && parens === 0 && expectDefinition) kinds.push("query");
      depth += 1;
      expectDefinition = false;
      i += 1;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      if (depth < 0) throw new Error("body.query has unbalanced braces");
      if (depth === 0) expectDefinition = true;
      i += 1;
      continue;
    }
    if (ch === "(") {
      parens += 1;
      i += 1;
      continue;
    }
    if (ch === ")") {
      parens -= 1;
      if (parens < 0) throw new Error("body.query has unbalanced parentheses");
      i += 1;
      continue;
    }
    if (/[_A-Za-z]/.test(ch)) {
      let j = i + 1;
      while (j < n && /[_0-9A-Za-z]/.test(document[j]!)) j += 1;
      const name = document.slice(i, j);
      if (depth === 0 && parens === 0 && expectDefinition) {
        if (name === "query" || name === "mutation" || name === "subscription") kinds.push(name);
        else if (name !== "fragment") throw new Error(`body.query has a non-executable definition: ${name}`);
        expectDefinition = false;
      }
      i = j;
      continue;
    }
    i += 1;
  }
  if (depth !== 0) throw new Error("body.query has unbalanced braces");
  if (parens !== 0) throw new Error("body.query has unbalanced parentheses");
  return kinds;
}

export function createGapG13cClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const clientFor = (operation: string) =>
    options.githubClient ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation });
  const run = (operation: string, document: string, variables: Record<string, unknown>) =>
    gqlRequest(clientFor(operation), document, variables, {
      requiredScopes: G13C_REQUIRED_SCOPES[operation] ?? [],
      operation,
    });
  const mutate = async (operation: string, inputType: string, root: string, selection: string, input: Record<string, unknown>) => {
    const result = await run(
      operation,
      `mutation ${root[0]!.toUpperCase()}${root.slice(1)}($input: ${inputType}!) { ${root}(input: $input) { ${selection} } }`,
      { input },
    );
    if (!result.ok) return result;
    const payload = recordAt(result.data, root);
    if (!payload) return upstream(`GitHub returned no ${root} payload.`);
    return { ok: true as const, payload };
  };

  return {
    async createSponsorship(input: unknown): Promise<Result<{ sponsorship: Record<string, unknown> }>> {
      const p = validateCreateSponsorshipInput(input);
      const r = await mutate("graphql.sponsorships.create", "CreateSponsorshipInput", "createSponsorship", `sponsorship { ${SPONSORSHIP_FIELDS} }`, { ...p });
      if (!r.ok) return r;
      const sponsorship = recordAt(r.payload, "sponsorship");
      if (!sponsorship) return upstream("GitHub did not return the sponsorship.");
      return { ok: true, sponsorship };
    },

    async cancelSponsorship(input: unknown): Promise<Result<{ cancelled: true; sponsorsTier: Record<string, unknown> | null }>> {
      const p = validateCancelSponsorshipInput(input);
      const r = await mutate("graphql.sponsorships.cancel", "CancelSponsorshipInput", "cancelSponsorship", `sponsorsTier { ${TIER_FIELDS} }`, { ...p });
      if (!r.ok) return r;
      return { ok: true, cancelled: true, sponsorsTier: recordAt(r.payload, "sponsorsTier") };
    },

    async createSponsorsTier(input: unknown): Promise<Result<{ tierId: string; tier: Record<string, unknown> }>> {
      const p = validateCreateSponsorsTierInput(input);
      const r = await mutate("graphql.sponsors.tiers.create", "CreateSponsorsTierInput", "createSponsorsTier", `sponsorsTier { ${TIER_FIELDS} }`, { ...p });
      if (!r.ok) return r;
      const tier = recordAt(r.payload, "sponsorsTier");
      if (!tier || typeof tier.id !== "string") return upstream("GitHub did not return the created tier.");
      return { ok: true, tierId: tier.id, tier };
    },

    async publishSponsorsTier(input: unknown): Promise<Result<{ tier: Record<string, unknown> | null }>> {
      const p = validatePublishSponsorsTierInput(input);
      const r = await mutate("graphql.sponsors.tiers.publish", "PublishSponsorsTierInput", "publishSponsorsTier", `sponsorsTier { ${TIER_FIELDS} }`, { ...p });
      if (!r.ok) return r;
      return { ok: true, tier: recordAt(r.payload, "sponsorsTier") };
    },

    async retireSponsorsTier(input: unknown): Promise<Result<{ tier: Record<string, unknown> | null }>> {
      const p = validateRetireSponsorsTierInput(input);
      const r = await mutate("graphql.sponsors.tiers.retire", "RetireSponsorsTierInput", "retireSponsorsTier", `sponsorsTier { ${TIER_FIELDS} }`, { ...p });
      if (!r.ok) return r;
      return { ok: true, tier: recordAt(r.payload, "sponsorsTier") };
    },

    async createProjectV2(input: unknown): Promise<Result<{ projectV2: Record<string, unknown> }>> {
      const p = validateCreateProjectV2Input(input);
      const r = await mutate("graphql.projects_v2.create", "CreateProjectV2Input", "createProjectV2", "projectV2 { id number url title }", { ...p });
      if (!r.ok) return r;
      const projectV2 = recordAt(r.payload, "projectV2");
      if (!projectV2) return upstream("GitHub did not return the created project.");
      return { ok: true, projectV2 };
    },

    async clearProjectV2ItemField(input: unknown): Promise<Result<{ item: Record<string, unknown> | null }>> {
      const p = validateClearProjectV2ItemFieldInput(input);
      const r = await mutate(
        "graphql.projects_v2.item_field.clear",
        "ClearProjectV2ItemFieldValueInput",
        "clearProjectV2ItemFieldValue",
        "projectV2Item { id type isArchived updatedAt }",
        { ...p },
      );
      if (!r.ok) return r;
      return { ok: true, item: recordAt(r.payload, "projectV2Item") };
    },

    async abortRepositoryMigration(input: unknown): Promise<Result<{ success: boolean }>> {
      const p = validateAbortRepositoryMigrationInput(input);
      const r = await mutate("graphql.migrations.abort", "AbortRepositoryMigrationInput", "abortRepositoryMigration", "success", { ...p });
      if (!r.ok) return r;
      return { ok: true, success: r.payload.success === true };
    },

    async updateSubscription(input: unknown): Promise<Result<{ subscribable: Record<string, unknown> | null }>> {
      const p = validateUpdateSubscriptionInput(input);
      const r = await mutate(
        "graphql.subscriptions.update",
        "UpdateSubscriptionInput",
        "updateSubscription",
        "subscribable { __typename ... on Node { id } viewerSubscription }",
        { ...p },
      );
      if (!r.ok) return r;
      const subscribable = recordAt(r.payload, "subscribable");
      if (subscribable?.__typename === "Team") return upstream("Team subscriptions were removed by GitHub on 2026-07-01.");
      return { ok: true, subscribable };
    },

    async runQuery(input: unknown): Promise<Result<{ data: Record<string, unknown> }>> {
      const p = validateRunGraphqlQueryInput(input);
      const result = await gqlRequest(clientFor("graphql.query"), p.query, p.variables ?? {}, {
        requiredScopes: [],
        operation: "graphql.query",
        ...(p.operationName !== undefined ? { operationName: p.operationName } : {}),
      });
      if (!result.ok) return result;
      return { ok: true, data: result.data };
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
