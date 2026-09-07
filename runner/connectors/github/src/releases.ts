import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

// ─── Types ───────────────────────────────────────────────────────────────────

export type GitHubRelease = {
  id: number;
  tag_name: string;
  name?: string;
  body?: string;
  draft?: boolean;
  prerelease?: boolean;
  html_url?: string;
  tarball_url?: string;
  zipball_url?: string;
  author?: { login?: string };
  created_at?: string;
  published_at?: string;
  target_commitish?: string;
  [key: string]: unknown;
};

export type NormalizedRelease = {
  id: string;
  provider: "github";
  providerReleaseId: number;
  tagName: string;
  name: string;
  body: string;
  draft: boolean;
  prerelease: boolean;
  url: string;
  tarballUrl: string;
  zipballUrl: string;
  author: string;
  targetBranch: string;
  createdAt: string;
  publishedAt: string;
  modelVersion: "2026-05-16";
  raw: GitHubRelease;
};

export function normalizeGitHubRelease(release: GitHubRelease): NormalizedRelease {
  return {
    id: `gh-release:${release.id}`,
    provider: "github",
    providerReleaseId: release.id,
    tagName: release.tag_name ?? "",
    name: release.name ?? "",
    body: release.body ?? "",
    draft: release.draft ?? false,
    prerelease: release.prerelease ?? false,
    url: release.html_url ?? "",
    tarballUrl: release.tarball_url ?? "",
    zipballUrl: release.zipball_url ?? "",
    author: release.author?.login ?? "",
    targetBranch: release.target_commitish ?? "main",
    createdAt: release.created_at ?? "",
    publishedAt: release.published_at ?? "",
    modelVersion: "2026-05-16",
    raw: release,
  };
}

// ─── Input types & validators ─────────────────────────────────────────────────

export type CreateReleaseInput = {
  owner: string;
  repo: string;
  tagName: string;
  name?: string;
  body?: string;
  draft?: boolean;
  prerelease?: boolean;
  targetCommitish?: string;
  generateReleaseNotes?: boolean;
};

export function validateCreateReleaseInput(input: unknown): CreateReleaseInput {
  if (!isRecord(input)) throw new Error("create release input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    tagName: requireString(input.tagName, "tagName"),
    name: typeof input.name === "string" ? input.name : undefined,
    body: typeof input.body === "string" ? input.body : undefined,
    draft: typeof input.draft === "boolean" ? input.draft : undefined,
    prerelease: typeof input.prerelease === "boolean" ? input.prerelease : undefined,
    targetCommitish: typeof input.targetCommitish === "string" ? input.targetCommitish : undefined,
    generateReleaseNotes: typeof input.generateReleaseNotes === "boolean" ? input.generateReleaseNotes : undefined,
  };
}

// ─── Client ───────────────────────────────────────────────────────────────────

export function createReleasesClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const client = options.githubClient ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "releases.create" });

  return {
    async create(input: unknown) {
      const payload = validateCreateReleaseInput(input);
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/releases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tag_name: payload.tagName,
          name: payload.name,
          body: payload.body,
          draft: payload.draft,
          prerelease: payload.prerelease,
          target_commitish: payload.targetCommitish,
          generate_release_notes: payload.generateReleaseNotes,
        }),
      });
      if (response.status === 201) {
        return { ok: true as const, release: normalizeGitHubRelease(response.body as GitHubRelease) };
      }
      if (response.status === 422) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Validation failed — tag may already exist." } };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the create release request." } };
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
