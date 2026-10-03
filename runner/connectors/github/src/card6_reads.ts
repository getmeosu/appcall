import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

type RepoScope = { owner: string; repo: string };
type Page = { perPage?: number; page?: number };

export type NormalizedCodeOfConduct = {
  key: string;
  name: string;
  url: string;
  htmlUrl: string;
  body: string;
};

export type NormalizedAssignee = { id: number; login: string; type: string };

export type NormalizedPublicEvent = {
  id: string;
  type: string;
  actor: string;
  repo: string;
  public: boolean;
  createdAt: string;
};

export function validateGetCodeOfConductInput(input: unknown): { key: string } {
  if (!isRecord(input)) throw new Error("codes_of_conduct.get input must be an object");
  return { key: requireSingleSegment(input.key, "key") };
}

export function validateListRepoAssigneesInput(input: unknown): RepoScope & Page {
  if (!isRecord(input)) throw new Error("repos.assignees.list input must be an object");
  return {
    owner: requireSingleSegment(input.owner, "owner"),
    repo: requireSingleSegment(input.repo, "repo"),
    perPage: optionalPage(input.perPage, "perPage", 100),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

export function validateListPublicEventFeedInput(input: unknown): Page {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) throw new Error("events.public.list input must be an object");
  return {
    perPage: optionalPage(input.perPage, "perPage", 100),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

export function createCard6ReadsClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const client = options.githubClient ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation: "codes_of_conduct.get",
  });

  return {
    async getCodeOfConduct(input: unknown) {
      const payload = validateGetCodeOfConductInput(input);
      const response = await client.fetchJSON(`/codes_of_conduct/${encodeURIComponent(payload.key)}`);
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, codeOfConduct: normalizeCodeOfConduct(response.body) };
      }
      if (response.status === 404) return upstream("Code of conduct not found.");
      return mapRateOrUpstream(response, "GitHub rejected the get code of conduct request.");
    },

    async listRepoAssignees(input: unknown) {
      const payload = validateListRepoAssigneesInput(input);
      const response = await client.fetchJSON(`/repos/${encodeURIComponent(payload.owner)}/${encodeURIComponent(payload.repo)}/assignees${pageQuery(payload)}`);
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, assignees: response.body.filter(isRecord).map(normalizeAssignee) };
      }
      if (response.status === 404) return upstream("Repository assignees not found.");
      return mapRateOrUpstream(response, "GitHub rejected the list repository assignees request.");
    },

    async listPublicEvents(input: unknown) {
      const payload = validateListPublicEventFeedInput(input);
      const response = await client.fetchJSON(`/events${pageQuery(payload)}`);
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, events: response.body.filter(isRecord).map(normalizePublicEvent) };
      }
      if (response.status === 404) return upstream("Public events not found.");
      return mapRateOrUpstream(response, "GitHub rejected the list public events request.");
    },
  };
}

function normalizeCodeOfConduct(item: Record<string, unknown>): NormalizedCodeOfConduct {
  return {
    key: typeof item.key === "string" ? item.key : "",
    name: typeof item.name === "string" ? item.name : "",
    url: typeof item.url === "string" ? item.url : "",
    htmlUrl: typeof item.html_url === "string" ? item.html_url : "",
    body: typeof item.body === "string" ? item.body : "",
  };
}

function normalizeAssignee(item: Record<string, unknown>): NormalizedAssignee {
  return {
    id: typeof item.id === "number" ? item.id : 0,
    login: typeof item.login === "string" ? item.login : "",
    type: typeof item.type === "string" ? item.type : "",
  };
}

function normalizePublicEvent(item: Record<string, unknown>): NormalizedPublicEvent {
  const actor = isRecord(item.actor) ? item.actor : {};
  const repo = isRecord(item.repo) ? item.repo : {};
  return {
    id: item.id === undefined || item.id === null ? "" : String(item.id),
    type: typeof item.type === "string" ? item.type : "",
    actor: typeof actor.login === "string" ? actor.login : "",
    repo: typeof repo.name === "string" ? repo.name : "",
    public: item.public === true,
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
  };
}

function pageQuery(payload: Page): string {
  const params = new URLSearchParams();
  if (payload.perPage) params.set("per_page", String(payload.perPage));
  if (payload.page) params.set("page", String(payload.page));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
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
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  if (value.includes("/") || value.includes("?") || value.includes("#")) {
    throw new Error(`${field} must be a single path segment`);
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
