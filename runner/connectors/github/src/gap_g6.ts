import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

// G6: Actions runners labels/jitconfig, workflow access, org Actions repo selection, run gate review.
// 13 ops. Reconcile: org+repo labels add/set → tip lists; access.set → access.get. Rest omit.

type Page = { perPage?: number; page?: number };
type OrgScope = { org: string };
type RepoScope = { owner: string; repo: string };
type RunnerLabels = { runnerId: number; labels: string[] };

const ACCESS_LEVELS = ["none", "user", "organization"] as const;
const REVIEW_STATES = ["approved", "rejected"] as const;

export type NormalizedRunnerLabel = { id: number; name: string; type: string };
export type NormalizedAccess = { accessLevel: string };
export type NormalizedJitConfig = {
  runnerId: number;
  runnerName: string;
  encodedJitConfig: string;
};

// ─── validators ──────────────────────────────────────────────────────────────

export function validateAddOrgRunnerLabelsInput(input: unknown): OrgScope & RunnerLabels {
  if (!isRecord(input)) throw new Error("orgs.actions.runners.labels.add input must be an object");
  return { org: segment(input.org, "org"), ...runnerLabels(input) };
}

export function validateSetOrgRunnerLabelsInput(input: unknown): OrgScope & RunnerLabels {
  if (!isRecord(input)) throw new Error("orgs.actions.runners.labels.set input must be an object");
  return { org: segment(input.org, "org"), ...runnerLabels(input) };
}

export function validateRemoveAllOrgRunnerLabelsInput(input: unknown): OrgScope & { runnerId: number } {
  if (!isRecord(input)) throw new Error("orgs.actions.runners.labels.remove_all input must be an object");
  return { org: segment(input.org, "org"), runnerId: requireId(input.runnerId ?? input.runner_id, "runnerId") };
}

export function validateAddRepoRunnerLabelsInput(input: unknown): RepoScope & RunnerLabels {
  if (!isRecord(input)) throw new Error("repos.actions.runners.labels.add input must be an object");
  return { ...repo(input), ...runnerLabels(input) };
}

export function validateSetRepoRunnerLabelsInput(input: unknown): RepoScope & RunnerLabels {
  if (!isRecord(input)) throw new Error("repos.actions.runners.labels.set input must be an object");
  return { ...repo(input), ...runnerLabels(input) };
}

export function validateCreateOrgRunnerJitConfigInput(input: unknown): OrgScope & {
  name: string;
  runnerGroupId: number;
  labels: string[];
  workFolder?: string;
} {
  if (!isRecord(input)) throw new Error("orgs.actions.runners.jitconfig.create input must be an object");
  return { org: segment(input.org, "org"), ...jitBody(input) };
}

export function validateCreateRepoRunnerJitConfigInput(input: unknown): RepoScope & {
  name: string;
  runnerGroupId: number;
  labels: string[];
  workFolder?: string;
} {
  if (!isRecord(input)) throw new Error("repos.actions.runners.jitconfig.create input must be an object");
  return { ...repo(input), ...jitBody(input) };
}

export function validateGetActionsPermissionsAccessInput(input: unknown): RepoScope {
  if (!isRecord(input)) throw new Error("actions.permissions.access.get input must be an object");
  return repo(input);
}

export function validateSetActionsPermissionsAccessInput(input: unknown): RepoScope & { accessLevel: string } {
  if (!isRecord(input)) throw new Error("actions.permissions.access.set input must be an object");
  const accessLevel = input.accessLevel ?? input.access_level;
  if (typeof accessLevel !== "string" || !(ACCESS_LEVELS as readonly string[]).includes(accessLevel)) {
    throw new Error("accessLevel must be none, user, or organization");
  }
  return { ...repo(input), accessLevel };
}

export function validateRemoveOrgActionsPermissionsRepositoryInput(input: unknown): OrgScope & { repositoryId: number } {
  if (!isRecord(input)) throw new Error("orgs.actions.permissions.repositories.remove input must be an object");
  return {
    org: segment(input.org, "org"),
    repositoryId: requireId(input.repositoryId ?? input.repository_id, "repositoryId"),
  };
}

export function validateSetOrgActionsPermissionsRepositoriesInput(input: unknown): OrgScope & {
  selectedRepositoryIds: number[];
} {
  if (!isRecord(input)) throw new Error("orgs.actions.permissions.repositories.set input must be an object");
  return {
    org: segment(input.org, "org"),
    selectedRepositoryIds: requireIdList(
      input.selectedRepositoryIds ?? input.selected_repository_ids,
      "selectedRepositoryIds",
    ),
  };
}

export function validateAddOrgActionsPermissionsRepositoryInput(input: unknown): OrgScope & { repositoryId: number } {
  if (!isRecord(input)) throw new Error("orgs.actions.permissions.repositories.add input must be an object");
  return {
    org: segment(input.org, "org"),
    repositoryId: requireId(input.repositoryId ?? input.repository_id, "repositoryId"),
  };
}

export function validateReviewDeploymentProtectionRuleInput(input: unknown): RepoScope & {
  runId: number;
  environmentName: string;
  state: "approved" | "rejected";
  comment?: string;
} {
  if (!isRecord(input)) throw new Error("actions.runs.deployment_protection_rule.review input must be an object");
  const state = input.state;
  if (typeof state !== "string" || !(REVIEW_STATES as readonly string[]).includes(state)) {
    throw new Error("state must be approved or rejected");
  }
  const out: RepoScope & {
    runId: number;
    environmentName: string;
    state: "approved" | "rejected";
    comment?: string;
  } = {
    ...repo(input),
    runId: requireId(input.runId ?? input.run_id, "runId"),
    environmentName: requireNonEmpty(input.environmentName ?? input.environment_name, "environmentName"),
    state: state as "approved" | "rejected",
  };
  if (input.comment !== undefined) out.comment = requireNonEmpty(input.comment, "comment");
  return out;
}

// ─── client ──────────────────────────────────────────────────────────────────

export function createGapG6Client(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const base = options.githubClient;
  const clientFor = (operation: string) =>
    base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation });

  return {
    async addOrgRunnerLabels(input: unknown) {
      const payload = validateAddOrgRunnerLabelsInput(input);
      const response = await clientFor("orgs.actions.runners.labels.add").fetchJSON(
        `/orgs/${enc(payload.org)}/actions/runners/${payload.runnerId}/labels`,
        jsonInit("POST", { labels: payload.labels }),
      );
      return labelsBody(response, "Organization runner was not found.", "GitHub rejected the orgs.actions.runners.labels.add request.");
    },

    async setOrgRunnerLabels(input: unknown) {
      const payload = validateSetOrgRunnerLabelsInput(input);
      const response = await clientFor("orgs.actions.runners.labels.set").fetchJSON(
        `/orgs/${enc(payload.org)}/actions/runners/${payload.runnerId}/labels`,
        jsonInit("PUT", { labels: payload.labels }),
      );
      return labelsBody(response, "Organization runner was not found.", "GitHub rejected the orgs.actions.runners.labels.set request.");
    },

    async removeAllOrgRunnerLabels(input: unknown) {
      const payload = validateRemoveAllOrgRunnerLabelsInput(input);
      const response = await clientFor("orgs.actions.runners.labels.remove_all").fetchJSON(
        `/orgs/${enc(payload.org)}/actions/runners/${payload.runnerId}/labels`,
        { method: "DELETE" },
      );
      return labelsBody(response, "Organization runner was not found.", "GitHub rejected the orgs.actions.runners.labels.remove_all request.");
    },

    async addRepoRunnerLabels(input: unknown) {
      const payload = validateAddRepoRunnerLabelsInput(input);
      const response = await clientFor("repos.actions.runners.labels.add").fetchJSON(
        `${repoPath(payload)}/actions/runners/${payload.runnerId}/labels`,
        jsonInit("POST", { labels: payload.labels }),
      );
      return labelsBody(response, "Repository runner was not found.", "GitHub rejected the repos.actions.runners.labels.add request.");
    },

    async setRepoRunnerLabels(input: unknown) {
      const payload = validateSetRepoRunnerLabelsInput(input);
      const response = await clientFor("repos.actions.runners.labels.set").fetchJSON(
        `${repoPath(payload)}/actions/runners/${payload.runnerId}/labels`,
        jsonInit("PUT", { labels: payload.labels }),
      );
      return labelsBody(response, "Repository runner was not found.", "GitHub rejected the repos.actions.runners.labels.set request.");
    },

    async createOrgRunnerJitConfig(input: unknown) {
      const payload = validateCreateOrgRunnerJitConfigInput(input);
      const response = await clientFor("orgs.actions.runners.jitconfig.create").fetchJSON(
        `/orgs/${enc(payload.org)}/actions/runners/generate-jitconfig`,
        jsonInit("POST", jitUpstream(payload)),
      );
      return jitBodyResult(response, "Organization was not found.", "GitHub rejected the orgs.actions.runners.jitconfig.create request.");
    },

    async createRepoRunnerJitConfig(input: unknown) {
      const payload = validateCreateRepoRunnerJitConfigInput(input);
      const response = await clientFor("repos.actions.runners.jitconfig.create").fetchJSON(
        `${repoPath(payload)}/actions/runners/generate-jitconfig`,
        jsonInit("POST", jitUpstream(payload)),
      );
      return jitBodyResult(response, "Repository was not found.", "GitHub rejected the repos.actions.runners.jitconfig.create request.");
    },

    async getActionsPermissionsAccess(input: unknown) {
      const payload = validateGetActionsPermissionsAccessInput(input);
      const result = await read(
        clientFor("actions.permissions.access.get"),
        `${repoPath(payload)}/actions/permissions/access`,
        "actions.permissions.access.get",
        "GitHub Actions workflow access settings were not found.",
      );
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the actions.permissions.access.get request.");
      return { ok: true as const, access: normalizeAccess(result.body) };
    },

    async setActionsPermissionsAccess(input: unknown) {
      const payload = validateSetActionsPermissionsAccessInput(input);
      const response = await clientFor("actions.permissions.access.set").fetchJSON(
        `${repoPath(payload)}/actions/permissions/access`,
        jsonInit("PUT", { access_level: payload.accessLevel }),
      );
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 204) {
        return { ok: true as const, access: { accessLevel: payload.accessLevel } };
      }
      if (response.status === 404) return upstream("GitHub Actions workflow access settings were not found.");
      return upstream("GitHub rejected the actions.permissions.access.set request.");
    },

    async removeOrgActionsPermissionsRepository(input: unknown) {
      const payload = validateRemoveOrgActionsPermissionsRepositoryInput(input);
      const response = await clientFor("orgs.actions.permissions.repositories.remove").fetchJSON(
        `/orgs/${enc(payload.org)}/actions/permissions/repositories/${payload.repositoryId}`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        { removed: true, org: payload.org, repositoryId: payload.repositoryId },
        "Organization Actions repository selection was not found.",
        "GitHub rejected the orgs.actions.permissions.repositories.remove request.",
      );
    },

    async setOrgActionsPermissionsRepositories(input: unknown) {
      const payload = validateSetOrgActionsPermissionsRepositoriesInput(input);
      const response = await clientFor("orgs.actions.permissions.repositories.set").fetchJSON(
        `/orgs/${enc(payload.org)}/actions/permissions/repositories`,
        jsonInit("PUT", { selected_repository_ids: payload.selectedRepositoryIds }),
      );
      return noContent(
        response,
        204,
        { set: true, org: payload.org, selectedRepositoryIds: payload.selectedRepositoryIds },
        "Organization Actions repository selection was not found.",
        "GitHub rejected the orgs.actions.permissions.repositories.set request.",
      );
    },

    async addOrgActionsPermissionsRepository(input: unknown) {
      const payload = validateAddOrgActionsPermissionsRepositoryInput(input);
      const response = await clientFor("orgs.actions.permissions.repositories.add").fetchJSON(
        `/orgs/${enc(payload.org)}/actions/permissions/repositories/${payload.repositoryId}`,
        { method: "PUT" },
      );
      return noContent(
        response,
        204,
        { added: true, org: payload.org, repositoryId: payload.repositoryId },
        "Organization Actions repository selection was not found.",
        "GitHub rejected the orgs.actions.permissions.repositories.add request.",
      );
    },

    async reviewDeploymentProtectionRule(input: unknown) {
      const payload = validateReviewDeploymentProtectionRuleInput(input);
      const body: Record<string, unknown> = {
        environment_name: payload.environmentName,
        state: payload.state,
      };
      if (payload.comment !== undefined) body.comment = payload.comment;
      const response = await clientFor("actions.runs.deployment_protection_rule.review").fetchJSON(
        `${repoPath(payload)}/actions/runs/${payload.runId}/deployment_protection_rule`,
        jsonInit("POST", body),
      );
      return noContent(
        response,
        204,
        {
          reviewed: true,
          owner: payload.owner,
          repo: payload.repo,
          runId: payload.runId,
          environmentName: payload.environmentName,
          state: payload.state,
        },
        "Workflow run or deployment protection rule was not found.",
        "GitHub rejected the actions.runs.deployment_protection_rule.review request.",
      );
    },
  };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function runnerLabels(input: Record<string, unknown>): RunnerLabels {
  return {
    runnerId: requireId(input.runnerId ?? input.runner_id, "runnerId"),
    labels: stringList(input.labels, "labels"),
  };
}

function jitBody(input: Record<string, unknown>): {
  name: string;
  runnerGroupId: number;
  labels: string[];
  workFolder?: string;
} {
  const out: { name: string; runnerGroupId: number; labels: string[]; workFolder?: string } = {
    name: requireNonEmpty(input.name, "name"),
    runnerGroupId: requireId(input.runnerGroupId ?? input.runner_group_id, "runnerGroupId"),
    labels: stringList(input.labels, "labels"),
  };
  if (input.workFolder !== undefined || input.work_folder !== undefined) {
    out.workFolder = requireNonEmpty(input.workFolder ?? input.work_folder, "workFolder");
  }
  return out;
}

function jitUpstream(payload: { name: string; runnerGroupId: number; labels: string[]; workFolder?: string }) {
  const body: Record<string, unknown> = {
    name: payload.name,
    runner_group_id: payload.runnerGroupId,
    labels: payload.labels,
  };
  if (payload.workFolder !== undefined) body.work_folder = payload.workFolder;
  return body;
}

function labelsBody(
  response: { status: number; headers: Record<string, string>; body: unknown },
  missing: string,
  rejected: string,
) {
  const limited = rate(response.status, response.headers);
  if (limited) return limited;
  if (response.status === 200 && isRecord(response.body) && Array.isArray(response.body.labels)) {
    const labels = response.body.labels.filter(isRecord).map(normalizeLabel);
    return {
      ok: true as const,
      totalCount: typeof response.body.total_count === "number" ? response.body.total_count : labels.length,
      labels,
    };
  }
  if (response.status === 404) return upstream(missing);
  return upstream(rejected);
}

function jitBodyResult(
  response: { status: number; headers: Record<string, string>; body: unknown },
  missing: string,
  rejected: string,
) {
  const limited = rate(response.status, response.headers);
  if (limited) return limited;
  if (response.status === 201 && isRecord(response.body)) {
    return { ok: true as const, jitConfig: normalizeJit(response.body) };
  }
  if (response.status === 404) return upstream(missing);
  return upstream(rejected);
}

function normalizeLabel(item: Record<string, unknown>): NormalizedRunnerLabel {
  return {
    id: typeof item.id === "number" ? item.id : 0,
    name: typeof item.name === "string" ? item.name : "",
    type: typeof item.type === "string" ? item.type : "",
  };
}

function normalizeAccess(item: Record<string, unknown>): NormalizedAccess {
  return { accessLevel: typeof item.access_level === "string" ? item.access_level : "" };
}

function normalizeJit(item: Record<string, unknown>): NormalizedJitConfig {
  const runner = isRecord(item.runner) ? item.runner : {};
  return {
    runnerId: typeof runner.id === "number" ? runner.id : 0,
    runnerName: typeof runner.name === "string" ? runner.name : "",
    encodedJitConfig: typeof item.encoded_jit_config === "string" ? item.encoded_jit_config : "",
  };
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

function jsonInit(method: string, body: Record<string, unknown>): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function noContent(
  response: { status: number; headers: Record<string, string> },
  success: number,
  value: Record<string, unknown>,
  missing: string,
  rejected: string,
) {
  const limited = rate(response.status, response.headers);
  if (limited) return limited;
  if (response.status === success) return { ok: true as const, ...value };
  if (response.status === 404) return upstream(missing);
  return upstream(rejected);
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

function repo(input: Record<string, unknown>): RepoScope {
  return { owner: segment(input.owner, "owner"), repo: segment(input.repo, "repo") };
}

function repoPath(payload: RepoScope): string {
  return `/repos/${enc(payload.owner)}/${enc(payload.repo)}`;
}

function requireId(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function requireIdList(value: unknown, field: string): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${field} must be a non-empty array of positive integers`);
  }
  return value.map((entry, index) => {
    if (typeof entry !== "number" || !Number.isInteger(entry) || entry < 1) {
      throw new Error(`${field}[${index}] must be a positive integer`);
    }
    return entry;
  });
}

function stringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    throw new Error(`${field} must be a non-empty array of non-empty strings`);
  }
  return value as string[];
}

function requireNonEmpty(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function segment(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  if (value.includes("/") || value.includes("?") || value.includes("#")) {
    throw new Error(`${field} must be a single path segment`);
  }
  return value;
}

function enc(value: string): string {
  return encodeURIComponent(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
