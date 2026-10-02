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


export type ListGistsInput = {
  perPage?: number;
  page?: number;
  since?: string;
};

export function validateListGistsInput(input: unknown): ListGistsInput {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) throw new Error("gists.list input must be an object");
  return {
    perPage: optionalPage(input.perPage, "perPage"),
    page: optionalPage(input.page, "page", 1_000_000),
    since: typeof input.since === "string" ? input.since : undefined,
  };
}

export type GetGistInput = { gistId: string };

export function validateGetGistInput(input: unknown): GetGistInput {
  if (!isRecord(input)) throw new Error("gists.get input must be an object");
  return { gistId: requireString(input.gistId, "gistId") };
}

export type UpdateGistInput = {
  gistId: string;
  description?: string;
  files?: GistFile[];
};

export function validateUpdateGistInput(input: unknown): UpdateGistInput {
  if (!isRecord(input)) throw new Error("gists.update input must be an object");
  let files: GistFile[] | undefined;
  if (input.files !== undefined) {
    if (!Array.isArray(input.files) || input.files.length === 0) throw new Error("files must be a non-empty array when provided");
    files = (input.files as unknown[]).map((f) => {
      if (!isRecord(f)) throw new Error("each file must be an object");
      return {
        filename: requireString(f.filename, "file.filename"),
        content: requireString(f.content, "file.content"),
      };
    });
  }
  return {
    gistId: requireString(input.gistId, "gistId"),
    description: typeof input.description === "string" ? input.description : undefined,
    files,
  };
}

// ─── Client ───────────────────────────────────────────────────────────────────

function mapGistError(status: number, headers: Headers, action: string) {
  if (status === 404) {
    return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: `Not found for ${action}.` } };
  }
  if (status === 422) {
    return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: `Validation failed for ${action}.` } };
  }
  if (status === 429 || (status === 403 && parseGitHubRateLimit(status, headers).limited)) {
    const rateLimit = parseGitHubRateLimit(status, headers);
    return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
  }
  return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: `GitHub rejected the ${action} request.` } };
}

export function createGistsClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const base = options.githubClient;

  return {
    async create(input: unknown) {
      const payload = validateCreateGistInput(input);
      const client = base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "gists.create" });
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
      return mapGistError(response.status, response.headers, "gists.create");
    },

    async list(input: unknown) {
      const payload = validateListGistsInput(input);
      const client = base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "gists.list" });
      const params = new URLSearchParams();
      if (payload.perPage) params.set("per_page", String(payload.perPage));
      if (payload.page) params.set("page", String(payload.page));
      if (payload.since) params.set("since", payload.since);
      const qs = params.toString() ? `?${params.toString()}` : "";
      const response = await client.fetchJSON(`/gists${qs}`);
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, gists: (response.body as GitHubGist[]).map(normalizeGitHubGist) };
      }
      return mapGistError(response.status, response.headers, "gists.list");
    },

    async get(input: unknown) {
      const payload = validateGetGistInput(input);
      const client = base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "gists.get" });
      const response = await client.fetchJSON(`/gists/${encodeURIComponent(payload.gistId)}`);
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, gist: normalizeGitHubGist(response.body as GitHubGist) };
      }
      return mapGistError(response.status, response.headers, "gists.get");
    },

    async update(input: unknown) {
      const payload = validateUpdateGistInput(input);
      const client = base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "gists.update" });
      const body: Record<string, unknown> = {};
      if (payload.description !== undefined) body.description = payload.description;
      if (payload.files) {
        const filesMap: Record<string, { content: string }> = {};
        for (const f of payload.files) {
          filesMap[f.filename] = { content: f.content };
        }
        body.files = filesMap;
      }
      const response = await client.fetchJSON(`/gists/${encodeURIComponent(payload.gistId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, gist: normalizeGitHubGist(response.body as GitHubGist) };
      }
      return mapGistError(response.status, response.headers, "gists.update");
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
