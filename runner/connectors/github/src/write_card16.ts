import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

type RepoScope = { owner: string; repo: string };
type AssetScope = RepoScope & { assetId: number };

type AssetUpdate = AssetScope & {
  name?: string;
  label?: string;
  state?: string;
};

export function validateDeleteReleaseAssetInput(input: unknown): AssetScope {
  if (!isRecord(input)) throw new Error("releases.assets.delete input must be an object");
  return {
    ...repoScope(input),
    assetId: requireId(input.assetId ?? input.asset_id, "assetId"),
  };
}

export function validateUpdateReleaseAssetInput(input: unknown): AssetUpdate {
  if (!isRecord(input)) throw new Error("releases.assets.update input must be an object");
  const out: AssetUpdate = {
    ...repoScope(input),
    assetId: requireId(input.assetId ?? input.asset_id, "assetId"),
  };
  if (input.name !== undefined) out.name = requireNonEmptyString(input.name, "name");
  if (input.label !== undefined) out.label = requireNonEmptyString(input.label, "label");
  if (input.state !== undefined) out.state = requireNonEmptyString(input.state, "state");
  return out;
}

export function createWriteCard16Client(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const base = options.githubClient;
  const clientFor = (operation: string) => base ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation,
  });

  return {
    async deleteReleaseAsset(input: unknown) {
      const payload = validateDeleteReleaseAssetInput(input);
      const response = await clientFor("releases.assets.delete").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/releases/assets/${payload.assetId}`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        { deleted: true, owner: payload.owner, repo: payload.repo, assetId: payload.assetId },
        "Release asset was not found.",
        "GitHub rejected the delete release asset request.",
      );
    },
    async updateReleaseAsset(input: unknown) {
      const payload = validateUpdateReleaseAssetInput(input);
      const body: Record<string, unknown> = {};
      if (payload.name !== undefined) body.name = payload.name;
      if (payload.label !== undefined) body.label = payload.label;
      if (payload.state !== undefined) body.state = payload.state;
      const response = await clientFor("releases.assets.update").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/releases/assets/${payload.assetId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      return jsonBody(response, [200], "asset", "Release asset was not found.", "GitHub rejected the update release asset request.");
    },
  };
}

function noContent(
  response: { status: number; headers: Record<string, string> },
  success: number,
  value: Record<string, unknown>,
  missing: string,
  rejected: string,
) {
  if (response.status === success) return { ok: true as const, ...value };
  if (response.status === 404) return upstream(missing);
  return mapRateOrUpstream(response, rejected);
}

function jsonBody(
  response: { status: number; headers: Record<string, string>; body: unknown },
  success: number[],
  key: string,
  missing: string,
  rejected: string,
) {
  if (success.includes(response.status) && isRecord(response.body)) {
    return { ok: true as const, [key]: response.body };
  }
  if (response.status === 404) return upstream(missing);
  return mapRateOrUpstream(response, rejected);
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

function repoScope(input: Record<string, unknown>): RepoScope {
  return {
    owner: requireSingleSegment(input.owner, "owner"),
    repo: requireSingleSegment(input.repo, "repo"),
  };
}

function seg(value: string): string {
  return encodeURIComponent(value);
}

function requireSingleSegment(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  if (value.includes("/") || value.includes("?") || value.includes("#")) {
    throw new Error(`${field} must be a single path segment`);
  }
  return value;
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function requireId(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
