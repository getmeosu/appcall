import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

type OwnerRepo = { owner: string; repo: string };
type Invitation = { invitationId: number };

const LIMITS = ["existing_users", "contributors_only", "collaborators_only"] as const;
const EXPIRIES = ["one_day", "three_days", "one_week", "one_month", "six_months"] as const;
const PERMISSIONS = ["read", "write", "maintain", "triage", "admin"] as const;

export type CreateAutolinkInput = OwnerRepo & {
  keyPrefix: string;
  urlTemplate: string;
  isAlphanumeric?: boolean;
};

export type GenerateRepoInput = {
  templateOwner: string;
  templateRepo: string;
  owner?: string;
  name: string;
  description?: string;
  includeAllBranches?: boolean;
  private?: boolean;
};

export type DependencySnapshotInput = OwnerRepo & {
  version: number;
  sha: string;
  ref: string;
  job: { id: string; correlator: string; htmlUrl?: string };
  detector: { name: string; version: string; url: string };
  scanned: string;
  manifests?: Record<string, unknown>;
};

export type MarkRepoNotificationsInput = OwnerRepo & { lastReadAt?: string };

export type TransferRepoInput = OwnerRepo & {
  newOwner: string;
  newName?: string;
  teamIds?: number[];
};

export type UpdateRepoInvitationInput = OwnerRepo & Invitation & {
  permissions?: (typeof PERMISSIONS)[number];
};

export type CheckSuitePreference = { appId: number; setting: boolean };

export type UpdateCheckSuitePreferencesInput = OwnerRepo & {
  autoTriggerChecks?: CheckSuitePreference[];
};

export type ReplaceTopicsInput = OwnerRepo & { names: string[] };

export type SetSubscriptionInput = OwnerRepo & { subscribed?: boolean; ignored?: boolean };

export type SetRepoInteractionLimitsInput = OwnerRepo & { limit: string; expiry?: string };

export function validateAcceptRepositoryInvitationInput(input: unknown): Invitation {
  if (!isRecord(input)) throw new Error("user.repository_invitations.accept input must be an object");
  return { invitationId: requireId(input.invitationId, "invitationId") };
}

export function validateCreateAutolinkInput(input: unknown): CreateAutolinkInput {
  if (!isRecord(input)) throw new Error("repos.autolinks.create input must be an object");
  const isAlphanumeric = optionalBoolean(input.isAlphanumeric, "isAlphanumeric");
  return {
    ...ownerRepo(input),
    keyPrefix: requireString(input.keyPrefix, "keyPrefix"),
    urlTemplate: requireString(input.urlTemplate, "urlTemplate"),
    isAlphanumeric,
  };
}

export function validateGenerateRepoInput(input: unknown): GenerateRepoInput {
  if (!isRecord(input)) throw new Error("repos.generate input must be an object");
  return {
    templateOwner: requireSingleSegment(input.templateOwner, "templateOwner"),
    templateRepo: requireSingleSegment(input.templateRepo, "templateRepo"),
    owner: optionalSingleSegment(input.owner, "owner"),
    name: requireSingleSegment(input.name, "name"),
    description: optionalString(input.description, "description"),
    includeAllBranches: optionalBoolean(input.includeAllBranches, "includeAllBranches"),
    private: optionalBoolean(input.private, "private"),
  };
}

export function validateCreateDependencySnapshotInput(input: unknown): DependencySnapshotInput {
  if (!isRecord(input)) throw new Error("repos.dependency_graph.snapshots.create input must be an object");
  if (typeof input.version !== "number" || !Number.isSafeInteger(input.version) || input.version < 0) {
    throw new Error("version must be a non-negative integer");
  }
  const sha = requireString(input.sha, "sha");
  if (sha.length > 64) throw new Error("sha must be at most 64 characters");
  if (!isRecord(input.job)) throw new Error("job must be an object");
  if (!isRecord(input.detector)) throw new Error("detector must be an object");
  let manifests: Record<string, unknown> | undefined;
  if (input.manifests !== undefined) {
    if (!isRecord(input.manifests)) throw new Error("manifests must be an object");
    manifests = input.manifests;
  }
  return {
    ...ownerRepo(input),
    version: input.version,
    sha,
    ref: requireString(input.ref, "ref"),
    job: {
      id: requireString(input.job.id, "job.id"),
      correlator: requireString(input.job.correlator, "job.correlator"),
      htmlUrl: optionalString(input.job.htmlUrl, "job.htmlUrl"),
    },
    detector: {
      name: requireString(input.detector.name, "detector.name"),
      version: requireString(input.detector.version, "detector.version"),
      url: requireString(input.detector.url, "detector.url"),
    },
    scanned: requireString(input.scanned, "scanned"),
    manifests,
  };
}

export function validateDeclineRepositoryInvitationInput(input: unknown): Invitation {
  if (!isRecord(input)) throw new Error("user.repository_invitations.decline input must be an object");
  return { invitationId: requireId(input.invitationId, "invitationId") };
}

export function validateDeleteRepoInput(input: unknown): OwnerRepo {
  if (!isRecord(input)) throw new Error("repos.delete input must be an object");
  return ownerRepo(input);
}

export function validateDeleteRepoInvitationInput(input: unknown): OwnerRepo & Invitation {
  if (!isRecord(input)) throw new Error("repos.invitations.delete input must be an object");
  return { ...ownerRepo(input), invitationId: requireId(input.invitationId, "invitationId") };
}

export function validateDeleteRepoSubscriptionInput(input: unknown): OwnerRepo {
  if (!isRecord(input)) throw new Error("repos.subscription.delete input must be an object");
  return ownerRepo(input);
}

export function validateMarkRepoNotificationsInput(input: unknown): MarkRepoNotificationsInput {
  if (!isRecord(input)) throw new Error("repos.notifications.mark_read input must be an object");
  return { ...ownerRepo(input), lastReadAt: optionalString(input.lastReadAt, "lastReadAt") };
}

export function validateDeleteRepoInteractionLimitsInput(input: unknown): OwnerRepo {
  if (!isRecord(input)) throw new Error("repos.interaction_limits.delete input must be an object");
  return ownerRepo(input);
}

export function validateTransferRepoInput(input: unknown): TransferRepoInput {
  if (!isRecord(input)) throw new Error("repos.transfer input must be an object");
  let teamIds: number[] | undefined;
  if (input.teamIds !== undefined) {
    if (!Array.isArray(input.teamIds)) throw new Error("teamIds must be an array");
    teamIds = input.teamIds.map((id) => requireId(id, "teamIds"));
  }
  return {
    ...ownerRepo(input),
    newOwner: requireSingleSegment(input.newOwner, "newOwner"),
    newName: optionalSingleSegment(input.newName, "newName"),
    teamIds,
  };
}

export function validateUpdateRepoInvitationInput(input: unknown): UpdateRepoInvitationInput {
  if (!isRecord(input)) throw new Error("repos.invitations.update input must be an object");
  let permissions: UpdateRepoInvitationInput["permissions"];
  if (input.permissions !== undefined) {
    if (typeof input.permissions !== "string" || !PERMISSIONS.includes(input.permissions as (typeof PERMISSIONS)[number])) {
      throw new Error("permissions must be read, write, maintain, triage, or admin");
    }
    permissions = input.permissions as UpdateRepoInvitationInput["permissions"];
  }
  return { ...ownerRepo(input), invitationId: requireId(input.invitationId, "invitationId"), permissions };
}

export function validateUpdateCheckSuitePreferencesInput(input: unknown): UpdateCheckSuitePreferencesInput {
  if (!isRecord(input)) throw new Error("repos.check_suites.preferences.update input must be an object");
  let autoTriggerChecks: CheckSuitePreference[] | undefined;
  if (input.autoTriggerChecks !== undefined) {
    if (!Array.isArray(input.autoTriggerChecks)) throw new Error("autoTriggerChecks must be an array");
    autoTriggerChecks = input.autoTriggerChecks.map((item) => {
      if (!isRecord(item)) throw new Error("autoTriggerChecks items must be objects");
      if (typeof item.setting !== "boolean") throw new Error("setting must be a boolean");
      return { appId: requireId(item.appId, "appId"), setting: item.setting };
    });
  }
  return { ...ownerRepo(input), autoTriggerChecks };
}

export function validateReplaceTopicsInput(input: unknown): ReplaceTopicsInput {
  if (!isRecord(input)) throw new Error("repos.topics.replace input must be an object");
  if (!Array.isArray(input.names) || input.names.some((name) => typeof name !== "string")) {
    throw new Error("names must be an array of strings");
  }
  return { ...ownerRepo(input), names: input.names };
}

export function validateSetRepoSubscriptionInput(input: unknown): SetSubscriptionInput {
  if (!isRecord(input)) throw new Error("repos.subscription.set input must be an object");
  return {
    ...ownerRepo(input),
    subscribed: optionalBoolean(input.subscribed, "subscribed"),
    ignored: optionalBoolean(input.ignored, "ignored"),
  };
}

export function validateSetRepoInteractionLimitsInput(input: unknown): SetRepoInteractionLimitsInput {
  if (!isRecord(input)) throw new Error("repos.interaction_limits.set input must be an object");
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
  return { ...ownerRepo(input), limit: input.limit, expiry };
}

export function createWriteCard2Client(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const base = options.githubClient;
  const clientFor = (operation: string) => base ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation,
  });

  return {
    async acceptRepositoryInvitation(input: unknown) {
      const payload = validateAcceptRepositoryInvitationInput(input);
      const response = await clientFor("user.repository_invitations.accept").fetchJSON(
        `/user/repository_invitations/${payload.invitationId}`,
        { method: "PATCH" },
      );
      return noContent(response, 204, { accepted: true, invitationId: payload.invitationId }, "Repository invitation was not found.", "GitHub rejected the accept repository invitation request.");
    },
    async createAutolink(input: unknown) {
      const payload = validateCreateAutolinkInput(input);
      const body: Record<string, unknown> = { key_prefix: payload.keyPrefix, url_template: payload.urlTemplate };
      if (payload.isAlphanumeric !== undefined) body.is_alphanumeric = payload.isAlphanumeric;
      const response = await clientFor("repos.autolinks.create").fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/autolinks`,
        jsonInit("POST", body),
      );
      return jsonBody(response, 201, "autolink", "Autolink was not found.", "GitHub rejected the create autolink request.");
    },
    async generateRepo(input: unknown) {
      const payload = validateGenerateRepoInput(input);
      const body: Record<string, unknown> = { name: payload.name };
      if (payload.owner !== undefined) body.owner = payload.owner;
      if (payload.description !== undefined) body.description = payload.description;
      if (payload.includeAllBranches !== undefined) body.include_all_branches = payload.includeAllBranches;
      if (payload.private !== undefined) body.private = payload.private;
      const response = await clientFor("repos.generate").fetchJSON(
        `/repos/${encodeURIComponent(payload.templateOwner)}/${encodeURIComponent(payload.templateRepo)}/generate`,
        jsonInit("POST", body),
      );
      return jsonBody(response, 201, "repository", "Template repository was not found.", "GitHub rejected the generate repository request.");
    },
    async createDependencySnapshot(input: unknown) {
      const payload = validateCreateDependencySnapshotInput(input);
      const job: Record<string, unknown> = { id: payload.job.id, correlator: payload.job.correlator };
      if (payload.job.htmlUrl !== undefined) job.html_url = payload.job.htmlUrl;
      const body: Record<string, unknown> = {
        version: payload.version,
        sha: payload.sha,
        ref: payload.ref,
        job,
        detector: payload.detector,
        scanned: payload.scanned,
      };
      if (payload.manifests !== undefined) body.manifests = payload.manifests;
      const response = await clientFor("repos.dependency_graph.snapshots.create").fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/dependency-graph/snapshots`,
        jsonInit("POST", body),
      );
      return jsonBody(response, 201, "snapshot", "Repository was not found.", "GitHub rejected the dependency snapshot request.");
    },
    async declineRepositoryInvitation(input: unknown) {
      const payload = validateDeclineRepositoryInvitationInput(input);
      const response = await clientFor("user.repository_invitations.decline").fetchJSON(
        `/user/repository_invitations/${payload.invitationId}`,
        { method: "DELETE" },
      );
      return noContent(response, 204, { declined: true, invitationId: payload.invitationId }, "Repository invitation was not found.", "GitHub rejected the decline repository invitation request.");
    },
    async deleteRepo(input: unknown) {
      const payload = validateDeleteRepoInput(input);
      const response = await clientFor("repos.delete").fetchJSON(repoPath(payload.owner, payload.repo), { method: "DELETE" });
      return noContent(response, 204, { deleted: true, owner: payload.owner, repo: payload.repo }, "Repository not found.", "GitHub rejected the delete repository request.");
    },
    async deleteRepoInvitation(input: unknown) {
      const payload = validateDeleteRepoInvitationInput(input);
      const response = await clientFor("repos.invitations.delete").fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/invitations/${payload.invitationId}`,
        { method: "DELETE" },
      );
      return noContent(response, 204, { deleted: true, owner: payload.owner, repo: payload.repo, invitationId: payload.invitationId }, "Repository invitation was not found.", "GitHub rejected the delete repository invitation request.");
    },
    async deleteRepoSubscription(input: unknown) {
      const payload = validateDeleteRepoSubscriptionInput(input);
      const response = await clientFor("repos.subscription.delete").fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/subscription`,
        { method: "DELETE" },
      );
      return noContent(response, 204, { deleted: true, owner: payload.owner, repo: payload.repo }, "Repository subscription was not found.", "GitHub rejected the delete repository subscription request.");
    },
    async markRepoNotificationsRead(input: unknown) {
      const payload = validateMarkRepoNotificationsInput(input);
      const body: Record<string, string> = {};
      if (payload.lastReadAt !== undefined) body.last_read_at = payload.lastReadAt;
      const response = await clientFor("repos.notifications.mark_read").fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/notifications`,
        jsonInit("PUT", body),
      );
      if (response.status === 202 || response.status === 205) {
        return { ok: true as const, marked: true, owner: payload.owner, repo: payload.repo, status: response.status };
      }
      if (response.status === 404) return upstream("Repository notifications were not found.");
      return mapRateOrUpstream(response, "GitHub rejected the mark repository notifications request.");
    },
    async deleteRepoInteractionLimits(input: unknown) {
      const payload = validateDeleteRepoInteractionLimitsInput(input);
      const response = await clientFor("repos.interaction_limits.delete").fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/interaction-limits`,
        { method: "DELETE" },
      );
      return noContent(response, 204, { deleted: true, owner: payload.owner, repo: payload.repo }, "Repository interaction limits were not found.", "GitHub rejected the delete repository interaction limits request.");
    },
    async transferRepo(input: unknown) {
      const payload = validateTransferRepoInput(input);
      const body: Record<string, unknown> = { new_owner: payload.newOwner };
      if (payload.newName !== undefined) body.new_name = payload.newName;
      if (payload.teamIds !== undefined) body.team_ids = payload.teamIds;
      const response = await clientFor("repos.transfer").fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/transfer`,
        jsonInit("POST", body),
      );
      return jsonBody(response, 202, "repository", "Repository was not found.", "GitHub rejected the transfer repository request.");
    },
    async updateRepoInvitation(input: unknown) {
      const payload = validateUpdateRepoInvitationInput(input);
      const body: Record<string, unknown> = {};
      if (payload.permissions !== undefined) body.permissions = payload.permissions;
      const response = await clientFor("repos.invitations.update").fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/invitations/${payload.invitationId}`,
        jsonInit("PATCH", body),
      );
      return jsonBody(response, 200, "invitation", "Repository invitation was not found.", "GitHub rejected the update repository invitation request.");
    },
    async updateCheckSuitePreferences(input: unknown) {
      const payload = validateUpdateCheckSuitePreferencesInput(input);
      const body: Record<string, unknown> = {};
      if (payload.autoTriggerChecks !== undefined) {
        body.auto_trigger_checks = payload.autoTriggerChecks.map((item) => ({ app_id: item.appId, setting: item.setting }));
      }
      const response = await clientFor("repos.check_suites.preferences.update").fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/check-suites/preferences`,
        jsonInit("PATCH", body),
      );
      return jsonBody(response, 200, "preferences", "Repository was not found.", "GitHub rejected the update check suite preferences request.");
    },
    async replaceTopics(input: unknown) {
      const payload = validateReplaceTopicsInput(input);
      const response = await clientFor("repos.topics.replace").fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/topics`,
        jsonInit("PUT", { names: payload.names }),
      );
      return jsonBody(response, 200, "topics", "Repository was not found.", "GitHub rejected the replace repository topics request.");
    },
    async setRepoSubscription(input: unknown) {
      const payload = validateSetRepoSubscriptionInput(input);
      const body: Record<string, boolean> = {};
      if (payload.subscribed !== undefined) body.subscribed = payload.subscribed;
      if (payload.ignored !== undefined) body.ignored = payload.ignored;
      const response = await clientFor("repos.subscription.set").fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/subscription`,
        jsonInit("PUT", body),
      );
      return jsonBody(response, 200, "subscription", "Repository subscription was not found.", "GitHub rejected the set repository subscription request.");
    },
    async setRepoInteractionLimits(input: unknown) {
      const payload = validateSetRepoInteractionLimitsInput(input);
      const body: Record<string, string> = { limit: payload.limit };
      if (payload.expiry !== undefined) body.expiry = payload.expiry;
      const response = await clientFor("repos.interaction_limits.set").fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/interaction-limits`,
        jsonInit("PUT", body),
      );
      return jsonBody(response, 200, "limits", "Repository interaction limits were not found.", "GitHub rejected the set repository interaction limits request.");
    },
  };
}

function jsonInit(method: string, body: Record<string, unknown>): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function jsonBody(
  response: { status: number; headers: Record<string, string>; body: unknown },
  success: number,
  field: string,
  missing: string,
  rejected: string,
) {
  if (response.status === success && isRecord(response.body)) {
    return { ok: true as const, [field]: response.body };
  }
  if (response.status === 404) return upstream(missing);
  return mapRateOrUpstream(response, rejected);
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

function repoPath(owner: string, repo: string): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function ownerRepo(input: Record<string, unknown>): OwnerRepo {
  return {
    owner: requireSingleSegment(input.owner, "owner"),
    repo: requireSingleSegment(input.repo, "repo"),
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
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  if (value.includes("/") || value.includes("?") || value.includes("#")) {
    throw new Error(`${field} must be a single path segment`);
  }
  return value;
}

function optionalSingleSegment(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  return requireSingleSegment(value, field);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
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
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  return value;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${field} must be a boolean`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
