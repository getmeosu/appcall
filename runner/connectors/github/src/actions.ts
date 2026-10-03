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
  validateListIssueTimelineInput,
  validateListIssueEventsInput,
} from "./issues";
import {
  createSearchClient,
  validateSearchIssuesInput,
  validateSearchPullRequestsInput,
  validateSearchUsersInput,
  validateSearchCodeInput,
  validateSearchCommitsInput,
  validateSearchRepositoriesInput,
  validateSearchOrgsInput,
} from "./search";
import {
  createUsersClient,
  validateGetAuthenticatedUserInput,
  validateGetUserByUsernameInput,
  validateListUserReposInput,
  validateUsersGetAuthenticatedInput,
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
  validateListConversationCommentsInput,
  validateGetReviewInput,
  validateSubmitReviewInput,
  validateUpdateReviewCommentInput,
  validateDeleteReviewCommentInput,
  validateDeletePendingReviewInput,
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
  validateDownloadRunLogsInput,
  validateDownloadArtifactInput,
  validateRerunFailedJobsInput,
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
import { createReposClient, validateGetRepoInput, validateCreateRepoInput, validateUpdateRepoInput, validateListReposInput, validateGetRepoContentsInput, validateCompareCommitsInput, validateGetRepoTreeInput } from "./repos";
import { createContentsClient, validatePutContentsInput, validateDeleteContentsInput, validatePushFilesInput } from "./contents";
import { createGitClient, validateCreateBlobInput, validateGetBlobInput, validateCreateTreeInput, validateGetTreeInput, validateCreateRefInput, validateUpdateRefInput, validateGetRefInput, validateCreateGitCommitInput } from "./git";
import { createBranchesClient, validateGetBranchInput, validateCreateBranchInput, validateDeleteBranchInput, validateListBranchesInput } from "./branches";
import {
  createReleasesClient,
  validateCreateReleaseInput,
  validateListReleasesInput,
  validateGetReleaseInput,
  validateGetLatestReleaseInput,
  validateGetReleaseByTagInput,
  validateUpdateReleaseInput,
  validateListReleaseAssetsInput,
  validateGenerateReleaseNotesInput,
  validateDeleteReleaseInput,
  validateGetReleaseAssetInput,
  validateUploadReleaseAssetInput,
} from "./releases";
import {
  createDeploymentsClient,
  validateListDeploymentsInput,
  validateGetDeploymentInput,
  validateCreateDeploymentInput,
  validateListDeploymentStatusesInput,
  validateCreateDeploymentStatusInput,
  validateListEnvironmentsInput,
  validateGetEnvironmentInput,
} from "./deployments";
import {
  createGistsClient,
  validateCreateGistInput,
  validateListGistsInput,
  validateGetGistInput,
  validateUpdateGistInput,
} from "./gists";
import { createTagsClient, validateListTagsInput } from "./tags";
import {
  createNotificationsSocialClient,
  validateListNotificationsInput,
  validateGetNotificationInput,
  validateMarkNotificationReadInput,
  validateMarkAllNotificationsReadInput,
  validateListOrgTeamsInput,
  validateListTeamMembersInput,
  validateAddTeamMembershipInput,
  validateForkRepoInput,
  validateStarRepoInput,
  validateUnstarRepoInput,
} from "./notifications_social";
import { createChecksClient, validateListCheckRunsForRefInput, validateGetCheckRunInput, validateListCheckSuitesForRefInput, validateListCheckAnnotationsInput, validateCreateCheckRunInput } from "./checks";
import {
  createGovernanceClient,
  validateGetCollaboratorPermissionInput,
  validateGetBranchProtectionInput,
  validateListRepoRulesetsInput,
  validateGetRulesForBranchInput,
  validateListRepoHooksInput,
  validateGetTeamMembershipInput,
  validateListTeamReposInput,
  validateListRepoInvitationsInput,
  validateCreateOrgRepoInput,
  validateCreateTeamInput,
  validateCreateRepoHookInput,
  validateRemoveTeamMembershipInput,
  validateDispatchRepoInput,
} from "./governance";
import { createCommitsClient, validateGetCommitStatusInput, validateListCommitStatusesInput, validateCreateCommitStatusInput, validateGetCommitInput, validateCreateCommitCommentInput, validateListCommitCommentsInput, validateUpdateCommitCommentInput, validateDeleteCommitCommentInput } from "./commits";
import { createGitHubClient } from "./http";
import {
  createDiscussionsClient,
  validateListDiscussionCategoriesInput,
  validateListDiscussionsInput,
  validateGetDiscussionInput,
  validateCreateDiscussionInput,
  validateUpdateDiscussionInput,
  validateListDiscussionCommentsInput,
  validateCreateDiscussionCommentInput,
  validateUpdateDiscussionCommentInput,
} from "./discussions";

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
      return {
        connector: "github",
        action: "branches.get",
        source: "connector",
        found: result.found,
        branch: result.branch,
        ...(result.found ? {} : { name: result.name }),
      };
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



// ─── S7: releases.list|get|get_latest|get_by_tag|update + assets.list ─────────

export function listReleases(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createReleasesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).list(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "releases.list", source: "connector", releases: result.releases };
    });
  }
  return { connector: "github", action: "releases.list", source: "connector", validated: validateListReleasesInput(input) };
}

export function getRelease(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createReleasesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).get(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "releases.get", source: "connector", release: result.release };
    });
  }
  return { connector: "github", action: "releases.get", source: "connector", validated: validateGetReleaseInput(input) };
}

export function getLatestRelease(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createReleasesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).getLatest(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "releases.get_latest", source: "connector", release: result.release };
    });
  }
  return { connector: "github", action: "releases.get_latest", source: "connector", validated: validateGetLatestReleaseInput(input) };
}

export function getReleaseByTag(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createReleasesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).getByTag(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "releases.get_by_tag", source: "connector", release: result.release };
    });
  }
  return { connector: "github", action: "releases.get_by_tag", source: "connector", validated: validateGetReleaseByTagInput(input) };
}

export function updateRelease(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createReleasesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).update(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "releases.update", source: "connector", release: result.release };
    });
  }
  return { connector: "github", action: "releases.update", source: "connector", validated: validateUpdateReleaseInput(input) };
}

export function listReleaseAssets(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createReleasesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).listAssets(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "releases.assets.list", source: "connector", assets: result.assets };
    });
  }
  return { connector: "github", action: "releases.assets.list", source: "connector", validated: validateListReleaseAssetsInput(input) };
}

// ─── S7: tags.list ────────────────────────────────────────────────────────────

export function listTags(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createTagsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).list(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "tags.list", source: "connector", tags: result.tags };
    });
  }
  return { connector: "github", action: "tags.list", source: "connector", validated: validateListTagsInput(input) };
}

// ─── S7: gists.list|get|update ────────────────────────────────────────────────

export function listGists(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createGistsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).list(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "gists.list", source: "connector", gists: result.gists };
    });
  }
  return { connector: "github", action: "gists.list", source: "connector", validated: validateListGistsInput(input) };
}

export function getGist(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createGistsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).get(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "gists.get", source: "connector", gist: result.gist };
    });
  }
  return { connector: "github", action: "gists.get", source: "connector", validated: validateGetGistInput(input) };
}

export function updateGist(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createGistsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).update(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "gists.update", source: "connector", gist: result.gist };
    });
  }
  return { connector: "github", action: "gists.update", source: "connector", validated: validateUpdateGistInput(input) };
}

// ─── S9: discussions (GraphQL) ───────────────────────────────────────────────

function discussionClient(input: Record<string, unknown>) {
  return createDiscussionsClient({
    accessToken: input.accessToken as string,
    fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
  });
}

function discussionFailure(result: { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }): never {
  throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
}

export function listDiscussionCategories(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return discussionClient(input).listCategories(input).then((result) => {
      if (!result.ok) discussionFailure(result);
      return { connector: "github", action: "discussions.categories.list", source: "connector", categories: result.categories, pageInfo: result.pageInfo };
    });
  }
  return { connector: "github", action: "discussions.categories.list", source: "connector", validated: validateListDiscussionCategoriesInput(input) };
}

export function listDiscussions(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return discussionClient(input).list(input).then((result) => {
      if (!result.ok) discussionFailure(result);
      return { connector: "github", action: "discussions.list", source: "connector", discussions: result.discussions, pageInfo: result.pageInfo };
    });
  }
  return { connector: "github", action: "discussions.list", source: "connector", validated: validateListDiscussionsInput(input) };
}

export function getDiscussion(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    validateGetDiscussionInput(input);
    return discussionClient(input).get(input).then((result) => {
      if (!result.ok) discussionFailure(result);
      return { connector: "github", action: "discussions.get", source: "connector", found: result.found, discussion: result.discussion };
    });
  }
  return { connector: "github", action: "discussions.get", source: "connector", validated: validateGetDiscussionInput(input) };
}

export function createDiscussion(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return discussionClient(input).create(input).then((result) => {
      if (!result.ok) discussionFailure(result);
      return { connector: "github", action: "discussions.create", source: "connector", discussion: result.discussion };
    });
  }
  return { connector: "github", action: "discussions.create", source: "connector", validated: validateCreateDiscussionInput(input) };
}

export function updateDiscussion(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    validateUpdateDiscussionInput(input);
    return discussionClient(input).update(input).then((result) => {
      if (!result.ok) discussionFailure(result);
      return { connector: "github", action: "discussions.update", source: "connector", discussion: result.discussion };
    });
  }
  return { connector: "github", action: "discussions.update", source: "connector", validated: validateUpdateDiscussionInput(input) };
}

export function listDiscussionComments(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    validateListDiscussionCommentsInput(input);
    return discussionClient(input).listComments(input).then((result) => {
      if (!result.ok) discussionFailure(result);
      return { connector: "github", action: "discussions.comments.list", source: "connector", comments: result.comments, pageInfo: result.pageInfo };
    });
  }
  return { connector: "github", action: "discussions.comments.list", source: "connector", validated: validateListDiscussionCommentsInput(input) };
}

export function createDiscussionComment(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    validateCreateDiscussionCommentInput(input);
    return discussionClient(input).createComment(input).then((result) => {
      if (!result.ok) discussionFailure(result);
      return { connector: "github", action: "discussions.comments.create", source: "connector", comment: result.comment };
    });
  }
  return { connector: "github", action: "discussions.comments.create", source: "connector", validated: validateCreateDiscussionCommentInput(input) };
}

export function updateDiscussionComment(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    validateUpdateDiscussionCommentInput(input);
    return discussionClient(input).updateComment(input).then((result) => {
      if (!result.ok) discussionFailure(result);
      return { connector: "github", action: "discussions.comments.update", source: "connector", comment: result.comment };
    });
  }
  return { connector: "github", action: "discussions.comments.update", source: "connector", validated: validateUpdateDiscussionCommentInput(input) };
}

// ─── S5: repos.contents.put ─────────────────────────────────────────────────────────

export function putContents(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createContentsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "repos.contents.put" }),
    }).put(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "repos.contents.put", source: "connector", content: result.content };
    });
  }
  return { connector: "github", action: "repos.contents.put", source: "connector", validated: validatePutContentsInput(input) };
}

// ─── S5: repos.contents.delete ──────────────────────────────────────────────────────

export function deleteContents(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createContentsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "repos.contents.delete" }),
    }).delete(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "repos.contents.delete", source: "connector", deleted: result.deleted, path: result.path, commitSha: result.commitSha };
    });
  }
  return { connector: "github", action: "repos.contents.delete", source: "connector", validated: validateDeleteContentsInput(input) };
}

// ─── S5: repos.contents.push_files ──────────────────────────────────────────────────

export function pushFiles(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createContentsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "repos.contents.push_files" }),
    }).pushFiles(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "repos.contents.push_files", source: "connector", commit: result.commit };
    });
  }
  return { connector: "github", action: "repos.contents.push_files", source: "connector", validated: validatePushFilesInput(input) };
}

// ─── S5: git.blobs.create ─────────────────────────────────────────────────────

export function createGitBlob(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createGitClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "git.blobs.create" }),
    }).createBlob(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "git.blobs.create", source: "connector", blob: result.blob };
    });
  }
  return { connector: "github", action: "git.blobs.create", source: "connector", validated: validateCreateBlobInput(input) };
}

// ─── S5: git.blobs.get ────────────────────────────────────────────────────────

export function getGitBlob(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createGitClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "git.blobs.get" }),
    }).getBlob(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "git.blobs.get", source: "connector", blob: result.blob };
    });
  }
  return { connector: "github", action: "git.blobs.get", source: "connector", validated: validateGetBlobInput(input) };
}

// ─── S5: git.trees.create ─────────────────────────────────────────────────────

export function createGitTree(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createGitClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "git.trees.create" }),
    }).createTree(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "git.trees.create", source: "connector", tree: result.tree };
    });
  }
  return { connector: "github", action: "git.trees.create", source: "connector", validated: validateCreateTreeInput(input) };
}

// ─── S5: git.trees.get ────────────────────────────────────────────────────────

export function getGitTree(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createGitClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "git.trees.get" }),
    }).getTree(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "git.trees.get", source: "connector", tree: result.tree };
    });
  }
  return { connector: "github", action: "git.trees.get", source: "connector", validated: validateGetTreeInput(input) };
}

// ─── S5: git.refs.create ──────────────────────────────────────────────────────

export function createGitRef(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createGitClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "git.refs.create" }),
    }).createRef(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "git.refs.create", source: "connector", ref: result.ref };
    });
  }
  return { connector: "github", action: "git.refs.create", source: "connector", validated: validateCreateRefInput(input) };
}

// ─── S5: git.refs.update ──────────────────────────────────────────────────────

export function updateGitRef(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createGitClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "git.refs.update" }),
    }).updateRef(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "git.refs.update", source: "connector", ref: result.ref };
    });
  }
  return { connector: "github", action: "git.refs.update", source: "connector", validated: validateUpdateRefInput(input) };
}

// ─── S5: git.commits.create ───────────────────────────────────────────────────

export function createGitCommit(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createGitClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "git.commits.create" }),
    }).createCommit(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "git.commits.create", source: "connector", commit: result.commit };
    });
  }
  return { connector: "github", action: "git.commits.create", source: "connector", validated: validateCreateGitCommitInput(input) };
}

// ─── S5: repos.tree.get ───────────────────────────────────────────────────────

export function getRepoTree(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createReposClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined, operation: "repos.tree.get" }),
    }).getTree(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "repos.tree.get", source: "connector", tree: result.tree };
    });
  }
  return { connector: "github", action: "repos.tree.get", source: "connector", validated: validateGetRepoTreeInput(input) };
}

// ─── S11: pull_requests.comments.list / repos.update / branches.delete / commits.comments.create ──

export function listPullRequestComments(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createPullRequestsClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "pull_requests.comments.list" }),
    }).listConversationComments(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "pull_requests.comments.list", source: "connector", comments: result.comments };
    });
  }
  return { connector: "github", action: "pull_requests.comments.list", source: "connector", validated: validateListConversationCommentsInput(input) };
}

export function updateRepo(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createReposClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "repos.update" }),
    }).update(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "repos.update", source: "connector", repo: result.repo };
    });
  }
  return { connector: "github", action: "repos.update", source: "connector", validated: validateUpdateRepoInput(input) };
}

export function deleteBranch(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createBranchesClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "branches.delete" }),
    }).delete(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "branches.delete", source: "connector", deleted: result.deleted, branch: result.branch };
    });
  }
  return { connector: "github", action: "branches.delete", source: "connector", validated: validateDeleteBranchInput(input) };
}

export function createCommitComment(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createCommitsClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "commits.comments.create" }),
    }).createComment(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "commits.comments.create", source: "connector", comment: result.comment };
    });
  }
  return { connector: "github", action: "commits.comments.create", source: "connector", validated: validateCreateCommitCommentInput(input) };
}

// ─── S10: notifications / orgs teams / fork+star ─────────────────────────────

export function listNotifications(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createNotificationsSocialClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).listNotifications(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "notifications.list", source: "connector", notifications: result.notifications };
    });
  }
  return { connector: "github", action: "notifications.list", source: "connector", validated: validateListNotificationsInput(input) };
}

export function getNotification(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createNotificationsSocialClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).getNotification(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "notifications.get", source: "connector", notification: result.notification };
    });
  }
  return { connector: "github", action: "notifications.get", source: "connector", validated: validateGetNotificationInput(input) };
}

export function markNotificationRead(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createNotificationsSocialClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).markRead(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "notifications.mark_read", source: "connector", threadId: result.threadId, unread: result.unread };
    });
  }
  return { connector: "github", action: "notifications.mark_read", source: "connector", validated: validateMarkNotificationReadInput(input) };
}

export function markAllNotificationsRead(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createNotificationsSocialClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).markAllRead(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "notifications.mark_all_read", source: "connector", marked: result.marked };
    });
  }
  return { connector: "github", action: "notifications.mark_all_read", source: "connector", validated: validateMarkAllNotificationsReadInput(input) };
}

export function listOrgTeams(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createNotificationsSocialClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).listOrgTeams(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "orgs.teams.list", source: "connector", teams: result.teams };
    });
  }
  return { connector: "github", action: "orgs.teams.list", source: "connector", validated: validateListOrgTeamsInput(input) };
}

export function listTeamMembers(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createNotificationsSocialClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).listTeamMembers(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "teams.members.list", source: "connector", members: result.members };
    });
  }
  return { connector: "github", action: "teams.members.list", source: "connector", validated: validateListTeamMembersInput(input) };
}

export function addTeamMembership(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createNotificationsSocialClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).addTeamMembership(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "teams.membership.add", source: "connector", username: result.username, role: result.role, state: result.state };
    });
  }
  return { connector: "github", action: "teams.membership.add", source: "connector", validated: validateAddTeamMembershipInput(input) };
}

export function forkRepo(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createNotificationsSocialClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).forkRepo(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "repos.fork", source: "connector", repository: result.repository, id: result.id };
    });
  }
  return { connector: "github", action: "repos.fork", source: "connector", validated: validateForkRepoInput(input) };
}

export function starRepo(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createNotificationsSocialClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).starRepo(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "repos.star", source: "connector", owner: result.owner, repo: result.repo, starred: result.starred };
    });
  }
  return { connector: "github", action: "repos.star", source: "connector", validated: validateStarRepoInput(input) };
}

export function unstarRepo(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createNotificationsSocialClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).unstarRepo(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "repos.unstar", source: "connector", owner: result.owner, repo: result.repo, starred: result.starred };
    });
  }
  return { connector: "github", action: "repos.unstar", source: "connector", validated: validateUnstarRepoInput(input) };
}

// ─── S12: git.refs.get / search.* / users.get_authenticated (reads) ──────────

export function getGitRef(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createGitClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "git.refs.get" }),
    }).getRef(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "git.refs.get", source: "connector", ref: result.ref };
    });
  }
  return { connector: "github", action: "git.refs.get", source: "connector", validated: validateGetRefInput(input) };
}

export function searchCode(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createSearchClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "search.code" }),
    }).searchCode(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "search.code", source: "connector", ...result.result };
    });
  }
  return { connector: "github", action: "search.code", source: "connector", validated: validateSearchCodeInput(input) };
}

export function searchCommits(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createSearchClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "search.commits" }),
    }).searchCommits(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "search.commits", source: "connector", ...result.result };
    });
  }
  return { connector: "github", action: "search.commits", source: "connector", validated: validateSearchCommitsInput(input) };
}

export function searchRepositories(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createSearchClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "search.repositories" }),
    }).searchRepositories(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "search.repositories", source: "connector", ...result.result };
    });
  }
  return { connector: "github", action: "search.repositories", source: "connector", validated: validateSearchRepositoriesInput(input) };
}

export function searchOrgs(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createSearchClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "search.orgs" }),
    }).searchOrgs(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "github", action: "search.orgs", source: "connector", ...result.result };
    });
  }
  return { connector: "github", action: "search.orgs", source: "connector", validated: validateSearchOrgsInput(input) };
}

export function getUsersAuthenticated(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createUsersClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "users.get_authenticated" }),
    }).getAuthenticated(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "users.get_authenticated", source: "connector", user: result.user };
    });
  }
  return { connector: "github", action: "users.get_authenticated", source: "connector", validated: validateUsersGetAuthenticatedInput(input) };
}


// ─── N1: deployments / environments / release assets / downloads ─────────────

function throwGitHub(result: { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }): never {
  throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
}

export function listDeployments(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createDeploymentsClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined }).list(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "deployments.list", source: "connector", deployments: result.deployments };
    });
  }
  return { connector: "github", action: "deployments.list", source: "connector", validated: validateListDeploymentsInput(input) };
}

export function getDeployment(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createDeploymentsClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined }).get(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "deployments.get", source: "connector", deployment: result.deployment };
    });
  }
  return { connector: "github", action: "deployments.get", source: "connector", validated: validateGetDeploymentInput(input) };
}

export function createDeployment(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createDeploymentsClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined }).create(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "deployments.create", source: "connector", deployment: result.deployment };
    });
  }
  return { connector: "github", action: "deployments.create", source: "connector", validated: validateCreateDeploymentInput(input) };
}

export function listDeploymentStatuses(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createDeploymentsClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined }).listStatuses(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "deployments.statuses.list", source: "connector", statuses: result.statuses };
    });
  }
  return { connector: "github", action: "deployments.statuses.list", source: "connector", validated: validateListDeploymentStatusesInput(input) };
}

export function createDeploymentStatus(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createDeploymentsClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined }).createStatus(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "deployments.statuses.create", source: "connector", status: result.status };
    });
  }
  return { connector: "github", action: "deployments.statuses.create", source: "connector", validated: validateCreateDeploymentStatusInput(input) };
}

export function listEnvironments(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createDeploymentsClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined }).listEnvironments(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "environments.list", source: "connector", totalCount: result.totalCount, environments: result.environments };
    });
  }
  return { connector: "github", action: "environments.list", source: "connector", validated: validateListEnvironmentsInput(input) };
}

export function getEnvironment(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createDeploymentsClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined }).getEnvironment(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "environments.get", source: "connector", environment: result.environment };
    });
  }
  return { connector: "github", action: "environments.get", source: "connector", validated: validateGetEnvironmentInput(input) };
}

export function downloadWorkflowRunLogs(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWorkflowsClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined }).downloadRunLogs(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "actions.runs.logs.download", source: "connector", logs: result.logs };
    });
  }
  return { connector: "github", action: "actions.runs.logs.download", source: "connector", validated: validateDownloadRunLogsInput(input) };
}

export function downloadArtifact(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWorkflowsClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined }).downloadArtifact(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "actions.artifacts.download", source: "connector", download: result.download };
    });
  }
  return { connector: "github", action: "actions.artifacts.download", source: "connector", validated: validateDownloadArtifactInput(input) };
}

export function rerunFailedWorkflowJobs(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWorkflowsClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined }).rerunFailedJobs(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "actions.runs.rerun_failed", source: "connector", rerun: result.rerun, runId: result.runId };
    });
  }
  return { connector: "github", action: "actions.runs.rerun_failed", source: "connector", validated: validateRerunFailedJobsInput(input) };
}

export function generateReleaseNotes(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createReleasesClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined }).generateNotes(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "releases.generate_notes", source: "connector", name: result.name, body: result.body };
    });
  }
  return { connector: "github", action: "releases.generate_notes", source: "connector", validated: validateGenerateReleaseNotesInput(input) };
}

export function deleteRelease(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createReleasesClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined }).delete(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "releases.delete", source: "connector", deleted: result.deleted, releaseId: result.releaseId };
    });
  }
  return { connector: "github", action: "releases.delete", source: "connector", validated: validateDeleteReleaseInput(input) };
}

export function getReleaseAsset(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createReleasesClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined }).getAsset(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "releases.assets.get", source: "connector", asset: result.asset };
    });
  }
  return { connector: "github", action: "releases.assets.get", source: "connector", validated: validateGetReleaseAssetInput(input) };
}

export function uploadReleaseAsset(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createReleasesClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined }).uploadAsset(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "releases.assets.upload", source: "connector", asset: result.asset };
    });
  }
  return { connector: "github", action: "releases.assets.upload", source: "connector", validated: validateUploadReleaseAssetInput(input) };
}

// ─── N2: reviews, comments, timeline, check-run create ───────────────────────

export function getPullRequestReview(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createPullRequestsClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "pull_requests.reviews.get" }),
    }).getReview(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "pull_requests.reviews.get", source: "connector", review: result.review };
    });
  }
  return { connector: "github", action: "pull_requests.reviews.get", source: "connector", validated: validateGetReviewInput(input) };
}

export function submitPullRequestReview(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createPullRequestsClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "pull_requests.reviews.submit" }),
    }).submitReview(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "pull_requests.reviews.submit", source: "connector", review: result.review };
    });
  }
  return { connector: "github", action: "pull_requests.reviews.submit", source: "connector", validated: validateSubmitReviewInput(input) };
}

export function updatePullRequestReviewComment(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createPullRequestsClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "pull_requests.review_comments.update" }),
    }).updateReviewComment(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "pull_requests.review_comments.update", source: "connector", comment: result.comment };
    });
  }
  return { connector: "github", action: "pull_requests.review_comments.update", source: "connector", validated: validateUpdateReviewCommentInput(input) };
}

export function deletePullRequestReviewComment(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createPullRequestsClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "pull_requests.review_comments.delete" }),
    }).deleteReviewComment(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "pull_requests.review_comments.delete", source: "connector", deleted: result.deleted, commentId: result.commentId };
    });
  }
  return { connector: "github", action: "pull_requests.review_comments.delete", source: "connector", validated: validateDeleteReviewCommentInput(input) };
}

export function deletePendingPullRequestReview(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createPullRequestsClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "pull_requests.reviews.delete_pending" }),
    }).deletePendingReview(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "pull_requests.reviews.delete_pending", source: "connector", deleted: result.deleted, reviewId: result.reviewId };
    });
  }
  return { connector: "github", action: "pull_requests.reviews.delete_pending", source: "connector", validated: validateDeletePendingReviewInput(input) };
}

export function listCommitComments(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createCommitsClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "commits.comments.list" }),
    }).listComments(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "commits.comments.list", source: "connector", comments: result.comments };
    });
  }
  return { connector: "github", action: "commits.comments.list", source: "connector", validated: validateListCommitCommentsInput(input) };
}

export function updateCommitComment(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createCommitsClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "commits.comments.update" }),
    }).updateComment(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "commits.comments.update", source: "connector", comment: result.comment };
    });
  }
  return { connector: "github", action: "commits.comments.update", source: "connector", validated: validateUpdateCommitCommentInput(input) };
}

export function deleteCommitComment(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createCommitsClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "commits.comments.delete" }),
    }).deleteComment(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "commits.comments.delete", source: "connector", deleted: result.deleted, commentId: result.commentId };
    });
  }
  return { connector: "github", action: "commits.comments.delete", source: "connector", validated: validateDeleteCommitCommentInput(input) };
}

export function listIssueTimeline(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createIssuesClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "issues.timeline.list" }),
    }).listTimeline(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "issues.timeline.list", source: "connector", events: result.events };
    });
  }
  return { connector: "github", action: "issues.timeline.list", source: "connector", validated: validateListIssueTimelineInput(input) };
}

export function listIssueEvents(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createIssuesClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "issues.events.list" }),
    }).listEvents(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "issues.events.list", source: "connector", events: result.events };
    });
  }
  return { connector: "github", action: "issues.events.list", source: "connector", validated: validateListIssueEventsInput(input) };
}

export function listCheckAnnotations(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createChecksClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "checks.annotations.list" }),
    }).listAnnotations(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "checks.annotations.list", source: "connector", annotations: result.annotations };
    });
  }
  return { connector: "github", action: "checks.annotations.list", source: "connector", validated: validateListCheckAnnotationsInput(input) };
}

export function createCheckRun(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createChecksClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "checks.runs.create" }),
    }).createRun(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "checks.runs.create", source: "connector", id: result.id, checkRun: result.checkRun };
    });
  }
  return { connector: "github", action: "checks.runs.create", source: "connector", validated: validateCreateCheckRunInput(input) };
}


// ─── N3: orgs, teams, hooks, rules, invitations ─────────────────────────────

export function getCollaboratorPermission(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createGovernanceClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "repos.collaborators.permission.get" }),
    }).getCollaboratorPermission(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "repos.collaborators.permission.get", source: "connector", permission: result.permission, roleName: result.roleName, username: result.username, user: result.user };
    });
  }
  return { connector: "github", action: "repos.collaborators.permission.get", source: "connector", validated: validateGetCollaboratorPermissionInput(input) };
}

export function getBranchProtection(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createGovernanceClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "branches.protection.get" }),
    }).getBranchProtection(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "branches.protection.get", source: "connector", protection: result.protection };
    });
  }
  return { connector: "github", action: "branches.protection.get", source: "connector", validated: validateGetBranchProtectionInput(input) };
}

export function listRepoRulesets(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createGovernanceClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "repos.rulesets.list" }),
    }).listRulesets(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "repos.rulesets.list", source: "connector", rulesets: result.rulesets };
    });
  }
  return { connector: "github", action: "repos.rulesets.list", source: "connector", validated: validateListRepoRulesetsInput(input) };
}

export function getRulesForBranch(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createGovernanceClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "repos.rules.for_branch" }),
    }).rulesForBranch(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "repos.rules.for_branch", source: "connector", rules: result.rules };
    });
  }
  return { connector: "github", action: "repos.rules.for_branch", source: "connector", validated: validateGetRulesForBranchInput(input) };
}

export function listRepoHooks(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createGovernanceClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "repos.hooks.list" }),
    }).listHooks(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "repos.hooks.list", source: "connector", hooks: result.hooks };
    });
  }
  return { connector: "github", action: "repos.hooks.list", source: "connector", validated: validateListRepoHooksInput(input) };
}

export function getTeamMembership(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createGovernanceClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "teams.membership.get" }),
    }).getTeamMembership(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "teams.membership.get", source: "connector", username: result.username, role: result.role, state: result.state, url: result.url };
    });
  }
  return { connector: "github", action: "teams.membership.get", source: "connector", validated: validateGetTeamMembershipInput(input) };
}

export function listTeamRepos(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createGovernanceClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "teams.repos.list" }),
    }).listTeamRepos(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "teams.repos.list", source: "connector", repositories: result.repositories };
    });
  }
  return { connector: "github", action: "teams.repos.list", source: "connector", validated: validateListTeamReposInput(input) };
}

export function listRepoInvitations(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createGovernanceClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "repos.invitations.list" }),
    }).listInvitations(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "repos.invitations.list", source: "connector", invitations: result.invitations };
    });
  }
  return { connector: "github", action: "repos.invitations.list", source: "connector", validated: validateListRepoInvitationsInput(input) };
}

export function createOrgRepo(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createGovernanceClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "orgs.repos.create" }),
    }).createOrgRepo(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "orgs.repos.create", source: "connector", repo: result.repo };
    });
  }
  return { connector: "github", action: "orgs.repos.create", source: "connector", validated: validateCreateOrgRepoInput(input) };
}

export function createTeam(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createGovernanceClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "teams.create" }),
    }).createTeam(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "teams.create", source: "connector", team: result.team };
    });
  }
  return { connector: "github", action: "teams.create", source: "connector", validated: validateCreateTeamInput(input) };
}

export function createRepoHook(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createGovernanceClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "repos.hooks.create" }),
    }).createHook(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "repos.hooks.create", source: "connector", hook: result.hook };
    });
  }
  return { connector: "github", action: "repos.hooks.create", source: "connector", validated: validateCreateRepoHookInput(input) };
}

export function removeTeamMembership(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createGovernanceClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "teams.membership.remove" }),
    }).removeTeamMembership(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "teams.membership.remove", source: "connector", removed: result.removed, username: result.username };
    });
  }
  return { connector: "github", action: "teams.membership.remove", source: "connector", validated: validateRemoveTeamMembershipInput(input) };
}

export function dispatchRepo(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createGovernanceClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "repos.dispatch" }),
    }).dispatch(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "repos.dispatch", source: "connector", dispatched: result.dispatched, eventType: result.eventType };
    });
  }
  return { connector: "github", action: "repos.dispatch", source: "connector", validated: validateDispatchRepoInput(input) };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
