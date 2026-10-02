import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

export type GitHubTag = {
  name: string;
  commit?: { sha?: string; url?: string };
  zipball_url?: string;
  tarball_url?: string;
  node_id?: string;
  [key: string]: unknown;
};

export type NormalizedTag = {
  id: string;
  provider: "github";
  name: string;
  commitSha: string;
  commitUrl: string;
  zipballUrl: string;
  tarballUrl: string;
  modelVersion: "2026-05-16";
  raw: GitHubTag;
};

export function normalizeGitHubTag(tag: GitHubTag): NormalizedTag {
  return {
    id: `gh-tag:${tag.name}`,
    provider: "github",
    name: tag.name ?? "",
    commitSha: tag.commit?.sha ?? "",
    commitUrl: tag.commit?.url ?? "",
    zipballUrl: tag.zipball_url ?? "",
    tarballUrl: tag.tarball_url ?? "",
    modelVersion: "2026-05-16",
    raw: tag,
  };
}

export type ListTagsInput = {
  owner: string;
  repo: string;
  perPage?: number;
  page?: number;
};

export function validateListTagsInput(input: unknown): ListTagsInput {
  if (!isRecord(input)) throw new Error("tags.list input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    perPage: optionalPage(input.perPage, "perPage"),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

export function createTagsClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const base = options.githubClient;

  return {
    async list(input: unknown) {
      const payload = validateListTagsInput(input);
      const client = base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "tags.list" });
      const params = new URLSearchParams();
      if (payload.perPage) params.set("per_page", String(payload.perPage));
      if (payload.page) params.set("page", String(payload.page));
      const qs = params.toString() ? `?${params.toString()}` : "";
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/tags${qs}`);
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, tags: (response.body as GitHubTag[]).map(normalizeGitHubTag) };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Not found for tags.list." } };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the tags.list request." } };
    },
  };
}

function optionalPage(value: unknown, field: string, max = 100): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${field} must be an integer between 1 and ${max}`);
  }
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
