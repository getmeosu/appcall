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
  validateGetIssueCommentInput,
  validateListIssueLabelsInput,
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
  validateListPublicEventsInput,
  validateListPublicReceivedEventsInput,
  validateListUserKeysInput,
  validateListUserStarredInput,
  validateListAuthenticatedStarredInput,
  validateListUserSocialAccountsInput,
  validateListAuthenticatedSocialAccountsInput,
  validateListUserSshSigningKeysInput,
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
  validateUpdateReviewInput,
  validateSubmitReviewInput,
  validateUpdateReviewCommentInput,
  validateDeleteReviewCommentInput,
  validateDeletePendingReviewInput,
  validateListRequestedReviewersInput,
  validateGetReviewCommentInput,
  validateListReviewCommentsForReviewInput,
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
  validateListPendingDeploymentsInput,
  validateReviewPendingDeploymentsInput,
  validateWorkflowToggleInput,
  validateDeleteArtifactInput,
  validateRunAttemptInput,
  validateForceCancelRunInput,
  validateListWorkflowRunsInput,
  validateListCachesInput,
  validateDeleteCacheInput,
  validateDeleteCachesByKeyInput,
  validateRerunJobInput,
  validateDeleteRunInput,
  validateApproveRunInput,
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
import { createReposClient, validateGetRepoInput, validateCreateRepoInput, validateUpdateRepoInput, validateListReposInput, validateGetRepoContentsInput, validateCompareCommitsInput, validateMergeBranchesInput, validateListCodeownersErrorsInput, validateCompareDependencyGraphInput, validateGetRepoTreeInput } from "./repos";
import { createContentsClient, validatePutContentsInput, validateDeleteContentsInput, validatePushFilesInput } from "./contents";
import { createGitClient, validateCreateBlobInput, validateGetBlobInput, validateCreateTreeInput, validateGetTreeInput, validateCreateRefInput, validateUpdateRefInput, validateGetRefInput, validateListRefsInput, validateDeleteRefInput, validateGetTagInput, validateCreateTagInput, validateCreateGitCommitInput, validateGetGitCommitInput } from "./git";
import { createBranchesClient, validateGetBranchInput, validateCreateBranchInput, validateDeleteBranchInput, validateListBranchesInput, validateMergeUpstreamInput, validateRenameBranchInput } from "./branches";
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
  validateGetDeploymentStatusInput,
  validateCreateDeploymentStatusInput,
  validateListEnvironmentsInput,
  validateGetEnvironmentInput,
  validateCreateEnvironmentInput,
  validateDeleteDeploymentInput,
  validateDeleteEnvironmentInput,
} from "./deployments";
import {
  createGistsClient,
  validateCreateGistInput,
  validateListGistsInput,
  validateGetGistInput,
  validateUpdateGistInput,
  validateDeleteGistInput,
} from "./gists";
import {
  createAlertsClient,
  validateListDependabotAlertsInput,
  validateListCodeScanningAlertsInput,
  validateGetCodeScanningAlertInput,
  validateUpdateCodeScanningAlertInput,
  validateListCodeScanningInstancesInput,
  validateListCodeScanningAnalysesInput,
  validateGetCodeScanningAnalysisInput,
  validateListSecretScanningAlertsInput,
  validateListActionsVariablesInput,
  validateListActionsSecretsInput,
} from "./alerts";
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
import { createChecksClient, validateListCheckRunsForRefInput, validateListCheckRunsForSuiteInput, validateGetCheckRunInput, validateListCheckSuitesForRefInput, validateListCheckAnnotationsInput, validateCreateCheckRunInput, validateUpdateCheckRunInput, validateRerequestCheckRunInput, validateGetCheckSuiteInput, validateRerequestCheckSuiteInput } from "./checks";
import {
  createActionsVariablesClient,
  validateGetActionsVariableInput,
  validateCreateActionsVariableInput,
  validateUpdateActionsVariableInput,
  validateDeleteActionsVariableInput,
} from "./actions_variables";
import {
  createActionsEnvOrgVariablesClient,
  validateListEnvironmentVariablesInput,
  validateGetEnvironmentVariableInput,
  validateCreateEnvironmentVariableInput,
  validateUpdateEnvironmentVariableInput,
  validateDeleteEnvironmentVariableInput,
  validateListRepoOrgVariablesInput,
  validateListOrgVariablesInput,
  validateGetOrgVariableInput,
  validateCreateOrgVariableInput,
  validateUpdateOrgVariableInput,
  validateDeleteOrgVariableInput,
} from "./actions_env_org_variables";
import {
  createActionsDeployPolicyClient,
  validateGetWorkflowPermissionsInput,
  validateSetWorkflowPermissionsInput,
  validateGetActionsPermissionsInput,
  validateSetActionsPermissionsInput,
  validateGetSelectedActionsInput,
  validateSetSelectedActionsInput,
  validateListBranchPoliciesInput,
  validateGetBranchPolicyInput,
  validateCreateBranchPolicyInput,
  validateUpdateBranchPolicyInput,
  validateDeleteBranchPolicyInput,
} from "./actions_deploy_policy";
import {
  createTrafficClient,
  validateListStatsContributorsInput,
  validateGetTrafficViewsInput,
  validateGetTrafficClonesInput,
  validateGetStatsPunchCardInput,
  validateListStatsCommitActivityInput,
  validateGetStatsCodeFrequencyInput,
  validateGetStatsParticipationInput,
  validateListTrafficPopularPathsInput,
  validateListTrafficPopularReferrersInput,
} from "./traffic";
import {
  createOrgsReadsClient,
  validateCheckOrgBlockInput,
  validateCheckPublicMemberInput,
  validateGetOrganizationRoleInput,
  validateGetOrgInteractionLimitsInput,
  validateListPublicOrgsInput,
  validateListUserOrgsInput,
  validateListUserOrgEventsInput,
  validateListOutsideCollaboratorsInput,
  validateListOrgEventsInput,
  validateListPublicMembersInput,
  validateListOrgBlocksInput,
} from "./orgs_reads";

import {
  createReposReadsClient,
  validateGetAutolinkInput,
  validateGetReadmeInput,
  validateGetReadmeForDirInput,
  validateGetSubscriptionInput,
  validateGetCommunityProfileInput,
  validateGetInteractionLimitsInput,
  validateGetSecurityAdvisoryInput,
  validateGetRepoLicenseInput,
  validateListOrgAttestationRepositoriesInput,
  validateListNetworkEventsInput,
  validateListPublicRepositoriesInput,
  validateListRepoActivityInput,
  validateListContributorsInput,
  validateListRepoEventsInput,
  validateListRepoLanguagesInput,
  validateListRepoSecurityAdvisoriesInput,
  validateGetRepoTopicsInput,
} from "./repos_reads";
import {
  createCard3ReadsClient,
  validateListOrgRoleUsersInput,
  validateGetRepoTarballInput,
  validateGetRepoZipballInput,
  validateCheckRepoAssigneeInput,
  validateCheckUserBlockedInput,
  validateGetThreadSubscriptionInput,
  validateGetUserBillingUsageInput,
} from "./card3_reads";
import {
  createGovernanceClient,
  validateGetCollaboratorPermissionInput,
  validateGetBranchProtectionInput,
  validateListRepoRulesetsInput,
  validateListRuleSuitesInput,
  validateGetRuleSuiteInput,
  validateGetRepoRulesetInput,
  validateGetRulesForBranchInput,
  validateListRepoHooksInput,
  validateGetOrgHookInput,
  validateGetRepoHookInput,
  validateGetOrgHookConfigInput,
  validateGetRepoHookConfigInput,
  validateGetOrgHookDeliveryInput,
  validateGetRepoHookDeliveryInput,
  validateListOrgHookDeliveriesInput,
  validateListRepoHookDeliveriesInput,
  validateGetTeamMembershipInput,
  validateListTeamReposInput,
  validateListRepoInvitationsInput,
  validateCreateOrgRepoInput,
  validateCreateTeamInput,
  validateCreateRepoHookInput,
  validateRemoveTeamMembershipInput,
  validateDispatchRepoInput,
} from "./governance";
import { createCommitsClient, validateGetCommitStatusInput, validateListCommitStatusesInput, validateCreateCommitStatusInput, validateGetCommitInput, validateCreateCommitCommentInput, validateListCommitCommentsInput, validateUpdateCommitCommentInput, validateDeleteCommitCommentInput, validateGetCommitCommentInput, validateListCommitPullsInput, validateListBranchesWhereHeadInput } from "./commits";
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

export function listPublicUserEvents(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createUsersClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "users.events.public.list" }),
    }).listPublicEvents(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "users.events.public.list", source: "connector", events: result.events };
    });
  }
  return { connector: "github", action: "users.events.public.list", source: "connector", validated: validateListPublicEventsInput(input) };
}

export function listPublicReceivedUserEvents(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createUsersClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "users.received_events.public.list" }),
    }).listPublicReceivedEvents(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "users.received_events.public.list", source: "connector", events: result.events };
    });
  }
  return { connector: "github", action: "users.received_events.public.list", source: "connector", validated: validateListPublicReceivedEventsInput(input) };
}

export function listUserKeys(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createUsersClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "users.keys.list" }),
    }).listKeys(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "users.keys.list", source: "connector", keys: result.keys };
    });
  }
  return { connector: "github", action: "users.keys.list", source: "connector", validated: validateListUserKeysInput(input) };
}

export function listUserStarred(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createUsersClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "users.starred.list" }),
    }).listStarred(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "users.starred.list", source: "connector", repositories: result.repositories };
    });
  }
  return { connector: "github", action: "users.starred.list", source: "connector", validated: validateListUserStarredInput(input) };
}

export function listAuthenticatedStarred(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createUsersClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "user.starred.list" }),
    }).listAuthenticatedStarred(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "user.starred.list", source: "connector", repositories: result.repositories };
    });
  }
  return { connector: "github", action: "user.starred.list", source: "connector", validated: validateListAuthenticatedStarredInput(input) };
}

export function listUserSocialAccounts(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createUsersClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "users.social_accounts.list" }),
    }).listSocialAccounts(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "users.social_accounts.list", source: "connector", socialAccounts: result.socialAccounts };
    });
  }
  return { connector: "github", action: "users.social_accounts.list", source: "connector", validated: validateListUserSocialAccountsInput(input) };
}

export function listAuthenticatedSocialAccounts(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createUsersClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "user.social_accounts.list" }),
    }).listAuthenticatedSocialAccounts(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "user.social_accounts.list", source: "connector", socialAccounts: result.socialAccounts };
    });
  }
  return { connector: "github", action: "user.social_accounts.list", source: "connector", validated: validateListAuthenticatedSocialAccountsInput(input) };
}

export function listUserSshSigningKeys(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createUsersClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "users.ssh_signing_keys.list" }),
    }).listSshSigningKeys(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "users.ssh_signing_keys.list", source: "connector", keys: result.keys };
    });
  }
  return { connector: "github", action: "users.ssh_signing_keys.list", source: "connector", validated: validateListUserSshSigningKeysInput(input) };
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

export function getOrgHook(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createGovernanceClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "orgs.hooks.get" }),
    }).getOrgHook(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "orgs.hooks.get", source: "connector", hook: result.hook };
    });
  }
  return { connector: "github", action: "orgs.hooks.get", source: "connector", validated: validateGetOrgHookInput(input) };
}

export function getRepoHook(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createGovernanceClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "repos.hooks.get" }),
    }).getRepoHook(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "repos.hooks.get", source: "connector", hook: result.hook };
    });
  }
  return { connector: "github", action: "repos.hooks.get", source: "connector", validated: validateGetRepoHookInput(input) };
}

export function getOrgHookConfig(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createGovernanceClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "orgs.hooks.config.get" }),
    }).getOrgHookConfig(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "orgs.hooks.config.get", source: "connector", config: result.config };
    });
  }
  return { connector: "github", action: "orgs.hooks.config.get", source: "connector", validated: validateGetOrgHookConfigInput(input) };
}

export function getRepoHookConfig(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createGovernanceClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "repos.hooks.config.get" }),
    }).getRepoHookConfig(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "repos.hooks.config.get", source: "connector", config: result.config };
    });
  }
  return { connector: "github", action: "repos.hooks.config.get", source: "connector", validated: validateGetRepoHookConfigInput(input) };
}

export function getOrgHookDelivery(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createGovernanceClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "orgs.hooks.deliveries.get" }),
    }).getOrgHookDelivery(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "orgs.hooks.deliveries.get", source: "connector", delivery: result.delivery };
    });
  }
  return { connector: "github", action: "orgs.hooks.deliveries.get", source: "connector", validated: validateGetOrgHookDeliveryInput(input) };
}

export function getRepoHookDelivery(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createGovernanceClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "repos.hooks.deliveries.get" }),
    }).getRepoHookDelivery(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "repos.hooks.deliveries.get", source: "connector", delivery: result.delivery };
    });
  }
  return { connector: "github", action: "repos.hooks.deliveries.get", source: "connector", validated: validateGetRepoHookDeliveryInput(input) };
}

export function listOrgHookDeliveries(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createGovernanceClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "orgs.hooks.deliveries.list" }),
    }).listOrgHookDeliveries(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "orgs.hooks.deliveries.list", source: "connector", deliveries: result.deliveries };
    });
  }
  return { connector: "github", action: "orgs.hooks.deliveries.list", source: "connector", validated: validateListOrgHookDeliveriesInput(input) };
}

export function listRepoHookDeliveries(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createGovernanceClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "repos.hooks.deliveries.list" }),
    }).listRepoHookDeliveries(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "repos.hooks.deliveries.list", source: "connector", deliveries: result.deliveries };
    });
  }
  return { connector: "github", action: "repos.hooks.deliveries.list", source: "connector", validated: validateListRepoHookDeliveriesInput(input) };
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

// ─── N4: alerts, refs, tags, gist delete ─────────────────────────────────────

function liveFetch(input: Record<string, unknown>): typeof fetch | undefined {
  return typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
}

export function listDependabotAlerts(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createAlertsClient({ accessToken: input.accessToken, fetch: liveFetch(input) }).listDependabotAlerts(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "dependabot.alerts.list", source: "connector", alerts: result.alerts };
    });
  }
  return { connector: "github", action: "dependabot.alerts.list", source: "connector", validated: validateListDependabotAlertsInput(input) };
}

export function listCodeScanningAlerts(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createAlertsClient({ accessToken: input.accessToken, fetch: liveFetch(input) }).listCodeScanningAlerts(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "code_scanning.alerts.list", source: "connector", alerts: result.alerts };
    });
  }
  return { connector: "github", action: "code_scanning.alerts.list", source: "connector", validated: validateListCodeScanningAlertsInput(input) };
}

export function getCodeScanningAlert(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createAlertsClient({ accessToken: input.accessToken, fetch: liveFetch(input) }).getCodeScanningAlert(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "code_scanning.alerts.get", source: "connector", alert: result.alert };
    });
  }
  return { connector: "github", action: "code_scanning.alerts.get", source: "connector", validated: validateGetCodeScanningAlertInput(input) };
}

export function updateCodeScanningAlert(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createAlertsClient({ accessToken: input.accessToken, fetch: liveFetch(input) }).updateCodeScanningAlert(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "code_scanning.alerts.update", source: "connector", alert: result.alert };
    });
  }
  return { connector: "github", action: "code_scanning.alerts.update", source: "connector", validated: validateUpdateCodeScanningAlertInput(input) };
}

export function listSecretScanningAlerts(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createAlertsClient({ accessToken: input.accessToken, fetch: liveFetch(input) }).listSecretScanningAlerts(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "secret_scanning.alerts.list", source: "connector", alerts: result.alerts };
    });
  }
  return { connector: "github", action: "secret_scanning.alerts.list", source: "connector", validated: validateListSecretScanningAlertsInput(input) };
}

export function listActionsVariables(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createAlertsClient({ accessToken: input.accessToken, fetch: liveFetch(input) }).listActionsVariables(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "actions.variables.list", source: "connector", totalCount: result.totalCount, variables: result.variables };
    });
  }
  return { connector: "github", action: "actions.variables.list", source: "connector", validated: validateListActionsVariablesInput(input) };
}

export function listActionsSecrets(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createAlertsClient({ accessToken: input.accessToken, fetch: liveFetch(input) }).listActionsSecrets(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "actions.secrets.list", source: "connector", total_count: result.total_count, secrets: result.secrets };
    });
  }
  return { connector: "github", action: "actions.secrets.list", source: "connector", validated: validateListActionsSecretsInput(input) };
}

export function listGitRefs(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = liveFetch(input);
    return createGitClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "git.refs.list" }),
    }).listRefs(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "git.refs.list", source: "connector", refs: result.refs };
    });
  }
  return { connector: "github", action: "git.refs.list", source: "connector", validated: validateListRefsInput(input) };
}

export function deleteGitRef(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = liveFetch(input);
    return createGitClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "git.refs.delete" }),
    }).deleteRef(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "git.refs.delete", source: "connector", deleted: result.deleted, ref: result.ref };
    });
  }
  return { connector: "github", action: "git.refs.delete", source: "connector", validated: validateDeleteRefInput(input) };
}

export function getGitTag(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = liveFetch(input);
    return createGitClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "git.tags.get" }),
    }).getTag(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "git.tags.get", source: "connector", tag: result.tag };
    });
  }
  return { connector: "github", action: "git.tags.get", source: "connector", validated: validateGetTagInput(input) };
}

export function createGitTag(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = liveFetch(input);
    return createGitClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "git.tags.create" }),
    }).createTag(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "git.tags.create", source: "connector", tag: result.tag };
    });
  }
  return { connector: "github", action: "git.tags.create", source: "connector", validated: validateCreateTagInput(input) };
}

export function deleteGist(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createGistsClient({ accessToken: input.accessToken, fetch: liveFetch(input) }).delete(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "gists.delete", source: "connector", deleted: result.deleted, gistId: result.gistId };
    });
  }
  return { connector: "github", action: "gists.delete", source: "connector", validated: validateDeleteGistInput(input) };
}

// ─── N5: actions attempts, env protection, force cancel ──────────────────────

export function listPendingDeployments(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWorkflowsClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined }).listPendingDeployments(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "actions.runs.pending_deployments.list", source: "connector", pendingDeployments: result.pendingDeployments };
    });
  }
  return { connector: "github", action: "actions.runs.pending_deployments.list", source: "connector", validated: validateListPendingDeploymentsInput(input) };
}

export function reviewPendingDeployments(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWorkflowsClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined }).reviewPendingDeployments(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "actions.runs.pending_deployments.review", source: "connector", pendingDeployments: result.pendingDeployments };
    });
  }
  return { connector: "github", action: "actions.runs.pending_deployments.review", source: "connector", validated: validateReviewPendingDeploymentsInput(input) };
}

export function listRunApprovals(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWorkflowsClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined }).listRunApprovals(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "actions.runs.approvals.list", source: "connector", approvals: result.approvals };
    });
  }
  return { connector: "github", action: "actions.runs.approvals.list", source: "connector", validated: validateListPendingDeploymentsInput(input) };
}

export function createEnvironment(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createDeploymentsClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined }).createEnvironment(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "environments.create", source: "connector", environment: result.environment };
    });
  }
  return { connector: "github", action: "environments.create", source: "connector", validated: validateCreateEnvironmentInput(input) };
}

export function deleteDeployment(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createDeploymentsClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined }).deleteDeployment(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "deployments.delete", source: "connector", deleted: result.deleted, deploymentId: result.deploymentId };
    });
  }
  return { connector: "github", action: "deployments.delete", source: "connector", validated: validateDeleteDeploymentInput(input) };
}

export function deleteEnvironment(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createDeploymentsClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined }).deleteEnvironment(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "environments.delete", source: "connector", deleted: result.deleted, name: result.name };
    });
  }
  return { connector: "github", action: "environments.delete", source: "connector", validated: validateDeleteEnvironmentInput(input) };
}

export function disableWorkflow(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWorkflowsClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined }).disableWorkflow(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "actions.workflows.disable", source: "connector", workflowId: result.workflowId, state: result.state };
    });
  }
  return { connector: "github", action: "actions.workflows.disable", source: "connector", validated: validateWorkflowToggleInput(input) };
}

export function enableWorkflow(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWorkflowsClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined }).enableWorkflow(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "actions.workflows.enable", source: "connector", workflowId: result.workflowId, state: result.state };
    });
  }
  return { connector: "github", action: "actions.workflows.enable", source: "connector", validated: validateWorkflowToggleInput(input) };
}

export function deleteArtifact(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWorkflowsClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined }).deleteArtifact(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "actions.artifacts.delete", source: "connector", deleted: result.deleted, artifactId: result.artifactId };
    });
  }
  return { connector: "github", action: "actions.artifacts.delete", source: "connector", validated: validateDeleteArtifactInput(input) };
}

export function getRunAttempt(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWorkflowsClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined }).getRunAttempt(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "actions.runs.attempt.get", source: "connector", run: result.run };
    });
  }
  return { connector: "github", action: "actions.runs.attempt.get", source: "connector", validated: validateRunAttemptInput(input) };
}

export function listAttemptJobs(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWorkflowsClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined }).listAttemptJobs(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "actions.runs.attempt.jobs.list", source: "connector", totalCount: result.totalCount, jobs: result.jobs };
    });
  }
  return { connector: "github", action: "actions.runs.attempt.jobs.list", source: "connector", validated: validateRunAttemptInput(input) };
}

export function downloadAttemptLogs(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWorkflowsClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined }).downloadAttemptLogs(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "actions.runs.attempt.logs.download", source: "connector", logs: result.logs };
    });
  }
  return { connector: "github", action: "actions.runs.attempt.logs.download", source: "connector", validated: validateRunAttemptInput(input) };
}

export function forceCancelRun(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWorkflowsClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined }).forceCancelRun(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "actions.runs.force_cancel", source: "connector", forced: result.forced, runId: result.runId };
    });
  }
  return { connector: "github", action: "actions.runs.force_cancel", source: "connector", validated: validateForceCancelRunInput(input) };
}

// ─── N6: checks updates, reads, actions variables ────────────────────────────

export function updateCheckRun(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createChecksClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "checks.runs.update" }),
    }).updateRun(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "checks.runs.update", source: "connector", id: result.id, checkRun: result.checkRun };
    });
  }
  return { connector: "github", action: "checks.runs.update", source: "connector", validated: validateUpdateCheckRunInput(input) };
}

export function rerequestCheckRun(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createChecksClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "checks.runs.rerequest" }),
    }).rerequestRun(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "checks.runs.rerequest", source: "connector", rerequested: result.rerequested, checkRunId: result.checkRunId };
    });
  }
  return { connector: "github", action: "checks.runs.rerequest", source: "connector", validated: validateRerequestCheckRunInput(input) };
}

export function getCheckSuite(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createChecksClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "checks.suites.get" }),
    }).getSuite(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "checks.suites.get", source: "connector", checkSuite: result.checkSuite, rerequestable: result.rerequestable };
    });
  }
  return { connector: "github", action: "checks.suites.get", source: "connector", validated: validateGetCheckSuiteInput(input) };
}

export function rerequestCheckSuite(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createChecksClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "checks.suites.rerequest" }),
    }).rerequestSuite(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "checks.suites.rerequest", source: "connector", rerequested: result.rerequested, checkSuiteId: result.checkSuiteId };
    });
  }
  return { connector: "github", action: "checks.suites.rerequest", source: "connector", validated: validateRerequestCheckSuiteInput(input) };
}

export function listRequestedReviewers(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createPullRequestsClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "pull_requests.requested_reviewers.list" }),
    }).listRequestedReviewers(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "pull_requests.requested_reviewers.list", source: "connector", users: result.users, teams: result.teams };
    });
  }
  return { connector: "github", action: "pull_requests.requested_reviewers.list", source: "connector", validated: validateListRequestedReviewersInput(input) };
}

export function getPullRequestReviewComment(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createPullRequestsClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "pull_requests.review_comments.get" }),
    }).getReviewComment(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "pull_requests.review_comments.get", source: "connector", comment: result.comment };
    });
  }
  return { connector: "github", action: "pull_requests.review_comments.get", source: "connector", validated: validateGetReviewCommentInput(input) };
}

export function listReviewCommentsForReview(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createPullRequestsClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "pull_requests.reviews.comments.list" }),
    }).listReviewCommentsForReview(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "pull_requests.reviews.comments.list", source: "connector", comments: result.comments };
    });
  }
  return { connector: "github", action: "pull_requests.reviews.comments.list", source: "connector", validated: validateListReviewCommentsForReviewInput(input) };
}

export function getIssueComment(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createIssuesClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "issues.comments.get" }),
    }).getComment(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "issues.comments.get", source: "connector", comment: result.comment };
    });
  }
  return { connector: "github", action: "issues.comments.get", source: "connector", validated: validateGetIssueCommentInput(input) };
}

export function listIssueLabels(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createIssuesClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "issues.labels.list" }),
    }).listIssueLabels(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "issues.labels.list", source: "connector", labels: result.labels };
    });
  }
  return { connector: "github", action: "issues.labels.list", source: "connector", validated: validateListIssueLabelsInput(input) };
}

export function getCommitComment(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createCommitsClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "commits.comments.get" }),
    }).getComment(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "commits.comments.get", source: "connector", comment: result.comment };
    });
  }
  return { connector: "github", action: "commits.comments.get", source: "connector", validated: validateGetCommitCommentInput(input) };
}

export function getActionsVariable(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createActionsVariablesClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "actions.variables.get" }),
    }).get(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: "retryAfterSeconds" in result.error ? result.error.retryAfterSeconds : undefined };
      return { connector: "github", action: "actions.variables.get", source: "connector", variable: result.variable };
    });
  }
  return { connector: "github", action: "actions.variables.get", source: "connector", validated: validateGetActionsVariableInput(input) };
}

export function createActionsVariable(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createActionsVariablesClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "actions.variables.create" }),
    }).create(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: "retryAfterSeconds" in result.error ? result.error.retryAfterSeconds : undefined };
      return { connector: "github", action: "actions.variables.create", source: "connector", variable: result.variable, created: result.created };
    });
  }
  return { connector: "github", action: "actions.variables.create", source: "connector", validated: validateCreateActionsVariableInput(input) };
}

export function updateActionsVariable(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createActionsVariablesClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "actions.variables.update" }),
    }).update(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: "retryAfterSeconds" in result.error ? result.error.retryAfterSeconds : undefined };
      return { connector: "github", action: "actions.variables.update", source: "connector", updated: result.updated, name: result.name, value: result.value };
    });
  }
  return { connector: "github", action: "actions.variables.update", source: "connector", validated: validateUpdateActionsVariableInput(input) };
}

export function deleteActionsVariable(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createActionsVariablesClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "actions.variables.delete" }),
    }).delete(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: "retryAfterSeconds" in result.error ? result.error.retryAfterSeconds : undefined };
      return { connector: "github", action: "actions.variables.delete", source: "connector", deleted: result.deleted, name: result.name };
    });
  }
  return { connector: "github", action: "actions.variables.delete", source: "connector", validated: validateDeleteActionsVariableInput(input) };
}


// ─── N7: actions caches, job rerun, rule suites, commit reads ───────────────

export function listRunsForWorkflow(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWorkflowsClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined }).listWorkflowRuns(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "actions.workflows.runs.list", source: "connector", totalCount: result.totalCount, runs: result.runs };
    });
  }
  return { connector: "github", action: "actions.workflows.runs.list", source: "connector", validated: validateListWorkflowRunsInput(input) };
}

export function listCaches(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWorkflowsClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined }).listCaches(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "actions.caches.list", source: "connector", totalCount: result.totalCount, caches: result.caches };
    });
  }
  return { connector: "github", action: "actions.caches.list", source: "connector", validated: validateListCachesInput(input) };
}

export function deleteCache(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWorkflowsClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined }).deleteCache(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "actions.caches.delete", source: "connector", deleted: result.deleted, cacheId: result.cacheId };
    });
  }
  return { connector: "github", action: "actions.caches.delete", source: "connector", validated: validateDeleteCacheInput(input) };
}

export function deleteCachesByKey(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWorkflowsClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined }).deleteCachesByKey(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "actions.caches.delete_by_key", source: "connector", deleted: result.deleted, key: result.key, ref: result.ref, totalCount: result.totalCount, caches: result.caches };
    });
  }
  return { connector: "github", action: "actions.caches.delete_by_key", source: "connector", validated: validateDeleteCachesByKeyInput(input) };
}

export function rerunJob(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWorkflowsClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined }).rerunJob(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "actions.jobs.rerun", source: "connector", rerun: result.rerun, jobId: result.jobId };
    });
  }
  return { connector: "github", action: "actions.jobs.rerun", source: "connector", validated: validateRerunJobInput(input) };
}

export function deleteRun(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWorkflowsClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined }).deleteRun(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "actions.runs.delete", source: "connector", deleted: result.deleted, runId: result.runId };
    });
  }
  return { connector: "github", action: "actions.runs.delete", source: "connector", validated: validateDeleteRunInput(input) };
}

export function approveRun(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWorkflowsClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined }).approveRun(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "actions.runs.approve", source: "connector", approved: result.approved, runId: result.runId };
    });
  }
  return { connector: "github", action: "actions.runs.approve", source: "connector", validated: validateApproveRunInput(input) };
}

export function listRuleSuites(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createGovernanceClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "repos.rule_suites.list" }),
    }).listRuleSuites(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "repos.rule_suites.list", source: "connector", ruleSuites: result.ruleSuites };
    });
  }
  return { connector: "github", action: "repos.rule_suites.list", source: "connector", validated: validateListRuleSuitesInput(input) };
}

export function getRuleSuite(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createGovernanceClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "repos.rule_suites.get" }),
    }).getRuleSuite(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "repos.rule_suites.get", source: "connector", ruleSuite: result.ruleSuite };
    });
  }
  return { connector: "github", action: "repos.rule_suites.get", source: "connector", validated: validateGetRuleSuiteInput(input) };
}

export function getRepoRuleset(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createGovernanceClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "repos.rulesets.get" }),
    }).getRuleset(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "repos.rulesets.get", source: "connector", ruleset: result.ruleset };
    });
  }
  return { connector: "github", action: "repos.rulesets.get", source: "connector", validated: validateGetRepoRulesetInput(input) };
}

export function listCommitPulls(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createCommitsClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "commits.pulls.list" }),
    }).listPulls(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "commits.pulls.list", source: "connector", pullRequests: result.pullRequests };
    });
  }
  return { connector: "github", action: "commits.pulls.list", source: "connector", validated: validateListCommitPullsInput(input) };
}

export function listBranchesWhereHead(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createCommitsClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "commits.branches_where_head.list" }),
    }).listBranchesWhereHead(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "commits.branches_where_head.list", source: "connector", branches: result.branches };
    });
  }
  return { connector: "github", action: "commits.branches_where_head.list", source: "connector", validated: validateListBranchesWhereHeadInput(input) };
}

export function getGitCommit(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createGitClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "git.commits.get" }),
    }).getCommit(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "git.commits.get", source: "connector", commit: result.commit };
    });
  }
  return { connector: "github", action: "git.commits.get", source: "connector", validated: validateGetGitCommitInput(input) };
}

// ─── N8: environment and organization Actions variables ──────────────────────

function liveEnvOrgClient(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createActionsEnvOrgVariablesClient({
    accessToken: input.accessToken as string,
    fetch: fetchFn,
    githubClient: createGitHubClient({ accessToken: input.accessToken as string, fetch: fetchFn, operation }),
  });
}

function throwVariable(result: { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }): never {
  throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
}

export function listEnvironmentVariables(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveEnvOrgClient(input, "actions.environment_variables.list").listEnvironmentVariables(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "actions.environment_variables.list", source: "connector", totalCount: result.totalCount, variables: result.variables };
    });
  }
  return { connector: "github", action: "actions.environment_variables.list", source: "connector", validated: validateListEnvironmentVariablesInput(input) };
}

export function getEnvironmentVariable(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveEnvOrgClient(input, "actions.environment_variables.get").getEnvironmentVariable(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "actions.environment_variables.get", source: "connector", variable: result.variable };
    });
  }
  return { connector: "github", action: "actions.environment_variables.get", source: "connector", validated: validateGetEnvironmentVariableInput(input) };
}

export function createEnvironmentVariable(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveEnvOrgClient(input, "actions.environment_variables.create").createEnvironmentVariable(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "actions.environment_variables.create", source: "connector", id: result.variable.name, variable: result.variable, created: result.created };
    });
  }
  return { connector: "github", action: "actions.environment_variables.create", source: "connector", validated: validateCreateEnvironmentVariableInput(input) };
}

export function updateEnvironmentVariable(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveEnvOrgClient(input, "actions.environment_variables.update").updateEnvironmentVariable(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "actions.environment_variables.update", source: "connector", updated: result.updated, name: result.name, value: result.value };
    });
  }
  return { connector: "github", action: "actions.environment_variables.update", source: "connector", validated: validateUpdateEnvironmentVariableInput(input) };
}

export function deleteEnvironmentVariable(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveEnvOrgClient(input, "actions.environment_variables.delete").deleteEnvironmentVariable(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "actions.environment_variables.delete", source: "connector", id: result.name, deleted: result.deleted, name: result.name };
    });
  }
  return { connector: "github", action: "actions.environment_variables.delete", source: "connector", validated: validateDeleteEnvironmentVariableInput(input) };
}

export function listRepoOrganizationVariables(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveEnvOrgClient(input, "actions.org_variables.list_for_repo").listRepoOrgVariables(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "actions.org_variables.list_for_repo", source: "connector", totalCount: result.totalCount, variables: result.variables };
    });
  }
  return { connector: "github", action: "actions.org_variables.list_for_repo", source: "connector", validated: validateListRepoOrgVariablesInput(input) };
}

export function listOrgVariables(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveEnvOrgClient(input, "actions.org_variables.list").listOrgVariables(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "actions.org_variables.list", source: "connector", totalCount: result.totalCount, variables: result.variables };
    });
  }
  return { connector: "github", action: "actions.org_variables.list", source: "connector", validated: validateListOrgVariablesInput(input) };
}

export function getOrgVariable(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveEnvOrgClient(input, "actions.org_variables.get").getOrgVariable(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "actions.org_variables.get", source: "connector", variable: result.variable };
    });
  }
  return { connector: "github", action: "actions.org_variables.get", source: "connector", validated: validateGetOrgVariableInput(input) };
}

export function createOrgVariable(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveEnvOrgClient(input, "actions.org_variables.create").createOrgVariable(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "actions.org_variables.create", source: "connector", id: result.variable.name, variable: result.variable, created: result.created };
    });
  }
  return { connector: "github", action: "actions.org_variables.create", source: "connector", validated: validateCreateOrgVariableInput(input) };
}

export function updateOrgVariable(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveEnvOrgClient(input, "actions.org_variables.update").updateOrgVariable(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "actions.org_variables.update", source: "connector", updated: result.updated, name: result.name, value: result.value, visibility: result.visibility };
    });
  }
  return { connector: "github", action: "actions.org_variables.update", source: "connector", validated: validateUpdateOrgVariableInput(input) };
}

export function deleteOrgVariable(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveEnvOrgClient(input, "actions.org_variables.delete").deleteOrgVariable(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "actions.org_variables.delete", source: "connector", id: result.name, deleted: result.deleted, name: result.name };
    });
  }
  return { connector: "github", action: "actions.org_variables.delete", source: "connector", validated: validateDeleteOrgVariableInput(input) };
}


// ─── N9: actions permissions and deployment branch policies ──────────────────

function liveDeployPolicyClient(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createActionsDeployPolicyClient({
    accessToken: input.accessToken as string,
    fetch: fetchFn,
    githubClient: createGitHubClient({ accessToken: input.accessToken as string, fetch: fetchFn, operation }),
  });
}

export function getWorkflowPermissions(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveDeployPolicyClient(input, "actions.permissions.workflow.get").getWorkflowPermissions(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "actions.permissions.workflow.get", source: "connector", permissions: result.permissions };
    });
  }
  return { connector: "github", action: "actions.permissions.workflow.get", source: "connector", validated: validateGetWorkflowPermissionsInput(input) };
}

export function setWorkflowPermissions(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveDeployPolicyClient(input, "actions.permissions.workflow.set").setWorkflowPermissions(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "actions.permissions.workflow.set", source: "connector", permissions: result.permissions };
    });
  }
  return { connector: "github", action: "actions.permissions.workflow.set", source: "connector", validated: validateSetWorkflowPermissionsInput(input) };
}

export function getActionsPermissions(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveDeployPolicyClient(input, "actions.permissions.get").getActionsPermissions(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "actions.permissions.get", source: "connector", permissions: result.permissions };
    });
  }
  return { connector: "github", action: "actions.permissions.get", source: "connector", validated: validateGetActionsPermissionsInput(input) };
}

export function setActionsPermissions(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveDeployPolicyClient(input, "actions.permissions.set").setActionsPermissions(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "actions.permissions.set", source: "connector", permissions: result.permissions };
    });
  }
  return { connector: "github", action: "actions.permissions.set", source: "connector", validated: validateSetActionsPermissionsInput(input) };
}

export function getSelectedActions(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveDeployPolicyClient(input, "actions.permissions.selected_actions.get").getSelectedActions(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "actions.permissions.selected_actions.get", source: "connector", selectedActions: result.selectedActions };
    });
  }
  return { connector: "github", action: "actions.permissions.selected_actions.get", source: "connector", validated: validateGetSelectedActionsInput(input) };
}

export function setSelectedActions(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveDeployPolicyClient(input, "actions.permissions.selected_actions.set").setSelectedActions(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "actions.permissions.selected_actions.set", source: "connector", selectedActions: result.selectedActions };
    });
  }
  return { connector: "github", action: "actions.permissions.selected_actions.set", source: "connector", validated: validateSetSelectedActionsInput(input) };
}

export function listDeploymentBranchPolicies(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveDeployPolicyClient(input, "deployments.branch_policies.list").listBranchPolicies(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "deployments.branch_policies.list", source: "connector", totalCount: result.totalCount, policies: result.policies };
    });
  }
  return { connector: "github", action: "deployments.branch_policies.list", source: "connector", validated: validateListBranchPoliciesInput(input) };
}

export function getDeploymentBranchPolicy(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveDeployPolicyClient(input, "deployments.branch_policies.get").getBranchPolicy(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "deployments.branch_policies.get", source: "connector", policy: result.policy };
    });
  }
  return { connector: "github", action: "deployments.branch_policies.get", source: "connector", validated: validateGetBranchPolicyInput(input) };
}

export function createDeploymentBranchPolicy(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveDeployPolicyClient(input, "deployments.branch_policies.create").createBranchPolicy(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "deployments.branch_policies.create", source: "connector", id: result.policy.id || result.policy.name, policy: result.policy, created: result.created };
    });
  }
  return { connector: "github", action: "deployments.branch_policies.create", source: "connector", validated: validateCreateBranchPolicyInput(input) };
}

export function updateDeploymentBranchPolicy(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveDeployPolicyClient(input, "deployments.branch_policies.update").updateBranchPolicy(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "deployments.branch_policies.update", source: "connector", policy: result.policy };
    });
  }
  return { connector: "github", action: "deployments.branch_policies.update", source: "connector", validated: validateUpdateBranchPolicyInput(input) };
}

export function deleteDeploymentBranchPolicy(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveDeployPolicyClient(input, "deployments.branch_policies.delete").deleteBranchPolicy(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "deployments.branch_policies.delete", source: "connector", id: result.branchPolicyId, deleted: result.deleted, branchPolicyId: result.branchPolicyId, alreadyGone: result.alreadyGone };
    });
  }
  return { connector: "github", action: "deployments.branch_policies.delete", source: "connector", validated: validateDeleteBranchPolicyInput(input) };
}

// ─── N10: fork sync and scan ────────────────────────────────────────────────

export function mergeUpstream(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createBranchesClient({ accessToken: input.accessToken, fetch: fetchFn }).mergeUpstream(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "repos.merge_upstream", source: "connector", synced: result.synced, message: result.message, mergeType: result.mergeType, baseBranch: result.baseBranch, sha: result.sha };
    });
  }
  return { connector: "github", action: "repos.merge_upstream", source: "connector", validated: validateMergeUpstreamInput(input) };
}

export function renameBranch(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createBranchesClient({ accessToken: input.accessToken, fetch: fetchFn }).rename(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "branches.rename", source: "connector", renamed: result.renamed, name: result.name, sha: result.sha };
    });
  }
  return { connector: "github", action: "branches.rename", source: "connector", validated: validateRenameBranchInput(input) };
}

export function mergeBranches(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createReposClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "repos.merges" }),
    }).mergeBranches(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "repos.merges", source: "connector", merged: result.merged, created: result.created, sha: result.sha, base: result.base, head: result.head };
    });
  }
  return { connector: "github", action: "repos.merges", source: "connector", validated: validateMergeBranchesInput(input) };
}

export function updatePullRequestReview(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createPullRequestsClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "pull_requests.reviews.update" }),
    }).updateReview(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "pull_requests.reviews.update", source: "connector", review: result.review };
    });
  }
  return { connector: "github", action: "pull_requests.reviews.update", source: "connector", validated: validateUpdateReviewInput(input) };
}

export function listCodeownersErrors(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createReposClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "repos.codeowners.errors.list" }),
    }).listCodeownersErrors(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "repos.codeowners.errors.list", source: "connector", errors: result.errors };
    });
  }
  return { connector: "github", action: "repos.codeowners.errors.list", source: "connector", validated: validateListCodeownersErrorsInput(input) };
}

export function compareDependencyGraph(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createReposClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "dependency_graph.compare" }),
    }).compareDependencyGraph(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "dependency_graph.compare", source: "connector", changes: result.changes };
    });
  }
  return { connector: "github", action: "dependency_graph.compare", source: "connector", validated: validateCompareDependencyGraphInput(input) };
}

export function listCodeScanningAlertInstances(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createAlertsClient({ accessToken: input.accessToken, fetch: liveFetch(input) }).listCodeScanningInstances(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "code_scanning.alerts.instances.list", source: "connector", instances: result.instances };
    });
  }
  return { connector: "github", action: "code_scanning.alerts.instances.list", source: "connector", validated: validateListCodeScanningInstancesInput(input) };
}

export function listCodeScanningAnalyses(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createAlertsClient({ accessToken: input.accessToken, fetch: liveFetch(input) }).listCodeScanningAnalyses(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "code_scanning.analyses.list", source: "connector", analyses: result.analyses };
    });
  }
  return { connector: "github", action: "code_scanning.analyses.list", source: "connector", validated: validateListCodeScanningAnalysesInput(input) };
}

export function getCodeScanningAnalysis(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createAlertsClient({ accessToken: input.accessToken, fetch: liveFetch(input) }).getCodeScanningAnalysis(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "code_scanning.analyses.get", source: "connector", analysis: result.analysis };
    });
  }
  return { connector: "github", action: "code_scanning.analyses.get", source: "connector", validated: validateGetCodeScanningAnalysisInput(input) };
}

export function getDeploymentStatus(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createDeploymentsClient({ accessToken: input.accessToken, fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined }).getStatus(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "deployments.statuses.get", source: "connector", status: result.status };
    });
  }
  return { connector: "github", action: "deployments.statuses.get", source: "connector", validated: validateGetDeploymentStatusInput(input) };
}

export function listCheckRunsForSuite(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createChecksClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "checks.runs.list_for_suite" }),
    }).listRunsForSuite(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "checks.runs.list_for_suite", source: "connector", totalCount: result.totalCount, checkRuns: result.checkRuns };
    });
  }
  return { connector: "github", action: "checks.runs.list_for_suite", source: "connector", validated: validateListCheckRunsForSuiteInput(input) };
}

// ─── repos-2: repository metadata reads ───────────────────────────────────────

function liveReposReadsClient(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createReposReadsClient({
    accessToken: input.accessToken as string,
    fetch: fetchFn,
    githubClient: createGitHubClient({ accessToken: input.accessToken as string, fetch: fetchFn, operation }),
  });
}

export function getRepoAutolink(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveReposReadsClient(input, "repos.autolinks.get").getAutolink(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "repos.autolinks.get", source: "connector", autolink: result.autolink };
    });
  }
  return { connector: "github", action: "repos.autolinks.get", source: "connector", validated: validateGetAutolinkInput(input) };
}

export function getRepoReadme(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveReposReadsClient(input, "repos.readme.get").getReadme(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "repos.readme.get", source: "connector", readme: result.readme };
    });
  }
  return { connector: "github", action: "repos.readme.get", source: "connector", validated: validateGetReadmeInput(input) };
}

export function getRepoReadmeForDir(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveReposReadsClient(input, "repos.readme.get_for_dir").getReadmeForDir(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "repos.readme.get_for_dir", source: "connector", readme: result.readme };
    });
  }
  return { connector: "github", action: "repos.readme.get_for_dir", source: "connector", validated: validateGetReadmeForDirInput(input) };
}

export function getRepoSubscription(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveReposReadsClient(input, "repos.subscription.get").getSubscription(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "repos.subscription.get", source: "connector", subscription: result.subscription };
    });
  }
  return { connector: "github", action: "repos.subscription.get", source: "connector", validated: validateGetSubscriptionInput(input) };
}

export function getRepoCommunityProfile(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveReposReadsClient(input, "repos.community.profile.get").getCommunityProfile(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "repos.community.profile.get", source: "connector", profile: result.profile };
    });
  }
  return { connector: "github", action: "repos.community.profile.get", source: "connector", validated: validateGetCommunityProfileInput(input) };
}

export function getRepoInteractionLimits(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveReposReadsClient(input, "repos.interaction_limits.get").getInteractionLimits(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "repos.interaction_limits.get", source: "connector", limits: result.limits, present: result.present };
    });
  }
  return { connector: "github", action: "repos.interaction_limits.get", source: "connector", validated: validateGetInteractionLimitsInput(input) };
}

export function getRepoSecurityAdvisory(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveReposReadsClient(input, "repos.security_advisories.get").getSecurityAdvisory(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "repos.security_advisories.get", source: "connector", advisory: result.advisory };
    });
  }
  return { connector: "github", action: "repos.security_advisories.get", source: "connector", validated: validateGetSecurityAdvisoryInput(input) };
}

export function getRepoLicense(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveReposReadsClient(input, "repos.license.get").getLicense(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "repos.license.get", source: "connector", license: result.license };
    });
  }
  return { connector: "github", action: "repos.license.get", source: "connector", validated: validateGetRepoLicenseInput(input) };
}

export function listOrgAttestationRepositories(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveReposReadsClient(input, "orgs.attestations.repositories.list").listOrgAttestationRepositories(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "orgs.attestations.repositories.list", source: "connector", totalCount: result.totalCount, repositories: result.repositories };
    });
  }
  return { connector: "github", action: "orgs.attestations.repositories.list", source: "connector", validated: validateListOrgAttestationRepositoriesInput(input) };
}

// ─── traffic: repository statistics and traffic reads ─────────────────────────

function liveTrafficClient(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createTrafficClient({
    accessToken: input.accessToken as string,
    fetch: fetchFn,
    githubClient: createGitHubClient({ accessToken: input.accessToken as string, fetch: fetchFn, operation }),
  });
}

export function listRepoStatsContributors(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveTrafficClient(input, "repos.stats.contributors.list").listContributors(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "repos.stats.contributors.list", source: "connector", contributors: result.contributors };
    });
  }
  return { connector: "github", action: "repos.stats.contributors.list", source: "connector", validated: validateListStatsContributorsInput(input) };
}

export function getRepoTrafficViews(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveTrafficClient(input, "repos.traffic.views.get").getViews(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "repos.traffic.views.get", source: "connector", views: result.views };
    });
  }
  return { connector: "github", action: "repos.traffic.views.get", source: "connector", validated: validateGetTrafficViewsInput(input) };
}

export function getRepoTrafficClones(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveTrafficClient(input, "repos.traffic.clones.get").getClones(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "repos.traffic.clones.get", source: "connector", clones: result.clones };
    });
  }
  return { connector: "github", action: "repos.traffic.clones.get", source: "connector", validated: validateGetTrafficClonesInput(input) };
}

export function getRepoStatsPunchCard(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveTrafficClient(input, "repos.stats.punch_card.get").getPunchCard(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "repos.stats.punch_card.get", source: "connector", punchCard: result.punchCard };
    });
  }
  return { connector: "github", action: "repos.stats.punch_card.get", source: "connector", validated: validateGetStatsPunchCardInput(input) };
}

export function listRepoStatsCommitActivity(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveTrafficClient(input, "repos.stats.commit_activity.list").listCommitActivity(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "repos.stats.commit_activity.list", source: "connector", activity: result.activity };
    });
  }
  return { connector: "github", action: "repos.stats.commit_activity.list", source: "connector", validated: validateListStatsCommitActivityInput(input) };
}

export function getRepoStatsCodeFrequency(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveTrafficClient(input, "repos.stats.code_frequency.get").getCodeFrequency(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "repos.stats.code_frequency.get", source: "connector", frequency: result.frequency };
    });
  }
  return { connector: "github", action: "repos.stats.code_frequency.get", source: "connector", validated: validateGetStatsCodeFrequencyInput(input) };
}

export function getRepoStatsParticipation(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveTrafficClient(input, "repos.stats.participation.get").getParticipation(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "repos.stats.participation.get", source: "connector", participation: result.participation };
    });
  }
  return { connector: "github", action: "repos.stats.participation.get", source: "connector", validated: validateGetStatsParticipationInput(input) };
}

export function listRepoTrafficPopularPaths(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveTrafficClient(input, "repos.traffic.popular.paths.list").listPopularPaths(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "repos.traffic.popular.paths.list", source: "connector", paths: result.paths };
    });
  }
  return { connector: "github", action: "repos.traffic.popular.paths.list", source: "connector", validated: validateListTrafficPopularPathsInput(input) };
}

export function listRepoTrafficPopularReferrers(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveTrafficClient(input, "repos.traffic.popular.referrers.list").listPopularReferrers(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "repos.traffic.popular.referrers.list", source: "connector", referrers: result.referrers };
    });
  }
  return { connector: "github", action: "repos.traffic.popular.referrers.list", source: "connector", validated: validateListTrafficPopularReferrersInput(input) };
}

// ─── repos-3: repository activity reads ───────────────────────────────────────

export function listRepoNetworkEvents(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveReposReadsClient(input, "repos.network.events.list").listNetworkEvents(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "repos.network.events.list", source: "connector", events: result.events };
    });
  }
  return { connector: "github", action: "repos.network.events.list", source: "connector", validated: validateListNetworkEventsInput(input) };
}

export function listPublicRepositories(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveReposReadsClient(input, "repos.public.list").listPublicRepositories(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "repos.public.list", source: "connector", repositories: result.repositories };
    });
  }
  return { connector: "github", action: "repos.public.list", source: "connector", validated: validateListPublicRepositoriesInput(input) };
}

export function listRepoActivity(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveReposReadsClient(input, "repos.activity.list").listActivity(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "repos.activity.list", source: "connector", activity: result.activity };
    });
  }
  return { connector: "github", action: "repos.activity.list", source: "connector", validated: validateListRepoActivityInput(input) };
}

export function listRepoContributors(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveReposReadsClient(input, "repos.contributors.list").listContributors(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "repos.contributors.list", source: "connector", contributors: result.contributors };
    });
  }
  return { connector: "github", action: "repos.contributors.list", source: "connector", validated: validateListContributorsInput(input) };
}

export function listRepoEvents(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveReposReadsClient(input, "repos.events.list").listEvents(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "repos.events.list", source: "connector", events: result.events };
    });
  }
  return { connector: "github", action: "repos.events.list", source: "connector", validated: validateListRepoEventsInput(input) };
}

export function listRepoLanguages(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveReposReadsClient(input, "repos.languages.list").listLanguages(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "repos.languages.list", source: "connector", languages: result.languages };
    });
  }
  return { connector: "github", action: "repos.languages.list", source: "connector", validated: validateListRepoLanguagesInput(input) };
}

export function listRepoSecurityAdvisories(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveReposReadsClient(input, "repos.security_advisories.list").listSecurityAdvisories(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "repos.security_advisories.list", source: "connector", advisories: result.advisories };
    });
  }
  return { connector: "github", action: "repos.security_advisories.list", source: "connector", validated: validateListRepoSecurityAdvisoriesInput(input) };
}

export function getRepoTopics(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveReposReadsClient(input, "repos.topics.get").getTopics(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "repos.topics.get", source: "connector", names: result.names };
    });
  }
  return { connector: "github", action: "repos.topics.get", source: "connector", validated: validateGetRepoTopicsInput(input) };
}

// ─── orgs-reads: organization membership, role, and event reads ──────────────

function liveOrgsReadsClient(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createOrgsReadsClient({
    accessToken: input.accessToken as string,
    fetch: fetchFn,
    githubClient: createGitHubClient({ accessToken: input.accessToken as string, fetch: fetchFn, operation }),
  });
}

function liveCard3Client(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createCard3ReadsClient({
    accessToken: input.accessToken as string,
    fetch: fetchFn,
    githubClient: createGitHubClient({ accessToken: input.accessToken as string, fetch: fetchFn, operation }),
  });
}

export function checkOrgBlock(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveOrgsReadsClient(input, "orgs.blocks.check").checkBlock(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "orgs.blocks.check", source: "connector", isBlocked: result.isBlocked, username: result.username };
    });
  }
  return { connector: "github", action: "orgs.blocks.check", source: "connector", validated: validateCheckOrgBlockInput(input) };
}

export function checkOrgPublicMember(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveOrgsReadsClient(input, "orgs.public_members.check").checkPublicMember(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "orgs.public_members.check", source: "connector", isPublicMember: result.isPublicMember, username: result.username };
    });
  }
  return { connector: "github", action: "orgs.public_members.check", source: "connector", validated: validateCheckPublicMemberInput(input) };
}

export function getOrganizationRole(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveOrgsReadsClient(input, "orgs.organization_roles.get").getOrganizationRole(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "orgs.organization_roles.get", source: "connector", role: result.role };
    });
  }
  return { connector: "github", action: "orgs.organization_roles.get", source: "connector", validated: validateGetOrganizationRoleInput(input) };
}

export function getOrgInteractionLimits(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveOrgsReadsClient(input, "orgs.interaction_limits.get").getInteractionLimits(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "orgs.interaction_limits.get", source: "connector", limits: result.limits, present: result.present };
    });
  }
  return { connector: "github", action: "orgs.interaction_limits.get", source: "connector", validated: validateGetOrgInteractionLimitsInput(input) };
}

export function listPublicOrgs(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveOrgsReadsClient(input, "orgs.public.list").listPublicOrgs(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "orgs.public.list", source: "connector", organizations: result.organizations };
    });
  }
  return { connector: "github", action: "orgs.public.list", source: "connector", validated: validateListPublicOrgsInput(input) };
}

export function listUserOrgs(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveOrgsReadsClient(input, "users.orgs.list").listUserOrgs(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "users.orgs.list", source: "connector", organizations: result.organizations };
    });
  }
  return { connector: "github", action: "users.orgs.list", source: "connector", validated: validateListUserOrgsInput(input) };
}

export function listUserOrgEvents(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveOrgsReadsClient(input, "users.events.orgs.list").listUserOrgEvents(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "users.events.orgs.list", source: "connector", events: result.events };
    });
  }
  return { connector: "github", action: "users.events.orgs.list", source: "connector", validated: validateListUserOrgEventsInput(input) };
}

export function listOutsideCollaborators(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveOrgsReadsClient(input, "orgs.outside_collaborators.list").listOutsideCollaborators(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "orgs.outside_collaborators.list", source: "connector", collaborators: result.collaborators };
    });
  }
  return { connector: "github", action: "orgs.outside_collaborators.list", source: "connector", validated: validateListOutsideCollaboratorsInput(input) };
}

export function listOrgEvents(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveOrgsReadsClient(input, "orgs.events.list").listOrgEvents(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "orgs.events.list", source: "connector", events: result.events };
    });
  }
  return { connector: "github", action: "orgs.events.list", source: "connector", validated: validateListOrgEventsInput(input) };
}

export function listPublicOrgMembers(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveOrgsReadsClient(input, "orgs.public_members.list").listPublicMembers(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "orgs.public_members.list", source: "connector", members: result.members };
    });
  }
  return { connector: "github", action: "orgs.public_members.list", source: "connector", validated: validateListPublicMembersInput(input) };
}

export function listOrgBlocks(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveOrgsReadsClient(input, "orgs.blocks.list").listBlocks(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "orgs.blocks.list", source: "connector", users: result.users };
    });
  }
  return { connector: "github", action: "orgs.blocks.list", source: "connector", validated: validateListOrgBlocksInput(input) };
}

export function listOrgRoleUsers(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard3Client(input, "orgs.organization_roles.users.list").listOrgRoleUsers(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "orgs.organization_roles.users.list", source: "connector", users: result.users };
    });
  }
  return { connector: "github", action: "orgs.organization_roles.users.list", source: "connector", validated: validateListOrgRoleUsersInput(input) };
}

export function getRepoTarball(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard3Client(input, "repos.tarball.get").getTarball(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "repos.tarball.get", source: "connector", downloadUrl: result.downloadUrl };
    });
  }
  return { connector: "github", action: "repos.tarball.get", source: "connector", validated: validateGetRepoTarballInput(input) };
}

export function getRepoZipball(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard3Client(input, "repos.zipball.get").getZipball(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "repos.zipball.get", source: "connector", downloadUrl: result.downloadUrl };
    });
  }
  return { connector: "github", action: "repos.zipball.get", source: "connector", validated: validateGetRepoZipballInput(input) };
}

export function checkRepoAssignee(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard3Client(input, "repos.assignees.check").checkAssignee(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "repos.assignees.check", source: "connector", assigned: result.assigned };
    });
  }
  return { connector: "github", action: "repos.assignees.check", source: "connector", validated: validateCheckRepoAssigneeInput(input) };
}

export function checkUserBlocked(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard3Client(input, "user.blocks.check").checkBlocked(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "user.blocks.check", source: "connector", blocked: result.blocked };
    });
  }
  return { connector: "github", action: "user.blocks.check", source: "connector", validated: validateCheckUserBlockedInput(input) };
}

export function getNotificationThreadSubscription(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard3Client(input, "notifications.threads.subscription.get").getThreadSubscription(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "notifications.threads.subscription.get", source: "connector", notModified: result.notModified, subscription: result.notModified ? undefined : result.subscription };
    });
  }
  return { connector: "github", action: "notifications.threads.subscription.get", source: "connector", validated: validateGetThreadSubscriptionInput(input) };
}

export function getUserBillingUsage(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard3Client(input, "users.billing.usage.get").getBillingUsage(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "users.billing.usage.get", source: "connector", usageItems: result.usageItems };
    });
  }
  return { connector: "github", action: "users.billing.usage.get", source: "connector", validated: validateGetUserBillingUsageInput(input) };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
