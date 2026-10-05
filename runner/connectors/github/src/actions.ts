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
  validateUsersHovercardGetInput,
  validateListUserEmailsInput,
  validateListUserEventsInput,
  validateListUserReceivedEventsInput,
  validateListUserGpgKeysInput,
  validateListMarketplacePurchasesInput,
  validateListMarketplacePurchasesStubbedInput,
  validateListUserBlocksInput,
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
  validateGetEnvironmentSecretsPublicKeyInput,
  validateGetEnvironmentSecretInput,
  validateGetCodespacesSecretInput,
  validateGetCodespacesSecretsPublicKeyInput,
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
  createCard5ReadsClient,
  validateListRepoEnvironmentSecretsInput,
  validateListRepoOrganizationSecretsInput,
  validateListUserCodespacesSecretsInput,
  validateListUserCodespacesSecretRepositoriesInput,
  validateGetBranchProtectionRestrictionsInput,
  validateGetBranchProtectionEnforceAdminsInput,
  validateGetBranchProtectionRequiredSignaturesInput,
  validateGetDeploymentProtectionRuleInput,
  validateGetRequiredPullRequestReviewsInput,
  validateGetRequiredStatusChecksInput,
  validateListBranchProtectionTeamsInput,
  validateListBranchProtectionUsersInput,
  validateListUserProjectFieldsInput,
} from "./card5_reads";
import {
  createCard8ReadsClient,
  validateGetAppInput,
  validateGetAuthenticatedUserPackageInput,
  validateGetOrgPackageInput,
  validateGetOrgPackageVersionInput,
  validateGetUserPackageInput,
} from "./card8_reads";
import {
  createCard9ReadsClient,
  validateGetUserPackageVersionInput,
  validateGetAuthenticatedPackageVersionInput,
  validateListOrgPackagesInput,
  validateListUserPackagesInput,
  validateListUserPackageVersionsInput,
  validateGetRepoCodespaceDefaultsInput,
  validateGetCodespaceExportInput,
  validateListRepoCodespaceMachinesInput,
  validateListOrgMemberCodespacesInput,
  validateListUserCodespacesInput,
  validateListOrgCodespacesInput,
  validateListCodespaceMachinesInput,
} from "./card9_reads";
import {
  createCard6ReadsClient,
  validateGetCodeOfConductInput,
  validateListRepoAssigneesInput,
  validateListPublicEventFeedInput,
} from "./card6_reads";
import {
  createCard7ReadsClient,
  validateListRepoForksInput,
  validateSearchTopicsInput,
  validateSearchLabelsInput,
} from "./card7_reads";
import {
  createCard10ReadsClient,
  validateListOrgHooksInput,
  validateListIssueReactionsInput,
  validateListIssueCommentReactionsInput,
  validateListCommitCommentReactionsInput,
  validateListReviewCommentReactionsInput,
  validateListReleaseReactionsInput,
  validateGetOrgRunnerInput,
  validateGetRepoRunnerInput,
  validateListRepoRunnerLabelsInput,
} from "./card10_reads";

import {
  createCard11ReadsClient,
  validateCheckUserFollowingInput,
  validateListAuthenticatedFollowersInput,
  validateListAuthenticatedFollowingInput,
  validateListAuthenticatedSubscriptionsInput,
  validateListOrgRunnerDownloadsInput,
  validateListOrgRunnersInput,
  validateListRepoRunnerDownloadsInput,
  validateListRepoRunnersInput,
  validateListRepoStargazersInput,
  validateListRepoSubscribersInput,
  validateListUserFollowersInput,
  validateListUserFollowingInput,
  validateListUserSubscriptionsInput,
} from "./card11_reads";

import {
  createCard12ReadsClient,
  validateCheckGistStarInput,
  validateGetGistCommentInput,
  validateGetGistRevisionInput,
  validateListUserGistsInput,
  validateListGistCommentsInput,
  validateListGistCommitsInput,
  validateListGistForksInput,
  validateListPublicGistsInput,
  validateListStarredGistsInput,
  validateCheckIssueAssigneeInput,
  validateGetIssueEventInput,
  validateListAssignedIssuesInput,
  validateListRepoIssueCommentsInput,
  validateListRepoIssueEventsInput,
  validateListMilestoneLabelsInput,
} from "./card12_reads";


import {
  createCard13ReadsClient,
  validateListSubIssuesInput,
  validateGetTeamRepoPermissionInput,
  validateGetOrgTeamInput,
  validateListChildTeamsInput,
  validateListTeamInvitationsInput,
  validateListRepoTeamsInput,
  validateListUserTeamsInput,
  validateListOrgRoleTeamsInput,
  validateGetOrgWorkflowPermissionsInput,
  validateGetOrgCacheUsageInput,
  validateGetRepoCacheUsageInput,
  validateGetOrgActionsPermissionsInput,
  validateGetRunTimingInput,
  validateGetWorkflowTimingInput,
} from "./card13_reads";
import {
  createCard16ReadsClient,
  validateGetPagesBuildInput,
  validateGetLatestPagesBuildInput,
  validateGetPagesDeploymentInput,
  validateListPagesBuildsInput,
  validateGetSarifUploadInput,
  validateListCodeqlDatabasesInput,
  validateListOrgCodeScanningAlertsInput,
  validateGetGlobalAdvisoryInput,
  validateListGlobalAdvisoriesInput,
} from "./card16_reads";

import {
  createCard14ReadsClient,
  validateGetGitignoreTemplateInput,
  validateGetLicenseInput,
  validateGetZenInput,
} from "./card14_reads";
import {
  createCard15ReadsClient,
  validateGetEmojisInput,
  validateGetFeedsInput,
  validateGetMetaInput,
  validateListMetaVersionsInput,
  validateGetOctocatInput,
} from "./card15_reads";
import {
  createCard17ReadsClient,
  validateGetRateLimitInput,
  validateListRepoCommentsInput,
  validateGetRepoKeyInput,
  validateListRepoKeysInput,
} from "./card17_reads";

import {
  createCard18ReadsClient,
  validateListRepoPullCommentsInput,
} from "./card18_reads";

import {
  createCard19ReadsClient,
  validateGetMetaRootInput,
  validateGetRepoDependencyGraphSbomInput,
  validateGetCodeqlDatabaseInput,
  validateGetCodeScanningDefaultSetupInput,
  validateGetOrgPropertySchemaInput,
  validateGetOrgProjectItemInput,
  validateGetRepoPagesHealthInput,
  validateGetRepoPagesInput,
  validateGetUserProjectItemInput,
  validateListRepoIssueTypesInput,
  validateListOrgProjectsInput,
  validateListUserProjectItemsInput,
  validateListUserProjectViewItemsInput,
  validateListUserProjectsInput,
} from "./card19_reads";

import {
  createWriteCard1Client,
  validateAssignOrgRoleInput,
  validateBlockOrgUserInput,
  validateDeleteOrgInput,
  validateRemoveAllOrgRolesInput,
  validateRemoveOrgMemberInput,
  validateRemoveOrgRoleInput,
  validateDeleteOrgPropertySchemaInput,
  validateDeleteOrgInteractionLimitsInput,
  validateRemoveOutsideCollaboratorInput,
  validateSetOrgInteractionLimitsInput,
  validateUnblockOrgUserInput,
  validateUnlockOrgMigrationRepoInput,
  validateUpdateOrgInput,
} from "./write_card1";
import {
  createWriteCard2Client,
  validateAcceptRepositoryInvitationInput,
  validateCreateAutolinkInput,
  validateGenerateRepoInput,
  validateCreateDependencySnapshotInput,
  validateDeclineRepositoryInvitationInput,
  validateDeleteRepoInput,
  validateDeleteRepoInvitationInput,
  validateDeleteRepoSubscriptionInput,
  validateMarkRepoNotificationsInput,
  validateDeleteRepoInteractionLimitsInput,
  validateTransferRepoInput,
  validateUpdateRepoInvitationInput,
  validateUpdateCheckSuitePreferencesInput,
  validateReplaceTopicsInput,
  validateSetRepoSubscriptionInput,
  validateSetRepoInteractionLimitsInput,
} from "./write_card2";
import {
  createWriteCard3Client,
  validateAddEmailsInput,
  validateAddSocialAccountsInput,
  validateBlockUserInput,
  validateAddCodespaceSecretRepositoryInput,
  validateUpsertEnvironmentSecretInput,
  validateUpsertCodespaceSecretInput,
  validateDeleteSocialAccountsInput,
  validateUnblockUserInput,
  validateUnlockUserMigrationRepoInput,
  validateDeleteCodespaceSecretInput,
  validateDeleteEnvironmentSecretInput,
  validateUpdateAuthenticatedUserInput,
} from "./write_card3";
import {
  createWriteCard4Client,
  validateRemoveCodespaceSecretRepositoryInput,
  validateSetCodespaceSecretRepositoriesInput,
  validateAddRestrictionAppsInput,
  validateAddStatusCheckContextsInput,
  validateAddRestrictionTeamsInput,
  validateAddRestrictionUsersInput,
  validateCreateRequiredSignaturesInput,
  validateDeleteRestrictionsInput,
  validateDeleteEnforceAdminsInput,
  validateDeleteBranchProtectionInput,
  validateDeleteRequiredSignaturesInput,
  validateDeleteRequiredPullRequestReviewsInput,
} from "./write_card4";
import {
  createWriteCard5Client,
  validateDeleteDeploymentProtectionRuleInput,
  validateRemoveRestrictionAppsInput,
  validateRemoveStatusCheckContextsInput,
  validateDeleteRequiredStatusChecksInput,
  validateRemoveRestrictionTeamsInput,
  validateRemoveRestrictionUsersInput,
  validateCreateEnforceAdminsInput,
  validateSetRestrictionAppsInput,
  validateSetStatusCheckContextsInput,
  validateSetRestrictionTeamsInput,
  validateSetRestrictionUsersInput,
  validateUpdateBranchProtectionInput,
  validateUpdatePullRequestReviewProtectionInput,
  validateUpdateStatusCheckProtectionInput,
} from "./write_card5";

import {
  createWriteCard6Client,
  validateDeleteUserProjectItemInput,
  validateCreateCheckSuiteInput,
  validateDeleteThreadSubscriptionInput,
  validateMarkThreadDoneInput,
  validateSetThreadSubscriptionInput,
} from "./write_card6";

import {
  createWriteCard7Client,
  validateDeleteMilestoneInput,
  validateCreateOrgRunnerRegistrationTokenInput,
  validateCreateRepoRunnerRegistrationTokenInput,
  validateCreateOrgRunnerRemoveTokenInput,
  validateCreateRepoRunnerRemoveTokenInput,
  validateAddInstallationRepositoryInput,
  validateRemoveInstallationRepositoryInput,
} from "./write_card7";

import {
  createWriteCard8Client,
  validateDeleteAuthenticatedPackageVersionInput,
  validateDeleteOrgPackageVersionInput,
  validateDeleteUserPackageVersionInput,
  validateRestoreOrgPackageInput,
  validateRestoreUserPackageInput,
  validateRestoreAuthenticatedPackageInput,
} from "./write_card8";

import {
  createWriteCard9Client,
  validateRestoreAuthenticatedPackageVersionInput,
  validateRestoreOrgPackageVersionInput,
  validateRestoreUserPackageVersionInput,
  validateAddOrgCodespacesAccessSelectedUsersInput,
  validateCreateUserCodespaceInput,
  validateCreateRepoCodespaceInput,
  validateCreatePullCodespaceInput,
  validatePublishCodespaceInput,
  validateCreateCodespaceExportInput,
  validateSetOrgCodespacesAccessInput,
  validateStartUserCodespaceInput,
  validateStopOrgMemberCodespaceInput,
  validateStopUserCodespaceInput,
} from "./write_card9";

import {
  createWriteCard10Client,
  validateCreateOrgHookInput,
  validateDeleteRepoHookInput,
  validateDeleteOrgHookInput,
  validatePingOrgHookInput,
  validatePingRepoHookInput,
  validateRedeliverOrgHookDeliveryInput,
  validateRedeliverRepoHookDeliveryInput,
  validateUpdateOrgHookInput,
  validateUpdateRepoHookInput,
  validateCreateIssueReactionInput,
  validateCreateIssueCommentReactionInput,
  validateCreateCommitCommentReactionInput,
  validateCreatePullReviewCommentReactionInput,
  validateCreateReleaseReactionInput,
  validateDeleteReleaseReactionInput,
  validateDeleteCommitCommentReactionInput,
  validateDeleteIssueCommentReactionInput,
  validateDeleteIssueReactionInput,
} from "./write_card10";

import {
  createWriteCard11Client,
  validateDeletePullReviewCommentReactionInput,
  validateDeleteOrgActionsRunnerInput,
  validateDeleteRepoActionsRunnerInput,
  validateFollowUserInput,
} from "./write_card11";

import {
  createWriteCard12Client,
  validateUnfollowUserInput,
  validateCreateGistCommentInput,
  validateDeleteGistCommentInput,
  validateUpdateGistCommentInput,
  validateCreateGistForkInput,
  validateStarGistInput,
  validateUnstarGistInput,
} from "./write_card12";

import {
  createWriteCard13Client,
  validateAddSubIssueInput,
  validateRemoveAllIssueLabelsInput,
  validateAddTeamRepoInput,
  validateAssignOrgRoleToTeamInput,
  validateDeleteOrgTeamInput,
  validateRemoveAllOrgRolesFromTeamInput,
  validateRemoveOrgRoleFromTeamInput,
  validateRemoveTeamRepoInput,
  validateUpdateOrgTeamInput,
} from "./write_card13";

import {
  createWriteCard14Client,
  validateAddOrgVariableRepositoryInput,
  validateDeleteRunLogsInput,
  validateSetOrgWorkflowPermissionsInput,
  validateSetOrgActionsPermissionsInput,
  validateRenderMarkdownInput,
  validateCancelPagesDeploymentInput,
  validateCreatePagesDeploymentInput,
  validateCreatePagesSiteInput,
  validateDeletePagesSiteInput,
  validateRequestPagesBuildInput,
} from "./write_card14";


import {
  createWriteCard15Client,
  validateCreateSecurityAdvisoryReportInput,
  validateCreateSecurityAdvisoryForkInput,
  validateCreateRepoKeyInput,
  validateDeleteRepoKeyInput,
  validateCreateRepoRulesetInput,
  validateDeleteRepoRulesetInput,
  validateUpdateRepoRulesetInput,
} from "./write_card15";

import {
  createWriteCard16Client,
  validateDeleteReleaseAssetInput,
  validateUpdateReleaseAssetInput,
} from "./write_card16";

import {
  createWriteCard17Client,
  validateCreateUserProjectFieldInput,
  validateCreateUserProjectItemInput,
  validateCreateUserProjectDraftInput,
  validateCreateUserProjectViewInput,
  validateDeleteAutolinkInput,
  validateDeleteCodeScanningAnalysisInput,
  validateDeleteUserPackageInput,
  validateRemoveRunnerLabelInput,
  validateTestRepoHookInput,
  validateUpdateCodeScanningDefaultSetupInput,
  validateUpdateOrgHookConfigInput,
  validateUpdateRepoHookConfigInput,
  validateUpdateUserProjectItemInput,
} from "./write_card17";
import {
  createCorrectnessCard18Client,
  validateListUsersInput,
} from "./correctness_card18";





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

export function getUserHovercard(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createUsersClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "users.hovercard.get" }),
    }).getHovercard(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "users.hovercard.get", source: "connector", hovercard: result.hovercard };
    });
  }
  return { connector: "github", action: "users.hovercard.get", source: "connector", validated: validateUsersHovercardGetInput(input) };
}

export function listUserEmails(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createUsersClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "user.emails.list" }),
    }).listEmails(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "user.emails.list", source: "connector", emails: result.emails };
    });
  }
  return { connector: "github", action: "user.emails.list", source: "connector", validated: validateListUserEmailsInput(input) };
}

export function listUserEvents(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createUsersClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "users.events.list" }),
    }).listEvents(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "users.events.list", source: "connector", events: result.events };
    });
  }
  return { connector: "github", action: "users.events.list", source: "connector", validated: validateListUserEventsInput(input) };
}

export function listUserReceivedEvents(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createUsersClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "users.received_events.list" }),
    }).listReceivedEvents(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "users.received_events.list", source: "connector", events: result.events };
    });
  }
  return { connector: "github", action: "users.received_events.list", source: "connector", validated: validateListUserReceivedEventsInput(input) };
}

export function listUserGpgKeys(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createUsersClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "users.gpg_keys.list" }),
    }).listGpgKeys(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "users.gpg_keys.list", source: "connector", keys: result.keys };
    });
  }
  return { connector: "github", action: "users.gpg_keys.list", source: "connector", validated: validateListUserGpgKeysInput(input) };
}

export function listMarketplacePurchases(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createUsersClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "user.marketplace_purchases.list" }),
    }).listMarketplacePurchases(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "user.marketplace_purchases.list", source: "connector", purchases: result.purchases };
    });
  }
  return { connector: "github", action: "user.marketplace_purchases.list", source: "connector", validated: validateListMarketplacePurchasesInput(input) };
}

export function listMarketplacePurchasesStubbed(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createUsersClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "user.marketplace_purchases.stubbed.list" }),
    }).listMarketplacePurchasesStubbed(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "user.marketplace_purchases.stubbed.list", source: "connector", purchases: result.purchases };
    });
  }
  return { connector: "github", action: "user.marketplace_purchases.stubbed.list", source: "connector", validated: validateListMarketplacePurchasesStubbedInput(input) };
}

export function listUserBlocks(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createUsersClient({
      accessToken: input.accessToken,
      fetch: fetchFn,
      githubClient: createGitHubClient({ accessToken: input.accessToken, fetch: fetchFn, operation: "user.blocks.list" }),
    }).listBlocks(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "user.blocks.list", source: "connector", users: result.users };
    });
  }
  return { connector: "github", action: "user.blocks.list", source: "connector", validated: validateListUserBlocksInput(input) };
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

export function getEnvironmentSecretsPublicKey(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createAlertsClient({ accessToken: input.accessToken, fetch: liveFetch(input) }).getEnvironmentSecretsPublicKey(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "repos.environments.secrets.public_key.get", source: "connector", publicKey: result.publicKey };
    });
  }
  return { connector: "github", action: "repos.environments.secrets.public_key.get", source: "connector", validated: validateGetEnvironmentSecretsPublicKeyInput(input) };
}

export function getEnvironmentSecret(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createAlertsClient({ accessToken: input.accessToken, fetch: liveFetch(input) }).getEnvironmentSecret(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "repos.environments.secrets.get", source: "connector", secret: result.secret };
    });
  }
  return { connector: "github", action: "repos.environments.secrets.get", source: "connector", validated: validateGetEnvironmentSecretInput(input) };
}

export function getCodespacesSecret(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createAlertsClient({ accessToken: input.accessToken, fetch: liveFetch(input) }).getCodespacesSecret(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "user.codespaces.secrets.get", source: "connector", secret: result.secret };
    });
  }
  return { connector: "github", action: "user.codespaces.secrets.get", source: "connector", validated: validateGetCodespacesSecretInput(input) };
}

export function getCodespacesSecretsPublicKey(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createAlertsClient({ accessToken: input.accessToken, fetch: liveFetch(input) }).getCodespacesSecretsPublicKey(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "user.codespaces.secrets.public_key.get", source: "connector", publicKey: result.publicKey };
    });
  }
  return { connector: "github", action: "user.codespaces.secrets.public_key.get", source: "connector", validated: validateGetCodespacesSecretsPublicKeyInput(input) };
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

// ─── card5-reads: secret, protection, and project field reads ────────────────

function liveCard5ReadsClient(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createCard5ReadsClient({
    accessToken: input.accessToken as string,
    fetch: fetchFn,
    githubClient: createGitHubClient({ accessToken: input.accessToken as string, fetch: fetchFn, operation }),
  });
}

export function listRepoEnvironmentSecrets(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard5ReadsClient(input, "repos.environments.secrets.list").listRepoEnvironmentSecrets(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "repos.environments.secrets.list", source: "connector", total_count: result.total_count, secrets: result.secrets };
    });
  }
  return { connector: "github", action: "repos.environments.secrets.list", source: "connector", validated: validateListRepoEnvironmentSecretsInput(input) };
}

export function listRepoOrganizationSecrets(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard5ReadsClient(input, "actions.organization_secrets.list").listRepoOrganizationSecrets(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "actions.organization_secrets.list", source: "connector", total_count: result.total_count, secrets: result.secrets };
    });
  }
  return { connector: "github", action: "actions.organization_secrets.list", source: "connector", validated: validateListRepoOrganizationSecretsInput(input) };
}

export function listUserCodespacesSecrets(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard5ReadsClient(input, "user.codespaces.secrets.list").listUserCodespacesSecrets(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "user.codespaces.secrets.list", source: "connector", total_count: result.total_count, secrets: result.secrets };
    });
  }
  return { connector: "github", action: "user.codespaces.secrets.list", source: "connector", validated: validateListUserCodespacesSecretsInput(input) };
}

export function listUserCodespacesSecretRepositories(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard5ReadsClient(input, "user.codespaces.secrets.repositories.list").listUserCodespacesSecretRepositories(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "user.codespaces.secrets.repositories.list", source: "connector", total_count: result.total_count, repositories: result.repositories };
    });
  }
  return { connector: "github", action: "user.codespaces.secrets.repositories.list", source: "connector", validated: validateListUserCodespacesSecretRepositoriesInput(input) };
}

export function getBranchProtectionRestrictions(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard5ReadsClient(input, "branches.protection.restrictions.get").getBranchProtectionRestrictions(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "branches.protection.restrictions.get", source: "connector", users: result.users, teams: result.teams, apps: result.apps };
    });
  }
  return { connector: "github", action: "branches.protection.restrictions.get", source: "connector", validated: validateGetBranchProtectionRestrictionsInput(input) };
}

export function getBranchProtectionEnforceAdmins(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard5ReadsClient(input, "branches.protection.enforce_admins.get").getBranchProtectionEnforceAdmins(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "branches.protection.enforce_admins.get", source: "connector", url: result.url, enabled: result.enabled };
    });
  }
  return { connector: "github", action: "branches.protection.enforce_admins.get", source: "connector", validated: validateGetBranchProtectionEnforceAdminsInput(input) };
}

export function getBranchProtectionRequiredSignatures(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard5ReadsClient(input, "branches.protection.required_signatures.get").getBranchProtectionRequiredSignatures(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "branches.protection.required_signatures.get", source: "connector", url: result.url, enabled: result.enabled };
    });
  }
  return { connector: "github", action: "branches.protection.required_signatures.get", source: "connector", validated: validateGetBranchProtectionRequiredSignaturesInput(input) };
}

export function getEnvironmentDeploymentProtectionRule(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard5ReadsClient(input, "environments.deployment_protection_rules.get").getDeploymentProtectionRule(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "environments.deployment_protection_rules.get", source: "connector", rule: result.rule };
    });
  }
  return { connector: "github", action: "environments.deployment_protection_rules.get", source: "connector", validated: validateGetDeploymentProtectionRuleInput(input) };
}

export function getRequiredPullRequestReviews(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard5ReadsClient(input, "branches.protection.required_pull_request_reviews.get").getRequiredPullRequestReviews(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "branches.protection.required_pull_request_reviews.get", source: "connector", reviews: result.reviews };
    });
  }
  return { connector: "github", action: "branches.protection.required_pull_request_reviews.get", source: "connector", validated: validateGetRequiredPullRequestReviewsInput(input) };
}

export function getRequiredStatusChecks(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard5ReadsClient(input, "branches.protection.required_status_checks.get").getRequiredStatusChecks(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "branches.protection.required_status_checks.get", source: "connector", checks: result.checks };
    });
  }
  return { connector: "github", action: "branches.protection.required_status_checks.get", source: "connector", validated: validateGetRequiredStatusChecksInput(input) };
}

export function listBranchProtectionRestrictionTeams(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard5ReadsClient(input, "branches.protection.restrictions.teams.list").listBranchProtectionTeams(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "branches.protection.restrictions.teams.list", source: "connector", teams: result.teams };
    });
  }
  return { connector: "github", action: "branches.protection.restrictions.teams.list", source: "connector", validated: validateListBranchProtectionTeamsInput(input) };
}

export function listBranchProtectionRestrictionUsers(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard5ReadsClient(input, "branches.protection.restrictions.users.list").listBranchProtectionUsers(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "branches.protection.restrictions.users.list", source: "connector", users: result.users };
    });
  }
  return { connector: "github", action: "branches.protection.restrictions.users.list", source: "connector", validated: validateListBranchProtectionUsersInput(input) };
}

export function listUserProjectFields(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard5ReadsClient(input, "users.projects_v2.fields.list").listUserProjectFields(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "users.projects_v2.fields.list", source: "connector", fields: result.fields };
    });
  }
  return { connector: "github", action: "users.projects_v2.fields.list", source: "connector", validated: validateListUserProjectFieldsInput(input) };
}

function liveCard6Client(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createCard6ReadsClient({
    accessToken: input.accessToken as string,
    fetch: fetchFn,
    githubClient: createGitHubClient({ accessToken: input.accessToken as string, fetch: fetchFn, operation }),
  });
}

export function getCodeOfConduct(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard6Client(input, "codes_of_conduct.get").getCodeOfConduct(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "codes_of_conduct.get", source: "connector", codeOfConduct: result.codeOfConduct };
    });
  }
  return { connector: "github", action: "codes_of_conduct.get", source: "connector", validated: validateGetCodeOfConductInput(input) };
}

export function listRepoAssignees(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard6Client(input, "repos.assignees.list").listRepoAssignees(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "repos.assignees.list", source: "connector", assignees: result.assignees };
    });
  }
  return { connector: "github", action: "repos.assignees.list", source: "connector", validated: validateListRepoAssigneesInput(input) };
}

export function listPublicEvents(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard6Client(input, "events.public.list").listPublicEvents(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "events.public.list", source: "connector", events: result.events };
    });
  }
  return { connector: "github", action: "events.public.list", source: "connector", validated: validateListPublicEventFeedInput(input) };
}


// ─── card 7: forks list and search reads ─────────────────────────────────────

function liveCard7Client(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createCard7ReadsClient({
    accessToken: input.accessToken as string,
    fetch: fetchFn,
    githubClient: createGitHubClient({ accessToken: input.accessToken as string, fetch: fetchFn, operation }),
  });
}

export function listRepoForks(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard7Client(input, "repos.forks.list").listForks(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.forks.list", source: "connector", forks: result.forks };
    });
  }
  return { connector: "github", action: "repos.forks.list", source: "connector", validated: validateListRepoForksInput(input) };
}

export function searchTopics(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard7Client(input, "search.topics.list").searchTopics(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "search.topics.list", source: "connector", totalCount: result.totalCount, incompleteResults: result.incompleteResults, items: result.items };
    });
  }
  return { connector: "github", action: "search.topics.list", source: "connector", validated: validateSearchTopicsInput(input) };
}

export function searchLabels(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard7Client(input, "search.labels.list").searchLabels(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "search.labels.list", source: "connector", totalCount: result.totalCount, incompleteResults: result.incompleteResults, items: result.items };
    });
  }
  return { connector: "github", action: "search.labels.list", source: "connector", validated: validateSearchLabelsInput(input) };
}


// ─── card8-reads: app and package reads ──────────────────────────────────────

function liveCard8ReadsClient(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createCard8ReadsClient({
    accessToken: input.accessToken as string,
    fetch: fetchFn,
    githubClient: createGitHubClient({ accessToken: input.accessToken as string, fetch: fetchFn, operation }),
  });
}

export function getApp(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard8ReadsClient(input, "apps.get").getApp(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "apps.get", source: "connector", app: result.app };
    });
  }
  return { connector: "github", action: "apps.get", source: "connector", validated: validateGetAppInput(input) };
}

export function getOrgPackage(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard8ReadsClient(input, "orgs.packages.get").getOrgPackage(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "orgs.packages.get", source: "connector", package: result.package };
    });
  }
  return { connector: "github", action: "orgs.packages.get", source: "connector", validated: validateGetOrgPackageInput(input) };
}

export function getUserPackage(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard8ReadsClient(input, "users.packages.get").getUserPackage(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "users.packages.get", source: "connector", package: result.package };
    });
  }
  return { connector: "github", action: "users.packages.get", source: "connector", validated: validateGetUserPackageInput(input) };
}

export function getAuthenticatedUserPackage(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard8ReadsClient(input, "user.packages.get").getAuthenticatedUserPackage(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "user.packages.get", source: "connector", package: result.package };
    });
  }
  return { connector: "github", action: "user.packages.get", source: "connector", validated: validateGetAuthenticatedUserPackageInput(input) };
}

export function getOrgPackageVersion(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard8ReadsClient(input, "orgs.packages.versions.get").getOrgPackageVersion(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "orgs.packages.versions.get", source: "connector", version: result.version };
    });
  }
  return { connector: "github", action: "orgs.packages.versions.get", source: "connector", validated: validateGetOrgPackageVersionInput(input) };
}

function liveCard9Client(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createCard9ReadsClient({
    accessToken: input.accessToken as string,
    fetch: fetchFn,
    githubClient: createGitHubClient({ accessToken: input.accessToken as string, fetch: fetchFn, operation }),
  });
}

export function getUserPackageVersion(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard9Client(input, "users.packages.versions.get").getUserPackageVersion(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "users.packages.versions.get", source: "connector", packageVersion: result.packageVersion };
    });
  }
  return { connector: "github", action: "users.packages.versions.get", source: "connector", validated: validateGetUserPackageVersionInput(input) };
}

export function getAuthenticatedPackageVersion(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard9Client(input, "user.packages.versions.get").getAuthenticatedPackageVersion(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "user.packages.versions.get", source: "connector", packageVersion: result.packageVersion };
    });
  }
  return { connector: "github", action: "user.packages.versions.get", source: "connector", validated: validateGetAuthenticatedPackageVersionInput(input) };
}

export function listOrgPackages(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard9Client(input, "orgs.packages.list").listOrgPackages(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "orgs.packages.list", source: "connector", packages: result.packages };
    });
  }
  return { connector: "github", action: "orgs.packages.list", source: "connector", validated: validateListOrgPackagesInput(input) };
}

export function listUserPackages(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard9Client(input, "users.packages.list").listUserPackages(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "users.packages.list", source: "connector", packages: result.packages };
    });
  }
  return { connector: "github", action: "users.packages.list", source: "connector", validated: validateListUserPackagesInput(input) };
}

export function listUserPackageVersions(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard9Client(input, "users.packages.versions.list").listUserPackageVersions(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "users.packages.versions.list", source: "connector", versions: result.versions };
    });
  }
  return { connector: "github", action: "users.packages.versions.list", source: "connector", validated: validateListUserPackageVersionsInput(input) };
}

export function getRepoCodespaceDefaults(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard9Client(input, "repos.codespaces.new.get").getRepoCodespaceDefaults(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "repos.codespaces.new.get", source: "connector", defaults: result.defaults };
    });
  }
  return { connector: "github", action: "repos.codespaces.new.get", source: "connector", validated: validateGetRepoCodespaceDefaultsInput(input) };
}

export function getCodespaceExport(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard9Client(input, "user.codespaces.exports.get").getCodespaceExport(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "user.codespaces.exports.get", source: "connector", export: result.export };
    });
  }
  return { connector: "github", action: "user.codespaces.exports.get", source: "connector", validated: validateGetCodespaceExportInput(input) };
}

export function listRepoCodespaceMachines(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard9Client(input, "repos.codespaces.machines.list").listRepoCodespaceMachines(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "repos.codespaces.machines.list", source: "connector", machines: result.machines };
    });
  }
  return { connector: "github", action: "repos.codespaces.machines.list", source: "connector", validated: validateListRepoCodespaceMachinesInput(input) };
}

export function listOrgMemberCodespaces(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard9Client(input, "orgs.members.codespaces.list").listOrgMemberCodespaces(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "orgs.members.codespaces.list", source: "connector", codespaces: result.codespaces };
    });
  }
  return { connector: "github", action: "orgs.members.codespaces.list", source: "connector", validated: validateListOrgMemberCodespacesInput(input) };
}

export function listUserCodespaces(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard9Client(input, "user.codespaces.list").listUserCodespaces(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "user.codespaces.list", source: "connector", codespaces: result.codespaces };
    });
  }
  return { connector: "github", action: "user.codespaces.list", source: "connector", validated: validateListUserCodespacesInput(input) };
}

export function listOrgCodespaces(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard9Client(input, "orgs.codespaces.list").listOrgCodespaces(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "orgs.codespaces.list", source: "connector", codespaces: result.codespaces };
    });
  }
  return { connector: "github", action: "orgs.codespaces.list", source: "connector", validated: validateListOrgCodespacesInput(input) };
}

export function listCodespaceMachines(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard9Client(input, "user.codespaces.machines.list").listCodespaceMachines(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "user.codespaces.machines.list", source: "connector", machines: result.machines };
    });
  }
  return { connector: "github", action: "user.codespaces.machines.list", source: "connector", validated: validateListCodespaceMachinesInput(input) };
}


// ─── card 10: org hooks, reactions, and runner reads ─────────────────────────

function liveCard10Client(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createCard10ReadsClient({
    accessToken: input.accessToken as string,
    fetch: fetchFn,
    githubClient: createGitHubClient({ accessToken: input.accessToken as string, fetch: fetchFn, operation }),
  });
}

export function listOrgHooks(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard10Client(input, "orgs.hooks.list").listOrgHooks(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.hooks.list", source: "connector", hooks: result.hooks };
    });
  }
  return { connector: "github", action: "orgs.hooks.list", source: "connector", validated: validateListOrgHooksInput(input) };
}

export function listIssueReactions(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard10Client(input, "issues.reactions.list").listIssueReactions(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "issues.reactions.list", source: "connector", reactions: result.reactions };
    });
  }
  return { connector: "github", action: "issues.reactions.list", source: "connector", validated: validateListIssueReactionsInput(input) };
}

export function listIssueCommentReactions(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard10Client(input, "issues.comments.reactions.list").listIssueCommentReactions(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "issues.comments.reactions.list", source: "connector", reactions: result.reactions };
    });
  }
  return { connector: "github", action: "issues.comments.reactions.list", source: "connector", validated: validateListIssueCommentReactionsInput(input) };
}

export function listCommitCommentReactions(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard10Client(input, "commits.comments.reactions.list").listCommitCommentReactions(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "commits.comments.reactions.list", source: "connector", reactions: result.reactions };
    });
  }
  return { connector: "github", action: "commits.comments.reactions.list", source: "connector", validated: validateListCommitCommentReactionsInput(input) };
}

export function listReviewCommentReactions(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard10Client(input, "pull_requests.review_comments.reactions.list").listReviewCommentReactions(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "pull_requests.review_comments.reactions.list", source: "connector", reactions: result.reactions };
    });
  }
  return { connector: "github", action: "pull_requests.review_comments.reactions.list", source: "connector", validated: validateListReviewCommentReactionsInput(input) };
}

export function listReleaseReactions(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard10Client(input, "releases.reactions.list").listReleaseReactions(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "releases.reactions.list", source: "connector", reactions: result.reactions };
    });
  }
  return { connector: "github", action: "releases.reactions.list", source: "connector", validated: validateListReleaseReactionsInput(input) };
}

export function getOrgActionsRunner(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard10Client(input, "orgs.actions.runners.get").getOrgRunner(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.actions.runners.get", source: "connector", runner: result.runner };
    });
  }
  return { connector: "github", action: "orgs.actions.runners.get", source: "connector", validated: validateGetOrgRunnerInput(input) };
}

export function getRepoActionsRunner(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard10Client(input, "repos.actions.runners.get").getRepoRunner(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.actions.runners.get", source: "connector", runner: result.runner };
    });
  }
  return { connector: "github", action: "repos.actions.runners.get", source: "connector", validated: validateGetRepoRunnerInput(input) };
}

export function listRepoActionsRunnerLabels(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard10Client(input, "repos.actions.runners.labels.list").listRepoRunnerLabels(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.actions.runners.labels.list", source: "connector", totalCount: result.totalCount, labels: result.labels };
    });
  }
  return { connector: "github", action: "repos.actions.runners.labels.list", source: "connector", validated: validateListRepoRunnerLabelsInput(input) };
}


// ─── card11-reads: runners, follows, stars, and subscribers ──────────────────

function liveCard11ReadsClient(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createCard11ReadsClient({
    accessToken: input.accessToken as string,
    fetch: fetchFn,
    githubClient: createGitHubClient({ accessToken: input.accessToken as string, fetch: fetchFn, operation }),
  });
}

export function listOrgRunnerDownloads(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard11ReadsClient(input, "orgs.actions.runners.downloads.list").listOrgRunnerDownloads(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "orgs.actions.runners.downloads.list", source: "connector", downloads: result.downloads };
    });
  }
  return { connector: "github", action: "orgs.actions.runners.downloads.list", source: "connector", validated: validateListOrgRunnerDownloadsInput(input) };
}

export function listRepoRunnerDownloads(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard11ReadsClient(input, "repos.actions.runners.downloads.list").listRepoRunnerDownloads(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "repos.actions.runners.downloads.list", source: "connector", downloads: result.downloads };
    });
  }
  return { connector: "github", action: "repos.actions.runners.downloads.list", source: "connector", validated: validateListRepoRunnerDownloadsInput(input) };
}

export function listOrgActionsRunners(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard11ReadsClient(input, "orgs.actions.runners.list").listOrgRunners(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "orgs.actions.runners.list", source: "connector", totalCount: result.totalCount, runners: result.runners };
    });
  }
  return { connector: "github", action: "orgs.actions.runners.list", source: "connector", validated: validateListOrgRunnersInput(input) };
}

export function listRepoActionsRunners(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard11ReadsClient(input, "repos.actions.runners.list").listRepoRunners(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "repos.actions.runners.list", source: "connector", totalCount: result.totalCount, runners: result.runners };
    });
  }
  return { connector: "github", action: "repos.actions.runners.list", source: "connector", validated: validateListRepoRunnersInput(input) };
}

export function checkUserFollowing(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard11ReadsClient(input, "users.following.check").checkFollowing(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "users.following.check", source: "connector", following: result.following };
    });
  }
  return { connector: "github", action: "users.following.check", source: "connector", validated: validateCheckUserFollowingInput(input) };
}

export function listUserFollowers(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard11ReadsClient(input, "users.followers.list").listUserFollowers(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "users.followers.list", source: "connector", users: result.users };
    });
  }
  return { connector: "github", action: "users.followers.list", source: "connector", validated: validateListUserFollowersInput(input) };
}

export function listAuthenticatedUserFollowers(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard11ReadsClient(input, "user.followers.list").listAuthenticatedFollowers(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "user.followers.list", source: "connector", users: result.users };
    });
  }
  return { connector: "github", action: "user.followers.list", source: "connector", validated: validateListAuthenticatedFollowersInput(input) };
}

export function listUserSubscriptions(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard11ReadsClient(input, "users.subscriptions.list").listUserSubscriptions(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "users.subscriptions.list", source: "connector", repositories: result.repositories };
    });
  }
  return { connector: "github", action: "users.subscriptions.list", source: "connector", validated: validateListUserSubscriptionsInput(input) };
}

export function listAuthenticatedUserSubscriptions(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard11ReadsClient(input, "user.subscriptions.list").listAuthenticatedSubscriptions(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "user.subscriptions.list", source: "connector", repositories: result.repositories };
    });
  }
  return { connector: "github", action: "user.subscriptions.list", source: "connector", validated: validateListAuthenticatedSubscriptionsInput(input) };
}

export function listRepoStargazers(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard11ReadsClient(input, "repos.stargazers.list").listStargazers(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "repos.stargazers.list", source: "connector", users: result.users };
    });
  }
  return { connector: "github", action: "repos.stargazers.list", source: "connector", validated: validateListRepoStargazersInput(input) };
}

export function listUserFollowing(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard11ReadsClient(input, "users.following.list").listUserFollowing(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "users.following.list", source: "connector", users: result.users };
    });
  }
  return { connector: "github", action: "users.following.list", source: "connector", validated: validateListUserFollowingInput(input) };
}

export function listAuthenticatedUserFollowing(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard11ReadsClient(input, "user.following.list").listAuthenticatedFollowing(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "user.following.list", source: "connector", users: result.users };
    });
  }
  return { connector: "github", action: "user.following.list", source: "connector", validated: validateListAuthenticatedFollowingInput(input) };
}

export function listRepoSubscribers(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard11ReadsClient(input, "repos.subscribers.list").listSubscribers(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "repos.subscribers.list", source: "connector", users: result.users };
    });
  }
  return { connector: "github", action: "repos.subscribers.list", source: "connector", validated: validateListRepoSubscribersInput(input) };
}


function liveCard12Client(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createCard12ReadsClient({
    accessToken: input.accessToken as string,
    fetch: fetchFn,
    githubClient: createGitHubClient({ accessToken: input.accessToken as string, fetch: fetchFn, operation }),
  });
}

export function checkGistStar(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard12Client(input, "gists.star.check").checkGistStar(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "gists.star.check", source: "connector", starred: result.starred };
    });
  }
  return { connector: "github", action: "gists.star.check", source: "connector", validated: validateCheckGistStarInput(input) };
}

export function getGistComment(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard12Client(input, "gists.comments.get").getGistComment(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "gists.comments.get", source: "connector", comment: result.comment };
    });
  }
  return { connector: "github", action: "gists.comments.get", source: "connector", validated: validateGetGistCommentInput(input) };
}

export function getGistRevision(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard12Client(input, "gists.revision.get").getGistRevision(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "gists.revision.get", source: "connector", gist: result.gist };
    });
  }
  return { connector: "github", action: "gists.revision.get", source: "connector", validated: validateGetGistRevisionInput(input) };
}

export function listUserGists(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard12Client(input, "users.gists.list").listUserGists(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "users.gists.list", source: "connector", gists: result.gists };
    });
  }
  return { connector: "github", action: "users.gists.list", source: "connector", validated: validateListUserGistsInput(input) };
}

export function listGistComments(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard12Client(input, "gists.comments.list").listGistComments(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "gists.comments.list", source: "connector", comments: result.comments };
    });
  }
  return { connector: "github", action: "gists.comments.list", source: "connector", validated: validateListGistCommentsInput(input) };
}

export function listGistCommits(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard12Client(input, "gists.commits.list").listGistCommits(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "gists.commits.list", source: "connector", commits: result.commits };
    });
  }
  return { connector: "github", action: "gists.commits.list", source: "connector", validated: validateListGistCommitsInput(input) };
}

export function listGistForks(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard12Client(input, "gists.forks.list").listGistForks(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "gists.forks.list", source: "connector", forks: result.forks };
    });
  }
  return { connector: "github", action: "gists.forks.list", source: "connector", validated: validateListGistForksInput(input) };
}

export function listPublicGists(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard12Client(input, "gists.public.list").listPublicGists(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "gists.public.list", source: "connector", gists: result.gists };
    });
  }
  return { connector: "github", action: "gists.public.list", source: "connector", validated: validateListPublicGistsInput(input) };
}

export function listStarredGists(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard12Client(input, "gists.starred.list").listStarredGists(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "gists.starred.list", source: "connector", gists: result.gists };
    });
  }
  return { connector: "github", action: "gists.starred.list", source: "connector", validated: validateListStarredGistsInput(input) };
}

export function checkIssueAssignee(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard12Client(input, "issues.assignees.check").checkIssueAssignee(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "issues.assignees.check", source: "connector", assignable: result.assignable };
    });
  }
  return { connector: "github", action: "issues.assignees.check", source: "connector", validated: validateCheckIssueAssigneeInput(input) };
}

export function getIssueEvent(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard12Client(input, "issues.events.get").getIssueEvent(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "issues.events.get", source: "connector", event: result.event };
    });
  }
  return { connector: "github", action: "issues.events.get", source: "connector", validated: validateGetIssueEventInput(input) };
}

export function listAssignedIssues(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard12Client(input, "issues.assigned.list").listAssignedIssues(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "issues.assigned.list", source: "connector", issues: result.issues };
    });
  }
  return { connector: "github", action: "issues.assigned.list", source: "connector", validated: validateListAssignedIssuesInput(input) };
}

export function listRepoIssueComments(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard12Client(input, "repos.issues.comments.list").listRepoIssueComments(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "repos.issues.comments.list", source: "connector", comments: result.comments };
    });
  }
  return { connector: "github", action: "repos.issues.comments.list", source: "connector", validated: validateListRepoIssueCommentsInput(input) };
}

export function listRepoIssueEvents(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard12Client(input, "repos.issues.events.list").listRepoIssueEvents(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "repos.issues.events.list", source: "connector", events: result.events };
    });
  }
  return { connector: "github", action: "repos.issues.events.list", source: "connector", validated: validateListRepoIssueEventsInput(input) };
}

export function listMilestoneLabels(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard12Client(input, "milestones.labels.list").listMilestoneLabels(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "milestones.labels.list", source: "connector", labels: result.labels };
    });
  }
  return { connector: "github", action: "milestones.labels.list", source: "connector", validated: validateListMilestoneLabelsInput(input) };
}


// ─── card 13: team, permission, and timing reads ─────────────────────────────

function liveCard13Client(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createCard13ReadsClient({
    accessToken: input.accessToken as string,
    fetch: fetchFn,
    githubClient: createGitHubClient({ accessToken: input.accessToken as string, fetch: fetchFn, operation }),
  });
}

export function listIssueSubIssues(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard13Client(input, "issues.sub_issues.list").listSubIssues(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "issues.sub_issues.list", source: "connector", subIssues: result.subIssues };
    });
  }
  return { connector: "github", action: "issues.sub_issues.list", source: "connector", validated: validateListSubIssuesInput(input) };
}

export function getOrgTeamRepoPermission(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard13Client(input, "orgs.teams.repos.permission.get").getTeamRepoPermission(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.teams.repos.permission.get", source: "connector", permission: result.permission };
    });
  }
  return { connector: "github", action: "orgs.teams.repos.permission.get", source: "connector", validated: validateGetTeamRepoPermissionInput(input) };
}

export function getOrgTeam(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard13Client(input, "orgs.teams.get").getOrgTeam(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.teams.get", source: "connector", team: result.team };
    });
  }
  return { connector: "github", action: "orgs.teams.get", source: "connector", validated: validateGetOrgTeamInput(input) };
}

export function listOrgChildTeams(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard13Client(input, "orgs.teams.child.list").listChildTeams(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.teams.child.list", source: "connector", teams: result.teams };
    });
  }
  return { connector: "github", action: "orgs.teams.child.list", source: "connector", validated: validateListChildTeamsInput(input) };
}

export function listOrgTeamInvitations(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard13Client(input, "orgs.teams.invitations.list").listTeamInvitations(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.teams.invitations.list", source: "connector", invitations: result.invitations };
    });
  }
  return { connector: "github", action: "orgs.teams.invitations.list", source: "connector", validated: validateListTeamInvitationsInput(input) };
}

export function listRepoTeams(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard13Client(input, "repos.teams.list").listRepoTeams(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.teams.list", source: "connector", teams: result.teams };
    });
  }
  return { connector: "github", action: "repos.teams.list", source: "connector", validated: validateListRepoTeamsInput(input) };
}

export function listAuthenticatedUserTeams(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard13Client(input, "user.teams.list").listUserTeams(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "user.teams.list", source: "connector", teams: result.teams };
    });
  }
  return { connector: "github", action: "user.teams.list", source: "connector", validated: validateListUserTeamsInput(input) };
}

export function listOrgRoleTeams(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard13Client(input, "orgs.organization_roles.teams.list").listOrgRoleTeams(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.organization_roles.teams.list", source: "connector", teams: result.teams };
    });
  }
  return { connector: "github", action: "orgs.organization_roles.teams.list", source: "connector", validated: validateListOrgRoleTeamsInput(input) };
}

export function getOrgActionsWorkflowPermissions(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard13Client(input, "orgs.actions.permissions.workflow.get").getOrgWorkflowPermissions(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.actions.permissions.workflow.get", source: "connector", permissions: result.permissions };
    });
  }
  return { connector: "github", action: "orgs.actions.permissions.workflow.get", source: "connector", validated: validateGetOrgWorkflowPermissionsInput(input) };
}

export function getOrgActionsCacheUsage(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard13Client(input, "orgs.actions.cache.usage.get").getOrgCacheUsage(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.actions.cache.usage.get", source: "connector", usage: result.usage };
    });
  }
  return { connector: "github", action: "orgs.actions.cache.usage.get", source: "connector", validated: validateGetOrgCacheUsageInput(input) };
}

export function getRepoActionsCacheUsage(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard13Client(input, "repos.actions.cache.usage.get").getRepoCacheUsage(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.actions.cache.usage.get", source: "connector", usage: result.usage };
    });
  }
  return { connector: "github", action: "repos.actions.cache.usage.get", source: "connector", validated: validateGetRepoCacheUsageInput(input) };
}

export function getOrgActionsPermissions(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard13Client(input, "orgs.actions.permissions.get").getOrgActionsPermissions(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.actions.permissions.get", source: "connector", permissions: result.permissions };
    });
  }
  return { connector: "github", action: "orgs.actions.permissions.get", source: "connector", validated: validateGetOrgActionsPermissionsInput(input) };
}

export function getActionsRunTiming(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard13Client(input, "actions.runs.timing.get").getRunTiming(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "actions.runs.timing.get", source: "connector", timing: result.timing };
    });
  }
  return { connector: "github", action: "actions.runs.timing.get", source: "connector", validated: validateGetRunTimingInput(input) };
}

export function getActionsWorkflowTiming(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard13Client(input, "actions.workflows.timing.get").getWorkflowTiming(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "actions.workflows.timing.get", source: "connector", timing: result.timing };
    });
  }
  return { connector: "github", action: "actions.workflows.timing.get", source: "connector", validated: validateGetWorkflowTimingInput(input) };
}


// ─── card14-reads: zen, licenses, and gitignore templates ────────────────────

function liveCard14ReadsClient(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createCard14ReadsClient({
    accessToken: input.accessToken as string,
    fetch: fetchFn,
    githubClient: createGitHubClient({ accessToken: input.accessToken as string, fetch: fetchFn, operation }),
  });
}

// ─── card 16: pages, code-scanning, and advisory reads ───────────────────────

function liveCard16Client(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createCard16ReadsClient({
    accessToken: input.accessToken as string,
    fetch: fetchFn,
    githubClient: createGitHubClient({ accessToken: input.accessToken as string, fetch: fetchFn, operation }),
  });
}

export function getZen(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard14ReadsClient(input, "meta.zen.get").getZen(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "meta.zen.get", source: "connector", text: result.text };
    });
  }
  return { connector: "github", action: "meta.zen.get", source: "connector", validated: validateGetZenInput(input) };
}

export function getLicense(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard14ReadsClient(input, "licenses.get").getLicense(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "licenses.get", source: "connector", license: result.license };
    });
  }
  return { connector: "github", action: "licenses.get", source: "connector", validated: validateGetLicenseInput(input) };
}

export function getGitignoreTemplate(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard14ReadsClient(input, "gitignore.templates.get").getGitignoreTemplate(input).then((result) => {
      if (!result.ok) throwVariable(result);
      return { connector: "github", action: "gitignore.templates.get", source: "connector", template: result.template };
    });
  }
  return { connector: "github", action: "gitignore.templates.get", source: "connector", validated: validateGetGitignoreTemplateInput(input) };
}

export function getRepoPagesBuild(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard16Client(input, "repos.pages.builds.get").getPagesBuild(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.pages.builds.get", source: "connector", build: result.build };
    });
  }
  return { connector: "github", action: "repos.pages.builds.get", source: "connector", validated: validateGetPagesBuildInput(input) };
}

export function getLatestRepoPagesBuild(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard16Client(input, "repos.pages.builds.latest.get").getLatestPagesBuild(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.pages.builds.latest.get", source: "connector", build: result.build };
    });
  }
  return { connector: "github", action: "repos.pages.builds.latest.get", source: "connector", validated: validateGetLatestPagesBuildInput(input) };
}

export function getRepoPagesDeployment(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard16Client(input, "repos.pages.deployments.get").getPagesDeployment(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.pages.deployments.get", source: "connector", deployment: result.deployment };
    });
  }
  return { connector: "github", action: "repos.pages.deployments.get", source: "connector", validated: validateGetPagesDeploymentInput(input) };
}

export function listRepoPagesBuilds(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard16Client(input, "repos.pages.builds.list").listPagesBuilds(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.pages.builds.list", source: "connector", builds: result.builds };
    });
  }
  return { connector: "github", action: "repos.pages.builds.list", source: "connector", validated: validateListPagesBuildsInput(input) };
}

export function getCodeScanningSarif(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard16Client(input, "code_scanning.sarifs.get").getSarifUpload(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "code_scanning.sarifs.get", source: "connector", sarif: result.sarif };
    });
  }
  return { connector: "github", action: "code_scanning.sarifs.get", source: "connector", validated: validateGetSarifUploadInput(input) };
}

export function listCodeqlDatabases(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard16Client(input, "code_scanning.codeql.databases.list").listCodeqlDatabases(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "code_scanning.codeql.databases.list", source: "connector", databases: result.databases };
    });
  }
  return { connector: "github", action: "code_scanning.codeql.databases.list", source: "connector", validated: validateListCodeqlDatabasesInput(input) };
}

export function listOrgCodeScanningAlerts(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard16Client(input, "orgs.code_scanning.alerts.list").listOrgCodeScanningAlerts(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.code_scanning.alerts.list", source: "connector", alerts: result.alerts };
    });
  }
  return { connector: "github", action: "orgs.code_scanning.alerts.list", source: "connector", validated: validateListOrgCodeScanningAlertsInput(input) };
}

export function getGlobalAdvisory(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard16Client(input, "advisories.get").getGlobalAdvisory(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "advisories.get", source: "connector", advisory: result.advisory };
    });
  }
  return { connector: "github", action: "advisories.get", source: "connector", validated: validateGetGlobalAdvisoryInput(input) };
}

export function listGlobalAdvisories(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard16Client(input, "advisories.list").listGlobalAdvisories(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "advisories.list", source: "connector", advisories: result.advisories };
    });
  }
  return { connector: "github", action: "advisories.list", source: "connector", validated: validateListGlobalAdvisoriesInput(input) };
}

function liveCard15Client(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createCard15ReadsClient({
    accessToken: input.accessToken as string,
    fetch: fetchFn,
    githubClient: createGitHubClient({ accessToken: input.accessToken as string, fetch: fetchFn, operation }),
  });
}

export function getEmojis(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard15Client(input, "emojis.get").getEmojis(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "emojis.get", source: "connector", emojis: result.emojis };
    });
  }
  return { connector: "github", action: "emojis.get", source: "connector", validated: validateGetEmojisInput(input) };
}

export function getFeeds(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard15Client(input, "feeds.get").getFeeds(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "feeds.get", source: "connector", feeds: result.feeds };
    });
  }
  return { connector: "github", action: "feeds.get", source: "connector", validated: validateGetFeedsInput(input) };
}

export function getMeta(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard15Client(input, "meta.get").getMeta(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "meta.get", source: "connector", meta: result.meta };
    });
  }
  return { connector: "github", action: "meta.get", source: "connector", validated: validateGetMetaInput(input) };
}

export function listMetaVersions(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard15Client(input, "meta.versions.list").listMetaVersions(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "meta.versions.list", source: "connector", versions: result.versions };
    });
  }
  return { connector: "github", action: "meta.versions.list", source: "connector", validated: validateListMetaVersionsInput(input) };
}

export function getOctocat(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard15Client(input, "meta.octocat.get").getOctocat(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "meta.octocat.get", source: "connector", octocat: result.octocat };
    });
  }
  return { connector: "github", action: "meta.octocat.get", source: "connector", validated: validateGetOctocatInput(input) };
}

// ─── card 17: rate limit, repository comments, and repository keys ───────────

function liveCard17Client(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createCard17ReadsClient({
    accessToken: input.accessToken as string,
    fetch: fetchFn,
    githubClient: createGitHubClient({ accessToken: input.accessToken as string, fetch: fetchFn, operation }),
  });
}

export function getRateLimit(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard17Client(input, "rate_limit.get").getRateLimit(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "rate_limit.get", source: "connector", rateLimit: result.rateLimit };
    });
  }
  return { connector: "github", action: "rate_limit.get", source: "connector", validated: validateGetRateLimitInput(input) };
}

export function listRepoComments(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard17Client(input, "repos.comments.list").listRepoComments(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.comments.list", source: "connector", comments: result.comments };
    });
  }
  return { connector: "github", action: "repos.comments.list", source: "connector", validated: validateListRepoCommentsInput(input) };
}

export function getRepoKey(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard17Client(input, "repos.keys.get").getRepoKey(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.keys.get", source: "connector", key: result.key };
    });
  }
  return { connector: "github", action: "repos.keys.get", source: "connector", validated: validateGetRepoKeyInput(input) };
}

export function listRepoKeys(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard17Client(input, "repos.keys.list").listRepoKeys(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.keys.list", source: "connector", keys: result.keys };
    });
  }
  return { connector: "github", action: "repos.keys.list", source: "connector", validated: validateListRepoKeysInput(input) };
}

// ─── card 18: repository pull review comments ────────────────────────────────

function liveCard18Client(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createCard18ReadsClient({
    accessToken: input.accessToken as string,
    fetch: fetchFn,
    githubClient: createGitHubClient({ accessToken: input.accessToken as string, fetch: fetchFn, operation }),
  });
}

export function listRepoPullComments(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard18Client(input, "repos.pulls.comments.list").listRepoPullComments(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.pulls.comments.list", source: "connector", comments: result.comments };
    });
  }
  return { connector: "github", action: "repos.pulls.comments.list", source: "connector", validated: validateListRepoPullCommentsInput(input) };
}


// ─── card 19: root, sbom, pages, and project reads ───────────────────────────

function liveCard19Client(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createCard19ReadsClient({
    accessToken: input.accessToken as string,
    fetch: fetchFn,
    githubClient: createGitHubClient({ accessToken: input.accessToken as string, fetch: fetchFn, operation }),
  });
}

export function getMetaRoot(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard19Client(input, "meta.root.get").getMetaRoot(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "meta.root.get", source: "connector", root: result.root };
    });
  }
  return { connector: "github", action: "meta.root.get", source: "connector", validated: validateGetMetaRootInput(input) };
}

export function getRepoDependencyGraphSbom(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard19Client(input, "repos.dependency_graph.sbom.get").getRepoDependencyGraphSbom(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.dependency_graph.sbom.get", source: "connector", sbom: result.sbom };
    });
  }
  return { connector: "github", action: "repos.dependency_graph.sbom.get", source: "connector", validated: validateGetRepoDependencyGraphSbomInput(input) };
}

export function getCodeqlDatabase(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard19Client(input, "code_scanning.codeql.databases.get").getCodeqlDatabase(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "code_scanning.codeql.databases.get", source: "connector", downloadUrl: result.downloadUrl };
    });
  }
  return { connector: "github", action: "code_scanning.codeql.databases.get", source: "connector", validated: validateGetCodeqlDatabaseInput(input) };
}

export function getCodeScanningDefaultSetup(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard19Client(input, "code_scanning.default_setup.get").getCodeScanningDefaultSetup(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "code_scanning.default_setup.get", source: "connector", setup: result.setup };
    });
  }
  return { connector: "github", action: "code_scanning.default_setup.get", source: "connector", validated: validateGetCodeScanningDefaultSetupInput(input) };
}

export function getOrgPropertySchema(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard19Client(input, "orgs.properties.schema.get").getOrgPropertySchema(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.properties.schema.get", source: "connector", property: result.property };
    });
  }
  return { connector: "github", action: "orgs.properties.schema.get", source: "connector", validated: validateGetOrgPropertySchemaInput(input) };
}

export function getOrgProjectItem(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard19Client(input, "orgs.projects_v2.items.get").getOrgProjectItem(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.projects_v2.items.get", source: "connector", item: result.item };
    });
  }
  return { connector: "github", action: "orgs.projects_v2.items.get", source: "connector", validated: validateGetOrgProjectItemInput(input) };
}

export function getRepoPagesHealth(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard19Client(input, "repos.pages.health.get").getRepoPagesHealth(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.pages.health.get", source: "connector", health: result.health };
    });
  }
  return { connector: "github", action: "repos.pages.health.get", source: "connector", validated: validateGetRepoPagesHealthInput(input) };
}

export function getRepoPages(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard19Client(input, "repos.pages.get").getRepoPages(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.pages.get", source: "connector", pages: result.pages };
    });
  }
  return { connector: "github", action: "repos.pages.get", source: "connector", validated: validateGetRepoPagesInput(input) };
}

export function getUserProjectItem(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard19Client(input, "users.projects_v2.items.get").getUserProjectItem(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "users.projects_v2.items.get", source: "connector", item: result.item };
    });
  }
  return { connector: "github", action: "users.projects_v2.items.get", source: "connector", validated: validateGetUserProjectItemInput(input) };
}

export function listRepoIssueTypes(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard19Client(input, "repos.issue_types.list").listRepoIssueTypes(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.issue_types.list", source: "connector", issueTypes: result.issueTypes };
    });
  }
  return { connector: "github", action: "repos.issue_types.list", source: "connector", validated: validateListRepoIssueTypesInput(input) };
}

export function listOrgProjects(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard19Client(input, "orgs.projects_v2.list").listOrgProjects(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.projects_v2.list", source: "connector", projects: result.projects };
    });
  }
  return { connector: "github", action: "orgs.projects_v2.list", source: "connector", validated: validateListOrgProjectsInput(input) };
}

export function listUserProjectItems(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard19Client(input, "users.projects_v2.items.list").listUserProjectItems(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "users.projects_v2.items.list", source: "connector", items: result.items };
    });
  }
  return { connector: "github", action: "users.projects_v2.items.list", source: "connector", validated: validateListUserProjectItemsInput(input) };
}

export function listUserProjectViewItems(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard19Client(input, "users.projects_v2.views.items.list").listUserProjectViewItems(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "users.projects_v2.views.items.list", source: "connector", items: result.items };
    });
  }
  return { connector: "github", action: "users.projects_v2.views.items.list", source: "connector", validated: validateListUserProjectViewItemsInput(input) };
}

export function listUserProjects(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCard19Client(input, "users.projects_v2.list").listUserProjects(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "users.projects_v2.list", source: "connector", projects: result.projects };
    });
  }
  return { connector: "github", action: "users.projects_v2.list", source: "connector", validated: validateListUserProjectsInput(input) };
}

// ─── write card 1: organization writes ───────────────────────────────────────

function liveWriteCard1Client(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createWriteCard1Client({
    accessToken: input.accessToken as string,
    fetch: fetchFn,
    githubClient: createGitHubClient({ accessToken: input.accessToken as string, fetch: fetchFn, operation }),
  });
}

export function assignOrgRoleToUser(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard1Client(input, "orgs.organization_roles.users.assign").assignOrgRole(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.organization_roles.users.assign", source: "connector", assigned: result.assigned, org: result.org, username: result.username, roleId: result.roleId };
    });
  }
  return { connector: "github", action: "orgs.organization_roles.users.assign", source: "connector", validated: validateAssignOrgRoleInput(input) };
}

export function blockOrgUser(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard1Client(input, "orgs.blocks.block").blockOrgUser(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.blocks.block", source: "connector", blocked: result.blocked, org: result.org, username: result.username };
    });
  }
  return { connector: "github", action: "orgs.blocks.block", source: "connector", validated: validateBlockOrgUserInput(input) };
}

export function deleteOrg(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard1Client(input, "orgs.delete").deleteOrg(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.delete", source: "connector", deleted: result.deleted, org: result.org };
    });
  }
  return { connector: "github", action: "orgs.delete", source: "connector", validated: validateDeleteOrgInput(input) };
}

export function removeAllOrgRolesFromUser(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard1Client(input, "orgs.organization_roles.users.remove_all").removeAllOrgRoles(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.organization_roles.users.remove_all", source: "connector", removed: result.removed, org: result.org, username: result.username };
    });
  }
  return { connector: "github", action: "orgs.organization_roles.users.remove_all", source: "connector", validated: validateRemoveAllOrgRolesInput(input) };
}

export function removeOrgMember(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard1Client(input, "orgs.members.remove").removeOrgMember(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.members.remove", source: "connector", removed: result.removed, org: result.org, username: result.username };
    });
  }
  return { connector: "github", action: "orgs.members.remove", source: "connector", validated: validateRemoveOrgMemberInput(input) };
}

export function removeOrgRoleFromUser(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard1Client(input, "orgs.organization_roles.users.remove").removeOrgRole(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.organization_roles.users.remove", source: "connector", removed: result.removed, org: result.org, username: result.username, roleId: result.roleId };
    });
  }
  return { connector: "github", action: "orgs.organization_roles.users.remove", source: "connector", validated: validateRemoveOrgRoleInput(input) };
}

export function deleteOrgPropertySchema(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard1Client(input, "orgs.properties.schema.delete").deleteOrgPropertySchema(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.properties.schema.delete", source: "connector", deleted: result.deleted, org: result.org, customPropertyName: result.customPropertyName };
    });
  }
  return { connector: "github", action: "orgs.properties.schema.delete", source: "connector", validated: validateDeleteOrgPropertySchemaInput(input) };
}

export function deleteOrgInteractionLimits(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard1Client(input, "orgs.interaction_limits.delete").deleteOrgInteractionLimits(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.interaction_limits.delete", source: "connector", deleted: result.deleted, org: result.org };
    });
  }
  return { connector: "github", action: "orgs.interaction_limits.delete", source: "connector", validated: validateDeleteOrgInteractionLimitsInput(input) };
}

export function removeOutsideCollaborator(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard1Client(input, "orgs.outside_collaborators.remove").removeOutsideCollaborator(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.outside_collaborators.remove", source: "connector", removed: result.removed, org: result.org, username: result.username };
    });
  }
  return { connector: "github", action: "orgs.outside_collaborators.remove", source: "connector", validated: validateRemoveOutsideCollaboratorInput(input) };
}

export function setOrgInteractionLimits(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard1Client(input, "orgs.interaction_limits.set").setOrgInteractionLimits(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.interaction_limits.set", source: "connector", limits: result.limits };
    });
  }
  return { connector: "github", action: "orgs.interaction_limits.set", source: "connector", validated: validateSetOrgInteractionLimitsInput(input) };
}

export function unblockOrgUser(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard1Client(input, "orgs.blocks.unblock").unblockOrgUser(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.blocks.unblock", source: "connector", unblocked: result.unblocked, org: result.org, username: result.username };
    });
  }
  return { connector: "github", action: "orgs.blocks.unblock", source: "connector", validated: validateUnblockOrgUserInput(input) };
}

export function unlockOrgMigrationRepo(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard1Client(input, "orgs.migrations.repos.unlock").unlockOrgMigrationRepo(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.migrations.repos.unlock", source: "connector", unlocked: result.unlocked, org: result.org, migrationId: result.migrationId, repoName: result.repoName };
    });
  }
  return { connector: "github", action: "orgs.migrations.repos.unlock", source: "connector", validated: validateUnlockOrgMigrationRepoInput(input) };
}

export function updateOrg(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard1Client(input, "orgs.update").updateOrg(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.update", source: "connector", organization: result.organization };
    });
  }
  return { connector: "github", action: "orgs.update", source: "connector", validated: validateUpdateOrgInput(input) };
}

// ─── write card 2: repository writes ─────────────────────────────────────────

function liveWriteCard2Client(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createWriteCard2Client({
    accessToken: input.accessToken as string,
    fetch: fetchFn,
    githubClient: createGitHubClient({ accessToken: input.accessToken as string, fetch: fetchFn, operation }),
  });
}

export function acceptRepositoryInvitation(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard2Client(input, "user.repository_invitations.accept").acceptRepositoryInvitation(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "user.repository_invitations.accept", source: "connector", accepted: result.accepted, invitationId: result.invitationId };
    });
  }
  return { connector: "github", action: "user.repository_invitations.accept", source: "connector", validated: validateAcceptRepositoryInvitationInput(input) };
}

export function createRepoAutolink(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard2Client(input, "repos.autolinks.create").createAutolink(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.autolinks.create", source: "connector", autolink: result.autolink };
    });
  }
  return { connector: "github", action: "repos.autolinks.create", source: "connector", validated: validateCreateAutolinkInput(input) };
}

export function generateRepoFromTemplate(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard2Client(input, "repos.generate").generateRepo(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.generate", source: "connector", repository: result.repository };
    });
  }
  return { connector: "github", action: "repos.generate", source: "connector", validated: validateGenerateRepoInput(input) };
}

export function createDependencySnapshot(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard2Client(input, "repos.dependency_graph.snapshots.create").createDependencySnapshot(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.dependency_graph.snapshots.create", source: "connector", snapshot: result.snapshot };
    });
  }
  return { connector: "github", action: "repos.dependency_graph.snapshots.create", source: "connector", validated: validateCreateDependencySnapshotInput(input) };
}

export function declineRepositoryInvitation(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard2Client(input, "user.repository_invitations.decline").declineRepositoryInvitation(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "user.repository_invitations.decline", source: "connector", declined: result.declined, invitationId: result.invitationId };
    });
  }
  return { connector: "github", action: "user.repository_invitations.decline", source: "connector", validated: validateDeclineRepositoryInvitationInput(input) };
}

export function deleteRepo(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard2Client(input, "repos.delete").deleteRepo(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.delete", source: "connector", deleted: result.deleted, owner: result.owner, repo: result.repo };
    });
  }
  return { connector: "github", action: "repos.delete", source: "connector", validated: validateDeleteRepoInput(input) };
}

export function deleteRepoInvitation(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard2Client(input, "repos.invitations.delete").deleteRepoInvitation(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.invitations.delete", source: "connector", deleted: result.deleted, owner: result.owner, repo: result.repo, invitationId: result.invitationId };
    });
  }
  return { connector: "github", action: "repos.invitations.delete", source: "connector", validated: validateDeleteRepoInvitationInput(input) };
}

export function deleteRepoSubscription(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard2Client(input, "repos.subscription.delete").deleteRepoSubscription(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.subscription.delete", source: "connector", deleted: result.deleted, owner: result.owner, repo: result.repo };
    });
  }
  return { connector: "github", action: "repos.subscription.delete", source: "connector", validated: validateDeleteRepoSubscriptionInput(input) };
}

export function markRepoNotificationsRead(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard2Client(input, "repos.notifications.mark_read").markRepoNotificationsRead(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.notifications.mark_read", source: "connector", marked: result.marked, owner: result.owner, repo: result.repo, status: result.status };
    });
  }
  return { connector: "github", action: "repos.notifications.mark_read", source: "connector", validated: validateMarkRepoNotificationsInput(input) };
}

export function deleteRepoInteractionLimits(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard2Client(input, "repos.interaction_limits.delete").deleteRepoInteractionLimits(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.interaction_limits.delete", source: "connector", deleted: result.deleted, owner: result.owner, repo: result.repo };
    });
  }
  return { connector: "github", action: "repos.interaction_limits.delete", source: "connector", validated: validateDeleteRepoInteractionLimitsInput(input) };
}

export function transferRepo(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard2Client(input, "repos.transfer").transferRepo(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.transfer", source: "connector", repository: result.repository };
    });
  }
  return { connector: "github", action: "repos.transfer", source: "connector", validated: validateTransferRepoInput(input) };
}

export function updateRepoInvitation(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard2Client(input, "repos.invitations.update").updateRepoInvitation(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.invitations.update", source: "connector", invitation: result.invitation };
    });
  }
  return { connector: "github", action: "repos.invitations.update", source: "connector", validated: validateUpdateRepoInvitationInput(input) };
}

export function updateCheckSuitePreferences(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard2Client(input, "repos.check_suites.preferences.update").updateCheckSuitePreferences(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.check_suites.preferences.update", source: "connector", preferences: result.preferences };
    });
  }
  return { connector: "github", action: "repos.check_suites.preferences.update", source: "connector", validated: validateUpdateCheckSuitePreferencesInput(input) };
}

export function replaceRepoTopics(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard2Client(input, "repos.topics.replace").replaceTopics(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.topics.replace", source: "connector", topics: result.topics };
    });
  }
  return { connector: "github", action: "repos.topics.replace", source: "connector", validated: validateReplaceTopicsInput(input) };
}

export function setRepoSubscription(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard2Client(input, "repos.subscription.set").setRepoSubscription(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.subscription.set", source: "connector", subscription: result.subscription };
    });
  }
  return { connector: "github", action: "repos.subscription.set", source: "connector", validated: validateSetRepoSubscriptionInput(input) };
}

export function setRepoInteractionLimits(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard2Client(input, "repos.interaction_limits.set").setRepoInteractionLimits(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.interaction_limits.set", source: "connector", limits: result.limits };
    });
  }
  return { connector: "github", action: "repos.interaction_limits.set", source: "connector", validated: validateSetRepoInteractionLimitsInput(input) };
}

// ─── write card 3: user writes ───────────────────────────────────────────────

function liveWriteCard3Client(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createWriteCard3Client({
    accessToken: input.accessToken as string,
    fetch: fetchFn,
    githubClient: createGitHubClient({ accessToken: input.accessToken as string, fetch: fetchFn, operation }),
  });
}

export function addUserEmails(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard3Client(input, "user.emails.create").addEmails(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "user.emails.create", source: "connector", emails: result.emails };
    });
  }
  return { connector: "github", action: "user.emails.create", source: "connector", validated: validateAddEmailsInput(input) };
}

export function addUserSocialAccounts(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard3Client(input, "user.social_accounts.add").addSocialAccounts(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "user.social_accounts.add", source: "connector", accounts: result.accounts };
    });
  }
  return { connector: "github", action: "user.social_accounts.add", source: "connector", validated: validateAddSocialAccountsInput(input) };
}

export function blockUser(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard3Client(input, "user.blocks.block").blockUser(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "user.blocks.block", source: "connector", blocked: result.blocked, username: result.username };
    });
  }
  return { connector: "github", action: "user.blocks.block", source: "connector", validated: validateBlockUserInput(input) };
}

export function addCodespaceSecretRepository(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard3Client(input, "user.codespaces.secrets.repositories.add").addCodespaceSecretRepository(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "user.codespaces.secrets.repositories.add", source: "connector", added: result.added, secretName: result.secretName, repositoryId: result.repositoryId };
    });
  }
  return { connector: "github", action: "user.codespaces.secrets.repositories.add", source: "connector", validated: validateAddCodespaceSecretRepositoryInput(input) };
}

export function upsertEnvironmentSecret(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard3Client(input, "repos.environments.secrets.create_or_update").upsertEnvironmentSecret(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.environments.secrets.create_or_update", source: "connector", upserted: result.upserted, created: result.created, status: result.status, owner: result.owner, repo: result.repo, environmentName: result.environmentName, secretName: result.secretName };
    });
  }
  return { connector: "github", action: "repos.environments.secrets.create_or_update", source: "connector", validated: validateUpsertEnvironmentSecretInput(input) };
}

export function upsertCodespaceSecret(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard3Client(input, "user.codespaces.secrets.create_or_update").upsertCodespaceSecret(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "user.codespaces.secrets.create_or_update", source: "connector", upserted: result.upserted, created: result.created, status: result.status, secretName: result.secretName };
    });
  }
  return { connector: "github", action: "user.codespaces.secrets.create_or_update", source: "connector", validated: validateUpsertCodespaceSecretInput(input) };
}

export function deleteUserSocialAccounts(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard3Client(input, "user.social_accounts.delete").deleteSocialAccounts(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "user.social_accounts.delete", source: "connector", deleted: result.deleted };
    });
  }
  return { connector: "github", action: "user.social_accounts.delete", source: "connector", validated: validateDeleteSocialAccountsInput(input) };
}

export function unblockUser(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard3Client(input, "user.blocks.unblock").unblockUser(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "user.blocks.unblock", source: "connector", unblocked: result.unblocked, username: result.username };
    });
  }
  return { connector: "github", action: "user.blocks.unblock", source: "connector", validated: validateUnblockUserInput(input) };
}

export function unlockUserMigrationRepo(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard3Client(input, "user.migrations.repos.unlock").unlockUserMigrationRepo(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "user.migrations.repos.unlock", source: "connector", unlocked: result.unlocked, migrationId: result.migrationId, repoName: result.repoName };
    });
  }
  return { connector: "github", action: "user.migrations.repos.unlock", source: "connector", validated: validateUnlockUserMigrationRepoInput(input) };
}

export function deleteCodespaceSecret(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard3Client(input, "user.codespaces.secrets.delete").deleteCodespaceSecret(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "user.codespaces.secrets.delete", source: "connector", deleted: result.deleted, secretName: result.secretName };
    });
  }
  return { connector: "github", action: "user.codespaces.secrets.delete", source: "connector", validated: validateDeleteCodespaceSecretInput(input) };
}

export function deleteEnvironmentSecret(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard3Client(input, "repos.environments.secrets.delete").deleteEnvironmentSecret(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.environments.secrets.delete", source: "connector", deleted: result.deleted, owner: result.owner, repo: result.repo, environmentName: result.environmentName, secretName: result.secretName };
    });
  }
  return { connector: "github", action: "repos.environments.secrets.delete", source: "connector", validated: validateDeleteEnvironmentSecretInput(input) };
}

export function updateAuthenticatedUser(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard3Client(input, "user.update").updateAuthenticatedUser(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "user.update", source: "connector", user: result.user };
    });
  }
  return { connector: "github", action: "user.update", source: "connector", validated: validateUpdateAuthenticatedUserInput(input) };
}

// ─── write card 4: branch protection writes ──────────────────────────────────

function liveWriteCard4Client(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createWriteCard4Client({
    accessToken: input.accessToken as string,
    fetch: fetchFn,
    githubClient: createGitHubClient({ accessToken: input.accessToken as string, fetch: fetchFn, operation }),
  });
}

export function removeCodespaceSecretRepository(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard4Client(input, "user.codespaces.secrets.repositories.remove").removeCodespaceSecretRepository(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "user.codespaces.secrets.repositories.remove", source: "connector", removed: result.removed, secretName: result.secretName, repositoryId: result.repositoryId };
    });
  }
  return { connector: "github", action: "user.codespaces.secrets.repositories.remove", source: "connector", validated: validateRemoveCodespaceSecretRepositoryInput(input) };
}

export function setCodespaceSecretRepositories(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard4Client(input, "user.codespaces.secrets.repositories.set").setCodespaceSecretRepositories(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "user.codespaces.secrets.repositories.set", source: "connector", set: result.set, secretName: result.secretName, selectedRepositoryIds: result.selectedRepositoryIds };
    });
  }
  return { connector: "github", action: "user.codespaces.secrets.repositories.set", source: "connector", validated: validateSetCodespaceSecretRepositoriesInput(input) };
}

export function addBranchProtectionRestrictionApps(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard4Client(input, "branches.protection.restrictions.apps.add").addRestrictionApps(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "branches.protection.restrictions.apps.add", source: "connector", apps: result.apps };
    });
  }
  return { connector: "github", action: "branches.protection.restrictions.apps.add", source: "connector", validated: validateAddRestrictionAppsInput(input) };
}

export function addBranchProtectionStatusCheckContexts(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard4Client(input, "branches.protection.required_status_checks.contexts.add").addStatusCheckContexts(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "branches.protection.required_status_checks.contexts.add", source: "connector", contexts: result.contexts };
    });
  }
  return { connector: "github", action: "branches.protection.required_status_checks.contexts.add", source: "connector", validated: validateAddStatusCheckContextsInput(input) };
}

export function addBranchProtectionRestrictionTeams(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard4Client(input, "branches.protection.restrictions.teams.add").addRestrictionTeams(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "branches.protection.restrictions.teams.add", source: "connector", teams: result.teams };
    });
  }
  return { connector: "github", action: "branches.protection.restrictions.teams.add", source: "connector", validated: validateAddRestrictionTeamsInput(input) };
}

export function addBranchProtectionRestrictionUsers(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard4Client(input, "branches.protection.restrictions.users.add").addRestrictionUsers(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "branches.protection.restrictions.users.add", source: "connector", users: result.users };
    });
  }
  return { connector: "github", action: "branches.protection.restrictions.users.add", source: "connector", validated: validateAddRestrictionUsersInput(input) };
}

export function createBranchProtectionRequiredSignatures(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard4Client(input, "branches.protection.required_signatures.create").createRequiredSignatures(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "branches.protection.required_signatures.create", source: "connector", protection: result.protection };
    });
  }
  return { connector: "github", action: "branches.protection.required_signatures.create", source: "connector", validated: validateCreateRequiredSignaturesInput(input) };
}

export function deleteBranchProtectionRestrictions(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard4Client(input, "branches.protection.restrictions.delete").deleteRestrictions(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "branches.protection.restrictions.delete", source: "connector", deleted: result.deleted, owner: result.owner, repo: result.repo, branch: result.branch };
    });
  }
  return { connector: "github", action: "branches.protection.restrictions.delete", source: "connector", validated: validateDeleteRestrictionsInput(input) };
}

export function deleteBranchProtectionEnforceAdmins(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard4Client(input, "branches.protection.enforce_admins.delete").deleteEnforceAdmins(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "branches.protection.enforce_admins.delete", source: "connector", deleted: result.deleted, owner: result.owner, repo: result.repo, branch: result.branch };
    });
  }
  return { connector: "github", action: "branches.protection.enforce_admins.delete", source: "connector", validated: validateDeleteEnforceAdminsInput(input) };
}

export function deleteBranchProtection(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard4Client(input, "branches.protection.delete").deleteBranchProtection(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "branches.protection.delete", source: "connector", deleted: result.deleted, owner: result.owner, repo: result.repo, branch: result.branch };
    });
  }
  return { connector: "github", action: "branches.protection.delete", source: "connector", validated: validateDeleteBranchProtectionInput(input) };
}

export function deleteBranchProtectionRequiredSignatures(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard4Client(input, "branches.protection.required_signatures.delete").deleteRequiredSignatures(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "branches.protection.required_signatures.delete", source: "connector", deleted: result.deleted, owner: result.owner, repo: result.repo, branch: result.branch };
    });
  }
  return { connector: "github", action: "branches.protection.required_signatures.delete", source: "connector", validated: validateDeleteRequiredSignaturesInput(input) };
}

export function deleteBranchProtectionRequiredPullRequestReviews(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard4Client(input, "branches.protection.required_pull_request_reviews.delete").deleteRequiredPullRequestReviews(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "branches.protection.required_pull_request_reviews.delete", source: "connector", deleted: result.deleted, owner: result.owner, repo: result.repo, branch: result.branch };
    });
  }
  return { connector: "github", action: "branches.protection.required_pull_request_reviews.delete", source: "connector", validated: validateDeleteRequiredPullRequestReviewsInput(input) };
}

// ─── write card 5: branch protection writes ──────────────────────────────────

function liveWriteCard5Client(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createWriteCard5Client({
    accessToken: input.accessToken as string,
    fetch: fetchFn,
    githubClient: createGitHubClient({ accessToken: input.accessToken as string, fetch: fetchFn, operation }),
  });
}

export function deleteEnvironmentDeploymentProtectionRule(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard5Client(input, "repos.environments.deployment_protection_rules.delete").deleteDeploymentProtectionRule(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.environments.deployment_protection_rules.delete", source: "connector", deleted: result.deleted, owner: result.owner, repo: result.repo, environmentName: result.environmentName, protectionRuleId: result.protectionRuleId };
    });
  }
  return { connector: "github", action: "repos.environments.deployment_protection_rules.delete", source: "connector", validated: validateDeleteDeploymentProtectionRuleInput(input) };
}

export function removeBranchProtectionRestrictionApps(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard5Client(input, "branches.protection.restrictions.apps.delete").removeRestrictionApps(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "branches.protection.restrictions.apps.delete", source: "connector", apps: result.apps };
    });
  }
  return { connector: "github", action: "branches.protection.restrictions.apps.delete", source: "connector", validated: validateRemoveRestrictionAppsInput(input) };
}

export function removeBranchProtectionStatusCheckContexts(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard5Client(input, "branches.protection.required_status_checks.contexts.delete").removeStatusCheckContexts(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "branches.protection.required_status_checks.contexts.delete", source: "connector", contexts: result.contexts };
    });
  }
  return { connector: "github", action: "branches.protection.required_status_checks.contexts.delete", source: "connector", validated: validateRemoveStatusCheckContextsInput(input) };
}

export function deleteBranchProtectionRequiredStatusChecks(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard5Client(input, "branches.protection.required_status_checks.delete").deleteRequiredStatusChecks(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "branches.protection.required_status_checks.delete", source: "connector", deleted: result.deleted, owner: result.owner, repo: result.repo, branch: result.branch };
    });
  }
  return { connector: "github", action: "branches.protection.required_status_checks.delete", source: "connector", validated: validateDeleteRequiredStatusChecksInput(input) };
}

export function removeBranchProtectionRestrictionTeams(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard5Client(input, "branches.protection.restrictions.teams.delete").removeRestrictionTeams(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "branches.protection.restrictions.teams.delete", source: "connector", teams: result.teams };
    });
  }
  return { connector: "github", action: "branches.protection.restrictions.teams.delete", source: "connector", validated: validateRemoveRestrictionTeamsInput(input) };
}

export function removeBranchProtectionRestrictionUsers(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard5Client(input, "branches.protection.restrictions.users.delete").removeRestrictionUsers(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "branches.protection.restrictions.users.delete", source: "connector", users: result.users };
    });
  }
  return { connector: "github", action: "branches.protection.restrictions.users.delete", source: "connector", validated: validateRemoveRestrictionUsersInput(input) };
}

export function createBranchProtectionEnforceAdmins(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard5Client(input, "branches.protection.enforce_admins.create").createEnforceAdmins(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "branches.protection.enforce_admins.create", source: "connector", protection: result.protection };
    });
  }
  return { connector: "github", action: "branches.protection.enforce_admins.create", source: "connector", validated: validateCreateEnforceAdminsInput(input) };
}

export function setBranchProtectionRestrictionApps(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard5Client(input, "branches.protection.restrictions.apps.set").setRestrictionApps(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "branches.protection.restrictions.apps.set", source: "connector", apps: result.apps };
    });
  }
  return { connector: "github", action: "branches.protection.restrictions.apps.set", source: "connector", validated: validateSetRestrictionAppsInput(input) };
}

export function setBranchProtectionStatusCheckContexts(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard5Client(input, "branches.protection.required_status_checks.contexts.set").setStatusCheckContexts(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "branches.protection.required_status_checks.contexts.set", source: "connector", contexts: result.contexts };
    });
  }
  return { connector: "github", action: "branches.protection.required_status_checks.contexts.set", source: "connector", validated: validateSetStatusCheckContextsInput(input) };
}

export function setBranchProtectionRestrictionTeams(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard5Client(input, "branches.protection.restrictions.teams.set").setRestrictionTeams(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "branches.protection.restrictions.teams.set", source: "connector", teams: result.teams };
    });
  }
  return { connector: "github", action: "branches.protection.restrictions.teams.set", source: "connector", validated: validateSetRestrictionTeamsInput(input) };
}

export function setBranchProtectionRestrictionUsers(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard5Client(input, "branches.protection.restrictions.users.set").setRestrictionUsers(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "branches.protection.restrictions.users.set", source: "connector", users: result.users };
    });
  }
  return { connector: "github", action: "branches.protection.restrictions.users.set", source: "connector", validated: validateSetRestrictionUsersInput(input) };
}

export function updateBranchProtection(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard5Client(input, "branches.protection.update").updateBranchProtection(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "branches.protection.update", source: "connector", protection: result.protection };
    });
  }
  return { connector: "github", action: "branches.protection.update", source: "connector", validated: validateUpdateBranchProtectionInput(input) };
}

export function updateBranchProtectionRequiredPullRequestReviews(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard5Client(input, "branches.protection.required_pull_request_reviews.update").updatePullRequestReviewProtection(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "branches.protection.required_pull_request_reviews.update", source: "connector", protection: result.protection };
    });
  }
  return { connector: "github", action: "branches.protection.required_pull_request_reviews.update", source: "connector", validated: validateUpdatePullRequestReviewProtectionInput(input) };
}

export function updateBranchProtectionRequiredStatusChecks(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard5Client(input, "branches.protection.required_status_checks.update").updateStatusCheckProtection(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "branches.protection.required_status_checks.update", source: "connector", protection: result.protection };
    });
  }
  return { connector: "github", action: "branches.protection.required_status_checks.update", source: "connector", validated: validateUpdateStatusCheckProtectionInput(input) };
}


// ─── write card 6: project item, check suite, and notification writes ────────

function liveWriteCard6Client(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createWriteCard6Client({
    accessToken: input.accessToken as string,
    fetch: fetchFn,
    githubClient: createGitHubClient({ accessToken: input.accessToken as string, fetch: fetchFn, operation }),
  });
}

export function deleteUserProjectItem(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard6Client(input, "users.projects_v2.items.delete").deleteUserProjectItem(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "users.projects_v2.items.delete", source: "connector", deleted: result.deleted, username: result.username, projectNumber: result.projectNumber, itemId: result.itemId };
    });
  }
  return { connector: "github", action: "users.projects_v2.items.delete", source: "connector", validated: validateDeleteUserProjectItemInput(input) };
}

export function createCheckSuite(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard6Client(input, "checks.suites.create").createCheckSuite(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "checks.suites.create", source: "connector", suite: result.suite };
    });
  }
  return { connector: "github", action: "checks.suites.create", source: "connector", validated: validateCreateCheckSuiteInput(input) };
}

export function deleteThreadSubscription(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard6Client(input, "notifications.threads.subscription.delete").deleteThreadSubscription(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "notifications.threads.subscription.delete", source: "connector", deleted: result.deleted, threadId: result.threadId };
    });
  }
  return { connector: "github", action: "notifications.threads.subscription.delete", source: "connector", validated: validateDeleteThreadSubscriptionInput(input) };
}

export function markThreadDone(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard6Client(input, "notifications.threads.mark_done").markThreadDone(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "notifications.threads.mark_done", source: "connector", deleted: result.deleted, threadId: result.threadId };
    });
  }
  return { connector: "github", action: "notifications.threads.mark_done", source: "connector", validated: validateMarkThreadDoneInput(input) };
}

export function setThreadSubscription(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard6Client(input, "notifications.threads.subscription.set").setThreadSubscription(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "notifications.threads.subscription.set", source: "connector", subscription: result.subscription };
    });
  }
  return { connector: "github", action: "notifications.threads.subscription.set", source: "connector", validated: validateSetThreadSubscriptionInput(input) };
}

// ─── write card 7: milestone delete, runner tokens, and installation repos ───

function liveWriteCard7Client(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createWriteCard7Client({
    accessToken: input.accessToken as string,
    fetch: fetchFn,
    githubClient: createGitHubClient({ accessToken: input.accessToken as string, fetch: fetchFn, operation }),
  });
}

export function deleteMilestone(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard7Client(input, "milestones.delete").deleteMilestone(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "milestones.delete", source: "connector", deleted: result.deleted, owner: result.owner, repo: result.repo, milestoneNumber: result.milestoneNumber };
    });
  }
  return { connector: "github", action: "milestones.delete", source: "connector", validated: validateDeleteMilestoneInput(input) };
}

export function createOrgRunnerRegistrationToken(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard7Client(input, "orgs.actions.runners.registration_token.create").createOrgRunnerRegistrationToken(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { ...result.body, connector: "github", action: "orgs.actions.runners.registration_token.create", source: "connector" };
    });
  }
  return { connector: "github", action: "orgs.actions.runners.registration_token.create", source: "connector", validated: validateCreateOrgRunnerRegistrationTokenInput(input) };
}

export function createRepoRunnerRegistrationToken(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard7Client(input, "repos.actions.runners.registration_token.create").createRepoRunnerRegistrationToken(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { ...result.body, connector: "github", action: "repos.actions.runners.registration_token.create", source: "connector" };
    });
  }
  return { connector: "github", action: "repos.actions.runners.registration_token.create", source: "connector", validated: validateCreateRepoRunnerRegistrationTokenInput(input) };
}

export function createOrgRunnerRemoveToken(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard7Client(input, "orgs.actions.runners.remove_token.create").createOrgRunnerRemoveToken(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { ...result.body, connector: "github", action: "orgs.actions.runners.remove_token.create", source: "connector" };
    });
  }
  return { connector: "github", action: "orgs.actions.runners.remove_token.create", source: "connector", validated: validateCreateOrgRunnerRemoveTokenInput(input) };
}

export function createRepoRunnerRemoveToken(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard7Client(input, "repos.actions.runners.remove_token.create").createRepoRunnerRemoveToken(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { ...result.body, connector: "github", action: "repos.actions.runners.remove_token.create", source: "connector" };
    });
  }
  return { connector: "github", action: "repos.actions.runners.remove_token.create", source: "connector", validated: validateCreateRepoRunnerRemoveTokenInput(input) };
}

export function addInstallationRepository(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard7Client(input, "user.installations.repositories.add").addInstallationRepository(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "user.installations.repositories.add", source: "connector", added: result.added, installationId: result.installationId, repositoryId: result.repositoryId };
    });
  }
  return { connector: "github", action: "user.installations.repositories.add", source: "connector", validated: validateAddInstallationRepositoryInput(input) };
}

export function removeInstallationRepository(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard7Client(input, "user.installations.repositories.remove").removeInstallationRepository(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "user.installations.repositories.remove", source: "connector", removed: result.removed, installationId: result.installationId, repositoryId: result.repositoryId };
    });
  }
  return { connector: "github", action: "user.installations.repositories.remove", source: "connector", validated: validateRemoveInstallationRepositoryInput(input) };
}

// ─── write card 8: package version deletes and package restores ───────────────

function liveWriteCard8Client(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createWriteCard8Client({
    accessToken: input.accessToken as string,
    fetch: fetchFn,
    githubClient: createGitHubClient({ accessToken: input.accessToken as string, fetch: fetchFn, operation }),
  });
}

export function deleteAuthenticatedPackageVersion(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard8Client(input, "user.packages.versions.delete").deleteAuthenticatedPackageVersion(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "user.packages.versions.delete", source: "connector", deleted: result.deleted, packageType: result.packageType, packageName: result.packageName, packageVersionId: result.packageVersionId };
    });
  }
  return { connector: "github", action: "user.packages.versions.delete", source: "connector", validated: validateDeleteAuthenticatedPackageVersionInput(input) };
}

export function deleteOrgPackageVersion(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard8Client(input, "orgs.packages.versions.delete").deleteOrgPackageVersion(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.packages.versions.delete", source: "connector", deleted: result.deleted, org: result.org, packageType: result.packageType, packageName: result.packageName, packageVersionId: result.packageVersionId };
    });
  }
  return { connector: "github", action: "orgs.packages.versions.delete", source: "connector", validated: validateDeleteOrgPackageVersionInput(input) };
}

export function deleteUserPackageVersion(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard8Client(input, "users.packages.versions.delete").deleteUserPackageVersion(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "users.packages.versions.delete", source: "connector", deleted: result.deleted, username: result.username, packageType: result.packageType, packageName: result.packageName, packageVersionId: result.packageVersionId };
    });
  }
  return { connector: "github", action: "users.packages.versions.delete", source: "connector", validated: validateDeleteUserPackageVersionInput(input) };
}

export function restoreOrgPackage(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard8Client(input, "orgs.packages.restore").restoreOrgPackage(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.packages.restore", source: "connector", restored: result.restored, org: result.org, packageType: result.packageType, packageName: result.packageName };
    });
  }
  return { connector: "github", action: "orgs.packages.restore", source: "connector", validated: validateRestoreOrgPackageInput(input) };
}

export function restoreUserPackage(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard8Client(input, "users.packages.restore").restoreUserPackage(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "users.packages.restore", source: "connector", restored: result.restored, username: result.username, packageType: result.packageType, packageName: result.packageName };
    });
  }
  return { connector: "github", action: "users.packages.restore", source: "connector", validated: validateRestoreUserPackageInput(input) };
}

export function restoreAuthenticatedPackage(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard8Client(input, "user.packages.restore").restoreAuthenticatedPackage(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "user.packages.restore", source: "connector", restored: result.restored, packageType: result.packageType, packageName: result.packageName };
    });
  }
  return { connector: "github", action: "user.packages.restore", source: "connector", validated: validateRestoreAuthenticatedPackageInput(input) };
}

// ─── write card 9: package version restores and codespace writes ──────────────

function liveWriteCard9Client(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createWriteCard9Client({
    accessToken: input.accessToken as string,
    fetch: fetchFn,
    githubClient: createGitHubClient({ accessToken: input.accessToken as string, fetch: fetchFn, operation }),
  });
}

export function restoreAuthenticatedPackageVersion(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard9Client(input, "user.packages.versions.restore").restoreAuthenticatedPackageVersion(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "user.packages.versions.restore", source: "connector", restored: result.restored, packageType: result.packageType, packageName: result.packageName, packageVersionId: result.packageVersionId };
    });
  }
  return { connector: "github", action: "user.packages.versions.restore", source: "connector", validated: validateRestoreAuthenticatedPackageVersionInput(input) };
}

export function restoreOrgPackageVersion(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard9Client(input, "orgs.packages.versions.restore").restoreOrgPackageVersion(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.packages.versions.restore", source: "connector", restored: result.restored, org: result.org, packageType: result.packageType, packageName: result.packageName, packageVersionId: result.packageVersionId };
    });
  }
  return { connector: "github", action: "orgs.packages.versions.restore", source: "connector", validated: validateRestoreOrgPackageVersionInput(input) };
}

export function restoreUserPackageVersion(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard9Client(input, "users.packages.versions.restore").restoreUserPackageVersion(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "users.packages.versions.restore", source: "connector", restored: result.restored, username: result.username, packageType: result.packageType, packageName: result.packageName, packageVersionId: result.packageVersionId };
    });
  }
  return { connector: "github", action: "users.packages.versions.restore", source: "connector", validated: validateRestoreUserPackageVersionInput(input) };
}

export function addOrgCodespacesAccessSelectedUsers(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard9Client(input, "orgs.codespaces.access.selected_users.add").addOrgCodespacesAccessSelectedUsers(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.codespaces.access.selected_users.add", source: "connector", added: result.added, org: result.org, selectedUsernames: result.selectedUsernames };
    });
  }
  return { connector: "github", action: "orgs.codespaces.access.selected_users.add", source: "connector", validated: validateAddOrgCodespacesAccessSelectedUsersInput(input) };
}

export function createUserCodespace(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard9Client(input, "user.codespaces.create").createUserCodespace(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "user.codespaces.create", source: "connector", codespace: result.codespace };
    });
  }
  return { connector: "github", action: "user.codespaces.create", source: "connector", validated: validateCreateUserCodespaceInput(input) };
}

export function createRepoCodespace(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard9Client(input, "repos.codespaces.create").createRepoCodespace(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.codespaces.create", source: "connector", codespace: result.codespace };
    });
  }
  return { connector: "github", action: "repos.codespaces.create", source: "connector", validated: validateCreateRepoCodespaceInput(input) };
}

export function createPullCodespace(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard9Client(input, "repos.pulls.codespaces.create").createPullCodespace(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.pulls.codespaces.create", source: "connector", codespace: result.codespace };
    });
  }
  return { connector: "github", action: "repos.pulls.codespaces.create", source: "connector", validated: validateCreatePullCodespaceInput(input) };
}

export function publishCodespace(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard9Client(input, "user.codespaces.publish").publishCodespace(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "user.codespaces.publish", source: "connector", codespace: result.codespace };
    });
  }
  return { connector: "github", action: "user.codespaces.publish", source: "connector", validated: validatePublishCodespaceInput(input) };
}

export function createCodespaceExport(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard9Client(input, "user.codespaces.exports.create").createCodespaceExport(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "user.codespaces.exports.create", source: "connector", export: result.export };
    });
  }
  return { connector: "github", action: "user.codespaces.exports.create", source: "connector", validated: validateCreateCodespaceExportInput(input) };
}

export function setOrgCodespacesAccess(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard9Client(input, "orgs.codespaces.access.set").setOrgCodespacesAccess(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.codespaces.access.set", source: "connector", set: result.set, org: result.org, visibility: result.visibility, selectedUsernames: result.selectedUsernames };
    });
  }
  return { connector: "github", action: "orgs.codespaces.access.set", source: "connector", validated: validateSetOrgCodespacesAccessInput(input) };
}

export function startUserCodespace(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard9Client(input, "user.codespaces.start").startUserCodespace(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "user.codespaces.start", source: "connector", codespace: result.codespace };
    });
  }
  return { connector: "github", action: "user.codespaces.start", source: "connector", validated: validateStartUserCodespaceInput(input) };
}

export function stopOrgMemberCodespace(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard9Client(input, "orgs.members.codespaces.stop").stopOrgMemberCodespace(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.members.codespaces.stop", source: "connector", codespace: result.codespace };
    });
  }
  return { connector: "github", action: "orgs.members.codespaces.stop", source: "connector", validated: validateStopOrgMemberCodespaceInput(input) };
}

export function stopUserCodespace(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard9Client(input, "user.codespaces.stop").stopUserCodespace(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "user.codespaces.stop", source: "connector", codespace: result.codespace };
    });
  }
  return { connector: "github", action: "user.codespaces.stop", source: "connector", validated: validateStopUserCodespaceInput(input) };
}

// ─── write card 10: hooks and reactions writes ────────────────────────────────

function liveWriteCard10Client(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createWriteCard10Client({
    accessToken: input.accessToken as string,
    fetch: fetchFn,
    githubClient: createGitHubClient({ accessToken: input.accessToken as string, fetch: fetchFn, operation }),
  });
}

export function createOrgHook(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard10Client(input, "orgs.hooks.create").createOrgHook(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.hooks.create", source: "connector", hook: result.hook };
    });
  }
  return { connector: "github", action: "orgs.hooks.create", source: "connector", validated: validateCreateOrgHookInput(input) };
}

export function deleteRepoHook(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard10Client(input, "repos.hooks.delete").deleteRepoHook(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.hooks.delete", source: "connector", deleted: result.deleted, owner: result.owner, repo: result.repo, hookId: result.hookId };
    });
  }
  return { connector: "github", action: "repos.hooks.delete", source: "connector", validated: validateDeleteRepoHookInput(input) };
}

export function deleteOrgHook(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard10Client(input, "orgs.hooks.delete").deleteOrgHook(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.hooks.delete", source: "connector", deleted: result.deleted, org: result.org, hookId: result.hookId };
    });
  }
  return { connector: "github", action: "orgs.hooks.delete", source: "connector", validated: validateDeleteOrgHookInput(input) };
}

export function pingOrgHook(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard10Client(input, "orgs.hooks.ping").pingOrgHook(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.hooks.ping", source: "connector", pinged: result.pinged, org: result.org, hookId: result.hookId };
    });
  }
  return { connector: "github", action: "orgs.hooks.ping", source: "connector", validated: validatePingOrgHookInput(input) };
}

export function pingRepoHook(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard10Client(input, "repos.hooks.ping").pingRepoHook(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.hooks.ping", source: "connector", pinged: result.pinged, owner: result.owner, repo: result.repo, hookId: result.hookId };
    });
  }
  return { connector: "github", action: "repos.hooks.ping", source: "connector", validated: validatePingRepoHookInput(input) };
}

export function redeliverOrgHookDelivery(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard10Client(input, "orgs.hooks.deliveries.redeliver").redeliverOrgHookDelivery(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.hooks.deliveries.redeliver", source: "connector", redelivered: result.redelivered, org: result.org, hookId: result.hookId, deliveryId: result.deliveryId };
    });
  }
  return { connector: "github", action: "orgs.hooks.deliveries.redeliver", source: "connector", validated: validateRedeliverOrgHookDeliveryInput(input) };
}

export function redeliverRepoHookDelivery(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard10Client(input, "repos.hooks.deliveries.redeliver").redeliverRepoHookDelivery(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.hooks.deliveries.redeliver", source: "connector", redelivered: result.redelivered, owner: result.owner, repo: result.repo, hookId: result.hookId, deliveryId: result.deliveryId };
    });
  }
  return { connector: "github", action: "repos.hooks.deliveries.redeliver", source: "connector", validated: validateRedeliverRepoHookDeliveryInput(input) };
}

export function updateOrgHook(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard10Client(input, "orgs.hooks.update").updateOrgHook(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.hooks.update", source: "connector", hook: result.hook };
    });
  }
  return { connector: "github", action: "orgs.hooks.update", source: "connector", validated: validateUpdateOrgHookInput(input) };
}

export function updateRepoHook(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard10Client(input, "repos.hooks.update").updateRepoHook(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.hooks.update", source: "connector", hook: result.hook };
    });
  }
  return { connector: "github", action: "repos.hooks.update", source: "connector", validated: validateUpdateRepoHookInput(input) };
}

export function createIssueReaction(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard10Client(input, "issues.reactions.create").createIssueReaction(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "issues.reactions.create", source: "connector", reaction: result.reaction };
    });
  }
  return { connector: "github", action: "issues.reactions.create", source: "connector", validated: validateCreateIssueReactionInput(input) };
}

export function createIssueCommentReaction(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard10Client(input, "issues.comments.reactions.create").createIssueCommentReaction(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "issues.comments.reactions.create", source: "connector", reaction: result.reaction };
    });
  }
  return { connector: "github", action: "issues.comments.reactions.create", source: "connector", validated: validateCreateIssueCommentReactionInput(input) };
}

export function createCommitCommentReaction(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard10Client(input, "commits.comments.reactions.create").createCommitCommentReaction(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "commits.comments.reactions.create", source: "connector", reaction: result.reaction };
    });
  }
  return { connector: "github", action: "commits.comments.reactions.create", source: "connector", validated: validateCreateCommitCommentReactionInput(input) };
}

export function createPullReviewCommentReaction(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard10Client(input, "pull_requests.review_comments.reactions.create").createPullReviewCommentReaction(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "pull_requests.review_comments.reactions.create", source: "connector", reaction: result.reaction };
    });
  }
  return { connector: "github", action: "pull_requests.review_comments.reactions.create", source: "connector", validated: validateCreatePullReviewCommentReactionInput(input) };
}

export function createReleaseReaction(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard10Client(input, "releases.reactions.create").createReleaseReaction(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "releases.reactions.create", source: "connector", reaction: result.reaction };
    });
  }
  return { connector: "github", action: "releases.reactions.create", source: "connector", validated: validateCreateReleaseReactionInput(input) };
}

export function deleteReleaseReaction(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard10Client(input, "releases.reactions.delete").deleteReleaseReaction(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "releases.reactions.delete", source: "connector", deleted: result.deleted, owner: result.owner, repo: result.repo, releaseId: result.releaseId, reactionId: result.reactionId };
    });
  }
  return { connector: "github", action: "releases.reactions.delete", source: "connector", validated: validateDeleteReleaseReactionInput(input) };
}

export function deleteCommitCommentReaction(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard10Client(input, "commits.comments.reactions.delete").deleteCommitCommentReaction(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "commits.comments.reactions.delete", source: "connector", deleted: result.deleted, owner: result.owner, repo: result.repo, commentId: result.commentId, reactionId: result.reactionId };
    });
  }
  return { connector: "github", action: "commits.comments.reactions.delete", source: "connector", validated: validateDeleteCommitCommentReactionInput(input) };
}

export function deleteIssueCommentReaction(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard10Client(input, "issues.comments.reactions.delete").deleteIssueCommentReaction(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "issues.comments.reactions.delete", source: "connector", deleted: result.deleted, owner: result.owner, repo: result.repo, commentId: result.commentId, reactionId: result.reactionId };
    });
  }
  return { connector: "github", action: "issues.comments.reactions.delete", source: "connector", validated: validateDeleteIssueCommentReactionInput(input) };
}

export function deleteIssueReaction(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard10Client(input, "issues.reactions.delete").deleteIssueReaction(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "issues.reactions.delete", source: "connector", deleted: result.deleted, owner: result.owner, repo: result.repo, issueNumber: result.issueNumber, reactionId: result.reactionId };
    });
  }
  return { connector: "github", action: "issues.reactions.delete", source: "connector", validated: validateDeleteIssueReactionInput(input) };
}

// ─── write card 11: PR reaction delete, runner deletes, and follow ────────────

function liveWriteCard11Client(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createWriteCard11Client({
    accessToken: input.accessToken as string,
    fetch: fetchFn,
    githubClient: createGitHubClient({ accessToken: input.accessToken as string, fetch: fetchFn, operation }),
  });
}

export function deletePullReviewCommentReaction(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard11Client(input, "pull_requests.review_comments.reactions.delete").deletePullReviewCommentReaction(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "pull_requests.review_comments.reactions.delete", source: "connector", deleted: result.deleted, owner: result.owner, repo: result.repo, commentId: result.commentId, reactionId: result.reactionId };
    });
  }
  return { connector: "github", action: "pull_requests.review_comments.reactions.delete", source: "connector", validated: validateDeletePullReviewCommentReactionInput(input) };
}

export function deleteOrgActionsRunner(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard11Client(input, "orgs.actions.runners.delete").deleteOrgActionsRunner(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.actions.runners.delete", source: "connector", deleted: result.deleted, org: result.org, runnerId: result.runnerId };
    });
  }
  return { connector: "github", action: "orgs.actions.runners.delete", source: "connector", validated: validateDeleteOrgActionsRunnerInput(input) };
}

export function deleteRepoActionsRunner(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard11Client(input, "repos.actions.runners.delete").deleteRepoActionsRunner(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.actions.runners.delete", source: "connector", deleted: result.deleted, owner: result.owner, repo: result.repo, runnerId: result.runnerId };
    });
  }
  return { connector: "github", action: "repos.actions.runners.delete", source: "connector", validated: validateDeleteRepoActionsRunnerInput(input) };
}

export function followUser(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard11Client(input, "user.following.follow").followUser(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "user.following.follow", source: "connector", followed: result.followed, username: result.username };
    });
  }
  return { connector: "github", action: "user.following.follow", source: "connector", validated: validateFollowUserInput(input) };
}

// ─── write card 12: unfollow, gist comments/forks/star ────────────────────────

function liveWriteCard12Client(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createWriteCard12Client({
    accessToken: input.accessToken as string,
    fetch: fetchFn,
    githubClient: createGitHubClient({ accessToken: input.accessToken as string, fetch: fetchFn, operation }),
  });
}

export function unfollowUser(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard12Client(input, "user.following.unfollow").unfollowUser(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "user.following.unfollow", source: "connector", unfollowed: result.unfollowed, username: result.username };
    });
  }
  return { connector: "github", action: "user.following.unfollow", source: "connector", validated: validateUnfollowUserInput(input) };
}

export function createGistComment(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard12Client(input, "gists.comments.create").createGistComment(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "gists.comments.create", source: "connector", comment: result.comment };
    });
  }
  return { connector: "github", action: "gists.comments.create", source: "connector", validated: validateCreateGistCommentInput(input) };
}

export function deleteGistComment(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard12Client(input, "gists.comments.delete").deleteGistComment(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "gists.comments.delete", source: "connector", deleted: result.deleted, gistId: result.gistId, commentId: result.commentId };
    });
  }
  return { connector: "github", action: "gists.comments.delete", source: "connector", validated: validateDeleteGistCommentInput(input) };
}

export function updateGistComment(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard12Client(input, "gists.comments.update").updateGistComment(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "gists.comments.update", source: "connector", comment: result.comment };
    });
  }
  return { connector: "github", action: "gists.comments.update", source: "connector", validated: validateUpdateGistCommentInput(input) };
}

export function createGistFork(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard12Client(input, "gists.forks.create").createGistFork(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "gists.forks.create", source: "connector", gist: result.gist };
    });
  }
  return { connector: "github", action: "gists.forks.create", source: "connector", validated: validateCreateGistForkInput(input) };
}

export function starGist(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard12Client(input, "gists.star").starGist(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "gists.star", source: "connector", starred: result.starred, gistId: result.gistId };
    });
  }
  return { connector: "github", action: "gists.star", source: "connector", validated: validateStarGistInput(input) };
}

export function unstarGist(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard12Client(input, "gists.unstar").unstarGist(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "gists.unstar", source: "connector", unstarred: result.unstarred, gistId: result.gistId };
    });
  }
  return { connector: "github", action: "gists.unstar", source: "connector", validated: validateUnstarGistInput(input) };
}

// ─── write card 13: sub-issues, issue labels, teams, org-role teams ────────────

function liveWriteCard13Client(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createWriteCard13Client({
    accessToken: input.accessToken as string,
    fetch: fetchFn,
    githubClient: createGitHubClient({ accessToken: input.accessToken as string, fetch: fetchFn, operation }),
  });
}

export function addSubIssue(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard13Client(input, "issues.sub_issues.add").addSubIssue(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "issues.sub_issues.add", source: "connector", issue: result.issue };
    });
  }
  return { connector: "github", action: "issues.sub_issues.add", source: "connector", validated: validateAddSubIssueInput(input) };
}

export function removeAllIssueLabels(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard13Client(input, "issues.labels.remove_all").removeAllIssueLabels(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "issues.labels.remove_all", source: "connector", deleted: result.deleted, owner: result.owner, repo: result.repo, issueNumber: result.issueNumber };
    });
  }
  return { connector: "github", action: "issues.labels.remove_all", source: "connector", validated: validateRemoveAllIssueLabelsInput(input) };
}

export function addTeamRepo(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard13Client(input, "orgs.teams.repos.add").addTeamRepo(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.teams.repos.add", source: "connector", added: result.added, org: result.org, teamSlug: result.teamSlug, owner: result.owner, repo: result.repo, permission: result.permission };
    });
  }
  return { connector: "github", action: "orgs.teams.repos.add", source: "connector", validated: validateAddTeamRepoInput(input) };
}

export function assignOrgRoleToTeam(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard13Client(input, "orgs.organization_roles.teams.assign").assignOrgRoleToTeam(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.organization_roles.teams.assign", source: "connector", assigned: result.assigned, org: result.org, teamSlug: result.teamSlug, roleId: result.roleId };
    });
  }
  return { connector: "github", action: "orgs.organization_roles.teams.assign", source: "connector", validated: validateAssignOrgRoleToTeamInput(input) };
}

export function deleteOrgTeam(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard13Client(input, "orgs.teams.delete").deleteOrgTeam(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.teams.delete", source: "connector", deleted: result.deleted, org: result.org, teamSlug: result.teamSlug };
    });
  }
  return { connector: "github", action: "orgs.teams.delete", source: "connector", validated: validateDeleteOrgTeamInput(input) };
}

export function removeAllOrgRolesFromTeam(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard13Client(input, "orgs.organization_roles.teams.remove_all").removeAllOrgRolesFromTeam(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.organization_roles.teams.remove_all", source: "connector", removed: result.removed, org: result.org, teamSlug: result.teamSlug };
    });
  }
  return { connector: "github", action: "orgs.organization_roles.teams.remove_all", source: "connector", validated: validateRemoveAllOrgRolesFromTeamInput(input) };
}

export function removeOrgRoleFromTeam(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard13Client(input, "orgs.organization_roles.teams.remove").removeOrgRoleFromTeam(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.organization_roles.teams.remove", source: "connector", removed: result.removed, org: result.org, teamSlug: result.teamSlug, roleId: result.roleId };
    });
  }
  return { connector: "github", action: "orgs.organization_roles.teams.remove", source: "connector", validated: validateRemoveOrgRoleFromTeamInput(input) };
}

export function removeTeamRepo(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard13Client(input, "orgs.teams.repos.remove").removeTeamRepo(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.teams.repos.remove", source: "connector", removed: result.removed, org: result.org, teamSlug: result.teamSlug, owner: result.owner, repo: result.repo };
    });
  }
  return { connector: "github", action: "orgs.teams.repos.remove", source: "connector", validated: validateRemoveTeamRepoInput(input) };
}

export function updateOrgTeam(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard13Client(input, "orgs.teams.update").updateOrgTeam(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.teams.update", source: "connector", team: result.team };
    });
  }
  return { connector: "github", action: "orgs.teams.update", source: "connector", validated: validateUpdateOrgTeamInput(input) };
}


// ─── write card 14: org variable repos, run logs, org permissions, markdown, pages ─

function liveWriteCard14Client(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createWriteCard14Client({
    accessToken: input.accessToken as string,
    fetch: fetchFn,
    githubClient: createGitHubClient({ accessToken: input.accessToken as string, fetch: fetchFn, operation }),
  });
}

export function addOrgVariableRepository(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard14Client(input, "actions.org_variables.repositories.add").addOrgVariableRepository(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "actions.org_variables.repositories.add", source: "connector", added: result.added, org: result.org, name: result.name, repositoryId: result.repositoryId };
    });
  }
  return { connector: "github", action: "actions.org_variables.repositories.add", source: "connector", validated: validateAddOrgVariableRepositoryInput(input) };
}

export function deleteRunLogs(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard14Client(input, "actions.runs.logs.delete").deleteRunLogs(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "actions.runs.logs.delete", source: "connector", deleted: result.deleted, owner: result.owner, repo: result.repo, runId: result.runId };
    });
  }
  return { connector: "github", action: "actions.runs.logs.delete", source: "connector", validated: validateDeleteRunLogsInput(input) };
}

export function setOrgWorkflowPermissions(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard14Client(input, "orgs.actions.permissions.workflow.set").setOrgWorkflowPermissions(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.actions.permissions.workflow.set", source: "connector", permissions: result.permissions };
    });
  }
  return { connector: "github", action: "orgs.actions.permissions.workflow.set", source: "connector", validated: validateSetOrgWorkflowPermissionsInput(input) };
}

export function setOrgActionsPermissions(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard14Client(input, "orgs.actions.permissions.set").setOrgActionsPermissions(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.actions.permissions.set", source: "connector", permissions: result.permissions };
    });
  }
  return { connector: "github", action: "orgs.actions.permissions.set", source: "connector", validated: validateSetOrgActionsPermissionsInput(input) };
}

export function renderMarkdown(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard14Client(input, "markdown.render").renderMarkdown(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "markdown.render", source: "connector", html: result.html };
    });
  }
  return { connector: "github", action: "markdown.render", source: "connector", validated: validateRenderMarkdownInput(input) };
}

export function cancelPagesDeployment(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard14Client(input, "repos.pages.deployments.cancel").cancelPagesDeployment(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.pages.deployments.cancel", source: "connector", cancelled: result.cancelled, owner: result.owner, repo: result.repo, pagesDeploymentId: result.pagesDeploymentId };
    });
  }
  return { connector: "github", action: "repos.pages.deployments.cancel", source: "connector", validated: validateCancelPagesDeploymentInput(input) };
}

export function createPagesDeployment(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard14Client(input, "repos.pages.deployments.create").createPagesDeployment(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.pages.deployments.create", source: "connector", deployment: result.deployment };
    });
  }
  return { connector: "github", action: "repos.pages.deployments.create", source: "connector", validated: validateCreatePagesDeploymentInput(input) };
}

export function createPagesSite(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard14Client(input, "repos.pages.create").createPagesSite(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.pages.create", source: "connector", pages: result.pages };
    });
  }
  return { connector: "github", action: "repos.pages.create", source: "connector", validated: validateCreatePagesSiteInput(input) };
}

export function deletePagesSite(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard14Client(input, "repos.pages.delete").deletePagesSite(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.pages.delete", source: "connector", deleted: result.deleted, owner: result.owner, repo: result.repo };
    });
  }
  return { connector: "github", action: "repos.pages.delete", source: "connector", validated: validateDeletePagesSiteInput(input) };
}

export function requestPagesBuild(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard14Client(input, "repos.pages.builds.request").requestPagesBuild(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.pages.builds.request", source: "connector", build: result.build };
    });
  }
  return { connector: "github", action: "repos.pages.builds.request", source: "connector", validated: validateRequestPagesBuildInput(input) };
}


// ─── write card 15: security advisory reports/forks, deploy keys, rulesets ─

function liveWriteCard15Client(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createWriteCard15Client({
    accessToken: input.accessToken as string,
    fetch: fetchFn,
    githubClient: createGitHubClient({ accessToken: input.accessToken as string, fetch: fetchFn, operation }),
  });
}

export function createSecurityAdvisoryReport(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard15Client(input, "repos.security_advisories.reports.create").createSecurityAdvisoryReport(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.security_advisories.reports.create", source: "connector", advisory: result.advisory };
    });
  }
  return { connector: "github", action: "repos.security_advisories.reports.create", source: "connector", validated: validateCreateSecurityAdvisoryReportInput(input) };
}

export function createSecurityAdvisoryFork(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard15Client(input, "repos.security_advisories.forks.create").createSecurityAdvisoryFork(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.security_advisories.forks.create", source: "connector", fork: result.fork };
    });
  }
  return { connector: "github", action: "repos.security_advisories.forks.create", source: "connector", validated: validateCreateSecurityAdvisoryForkInput(input) };
}

export function createRepoKey(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard15Client(input, "repos.keys.create").createRepoKey(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.keys.create", source: "connector", key: result.key };
    });
  }
  return { connector: "github", action: "repos.keys.create", source: "connector", validated: validateCreateRepoKeyInput(input) };
}

export function deleteRepoKey(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard15Client(input, "repos.keys.delete").deleteRepoKey(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.keys.delete", source: "connector", deleted: result.deleted, owner: result.owner, repo: result.repo, keyId: result.keyId };
    });
  }
  return { connector: "github", action: "repos.keys.delete", source: "connector", validated: validateDeleteRepoKeyInput(input) };
}

export function createRepoRuleset(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard15Client(input, "repos.rulesets.create").createRepoRuleset(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.rulesets.create", source: "connector", ruleset: result.ruleset };
    });
  }
  return { connector: "github", action: "repos.rulesets.create", source: "connector", validated: validateCreateRepoRulesetInput(input) };
}

export function deleteRepoRuleset(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard15Client(input, "repos.rulesets.delete").deleteRepoRuleset(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.rulesets.delete", source: "connector", deleted: result.deleted, owner: result.owner, repo: result.repo, rulesetId: result.rulesetId };
    });
  }
  return { connector: "github", action: "repos.rulesets.delete", source: "connector", validated: validateDeleteRepoRulesetInput(input) };
}

export function updateRepoRuleset(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard15Client(input, "repos.rulesets.update").updateRepoRuleset(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.rulesets.update", source: "connector", ruleset: result.ruleset };
    });
  }
  return { connector: "github", action: "repos.rulesets.update", source: "connector", validated: validateUpdateRepoRulesetInput(input) };
}


// ─── write card 16: release asset delete and update ─────────────────────────

function liveWriteCard16Client(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createWriteCard16Client({
    accessToken: input.accessToken as string,
    fetch: fetchFn,
    githubClient: createGitHubClient({ accessToken: input.accessToken as string, fetch: fetchFn, operation }),
  });
}

export function deleteReleaseAsset(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard16Client(input, "releases.assets.delete").deleteReleaseAsset(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "releases.assets.delete", source: "connector", deleted: result.deleted, owner: result.owner, repo: result.repo, assetId: result.assetId };
    });
  }
  return { connector: "github", action: "releases.assets.delete", source: "connector", validated: validateDeleteReleaseAssetInput(input) };
}

export function updateReleaseAsset(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard16Client(input, "releases.assets.update").updateReleaseAsset(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "releases.assets.update", source: "connector", asset: result.asset };
    });
  }
  return { connector: "github", action: "releases.assets.update", source: "connector", validated: validateUpdateReleaseAssetInput(input) };
}


// ─── write card 17: fuzzy writes (projects, packages, hooks config, scanning) ─

function liveWriteCard17Client(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createWriteCard17Client({
    accessToken: input.accessToken as string,
    fetch: fetchFn,
    githubClient: createGitHubClient({ accessToken: input.accessToken as string, fetch: fetchFn, operation }),
  });
}

export function createUserProjectField(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard17Client(input, "users.projects_v2.fields.create").createUserProjectField(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "users.projects_v2.fields.create", source: "connector", field: result.field };
    });
  }
  return { connector: "github", action: "users.projects_v2.fields.create", source: "connector", validated: validateCreateUserProjectFieldInput(input) };
}

export function createUserProjectItem(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard17Client(input, "users.projects_v2.items.create").createUserProjectItem(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "users.projects_v2.items.create", source: "connector", item: result.item };
    });
  }
  return { connector: "github", action: "users.projects_v2.items.create", source: "connector", validated: validateCreateUserProjectItemInput(input) };
}

export function createUserProjectDraft(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard17Client(input, "users.projects_v2.drafts.create").createUserProjectDraft(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "users.projects_v2.drafts.create", source: "connector", draft: result.draft };
    });
  }
  return { connector: "github", action: "users.projects_v2.drafts.create", source: "connector", validated: validateCreateUserProjectDraftInput(input) };
}

export function createUserProjectView(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard17Client(input, "users.projects_v2.views.create").createUserProjectView(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "users.projects_v2.views.create", source: "connector", view: result.view };
    });
  }
  return { connector: "github", action: "users.projects_v2.views.create", source: "connector", validated: validateCreateUserProjectViewInput(input) };
}

export function deleteAutolink(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard17Client(input, "repos.autolinks.delete").deleteAutolink(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.autolinks.delete", source: "connector", deleted: result.deleted, owner: result.owner, repo: result.repo, autolinkId: result.autolinkId };
    });
  }
  return { connector: "github", action: "repos.autolinks.delete", source: "connector", validated: validateDeleteAutolinkInput(input) };
}

export function deleteCodeScanningAnalysis(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard17Client(input, "code_scanning.analyses.delete").deleteCodeScanningAnalysis(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "code_scanning.analyses.delete", source: "connector", deletion: result.deletion };
    });
  }
  return { connector: "github", action: "code_scanning.analyses.delete", source: "connector", validated: validateDeleteCodeScanningAnalysisInput(input) };
}

export function deleteUserPackage(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard17Client(input, "users.packages.delete").deleteUserPackage(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "users.packages.delete", source: "connector", deleted: result.deleted, username: result.username, packageType: result.packageType, packageName: result.packageName };
    });
  }
  return { connector: "github", action: "users.packages.delete", source: "connector", validated: validateDeleteUserPackageInput(input) };
}

export function removeRunnerLabel(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard17Client(input, "repos.actions.runners.labels.remove").removeRunnerLabel(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.actions.runners.labels.remove", source: "connector", totalCount: result.totalCount, labels: result.labels };
    });
  }
  return { connector: "github", action: "repos.actions.runners.labels.remove", source: "connector", validated: validateRemoveRunnerLabelInput(input) };
}

export function testRepoHook(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard17Client(input, "repos.hooks.test").testRepoHook(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.hooks.test", source: "connector", tested: result.tested, owner: result.owner, repo: result.repo, hookId: result.hookId };
    });
  }
  return { connector: "github", action: "repos.hooks.test", source: "connector", validated: validateTestRepoHookInput(input) };
}

export function updateCodeScanningDefaultSetup(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard17Client(input, "code_scanning.default_setup.update").updateCodeScanningDefaultSetup(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "code_scanning.default_setup.update", source: "connector", setup: result.setup };
    });
  }
  return { connector: "github", action: "code_scanning.default_setup.update", source: "connector", validated: validateUpdateCodeScanningDefaultSetupInput(input) };
}

export function updateOrgHookConfig(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard17Client(input, "orgs.hooks.config.update").updateOrgHookConfig(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "orgs.hooks.config.update", source: "connector", config: result.config };
    });
  }
  return { connector: "github", action: "orgs.hooks.config.update", source: "connector", validated: validateUpdateOrgHookConfigInput(input) };
}

export function updateRepoHookConfig(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard17Client(input, "repos.hooks.config.update").updateRepoHookConfig(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "repos.hooks.config.update", source: "connector", config: result.config };
    });
  }
  return { connector: "github", action: "repos.hooks.config.update", source: "connector", validated: validateUpdateRepoHookConfigInput(input) };
}

export function updateUserProjectItem(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveWriteCard17Client(input, "users.projects_v2.items.update").updateUserProjectItem(input).then((result) => {
      if (!result.ok) throwGitHub(result);
      return { connector: "github", action: "users.projects_v2.items.update", source: "connector", item: result.item };
    });
  }
  return { connector: "github", action: "users.projects_v2.items.update", source: "connector", validated: validateUpdateUserProjectItemInput(input) };
}

// ─── correctness card 18: users.list ─────────────────────────────────────────

function liveCorrectnessCard18Client(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createCorrectnessCard18Client({
    accessToken: input.accessToken as string,
    fetch: fetchFn,
    githubClient: createGitHubClient({ accessToken: input.accessToken as string, fetch: fetchFn, operation }),
  });
}

export function listUsers(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return liveCorrectnessCard18Client(input, "users.list").listUsers(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      return { connector: "github", action: "users.list", source: "connector", users: result.users };
    });
  }
  return { connector: "github", action: "users.list", source: "connector", validated: validateListUsersInput(input) };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

