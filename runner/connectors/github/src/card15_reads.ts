import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

export function validateGetEmojisInput(input: unknown): Record<string, never> {
  return emptyInput(input, "emojis.get");
}

export function validateGetFeedsInput(input: unknown): Record<string, never> {
  return emptyInput(input, "feeds.get");
}

export function validateGetMetaInput(input: unknown): Record<string, never> {
  return emptyInput(input, "meta.get");
}

export function validateListMetaVersionsInput(input: unknown): Record<string, never> {
  return emptyInput(input, "meta.versions.list");
}

export function validateGetOctocatInput(input: unknown): Record<string, never> {
  return emptyInput(input, "meta.octocat.get");
}

export function createCard15ReadsClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const client = options.githubClient ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation: "emojis.get",
  });

  return {
    async getEmojis(input: unknown) {
      validateGetEmojisInput(input);
      const response = await client.fetchJSON("/emojis");
      return readObject(response, "emojis", "Emojis not found.", "GitHub rejected the get emojis request.");
    },
    async getFeeds(input: unknown) {
      validateGetFeedsInput(input);
      const response = await client.fetchJSON("/feeds");
      return readObject(response, "feeds", "Feeds not found.", "GitHub rejected the get feeds request.");
    },
    async getMeta(input: unknown) {
      validateGetMetaInput(input);
      const response = await client.fetchJSON("/meta");
      return readObject(response, "meta", "Meta not found.", "GitHub rejected the get meta request.");
    },
    async listMetaVersions(input: unknown) {
      validateListMetaVersionsInput(input);
      const response = await client.fetchJSON("/versions");
      if (response.status === 200 && Array.isArray(response.body) && response.body.every((item) => typeof item === "string")) {
        return { ok: true as const, versions: response.body };
      }
      if (response.status === 404) return upstream("API versions not found.");
      return mapRateOrUpstream(response, "GitHub rejected the list API versions request.");
    },
    async getOctocat(input: unknown) {
      validateGetOctocatInput(input);
      const response = await client.fetchJSON("/octocat");
      // GET /octocat is text/plain. fetchJSON keeps a non-JSON body as the raw string.
      if (response.status === 200 && typeof response.body === "string") {
        return { ok: true as const, octocat: response.body };
      }
      if (response.status === 404) return upstream("Octocat not found.");
      return mapRateOrUpstream(response, "GitHub rejected the get octocat request.");
    },
  };
}

function readObject(response: { status: number; headers: Record<string, string>; body: unknown }, field: string, missing: string, rejected: string) {
  if (response.status === 200 && isRecord(response.body)) return { ok: true as const, [field]: response.body };
  if (response.status === 404) return upstream(missing);
  return mapRateOrUpstream(response, rejected);
}

function emptyInput(input: unknown, action: string): Record<string, never> {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) throw new Error(`${action} input must be an object`);
  return {};
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
