import {
  createIssuesClient,
  validateCreateIssueInput,
  validateCreateCommentInput,
  validateGetIssueInput,
  validateUpdateIssueInput,
  validateAddLabelsInput,
  validateListCommentsInput,
  validateUpdateCommentInput,
  validateDeleteCommentInput,
  validateAssigneesInput,
  validateRemoveLabelsInput,
  validateSetLabelsInput,
  validateLockIssueInput,
  validateUnlockIssueInput,
  validateListLabelsInput,
} from "./issues";
import {
  createSearchClient,
  validateSearchIssuesInput,
  validateSearchPullRequestsInput,
  validateSearchUsersInput,
} from "./search";
import {
  createUsersClient,
  validateGetAuthenticatedUserInput,
  validateGetUserByUsernameInput,
  validateListUserReposInput,
} from "./users";
import {
  createOrgsClient,
  validateGetOrgInput,
  validateListOrgsInput,
  validateListOrgMembersInput,
  validateListOrgReposInput,
} from "./orgs";
import {
  createPullRequestsClient,
  validateCreatePullRequestInput,
  validateMergePullRequestInput,
  validateGetPullRequestInput,
  validateUpdatePullRequestInput,
  validateListPullRequestFilesInput,
  validateListReviewsInput,
  validateCreateReviewInput,
  validateDismissReviewInput,
  validateListReviewCommentsInput,
  validateCreateReviewCommentInput,
  validateReplyReviewCommentInput,
  validateRequestedReviewersInput,
  validateListPullRequestCommitsInput,
  validateCheckMergedInput,
  validateDraftStateInput,
  validateUpdatePullRequestBranchInput,
} from "./pull_requests";
import {
  createWorkflowsClient,
  validateListWorkflowsInput,
  validateGetWorkflowInput,
  validateListRunsInput,
  validateGetRunInput,
  validateCancelRunInput,
  validateRerunRunInput,
  validateDispatchWorkflowInput,
  validateListJobsInput,
  validateGetJobInput,
  validateGetJobLogsInput,
  validateListArtifactsInput,
  validateGetArtifactInput,
} from "./workflows";
import {
  createLabelsMilestonesClient,
  validateGetLabelInput,
  validateCreateLabelInput,
  validateUpdateLabelInput,
  validateDeleteLabelInput,
  validateListMilestonesInput,
  validateGetMilestoneInput,
  validateCreateMilestoneInput,
  validateUpdateMilestoneInput,
  validateListCollaboratorsInput,
  validateAddCollaboratorInput,
  validateRemoveCollaboratorInput,
  validateCheckCollaboratorInput,
} from "./labels_milestones";
import { createReposClient, validateGetRepoInput, validateCreateRepoInput, validateListReposInput, validateGetRepoContentsInput, validateCompareCommitsInput } from "./repos";
import { createBranchesClient, validateGetBranchInput, validateCreateBranchInput, validateListBranchesInput } from "./branches";
import { createReleasesClient, validateCreateReleaseInput } from "./releases";
import { createGistsClient, validateCreateGistInput } from "./gists";
import { createChecksClient, validateListCheckRunsForRefInput, validateGetCheckRunInput, validateListCheckSuitesForRefInput } from "./checks";
import { createCommitsClient, validateGetCommitStatusInput, validateListCommitStatusesInput, validateCreateCommitStatusInput, validateGetCommitInput } from "./commits";
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


// ─── S2: issues.comments.list ─────────────────────────────────────────────────

export function listIssueComments(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createIssuesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).listComments(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "issues.comments.list", source: "connector", comments: result.comments };
    });
  }
  return { connector: "github", action: "issues.comments.list", source: "connector", validated: validateListCommentsInput(input) };
}

// ─── S2: issues.comments.update ───────────────────────────────────────────────

export function updateIssueComment(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createIssuesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).updateComment(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "issues.comments.update", source: "connector", comment: result.comment };
    });
  }
  return { connector: "github", action: "issues.comments.update", source: "connector", validated: validateUpdateCommentInput(input) };
}

// ─── S2: issues.comments.delete ───────────────────────────────────────────────

export function deleteIssueComment(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createIssuesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).deleteComment(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "issues.comments.delete", source: "connector", deleted: true, commentId: result.commentId };
    });
  }
  return { connector: "github", action: "issues.comments.delete", source: "connector", validated: validateDeleteCommentInput(input) };
}

// ─── S2: issues.assignees.add ─────────────────────────────────────────────────

export function addIssueAssignees(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createIssuesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).addAssignees(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "issues.assignees.add", source: "connector", issue: result.issue };
    });
  }
  return { connector: "github", action: "issues.assignees.add", source: "connector", validated: validateAssigneesInput(input) };
}

// ─── S2: issues.assignees.remove ──────────────────────────────────────────────

export function removeIssueAssignees(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createIssuesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).removeAssignees(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "issues.assignees.remove", source: "connector", issue: result.issue };
    });
  }
  return { connector: "github", action: "issues.assignees.remove", source: "connector", validated: validateAssigneesInput(input) };
}

// ─── S2: issues.labels.remove ─────────────────────────────────────────────────

export function removeIssueLabels(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createIssuesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).removeLabels(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "issues.labels.remove", source: "connector", labels: result.labels };
    });
  }
  return { connector: "github", action: "issues.labels.remove", source: "connector", validated: validateRemoveLabelsInput(input) };
}

// ─── S2: issues.labels.set ────────────────────────────────────────────────────

export function setIssueLabels(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createIssuesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).setLabels(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "issues.labels.set", source: "connector", labels: result.labels };
    });
  }
  return { connector: "github", action: "issues.labels.set", source: "connector", validated: validateSetLabelsInput(input) };
}

// ─── S2: issues.lock ──────────────────────────────────────────────────────────

export function lockIssue(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createIssuesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).lock(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "issues.lock", source: "connector", locked: true };
    });
  }
  return { connector: "github", action: "issues.lock", source: "connector", validated: validateLockIssueInput(input) };
}

// ─── S2: issues.unlock ────────────────────────────────────────────────────────

export function unlockIssue(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createIssuesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).unlock(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "issues.unlock", source: "connector", locked: false };
    });
  }
  return { connector: "github", action: "issues.unlock", source: "connector", validated: validateUnlockIssueInput(input) };
}

// ─── S2: labels.list ──────────────────────────────────────────────────────────

export function listLabels(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createIssuesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).listLabels(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "labels.list", source: "connector", labels: result.labels };
    });
  }
  return { connector: "github", action: "labels.list", source: "connector", validated: validateListLabelsInput(input) };
}

// ─── S2: search.issues ────────────────────────────────────────────────────────

export function searchIssues(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createSearchClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).searchIssues(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "search.issues", source: "connector", ...result.result };
    });
  }
  return { connector: "github", action: "search.issues", source: "connector", validated: validateSearchIssuesInput(input) };
}

// ─── S2: search.pull_requests ─────────────────────────────────────────────────

export function searchPullRequests(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createSearchClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).searchPullRequests(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "search.pull_requests", source: "connector", ...result.result };
    });
  }
  return { connector: "github", action: "search.pull_requests", source: "connector", validated: validateSearchPullRequestsInput(input) };
}

// ─── S1: pull_requests.reviews.* ──────────────────────────────────────────────

export function listPullRequestReviews(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createPullRequestsClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "pull_requests.reviews.list" }),
    }).listReviews(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "pull_requests.reviews.list", source: "connector", reviews: result.reviews };
    });
  }
  return { connector: "github", action: "pull_requests.reviews.list", source: "connector", validated: validateListReviewsInput(input) };
}

export function createPullRequestReview(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createPullRequestsClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "pull_requests.reviews.create" }),
    }).createReview(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "pull_requests.reviews.create", source: "connector", review: result.review };
    });
  }
  return { connector: "github", action: "pull_requests.reviews.create", source: "connector", validated: validateCreateReviewInput(input) };
}

export function dismissPullRequestReview(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createPullRequestsClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "pull_requests.reviews.dismiss" }),
    }).dismissReview(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "pull_requests.reviews.dismiss", source: "connector", review: result.review };
    });
  }
  return { connector: "github", action: "pull_requests.reviews.dismiss", source: "connector", validated: validateDismissReviewInput(input) };
}

// ─── S1: pull_requests.review_comments.* ──────────────────────────────────────

export function listPullRequestReviewComments(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createPullRequestsClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "pull_requests.review_comments.list" }),
    }).listReviewComments(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "pull_requests.review_comments.list", source: "connector", comments: result.comments };
    });
  }
  return { connector: "github", action: "pull_requests.review_comments.list", source: "connector", validated: validateListReviewCommentsInput(input) };
}

export function createPullRequestReviewComment(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createPullRequestsClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "pull_requests.review_comments.create" }),
    }).createReviewComment(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "pull_requests.review_comments.create", source: "connector", comment: result.comment };
    });
  }
  return { connector: "github", action: "pull_requests.review_comments.create", source: "connector", validated: validateCreateReviewCommentInput(input) };
}

export function replyPullRequestReviewComment(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createPullRequestsClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "pull_requests.review_comments.reply" }),
    }).replyReviewComment(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "pull_requests.review_comments.reply", source: "connector", comment: result.comment };
    });
  }
  return { connector: "github", action: "pull_requests.review_comments.reply", source: "connector", validated: validateReplyReviewCommentInput(input) };
}

// ─── S1: pull_requests.requested_reviewers.* ──────────────────────────────────

export function addPullRequestRequestedReviewers(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createPullRequestsClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "pull_requests.requested_reviewers.add" }),
    }).addRequestedReviewers(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "pull_requests.requested_reviewers.add", source: "connector", pullRequest: result.pullRequest };
    });
  }
  return { connector: "github", action: "pull_requests.requested_reviewers.add", source: "connector", validated: validateRequestedReviewersInput(input) };
}

export function removePullRequestRequestedReviewers(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createPullRequestsClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "pull_requests.requested_reviewers.remove" }),
    }).removeRequestedReviewers(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "pull_requests.requested_reviewers.remove", source: "connector", pullRequest: result.pullRequest };
    });
  }
  return { connector: "github", action: "pull_requests.requested_reviewers.remove", source: "connector", validated: validateRequestedReviewersInput(input) };
}

// ─── S1: commits / check_merged / draft ───────────────────────────────────────

export function listPullRequestCommits(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createPullRequestsClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "pull_requests.commits.list" }),
    }).listCommits(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "pull_requests.commits.list", source: "connector", commits: result.commits };
    });
  }
  return { connector: "github", action: "pull_requests.commits.list", source: "connector", validated: validateListPullRequestCommitsInput(input) };
}

export function checkPullRequestMerged(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createPullRequestsClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "pull_requests.check_merged" }),
    }).checkMerged(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "pull_requests.check_merged", source: "connector", merged: result.merged };
    });
  }
  return { connector: "github", action: "pull_requests.check_merged", source: "connector", validated: validateCheckMergedInput(input) };
}

export function convertPullRequestToDraft(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createPullRequestsClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "pull_requests.convert_to_draft" }),
    }).convertToDraft(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "pull_requests.convert_to_draft", source: "connector", pullRequest: result.pullRequest };
    });
  }
  return { connector: "github", action: "pull_requests.convert_to_draft", source: "connector", validated: validateDraftStateInput(input) };
}

export function markPullRequestReady(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createPullRequestsClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "pull_requests.mark_ready" }),
    }).markReady(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "pull_requests.mark_ready", source: "connector", pullRequest: result.pullRequest };
    });
  }
  return { connector: "github", action: "pull_requests.mark_ready", source: "connector", validated: validateDraftStateInput(input) };
}



// ─── S3: actions.workflows.list ───────────────────────────────────────────────

export function listWorkflows(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWorkflowsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).listWorkflows(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "actions.workflows.list", source: "connector", totalCount: result.totalCount, workflows: result.workflows };
    });
  }
  return { connector: "github", action: "actions.workflows.list", source: "connector", validated: validateListWorkflowsInput(input) };
}

// ─── S3: actions.workflows.get ────────────────────────────────────────────────

export function getWorkflow(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWorkflowsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).getWorkflow(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "actions.workflows.get", source: "connector", workflow: result.workflow };
    });
  }
  return { connector: "github", action: "actions.workflows.get", source: "connector", validated: validateGetWorkflowInput(input) };
}

// ─── S3: actions.runs.list ────────────────────────────────────────────────────

export function listWorkflowRuns(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWorkflowsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).listRuns(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "actions.runs.list", source: "connector", totalCount: result.totalCount, runs: result.runs };
    });
  }
  return { connector: "github", action: "actions.runs.list", source: "connector", validated: validateListRunsInput(input) };
}

// ─── S3: actions.runs.get ─────────────────────────────────────────────────────

export function getWorkflowRun(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWorkflowsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).getRun(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "actions.runs.get", source: "connector", run: result.run };
    });
  }
  return { connector: "github", action: "actions.runs.get", source: "connector", validated: validateGetRunInput(input) };
}

// ─── S3: actions.runs.cancel ──────────────────────────────────────────────────

export function cancelWorkflowRun(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWorkflowsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).cancelRun(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "actions.runs.cancel", source: "connector", cancelled: true, runId: result.runId };
    });
  }
  return { connector: "github", action: "actions.runs.cancel", source: "connector", validated: validateCancelRunInput(input) };
}

// ─── S3: actions.runs.rerun ───────────────────────────────────────────────────

export function rerunWorkflowRun(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWorkflowsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).rerunRun(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "actions.runs.rerun", source: "connector", rerun: true, runId: result.runId };
    });
  }
  return { connector: "github", action: "actions.runs.rerun", source: "connector", validated: validateRerunRunInput(input) };
}

// ─── S3: actions.workflows.dispatch ───────────────────────────────────────────

export function dispatchWorkflow(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWorkflowsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).dispatchWorkflow(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "actions.workflows.dispatch", source: "connector", dispatched: true, workflowId: result.workflowId, ref: result.ref };
    });
  }
  return { connector: "github", action: "actions.workflows.dispatch", source: "connector", validated: validateDispatchWorkflowInput(input) };
}

// ─── S3: actions.jobs.list ────────────────────────────────────────────────────

export function listWorkflowJobs(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWorkflowsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).listJobs(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "actions.jobs.list", source: "connector", totalCount: result.totalCount, jobs: result.jobs };
    });
  }
  return { connector: "github", action: "actions.jobs.list", source: "connector", validated: validateListJobsInput(input) };
}

// ─── S3: actions.jobs.get ─────────────────────────────────────────────────────

export function getWorkflowJob(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWorkflowsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).getJob(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "actions.jobs.get", source: "connector", job: result.job };
    });
  }
  return { connector: "github", action: "actions.jobs.get", source: "connector", validated: validateGetJobInput(input) };
}

// ─── S3: actions.jobs.logs.get ────────────────────────────────────────────────

export function getWorkflowJobLogs(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWorkflowsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).getJobLogs(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "actions.jobs.logs.get", source: "connector", logs: result.logs };
    });
  }
  return { connector: "github", action: "actions.jobs.logs.get", source: "connector", validated: validateGetJobLogsInput(input) };
}

// ─── S3: actions.artifacts.list ───────────────────────────────────────────────

export function listArtifacts(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWorkflowsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).listArtifacts(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "actions.artifacts.list", source: "connector", totalCount: result.totalCount, artifacts: result.artifacts };
    });
  }
  return { connector: "github", action: "actions.artifacts.list", source: "connector", validated: validateListArtifactsInput(input) };
}

// ─── S3: actions.artifacts.get ────────────────────────────────────────────────

export function getArtifact(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWorkflowsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).getArtifact(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "actions.artifacts.get", source: "connector", artifact: result.artifact };
    });
  }
  return { connector: "github", action: "actions.artifacts.get", source: "connector", validated: validateGetArtifactInput(input) };
}

// ─── S6: search.users / users.* / orgs.* ──────────────────────────────────────

export function searchUsers(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createSearchClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).searchUsers(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "search.users", source: "connector", ...result.result };
    });
  }
  return { connector: "github", action: "search.users", source: "connector", validated: validateSearchUsersInput(input) };
}

export function getAuthenticatedUser(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createUsersClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "users.get" }),
    }).getAuthenticatedUser(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "users.get", source: "connector", user: result.user };
    });
  }
  return { connector: "github", action: "users.get", source: "connector", validated: validateGetAuthenticatedUserInput(input) };
}

export function getUserByUsername(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createUsersClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "users.get_by_username" }),
    }).getByUsername(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "users.get_by_username", source: "connector", user: result.user };
    });
  }
  return { connector: "github", action: "users.get_by_username", source: "connector", validated: validateGetUserByUsernameInput(input) };
}

export function listUserRepos(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createUsersClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "users.repos.list" }),
    }).listRepos(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "users.repos.list", source: "connector", repositories: result.repositories };
    });
  }
  return { connector: "github", action: "users.repos.list", source: "connector", validated: validateListUserReposInput(input) };
}

export function getOrg(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createOrgsClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "orgs.get" }),
    }).get(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "orgs.get", source: "connector", organization: result.organization };
    });
  }
  return { connector: "github", action: "orgs.get", source: "connector", validated: validateGetOrgInput(input) };
}

export function listOrgs(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createOrgsClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "orgs.list" }),
    }).list(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "orgs.list", source: "connector", organizations: result.organizations };
    });
  }
  return { connector: "github", action: "orgs.list", source: "connector", validated: validateListOrgsInput(input) };
}

export function listOrgMembers(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createOrgsClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "orgs.members.list" }),
    }).listMembers(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "orgs.members.list", source: "connector", members: result.members };
    });
  }
  return { connector: "github", action: "orgs.members.list", source: "connector", validated: validateListOrgMembersInput(input) };
}

export function listOrgRepos(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createOrgsClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "orgs.repos.list" }),
    }).listRepos(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "orgs.repos.list", source: "connector", repositories: result.repositories };
    });
  }
  return { connector: "github", action: "orgs.repos.list", source: "connector", validated: validateListOrgReposInput(input) };
}

// ─── S4: checks.runs.list_for_ref ─────────────────────────────────────────────

export function listCheckRunsForRef(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createChecksClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "checks.runs.list_for_ref" }),
    }).listRunsForRef(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "checks.runs.list_for_ref", source: "connector", totalCount: result.totalCount, checkRuns: result.checkRuns };
    });
  }
  return { connector: "github", action: "checks.runs.list_for_ref", source: "connector", validated: validateListCheckRunsForRefInput(input) };
}

// ─── S4: checks.runs.get ──────────────────────────────────────────────────────

export function getCheckRun(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createChecksClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "checks.runs.get" }),
    }).getRun(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "checks.runs.get", source: "connector", checkRun: result.checkRun };
    });
  }
  return { connector: "github", action: "checks.runs.get", source: "connector", validated: validateGetCheckRunInput(input) };
}

// ─── S4: checks.suites.list_for_ref ───────────────────────────────────────────

export function listCheckSuitesForRef(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createChecksClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "checks.suites.list_for_ref" }),
    }).listSuitesForRef(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "checks.suites.list_for_ref", source: "connector", totalCount: result.totalCount, checkSuites: result.checkSuites };
    });
  }
  return { connector: "github", action: "checks.suites.list_for_ref", source: "connector", validated: validateListCheckSuitesForRefInput(input) };
}

// ─── S4: commits.status.get ───────────────────────────────────────────────────

export function getCommitStatus(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createCommitsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "commits.status.get" }),
    }).getStatus(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "commits.status.get", source: "connector", status: result.status };
    });
  }
  return { connector: "github", action: "commits.status.get", source: "connector", validated: validateGetCommitStatusInput(input) };
}

// ─── S4: commits.statuses.list ────────────────────────────────────────────────

export function listCommitStatuses(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createCommitsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "commits.statuses.list" }),
    }).listStatuses(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "commits.statuses.list", source: "connector", statuses: result.statuses };
    });
  }
  return { connector: "github", action: "commits.statuses.list", source: "connector", validated: validateListCommitStatusesInput(input) };
}

// ─── S4: commits.statuses.create ──────────────────────────────────────────────

export function createCommitStatus(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createCommitsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "commits.statuses.create" }),
    }).createStatus(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "commits.statuses.create", source: "connector", status: result.status };
    });
  }
  return { connector: "github", action: "commits.statuses.create", source: "connector", validated: validateCreateCommitStatusInput(input) };
}

// ─── S4: commits.get ──────────────────────────────────────────────────────────

export function getCommit(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createCommitsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "commits.get" }),
    }).get(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "commits.get", source: "connector", commit: result.commit };
    });
  }
  return { connector: "github", action: "commits.get", source: "connector", validated: validateGetCommitInput(input) };
}

// ─── S4: repos.compare ────────────────────────────────────────────────────────

export function compareRepos(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createReposClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "repos.compare" }),
    }).compare(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "repos.compare", source: "connector", comparison: result.comparison };
    });
  }
  return { connector: "github", action: "repos.compare", source: "connector", validated: validateCompareCommitsInput(input) };
}

// ─── S4: pull_requests.update_branch ──────────────────────────────────────────

export function updatePullRequestBranch(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createPullRequestsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "pull_requests.update_branch" }),
    }).updateBranch(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "pull_requests.update_branch", source: "connector", update: result.update };
    });
  }
  return { connector: "github", action: "pull_requests.update_branch", source: "connector", validated: validateUpdatePullRequestBranchInput(input) };
}

// ─── S4: branches.list ────────────────────────────────────────────────────────

export function listBranches(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createBranchesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "branches.list" }),
    }).list(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "branches.list", source: "connector", branches: result.branches };
    });
  }
  return { connector: "github", action: "branches.list", source: "connector", validated: validateListBranchesInput(input) };
}

// ─── S8: labels.get|create|update|delete ──────────────────────────────────────

export function getLabel(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createLabelsMilestonesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).getLabel(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return {
        connector: "github",
        action: "labels.get",
        source: "connector",
        found: result.found,
        label: result.label,
        ...(result.found ? {} : { name: result.name }),
      };
    });
  }
  return { connector: "github", action: "labels.get", source: "connector", validated: validateGetLabelInput(input) };
}

export function createLabel(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createLabelsMilestonesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).createLabel(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "labels.create", source: "connector", label: result.label };
    });
  }
  return { connector: "github", action: "labels.create", source: "connector", validated: validateCreateLabelInput(input) };
}

export function updateLabel(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createLabelsMilestonesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).updateLabel(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "labels.update", source: "connector", label: result.label };
    });
  }
  return { connector: "github", action: "labels.update", source: "connector", validated: validateUpdateLabelInput(input) };
}

export function deleteLabel(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createLabelsMilestonesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).deleteLabel(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "labels.delete", source: "connector", deleted: result.deleted, name: result.name };
    });
  }
  return { connector: "github", action: "labels.delete", source: "connector", validated: validateDeleteLabelInput(input) };
}

// ─── S8: milestones.list|get|create|update ────────────────────────────────────

export function listMilestones(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createLabelsMilestonesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).listMilestones(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "milestones.list", source: "connector", milestones: result.milestones };
    });
  }
  return { connector: "github", action: "milestones.list", source: "connector", validated: validateListMilestonesInput(input) };
}

export function getMilestone(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createLabelsMilestonesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).getMilestone(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "milestones.get", source: "connector", milestone: result.milestone };
    });
  }
  return { connector: "github", action: "milestones.get", source: "connector", validated: validateGetMilestoneInput(input) };
}

export function createMilestone(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createLabelsMilestonesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).createMilestone(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return {
        connector: "github",
        action: "milestones.create",
        source: "connector",
        id: result.milestone.number,
        milestone: result.milestone,
      };
    });
  }
  return { connector: "github", action: "milestones.create", source: "connector", validated: validateCreateMilestoneInput(input) };
}

export function updateMilestone(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createLabelsMilestonesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).updateMilestone(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "milestones.update", source: "connector", milestone: result.milestone };
    });
  }
  return { connector: "github", action: "milestones.update", source: "connector", validated: validateUpdateMilestoneInput(input) };
}

// ─── S8: repos.collaborators.list|add|remove|check ────────────────────────────

export function listCollaborators(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createLabelsMilestonesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).listCollaborators(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "repos.collaborators.list", source: "connector", collaborators: result.collaborators };
    });
  }
  return { connector: "github", action: "repos.collaborators.list", source: "connector", validated: validateListCollaboratorsInput(input) };
}

export function addCollaborator(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createLabelsMilestonesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).addCollaborator(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return {
        connector: "github",
        action: "repos.collaborators.add",
        source: "connector",
        username: result.username,
        invited: result.invited,
        alreadyCollaborator: result.alreadyCollaborator,
      };
    });
  }
  return { connector: "github", action: "repos.collaborators.add", source: "connector", validated: validateAddCollaboratorInput(input) };
}

export function removeCollaborator(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createLabelsMilestonesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).removeCollaborator(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "repos.collaborators.remove", source: "connector", removed: result.removed, username: result.username };
    });
  }
  return { connector: "github", action: "repos.collaborators.remove", source: "connector", validated: validateRemoveCollaboratorInput(input) };
}

export function checkCollaborator(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createLabelsMilestonesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).checkCollaborator(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return {
        connector: "github",
        action: "repos.collaborators.check",
        source: "connector",
        isCollaborator: result.isCollaborator,
        username: result.username,
      };
    });
  }
  return { connector: "github", action: "repos.collaborators.check", source: "connector", validated: validateCheckCollaboratorInput(input) };
}


// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
