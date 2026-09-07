import { createIssuesClient, validateCreateIssueInput, validateCreateCommentInput, validateGetIssueInput, validateUpdateIssueInput, validateAddLabelsInput } from "./issues";
import { createPullRequestsClient, validateCreatePullRequestInput, validateMergePullRequestInput, validateGetPullRequestInput, validateUpdatePullRequestInput, validateListPullRequestFilesInput } from "./pull_requests";
import { createReposClient, validateGetRepoInput, validateCreateRepoInput, validateListReposInput, validateGetRepoContentsInput } from "./repos";
import { createBranchesClient, validateGetBranchInput, validateCreateBranchInput } from "./branches";
import { createReleasesClient, validateCreateReleaseInput } from "./releases";
import { createGistsClient, validateCreateGistInput } from "./gists";
import { createGitHubClient } from "./http";

// ─── Existing actions ─────────────────────────────────────────────────────────

export function createIssue(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createIssuesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).create(input).then((result) => {
      if (!result.ok) {
        throw {
          ok: false,
          code: result.error.code,
          message: result.error.message,
          retryAfterSeconds: result.error.retryAfterSeconds,
        };
      }
      return { connector: "github", action: "issues.create", source: "connector", issue: result.issue };
    });
  }
  return { connector: "github", action: "issues.create", source: "connector", validated: validateCreateIssueInput(input) };
}

export function createIssueComment(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createIssuesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).createComment(input).then((result) => {
      if (!result.ok) {
        throw {
          ok: false,
          code: result.error.code,
          message: result.error.message,
          retryAfterSeconds: result.error.retryAfterSeconds,
        };
      }
      return { connector: "github", action: "issues.comments.create", source: "connector", comment: result.comment };
    });
  }
  return { connector: "github", action: "issues.comments.create", source: "connector", validated: validateCreateCommentInput(input) };
}

export function createPullRequest(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createPullRequestsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).create(input).then((result) => {
      if (!result.ok) {
        throw {
          ok: false,
          code: result.error.code,
          message: result.error.message,
          retryAfterSeconds: result.error.retryAfterSeconds,
        };
      }
      return { connector: "github", action: "pull_requests.create", source: "connector", pullRequest: result.pullRequest };
    });
  }
  return { connector: "github", action: "pull_requests.create", source: "connector", validated: validateCreatePullRequestInput(input) };
}

export function mergePullRequest(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createPullRequestsClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "pull_requests.merge" }),
    }).merge(input).then((result) => {
      if (!result.ok) {
        throw {
          ok: false,
          code: result.error.code,
          message: result.error.message,
          retryAfterSeconds: result.error.retryAfterSeconds,
        };
      }
      return { connector: "github", action: "pull_requests.merge", source: "connector", merged: true };
    });
  }
  return { connector: "github", action: "pull_requests.merge", source: "connector", validated: validateMergePullRequestInput(input) };
}

// ─── New: issues.get ──────────────────────────────────────────────────────────

export function getIssue(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createIssuesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).get(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "issues.get", source: "connector", issue: result.issue };
    });
  }
  return { connector: "github", action: "issues.get", source: "connector", validated: validateGetIssueInput(input) };
}

// ─── New: issues.update ───────────────────────────────────────────────────────

export function updateIssue(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createIssuesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).update(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "issues.update", source: "connector", issue: result.issue };
    });
  }
  return { connector: "github", action: "issues.update", source: "connector", validated: validateUpdateIssueInput(input) };
}

// ─── New: issues.labels.add ───────────────────────────────────────────────────

export function addIssueLabels(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createIssuesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).addLabels(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "issues.labels.add", source: "connector", labels: result.labels };
    });
  }
  return { connector: "github", action: "issues.labels.add", source: "connector", validated: validateAddLabelsInput(input) };
}

// ─── New: pull_requests.get ───────────────────────────────────────────────────

export function getPullRequest(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createPullRequestsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).get(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "pull_requests.get", source: "connector", pullRequest: result.pullRequest };
    });
  }
  return { connector: "github", action: "pull_requests.get", source: "connector", validated: validateGetPullRequestInput(input) };
}

// ─── New: pull_requests.update ────────────────────────────────────────────────

export function updatePullRequest(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createPullRequestsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).update(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "pull_requests.update", source: "connector", pullRequest: result.pullRequest };
    });
  }
  return { connector: "github", action: "pull_requests.update", source: "connector", validated: validateUpdatePullRequestInput(input) };
}

// ─── New: pull_requests.list_files ───────────────────────────────────────────

export function listPullRequestFiles(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createPullRequestsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).listFiles(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "pull_requests.list_files", source: "connector", files: result.files };
    });
  }
  return { connector: "github", action: "pull_requests.list_files", source: "connector", validated: validateListPullRequestFilesInput(input) };
}

// ─── New: repos.get ───────────────────────────────────────────────────────────

export function getRepo(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createReposClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).get(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "repos.get", source: "connector", repo: result.repo };
    });
  }
  return { connector: "github", action: "repos.get", source: "connector", validated: validateGetRepoInput(input) };
}

// ─── New: repos.create ────────────────────────────────────────────────────────

export function createRepo(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createReposClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).create(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "repos.create", source: "connector", repo: result.repo };
    });
  }
  return { connector: "github", action: "repos.create", source: "connector", validated: validateCreateRepoInput(input) };
}

// ─── New: repos.list ─────────────────────────────────────────────────────────

export function listRepos(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createReposClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).list(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "repos.list", source: "connector", repos: result.repos };
    });
  }
  return { connector: "github", action: "repos.list", source: "connector", validated: validateListReposInput(input) };
}

// ─── New: repos.contents.get ─────────────────────────────────────────────────

export function getRepoContents(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createReposClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).getContents(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "repos.contents.get", source: "connector", contents: result.contents };
    });
  }
  return { connector: "github", action: "repos.contents.get", source: "connector", validated: validateGetRepoContentsInput(input) };
}

// ─── New: branches.get ───────────────────────────────────────────────────────

export function getBranch(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createBranchesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).get(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "branches.get", source: "connector", branch: result.branch };
    });
  }
  return { connector: "github", action: "branches.get", source: "connector", validated: validateGetBranchInput(input) };
}

// ─── New: branches.create ────────────────────────────────────────────────────

export function createBranch(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createBranchesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).create(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "branches.create", source: "connector", branch: result.branch };
    });
  }
  return { connector: "github", action: "branches.create", source: "connector", validated: validateCreateBranchInput(input) };
}

// ─── New: releases.create ────────────────────────────────────────────────────

export function createRelease(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createReleasesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).create(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "releases.create", source: "connector", release: result.release };
    });
  }
  return { connector: "github", action: "releases.create", source: "connector", validated: validateCreateReleaseInput(input) };
}

// ─── New: gists.create ───────────────────────────────────────────────────────

export function createGist(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createGistsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).create(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "gists.create", source: "connector", gist: result.gist };
    });
  }
  return { connector: "github", action: "gists.create", source: "connector", validated: validateCreateGistInput(input) };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
