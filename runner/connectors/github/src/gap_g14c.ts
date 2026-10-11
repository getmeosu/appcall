import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";
import { connection, gqlRequest, isRecord, recordAt, restCapabilityMissing, type GraphqlError, type PageInfo } from "./graphql";
import { graphqlOperationKinds } from "./gap_g13c";

// FIX-G14C:
// - graphql.mutate: raw GraphQL mutation passthrough on gqlRequest. The document is lexed
//   before any HTTP call and only mutation operations are accepted. Scopes depend on the
//   document, so there is no requiredScopes: INSUFFICIENT_SCOPES (or a 403/404 scope-header
//   diff) maps to CONNECTOR_CAPABILITY_MISSING with the scopes GitHub names in the error.
//   Never retried; no effectPolicy.
// - rest.x.AUDIT / ORG_ROLE_CREATE / ORG_ROLE_UPDATE / ORG_ROLE_DELETE / ORG_FINE_PERMS:
//   GHEC plan-gated REST ops, moved off their declarative request blocks so a 403/404 whose
//   X-Accepted-OAuth-Scopes are not granted maps to CONNECTOR_CAPABILITY_MISSING (per-op
//   requiredScopes, never added to auth.scopes). Op keys, inputs and the { data } output are
//   unchanged. ORG_ROLE_DELETE has no effect keys (deletes omit).

export const G14C_REQUIRED_SCOPES: Record<string, readonly string[]> = {
  "rest.x.AUDIT": ["read:audit_log"],
  "rest.x.ORG_ROLE_CREATE": ["admin:org"],
  "rest.x.ORG_ROLE_UPDATE": ["admin:org"],
  "rest.x.ORG_ROLE_DELETE": ["admin:org"],
  "rest.x.ORG_FINE_PERMS": ["admin:org"],
};

type Ok<T> = { ok: true } & T;
type Result<T> = Ok<T> | GraphqlError;

export type GraphqlMutationBody = { query: string; variables?: Record<string, unknown>; operationName?: string };

export function validateRunGraphqlMutationInput(input: unknown): GraphqlMutationBody {
  const raw = objectInput(input, "graphql.mutate");
  if (!isRecord(raw.body)) throw new Error("body must be an object with query and optional variables");
  const body = raw.body;
  for (const key of Object.keys(body)) {
    if (key !== "query" && key !== "variables" && key !== "operationName") {
      throw new Error(`body.${key} is not allowed (query, variables, operationName)`);
    }
  }
  const query = requireString(body.query, "body.query");
  const kinds = graphqlOperationKinds(query);
  if (kinds.length === 0) throw new Error("body.query must contain a mutation operation");
  const forbidden = kinds.filter((kind) => kind !== "mutation");
  if (forbidden.length > 0) {
    throw new Error(
      `graphql.mutate runs mutations only: ${[...new Set(forbidden)].join(", ")} operations are rejected (use graphql.query for reads)`,
    );
  }
  const out: GraphqlMutationBody = { query };
  if (body.variables !== undefined) {
    if (!isRecord(body.variables)) throw new Error("body.variables must be an object");
    out.variables = body.variables;
  }
  if (body.operationName !== undefined) out.operationName = requireString(body.operationName, "body.operationName");
  return out;
}

export const COMMENT_EDIT_TYPES = ["IssueComment", "PullRequestReviewComment"] as const;

export type CommentEditsInput = { commentId: string; first: number; after?: string };

export function validateListCommentEditsInput(input: unknown): CommentEditsInput {
  const raw = objectInput(input, "issues.comments.edits.list");
  const out: CommentEditsInput = {
    commentId: requireString(raw.commentId, "commentId"),
    first: raw.first === undefined ? 30 : requireInt(raw.first, "first", 1, 100),
  };
  if (raw.after !== undefined) out.after = requireString(raw.after, "after");
  return out;
}

export type CommentEdit = {
  id: string | null;
  editedAt: string | null;
  createdAt: string | null;
  deletedAt: string | null;
  editorLogin: string | null;
  deletedByLogin: string | null;
  diff: string | null;
};

const EDIT_CONNECTION = `userContentEdits(first: $first, after: $after) {
  totalCount
  pageInfo { hasNextPage endCursor hasPreviousPage startCursor }
  nodes { id editedAt createdAt deletedAt diff editor { login } deletedBy { login } }
}`;

export const COMMENT_EDITS_QUERY = `query CommentEdits($id: ID!, $first: Int!, $after: String) {
  node(id: $id) {
    __typename
    ... on IssueComment { id url ${EDIT_CONNECTION} }
    ... on PullRequestReviewComment { id url ${EDIT_CONNECTION} }
  }
}`;

function loginOf(value: unknown): string | null {
  return isRecord(value) && typeof value.login === "string" ? value.login : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function normalizeCommentEdit(node: Record<string, unknown>): CommentEdit {
  return {
    id: str(node.id),
    editedAt: str(node.editedAt),
    createdAt: str(node.createdAt),
    deletedAt: str(node.deletedAt),
    editorLogin: loginOf(node.editor),
    deletedByLogin: loginOf(node.deletedBy),
    diff: str(node.diff),
  };
}

const EMPTY_PAGE: PageInfo = { hasNextPage: false, endCursor: null, hasPreviousPage: false, startCursor: null };

export type GhecAuditInput = {
  org: string;
  phrase?: string;
  include?: string;
  after?: string;
  before?: string;
  order?: string;
  per_page?: number;
};

export function validateGhecAuditInput(input: unknown): GhecAuditInput {
  const raw = objectInput(input, "rest.x.AUDIT");
  const out: GhecAuditInput = { org: requireString(raw.org, "org") };
  for (const key of ["phrase", "include", "after", "before", "order"] as const) {
    if (raw[key] !== undefined) out[key] = requireString(raw[key], key);
  }
  if (raw.per_page !== undefined) out.per_page = requireInt(raw.per_page, "per_page", 1, 100);
  return out;
}

export function validateGhecOrgInput(input: unknown, op: string): { org: string } {
  const raw = objectInput(input, op);
  return { org: requireString(raw.org, "org") };
}

export function validateGhecRoleCreateInput(input: unknown): { org: string; body: Record<string, unknown> } {
  const raw = objectInput(input, "rest.x.ORG_ROLE_CREATE");
  if (!isRecord(raw.body)) throw new Error("body must be an object");
  return { org: requireString(raw.org, "org"), body: raw.body };
}

export function validateGhecRoleUpdateInput(input: unknown): { org: string; role_id: number; body: Record<string, unknown> } {
  const raw = objectInput(input, "rest.x.ORG_ROLE_UPDATE");
  if (!isRecord(raw.body)) throw new Error("body must be an object");
  return { org: requireString(raw.org, "org"), role_id: requireInt(raw.role_id, "role_id", 1, Number.MAX_SAFE_INTEGER), body: raw.body };
}

export function validateGhecRoleDeleteInput(input: unknown): { org: string; role_id: number } {
  const raw = objectInput(input, "rest.x.ORG_ROLE_DELETE");
  return { org: requireString(raw.org, "org"), role_id: requireInt(raw.role_id, "role_id", 1, Number.MAX_SAFE_INTEGER) };
}

export function createGapG14cClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const clientFor = (operation: string) =>
    options.githubClient ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation });

  const rest = async (
    operation: string,
    path: string,
    init: RequestInit,
    success: readonly number[],
  ): Promise<Result<{ status: number; data: unknown }>> => {
    const response = await clientFor(operation).fetchJSON(path, init);
    if (success.includes(response.status)) {
      return { ok: true, status: response.status, data: response.status === 204 ? null : response.body };
    }
    const rate = parseGitHubRateLimit(response.status, response.headers);
    if (response.status === 429 || (response.status === 403 && rate.limited)) {
      return {
        ok: false,
        error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rate.limited ? rate.retryAfterSeconds : undefined },
      };
    }
    const capability = restCapabilityMissing(
      response.status,
      response.headers,
      response.body,
      G14C_REQUIRED_SCOPES[operation] ?? [],
      operation,
    );
    if (capability) return capability;
    const providerMessage = isRecord(response.body) && typeof response.body.message === "string" ? `: ${response.body.message}` : "";
    const hint =
      response.status === 403 || response.status === 404
        ? " This endpoint needs a GitHub Enterprise Cloud organization and an org owner token."
        : "";
    return upstream(`GitHub ${operation} returned HTTP ${response.status}${providerMessage}.${hint}`);
  };

  const org = (value: string) => `/orgs/${encodeURIComponent(value)}`;
  const json = (body: Record<string, unknown>, method: string): RequestInit => ({
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return {
    async runMutation(input: unknown): Promise<Result<{ data: Record<string, unknown> }>> {
      const p = validateRunGraphqlMutationInput(input);
      const result = await gqlRequest(clientFor("graphql.mutate"), p.query, p.variables ?? {}, {
        operation: "graphql.mutate",
        scopesFromError: true,
        strictErrors: true,
        ...(p.operationName !== undefined ? { operationName: p.operationName } : {}),
      });
      if (!result.ok) return result;
      return { ok: true, data: result.data };
    },

    async listCommentEdits(input: unknown): Promise<Result<{
      found: boolean;
      commentId: string;
      commentType: string | null;
      url: string | null;
      items: CommentEdit[];
      pageInfo: PageInfo;
      totalCount: number;
    }>> {
      const p = validateListCommentEditsInput(input);
      const result = await gqlRequest(
        clientFor("issues.comments.edits.list"),
        COMMENT_EDITS_QUERY,
        { id: p.commentId, first: p.first, after: p.after ?? null },
        { allowNotFound: true, operation: "issues.comments.edits.list" },
      );
      if (!result.ok) return result;
      const notFound = { ok: true as const, found: false, commentId: p.commentId, commentType: null, url: null, items: [], pageInfo: EMPTY_PAGE, totalCount: 0 };
      if ("notFound" in result && result.notFound) return notFound;
      const node = recordAt(result.data, "node");
      if (!node) return notFound;
      const type = typeof node.__typename === "string" ? node.__typename : null;
      if (!COMMENT_EDIT_TYPES.includes(type as (typeof COMMENT_EDIT_TYPES)[number])) {
        return upstream(`commentId is a ${type ?? "unknown"} node, not an IssueComment or PullRequestReviewComment.`);
      }
      const edits = recordAt(node, "userContentEdits");
      const conn = connection(edits, normalizeCommentEdit);
      return {
        ok: true,
        found: true,
        commentId: p.commentId,
        commentType: type,
        url: str(node.url),
        items: conn.items,
        pageInfo: conn.pageInfo,
        totalCount: typeof conn.totalCount === "number" ? conn.totalCount : conn.items.length,
      };
    },

    async getAuditLog(input: unknown) {
      const p = validateGhecAuditInput(input);
      const params = new URLSearchParams();
      for (const key of ["phrase", "include", "after", "before", "order", "per_page"] as const) {
        if (p[key] !== undefined) params.set(key, String(p[key]));
      }
      const qs = params.toString() ? `?${params.toString()}` : "";
      return rest("rest.x.AUDIT", `${org(p.org)}/audit-log${qs}`, { method: "GET" }, [200]);
    },

    async createOrgRole(input: unknown) {
      const p = validateGhecRoleCreateInput(input);
      return rest("rest.x.ORG_ROLE_CREATE", `${org(p.org)}/organization-roles`, json(p.body, "POST"), [201, 200]);
    },

    async updateOrgRole(input: unknown) {
      const p = validateGhecRoleUpdateInput(input);
      return rest("rest.x.ORG_ROLE_UPDATE", `${org(p.org)}/organization-roles/${p.role_id}`, json(p.body, "PATCH"), [200]);
    },

    async deleteOrgRole(input: unknown) {
      const p = validateGhecRoleDeleteInput(input);
      return rest("rest.x.ORG_ROLE_DELETE", `${org(p.org)}/organization-roles/${p.role_id}`, { method: "DELETE" }, [204]);
    },

    async listOrgFineGrainedPermissions(input: unknown) {
      const p = validateGhecOrgInput(input, "rest.x.ORG_FINE_PERMS");
      return rest("rest.x.ORG_FINE_PERMS", `${org(p.org)}/organization-fine-grained-permissions`, { method: "GET" }, [200]);
    },
  };
}

function objectInput(input: unknown, op: string): Record<string, unknown> {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) throw new Error(`${op} input must be an object`);
  return input;
}

function upstream(message: string): GraphqlError {
  return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message, retryAfterSeconds: undefined } };
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${name} must be a non-empty string`);
  return value.trim();
}

function requireInt(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}
