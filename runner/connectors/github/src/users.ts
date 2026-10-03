import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";
import { normalizeGitHubRepo, type GitHubRepo } from "./repos";

export type GitHubUser = {
  id: number;
  login: string;
  name?: string | null;
  email?: string | null;
  bio?: string | null;
  html_url?: string;
  type?: string;
  company?: string | null;
  location?: string | null;
  blog?: string | null;
  public_repos?: number;
  followers?: number;
  following?: number;
  created_at?: string;
  updated_at?: string;
  avatar_url?: string;
};

export type NormalizedUser = {
  id: string;
  provider: "github";
  providerUserId: number;
  login: string;
  name: string;
  email: string;
  bio: string;
  url: string;
  type: string;
  company: string;
  location: string;
  blog: string;
  publicRepos: number;
  followers: number;
  following: number;
  createdAt: string;
  updatedAt: string;
  avatarUrl: string;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeGitHubUser(user: GitHubUser): NormalizedUser {
  return {
    id: `gh-user:${user.id}`,
    provider: "github",
    providerUserId: user.id,
    login: typeof user.login === "string" ? user.login : "",
    name: typeof user.name === "string" ? user.name : "",
    email: typeof user.email === "string" ? user.email : "",
    bio: typeof user.bio === "string" ? user.bio : "",
    url: typeof user.html_url === "string" ? user.html_url : "",
    type: typeof user.type === "string" ? user.type : "",
    company: typeof user.company === "string" ? user.company : "",
    location: typeof user.location === "string" ? user.location : "",
    blog: typeof user.blog === "string" ? user.blog : "",
    publicRepos: typeof user.public_repos === "number" ? user.public_repos : 0,
    followers: typeof user.followers === "number" ? user.followers : 0,
    following: typeof user.following === "number" ? user.following : 0,
    createdAt: typeof user.created_at === "string" ? user.created_at : "",
    updatedAt: typeof user.updated_at === "string" ? user.updated_at : "",
    avatarUrl: typeof user.avatar_url === "string" ? user.avatar_url : "",
    modelVersion: "2026-05-16",
    raw: user as unknown as Record<string, unknown>,
  };
}

export type GetAuthenticatedUserInput = Record<string, never>;

export function validateGetAuthenticatedUserInput(input: unknown): GetAuthenticatedUserInput {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) throw new Error("users.get input must be an object");
  return {};
}

export type GetUserByUsernameInput = { username: string };

export function validateUsersGetAuthenticatedInput(input: unknown): GetAuthenticatedUserInput {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) throw new Error("users.get_authenticated input must be an object");
  return {};
}

export function validateGetUserByUsernameInput(input: unknown): GetUserByUsernameInput {
  if (!isRecord(input)) throw new Error("users.get_by_username input must be an object");
  return { username: requireString(input.username, "username") };
}

export type ListUserReposInput = {
  username: string;
  type?: string;
  sort?: string;
  direction?: string;
  perPage?: number;
  page?: number;
};

export function validateListUserReposInput(input: unknown): ListUserReposInput {
  if (!isRecord(input)) throw new Error("users.repos.list input must be an object");
  if (input.type !== undefined && typeof input.type !== "string") throw new Error("type must be a string");
  if (input.sort !== undefined && typeof input.sort !== "string") throw new Error("sort must be a string");
  if (input.direction !== undefined && typeof input.direction !== "string") throw new Error("direction must be a string");
  const type = typeof input.type === "string" ? input.type : undefined;
  if (type !== undefined && !["all", "owner", "member"].includes(type)) {
    throw new Error("type must be all, owner, or member");
  }
  const direction = typeof input.direction === "string" ? input.direction : undefined;
  if (direction !== undefined && direction !== "asc" && direction !== "desc") {
    throw new Error("direction must be asc or desc");
  }
  return {
    username: requireString(input.username, "username"),
    type,
    sort: typeof input.sort === "string" ? input.sort : undefined,
    direction,
    perPage: optionalPage(input.perPage, "perPage"),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}


export type GitHubEvent = {
  id?: string | number;
  type?: string | null;
  actor?: { login?: string };
  repo?: { name?: string };
  public?: boolean;
  created_at?: string;
  [key: string]: unknown;
};

export type NormalizedEvent = {
  id: string;
  provider: "github";
  eventId: string;
  type: string;
  actor: string;
  repo: string;
  public: boolean;
  createdAt: string;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeGitHubEvent(event: GitHubEvent): NormalizedEvent {
  const eventId = event.id === undefined || event.id === null ? "" : String(event.id);
  return {
    id: `gh-event:${eventId}`,
    provider: "github",
    eventId,
    type: typeof event.type === "string" ? event.type : "",
    actor: typeof event.actor?.login === "string" ? event.actor.login : "",
    repo: typeof event.repo?.name === "string" ? event.repo.name : "",
    public: event.public === true,
    createdAt: typeof event.created_at === "string" ? event.created_at : "",
    modelVersion: "2026-05-16",
    raw: event as unknown as Record<string, unknown>,
  };
}

export type GitHubPublicKey = {
  id?: number;
  key?: string;
  title?: string;
  created_at?: string;
  [key: string]: unknown;
};

export type NormalizedPublicKey = {
  id: string;
  provider: "github";
  keyId: number;
  key: string;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeGitHubPublicKey(key: GitHubPublicKey): NormalizedPublicKey {
  const keyId = typeof key.id === "number" ? key.id : 0;
  return {
    id: `gh-key:${keyId}`,
    provider: "github",
    keyId,
    key: typeof key.key === "string" ? key.key : "",
    modelVersion: "2026-05-16",
    raw: key as unknown as Record<string, unknown>,
  };
}

export type NormalizedSshSigningKey = {
  id: string;
  provider: "github";
  keyId: number;
  key: string;
  title: string;
  createdAt: string;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeGitHubSshSigningKey(key: GitHubPublicKey): NormalizedSshSigningKey {
  const keyId = typeof key.id === "number" ? key.id : 0;
  return {
    id: `gh-ssh-signing-key:${keyId}`,
    provider: "github",
    keyId,
    key: typeof key.key === "string" ? key.key : "",
    title: typeof key.title === "string" ? key.title : "",
    createdAt: typeof key.created_at === "string" ? key.created_at : "",
    modelVersion: "2026-05-16",
    raw: key as unknown as Record<string, unknown>,
  };
}

export type GitHubSocialAccount = {
  provider?: string;
  url?: string;
  [key: string]: unknown;
};

export type NormalizedSocialAccount = {
  id: string;
  provider: "github";
  accountProvider: string;
  url: string;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeGitHubSocialAccount(account: GitHubSocialAccount): NormalizedSocialAccount {
  const accountProvider = typeof account.provider === "string" ? account.provider : "";
  const url = typeof account.url === "string" ? account.url : "";
  return {
    id: `gh-social:${accountProvider}:${url}`,
    provider: "github",
    accountProvider,
    url,
    modelVersion: "2026-05-16",
    raw: account as unknown as Record<string, unknown>,
  };
}

export type UsernamePageInput = {
  username: string;
  perPage?: number;
  page?: number;
};

export type StarredListInput = UsernamePageInput & {
  sort?: string;
  direction?: string;
};

export type AuthenticatedPageInput = {
  perPage?: number;
  page?: number;
};

export type AuthenticatedStarredInput = AuthenticatedPageInput & {
  sort?: string;
  direction?: string;
};

export function validateListPublicEventsInput(input: unknown): UsernamePageInput {
  return validateUsernamePage(input, "users.events.public.list");
}

export function validateListPublicReceivedEventsInput(input: unknown): UsernamePageInput {
  return validateUsernamePage(input, "users.received_events.public.list");
}

export function validateListUserKeysInput(input: unknown): UsernamePageInput {
  return validateUsernamePage(input, "users.keys.list");
}

export function validateListUserSocialAccountsInput(input: unknown): UsernamePageInput {
  return validateUsernamePage(input, "users.social_accounts.list");
}

export function validateListUserSshSigningKeysInput(input: unknown): UsernamePageInput {
  return validateUsernamePage(input, "users.ssh_signing_keys.list");
}

export function validateListUserStarredInput(input: unknown): StarredListInput {
  if (!isRecord(input)) throw new Error("users.starred.list input must be an object");
  return {
    username: requireString(input.username, "username"),
    ...validateSortDirection(input),
    perPage: optionalPage(input.perPage, "perPage"),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

export function validateListAuthenticatedStarredInput(input: unknown): AuthenticatedStarredInput {
  const record = optionalObject(input, "user.starred.list");
  return {
    ...validateSortDirection(record),
    perPage: optionalPage(record.perPage, "perPage"),
    page: optionalPage(record.page, "page", 1_000_000),
  };
}

export function validateListAuthenticatedSocialAccountsInput(input: unknown): AuthenticatedPageInput {
  const record = optionalObject(input, "user.social_accounts.list");
  return {
    perPage: optionalPage(record.perPage, "perPage"),
    page: optionalPage(record.page, "page", 1_000_000),
  };
}

export type HovercardInput = {
  username: string;
  subject_type?: string;
  subject_id?: string;
};

export type NormalizedHovercardContext = {
  message: string;
  octicon: string;
};

export type NormalizedHovercard = {
  contexts: NormalizedHovercardContext[];
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeGitHubHovercard(body: Record<string, unknown>): NormalizedHovercard {
  const contextsRaw = Array.isArray(body.contexts) ? body.contexts : [];
  const contexts = contextsRaw.filter(isRecord).map((item) => ({
    message: typeof item.message === "string" ? item.message : "",
    octicon: typeof item.octicon === "string" ? item.octicon : "",
  }));
  return { contexts, modelVersion: "2026-05-16", raw: body };
}

export function validateUsersHovercardGetInput(input: unknown): HovercardInput {
  if (!isRecord(input)) throw new Error("users.hovercard.get input must be an object");
  const subjectType = input.subject_type === undefined ? undefined : requireString(input.subject_type, "subject_type");
  const subjectId = input.subject_id === undefined ? undefined : requireString(input.subject_id, "subject_id");
  if ((subjectType === undefined) !== (subjectId === undefined)) {
    throw new Error("subject_type and subject_id must both be set or both omitted");
  }
  if (subjectType !== undefined && !["organization", "repository", "issue", "pull_request"].includes(subjectType)) {
    throw new Error("subject_type must be organization, repository, issue, or pull_request");
  }
  return {
    username: requireString(input.username, "username"),
    subject_type: subjectType,
    subject_id: subjectId,
  };
}

export type GitHubEmail = {
  email?: string;
  primary?: boolean;
  verified?: boolean;
  visibility?: string | null;
  [key: string]: unknown;
};

export type NormalizedEmail = {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: string;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeGitHubEmail(item: GitHubEmail): NormalizedEmail {
  return {
    email: typeof item.email === "string" ? item.email : "",
    primary: item.primary === true,
    verified: item.verified === true,
    visibility: typeof item.visibility === "string" ? item.visibility : "",
    modelVersion: "2026-05-16",
    raw: item as unknown as Record<string, unknown>,
  };
}

export function validateListUserEmailsInput(input: unknown): AuthenticatedPageInput {
  const record = optionalObject(input, "user.emails.list");
  return {
    perPage: optionalPage(record.perPage, "perPage"),
    page: optionalPage(record.page, "page", 1_000_000),
  };
}

export function validateListUserEventsInput(input: unknown): UsernamePageInput {
  return validateUsernamePage(input, "users.events.list");
}

export function validateListUserReceivedEventsInput(input: unknown): UsernamePageInput {
  return validateUsernamePage(input, "users.received_events.list");
}

export type GitHubGpgKey = {
  id?: number;
  name?: string | null;
  primary_key_id?: number | null;
  key_id?: string;
  public_key?: string;
  created_at?: string;
  emails?: Array<{ email?: string; verified?: boolean }>;
  [key: string]: unknown;
};

export type NormalizedGpgKey = {
  id: string;
  provider: "github";
  gpgKeyId: number;
  keyId: string;
  publicKey: string;
  name: string;
  createdAt: string;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeGitHubGpgKey(key: GitHubGpgKey): NormalizedGpgKey {
  const gpgKeyId = typeof key.id === "number" ? key.id : 0;
  return {
    id: `gh-gpg-key:${gpgKeyId}`,
    provider: "github",
    gpgKeyId,
    keyId: typeof key.key_id === "string" ? key.key_id : "",
    publicKey: typeof key.public_key === "string" ? key.public_key : "",
    name: typeof key.name === "string" ? key.name : "",
    createdAt: typeof key.created_at === "string" ? key.created_at : "",
    modelVersion: "2026-05-16",
    raw: key as unknown as Record<string, unknown>,
  };
}

export function validateListUserGpgKeysInput(input: unknown): UsernamePageInput {
  return validateUsernamePage(input, "users.gpg_keys.list");
}

export type GitHubMarketplacePurchase = {
  billing_cycle?: string;
  next_billing_date?: string | null;
  unit_count?: number | null;
  on_free_trial?: boolean;
  free_trial_ends_on?: string | null;
  updated_at?: string | null;
  account?: { login?: string; id?: number; type?: string };
  plan?: { id?: number; name?: string; price_model?: string; state?: string };
  [key: string]: unknown;
};

export type NormalizedMarketplacePurchase = {
  billingCycle: string;
  nextBillingDate: string;
  unitCount: number | null;
  onFreeTrial: boolean;
  freeTrialEndsOn: string;
  updatedAt: string;
  accountLogin: string;
  accountId: number;
  accountType: string;
  planId: number;
  planName: string;
  priceModel: string;
  planState: string;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeGitHubMarketplacePurchase(item: GitHubMarketplacePurchase): NormalizedMarketplacePurchase {
  const account = item.account ?? {};
  const plan = item.plan ?? {};
  return {
    billingCycle: typeof item.billing_cycle === "string" ? item.billing_cycle : "",
    nextBillingDate: typeof item.next_billing_date === "string" ? item.next_billing_date : "",
    unitCount: typeof item.unit_count === "number" ? item.unit_count : null,
    onFreeTrial: item.on_free_trial === true,
    freeTrialEndsOn: typeof item.free_trial_ends_on === "string" ? item.free_trial_ends_on : "",
    updatedAt: typeof item.updated_at === "string" ? item.updated_at : "",
    accountLogin: typeof account.login === "string" ? account.login : "",
    accountId: typeof account.id === "number" ? account.id : 0,
    accountType: typeof account.type === "string" ? account.type : "",
    planId: typeof plan.id === "number" ? plan.id : 0,
    planName: typeof plan.name === "string" ? plan.name : "",
    priceModel: typeof plan.price_model === "string" ? plan.price_model : "",
    planState: typeof plan.state === "string" ? plan.state : "",
    modelVersion: "2026-05-16",
    raw: item as unknown as Record<string, unknown>,
  };
}

export function validateListMarketplacePurchasesInput(input: unknown): AuthenticatedPageInput {
  const record = optionalObject(input, "user.marketplace_purchases.list");
  return {
    perPage: optionalPage(record.perPage, "perPage"),
    page: optionalPage(record.page, "page", 1_000_000),
  };
}

export function validateListMarketplacePurchasesStubbedInput(input: unknown): AuthenticatedPageInput {
  const record = optionalObject(input, "user.marketplace_purchases.stubbed.list");
  return {
    perPage: optionalPage(record.perPage, "perPage"),
    page: optionalPage(record.page, "page", 1_000_000),
  };
}

export type NormalizedBlockedUser = {
  id: string;
  provider: "github";
  providerUserId: number;
  login: string;
  url: string;
  type: string;
  avatarUrl: string;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeGitHubBlockedUser(user: GitHubUser): NormalizedBlockedUser {
  return {
    id: `gh-user:${user.id}`,
    provider: "github",
    providerUserId: typeof user.id === "number" ? user.id : 0,
    login: typeof user.login === "string" ? user.login : "",
    url: typeof user.html_url === "string" ? user.html_url : "",
    type: typeof user.type === "string" ? user.type : "",
    avatarUrl: typeof user.avatar_url === "string" ? user.avatar_url : "",
    modelVersion: "2026-05-16",
    raw: user as unknown as Record<string, unknown>,
  };
}

export function validateListUserBlocksInput(input: unknown): AuthenticatedPageInput {
  const record = optionalObject(input, "user.blocks.list");
  return {
    perPage: optionalPage(record.perPage, "perPage"),
    page: optionalPage(record.page, "page", 1_000_000),
  };
}

export function createUsersClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const base = options.githubClient;
  const clientFor = (operation: string) => base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation });

  return {
    async getAuthenticatedUser(input: unknown) {
      validateGetAuthenticatedUserInput(input);
      const client = base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "users.get" });
      const response = await client.fetchJSON("/user");
      const rate = parseGitHubRateLimit(response.status, response.headers);
      if (rate.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded", retryAfterSeconds: rate.retryAfterSeconds } };
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, user: normalizeGitHubUser(response.body as GitHubUser) };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: `GitHub users.get failed with status ${response.status}`, retryAfterSeconds: undefined as number | undefined } };
    },

    async getAuthenticated(input: unknown) {
      validateUsersGetAuthenticatedInput(input);
      const client = base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "users.get_authenticated" });
      const response = await client.fetchJSON("/user");
      const rate = parseGitHubRateLimit(response.status, response.headers);
      if (rate.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded", retryAfterSeconds: rate.retryAfterSeconds } };
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, user: normalizeGitHubUser(response.body as GitHubUser) };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: `GitHub users.get_authenticated failed with status ${response.status}`, retryAfterSeconds: undefined as number | undefined } };
    },

    async getByUsername(input: unknown) {
      const payload = validateGetUserByUsernameInput(input);
      const client = base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "users.get_by_username" });
      const response = await client.fetchJSON(`/users/${encodeURIComponent(payload.username)}`);
      const rate = parseGitHubRateLimit(response.status, response.headers);
      if (rate.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded", retryAfterSeconds: rate.retryAfterSeconds } };
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, user: normalizeGitHubUser(response.body as GitHubUser) };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: `GitHub users.get_by_username failed with status ${response.status}`, retryAfterSeconds: undefined as number | undefined } };
    },

    async listRepos(input: unknown) {
      const payload = validateListUserReposInput(input);
      const client = base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "users.repos.list" });
      const params = new URLSearchParams();
      if (payload.type) params.set("type", payload.type);
      if (payload.sort) params.set("sort", payload.sort);
      if (payload.direction) params.set("direction", payload.direction);
      if (payload.perPage) params.set("per_page", String(payload.perPage));
      if (payload.page) params.set("page", String(payload.page));
      const qs = params.toString();
      const path = `/users/${encodeURIComponent(payload.username)}/repos${qs ? `?${qs}` : ""}`;
      const response = await client.fetchJSON(path);
      const rate = parseGitHubRateLimit(response.status, response.headers);
      if (rate.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded", retryAfterSeconds: rate.retryAfterSeconds } };
      if (response.status === 200 && Array.isArray(response.body)) {
        const repos = (response.body as GitHubRepo[]).map(normalizeGitHubRepo);
        return { ok: true as const, repositories: repos };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: `GitHub users.repos.list failed with status ${response.status}`, retryAfterSeconds: undefined as number | undefined } };
    },

    async listPublicEvents(input: unknown) {
      const payload = validateListPublicEventsInput(input);
      const result = await fetchList(clientFor("users.events.public.list"), "users.events.public.list", `/users/${encodeURIComponent(payload.username)}/events/public${pageQuery(payload)}`);
      if (!result.ok) return result;
      return { ok: true as const, events: (result.body as GitHubEvent[]).map(normalizeGitHubEvent) };
    },

    async listPublicReceivedEvents(input: unknown) {
      const payload = validateListPublicReceivedEventsInput(input);
      const result = await fetchList(clientFor("users.received_events.public.list"), "users.received_events.public.list", `/users/${encodeURIComponent(payload.username)}/received_events/public${pageQuery(payload)}`);
      if (!result.ok) return result;
      return { ok: true as const, events: (result.body as GitHubEvent[]).map(normalizeGitHubEvent) };
    },

    async listKeys(input: unknown) {
      const payload = validateListUserKeysInput(input);
      const result = await fetchList(clientFor("users.keys.list"), "users.keys.list", `/users/${encodeURIComponent(payload.username)}/keys${pageQuery(payload)}`);
      if (!result.ok) return result;
      return { ok: true as const, keys: (result.body as GitHubPublicKey[]).map(normalizeGitHubPublicKey) };
    },

    async listStarred(input: unknown) {
      const payload = validateListUserStarredInput(input);
      const result = await fetchList(clientFor("users.starred.list"), "users.starred.list", `/users/${encodeURIComponent(payload.username)}/starred${pageQuery(payload)}`);
      if (!result.ok) return result;
      return { ok: true as const, repositories: (result.body as GitHubRepo[]).map(normalizeGitHubRepo) };
    },

    async listAuthenticatedStarred(input: unknown) {
      const payload = validateListAuthenticatedStarredInput(input);
      const result = await fetchList(clientFor("user.starred.list"), "user.starred.list", `/user/starred${pageQuery(payload)}`);
      if (!result.ok) return result;
      return { ok: true as const, repositories: (result.body as GitHubRepo[]).map(normalizeGitHubRepo) };
    },

    async listSocialAccounts(input: unknown) {
      const payload = validateListUserSocialAccountsInput(input);
      const result = await fetchList(clientFor("users.social_accounts.list"), "users.social_accounts.list", `/users/${encodeURIComponent(payload.username)}/social_accounts${pageQuery(payload)}`);
      if (!result.ok) return result;
      return { ok: true as const, socialAccounts: (result.body as GitHubSocialAccount[]).map(normalizeGitHubSocialAccount) };
    },

    async listAuthenticatedSocialAccounts(input: unknown) {
      const payload = validateListAuthenticatedSocialAccountsInput(input);
      const result = await fetchList(clientFor("user.social_accounts.list"), "user.social_accounts.list", `/user/social_accounts${pageQuery(payload)}`);
      if (!result.ok) return result;
      return { ok: true as const, socialAccounts: (result.body as GitHubSocialAccount[]).map(normalizeGitHubSocialAccount) };
    },

    async listSshSigningKeys(input: unknown) {
      const payload = validateListUserSshSigningKeysInput(input);
      const result = await fetchList(clientFor("users.ssh_signing_keys.list"), "users.ssh_signing_keys.list", `/users/${encodeURIComponent(payload.username)}/ssh_signing_keys${pageQuery(payload)}`);
      if (!result.ok) return result;
      return { ok: true as const, keys: (result.body as GitHubPublicKey[]).map(normalizeGitHubSshSigningKey) };
    },

    async getHovercard(input: unknown) {
      const payload = validateUsersHovercardGetInput(input);
      const client = clientFor("users.hovercard.get");
      const params = new URLSearchParams();
      if (payload.subject_type) params.set("subject_type", payload.subject_type);
      if (payload.subject_id) params.set("subject_id", payload.subject_id);
      const qs = params.toString();
      const path = `/users/${encodeURIComponent(payload.username)}/hovercard${qs ? `?${qs}` : ""}`;
      const response = await client.fetchJSON(path);
      const rate = parseGitHubRateLimit(response.status, response.headers);
      if (rate.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded", retryAfterSeconds: rate.retryAfterSeconds } };
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, hovercard: normalizeGitHubHovercard(response.body) };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: `GitHub users.hovercard.get failed with status ${response.status}`, retryAfterSeconds: undefined as number | undefined } };
    },

    async listEmails(input: unknown) {
      const payload = validateListUserEmailsInput(input);
      const result = await fetchList(clientFor("user.emails.list"), "user.emails.list", `/user/emails${pageQuery(payload)}`);
      if (!result.ok) return result;
      return { ok: true as const, emails: (result.body as GitHubEmail[]).map(normalizeGitHubEmail) };
    },

    async listEvents(input: unknown) {
      const payload = validateListUserEventsInput(input);
      const result = await fetchList(clientFor("users.events.list"), "users.events.list", `/users/${encodeURIComponent(payload.username)}/events${pageQuery(payload)}`);
      if (!result.ok) return result;
      return { ok: true as const, events: (result.body as GitHubEvent[]).map(normalizeGitHubEvent) };
    },

    async listReceivedEvents(input: unknown) {
      const payload = validateListUserReceivedEventsInput(input);
      const result = await fetchList(clientFor("users.received_events.list"), "users.received_events.list", `/users/${encodeURIComponent(payload.username)}/received_events${pageQuery(payload)}`);
      if (!result.ok) return result;
      return { ok: true as const, events: (result.body as GitHubEvent[]).map(normalizeGitHubEvent) };
    },

    async listGpgKeys(input: unknown) {
      const payload = validateListUserGpgKeysInput(input);
      const result = await fetchList(clientFor("users.gpg_keys.list"), "users.gpg_keys.list", `/users/${encodeURIComponent(payload.username)}/gpg_keys${pageQuery(payload)}`);
      if (!result.ok) return result;
      return { ok: true as const, keys: (result.body as GitHubGpgKey[]).map(normalizeGitHubGpgKey) };
    },

    async listMarketplacePurchases(input: unknown) {
      const payload = validateListMarketplacePurchasesInput(input);
      const result = await fetchList(clientFor("user.marketplace_purchases.list"), "user.marketplace_purchases.list", `/user/marketplace_purchases${pageQuery(payload)}`);
      if (!result.ok) return result;
      return { ok: true as const, purchases: (result.body as GitHubMarketplacePurchase[]).map(normalizeGitHubMarketplacePurchase) };
    },

    async listMarketplacePurchasesStubbed(input: unknown) {
      const payload = validateListMarketplacePurchasesStubbedInput(input);
      const result = await fetchList(clientFor("user.marketplace_purchases.stubbed.list"), "user.marketplace_purchases.stubbed.list", `/user/marketplace_purchases/stubbed${pageQuery(payload)}`);
      if (!result.ok) return result;
      return { ok: true as const, purchases: (result.body as GitHubMarketplacePurchase[]).map(normalizeGitHubMarketplacePurchase) };
    },

    async listBlocks(input: unknown) {
      const payload = validateListUserBlocksInput(input);
      const result = await fetchList(clientFor("user.blocks.list"), "user.blocks.list", `/user/blocks${pageQuery(payload)}`);
      if (!result.ok) return result;
      return { ok: true as const, users: (result.body as GitHubUser[]).map(normalizeGitHubBlockedUser) };
    },
  };
}

async function fetchList(client: GitHubClient, operation: string, path: string) {
  const response = await client.fetchJSON(path);
  const rate = parseGitHubRateLimit(response.status, response.headers);
  if (rate.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "GitHub rate limit exceeded", retryAfterSeconds: rate.retryAfterSeconds } };
  if (response.status === 200 && Array.isArray(response.body)) return { ok: true as const, body: response.body };
  return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: `GitHub ${operation} failed with status ${response.status}`, retryAfterSeconds: undefined as number | undefined } };
}

function pageQuery(payload: { perPage?: number; page?: number; sort?: string; direction?: string }): string {
  const params = new URLSearchParams();
  if (payload.sort) params.set("sort", payload.sort);
  if (payload.direction) params.set("direction", payload.direction);
  if (payload.perPage) params.set("per_page", String(payload.perPage));
  if (payload.page) params.set("page", String(payload.page));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}


function validateUsernamePage(input: unknown, operation: string): UsernamePageInput {
  if (!isRecord(input)) throw new Error(`${operation} input must be an object`);
  return {
    username: requireString(input.username, "username"),
    perPage: optionalPage(input.perPage, "perPage"),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

function optionalObject(input: unknown, operation: string): Record<string, unknown> {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) throw new Error(`${operation} input must be an object`);
  return input;
}

function validateSortDirection(input: Record<string, unknown>): { sort?: string; direction?: string } {
  if (input.sort !== undefined && typeof input.sort !== "string") throw new Error("sort must be a string");
  if (input.direction !== undefined && typeof input.direction !== "string") throw new Error("direction must be a string");
  const sort = typeof input.sort === "string" ? input.sort : undefined;
  if (sort !== undefined && sort !== "created" && sort !== "updated") throw new Error("sort must be created or updated");
  const direction = typeof input.direction === "string" ? input.direction : undefined;
  if (direction !== undefined && direction !== "asc" && direction !== "desc") throw new Error("direction must be asc or desc");
  return { sort, direction };
}

function optionalPage(value: unknown, field: string, max = 100): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${field} must be an integer between 1 and ${max}`);
  }
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} is required`);
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
