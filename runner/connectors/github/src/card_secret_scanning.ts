import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

type Page = { perPage?: number; page?: number };

export type GetSecretScanningAlertInput = {
  owner: string;
  repo: string;
  alertNumber: number;
};

export type ListSecretScanningAlertLocationsInput = GetSecretScanningAlertInput & Page;

export type ListOrgSecretScanningAlertsInput = {
  org: string;
  state?: "open" | "resolved";
} & Page;

export type ListSecretScanningPatternsInput = {
  owner: string;
  repo: string;
} & Page;

const RESOLUTIONS = ["false_positive", "wont_fix", "revoked", "used_in_tests"] as const;
type Resolution = (typeof RESOLUTIONS)[number];

export type UpdateSecretScanningAlertInput = GetSecretScanningAlertInput & {
  state: "open" | "resolved";
  resolution?: Resolution;
  resolutionComment?: string;
};

export type SecretScanningPatternToCreate = {
  name: string;
  pattern: string;
  startDelimiter?: string;
  endDelimiter?: string;
  mustMatch?: string[];
  mustNotMatch?: string[];
};

export type CreateSecretScanningPatternsInput = {
  owner: string;
  repo: string;
  patterns: SecretScanningPatternToCreate[];
};

export type NormalizedSecretScanningAlert = {
  number: number;
  state: string;
  secretType: string;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type NormalizedOrgSecretScanningAlert = NormalizedSecretScanningAlert & {
  repositoryFullName: string;
};

export type NormalizedSecretScanningLocation = {
  type: string;
  path: string;
  startLine: number;
  endLine: number;
  commitSha: string;
  htmlUrl: string;
};

export type NormalizedSecretScanningPattern = {
  id: number;
  name: string;
  pattern: string;
  slug: string;
  state: string;
  pushProtectionEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export function validateGetSecretScanningAlertInput(input: unknown): GetSecretScanningAlertInput {
  if (!isRecord(input)) throw new Error("secret_scanning.alerts.get input must be an object");
  return {
    ...repoScope(input),
    alertNumber: requireId(input.alertNumber, "alertNumber"),
  };
}

export function validateListSecretScanningAlertLocationsInput(input: unknown): ListSecretScanningAlertLocationsInput {
  if (!isRecord(input)) throw new Error("secret_scanning.alerts.locations.list input must be an object");
  return {
    ...validateGetSecretScanningAlertInput(input),
    ...pageInput(input),
  };
}

export function validateListOrgSecretScanningAlertsInput(input: unknown): ListOrgSecretScanningAlertsInput {
  if (!isRecord(input)) throw new Error("orgs.secret_scanning.alerts.list input must be an object");
  const state = input.state;
  if (state !== undefined && state !== "open" && state !== "resolved") {
    throw new Error("state must be open or resolved");
  }
  return {
    org: requireSingleSegment(input.org, "org"),
    state,
    ...pageInput(input),
  };
}

export function validateListSecretScanningPatternsInput(input: unknown): ListSecretScanningPatternsInput {
  if (!isRecord(input)) throw new Error("secret_scanning.patterns.list input must be an object");
  return { ...repoScope(input), ...pageInput(input) };
}

export function validateUpdateSecretScanningAlertInput(input: unknown): UpdateSecretScanningAlertInput {
  if (!isRecord(input)) throw new Error("secret_scanning.alerts.update input must be an object");
  const state = input.state;
  if (state !== "open" && state !== "resolved") throw new Error("state must be open or resolved");
  const resolution = typeof input.resolution === "string" ? input.resolution : undefined;
  if (state === "resolved") {
    if (!resolution || !RESOLUTIONS.includes(resolution as Resolution)) {
      throw new Error("resolution is required when state is resolved");
    }
  } else if (resolution !== undefined) {
    throw new Error("resolution is only valid when state is resolved");
  }
  return {
    ...validateGetSecretScanningAlertInput(input),
    state,
    resolution: resolution as Resolution | undefined,
    resolutionComment: typeof input.resolutionComment === "string" ? input.resolutionComment : undefined,
  };
}

export function validateCreateSecretScanningPatternsInput(input: unknown): CreateSecretScanningPatternsInput {
  if (!isRecord(input)) throw new Error("secret_scanning.patterns.create input must be an object");
  if (!Array.isArray(input.patterns) || input.patterns.length < 1 || input.patterns.length > 100) {
    throw new Error("patterns must be a non-empty array of at most 100 items");
  }
  return {
    ...repoScope(input),
    patterns: input.patterns.map((item, index) => validatePatternToCreate(item, index)),
  };
}

export function normalizeSecretScanningAlert(item: Record<string, unknown>): NormalizedSecretScanningAlert {
  return {
    number: typeof item.number === "number" ? item.number : 0,
    state: typeof item.state === "string" ? item.state : "",
    secretType: typeof item.secret_type === "string" ? item.secret_type : "",
    htmlUrl: typeof item.html_url === "string" ? item.html_url : "",
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
    updatedAt: typeof item.updated_at === "string" ? item.updated_at : "",
  };
}

export function normalizeOrgSecretScanningAlert(item: Record<string, unknown>): NormalizedOrgSecretScanningAlert {
  const repository = isRecord(item.repository) ? item.repository : {};
  return {
    ...normalizeSecretScanningAlert(item),
    repositoryFullName: typeof repository.full_name === "string" ? repository.full_name : "",
  };
}

export function normalizeSecretScanningLocation(item: Record<string, unknown>): NormalizedSecretScanningLocation {
  const details = isRecord(item.details) ? item.details : {};
  return {
    type: typeof item.type === "string" ? item.type : "",
    path: typeof details.path === "string" ? details.path : "",
    startLine: typeof details.start_line === "number" ? details.start_line : 0,
    endLine: typeof details.end_line === "number" ? details.end_line : 0,
    commitSha: typeof details.commit_sha === "string" ? details.commit_sha : "",
    htmlUrl: typeof details.html_url === "string" ? details.html_url : "",
  };
}

export function normalizeSecretScanningPattern(item: Record<string, unknown>): NormalizedSecretScanningPattern {
  return {
    id: typeof item.id === "number" ? item.id : 0,
    name: typeof item.name === "string" ? item.name : "",
    pattern: typeof item.pattern === "string" ? item.pattern : "",
    slug: typeof item.slug === "string" ? item.slug : "",
    state: typeof item.state === "string" ? item.state : "",
    pushProtectionEnabled: item.push_protection_enabled === true,
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
    updatedAt: typeof item.updated_at === "string" ? item.updated_at : "",
  };
}

export function createSecretScanningClient(options: {
  accessToken: string;
  fetch?: typeof fetch;
  githubClient?: GitHubClient;
}) {
  const client = options.githubClient ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation: "secret_scanning.alerts.get",
  });

  return {
    async getAlert(input: unknown) {
      const payload = validateGetSecretScanningAlertInput(input);
      const response = await client.fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/secret-scanning/alerts/${payload.alertNumber}`,
      );
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, alert: normalizeSecretScanningAlert(response.body) };
      }
      if (response.status === 404) return upstream("Secret scanning alert not found.");
      return mapRateOrUpstream(response, "GitHub rejected the secret scanning alert request.");
    },

    async listAlertLocations(input: unknown) {
      const payload = validateListSecretScanningAlertLocationsInput(input);
      const response = await client.fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/secret-scanning/alerts/${payload.alertNumber}/locations${query(pageQuery(payload))}`,
      );
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, locations: response.body.filter(isRecord).map(normalizeSecretScanningLocation) };
      }
      if (response.status === 404) return upstream("Secret scanning alert locations not found.");
      return mapRateOrUpstream(response, "GitHub rejected the secret scanning locations request.");
    },

    async listOrgAlerts(input: unknown) {
      const payload = validateListOrgSecretScanningAlertsInput(input);
      const response = await client.fetchJSON(
        `/orgs/${encodeURIComponent(payload.org)}/secret-scanning/alerts${query({
          state: payload.state,
          per_page: payload.perPage,
          page: payload.page,
        })}`,
      );
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, alerts: response.body.filter(isRecord).map(normalizeOrgSecretScanningAlert) };
      }
      if (response.status === 404) return upstream("Organization secret scanning alerts not found.");
      return mapRateOrUpstream(response, "GitHub rejected the organization secret scanning alerts request.");
    },

    async listPatterns(input: unknown) {
      const payload = validateListSecretScanningPatternsInput(input);
      const response = await client.fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/secret-scanning/custom-patterns${query(pageQuery(payload))}`,
      );
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, patterns: response.body.filter(isRecord).map(normalizeSecretScanningPattern) };
      }
      if (response.status === 404) return upstream("Repository secret scanning custom patterns not found.");
      return mapRateOrUpstream(response, "GitHub rejected the secret scanning custom patterns request.");
    },

    async updateAlert(input: unknown) {
      const payload = validateUpdateSecretScanningAlertInput(input);
      const body: Record<string, unknown> = { state: payload.state };
      if (payload.resolution !== undefined) body.resolution = payload.resolution;
      if (payload.resolutionComment !== undefined) body.resolution_comment = payload.resolutionComment;
      const response = await client.fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/secret-scanning/alerts/${payload.alertNumber}`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, alert: normalizeSecretScanningAlert(response.body) };
      }
      if (response.status === 404) return upstream("Secret scanning alert not found.");
      return mapRateOrUpstream(response, "GitHub rejected the secret scanning alert update.");
    },

    async createPatterns(input: unknown) {
      const payload = validateCreateSecretScanningPatternsInput(input);
      const body = {
        patterns: payload.patterns.map((pattern) => {
          const item: Record<string, unknown> = { name: pattern.name, pattern: pattern.pattern };
          if (pattern.startDelimiter !== undefined) item.start_delimiter = pattern.startDelimiter;
          if (pattern.endDelimiter !== undefined) item.end_delimiter = pattern.endDelimiter;
          if (pattern.mustMatch !== undefined) item.must_match = pattern.mustMatch;
          if (pattern.mustNotMatch !== undefined) item.must_not_match = pattern.mustNotMatch;
          return item;
        }),
      };
      const response = await client.fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/secret-scanning/custom-patterns`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
      if ((response.status === 200 || response.status === 201) && isRecord(response.body) && Array.isArray(response.body.created_patterns)) {
        return { ok: true as const, patterns: response.body.created_patterns.filter(isRecord).map(normalizeSecretScanningPattern) };
      }
      if (response.status === 404) return upstream("Repository secret scanning custom patterns not found.");
      return mapRateOrUpstream(response, "GitHub rejected the secret scanning custom pattern create.");
    },
  };
}

function validatePatternToCreate(value: unknown, index: number): SecretScanningPatternToCreate {
  if (!isRecord(value)) throw new Error(`patterns[${index}] must be an object`);
  const name = requireString(value.name, `patterns[${index}].name`);
  const pattern = requireString(value.pattern, `patterns[${index}].pattern`);
  const created: SecretScanningPatternToCreate = { name, pattern };
  if (typeof value.startDelimiter === "string") created.startDelimiter = value.startDelimiter;
  if (typeof value.endDelimiter === "string") created.endDelimiter = value.endDelimiter;
  const mustMatch = stringArray(value.mustMatch);
  const mustNotMatch = stringArray(value.mustNotMatch);
  if (mustMatch !== undefined) created.mustMatch = mustMatch;
  if (mustNotMatch !== undefined) created.mustNotMatch = mustNotMatch;
  return created;
}

function stringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error("mustMatch and mustNotMatch must be string arrays");
  }
  return value;
}

function pageQuery(payload: Page): Record<string, number | undefined> {
  return { per_page: payload.perPage, page: payload.page };
}

function query(fields: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

function repoPath(owner: string, repo: string): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function repoScope(input: Record<string, unknown>): { owner: string; repo: string } {
  return {
    owner: requireSingleSegment(input.owner, "owner"),
    repo: requireSingleSegment(input.repo, "repo"),
  };
}

function pageInput(input: Record<string, unknown>): Page {
  return {
    perPage: optionalPage(input.perPage, "perPage", 100),
    page: optionalPage(input.page, "page", 1_000_000),
  };
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
  const text = requireString(value, field);
  if (text.includes("/") || text.includes("?") || text.includes("#")) {
    throw new Error(`${field} must be a single path segment`);
  }
  return text;
}

function requireId(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
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
