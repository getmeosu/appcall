import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

type Page = { perPage?: number; page?: number };
type PackageList = { packageType: string } & Page;
type UserPackageList = PackageList & { username: string };
type OrgPackageList = PackageList & { org: string };
type UserPackageVersions = { username: string; packageType: string; packageName: string } & Page;
type UserPackageVersion = { username: string; packageType: string; packageName: string; packageVersionId: number };
type AuthPackageVersion = { packageType: string; packageName: string; packageVersionId: number };
type Repo = { owner: string; repo: string };
type CodespaceName = { codespaceName: string };
type ExportGet = CodespaceName & { exportId: string };
type OrgMemberCodespaces = { org: string; username: string } & Page;
type OrgCodespaces = { org: string } & Page;

export type NormalizedPackage = { id: number; name: string; packageType: string; visibility: string };
export type NormalizedPackageVersion = { id: number; name: string; createdAt: string };
export type NormalizedCodespace = { id: number; name: string; state: string };
export type NormalizedMachine = { name: string; displayName: string; os: string };
export type NormalizedCodespaceDefaults = { location: string; devcontainerPath: string; billableOwner: string };
export type NormalizedCodespaceExport = { id: string; state: string; completedAt: string };

const PACKAGE_TYPES = new Set(["npm", "maven", "rubygems", "docker", "nuget", "container"]);

export function validateGetUserPackageVersionInput(input: unknown): UserPackageVersion {
  const record = requireObject(input, "users.packages.versions.get");
  return { ...userPackage(record), packageVersionId: requireId(record.packageVersionId ?? record.package_version_id, "package_version_id") };
}

export function validateGetAuthenticatedPackageVersionInput(input: unknown): AuthPackageVersion {
  const record = requireObject(input, "user.packages.versions.get");
  return { ...packageName(record), packageVersionId: requireId(record.packageVersionId ?? record.package_version_id, "package_version_id") };
}

export function validateListOrgPackagesInput(input: unknown): OrgPackageList {
  const record = requireObject(input, "orgs.packages.list");
  return { org: requireSingleSegment(record.org, "org"), ...packageType(record), ...pageOf(record) };
}

export function validateListUserPackagesInput(input: unknown): UserPackageList {
  const record = requireObject(input, "users.packages.list");
  return { username: requireSingleSegment(record.username, "username"), ...packageType(record), ...pageOf(record) };
}

export function validateListUserPackageVersionsInput(input: unknown): UserPackageVersions {
  const record = requireObject(input, "users.packages.versions.list");
  return { ...userPackage(record), ...pageOf(record) };
}

export function validateGetRepoCodespaceDefaultsInput(input: unknown): Repo {
  const record = requireObject(input, "repos.codespaces.new.get");
  return repo(record);
}

export function validateGetCodespaceExportInput(input: unknown): ExportGet {
  const record = requireObject(input, "user.codespaces.exports.get");
  return { ...codespace(record), exportId: requireSingleSegment(record.exportId ?? record.export_id, "export_id") };
}

export function validateListRepoCodespaceMachinesInput(input: unknown): Repo {
  const record = requireObject(input, "repos.codespaces.machines.list");
  return repo(record);
}

export function validateListOrgMemberCodespacesInput(input: unknown): OrgMemberCodespaces {
  const record = requireObject(input, "orgs.members.codespaces.list");
  return { org: requireSingleSegment(record.org, "org"), username: requireSingleSegment(record.username, "username"), ...pageOf(record) };
}

export function validateListUserCodespacesInput(input: unknown): Page {
  if (input === undefined || input === null) return {};
  const record = requireObject(input, "user.codespaces.list");
  return pageOf(record);
}

export function validateListOrgCodespacesInput(input: unknown): OrgCodespaces {
  const record = requireObject(input, "orgs.codespaces.list");
  return { org: requireSingleSegment(record.org, "org"), ...pageOf(record) };
}

export function validateListCodespaceMachinesInput(input: unknown): CodespaceName {
  const record = requireObject(input, "user.codespaces.machines.list");
  return codespace(record);
}

export function createCard9ReadsClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const client = options.githubClient ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation: "users.packages.versions.get",
  });

  return {
    async getUserPackageVersion(input: unknown) {
      const payload = validateGetUserPackageVersionInput(input);
      const response = await client.fetchJSON(`/users/${seg(payload.username)}/packages/${seg(payload.packageType)}/${encodeURIComponent(payload.packageName)}/versions/${payload.packageVersionId}`);
      return readObject(response, "packageVersion", normalizePackageVersion, "Package version not found.", "GitHub rejected the get user package version request.");
    },
    async getAuthenticatedPackageVersion(input: unknown) {
      const payload = validateGetAuthenticatedPackageVersionInput(input);
      const response = await client.fetchJSON(`/user/packages/${seg(payload.packageType)}/${encodeURIComponent(payload.packageName)}/versions/${payload.packageVersionId}`);
      return readObject(response, "packageVersion", normalizePackageVersion, "Package version not found.", "GitHub rejected the get authenticated package version request.");
    },
    async listOrgPackages(input: unknown) {
      const payload = validateListOrgPackagesInput(input);
      const response = await client.fetchJSON(`/orgs/${seg(payload.org)}/packages${packageQuery(payload)}`);
      return readList(response, "packages", "packages", normalizePackage, "Organization packages not found.", "GitHub rejected the list organization packages request.");
    },
    async listUserPackages(input: unknown) {
      const payload = validateListUserPackagesInput(input);
      const response = await client.fetchJSON(`/users/${seg(payload.username)}/packages${packageQuery(payload)}`);
      return readList(response, "packages", "packages", normalizePackage, "User packages not found.", "GitHub rejected the list user packages request.");
    },
    async listUserPackageVersions(input: unknown) {
      const payload = validateListUserPackageVersionsInput(input);
      const response = await client.fetchJSON(`/users/${seg(payload.username)}/packages/${seg(payload.packageType)}/${encodeURIComponent(payload.packageName)}/versions${pageQuery(payload)}`);
      return readList(response, "versions", null, normalizePackageVersion, "Package versions not found.", "GitHub rejected the list user package versions request.");
    },
    async getRepoCodespaceDefaults(input: unknown) {
      const payload = validateGetRepoCodespaceDefaultsInput(input);
      const response = await client.fetchJSON(`/repos/${seg(payload.owner)}/${seg(payload.repo)}/codespaces/new`);
      return readObject(response, "defaults", normalizeCodespaceDefaults, "Codespace defaults not found.", "GitHub rejected the get repository codespace defaults request.");
    },
    async getCodespaceExport(input: unknown) {
      const payload = validateGetCodespaceExportInput(input);
      const response = await client.fetchJSON(`/user/codespaces/${seg(payload.codespaceName)}/exports/${seg(payload.exportId)}`);
      return readObject(response, "export", normalizeCodespaceExport, "Codespace export not found.", "GitHub rejected the get codespace export request.");
    },
    async listRepoCodespaceMachines(input: unknown) {
      const payload = validateListRepoCodespaceMachinesInput(input);
      const response = await client.fetchJSON(`/repos/${seg(payload.owner)}/${seg(payload.repo)}/codespaces/machines`);
      return readList(response, "machines", "machines", normalizeMachine, "Codespace machines not found.", "GitHub rejected the list repository codespace machines request.");
    },
    async listOrgMemberCodespaces(input: unknown) {
      const payload = validateListOrgMemberCodespacesInput(input);
      const response = await client.fetchJSON(`/orgs/${seg(payload.org)}/members/${seg(payload.username)}/codespaces${pageQuery(payload)}`);
      return readList(response, "codespaces", "codespaces", normalizeCodespace, "Organization member codespaces not found.", "GitHub rejected the list organization member codespaces request.");
    },
    async listUserCodespaces(input: unknown) {
      const payload = validateListUserCodespacesInput(input);
      const response = await client.fetchJSON(`/user/codespaces${pageQuery(payload)}`);
      return readList(response, "codespaces", "codespaces", normalizeCodespace, "Codespaces not found.", "GitHub rejected the list user codespaces request.");
    },
    async listOrgCodespaces(input: unknown) {
      const payload = validateListOrgCodespacesInput(input);
      const response = await client.fetchJSON(`/orgs/${seg(payload.org)}/codespaces${pageQuery(payload)}`);
      return readList(response, "codespaces", "codespaces", normalizeCodespace, "Organization codespaces not found.", "GitHub rejected the list organization codespaces request.");
    },
    async listCodespaceMachines(input: unknown) {
      const payload = validateListCodespaceMachinesInput(input);
      const response = await client.fetchJSON(`/user/codespaces/${seg(payload.codespaceName)}/machines`);
      return readList(response, "machines", "machines", normalizeMachine, "Codespace machines not found.", "GitHub rejected the list codespace machines request.");
    },
  };
}

function readObject<T>(response: { status: number; headers: Record<string, string>; body: unknown }, field: string, normalize: (item: Record<string, unknown>) => T, missing: string, rejected: string) {
  if (response.status === 200 && isRecord(response.body)) return { ok: true as const, [field]: normalize(response.body) };
  if (response.status === 404) return upstream(missing);
  return mapRateOrUpstream(response, rejected);
}

function readList<T>(response: { status: number; headers: Record<string, string>; body: unknown }, field: string, wrapped: string | null, normalize: (item: Record<string, unknown>) => T, missing: string, rejected: string) {
  if (response.status === 200) {
    const raw = listBody(response.body, wrapped);
    if (raw) return { ok: true as const, [field]: raw.map(normalize) };
    return upstream(rejected);
  }
  if (response.status === 404) return upstream(missing);
  return mapRateOrUpstream(response, rejected);
}

function listBody(body: unknown, wrapped: string | null): Record<string, unknown>[] | null {
  if (Array.isArray(body)) return body.filter(isRecord);
  if (wrapped && isRecord(body) && Array.isArray(body[wrapped])) return body[wrapped].filter(isRecord);
  return null;
}

function normalizePackage(item: Record<string, unknown>): NormalizedPackage {
  return {
    id: typeof item.id === "number" ? item.id : 0,
    name: typeof item.name === "string" ? item.name : "",
    packageType: typeof item.package_type === "string" ? item.package_type : "",
    visibility: typeof item.visibility === "string" ? item.visibility : "",
  };
}

function normalizePackageVersion(item: Record<string, unknown>): NormalizedPackageVersion {
  return {
    id: typeof item.id === "number" ? item.id : 0,
    name: typeof item.name === "string" ? item.name : "",
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
  };
}

function normalizeCodespace(item: Record<string, unknown>): NormalizedCodespace {
  return {
    id: typeof item.id === "number" ? item.id : 0,
    name: typeof item.name === "string" ? item.name : "",
    state: typeof item.state === "string" ? item.state : "",
  };
}

function normalizeMachine(item: Record<string, unknown>): NormalizedMachine {
  return {
    name: typeof item.name === "string" ? item.name : "",
    displayName: typeof item.display_name === "string" ? item.display_name : "",
    os: typeof item.operating_system === "string" ? item.operating_system : "",
  };
}

function normalizeCodespaceDefaults(item: Record<string, unknown>): NormalizedCodespaceDefaults {
  const defaults = isRecord(item.defaults) ? item.defaults : item;
  const owner = isRecord(item.billable_owner) ? item.billable_owner : {};
  return {
    location: typeof defaults.location === "string" ? defaults.location : "",
    devcontainerPath: typeof defaults.devcontainer_path === "string" ? defaults.devcontainer_path : "",
    billableOwner: typeof owner.login === "string" ? owner.login : "",
  };
}

function normalizeCodespaceExport(item: Record<string, unknown>): NormalizedCodespaceExport {
  return {
    id: item.id === undefined || item.id === null ? "" : String(item.id),
    state: typeof item.state === "string" ? item.state : "",
    completedAt: typeof item.completed_at === "string" ? item.completed_at : (typeof item.exported_at === "string" ? item.exported_at : ""),
  };
}

function packageQuery(payload: PackageList): string {
  const params = new URLSearchParams();
  params.set("package_type", payload.packageType);
  if (payload.perPage) params.set("per_page", String(payload.perPage));
  if (payload.page) params.set("page", String(payload.page));
  return `?${params.toString()}`;
}

function pageQuery(payload: Page): string {
  const params = new URLSearchParams();
  if (payload.perPage) params.set("per_page", String(payload.perPage));
  if (payload.page) params.set("page", String(payload.page));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function seg(value: string): string {
  return encodeURIComponent(value);
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

function requireObject(input: unknown, action: string): Record<string, unknown> {
  if (!isRecord(input)) throw new Error(`${action} input must be an object`);
  return input;
}

function userPackage(input: Record<string, unknown>): { username: string; packageType: string; packageName: string } {
  return { username: requireSingleSegment(input.username, "username"), ...packageName(input) };
}

function packageName(input: Record<string, unknown>): { packageType: string; packageName: string } {
  return { ...packageType(input), packageName: requirePackageName(input.packageName ?? input.package_name) };
}

function packageType(input: Record<string, unknown>): { packageType: string } {
  const value = requireSingleSegment(input.packageType ?? input.package_type, "package_type");
  if (!PACKAGE_TYPES.has(value)) throw new Error("package_type must be a GitHub package type");
  return { packageType: value };
}

function repo(input: Record<string, unknown>): Repo {
  return { owner: requireSingleSegment(input.owner, "owner"), repo: requireSingleSegment(input.repo, "repo") };
}

function codespace(input: Record<string, unknown>): CodespaceName {
  return { codespaceName: requireSingleSegment(input.codespaceName ?? input.codespace_name, "codespace_name") };
}

function pageOf(input: Record<string, unknown>): Page {
  return {
    perPage: optionalPage(input.perPage, "perPage", 100),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

function requirePackageName(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new Error("package_name is required");
  if (value.includes("?") || value.includes("#")) throw new Error("package_name must not include a query or fragment");
  return value;
}

function requireSingleSegment(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  if (value.includes("/") || value.includes("?") || value.includes("#")) throw new Error(`${field} must be a single path segment`);
  return value;
}

function requireId(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new Error(`${field} must be a positive integer`);
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
