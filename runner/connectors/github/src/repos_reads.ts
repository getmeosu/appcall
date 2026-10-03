import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

type RepoScope = { owner: string; repo: string };
type AutolinkGet = RepoScope & { autolinkId: number };
type ReadmeGet = RepoScope & { ref?: string };
type ReadmeDirGet = RepoScope & { dir: string; ref?: string };
type AdvisoryGet = RepoScope & { ghsaId: string };
type OrgScope = { org: string; perPage?: number; page?: number };

export type NormalizedAutolink = {
  id: number;
  keyPrefix: string;
  urlTemplate: string;
  isAlphanumeric: boolean;
};

export type NormalizedReadme = {
  name: string;
  path: string;
  sha: string;
  size: number;
  encoding: string;
  content: string;
  htmlUrl: string;
  downloadUrl: string;
  type: string;
};

export type NormalizedSubscription = {
  subscribed: boolean;
  ignored: boolean;
  reason: string;
  createdAt: string;
  url: string;
  repositoryUrl: string;
};

export type NormalizedCommunityProfile = {
  healthPercentage: number;
  description: string;
  documentation: string;
  files: Record<string, unknown>;
  updatedAt: string;
};

export type NormalizedInteractionLimits = {
  limit: string;
  origin: string;
  expiresAt: string;
};

export type NormalizedSecurityAdvisory = {
  ghsaId: string;
  summary: string;
  description: string;
  severity: string;
  state: string;
  htmlUrl: string;
  publishedAt: string;
  updatedAt: string;
};

export type NormalizedRepoLicense = {
  name: string;
  path: string;
  sha: string;
  size: number;
  htmlUrl: string;
  downloadUrl: string;
  license: {
    key: string;
    name: string;
    spdxId: string;
    url: string;
  };
};

export type NormalizedAttestationRepository = {
  id: number;
  name: string;
  fullName: string;
};

export function validateGetAutolinkInput(input: unknown): AutolinkGet {
  if (!isRecord(input)) throw new Error("repos.autolinks.get input must be an object");
  return { ...repo(input), autolinkId: requireId(input.autolink_id ?? input.autolinkId, "autolink_id") };
}

export function validateGetReadmeInput(input: unknown): ReadmeGet {
  if (!isRecord(input)) throw new Error("repos.readme.get input must be an object");
  return { ...repo(input), ref: optionalString(input.ref, "ref") };
}

export function validateGetReadmeForDirInput(input: unknown): ReadmeDirGet {
  if (!isRecord(input)) throw new Error("repos.readme.get_for_dir input must be an object");
  return { ...repo(input), dir: requirePath(input.dir, "dir"), ref: optionalString(input.ref, "ref") };
}

export function validateGetSubscriptionInput(input: unknown): RepoScope {
  if (!isRecord(input)) throw new Error("repos.subscription.get input must be an object");
  return repo(input);
}

export function validateGetCommunityProfileInput(input: unknown): RepoScope {
  if (!isRecord(input)) throw new Error("repos.community.profile.get input must be an object");
  return repo(input);
}

export function validateGetInteractionLimitsInput(input: unknown): RepoScope {
  if (!isRecord(input)) throw new Error("repos.interaction_limits.get input must be an object");
  return repo(input);
}

export function validateGetSecurityAdvisoryInput(input: unknown): AdvisoryGet {
  if (!isRecord(input)) throw new Error("repos.security_advisories.get input must be an object");
  return { ...repo(input), ghsaId: requireGhsaId(input.ghsa_id ?? input.ghsaId, "ghsa_id") };
}

export function validateGetRepoLicenseInput(input: unknown): RepoScope {
  if (!isRecord(input)) throw new Error("repos.license.get input must be an object");
  return repo(input);
}

type PageScope = RepoScope & { perPage?: number; page?: number };
type PublicReposList = { since?: number; perPage?: number; page?: number };

export function validateListNetworkEventsInput(input: unknown): PageScope {
  return validateRepoPage(input, "repos.network.events.list");
}

export function validateListPublicRepositoriesInput(input: unknown): PublicReposList {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) throw new Error("repos.public.list input must be an object");
  return {
    since: optionalSince(input.since),
    perPage: optionalPage(input.perPage, "perPage", 100),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

export function validateListRepoActivityInput(input: unknown): PageScope {
  return validateRepoPage(input, "repos.activity.list");
}

export function validateListContributorsInput(input: unknown): PageScope {
  return validateRepoPage(input, "repos.contributors.list");
}

export function validateListRepoEventsInput(input: unknown): PageScope {
  return validateRepoPage(input, "repos.events.list");
}

export function validateListRepoLanguagesInput(input: unknown): RepoScope {
  if (!isRecord(input)) throw new Error("repos.languages.list input must be an object");
  return repo(input);
}

export function validateListRepoSecurityAdvisoriesInput(input: unknown): PageScope {
  return validateRepoPage(input, "repos.security_advisories.list");
}

export function validateGetRepoTopicsInput(input: unknown): RepoScope {
  if (!isRecord(input)) throw new Error("repos.topics.get input must be an object");
  return repo(input);
}

export function validateListOrgAttestationRepositoriesInput(input: unknown): OrgScope {
  if (!isRecord(input)) throw new Error("orgs.attestations.repositories.list input must be an object");
  return {
    org: requireSingleSegment(input.org, "org"),
    perPage: optionalPage(input.perPage, "perPage", 100),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

export function normalizeAutolink(item: Record<string, unknown>): NormalizedAutolink {
  return {
    id: typeof item.id === "number" ? item.id : 0,
    keyPrefix: typeof item.key_prefix === "string" ? item.key_prefix : "",
    urlTemplate: typeof item.url_template === "string" ? item.url_template : "",
    isAlphanumeric: item.is_alphanumeric === true,
  };
}

export function normalizeReadme(item: Record<string, unknown>): NormalizedReadme {
  return {
    name: typeof item.name === "string" ? item.name : "",
    path: typeof item.path === "string" ? item.path : "",
    sha: typeof item.sha === "string" ? item.sha : "",
    size: typeof item.size === "number" ? item.size : 0,
    encoding: typeof item.encoding === "string" ? item.encoding : "",
    content: typeof item.content === "string" ? item.content : "",
    htmlUrl: typeof item.html_url === "string" ? item.html_url : "",
    downloadUrl: typeof item.download_url === "string" ? item.download_url : "",
    type: typeof item.type === "string" ? item.type : "",
  };
}

export function normalizeSubscription(item: Record<string, unknown>): NormalizedSubscription {
  return {
    subscribed: item.subscribed === true,
    ignored: item.ignored === true,
    reason: typeof item.reason === "string" ? item.reason : "",
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
    url: typeof item.url === "string" ? item.url : "",
    repositoryUrl: typeof item.repository_url === "string" ? item.repository_url : "",
  };
}

export function normalizeCommunityProfile(item: Record<string, unknown>): NormalizedCommunityProfile {
  return {
    healthPercentage: typeof item.health_percentage === "number" ? item.health_percentage : 0,
    description: typeof item.description === "string" ? item.description : "",
    documentation: typeof item.documentation === "string" ? item.documentation : "",
    files: isRecord(item.files) ? item.files : {},
    updatedAt: typeof item.updated_at === "string" ? item.updated_at : "",
  };
}

export function normalizeInteractionLimits(item: Record<string, unknown>): NormalizedInteractionLimits {
  return {
    limit: typeof item.limit === "string" ? item.limit : "",
    origin: typeof item.origin === "string" ? item.origin : "",
    expiresAt: typeof item.expires_at === "string" ? item.expires_at : "",
  };
}

export function normalizeSecurityAdvisory(item: Record<string, unknown>): NormalizedSecurityAdvisory {
  return {
    ghsaId: typeof item.ghsa_id === "string" ? item.ghsa_id : "",
    summary: typeof item.summary === "string" ? item.summary : "",
    description: typeof item.description === "string" ? item.description : "",
    severity: typeof item.severity === "string" ? item.severity : "",
    state: typeof item.state === "string" ? item.state : "",
    htmlUrl: typeof item.html_url === "string" ? item.html_url : "",
    publishedAt: typeof item.published_at === "string" ? item.published_at : "",
    updatedAt: typeof item.updated_at === "string" ? item.updated_at : "",
  };
}

export function normalizeRepoLicense(item: Record<string, unknown>): NormalizedRepoLicense {
  const license = isRecord(item.license) ? item.license : {};
  return {
    name: typeof item.name === "string" ? item.name : "",
    path: typeof item.path === "string" ? item.path : "",
    sha: typeof item.sha === "string" ? item.sha : "",
    size: typeof item.size === "number" ? item.size : 0,
    htmlUrl: typeof item.html_url === "string" ? item.html_url : "",
    downloadUrl: typeof item.download_url === "string" ? item.download_url : "",
    license: {
      key: typeof license.key === "string" ? license.key : "",
      name: typeof license.name === "string" ? license.name : "",
      spdxId: typeof license.spdx_id === "string" ? license.spdx_id : "",
      url: typeof license.url === "string" ? license.url : "",
    },
  };
}

export function normalizeAttestationRepository(item: Record<string, unknown>): NormalizedAttestationRepository {
  return {
    id: typeof item.id === "number" ? item.id : 0,
    name: typeof item.name === "string" ? item.name : "",
    fullName: typeof item.full_name === "string" ? item.full_name : "",
  };
}

export function createReposReadsClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const client = options.githubClient ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation: "repos.readme.get",
  });

  return {
    async getAutolink(input: unknown) {
      const payload = validateGetAutolinkInput(input);
      const response = await client.fetchJSON(`${repoPath(payload)}/autolinks/${payload.autolinkId}`);
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, autolink: normalizeAutolink(response.body) };
      }
      if (response.status === 404) return upstream("Autolink not found.");
      return mapRateOrUpstream(response, "GitHub rejected the get autolink request.");
    },

    async getReadme(input: unknown) {
      const payload = validateGetReadmeInput(input);
      const response = await client.fetchJSON(`${repoPath(payload)}/readme${refQuery(payload.ref)}`);
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, readme: normalizeReadme(response.body) };
      }
      if (response.status === 404) return upstream("Repository README not found.");
      return mapRateOrUpstream(response, "GitHub rejected the get README request.");
    },

    async getReadmeForDir(input: unknown) {
      const payload = validateGetReadmeForDirInput(input);
      // Same segment encoding as repos.contents.get / contents path helpers.
      const encodedDir = payload.dir.split("/").map((segment) => encodeURIComponent(segment)).join("/");
      const response = await client.fetchJSON(`${repoPath(payload)}/readme/${encodedDir}${refQuery(payload.ref)}`);
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, readme: normalizeReadme(response.body) };
      }
      if (response.status === 404) return upstream("Directory README not found.");
      return mapRateOrUpstream(response, "GitHub rejected the get directory README request.");
    },

    async getSubscription(input: unknown) {
      const payload = validateGetSubscriptionInput(input);
      const response = await client.fetchJSON(`${repoPath(payload)}/subscription`);
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, subscription: normalizeSubscription(response.body) };
      }
      if (response.status === 404) return upstream("Repository subscription not found.");
      return mapRateOrUpstream(response, "GitHub rejected the get subscription request.");
    },

    async getCommunityProfile(input: unknown) {
      const payload = validateGetCommunityProfileInput(input);
      const response = await client.fetchJSON(`${repoPath(payload)}/community/profile`);
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, profile: normalizeCommunityProfile(response.body) };
      }
      if (response.status === 404) return upstream("Community profile not found.");
      return mapRateOrUpstream(response, "GitHub rejected the get community profile request.");
    },

    async getInteractionLimits(input: unknown) {
      const payload = validateGetInteractionLimitsInput(input);
      const response = await client.fetchJSON(`${repoPath(payload)}/interaction-limits`);
      // GitHub returns 200 with a body when limits are set, or 204 when none are set.
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, limits: normalizeInteractionLimits(response.body), present: true as const };
      }
      if (response.status === 204) {
        return {
          ok: true as const,
          limits: { limit: "", origin: "", expiresAt: "" },
          present: false as const,
        };
      }
      if (response.status === 404) return upstream("Repository interaction limits not found.");
      return mapRateOrUpstream(response, "GitHub rejected the get interaction limits request.");
    },

    async getSecurityAdvisory(input: unknown) {
      const payload = validateGetSecurityAdvisoryInput(input);
      const response = await client.fetchJSON(`${repoPath(payload)}/security-advisories/${encodeURIComponent(payload.ghsaId)}`);
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, advisory: normalizeSecurityAdvisory(response.body) };
      }
      if (response.status === 404) return upstream("Repository security advisory not found.");
      return mapRateOrUpstream(response, "GitHub rejected the get security advisory request.");
    },

    async getLicense(input: unknown) {
      const payload = validateGetRepoLicenseInput(input);
      const response = await client.fetchJSON(`${repoPath(payload)}/license`);
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, license: normalizeRepoLicense(response.body) };
      }
      if (response.status === 404) return upstream("Repository license not found.");
      return mapRateOrUpstream(response, "GitHub rejected the get repository license request.");
    },

    async listNetworkEvents(input: unknown) {
      const payload = validateListNetworkEventsInput(input);
      const response = await client.fetchJSON(`/networks/${encodeURIComponent(payload.owner)}/${encodeURIComponent(payload.repo)}/events${pageQuery(payload)}`);
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, events: response.body.filter(isRecord).map(normalizeRepoEvent) };
      }
      if (response.status === 404) return upstream("Network events not found.");
      return mapRateOrUpstream(response, "GitHub rejected the list network events request.");
    },

    async listPublicRepositories(input: unknown) {
      const payload = validateListPublicRepositoriesInput(input);
      const response = await client.fetchJSON(`/repositories${pageQuery(payload)}`);
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, repositories: response.body.filter(isRecord).map(normalizePublicRepository) };
      }
      if (response.status === 404) return upstream("Public repositories not found.");
      return mapRateOrUpstream(response, "GitHub rejected the list public repositories request.");
    },

    async listActivity(input: unknown) {
      const payload = validateListRepoActivityInput(input);
      const response = await client.fetchJSON(`${repoPath(payload)}/activity${pageQuery(payload)}`);
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, activity: response.body.filter(isRecord).map(normalizeRepoActivity) };
      }
      if (response.status === 404) return upstream("Repository activity not found.");
      return mapRateOrUpstream(response, "GitHub rejected the list repository activity request.");
    },

    async listContributors(input: unknown) {
      const payload = validateListContributorsInput(input);
      const response = await client.fetchJSON(`${repoPath(payload)}/contributors${pageQuery(payload)}`);
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, contributors: response.body.filter(isRecord).map(normalizeContributor) };
      }
      if (response.status === 404) return upstream("Repository contributors not found.");
      return mapRateOrUpstream(response, "GitHub rejected the list contributors request.");
    },

    async listEvents(input: unknown) {
      const payload = validateListRepoEventsInput(input);
      const response = await client.fetchJSON(`${repoPath(payload)}/events${pageQuery(payload)}`);
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, events: response.body.filter(isRecord).map(normalizeRepoEvent) };
      }
      if (response.status === 404) return upstream("Repository events not found.");
      return mapRateOrUpstream(response, "GitHub rejected the list repository events request.");
    },

    async listLanguages(input: unknown) {
      const payload = validateListRepoLanguagesInput(input);
      const response = await client.fetchJSON(`${repoPath(payload)}/languages`);
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, languages: normalizeLanguages(response.body) };
      }
      if (response.status === 404) return upstream("Repository languages not found.");
      return mapRateOrUpstream(response, "GitHub rejected the list repository languages request.");
    },

    async listSecurityAdvisories(input: unknown) {
      const payload = validateListRepoSecurityAdvisoriesInput(input);
      const response = await client.fetchJSON(`${repoPath(payload)}/security-advisories${pageQuery(payload)}`);
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, advisories: response.body.filter(isRecord).map(normalizeSecurityAdvisory) };
      }
      if (response.status === 404) return upstream("Repository security advisories not found.");
      return mapRateOrUpstream(response, "GitHub rejected the list security advisories request.");
    },

    async getTopics(input: unknown) {
      const payload = validateGetRepoTopicsInput(input);
      const response = await client.fetchJSON(`${repoPath(payload)}/topics`);
      if (response.status === 200 && isRecord(response.body) && Array.isArray(response.body.names)) {
        const names = response.body.names.filter((name): name is string => typeof name === "string");
        return { ok: true as const, names };
      }
      if (response.status === 404) return upstream("Repository topics not found.");
      return mapRateOrUpstream(response, "GitHub rejected the get repository topics request.");
    },

    async listOrgAttestationRepositories(input: unknown) {
      const payload = validateListOrgAttestationRepositoriesInput(input);
      const response = await client.fetchJSON(`/orgs/${encodeURIComponent(payload.org)}/attestations/repositories${pageQuery(payload)}`);
      if (response.status === 200) {
        const raw = Array.isArray(response.body)
          ? response.body
          : (isRecord(response.body) && Array.isArray(response.body.repositories) ? response.body.repositories : null);
        if (!raw) return upstream("GitHub rejected the list attestation repositories request.");
        const repositories = raw.filter(isRecord).map(normalizeAttestationRepository);
        const totalCount = isRecord(response.body) && typeof response.body.total_count === "number"
          ? response.body.total_count
          : repositories.length;
        return { ok: true as const, totalCount, repositories };
      }
      if (response.status === 404) return upstream("Organization or attestation repositories not found.");
      return mapRateOrUpstream(response, "GitHub rejected the list attestation repositories request.");
    },
  };
}

export type NormalizedRepoEvent = {
  id: string;
  type: string;
  actor: string;
  repo: string;
  public: boolean;
  createdAt: string;
};

export type NormalizedPublicRepository = {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
  description: string;
};

export type NormalizedRepoActivity = {
  id: number;
  activityType: string;
  timestamp: string;
  ref: string;
  actor: string;
};

export type NormalizedContributor = {
  login: string;
  id: number;
  contributions: number;
  type: string;
};

export function normalizeRepoEvent(item: Record<string, unknown>): NormalizedRepoEvent {
  const actor = isRecord(item.actor) ? item.actor : {};
  const repoName = isRecord(item.repo) ? item.repo : {};
  return {
    id: item.id === undefined || item.id === null ? "" : String(item.id),
    type: typeof item.type === "string" ? item.type : "",
    actor: typeof actor.login === "string" ? actor.login : "",
    repo: typeof repoName.name === "string" ? repoName.name : "",
    public: item.public === true,
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
  };
}

export function normalizePublicRepository(item: Record<string, unknown>): NormalizedPublicRepository {
  return {
    id: typeof item.id === "number" ? item.id : 0,
    name: typeof item.name === "string" ? item.name : "",
    fullName: typeof item.full_name === "string" ? item.full_name : "",
    private: item.private === true,
    htmlUrl: typeof item.html_url === "string" ? item.html_url : "",
    description: typeof item.description === "string" ? item.description : "",
  };
}

export function normalizeRepoActivity(item: Record<string, unknown>): NormalizedRepoActivity {
  const actor = isRecord(item.actor) ? item.actor : {};
  return {
    id: typeof item.id === "number" ? item.id : 0,
    activityType: typeof item.activity_type === "string" ? item.activity_type : "",
    timestamp: typeof item.timestamp === "string" ? item.timestamp : "",
    ref: typeof item.ref === "string" ? item.ref : "",
    actor: typeof actor.login === "string" ? actor.login : "",
  };
}

export function normalizeContributor(item: Record<string, unknown>): NormalizedContributor {
  return {
    login: typeof item.login === "string" ? item.login : "",
    id: typeof item.id === "number" ? item.id : 0,
    contributions: typeof item.contributions === "number" ? item.contributions : 0,
    type: typeof item.type === "string" ? item.type : "",
  };
}

export function normalizeLanguages(item: Record<string, unknown>): Record<string, number> {
  const languages: Record<string, number> = {};
  for (const [name, bytes] of Object.entries(item)) {
    if (typeof bytes === "number") languages[name] = bytes;
  }
  return languages;
}

function validateRepoPage(input: unknown, operation: string): PageScope {
  if (!isRecord(input)) throw new Error(`${operation} input must be an object`);
  return {
    ...repo(input),
    perPage: optionalPage(input.perPage, "perPage", 100),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

function optionalSince(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("since must be a non-negative integer");
  }
  return value;
}

function repo(input: Record<string, unknown>): RepoScope {
  return {
    owner: requireSingleSegment(input.owner, "owner"),
    repo: requireSingleSegment(input.repo, "repo"),
  };
}

function repoPath(payload: RepoScope): string {
  return `/repos/${encodeURIComponent(payload.owner)}/${encodeURIComponent(payload.repo)}`;
}

function refQuery(ref: string | undefined): string {
  if (!ref) return "";
  return `?${new URLSearchParams({ ref }).toString()}`;
}

function pageQuery(payload: { perPage?: number; page?: number; since?: number }): string {
  const params = new URLSearchParams();
  if (payload.since) params.set("since", String(payload.since));
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
  const text = requireString(value, field);
  if (text.includes("/") || text.includes("?") || text.includes("#")) {
    throw new Error(`${field} must be a single path segment`);
  }
  return text;
}

function requirePath(value: unknown, field: string): string {
  const text = requireString(value, field);
  if (text.includes("?") || text.includes("#") || text.startsWith("/") || text.includes("//") || text.includes("\\")) {
    throw new Error(`${field} must be a relative directory path`);
  }
  for (const segment of text.split("/")) {
    if (segment.length === 0 || segment === "." || segment === "..") {
      throw new Error(`${field} must be a relative directory path`);
    }
  }
  return text;
}

function requireGhsaId(value: unknown, field: string): string {
  const text = requireString(value, field);
  if (!/^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/i.test(text)) {
    throw new Error(`${field} must be a GHSA id`);
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

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  return requireString(value, field);
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
