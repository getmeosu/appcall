import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";
import { normalizeGitHubUser, type GitHubUser } from "./users";

type SincePage = { since?: number; perPage?: number };

export function validateListUsersInput(input: unknown): SincePage {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) throw new Error("users.list input must be an object");
  return {
    since: optionalNonNegative(input.since, "since"),
    perPage: optionalPage(input.perPage, "perPage"),
  };
}

export function createCorrectnessCard18Client(options: {
  accessToken: string;
  fetch?: typeof fetch;
  githubClient?: GitHubClient;
}) {
  const base = options.githubClient;
  const clientFor = (operation: string) =>
    base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation });

  return {
    async listUsers(input: unknown) {
      const payload = validateListUsersInput(input);
      const params = new URLSearchParams();
      if (payload.since !== undefined) params.set("since", String(payload.since));
      if (payload.perPage) params.set("per_page", String(payload.perPage));
      const qs = params.toString() ? `?${params.toString()}` : "";
      const client = clientFor("users.list");
      const response = await client.fetchJSON(`/users${qs}`);
      const rate = parseGitHubRateLimit(response.status, response.headers);
      if (rate.limited) {
        return {
          ok: false as const,
          error: {
            code: "CONNECTOR_RATE_LIMITED" as const,
            message: "GitHub rate limit exceeded",
            retryAfterSeconds: rate.retryAfterSeconds,
          },
        };
      }
      if (response.status === 200 && Array.isArray(response.body)) {
        return {
          ok: true as const,
          users: (response.body as GitHubUser[]).map(normalizeGitHubUser),
        };
      }
      if (response.status === 404) {
        return {
          ok: false as const,
          error: {
            code: "CONNECTOR_UPSTREAM_ERROR" as const,
            message: "GitHub users list was not found.",
            retryAfterSeconds: undefined as number | undefined,
          },
        };
      }
      return {
        ok: false as const,
        error: {
          code: "CONNECTOR_UPSTREAM_ERROR" as const,
          message: `GitHub users.list failed with status ${response.status}`,
          retryAfterSeconds: undefined as number | undefined,
        },
      };
    },
  };
}

function optionalNonNegative(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be an integer greater than or equal to 0`);
  }
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
