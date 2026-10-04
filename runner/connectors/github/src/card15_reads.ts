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
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 404) return upstream("Emojis not found.");
      if (response.status === 401) return upstream("GitHub rejected the emojis.get request.");
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, emojis: response.body };
      }
      return upstream("GitHub rejected the emojis.get request.");
    },

    async getFeeds(input: unknown) {
      validateGetFeedsInput(input);
      const response = await client.fetchJSON("/feeds");
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 404) return upstream("Feeds not found.");
      if (response.status === 401) return upstream("GitHub rejected the feeds.get request.");
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, feeds: response.body };
      }
      return upstream("GitHub rejected the feeds.get request.");
    },

    async getMeta(input: unknown) {
      validateGetMetaInput(input);
      const response = await client.fetchJSON("/meta");
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 404) return upstream("Meta not found.");
      if (response.status === 401) return upstream("GitHub rejected the meta.get request.");
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, meta: response.body };
      }
      return upstream("GitHub rejected the meta.get request.");
    },

    async listMetaVersions(input: unknown) {
      validateListMetaVersionsInput(input);
      const response = await client.fetchJSON("/versions");
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 404) return upstream("API versions not found.");
      if (response.status === 401) return upstream("GitHub rejected the meta.versions.list request.");
      if (response.status === 200 && Array.isArray(response.body) && response.body.every((item) => typeof item === "string")) {
        return { ok: true as const, versions: response.body };
      }
      return upstream("GitHub rejected the meta.versions.list request.");
    },

    async getOctocat(input: unknown) {
      validateGetOctocatInput(input);
      const response = await client.fetchJSON("/octocat");
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 404) return upstream("GitHub octocat was not found.");
      if (response.status === 401) return upstream("GitHub rejected the meta.octocat.get request.");
      if (response.status === 200) {
        // Official docs: GET /octocat returns plain text, not JSON — same as GET /zen.
        const octocat = typeof response.body === "string" ? response.body : String(response.body ?? "");
        return { ok: true as const, octocat };
      }
      return upstream("GitHub rejected the meta.octocat.get request.");
    },
  };
}

function emptyInput(input: unknown, action: string): Record<string, never> {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) throw new Error(`${action} input must be an object`);
  return {};
}

function rate(status: number, headers: Record<string, string>) {
  const parsed = parseGitHubRateLimit(status, headers);
  if (!parsed.limited) return null;
  return {
    ok: false as const,
    error: {
      code: "CONNECTOR_RATE_LIMITED" as const,
      message: "GitHub rate limit exceeded.",
      retryAfterSeconds: parsed.retryAfterSeconds,
    },
  };
}

function upstream(message: string) {
  return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
