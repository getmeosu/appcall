import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";
import { normalizeGitHubRepo, type GitHubRepo } from "./repos";

const FORK_SORTS = ["newest", "oldest", "stargazers", "watchers"] as const;
const LABEL_SORTS = ["created", "updated"] as const;
const ORDERS = ["asc", "desc"] as const;

export type ListRepoForksInput = {
  owner: string;
  repo: string;
  sort?: (typeof FORK_SORTS)[number];
  perPage?: number;
  page?: number;
};

export type SearchTopicsInput = {
  q: string;
  perPage?: number;
  page?: number;
};

export type SearchLabelsInput = {
  repository_id: number;
  q: string;
  sort?: (typeof LABEL_SORTS)[number];
  order?: (typeof ORDERS)[number];
  perPage?: number;
  page?: number;
};

export type NormalizedTopic = {
  name: string;
  displayName: string;
  shortDescription: string;
  description: string;
  featured: boolean;
  curated: boolean;
  score: number;
  createdAt: string;
  updatedAt: string;
};

export type NormalizedLabelSearch = {
  id: number;
  name: string;
  color: string;
  default: boolean;
  description: string;
  score: number;
  url: string;
};

export function validateListRepoForksInput(input: unknown): ListRepoForksInput {
  if (!isRecord(input)) throw new Error("repos.forks.list input must be an object");
  return {
    ...repoScope(input),
    sort: optionalEnum(input.sort, "sort", FORK_SORTS),
    perPage: optionalPage(input.perPage, "perPage", 100),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

export function validateSearchTopicsInput(input: unknown): SearchTopicsInput {
  if (!isRecord(input)) throw new Error("search.topics.list input must be an object");
  if (input.sort !== undefined || input.order !== undefined) {
    throw new Error("search.topics.list does not accept sort or order");
  }
  return {
    q: requireString(input.q, "q"),
    perPage: optionalPage(input.perPage, "perPage", 100),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

export function validateSearchLabelsInput(input: unknown): SearchLabelsInput {
  if (!isRecord(input)) throw new Error("search.labels.list input must be an object");
  const repositoryId = input.repository_id ?? input.repositoryId;
  return {
    repository_id: requireId(repositoryId, "repository_id"),
    q: requireString(input.q, "q"),
    sort: optionalEnum(input.sort, "sort", LABEL_SORTS),
    order: optionalEnum(input.order, "order", ORDERS),
    perPage: optionalPage(input.perPage, "perPage", 100),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

export function normalizeTopic(item: Record<string, unknown>): NormalizedTopic {
  return {
    name: typeof item.name === "string" ? item.name : "",
    displayName: typeof item.display_name === "string" ? item.display_name : "",
    shortDescription: typeof item.short_description === "string" ? item.short_description : "",
    description: typeof item.description === "string" ? item.description : "",
    featured: item.featured === true,
    curated: item.curated === true,
    score: typeof item.score === "number" ? item.score : 0,
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
    updatedAt: typeof item.updated_at === "string" ? item.updated_at : "",
  };
}

export function normalizeLabelSearch(item: Record<string, unknown>): NormalizedLabelSearch {
  return {
    id: typeof item.id === "number" ? item.id : 0,
    name: typeof item.name === "string" ? item.name : "",
    color: typeof item.color === "string" ? item.color : "",
    default: item.default === true,
    description: typeof item.description === "string" ? item.description : "",
    score: typeof item.score === "number" ? item.score : 0,
    url: typeof item.url === "string" ? item.url : "",
  };
}

export function createCard7ReadsClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const client = options.githubClient ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation: "repos.forks.list",
  });

  return {
    async listForks(input: unknown) {
      const payload = validateListRepoForksInput(input);
      const response = await client.fetchJSON(
        `/repos/${encodeURIComponent(payload.owner)}/${encodeURIComponent(payload.repo)}/forks${query({
          sort: payload.sort,
          per_page: payload.perPage,
          page: payload.page,
        })}`,
      );
      if (response.status === 200 && Array.isArray(response.body)) {
        const forks = response.body.filter(isRecord).map((item) => normalizeGitHubRepo(item as GitHubRepo));
        return { ok: true as const, forks };
      }
      if (response.status === 404) return upstream("Repository forks not found.");
      return mapRateOrUpstream(response, "GitHub rejected the list forks request.");
    },

    async searchTopics(input: unknown) {
      const payload = validateSearchTopicsInput(input);
      const response = await client.fetchJSON(`/search/topics${query({
        q: payload.q,
        per_page: payload.perPage,
        page: payload.page,
      })}`);
      if (response.status === 200 && isRecord(response.body) && Array.isArray(response.body.items)) {
        const items = response.body.items.filter(isRecord).map(normalizeTopic);
        return {
          ok: true as const,
          totalCount: typeof response.body.total_count === "number" ? response.body.total_count : items.length,
          incompleteResults: response.body.incomplete_results === true,
          items,
        };
      }
      if (response.status === 404) return upstream("Topics search not found.");
      if (response.status === 422) return upstream("Invalid search query.");
      return mapRateOrUpstream(response, "GitHub rejected the search topics request.");
    },

    async searchLabels(input: unknown) {
      const payload = validateSearchLabelsInput(input);
      const response = await client.fetchJSON(`/search/labels${query({
        repository_id: payload.repository_id,
        q: payload.q,
        sort: payload.sort,
        order: payload.order,
        per_page: payload.perPage,
        page: payload.page,
      })}`);
      if (response.status === 200 && isRecord(response.body) && Array.isArray(response.body.items)) {
        const items = response.body.items.filter(isRecord).map(normalizeLabelSearch);
        return {
          ok: true as const,
          totalCount: typeof response.body.total_count === "number" ? response.body.total_count : items.length,
          incompleteResults: response.body.incomplete_results === true,
          items,
        };
      }
      if (response.status === 404) return upstream("Label search not found.");
      if (response.status === 422) return upstream("Invalid search query.");
      return mapRateOrUpstream(response, "GitHub rejected the search labels request.");
    },
  };
}

function query(fields: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

function repoScope(input: Record<string, unknown>): { owner: string; repo: string } {
  return {
    owner: requireSingleSegment(input.owner, "owner"),
    repo: requireSingleSegment(input.repo, "repo"),
  };
}

function optionalEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`${field} must be one of ${allowed.join(", ")}`);
  }
  return value as T;
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
