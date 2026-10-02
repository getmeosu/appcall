import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

// GitHub Discussions are GraphQL-only (POST https://api.github.com/graphql).

const DISCUSSION_FIELDS = `
  id
  number
  title
  body
  url
  createdAt
  updatedAt
  isAnswered
  author { login }
  category { id name emoji }
`;

const COMMENT_FIELDS = `
  id
  body
  url
  createdAt
  updatedAt
  author { login }
  replyTo { id }
`;

const MODEL_VERSION = "2026-05-16" as const;

export type NormalizedDiscussionCategory = {
  id: string;
  provider: "github";
  nodeId: string;
  name: string;
  emoji: string;
  description: string;
  isAnswerable: boolean;
  modelVersion: typeof MODEL_VERSION;
  raw: Record<string, unknown>;
};

export type NormalizedDiscussion = {
  id: string;
  provider: "github";
  nodeId: string;
  number: number;
  title: string;
  body: string;
  url: string;
  author: string;
  categoryId: string;
  categoryName: string;
  isAnswered: boolean;
  createdAt: string;
  updatedAt: string;
  modelVersion: typeof MODEL_VERSION;
  raw: Record<string, unknown>;
};

export type NormalizedDiscussionComment = {
  id: string;
  provider: "github";
  nodeId: string;
  body: string;
  url: string;
  author: string;
  replyToId: string;
  createdAt: string;
  updatedAt: string;
  modelVersion: typeof MODEL_VERSION;
  raw: Record<string, unknown>;
};

export type PageInfo = { hasNextPage: boolean; endCursor: string | null };

export function normalizeDiscussionCategory(item: Record<string, unknown>): NormalizedDiscussionCategory {
  const nodeId = typeof item.id === "string" ? item.id : "";
  return {
    id: `gh-discussion-category:${nodeId}`,
    provider: "github",
    nodeId,
    name: typeof item.name === "string" ? item.name : "",
    emoji: typeof item.emoji === "string" ? item.emoji : "",
    description: typeof item.description === "string" ? item.description : "",
    isAnswerable: item.isAnswerable === true,
    modelVersion: MODEL_VERSION,
    raw: item,
  };
}

export function normalizeDiscussion(item: Record<string, unknown>): NormalizedDiscussion {
  const nodeId = typeof item.id === "string" ? item.id : "";
  const number = typeof item.number === "number" ? item.number : 0;
  const author = isRecord(item.author) && typeof item.author.login === "string" ? item.author.login : "";
  const category = isRecord(item.category) ? item.category : {};
  return {
    id: `gh-discussion:${number || nodeId}`,
    provider: "github",
    nodeId,
    number,
    title: typeof item.title === "string" ? item.title : "",
    body: typeof item.body === "string" ? item.body : "",
    url: typeof item.url === "string" ? item.url : "",
    author,
    categoryId: typeof category.id === "string" ? category.id : "",
    categoryName: typeof category.name === "string" ? category.name : "",
    isAnswered: item.isAnswered === true,
    createdAt: typeof item.createdAt === "string" ? item.createdAt : "",
    updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : "",
    modelVersion: MODEL_VERSION,
    raw: item,
  };
}

export function normalizeDiscussionComment(item: Record<string, unknown>): NormalizedDiscussionComment {
  const nodeId = typeof item.id === "string" ? item.id : "";
  const author = isRecord(item.author) && typeof item.author.login === "string" ? item.author.login : "";
  const replyTo = isRecord(item.replyTo) && typeof item.replyTo.id === "string" ? item.replyTo.id : "";
  return {
    id: `gh-discussion-comment:${nodeId}`,
    provider: "github",
    nodeId,
    body: typeof item.body === "string" ? item.body : "",
    url: typeof item.url === "string" ? item.url : "",
    author,
    replyToId: replyTo,
    createdAt: typeof item.createdAt === "string" ? item.createdAt : "",
    updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : "",
    modelVersion: MODEL_VERSION,
    raw: item,
  };
}

export type ListDiscussionCategoriesInput = { owner: string; repo: string; first?: number };
export function validateListDiscussionCategoriesInput(input: unknown): ListDiscussionCategoriesInput {
  if (!isRecord(input)) throw new Error("list discussion categories input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    first: optionalFirst(input.first),
  };
}

export type ListDiscussionsInput = {
  owner: string;
  repo: string;
  first?: number;
  after?: string;
  categoryId?: string;
  answered?: boolean;
  orderField?: "CREATED_AT" | "UPDATED_AT";
  orderDirection?: "ASC" | "DESC";
};
export function validateListDiscussionsInput(input: unknown): ListDiscussionsInput {
  if (!isRecord(input)) throw new Error("list discussions input must be an object");
  const answered = input.answered;
  if (answered !== undefined && typeof answered !== "boolean") throw new Error("answered must be a boolean");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    first: optionalFirst(input.first),
    after: optionalString(input.after, "after"),
    categoryId: optionalString(input.categoryId, "categoryId"),
    answered,
    orderField: optionalEnum(input.orderField, "orderField", ["CREATED_AT", "UPDATED_AT"] as const),
    orderDirection: optionalEnum(input.orderDirection, "orderDirection", ["ASC", "DESC"] as const),
  };
}

export type GetDiscussionInput = {
  owner: string;
  repo: string;
  discussionNumber?: number;
  discussionId?: string;
  title?: string;
  categoryId?: string;
};
export function validateGetDiscussionInput(input: unknown): GetDiscussionInput {
  if (!isRecord(input)) throw new Error("get discussion input must be an object");
  const discussionNumber = optionalNumber(input.discussionNumber, "discussionNumber");
  const discussionId = optionalString(input.discussionId, "discussionId");
  const title = optionalString(input.title, "title");
  if (discussionNumber === undefined && !discussionId && !title) {
    throw new Error("discussionNumber, discussionId, or title is required");
  }
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    discussionNumber,
    discussionId,
    title,
    categoryId: optionalString(input.categoryId, "categoryId"),
  };
}

export type CreateDiscussionInput = {
  owner: string;
  repo: string;
  categoryId: string;
  title: string;
  body: string;
};
export function validateCreateDiscussionInput(input: unknown): CreateDiscussionInput {
  if (!isRecord(input)) throw new Error("create discussion input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    categoryId: requireString(input.categoryId, "categoryId"),
    title: requireString(input.title, "title"),
    body: requireString(input.body, "body"),
  };
}

export type UpdateDiscussionInput = {
  owner: string;
  repo: string;
  discussionNumber?: number;
  discussionId?: string;
  title?: string;
  body?: string;
  categoryId?: string;
};
export function validateUpdateDiscussionInput(input: unknown): UpdateDiscussionInput {
  if (!isRecord(input)) throw new Error("update discussion input must be an object");
  const discussionNumber = optionalNumber(input.discussionNumber, "discussionNumber");
  const discussionId = optionalString(input.discussionId, "discussionId");
  if (discussionNumber === undefined && !discussionId) {
    throw new Error("discussionNumber or discussionId is required");
  }
  const title = optionalString(input.title, "title");
  const body = optionalString(input.body, "body");
  const categoryId = optionalString(input.categoryId, "categoryId");
  if (title === undefined && body === undefined && categoryId === undefined) {
    throw new Error("title, body, or categoryId is required");
  }
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    discussionNumber,
    discussionId,
    title,
    body,
    categoryId,
  };
}

export type ListDiscussionCommentsInput = {
  owner: string;
  repo: string;
  discussionNumber?: number;
  discussionId?: string;
  first?: number;
  after?: string;
};
export function validateListDiscussionCommentsInput(input: unknown): ListDiscussionCommentsInput {
  if (!isRecord(input)) throw new Error("list discussion comments input must be an object");
  const discussionNumber = optionalNumber(input.discussionNumber, "discussionNumber");
  const discussionId = optionalString(input.discussionId, "discussionId");
  if (discussionNumber === undefined && !discussionId) {
    throw new Error("discussionNumber or discussionId is required");
  }
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    discussionNumber,
    discussionId,
    first: optionalFirst(input.first),
    after: optionalString(input.after, "after"),
  };
}

export type CreateDiscussionCommentInput = {
  owner: string;
  repo: string;
  body: string;
  discussionNumber?: number;
  discussionId?: string;
  replyToId?: string;
};
export function validateCreateDiscussionCommentInput(input: unknown): CreateDiscussionCommentInput {
  if (!isRecord(input)) throw new Error("create discussion comment input must be an object");
  const discussionNumber = optionalNumber(input.discussionNumber, "discussionNumber");
  const discussionId = optionalString(input.discussionId, "discussionId");
  if (discussionNumber === undefined && !discussionId) {
    throw new Error("discussionNumber or discussionId is required");
  }
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    body: requireString(input.body, "body"),
    discussionNumber,
    discussionId,
    replyToId: optionalString(input.replyToId, "replyToId"),
  };
}

export type UpdateDiscussionCommentInput = {
  owner: string;
  repo: string;
  commentId: string;
  body: string;
  discussionNumber?: number;
  discussionId?: string;
};
export function validateUpdateDiscussionCommentInput(input: unknown): UpdateDiscussionCommentInput {
  if (!isRecord(input)) throw new Error("update discussion comment input must be an object");
  const discussionNumber = optionalNumber(input.discussionNumber, "discussionNumber");
  const discussionId = optionalString(input.discussionId, "discussionId");
  if (discussionNumber === undefined && !discussionId) {
    throw new Error("discussionNumber or discussionId is required");
  }
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    commentId: requireString(input.commentId, "commentId"),
    body: requireString(input.body, "body"),
    discussionNumber,
    discussionId,
  };
}

export function createDiscussionsClient(options: {
  accessToken: string;
  fetch?: typeof fetch;
  githubClient?: GitHubClient;
}) {
  const clientFor = (operation: string): GitHubClient =>
    options.githubClient ??
    createGitHubClient({
      accessToken: options.accessToken,
      fetch: options.fetch,
      operation,
    });

  return {
    async listCategories(input: unknown) {
      const payload = validateListDiscussionCategoriesInput(input);
      const client = clientFor("discussions.categories.list");
      const result = await gql(client, `query DiscussionCategories($owner: String!, $name: String!, $first: Int!) {
        repository(owner: $owner, name: $name) {
          discussionCategories(first: $first) {
            nodes { id name emoji description isAnswerable }
            pageInfo { hasNextPage endCursor }
          }
        }
      }`, { owner: payload.owner, name: payload.repo, first: payload.first ?? 20 });
      if (!result.ok) return result;
      const repo = recordAt(result.data, "repository");
      if (!repo) return upstream("Repository not found.");
      const connection = recordAt(repo, "discussionCategories");
      const nodes = nodesOf(connection);
      return {
        ok: true as const,
        categories: nodes.map(normalizeDiscussionCategory),
        pageInfo: pageInfoOf(connection),
      };
    },

    async list(input: unknown) {
      const payload = validateListDiscussionsInput(input);
      const client = clientFor("discussions.list");
      const orderField = payload.orderField ?? "UPDATED_AT";
      const orderDirection = payload.orderDirection ?? "DESC";
      const result = await gql(client, `query ListDiscussions($owner: String!, $name: String!, $first: Int!, $after: String, $categoryId: ID, $answered: Boolean) {
        repository(owner: $owner, name: $name) {
          discussions(first: $first, after: $after, categoryId: $categoryId, answered: $answered, orderBy: {field: ${orderField}, direction: ${orderDirection}}) {
            nodes { ${DISCUSSION_FIELDS} }
            pageInfo { hasNextPage endCursor }
          }
        }
      }`, {
        owner: payload.owner,
        name: payload.repo,
        first: payload.first ?? 20,
        after: payload.after ?? null,
        categoryId: payload.categoryId ?? null,
        answered: payload.answered ?? null,
      });
      if (!result.ok) return result;
      const repo = recordAt(result.data, "repository");
      if (!repo) return upstream("Repository not found.");
      const connection = recordAt(repo, "discussions");
      return {
        ok: true as const,
        discussions: nodesOf(connection).map(normalizeDiscussion),
        pageInfo: pageInfoOf(connection),
      };
    },

    async get(input: unknown) {
      const payload = validateGetDiscussionInput(input);
      const client = clientFor("discussions.get");
      if (payload.discussionNumber !== undefined) {
        const result = await gql(client, `query DiscussionByNumber($owner: String!, $name: String!, $number: Int!) {
          repository(owner: $owner, name: $name) {
            discussion(number: $number) { ${DISCUSSION_FIELDS} }
          }
        }`, { owner: payload.owner, name: payload.repo, number: payload.discussionNumber });
        if (!result.ok) return result;
        const repo = recordAt(result.data, "repository");
        const discussion = repo ? recordAt(repo, "discussion") : null;
        if (!discussion) return { ok: true as const, found: false as const, discussion: null };
        return { ok: true as const, found: true as const, discussion: normalizeDiscussion(discussion) };
      }
      if (payload.discussionId) {
        const result = await gql(client, `query DiscussionById($id: ID!) {
          node(id: $id) { ... on Discussion { ${DISCUSSION_FIELDS} } }
        }`, { id: payload.discussionId });
        if (!result.ok) return result;
        const node = recordAt(result.data, "node");
        if (!node || typeof node.number !== "number") {
          return { ok: true as const, found: false as const, discussion: null };
        }
        return { ok: true as const, found: true as const, discussion: normalizeDiscussion(node) };
      }
      let after: string | null = null;
      for (let page = 0; page < 5; page++) {
        const result = await gql(client, `query DiscussionByTitle($owner: String!, $name: String!, $categoryId: ID, $after: String) {
          repository(owner: $owner, name: $name) {
            discussions(first: 100, after: $after, categoryId: $categoryId, orderBy: {field: UPDATED_AT, direction: DESC}) {
              nodes { ${DISCUSSION_FIELDS} }
              pageInfo { hasNextPage endCursor }
            }
          }
        }`, { owner: payload.owner, name: payload.repo, categoryId: payload.categoryId ?? null, after });
        if (!result.ok) return result;
        const repo = recordAt(result.data, "repository");
        const connection = repo ? recordAt(repo, "discussions") : null;
        const match = nodesOf(connection).find((node) => node.title === payload.title) ?? null;
        if (match) return { ok: true as const, found: true as const, discussion: normalizeDiscussion(match) };
        const pageInfo = pageInfoOf(connection);
        if (!pageInfo.hasNextPage || !pageInfo.endCursor) break;
        after = pageInfo.endCursor;
      }
      return { ok: true as const, found: false as const, discussion: null };
    },

    async create(input: unknown) {
      const payload = validateCreateDiscussionInput(input);
      const client = clientFor("discussions.create");
      const repo = await gql(client, `query RepoId($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) { id }
      }`, { owner: payload.owner, name: payload.repo });
      if (!repo.ok) return repo;
      const repository = recordAt(repo.data, "repository");
      const repositoryId = repository && typeof repository.id === "string" ? repository.id : "";
      if (!repositoryId) return upstream("Repository not found.");
      const created = await gql(client, `mutation CreateDiscussion($input: CreateDiscussionInput!) {
        createDiscussion(input: $input) { discussion { ${DISCUSSION_FIELDS} } }
      }`, {
        input: {
          repositoryId,
          categoryId: payload.categoryId,
          title: payload.title,
          body: payload.body,
        },
      });
      if (!created.ok) return created;
      const discussion = recordAt(recordAt(created.data, "createDiscussion") ?? {}, "discussion");
      if (!discussion) return upstream("GitHub did not return the created discussion.");
      return { ok: true as const, discussion: normalizeDiscussion(discussion) };
    },

    async update(input: unknown) {
      const payload = validateUpdateDiscussionInput(input);
      const client = clientFor("discussions.update");
      const discussionId = await resolveDiscussionId(client, payload.owner, payload.repo, payload.discussionNumber, payload.discussionId);
      if (!discussionId.ok) return discussionId;
      const patch: Record<string, string> = { discussionId: discussionId.id };
      if (payload.title !== undefined) patch.title = payload.title;
      if (payload.body !== undefined) patch.body = payload.body;
      if (payload.categoryId !== undefined) patch.categoryId = payload.categoryId;
      const updated = await gql(client, `mutation UpdateDiscussion($input: UpdateDiscussionInput!) {
        updateDiscussion(input: $input) { discussion { ${DISCUSSION_FIELDS} } }
      }`, { input: patch });
      if (!updated.ok) return updated;
      const discussion = recordAt(recordAt(updated.data, "updateDiscussion") ?? {}, "discussion");
      if (!discussion) return upstream("GitHub did not return the updated discussion.");
      return { ok: true as const, discussion: normalizeDiscussion(discussion) };
    },

    async listComments(input: unknown) {
      const payload = validateListDiscussionCommentsInput(input);
      const client = clientFor("discussions.comments.list");
      const first = payload.first ?? 20;
      const after = payload.after ?? null;
      const result = payload.discussionNumber !== undefined
        ? await gql(client, `query DiscussionComments($owner: String!, $name: String!, $number: Int!, $first: Int!, $after: String) {
            repository(owner: $owner, name: $name) {
              discussion(number: $number) {
                comments(first: $first, after: $after) {
                  nodes { ${COMMENT_FIELDS} }
                  pageInfo { hasNextPage endCursor }
                }
              }
            }
          }`, { owner: payload.owner, name: payload.repo, number: payload.discussionNumber, first, after })
        : await gql(client, `query DiscussionCommentsById($id: ID!, $first: Int!, $after: String) {
            node(id: $id) {
              ... on Discussion {
                comments(first: $first, after: $after) {
                  nodes { ${COMMENT_FIELDS} }
                  pageInfo { hasNextPage endCursor }
                }
              }
            }
          }`, { id: payload.discussionId, first, after });
      if (!result.ok) return result;
      const parent = payload.discussionNumber !== undefined
        ? recordAt(recordAt(result.data, "repository") ?? {}, "discussion")
        : recordAt(result.data, "node");
      if (!parent) {
        return { ok: true as const, comments: [], pageInfo: { hasNextPage: false, endCursor: null } };
      }
      const connection = recordAt(parent, "comments");
      return {
        ok: true as const,
        comments: nodesOf(connection).map(normalizeDiscussionComment),
        pageInfo: pageInfoOf(connection),
      };
    },

    async createComment(input: unknown) {
      const payload = validateCreateDiscussionCommentInput(input);
      const client = clientFor("discussions.comments.create");
      const discussionId = await resolveDiscussionId(client, payload.owner, payload.repo, payload.discussionNumber, payload.discussionId);
      if (!discussionId.ok) return discussionId;
      const commentInput: Record<string, string> = { discussionId: discussionId.id, body: payload.body };
      if (payload.replyToId) commentInput.replyToId = payload.replyToId;
      const created = await gql(client, `mutation AddDiscussionComment($input: AddDiscussionCommentInput!) {
        addDiscussionComment(input: $input) { comment { ${COMMENT_FIELDS} } }
      }`, { input: commentInput });
      if (!created.ok) return created;
      const comment = recordAt(recordAt(created.data, "addDiscussionComment") ?? {}, "comment");
      if (!comment) return upstream("GitHub did not return the created discussion comment.");
      return { ok: true as const, comment: normalizeDiscussionComment(comment) };
    },

    async updateComment(input: unknown) {
      const payload = validateUpdateDiscussionCommentInput(input);
      const client = clientFor("discussions.comments.update");
      const updated = await gql(client, `mutation UpdateDiscussionComment($input: UpdateDiscussionCommentInput!) {
        updateDiscussionComment(input: $input) { comment { ${COMMENT_FIELDS} } }
      }`, { input: { commentId: payload.commentId, body: payload.body } });
      if (!updated.ok) return updated;
      const comment = recordAt(recordAt(updated.data, "updateDiscussionComment") ?? {}, "comment");
      if (!comment) return upstream("GitHub did not return the updated discussion comment.");
      return { ok: true as const, comment: normalizeDiscussionComment(comment) };
    },
  };
}

async function resolveDiscussionId(
  client: GitHubClient,
  owner: string,
  repo: string,
  discussionNumber: number | undefined,
  discussionId: string | undefined,
): Promise<{ ok: true; id: string } | ReturnType<typeof upstream>> {
  if (discussionId) return { ok: true, id: discussionId };
  const result = await gql(client, `query DiscussionNodeId($owner: String!, $name: String!, $number: Int!) {
    repository(owner: $owner, name: $name) { discussion(number: $number) { id } }
  }`, { owner, name: repo, number: discussionNumber });
  if (!result.ok) return result;
  const discussion = recordAt(recordAt(result.data, "repository") ?? {}, "discussion");
  const id = discussion && typeof discussion.id === "string" ? discussion.id : "";
  if (!id) return upstream("Discussion not found.");
  return { ok: true, id };
}

type GqlSuccess = { ok: true; data: Record<string, unknown> };
type GqlFailure = ReturnType<typeof upstream> | ReturnType<typeof rateLimited>;

async function gql(
  client: GitHubClient,
  query: string,
  variables: Record<string, unknown>,
): Promise<GqlSuccess | GqlFailure> {
  const response = await client.graphql(query, variables);
  if (isRateLimited(response.status, response.headers)) return rateLimited(response.status, response.headers);
  if (response.status === 401) return upstream("GitHub authentication failed.");
  if (!isRecord(response.body)) return upstream("GitHub GraphQL response was not an object.");
  const errors = Array.isArray(response.body.errors) ? response.body.errors : [];
  if (errors.some((error) => isRecord(error) && error.type === "RATE_LIMITED")) {
    return rateLimited(429, response.headers);
  }
  const data = isRecord(response.body.data) ? response.body.data : null;
  const benign = errors.every((error) => isRecord(error) && error.type === "NOT_FOUND");
  if (response.status !== 200 || !data || (errors.length > 0 && !benign)) {
    const message = errors.length > 0 && isRecord(errors[0]) && typeof errors[0].message === "string"
      ? errors[0].message
      : "GitHub rejected the GraphQL request.";
    return upstream(message);
  }
  return { ok: true, data };
}

function nodesOf(connection: Record<string, unknown> | null): Record<string, unknown>[] {
  if (!connection || !Array.isArray(connection.nodes)) return [];
  return connection.nodes.filter(isRecord);
}

function pageInfoOf(connection: Record<string, unknown> | null): PageInfo {
  const page = connection && isRecord(connection.pageInfo) ? connection.pageInfo : {};
  return {
    hasNextPage: page.hasNextPage === true,
    endCursor: typeof page.endCursor === "string" ? page.endCursor : null,
  };
}

function recordAt(parent: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  if (!parent) return null;
  return isRecord(parent[key]) ? parent[key] : null;
}

function upstream(message: string) {
  return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message } };
}

function rateLimited(status: number, headers: Record<string, string>) {
  const rateLimit = parseGitHubRateLimit(status, headers);
  return {
    ok: false as const,
    error: {
      code: "CONNECTOR_RATE_LIMITED" as const,
      message: "GitHub rate limit exceeded.",
      retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : 60,
    },
  };
}

function isRateLimited(status: number, headers: Record<string, string>): boolean {
  return status === 429 || (status === 403 && parseGitHubRateLimit(status, headers).limited);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  return value.length > 0 ? value : undefined;
}

function optionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function optionalFirst(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 100) {
    throw new Error("first must be an integer between 1 and 100");
  }
  return value;
}

function optionalEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`${field} must be ${allowed.join(" or ")}`);
  }
  return value as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
