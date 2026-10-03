import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";
import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

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


export type GitHubReleaseAsset = {
  id: number;
  name?: string;
  label?: string | null;
  content_type?: string;
  size?: number;
  download_count?: number;
  browser_download_url?: string;
  state?: string;
  created_at?: string;
  updated_at?: string;
  uploader?: { login?: string };
  [key: string]: unknown;
};

export type NormalizedReleaseAsset = {
  id: string;
  provider: "github";
  providerAssetId: number;
  name: string;
  label: string;
  contentType: string;
  size: number;
  downloadCount: number;
  downloadUrl: string;
  state: string;
  uploader: string;
  createdAt: string;
  updatedAt: string;
  modelVersion: "2026-05-16";
  raw: GitHubReleaseAsset;
};

export function normalizeGitHubReleaseAsset(asset: GitHubReleaseAsset): NormalizedReleaseAsset {
  return {
    id: `gh-release-asset:${asset.id}`,
    provider: "github",
    providerAssetId: asset.id,
    name: asset.name ?? "",
    label: typeof asset.label === "string" ? asset.label : "",
    contentType: asset.content_type ?? "",
    size: typeof asset.size === "number" ? asset.size : 0,
    downloadCount: typeof asset.download_count === "number" ? asset.download_count : 0,
    downloadUrl: asset.browser_download_url ?? "",
    state: asset.state ?? "",
    uploader: asset.uploader?.login ?? "",
    createdAt: asset.created_at ?? "",
    updatedAt: asset.updated_at ?? "",
    modelVersion: "2026-05-16",
    raw: asset,
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


export type ListReleasesInput = {
  owner: string;
  repo: string;
  perPage?: number;
  page?: number;
};

export function validateListReleasesInput(input: unknown): ListReleasesInput {
  if (!isRecord(input)) throw new Error("releases.list input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    perPage: optionalPage(input.perPage, "perPage"),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

export type GetReleaseInput = { owner: string; repo: string; releaseId: number };

export function validateGetReleaseInput(input: unknown): GetReleaseInput {
  if (!isRecord(input)) throw new Error("releases.get input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    releaseId: requireNumber(input.releaseId, "releaseId"),
  };
}

export type GetLatestReleaseInput = { owner: string; repo: string };

export function validateGetLatestReleaseInput(input: unknown): GetLatestReleaseInput {
  if (!isRecord(input)) throw new Error("releases.get_latest input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
  };
}

export type GetReleaseByTagInput = { owner: string; repo: string; tag: string };

export function validateGetReleaseByTagInput(input: unknown): GetReleaseByTagInput {
  if (!isRecord(input)) throw new Error("releases.get_by_tag input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    tag: requireString(input.tag, "tag"),
  };
}

export type UpdateReleaseInput = {
  owner: string;
  repo: string;
  releaseId: number;
  tagName?: string;
  name?: string;
  body?: string;
  draft?: boolean;
  prerelease?: boolean;
  targetCommitish?: string;
};

export function validateUpdateReleaseInput(input: unknown): UpdateReleaseInput {
  if (!isRecord(input)) throw new Error("releases.update input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    releaseId: requireNumber(input.releaseId, "releaseId"),
    tagName: typeof input.tagName === "string" ? input.tagName : undefined,
    name: typeof input.name === "string" ? input.name : undefined,
    body: typeof input.body === "string" ? input.body : undefined,
    draft: typeof input.draft === "boolean" ? input.draft : undefined,
    prerelease: typeof input.prerelease === "boolean" ? input.prerelease : undefined,
    targetCommitish: typeof input.targetCommitish === "string" ? input.targetCommitish : undefined,
  };
}

export type ListReleaseAssetsInput = {
  owner: string;
  repo: string;
  releaseId: number;
  perPage?: number;
  page?: number;
};

export function validateListReleaseAssetsInput(input: unknown): ListReleaseAssetsInput {
  if (!isRecord(input)) throw new Error("releases.assets.list input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    releaseId: requireNumber(input.releaseId, "releaseId"),
    perPage: optionalPage(input.perPage, "perPage"),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}


export type GenerateReleaseNotesInput = {
  owner: string;
  repo: string;
  tagName: string;
  targetCommitish?: string;
  previousTagName?: string;
  configurationFilePath?: string;
};

export function validateGenerateReleaseNotesInput(input: unknown): GenerateReleaseNotesInput {
  if (!isRecord(input)) throw new Error("releases.generate_notes input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    tagName: requireString(input.tagName, "tagName"),
    targetCommitish: optionalPlain(input.targetCommitish, "targetCommitish"),
    previousTagName: optionalPlain(input.previousTagName, "previousTagName"),
    configurationFilePath: optionalPlain(input.configurationFilePath, "configurationFilePath"),
  };
}

export type DeleteReleaseInput = { owner: string; repo: string; releaseId: number };

export function validateDeleteReleaseInput(input: unknown): DeleteReleaseInput {
  if (!isRecord(input)) throw new Error("releases.delete input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    releaseId: requireNumber(input.releaseId, "releaseId"),
  };
}

export type GetReleaseAssetInput = {
  owner: string;
  repo: string;
  assetId?: number;
  releaseId?: number;
  name?: string;
};

export function validateGetReleaseAssetInput(input: unknown): GetReleaseAssetInput {
  if (!isRecord(input)) throw new Error("releases.assets.get input must be an object");
  const assetId = optionalPositive(input.assetId, "assetId") ?? optionalPositive(input.id, "id");
  const releaseId = optionalPositive(input.releaseId, "releaseId");
  const name = optionalPlain(input.name, "name");
  if (assetId === undefined && (releaseId === undefined || !name)) {
    throw new Error("assetId or releaseId and name is required");
  }
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    assetId,
    releaseId,
    name,
  };
}

export type UploadReleaseAssetInput = {
  owner: string;
  repo: string;
  releaseId: number;
  name: string;
  contentType: string;
  label?: string;
  bytes: Uint8Array;
};

export function validateUploadReleaseAssetInput(input: unknown): UploadReleaseAssetInput {
  if (!isRecord(input)) throw new Error("releases.assets.upload input must be an object");
  const hasB64 = input.contentBase64 !== undefined;
  const hasText = input.content !== undefined;
  if (hasB64 === hasText) throw new Error("exactly one of contentBase64 or content is required");
  let bytes: Uint8Array;
  if (hasB64) {
    if (typeof input.contentBase64 !== "string" || input.contentBase64.length === 0) throw new Error("contentBase64 is required");
    bytes = decodeBase64(input.contentBase64);
  } else {
    if (typeof input.content !== "string") throw new Error("content must be a string");
    bytes = new TextEncoder().encode(input.content);
  }
  if (bytes.byteLength === 0) throw new Error("asset content must not be empty");
  const contentType = requireString(input.contentType, "contentType");
  if (/[\r\n;]/.test(contentType)) throw new Error("contentType must be a media type");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    releaseId: requireNumber(input.releaseId, "releaseId"),
    name: requireString(input.name, "name"),
    contentType,
    label: optionalPlain(input.label, "label"),
    bytes,
  };
}

// ─── Client ───────────────────────────────────────────────────────────────────

function mapReleaseError(status: number, headers: Headers, action: string) {
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

export function createReleasesClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const base = options.githubClient;

  return {
    async create(input: unknown) {
      const payload = validateCreateReleaseInput(input);
      const client = base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "releases.create" });
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
      return mapReleaseError(response.status, response.headers, "releases.create");
    },

    async list(input: unknown) {
      const payload = validateListReleasesInput(input);
      const client = base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "releases.list" });
      const params = new URLSearchParams();
      if (payload.perPage) params.set("per_page", String(payload.perPage));
      if (payload.page) params.set("page", String(payload.page));
      const qs = params.toString() ? `?${params.toString()}` : "";
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/releases${qs}`);
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, releases: (response.body as GitHubRelease[]).map(normalizeGitHubRelease) };
      }
      return mapReleaseError(response.status, response.headers, "releases.list");
    },

    async get(input: unknown) {
      const payload = validateGetReleaseInput(input);
      const client = base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "releases.get" });
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/releases/${payload.releaseId}`);
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, release: normalizeGitHubRelease(response.body as GitHubRelease) };
      }
      return mapReleaseError(response.status, response.headers, "releases.get");
    },

    async getLatest(input: unknown) {
      const payload = validateGetLatestReleaseInput(input);
      const client = base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "releases.get_latest" });
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/releases/latest`);
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, release: normalizeGitHubRelease(response.body as GitHubRelease) };
      }
      return mapReleaseError(response.status, response.headers, "releases.get_latest");
    },

    async getByTag(input: unknown) {
      const payload = validateGetReleaseByTagInput(input);
      const client = base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "releases.get_by_tag" });
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/releases/tags/${encodeURIComponent(payload.tag)}`);
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, release: normalizeGitHubRelease(response.body as GitHubRelease) };
      }
      return mapReleaseError(response.status, response.headers, "releases.get_by_tag");
    },

    async update(input: unknown) {
      const payload = validateUpdateReleaseInput(input);
      const client = base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "releases.update" });
      const body: Record<string, unknown> = {};
      if (payload.tagName !== undefined) body.tag_name = payload.tagName;
      if (payload.name !== undefined) body.name = payload.name;
      if (payload.body !== undefined) body.body = payload.body;
      if (payload.draft !== undefined) body.draft = payload.draft;
      if (payload.prerelease !== undefined) body.prerelease = payload.prerelease;
      if (payload.targetCommitish !== undefined) body.target_commitish = payload.targetCommitish;
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/releases/${payload.releaseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, release: normalizeGitHubRelease(response.body as GitHubRelease) };
      }
      return mapReleaseError(response.status, response.headers, "releases.update");
    },

    async listAssets(input: unknown) {
      const payload = validateListReleaseAssetsInput(input);
      const client = base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "releases.assets.list" });
      const params = new URLSearchParams();
      if (payload.perPage) params.set("per_page", String(payload.perPage));
      if (payload.page) params.set("page", String(payload.page));
      const qs = params.toString() ? `?${params.toString()}` : "";
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/releases/${payload.releaseId}/assets${qs}`);
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, assets: (response.body as GitHubReleaseAsset[]).map(normalizeGitHubReleaseAsset) };
      }
      return mapReleaseError(response.status, response.headers, "releases.assets.list");
    },

    async generateNotes(input: unknown) {
      const payload = validateGenerateReleaseNotesInput(input);
      const client = base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "releases.generate_notes" });
      const body: Record<string, unknown> = { tag_name: payload.tagName };
      if (payload.targetCommitish !== undefined) body.target_commitish = payload.targetCommitish;
      if (payload.previousTagName !== undefined) body.previous_tag_name = payload.previousTagName;
      if (payload.configurationFilePath !== undefined) body.configuration_file_path = payload.configurationFilePath;
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/releases/generate-notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 200 && isRecord(response.body)) {
        return {
          ok: true as const,
          name: typeof response.body.name === "string" ? response.body.name : "",
          body: typeof response.body.body === "string" ? response.body.body : "",
        };
      }
      return mapReleaseError(response.status, response.headers, "releases.generate_notes");
    },

    async delete(input: unknown) {
      const payload = validateDeleteReleaseInput(input);
      const client = base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "releases.delete" });
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/releases/${payload.releaseId}`, { method: "DELETE" });
      if (response.status === 204 || response.status === 404) {
        return { ok: true as const, deleted: true as const, releaseId: payload.releaseId };
      }
      return mapReleaseError(response.status, response.headers, "releases.delete");
    },

    async getAsset(input: unknown) {
      const payload = validateGetReleaseAssetInput(input);
      const client = base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "releases.assets.get" });
      if (payload.assetId !== undefined) {
        const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/releases/assets/${payload.assetId}`);
        if (response.status === 200 && isRecord(response.body)) {
          return { ok: true as const, asset: normalizeGitHubReleaseAsset(response.body as GitHubReleaseAsset) };
        }
        return mapReleaseError(response.status, response.headers, "releases.assets.get");
      }
      for (let page = 1; page <= 10; page++) {
        const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/releases/${payload.releaseId}/assets?per_page=100&page=${page}`);
        if (response.status !== 200 || !Array.isArray(response.body)) {
          return mapReleaseError(response.status, response.headers, "releases.assets.get");
        }
        const assets = response.body as GitHubReleaseAsset[];
        const match = assets.find((asset) => asset.name === payload.name);
        if (match) return { ok: true as const, asset: normalizeGitHubReleaseAsset(match) };
        if (assets.length < 100) break;
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Not found for releases.assets.get." } };
    },

    async uploadAsset(input: unknown) {
      const payload = validateUploadReleaseAssetInput(input);
      const params = new URLSearchParams({ name: payload.name });
      if (payload.label) params.set("label", payload.label);
      const url = `https://uploads.github.com/repos/${payload.owner}/${payload.repo}/releases/${payload.releaseId}/assets?${params.toString()}`;
      const spec = (manifest.operations as Record<string, { maxResponseBytes?: number; timeoutMs?: number }>)["releases.assets.upload"];
      const http = createConnectorHttpClient({
        allowedHosts: manifest.network.allowedHosts as string[],
        maxResponseBytes: spec?.maxResponseBytes ?? 1048576,
        timeoutMs: spec?.timeoutMs ?? 15000,
        fetch: options.fetch,
      });
      const response = await http.fetchText(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.accessToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": payload.contentType,
        },
        body: payload.bytes,
      });
      let parsed: unknown = response.body;
      try { parsed = JSON.parse(response.body); } catch { /* keep text */ }
      const headers = response.headers;
      if ((response.status === 201 || response.status === 200) && isRecord(parsed)) {
        return { ok: true as const, asset: normalizeGitHubReleaseAsset(parsed as GitHubReleaseAsset) };
      }
      return mapReleaseError(response.status, headers, "releases.assets.upload");
    },
  };
}


function optionalPlain(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0 || /[\r\n]/.test(value)) throw new Error(`${field} must be a non-empty string`);
  return value;
}

function optionalPositive(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${field} must be a positive integer`);
    return value;
  }
  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) {
    const asBig = BigInt(value);
    if (asBig > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${field} must be a positive integer`);
    return Number(asBig);
  }
  throw new Error(`${field} must be a positive integer`);
}

function decodeBase64(value: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) throw new Error("contentBase64 must be valid base64");
  const buf = Buffer.from(value, "base64");
  if (buf.toString("base64").replace(/=+$/, "") !== value.replace(/=+$/, "")) throw new Error("contentBase64 must be valid base64");
  return new Uint8Array(buf);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function optionalPage(value: unknown, field: string, max = 100): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${field} must be an integer between 1 and ${max}`);
  }
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new Error(`${field} is required`);
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
