import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";
import { normalizeGitHubEmail, normalizeGitHubUser, type GitHubEmail, type GitHubUser } from "./users";
import { normalizeGitHubInvitation, type GitHubInvitation } from "./governance";
import { normalizeOrgInteractionLimits } from "./orgs_reads";

// G1: users, account, and meta reads (12 read ops) plus user.interaction_limits.set (1 write op).
// Every op omits effectPolicy, reconcile, and effect.

type Page = { perPage?: number; page?: number };
type BillingDate = { year?: number; month?: number; day?: number };

const PACKAGE_TYPES = ["npm", "maven", "rubygems", "docker", "nuget", "container"] as const;
const PACKAGE_VISIBILITIES = ["public", "private", "internal"] as const;
const LIMITS = ["existing_users", "contributors_only", "collaborators_only"] as const;
const EXPIRIES = ["one_day", "three_days", "one_week", "one_month", "six_months"] as const;

export type NormalizedUserPackage = { id: number; name: string; packageType: string; visibility: string };
export type NormalizedAttestation = { repositoryId: number; bundleUrl: string; bundle: Record<string, unknown> };
export type NormalizedBillingTimePeriod = { year: number; month: number; day: number };
export type NormalizedPremiumRequestUsageItem = {
  product: string;
  sku: string;
  model: string;
  unitType: string;
  pricePerUnit: number;
  grossQuantity: number;
  grossAmount: number;
  discountQuantity: number;
  discountAmount: number;
  netQuantity: number;
  netAmount: number;
};
export type NormalizedUsageSummaryItem = Omit<NormalizedPremiumRequestUsageItem, "model">;
export type NormalizedCodeOfConductSummary = { key: string; name: string; url: string; htmlUrl: string };
export type NormalizedLicenseSummary = { key: string; name: string; spdxId: string; url: string; nodeId: string };

// ─── validators ──────────────────────────────────────────────────────────────

export function validateGetUserByIdInput(input: unknown): { accountId: number } {
  if (!isRecord(input)) throw new Error("users.get_by_id input must be an object");
  return { accountId: requireId(input.accountId, "accountId") };
}

export function validateCheckAuthenticatedFollowingInput(input: unknown): { username: string } {
  if (!isRecord(input)) throw new Error("user.following.check input must be an object");
  return { username: segment(input.username, "username") };
}

export function validateListPublicEmailsInput(input: unknown): Page {
  return page(optionalObject(input, "user.public_emails.list"));
}

export function validateListAuthenticatedRepoInvitationsInput(input: unknown): Page {
  return page(optionalObject(input, "user.repository_invitations.list"));
}

export function validateListAuthenticatedPackagesInput(input: unknown): { packageType: string; visibility?: string } & Page {
  if (!isRecord(input)) throw new Error("user.packages.list input must be an object");
  const packageType = input.packageType;
  if (typeof packageType !== "string" || !PACKAGE_TYPES.includes(packageType as (typeof PACKAGE_TYPES)[number])) {
    throw new Error("packageType is required and must be one of npm, maven, rubygems, docker, nuget, container");
  }
  let visibility: string | undefined;
  if (input.visibility !== undefined) {
    if (typeof input.visibility !== "string" || !PACKAGE_VISIBILITIES.includes(input.visibility as (typeof PACKAGE_VISIBILITIES)[number])) {
      throw new Error("visibility must be public, private, or internal");
    }
    visibility = input.visibility;
  }
  return { packageType, ...(visibility !== undefined ? { visibility } : {}), ...page(input) };
}

export function validateGetAuthenticatedInteractionLimitsInput(input: unknown): Record<string, never> {
  optionalObject(input, "user.interaction_limits.get");
  return {};
}

export function validateSetAuthenticatedInteractionLimitsInput(input: unknown): { limit: string; expiry?: string } {
  if (!isRecord(input)) throw new Error("user.interaction_limits.set input must be an object");
  if (typeof input.limit !== "string" || !LIMITS.includes(input.limit as (typeof LIMITS)[number])) {
    throw new Error("limit must be existing_users, contributors_only, or collaborators_only");
  }
  let expiry: string | undefined;
  if (input.expiry !== undefined) {
    if (typeof input.expiry !== "string" || !EXPIRIES.includes(input.expiry as (typeof EXPIRIES)[number])) {
      throw new Error("expiry must be one_day, three_days, one_week, one_month, or six_months");
    }
    expiry = input.expiry;
  }
  return { limit: input.limit, ...(expiry !== undefined ? { expiry } : {}) };
}

export function validateListUserAttestationsInput(input: unknown): {
  username: string;
  subjectDigest: string;
  perPage?: number;
  before?: string;
  after?: string;
} {
  if (!isRecord(input)) throw new Error("users.attestations.list input must be an object");
  return {
    username: segment(input.username, "username"),
    subjectDigest: segment(input.subjectDigest, "subjectDigest"),
    ...(optionalPage(input.perPage, "perPage") !== undefined ? { perPage: optionalPage(input.perPage, "perPage") } : {}),
    ...(optionalCursor(input.before, "before") !== undefined ? { before: optionalCursor(input.before, "before") } : {}),
    ...(optionalCursor(input.after, "after") !== undefined ? { after: optionalCursor(input.after, "after") } : {}),
  };
}

export function validateGetPremiumRequestUsageInput(input: unknown): { username: string } & BillingDate {
  if (!isRecord(input)) throw new Error("users.billing.premium_request_usage.get input must be an object");
  return { username: segment(input.username, "username"), ...billingDate(input) };
}

export function validateGetUsageSummaryInput(input: unknown): { username: string } & BillingDate {
  if (!isRecord(input)) throw new Error("users.billing.usage.summary.get input must be an object");
  return { username: segment(input.username, "username"), ...billingDate(input) };
}

export function validateListCodesOfConductInput(input: unknown): Record<string, never> {
  optionalObject(input, "codes_of_conduct.list");
  return {};
}

export function validateListLicensesInput(input: unknown): { featured?: boolean } & Page {
  const record = optionalObject(input, "licenses.list");
  if (record.featured !== undefined && typeof record.featured !== "boolean") throw new Error("featured must be a boolean");
  return { ...(record.featured !== undefined ? { featured: record.featured as boolean } : {}), ...page(record) };
}

export function validateListGitignoreTemplatesInput(input: unknown): Record<string, never> {
  optionalObject(input, "gitignore.templates.list");
  return {};
}

// ─── client ──────────────────────────────────────────────────────────────────

export function createGapG1Client(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const base = options.githubClient;
  const clientFor = (operation: string) =>
    base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation });

  return {
    async getUserById(input: unknown) {
      const payload = validateGetUserByIdInput(input);
      const result = await read(clientFor("users.get_by_id"), `/user/${payload.accountId}`, "users.get_by_id", "GitHub user was not found.");
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the users.get_by_id request.");
      return { ok: true as const, user: normalizeGitHubUser(result.body as GitHubUser) };
    },

    async checkAuthenticatedFollowing(input: unknown) {
      const payload = validateCheckAuthenticatedFollowingInput(input);
      const response = await clientFor("user.following.check").fetchJSON(`/user/following/${encodeURIComponent(payload.username)}`);
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      // Official docs: 204 if the authenticated user follows username, 404 if not. Both are a successful read.
      if (response.status === 204) return { ok: true as const, following: true as const };
      if (response.status === 404) return { ok: true as const, following: false as const };
      return upstream("GitHub rejected the user.following.check request.");
    },

    async listPublicEmails(input: unknown) {
      const payload = validateListPublicEmailsInput(input);
      const result = await read(clientFor("user.public_emails.list"), `/user/public_emails${query(pageParams(payload))}`, "user.public_emails.list", "GitHub public emails were not found.");
      if (!result.ok) return result;
      if (!Array.isArray(result.body)) return upstream("GitHub rejected the user.public_emails.list request.");
      return { ok: true as const, emails: result.body.filter(isRecord).map((item) => normalizeGitHubEmail(item as GitHubEmail)) };
    },

    async listRepositoryInvitations(input: unknown) {
      const payload = validateListAuthenticatedRepoInvitationsInput(input);
      const result = await read(clientFor("user.repository_invitations.list"), `/user/repository_invitations${query(pageParams(payload))}`, "user.repository_invitations.list", "GitHub repository invitations were not found.");
      if (!result.ok) return result;
      if (!Array.isArray(result.body)) return upstream("GitHub rejected the user.repository_invitations.list request.");
      return { ok: true as const, invitations: result.body.filter(isRecord).map((item) => normalizeGitHubInvitation(item as GitHubInvitation)) };
    },

    async listPackages(input: unknown) {
      const payload = validateListAuthenticatedPackagesInput(input);
      const params = new URLSearchParams();
      params.set("package_type", payload.packageType);
      if (payload.visibility !== undefined) params.set("visibility", payload.visibility);
      appendPage(params, payload);
      const result = await read(clientFor("user.packages.list"), `/user/packages${query(params)}`, "user.packages.list", "GitHub packages were not found.");
      if (!result.ok) return result;
      if (!Array.isArray(result.body)) return upstream("GitHub rejected the user.packages.list request.");
      return { ok: true as const, packages: result.body.filter(isRecord).map(normalizePackage) };
    },

    async getInteractionLimits(input: unknown) {
      validateGetAuthenticatedInteractionLimitsInput(input);
      const response = await clientFor("user.interaction_limits.get").fetchJSON("/user/interaction-limits");
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      // Official docs: 200 with the restriction, or 204 (or an empty object) when none is set.
      if (response.status === 204) return { ok: true as const, limits: normalizeOrgInteractionLimits({}), present: false };
      if (response.status === 200) {
        const limits = normalizeOrgInteractionLimits(isRecord(response.body) ? response.body : {});
        return { ok: true as const, limits, present: limits.limit.length > 0 };
      }
      if (response.status === 404) return upstream("GitHub user interaction limits were not found.");
      return upstream("GitHub rejected the user.interaction_limits.get request.");
    },

    async setInteractionLimits(input: unknown) {
      const payload = validateSetAuthenticatedInteractionLimitsInput(input);
      const body: Record<string, string> = { limit: payload.limit };
      if (payload.expiry !== undefined) body.expiry = payload.expiry;
      const response = await clientFor("user.interaction_limits.set").fetchJSON("/user/interaction-limits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 200 && isRecord(response.body)) return { ok: true as const, limits: response.body };
      if (response.status === 404) return upstream("GitHub user interaction limits were not found.");
      return upstream("GitHub rejected the user.interaction_limits.set request.");
    },

    async listAttestations(input: unknown) {
      const payload = validateListUserAttestationsInput(input);
      const params = new URLSearchParams();
      if (payload.perPage) params.set("per_page", String(payload.perPage));
      if (payload.before !== undefined) params.set("before", payload.before);
      if (payload.after !== undefined) params.set("after", payload.after);
      const path = `/users/${encodeURIComponent(payload.username)}/attestations/${encodeURIComponent(payload.subjectDigest)}${query(params)}`;
      const result = await read(clientFor("users.attestations.list"), path, "users.attestations.list", "GitHub attestations were not found.");
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the users.attestations.list request.");
      const raw = Array.isArray(result.body.attestations) ? result.body.attestations : [];
      return { ok: true as const, attestations: raw.filter(isRecord).map(normalizeAttestation) };
    },

    async getPremiumRequestUsage(input: unknown) {
      const payload = validateGetPremiumRequestUsageInput(input);
      const path = `/users/${encodeURIComponent(payload.username)}/settings/billing/premium_request/usage${query(dateParams(payload))}`;
      const result = await read(clientFor("users.billing.premium_request_usage.get"), path, "users.billing.premium_request_usage.get", "GitHub premium request usage was not found.");
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the users.billing.premium_request_usage.get request.");
      const raw = Array.isArray(result.body.usageItems) ? result.body.usageItems : [];
      return {
        ok: true as const,
        timePeriod: normalizeTimePeriod(result.body.timePeriod),
        user: typeof result.body.user === "string" ? result.body.user : "",
        usageItems: raw.filter(isRecord).map(normalizePremiumRequestUsageItem),
      };
    },

    async getUsageSummary(input: unknown) {
      const payload = validateGetUsageSummaryInput(input);
      const path = `/users/${encodeURIComponent(payload.username)}/settings/billing/usage/summary${query(dateParams(payload))}`;
      const result = await read(clientFor("users.billing.usage.summary.get"), path, "users.billing.usage.summary.get", "GitHub billing usage summary was not found.");
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the users.billing.usage.summary.get request.");
      const raw = Array.isArray(result.body.usageItems) ? result.body.usageItems : [];
      return {
        ok: true as const,
        timePeriod: normalizeTimePeriod(result.body.timePeriod),
        user: typeof result.body.user === "string" ? result.body.user : "",
        usageItems: raw.filter(isRecord).map(normalizeUsageSummaryItem),
      };
    },

    async listCodesOfConduct(input: unknown) {
      validateListCodesOfConductInput(input);
      const result = await read(clientFor("codes_of_conduct.list"), "/codes_of_conduct", "codes_of_conduct.list", "GitHub codes of conduct were not found.");
      if (!result.ok) return result;
      if (!Array.isArray(result.body)) return upstream("GitHub rejected the codes_of_conduct.list request.");
      return { ok: true as const, codesOfConduct: result.body.filter(isRecord).map(normalizeCodeOfConduct) };
    },

    async listLicenses(input: unknown) {
      const payload = validateListLicensesInput(input);
      const params = new URLSearchParams();
      if (payload.featured !== undefined) params.set("featured", String(payload.featured));
      appendPage(params, payload);
      const result = await read(clientFor("licenses.list"), `/licenses${query(params)}`, "licenses.list", "GitHub licenses were not found.");
      if (!result.ok) return result;
      if (!Array.isArray(result.body)) return upstream("GitHub rejected the licenses.list request.");
      return { ok: true as const, licenses: result.body.filter(isRecord).map(normalizeLicenseSummary) };
    },

    async listGitignoreTemplates(input: unknown) {
      validateListGitignoreTemplatesInput(input);
      const result = await read(clientFor("gitignore.templates.list"), "/gitignore/templates", "gitignore.templates.list", "GitHub gitignore templates were not found.");
      if (!result.ok) return result;
      if (!Array.isArray(result.body)) return upstream("GitHub rejected the gitignore.templates.list request.");
      return { ok: true as const, templates: result.body.filter((entry): entry is string => typeof entry === "string") };
    },
  };
}

// ─── normalizers ─────────────────────────────────────────────────────────────

function normalizePackage(item: Record<string, unknown>): NormalizedUserPackage {
  return {
    id: typeof item.id === "number" ? item.id : 0,
    name: typeof item.name === "string" ? item.name : "",
    packageType: typeof item.package_type === "string" ? item.package_type : "",
    visibility: typeof item.visibility === "string" ? item.visibility : "",
  };
}

function normalizeAttestation(item: Record<string, unknown>): NormalizedAttestation {
  return {
    repositoryId: typeof item.repository_id === "number" ? item.repository_id : 0,
    bundleUrl: typeof item.bundle_url === "string" ? item.bundle_url : "",
    bundle: isRecord(item.bundle) ? item.bundle : {},
  };
}

function normalizeTimePeriod(value: unknown): NormalizedBillingTimePeriod {
  const item = isRecord(value) ? value : {};
  return {
    year: typeof item.year === "number" ? item.year : 0,
    month: typeof item.month === "number" ? item.month : 0,
    day: typeof item.day === "number" ? item.day : 0,
  };
}

function normalizeUsageSummaryItem(item: Record<string, unknown>): NormalizedUsageSummaryItem {
  return {
    product: str(item.product),
    sku: str(item.sku),
    unitType: str(item.unitType),
    pricePerUnit: num(item.pricePerUnit),
    grossQuantity: num(item.grossQuantity),
    grossAmount: num(item.grossAmount),
    discountQuantity: num(item.discountQuantity),
    discountAmount: num(item.discountAmount),
    netQuantity: num(item.netQuantity),
    netAmount: num(item.netAmount),
  };
}

function normalizePremiumRequestUsageItem(item: Record<string, unknown>): NormalizedPremiumRequestUsageItem {
  return { ...normalizeUsageSummaryItem(item), model: str(item.model) };
}

function normalizeCodeOfConduct(item: Record<string, unknown>): NormalizedCodeOfConductSummary {
  return { key: str(item.key), name: str(item.name), url: str(item.url), htmlUrl: str(item.html_url) };
}

function normalizeLicenseSummary(item: Record<string, unknown>): NormalizedLicenseSummary {
  return { key: str(item.key), name: str(item.name), spdxId: str(item.spdx_id), url: str(item.url), nodeId: str(item.node_id) };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function read(client: GitHubClient, path: string, operation: string, missing: string) {
  const response = await client.fetchJSON(path);
  const limited = rate(response.status, response.headers);
  if (limited) return limited;
  if (response.status === 404) return upstream(missing);
  if (response.status === 401) return upstream(`GitHub rejected the ${operation} request.`);
  if (response.status === 200) return { ok: true as const, body: response.body };
  return upstream(`GitHub rejected the ${operation} request.`);
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
  return {
    ok: false as const,
    error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message, retryAfterSeconds: undefined as number | undefined },
  };
}

function page(input: Record<string, unknown>): Page {
  const perPage = optionalPage(input.perPage, "perPage");
  const pageNumber = optionalPage(input.page, "page", 1_000_000);
  return { ...(perPage !== undefined ? { perPage } : {}), ...(pageNumber !== undefined ? { page: pageNumber } : {}) };
}

function pageParams(payload: Page): URLSearchParams {
  const params = new URLSearchParams();
  appendPage(params, payload);
  return params;
}

function appendPage(params: URLSearchParams, payload: Page) {
  if (payload.perPage) params.set("per_page", String(payload.perPage));
  if (payload.page) params.set("page", String(payload.page));
}

function billingDate(input: Record<string, unknown>): BillingDate {
  const year = optionalInt(input.year, "year", 2000, 9999);
  const month = optionalInt(input.month, "month", 1, 12);
  const day = optionalInt(input.day, "day", 1, 31);
  return {
    ...(year !== undefined ? { year } : {}),
    ...(month !== undefined ? { month } : {}),
    ...(day !== undefined ? { day } : {}),
  };
}

function dateParams(payload: BillingDate): URLSearchParams {
  const params = new URLSearchParams();
  if (payload.year !== undefined) params.set("year", String(payload.year));
  if (payload.month !== undefined) params.set("month", String(payload.month));
  if (payload.day !== undefined) params.set("day", String(payload.day));
  return params;
}

function query(params: URLSearchParams): string {
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function optionalObject(input: unknown, operation: string): Record<string, unknown> {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) throw new Error(`${operation} input must be an object`);
  return input;
}

function optionalPage(value: unknown, field: string, max = 100): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${field} must be an integer between 1 and ${max}`);
  }
  return value;
}

function optionalInt(value: unknown, field: string, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${field} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function optionalCursor(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} must be a non-empty string`);
  return value;
}

function requireId(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function segment(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  if (value.includes("/") || value.includes("?") || value.includes("#")) {
    throw new Error(`${field} must be a single path segment`);
  }
  return value;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
