import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

const PACKAGE_TYPES = new Set(["npm", "maven", "rubygems", "docker", "nuget", "container"]);

type PackageRef = { packageType: string; packageName: string };
type AuthPackageVersion = PackageRef & { packageVersionId: number };
type OrgPackageVersion = AuthPackageVersion & { org: string };
type UserPackageVersion = AuthPackageVersion & { username: string };
type AuthPackageRestore = PackageRef;
type OrgPackageRestore = PackageRef & { org: string };
type UserPackageRestore = PackageRef & { username: string };

export function validateDeleteAuthenticatedPackageVersionInput(input: unknown): AuthPackageVersion {
  if (!isRecord(input)) throw new Error("user.packages.versions.delete input must be an object");
  return { ...packageRef(input), packageVersionId: requireId(input.packageVersionId ?? input.package_version_id, "packageVersionId") };
}

export function validateDeleteOrgPackageVersionInput(input: unknown): OrgPackageVersion {
  if (!isRecord(input)) throw new Error("orgs.packages.versions.delete input must be an object");
  return {
    org: requireSingleSegment(input.org, "org"),
    ...packageRef(input),
    packageVersionId: requireId(input.packageVersionId ?? input.package_version_id, "packageVersionId"),
  };
}

export function validateDeleteUserPackageVersionInput(input: unknown): UserPackageVersion {
  if (!isRecord(input)) throw new Error("users.packages.versions.delete input must be an object");
  return {
    username: requireSingleSegment(input.username, "username"),
    ...packageRef(input),
    packageVersionId: requireId(input.packageVersionId ?? input.package_version_id, "packageVersionId"),
  };
}

export function validateRestoreOrgPackageInput(input: unknown): OrgPackageRestore {
  if (!isRecord(input)) throw new Error("orgs.packages.restore input must be an object");
  return { org: requireSingleSegment(input.org, "org"), ...packageRef(input) };
}

export function validateRestoreUserPackageInput(input: unknown): UserPackageRestore {
  if (!isRecord(input)) throw new Error("users.packages.restore input must be an object");
  return { username: requireSingleSegment(input.username, "username"), ...packageRef(input) };
}

export function validateRestoreAuthenticatedPackageInput(input: unknown): AuthPackageRestore {
  if (!isRecord(input)) throw new Error("user.packages.restore input must be an object");
  return packageRef(input);
}

export function createWriteCard8Client(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const base = options.githubClient;
  const clientFor = (operation: string) => base ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation,
  });

  return {
    async deleteAuthenticatedPackageVersion(input: unknown) {
      const payload = validateDeleteAuthenticatedPackageVersionInput(input);
      const response = await clientFor("user.packages.versions.delete").fetchJSON(
        `/user/packages/${seg(payload.packageType)}/${encodeURIComponent(payload.packageName)}/versions/${payload.packageVersionId}`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        {
          deleted: true,
          packageType: payload.packageType,
          packageName: payload.packageName,
          packageVersionId: payload.packageVersionId,
        },
        "Package version was not found.",
        "GitHub rejected the delete authenticated package version request.",
      );
    },
    async deleteOrgPackageVersion(input: unknown) {
      const payload = validateDeleteOrgPackageVersionInput(input);
      const response = await clientFor("orgs.packages.versions.delete").fetchJSON(
        `/orgs/${seg(payload.org)}/packages/${seg(payload.packageType)}/${encodeURIComponent(payload.packageName)}/versions/${payload.packageVersionId}`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        {
          deleted: true,
          org: payload.org,
          packageType: payload.packageType,
          packageName: payload.packageName,
          packageVersionId: payload.packageVersionId,
        },
        "Package version was not found.",
        "GitHub rejected the delete organization package version request.",
      );
    },
    async deleteUserPackageVersion(input: unknown) {
      const payload = validateDeleteUserPackageVersionInput(input);
      const response = await clientFor("users.packages.versions.delete").fetchJSON(
        `/users/${seg(payload.username)}/packages/${seg(payload.packageType)}/${encodeURIComponent(payload.packageName)}/versions/${payload.packageVersionId}`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        {
          deleted: true,
          username: payload.username,
          packageType: payload.packageType,
          packageName: payload.packageName,
          packageVersionId: payload.packageVersionId,
        },
        "Package version was not found.",
        "GitHub rejected the delete user package version request.",
      );
    },
    async restoreOrgPackage(input: unknown) {
      const payload = validateRestoreOrgPackageInput(input);
      const response = await clientFor("orgs.packages.restore").fetchJSON(
        `/orgs/${seg(payload.org)}/packages/${seg(payload.packageType)}/${encodeURIComponent(payload.packageName)}/restore`,
        { method: "POST" },
      );
      return noContent(
        response,
        204,
        { restored: true, org: payload.org, packageType: payload.packageType, packageName: payload.packageName },
        "Package was not found.",
        "GitHub rejected the restore organization package request.",
      );
    },
    async restoreUserPackage(input: unknown) {
      const payload = validateRestoreUserPackageInput(input);
      const response = await clientFor("users.packages.restore").fetchJSON(
        `/users/${seg(payload.username)}/packages/${seg(payload.packageType)}/${encodeURIComponent(payload.packageName)}/restore`,
        { method: "POST" },
      );
      return noContent(
        response,
        204,
        { restored: true, username: payload.username, packageType: payload.packageType, packageName: payload.packageName },
        "Package was not found.",
        "GitHub rejected the restore user package request.",
      );
    },
    async restoreAuthenticatedPackage(input: unknown) {
      const payload = validateRestoreAuthenticatedPackageInput(input);
      const response = await clientFor("user.packages.restore").fetchJSON(
        `/user/packages/${seg(payload.packageType)}/${encodeURIComponent(payload.packageName)}/restore`,
        { method: "POST" },
      );
      return noContent(
        response,
        204,
        { restored: true, packageType: payload.packageType, packageName: payload.packageName },
        "Package was not found.",
        "GitHub rejected the restore authenticated package request.",
      );
    },
  };
}

function noContent(
  response: { status: number; headers: Record<string, string> },
  success: number,
  value: Record<string, unknown>,
  missing: string,
  rejected: string,
) {
  if (response.status === success) return { ok: true as const, ...value };
  if (response.status === 404) return upstream(missing);
  return mapRateOrUpstream(response, rejected);
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

function packageRef(input: Record<string, unknown>): PackageRef {
  const packageType = requireSingleSegment(input.packageType ?? input.package_type, "packageType");
  if (!PACKAGE_TYPES.has(packageType)) throw new Error("packageType must be a GitHub package type");
  const packageName = input.packageName ?? input.package_name;
  if (typeof packageName !== "string" || packageName.length === 0) throw new Error("packageName is required");
  if (packageName.includes("?") || packageName.includes("#")) {
    throw new Error("packageName must not include a query or fragment");
  }
  return { packageType, packageName };
}

function seg(value: string): string {
  return encodeURIComponent(value);
}

function requireSingleSegment(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  if (value.includes("/") || value.includes("?") || value.includes("#")) {
    throw new Error(`${field} must be a single path segment`);
  }
  return value;
}

function requireId(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
