import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

// ─── Types ───────────────────────────────────────────────────────────────────

export type GitHubGist = {
  id: string;
  description?: string;
  public?: boolean;
  html_url?: string;
  git_pull_url?: string;
  git_push_url?: string;
  owner?: { login?: string };
  created_at?: string;
  updated_at?: string;
  files?: Record<string, { filename?: string; type?: string; language?: string; raw_url?: string; size?: number; content?: string }>;
  [key: string]: unknown;
};

export type NormalizedGist = {
  id: string;
  provider: "github";
  description: string;
  public: boolean;
  url: string;
  gitPullUrl: string;
  gitPushUrl: string;
  owner: string;
  fileNames: string[];
  createdAt: string;
  updatedAt: string;
  modelVersion: "2026-05-16";
  raw: GitHubGist;
};

export function normalizeGitHubGist(gist: GitHubGist): NormalizedGist {
  return {
    id: `gh-gist:${gist.id}`,
    provider: "github",
    description: gist.description ?? "",
    public: gist.public ?? false,
    url: gist.html_url ?? "",
    gitPullUrl: gist.git_pull_url ?? "",
    gitPushUrl: gist.git_push_url ?? "",
    owner: gist.owner?.login ?? "",
    fileNames: gist.files ? Object.keys(gist.files) : [],
    createdAt: gist.created_at ?? "",
    updatedAt: gist.updated_at ?? "",
    modelVersion: "2026-05-16",
    raw: gist,
  };
}

// ─── Input types & validators ─────────────────────────────────────────────────

export type GistFile = { filename: string; content: string };

export type CreateGistInput = {
  description?: string;
  public?: boolean;
  files: GistFile[];
};

export function validateCreateGistInput(input: unknown): CreateGistInput {
  if (!isRecord(input)) throw new Error("create gist input must be an object");
  if (!Array.isArray(input.files) || input.files.length === 0) throw new Error("files is required and must be a non-empty array");
  return {
    description: typeof input.description === "string" ? input.description : undefined,
    public: typeof input.public === "boolean" ? input.public : undefined,
    files: (input.files as unknown[]).map((f) => {
      if (!isRecord(f)) throw new Error("each file must be an object");
      return {
        filename: requireString(f.filename, "file.filename"),
        content: requireString(f.content, "file.content"),
      };
    }),
  };
}

// ─── Client ───────────────────────────────────────────────────────────────────

export function createGistsClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const client = options.githubClient ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "gists.create" });

  return {
    async create(input: unknown) {
      const payload = validateCreateGistInput(input);
      // Build the files map expected by the GitHub API
      const filesMap: Record<string, { content: string }> = {};
      for (const f of payload.files) {
        filesMap[f.filename] = { content: f.content };
      }
      const response = await client.fetchJSON("/gists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: payload.description ?? "",
          public: payload.public ?? false,
          files: filesMap,
        }),
      });
      if (response.status === 201) {
        return { ok: true as const, gist: normalizeGitHubGist(response.body as GitHubGist) };
      }
      if (response.status === 422) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Gist validation failed." } };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the create gist request." } };
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
