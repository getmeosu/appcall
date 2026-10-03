import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

const PACKAGE_TYPES = ["npm", "maven", "rubygems", "docker", "nuget", "container"] as const;
type PackageType = (typeof PACKAGE_TYPES)[number];
type PackageRef = { packageType: PackageType; packageName: string };

export function validateGetAppInput(input: unknown): { appSlug: string } {
  if (!isRecord(input)) throw new Error("apps.get input must be an object");
  return { appSlug: segment(input.appSlug, "appSlug") };
}

export function validateGetOrgPackageInput(input: unknown): { org: string } & PackageRef {
  if (!isRecord(input)) throw new Error("orgs.packages.get input must be an object");
  return { org: segment(input.org, "org"), ...packageRef(input) };
}

export function validateGetUserPackageInput(input: unknown): { username: string } & PackageRef {
  if (!isRecord(input)) throw new Error("users.packages.get input must be an object");
  return { username: segment(input.username, "username"), ...packageRef(input) };
}

export function validateGetAuthenticatedUserPackageInput(input: unknown): PackageRef {
  if (!isRecord(input)) throw new Error("user.packages.get input must be an object");
  return packageRef(input);
}

export function validateGetOrgPackageVersionInput(input: unknown): { org: string; packageVersionId: number } & PackageRef {
  if (!isRecord(input)) throw new Error("orgs.packages.versions.get input must be an object");
  return {
    org: segment(input.org, "org"),
    ...packageRef(input),
    packageVersionId: positiveInt(input.packageVersionId, "packageVersionId"),
  };
}

export function createCard8ReadsClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const client = options.githubClient ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation: "apps.get",
  });

  return {
    async getApp(input: unknown) {
      const payload = validateGetAppInput(input);
      const result = await read(client, `/apps/${encodeURIComponent(payload.appSlug)}`, "apps.get", "GitHub app was not found.");
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the apps.get request.");
      return { ok: true as const, app: normalizeApp(result.body) };
    },
    async getOrgPackage(input: unknown) {
      const payload = validateGetOrgPackageInput(input);
      return onePackage(client, `/orgs/${encodeURIComponent(payload.org)}/packages/${packagePath(payload)}`, "orgs.packages.get", "GitHub organization package was not found.");
    },
    async getUserPackage(input: unknown) {
      const payload = validateGetUserPackageInput(input);
      return onePackage(client, `/users/${encodeURIComponent(payload.username)}/packages/${packagePath(payload)}`, "users.packages.get", "GitHub user package was not found.");
    },
    async getAuthenticatedUserPackage(input: unknown) {
      const payload = validateGetAuthenticatedUserPackageInput(input);
      return onePackage(client, `/user/packages/${packagePath(payload)}`, "user.packages.get", "GitHub authenticated user package was not found.");
    },
    async getOrgPackageVersion(input: unknown) {
      const payload = validateGetOrgPackageVersionInput(input);
      const path = `/orgs/${encodeURIComponent(payload.org)}/packages/${packagePath(payload)}/versions/${payload.packageVersionId}`;
      const result = await read(client, path, "orgs.packages.versions.get", "GitHub organization package version was not found.");
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the orgs.packages.versions.get request.");
      return { ok: true as const, version: normalizePackageVersion(result.body) };
    },
  };
}

async function onePackage(client: GitHubClient, path: string, operation: string, missing: string) {
  const result = await read(client, path, operation, missing);
  if (!result.ok) return result;
  if (!isRecord(result.body)) return upstream(`GitHub rejected the ${operation} request.`);
  return { ok: true as const, package: normalizePackage(result.body) };
}

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
  return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message } };
}

function normalizeApp(item: Record<string, unknown>) {
  return {
    id: typeof item.id === "number" ? item.id : 0,
    slug: typeof item.slug === "string" ? item.slug : "",
    node_id: typeof item.node_id === "string" ? item.node_id : "",
    name: typeof item.name === "string" ? item.name : "",
    description: typeof item.description === "string" ? item.description : "",
    external_url: typeof item.external_url === "string" ? item.external_url : "",
    html_url: typeof item.html_url === "string" ? item.html_url : "",
    created_at: typeof item.created_at === "string" ? item.created_at : "",
    updated_at: typeof item.updated_at === "string" ? item.updated_at : "",
  };
}

function normalizePackage(item: Record<string, unknown>) {
  const owner = isRecord(item.owner) ? item.owner : undefined;
  return {
    id: typeof item.id === "number" ? item.id : 0,
    name: typeof item.name === "string" ? item.name : "",
    package_type: typeof item.package_type === "string" ? item.package_type : "",
    url: typeof item.url === "string" ? item.url : "",
    html_url: typeof item.html_url === "string" ? item.html_url : "",
    version_count: typeof item.version_count === "number" ? item.version_count : 0,
    visibility: typeof item.visibility === "string" ? item.visibility : "",
    created_at: typeof item.created_at === "string" ? item.created_at : "",
    updated_at: typeof item.updated_at === "string" ? item.updated_at : "",
    owner: owner ? { login: typeof owner.login === "string" ? owner.login : "", id: typeof owner.id === "number" ? owner.id : 0 } : null,
  };
}

function normalizePackageVersion(item: Record<string, unknown>) {
  const metadata = isRecord(item.metadata) ? item.metadata : undefined;
  return {
    id: typeof item.id === "number" ? item.id : 0,
    name: typeof item.name === "string" ? item.name : "",
    url: typeof item.url === "string" ? item.url : "",
    package_html_url: typeof item.package_html_url === "string" ? item.package_html_url : "",
    created_at: typeof item.created_at === "string" ? item.created_at : "",
    updated_at: typeof item.updated_at === "string" ? item.updated_at : "",
    metadata: { package_type: metadata && typeof metadata.package_type === "string" ? metadata.package_type : "" },
  };
}

function packagePath(payload: PackageRef): string {
  return `${encodeURIComponent(payload.packageType)}/${encodeURIComponent(payload.packageName)}`;
}

function packageRef(input: Record<string, unknown>): PackageRef {
  return {
    packageType: packageType(input.packageType),
    packageName: requiredText(input.packageName, "packageName"),
  };
}

function packageType(value: unknown): PackageType {
  if (typeof value !== "string" || !PACKAGE_TYPES.includes(value as PackageType)) {
    throw new Error("packageType must be npm, maven, rubygems, docker, nuget, or container");
  }
  return value as PackageType;
}

function segment(value: unknown, field: string): string {
  const text = requiredText(value, field);
  if (text.includes("/") || text.includes("?") || text.includes("#")) {
    throw new Error(`${field} must be a single path segment`);
  }
  return text;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function positiveInt(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
