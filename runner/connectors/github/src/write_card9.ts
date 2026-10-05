import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

const PACKAGE_TYPES = new Set(["npm", "maven", "rubygems", "docker", "nuget", "container"]);
const ACCESS_VISIBILITY = new Set([
  "disabled",
  "selected_members",
  "all_members",
  "all_members_and_outside_collaborators",
]);

type PackageRef = { packageType: string; packageName: string };
type AuthPackageVersion = PackageRef & { packageVersionId: number };
type OrgPackageVersion = AuthPackageVersion & { org: string };
type UserPackageVersion = AuthPackageVersion & { username: string };
type CodespaceOpts = {
  ref?: string;
  machine?: string;
  displayName?: string;
  location?: string;
  geo?: string;
  idleTimeoutMinutes?: number;
};
type CreateUserCodespace = CodespaceOpts & {
  repositoryId?: number;
  pullRequest?: { pullRequestNumber: number; repositoryId: number };
};
type CreateRepoCodespace = CodespaceOpts & { owner: string; repo: string };
type CreatePullCodespace = CodespaceOpts & { owner: string; repo: string; pullNumber: number };
type CodespaceName = { codespaceName: string };
type PublishCodespace = CodespaceName & { name?: string; private?: boolean };
type OrgAccess = { org: string; visibility: string; selectedUsernames?: string[] };
type OrgSelectedUsers = { org: string; selectedUsernames: string[] };
type OrgMemberCodespace = { org: string; username: string; codespaceName: string };

export function validateRestoreAuthenticatedPackageVersionInput(input: unknown): AuthPackageVersion {
  if (!isRecord(input)) throw new Error("user.packages.versions.restore input must be an object");
  return { ...packageRef(input), packageVersionId: requireId(input.packageVersionId ?? input.package_version_id, "packageVersionId") };
}

export function validateRestoreOrgPackageVersionInput(input: unknown): OrgPackageVersion {
  if (!isRecord(input)) throw new Error("orgs.packages.versions.restore input must be an object");
  return {
    org: requireSingleSegment(input.org, "org"),
    ...packageRef(input),
    packageVersionId: requireId(input.packageVersionId ?? input.package_version_id, "packageVersionId"),
  };
}

export function validateRestoreUserPackageVersionInput(input: unknown): UserPackageVersion {
  if (!isRecord(input)) throw new Error("users.packages.versions.restore input must be an object");
  return {
    username: requireSingleSegment(input.username, "username"),
    ...packageRef(input),
    packageVersionId: requireId(input.packageVersionId ?? input.package_version_id, "packageVersionId"),
  };
}

export function validateAddOrgCodespacesAccessSelectedUsersInput(input: unknown): OrgSelectedUsers {
  if (!isRecord(input)) throw new Error("orgs.codespaces.access.selected_users.add input must be an object");
  return { org: requireSingleSegment(input.org, "org"), selectedUsernames: requireUsernames(input.selectedUsernames ?? input.selected_usernames) };
}

export function validateCreateUserCodespaceInput(input: unknown): CreateUserCodespace {
  if (!isRecord(input)) throw new Error("user.codespaces.create input must be an object");
  const opts = codespaceOpts(input);
  const hasRepo = input.repositoryId !== undefined || input.repository_id !== undefined;
  const hasPull = input.pullRequest !== undefined || input.pull_request !== undefined;
  if (hasRepo === hasPull) {
    throw new Error("user.codespaces.create requires exactly one of repositoryId or pullRequest");
  }
  if (hasRepo) {
    return { ...opts, repositoryId: requireId(input.repositoryId ?? input.repository_id, "repositoryId") };
  }
  const pull = input.pullRequest ?? input.pull_request;
  if (!isRecord(pull)) throw new Error("pullRequest must be an object");
  return {
    ...opts,
    pullRequest: {
      pullRequestNumber: requireId(pull.pullRequestNumber ?? pull.pull_request_number, "pullRequestNumber"),
      repositoryId: requireId(pull.repositoryId ?? pull.repository_id, "repositoryId"),
    },
  };
}

export function validateCreateRepoCodespaceInput(input: unknown): CreateRepoCodespace {
  if (!isRecord(input)) throw new Error("repos.codespaces.create input must be an object");
  return {
    owner: requireSingleSegment(input.owner, "owner"),
    repo: requireSingleSegment(input.repo, "repo"),
    ...codespaceOpts(input),
  };
}

export function validateCreatePullCodespaceInput(input: unknown): CreatePullCodespace {
  if (!isRecord(input)) throw new Error("repos.pulls.codespaces.create input must be an object");
  return {
    owner: requireSingleSegment(input.owner, "owner"),
    repo: requireSingleSegment(input.repo, "repo"),
    pullNumber: requireId(input.pullNumber ?? input.pull_number, "pullNumber"),
    ...codespaceOpts(input),
  };
}

export function validatePublishCodespaceInput(input: unknown): PublishCodespace {
  if (!isRecord(input)) throw new Error("user.codespaces.publish input must be an object");
  return {
    codespaceName: requireSingleSegment(input.codespaceName ?? input.codespace_name, "codespaceName"),
    name: optionalString(input.name, "name"),
    private: optionalBoolean(input.private, "private"),
  };
}

export function validateCreateCodespaceExportInput(input: unknown): CodespaceName {
  if (!isRecord(input)) throw new Error("user.codespaces.exports.create input must be an object");
  return { codespaceName: requireSingleSegment(input.codespaceName ?? input.codespace_name, "codespaceName") };
}

export function validateSetOrgCodespacesAccessInput(input: unknown): OrgAccess {
  if (!isRecord(input)) throw new Error("orgs.codespaces.access.set input must be an object");
  const visibility = requireSingleSegment(input.visibility, "visibility");
  if (!ACCESS_VISIBILITY.has(visibility)) throw new Error("visibility must be a GitHub codespaces access visibility");
  const selected = input.selectedUsernames ?? input.selected_usernames;
  return {
    org: requireSingleSegment(input.org, "org"),
    visibility,
    selectedUsernames: selected === undefined ? undefined : requireUsernames(selected),
  };
}

export function validateStartUserCodespaceInput(input: unknown): CodespaceName {
  if (!isRecord(input)) throw new Error("user.codespaces.start input must be an object");
  return { codespaceName: requireSingleSegment(input.codespaceName ?? input.codespace_name, "codespaceName") };
}

export function validateStopOrgMemberCodespaceInput(input: unknown): OrgMemberCodespace {
  if (!isRecord(input)) throw new Error("orgs.members.codespaces.stop input must be an object");
  return {
    org: requireSingleSegment(input.org, "org"),
    username: requireSingleSegment(input.username, "username"),
    codespaceName: requireSingleSegment(input.codespaceName ?? input.codespace_name, "codespaceName"),
  };
}

export function validateStopUserCodespaceInput(input: unknown): CodespaceName {
  if (!isRecord(input)) throw new Error("user.codespaces.stop input must be an object");
  return { codespaceName: requireSingleSegment(input.codespaceName ?? input.codespace_name, "codespaceName") };
}

export function createWriteCard9Client(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const base = options.githubClient;
  const clientFor = (operation: string) => base ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation,
  });

  return {
    async restoreAuthenticatedPackageVersion(input: unknown) {
      const payload = validateRestoreAuthenticatedPackageVersionInput(input);
      const response = await clientFor("user.packages.versions.restore").fetchJSON(
        `/user/packages/${seg(payload.packageType)}/${encodeURIComponent(payload.packageName)}/versions/${payload.packageVersionId}/restore`,
        { method: "POST" },
      );
      return noContent(response, 204, {
        restored: true,
        packageType: payload.packageType,
        packageName: payload.packageName,
        packageVersionId: payload.packageVersionId,
      }, "Package version was not found.", "GitHub rejected the restore authenticated package version request.");
    },
    async restoreOrgPackageVersion(input: unknown) {
      const payload = validateRestoreOrgPackageVersionInput(input);
      const response = await clientFor("orgs.packages.versions.restore").fetchJSON(
        `/orgs/${seg(payload.org)}/packages/${seg(payload.packageType)}/${encodeURIComponent(payload.packageName)}/versions/${payload.packageVersionId}/restore`,
        { method: "POST" },
      );
      return noContent(response, 204, {
        restored: true,
        org: payload.org,
        packageType: payload.packageType,
        packageName: payload.packageName,
        packageVersionId: payload.packageVersionId,
      }, "Package version was not found.", "GitHub rejected the restore organization package version request.");
    },
    async restoreUserPackageVersion(input: unknown) {
      const payload = validateRestoreUserPackageVersionInput(input);
      const response = await clientFor("users.packages.versions.restore").fetchJSON(
        `/users/${seg(payload.username)}/packages/${seg(payload.packageType)}/${encodeURIComponent(payload.packageName)}/versions/${payload.packageVersionId}/restore`,
        { method: "POST" },
      );
      return noContent(response, 204, {
        restored: true,
        username: payload.username,
        packageType: payload.packageType,
        packageName: payload.packageName,
        packageVersionId: payload.packageVersionId,
      }, "Package version was not found.", "GitHub rejected the restore user package version request.");
    },
    async addOrgCodespacesAccessSelectedUsers(input: unknown) {
      const payload = validateAddOrgCodespacesAccessSelectedUsersInput(input);
      const response = await clientFor("orgs.codespaces.access.selected_users.add").fetchJSON(
        `/orgs/${seg(payload.org)}/codespaces/access/selected_users`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selected_usernames: payload.selectedUsernames }),
        },
      );
      return noContent(response, 204, {
        added: true,
        org: payload.org,
        selectedUsernames: payload.selectedUsernames,
      }, "Organization was not found.", "GitHub rejected the add organization codespaces access users request.");
    },
    async createUserCodespace(input: unknown) {
      const payload = validateCreateUserCodespaceInput(input);
      const body = codespaceBody(payload);
      if (payload.repositoryId !== undefined) body.repository_id = payload.repositoryId;
      if (payload.pullRequest) {
        body.pull_request = {
          pull_request_number: payload.pullRequest.pullRequestNumber,
          repository_id: payload.pullRequest.repositoryId,
        };
      }
      const response = await clientFor("user.codespaces.create").fetchJSON("/user/codespaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return jsonBody(response, [201, 202], "codespace", "Codespace repository was not found.", "GitHub rejected the create user codespace request.");
    },
    async createRepoCodespace(input: unknown) {
      const payload = validateCreateRepoCodespaceInput(input);
      const response = await clientFor("repos.codespaces.create").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/codespaces`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(codespaceBody(payload)),
        },
      );
      return jsonBody(response, [201, 202], "codespace", "Repository was not found.", "GitHub rejected the create repository codespace request.");
    },
    async createPullCodespace(input: unknown) {
      const payload = validateCreatePullCodespaceInput(input);
      const response = await clientFor("repos.pulls.codespaces.create").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/pulls/${payload.pullNumber}/codespaces`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(codespaceBody(payload)),
        },
      );
      return jsonBody(response, [201, 202], "codespace", "Pull request was not found.", "GitHub rejected the create pull request codespace request.");
    },
    async publishCodespace(input: unknown) {
      const payload = validatePublishCodespaceInput(input);
      const body: Record<string, unknown> = {};
      if (payload.name !== undefined) body.name = payload.name;
      if (payload.private !== undefined) body.private = payload.private;
      const response = await clientFor("user.codespaces.publish").fetchJSON(
        `/user/codespaces/${seg(payload.codespaceName)}/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      return jsonBody(response, [201], "codespace", "Codespace was not found.", "GitHub rejected the publish codespace request.");
    },
    async createCodespaceExport(input: unknown) {
      const payload = validateCreateCodespaceExportInput(input);
      const response = await clientFor("user.codespaces.exports.create").fetchJSON(
        `/user/codespaces/${seg(payload.codespaceName)}/exports`,
        { method: "POST" },
      );
      return jsonBody(response, [202], "export", "Codespace was not found.", "GitHub rejected the create codespace export request.");
    },
    async setOrgCodespacesAccess(input: unknown) {
      const payload = validateSetOrgCodespacesAccessInput(input);
      const body: Record<string, unknown> = { visibility: payload.visibility };
      if (payload.selectedUsernames !== undefined) body.selected_usernames = payload.selectedUsernames;
      const response = await clientFor("orgs.codespaces.access.set").fetchJSON(
        `/orgs/${seg(payload.org)}/codespaces/access`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      return noContent(response, 204, {
        set: true,
        org: payload.org,
        visibility: payload.visibility,
        selectedUsernames: payload.selectedUsernames,
      }, "Organization was not found.", "GitHub rejected the set organization codespaces access request.");
    },
    async startUserCodespace(input: unknown) {
      const payload = validateStartUserCodespaceInput(input);
      const response = await clientFor("user.codespaces.start").fetchJSON(
        `/user/codespaces/${seg(payload.codespaceName)}/start`,
        { method: "POST" },
      );
      return jsonBody(response, [200], "codespace", "Codespace was not found.", "GitHub rejected the start codespace request.");
    },
    async stopOrgMemberCodespace(input: unknown) {
      const payload = validateStopOrgMemberCodespaceInput(input);
      const response = await clientFor("orgs.members.codespaces.stop").fetchJSON(
        `/orgs/${seg(payload.org)}/members/${seg(payload.username)}/codespaces/${seg(payload.codespaceName)}/stop`,
        { method: "POST" },
      );
      return jsonBody(response, [200], "codespace", "Codespace was not found.", "GitHub rejected the stop organization member codespace request.");
    },
    async stopUserCodespace(input: unknown) {
      const payload = validateStopUserCodespaceInput(input);
      const response = await clientFor("user.codespaces.stop").fetchJSON(
        `/user/codespaces/${seg(payload.codespaceName)}/stop`,
        { method: "POST" },
      );
      return jsonBody(response, [200], "codespace", "Codespace was not found.", "GitHub rejected the stop codespace request.");
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

function jsonBody(
  response: { status: number; headers: Record<string, string>; body: unknown },
  success: number[],
  field: string,
  missing: string,
  rejected: string,
) {
  if (success.includes(response.status) && isRecord(response.body)) {
    return { ok: true as const, [field]: response.body };
  }
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

function codespaceOpts(input: Record<string, unknown>): CodespaceOpts {
  return {
    ref: optionalString(input.ref, "ref"),
    machine: optionalString(input.machine, "machine"),
    displayName: optionalString(input.displayName ?? input.display_name, "displayName"),
    location: optionalString(input.location, "location"),
    geo: optionalString(input.geo, "geo"),
    idleTimeoutMinutes: optionalPositiveInt(input.idleTimeoutMinutes ?? input.idle_timeout_minutes, "idleTimeoutMinutes"),
  };
}

function codespaceBody(payload: CodespaceOpts): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (payload.ref !== undefined) body.ref = payload.ref;
  if (payload.machine !== undefined) body.machine = payload.machine;
  if (payload.displayName !== undefined) body.display_name = payload.displayName;
  if (payload.location !== undefined) body.location = payload.location;
  if (payload.geo !== undefined) body.geo = payload.geo;
  if (payload.idleTimeoutMinutes !== undefined) body.idle_timeout_minutes = payload.idleTimeoutMinutes;
  return body;
}

function requireUsernames(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("selectedUsernames must be a non-empty array");
  return value.map((item, index) => {
    if (typeof item !== "string" || item.length === 0) throw new Error(`selectedUsernames[${index}] must be a string`);
    if (item.includes("/") || item.includes("?") || item.includes("#")) {
      throw new Error(`selectedUsernames[${index}] must be a single path segment`);
    }
    return item;
  });
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

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} must be a non-empty string`);
  return value;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${field} must be a boolean`);
  return value;
}

function optionalPositiveInt(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  return requireId(value, field);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
