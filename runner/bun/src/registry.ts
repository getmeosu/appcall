import { withLiveMessageSync } from "./message_sync";
import { runExecution } from "./execution";
import {
  jsonByteLength,
  supportsOperationBudget,
  type OperationBudgetLike,
} from "./budget";
import slackManifest from "../../connectors/slack/manifest.json";
import {
  sendMessage as sendSlackMessage,
  updateMessage as slackUpdateMessage, deleteMessage as slackDeleteMessage, postEphemeral as slackPostEphemeral,
  createConversation as slackCreateConversation, listConversations as slackListConversations, getConversationHistory as slackConversationHistory,
  getConversationInfo as slackConversationInfo, inviteToConversation as slackInviteToConversation, getConversationMembers as slackConversationMembers,
  listUsers as slackListUsers, getUserInfo as slackGetUserInfo, lookupUserByEmail as slackLookupUserByEmail,
  getConversationReplies as slackConversationReplies, joinConversation as slackJoinConversation, leaveConversation as slackLeaveConversation,
  archiveConversation as slackArchiveConversation, unarchiveConversation as slackUnarchiveConversation,
  renameConversation as slackRenameConversation, setConversationTopic as slackSetConversationTopic, kickFromConversation as slackKickFromConversation,
  scheduleMessage as slackScheduleMessage, meMessage as slackMeMessage,
  getTeamInfo as slackGetTeamInfo, listEmoji as slackListEmoji, listPins as slackListPins, getReactions as slackGetReactions,
  getFileInfo as slackGetFileInfo, authTest as slackAuthTest,
  addReaction as slackAddReaction, removeReaction as slackRemoveReaction, addPin as slackAddPin, removePin as slackRemovePin,
} from "../../connectors/slack/src/actions";
import { healthcheck as slackHealthcheck } from "../../connectors/slack/src/healthcheck";
import { executeMessagesListSync as listSlackMessages } from "../../connectors/slack/src/sync";
import telegramManifest from "../../connectors/telegram/manifest.json";
import {
  sendMessage as sendTelegramMessage, validateCredentials as validateTelegramCredentials,
  sendPhoto as tgSendPhoto, sendDocument as tgSendDocument, editMessage as tgEditMessage, deleteMessage as tgDeleteMessage,
  forwardMessage as tgForwardMessage, pinMessage as tgPinMessage, getChatInfo as tgGetChatInfo,
  getChatMemberCountAction as tgGetChatMemberCount, sendChatActionHandler as tgSendChatAction, getMeAction as tgGetMe,
} from "../../connectors/telegram/src/actions";
import { healthcheck as telegramHealthcheck } from "../../connectors/telegram/src/healthcheck";
import { executeMessagesListSync as listTelegramMessages } from "../../connectors/telegram/src/sync";
import notionManifest from "../../connectors/notion/manifest.json";
import {
  appendDocumentText as appendNotionDocumentText,
  createComment as createNotionComment,
  createDatabase as createNotionDatabase,
  createDatabaseItem as createNotionDatabaseItem,
  createDocument as createNotionDocument,
  deleteBlock as deleteNotionBlock,
  getCurrentUser as getNotionCurrentUser,
  getDatabase as getNotionDatabase,
  getDatabaseItem as getNotionDatabaseItem,
  getDocument as getNotionDocument,
  getPageProperty as getNotionPageProperty,
  getUser as getNotionUser,
  listComments as listNotionComments,
  listDatabaseItems as listNotionDatabaseItems,
  listDocumentBlocks as listNotionDocumentBlocks,
  restoreDatabaseItem as restoreNotionDatabaseItem,
  restoreDocument as restoreNotionDocument,
  retrieveComment as retrieveNotionComment,
  searchDocuments as searchNotionDocuments,
  trashDatabaseItem as trashNotionDatabaseItem,
  trashDocument as trashNotionDocument,
  updateDatabaseItem as updateNotionDatabaseItem,
  validateCredentials as validateNotionCredentials,
} from "../../connectors/notion/src/actions";
import { healthcheck as notionHealthcheck } from "../../connectors/notion/src/healthcheck";
import { executeUsersListSync as listNotionUsers } from "../../connectors/notion/src/sync";
import whatsappManifest from "../../connectors/whatsapp/manifest.json";
import {
  sendMessage as sendWhatsAppMessage, validateCredentials as validateWhatsAppCredentials,
  sendTemplate as waSendTemplate, sendImage as waSendImage, sendDocument as waSendDocument, sendLocation as waSendLocation,
  sendContacts as waSendContacts, sendReaction as waSendReaction, markRead as waMarkRead, sendInteractive as waSendInteractive,
  getMessage as waGetMessage, listTemplates as waListTemplates, getMedia as waGetMedia, uploadMedia as waUploadMedia, deleteMedia as waDeleteMedia,
  sendAudio as waSendAudio, sendVideo as waSendVideo, getBusinessProfile as waGetBusinessProfile, updateBusinessProfile as waUpdateBusinessProfile,
  getPhoneNumber as waGetPhoneNumber,
} from "../../connectors/whatsapp/src/actions";
import { healthcheck as whatsappHealthcheck } from "../../connectors/whatsapp/src/healthcheck";
import { parseWebhook as whatsappParseWebhook } from "../../connectors/whatsapp/src/webhook";
import googleWorkspaceManifest from "../../connectors/google-workspace/manifest.json";
import {
  sendMessage as sendGmailMessage, getSheetValues, appendSheetValues, getDocument as getGoogleDocument,
  getMessage as gwGetMessage, modifyMessage as gwModifyMessage, trashMessage as gwTrashMessage, createDraft as gwCreateDraft, listLabels as gwListLabels,
  untrashMessage as gwUntrashMessage, deleteMessage as gwDeleteMessage, getAttachment as gwGetAttachment,
  listThreads as gwListThreads, getThread as gwGetThread, sendDraft as gwSendDraft, deleteDraft as gwDeleteDraft,
  createLabel as gwCreateLabel, getLabel as gwGetLabel,
  createCalendarEvent as gwCreateEvent, updateCalendarEvent as gwUpdateEvent, deleteCalendarEvent as gwDeleteEvent, getCalendarEvent as gwGetEvent, listCalendars as gwListCalendars,
  listEventInstances as gwListEventInstances, getCalendar as gwGetCalendar, listAcl as gwListAcl, moveCalendarEvent as gwMoveEvent,
  getDriveFile as gwGetDriveFile, createDriveFile as gwCreateDriveFile, deleteDriveFile as gwDeleteDriveFile, createDrivePermission as gwCreateDrivePermission,
  copyDriveFile as gwCopyDriveFile, updateDriveFile as gwUpdateDriveFile, listDrivePermissions as gwListDrivePermissions, deleteDrivePermission as gwDeleteDrivePermission,
  updateSheetValues as gwUpdateSheetValues, clearSheetValues as gwClearSheetValues, createSpreadsheet as gwCreateSpreadsheet, batchUpdateSpreadsheet as gwBatchUpdateSpreadsheet, createDocument as gwCreateDocument,
  getSpreadsheet as gwGetSpreadsheet, batchUpdateSheetValues as gwBatchUpdateSheetValues, updateDocument as gwUpdateDocument,
} from "../../connectors/google-workspace/src/actions";
import { healthcheck as googleWorkspaceHealthcheck } from "../../connectors/google-workspace/src/healthcheck";
import { executeMessagesListSync as listGmailMessages, executeFilesListSync as listDriveFiles, executeEventsListSync as listCalendarEvents, executeSheetsRowsSync as listSheetRows, executeSheetsWorksheetsSync as listWorksheets } from "../../connectors/google-workspace/src/sync";
import microsoft365Manifest from "../../connectors/microsoft-365/manifest.json";
import {
  sendMessage as sendOutlookMessage,
  getMessage as msGetMessage, replyMessage as msReplyMessage, moveMessage as msMoveMessage, deleteMessage as msDeleteMessage, createMessage as msCreateMessage, listMailFolders as msListMailFolders, getMailFolder as msGetMailFolder,
  createEvent as msCreateEvent, updateEvent as msUpdateEvent, deleteEvent as msDeleteEvent, getEvent as msGetEvent, getCalendar as msGetCalendar,
  getDriveItem as msGetDriveItem, deleteDriveItem as msDeleteDriveItem, copyDriveItem as msCopyDriveItem, updateDriveItem as msUpdateDriveItem,
  createContact as msCreateContact, listContacts as msListContacts, getContact as msGetContact, updateContact as msUpdateContact,
  getMe as msGetMe,
} from "../../connectors/microsoft-365/src/actions";
import { healthcheck as microsoft365Healthcheck } from "../../connectors/microsoft-365/src/healthcheck";
import { executeMessagesListSync as listOutlookMessages, executeEventsListSync as listOutlookEvents, executeCalendarsListSync as listOutlookCalendars, executeFilesListSync as listOneDriveFiles } from "../../connectors/microsoft-365/src/sync";
import githubManifest from "../../connectors/github/manifest.json";
import {
  createIssue, createIssueComment, createPullRequest, mergePullRequest,
  getIssue as ghGetIssue, updateIssue as ghUpdateIssue, addIssueLabels as ghAddIssueLabels,
  getPullRequest as ghGetPullRequest, updatePullRequest as ghUpdatePullRequest, listPullRequestFiles as ghListPullRequestFiles,
  getRepo as ghGetRepo, createRepo as ghCreateRepo, listRepos as ghListRepos, getRepoContents as ghGetRepoContents,
  getBranch as ghGetBranch, createBranch as ghCreateBranch, createRelease as ghCreateRelease, createGist as ghCreateGist,
  listReleases as ghListReleases,
  getRelease as ghGetRelease,
  getLatestRelease as ghGetLatestRelease,
  getReleaseByTag as ghGetReleaseByTag,
  updateRelease as ghUpdateRelease,
  listReleaseAssets as ghListReleaseAssets,
  generateReleaseNotes as ghGenerateReleaseNotes,
  deleteRelease as ghDeleteRelease,
  getReleaseAsset as ghGetReleaseAsset,
  uploadReleaseAsset as ghUploadReleaseAsset,
  listTags as ghListTags,
  listGists as ghListGists,
  getGist as ghGetGist,
  updateGist as ghUpdateGist,
  deleteGist as ghDeleteGist,
  listIssueComments as ghListIssueComments,
  updateIssueComment as ghUpdateIssueComment,
  deleteIssueComment as ghDeleteIssueComment,
  addIssueAssignees as ghAddIssueAssignees,
  removeIssueAssignees as ghRemoveIssueAssignees,
  removeIssueLabels as ghRemoveIssueLabels,
  setIssueLabels as ghSetIssueLabels,
  lockIssue as ghLockIssue,
  unlockIssue as ghUnlockIssue,
  listLabels as ghListLabels,
  searchIssues as ghSearchIssues,
  searchPullRequests as ghSearchPullRequests,
  listPullRequestReviews as ghListPrReviews,
  createPullRequestReview as ghCreatePrReview,
  dismissPullRequestReview as ghDismissPrReview,
  listPullRequestReviewComments as ghListPrReviewComments,
  createPullRequestReviewComment as ghCreatePrReviewComment,
  replyPullRequestReviewComment as ghReplyPrReviewComment,
  addPullRequestRequestedReviewers as ghAddRequestedReviewers,
  removePullRequestRequestedReviewers as ghRemoveRequestedReviewers,
  listPullRequestCommits as ghListPrCommits,
  checkPullRequestMerged as ghCheckPrMerged,
  convertPullRequestToDraft as ghConvertPrToDraft,
  markPullRequestReady as ghMarkPrReady,
  listWorkflows as ghListWorkflows,
  getWorkflow as ghGetWorkflow,
  listWorkflowRuns as ghListWorkflowRuns,
  getWorkflowRun as ghGetWorkflowRun,
  cancelWorkflowRun as ghCancelWorkflowRun,
  rerunWorkflowRun as ghRerunWorkflowRun,
  dispatchWorkflow as ghDispatchWorkflow,
  listWorkflowJobs as ghListWorkflowJobs,
  getWorkflowJob as ghGetWorkflowJob,
  getWorkflowJobLogs as ghGetWorkflowJobLogs,
  listArtifacts as ghListArtifacts,
  getArtifact as ghGetArtifact,
  downloadWorkflowRunLogs as ghDownloadWorkflowRunLogs,
  downloadArtifact as ghDownloadArtifact,
  rerunFailedWorkflowJobs as ghRerunFailedWorkflowJobs,
  searchUsers as ghSearchUsers,
  getAuthenticatedUser as ghGetAuthenticatedUser,
  getUserByUsername as ghGetUserByUsername,
  listUserRepos as ghListUserRepos,
  listPublicUserEvents as ghListPublicUserEvents,
  listPublicReceivedUserEvents as ghListPublicReceivedUserEvents,
  listUserKeys as ghListUserKeys,
  listUserStarred as ghListUserStarred,
  listAuthenticatedStarred as ghListAuthenticatedStarred,
  listUserSocialAccounts as ghListUserSocialAccounts,
  listAuthenticatedSocialAccounts as ghListAuthenticatedSocialAccounts,
  listUserSshSigningKeys as ghListUserSshSigningKeys,
  getUserHovercard as ghGetUserHovercard,
  listUserEmails as ghListUserEmails,
  listUserEvents as ghListUserEvents,
  listUserReceivedEvents as ghListUserReceivedEvents,
  listUserGpgKeys as ghListUserGpgKeys,
  listMarketplacePurchases as ghListMarketplacePurchases,
  listMarketplacePurchasesStubbed as ghListMarketplacePurchasesStubbed,
  listUserBlocks as ghListUserBlocks,
  getEnvironmentSecretsPublicKey as ghGetEnvironmentSecretsPublicKey,
  getEnvironmentSecret as ghGetEnvironmentSecret,
  getCodespacesSecret as ghGetCodespacesSecret,
  getCodespacesSecretsPublicKey as ghGetCodespacesSecretsPublicKey,
  getOrg as ghGetOrg,
  listOrgs as ghListOrgs,
  listOrgMembers as ghListOrgMembers,
  listOrgRepos as ghListOrgRepos,
  listCheckRunsForRef as ghListCheckRunsForRef, getCheckRun as ghGetCheckRun, listCheckSuitesForRef as ghListCheckSuitesForRef,
  getCommitStatus as ghGetCommitStatus, listCommitStatuses as ghListCommitStatuses, createCommitStatus as ghCreateCommitStatus,
  getCommit as ghGetCommit, compareRepos as ghCompareRepos, updatePullRequestBranch as ghUpdatePullRequestBranch,
  listBranches as ghListBranches,
  getLabel as ghGetLabel,
  createLabel as ghCreateLabel,
  updateLabel as ghUpdateLabel,
  deleteLabel as ghDeleteLabel,
  listMilestones as ghListMilestones,
  getMilestone as ghGetMilestone,
  createMilestone as ghCreateMilestone,
  updateMilestone as ghUpdateMilestone,
  listCollaborators as ghListCollaborators,
  addCollaborator as ghAddCollaborator,
  removeCollaborator as ghRemoveCollaborator,
  checkCollaborator as ghCheckCollaborator,
  listDiscussionCategories as ghListDiscussionCategories,
  listDiscussions as ghListDiscussions,
  getDiscussion as ghGetDiscussion,
  createDiscussion as ghCreateDiscussion,
  updateDiscussion as ghUpdateDiscussion,
  listDiscussionComments as ghListDiscussionComments,
  createDiscussionComment as ghCreateDiscussionComment,
  updateDiscussionComment as ghUpdateDiscussionComment,
  putContents as ghPutContents, deleteContents as ghDeleteContents, pushFiles as ghPushFiles,
  createGitBlob as ghCreateGitBlob, getGitBlob as ghGetGitBlob,
  createGitTree as ghCreateGitTree, getGitTree as ghGetGitTree,
  createGitRef as ghCreateGitRef, updateGitRef as ghUpdateGitRef, getGitRef as ghGetGitRef,
  listGitRefs as ghListGitRefs, deleteGitRef as ghDeleteGitRef,
  getGitTag as ghGetGitTag, createGitTag as ghCreateGitTag,
  createGitCommit as ghCreateGitCommit, getRepoTree as ghGetRepoTree,
  searchCode as ghSearchCode, searchCommits as ghSearchCommits, searchRepositories as ghSearchRepositories, searchOrgs as ghSearchOrgs,
  getUsersAuthenticated as ghGetUsersAuthenticated,
  listPullRequestComments as ghListPullRequestComments,
  updateRepo as ghUpdateRepo,
  deleteBranch as ghDeleteBranch,
  createCommitComment as ghCreateCommitComment,
  getPullRequestReview as ghGetPullRequestReview,
  submitPullRequestReview as ghSubmitPullRequestReview,
  updatePullRequestReviewComment as ghUpdatePullRequestReviewComment,
  deletePullRequestReviewComment as ghDeletePullRequestReviewComment,
  deletePendingPullRequestReview as ghDeletePendingPullRequestReview,
  listCommitComments as ghListCommitComments,
  updateCommitComment as ghUpdateCommitComment,
  deleteCommitComment as ghDeleteCommitComment,
  listIssueTimeline as ghListIssueTimeline,
  listIssueEvents as ghListIssueEvents,
  listCheckAnnotations as ghListCheckAnnotations,
  createCheckRun as ghCreateCheckRun,
  listNotifications as ghListNotifications,
  getNotification as ghGetNotification,
  markNotificationRead as ghMarkNotificationRead,
  markAllNotificationsRead as ghMarkAllNotificationsRead,
  listOrgTeams as ghListOrgTeams,
  listTeamMembers as ghListTeamMembers,
  addTeamMembership as ghAddTeamMembership,
  forkRepo as ghForkRepo,
  starRepo as ghStarRepo,
  unstarRepo as ghUnstarRepo,
  listDeployments as ghListDeployments,
  getDeployment as ghGetDeployment,
  createDeployment as ghCreateDeployment,
  listDeploymentStatuses as ghListDeploymentStatuses,
  createDeploymentStatus as ghCreateDeploymentStatus,
  listEnvironments as ghListEnvironments,
  getEnvironment as ghGetEnvironment,
  getCollaboratorPermission as ghGetCollaboratorPermission,
  getBranchProtection as ghGetBranchProtection,
  listRepoRulesets as ghListRepoRulesets,
  getRulesForBranch as ghGetRulesForBranch,
  listRepoHooks as ghListRepoHooks,
  getOrgHook as ghGetOrgHook,
  getRepoHook as ghGetRepoHook,
  getOrgHookConfig as ghGetOrgHookConfig,
  getRepoHookConfig as ghGetRepoHookConfig,
  getOrgHookDelivery as ghGetOrgHookDelivery,
  getRepoHookDelivery as ghGetRepoHookDelivery,
  listOrgHookDeliveries as ghListOrgHookDeliveries,
  listRepoHookDeliveries as ghListRepoHookDeliveries,
  getTeamMembership as ghGetTeamMembership,
  listTeamRepos as ghListTeamRepos,
  listRepoInvitations as ghListRepoInvitations,
  createOrgRepo as ghCreateOrgRepo,
  createTeam as ghCreateTeam,
  createRepoHook as ghCreateRepoHook,
  removeTeamMembership as ghRemoveTeamMembership,
  dispatchRepo as ghDispatchRepo,
  listDependabotAlerts as ghListDependabotAlerts,
  listCodeScanningAlerts as ghListCodeScanningAlerts,
  getCodeScanningAlert as ghGetCodeScanningAlert,
  updateCodeScanningAlert as ghUpdateCodeScanningAlert,
  listSecretScanningAlerts as ghListSecretScanningAlerts,
  listActionsVariables as ghListActionsVariables,
  listActionsSecrets as ghListActionsSecrets,
  listPendingDeployments as ghListPendingDeployments,
  reviewPendingDeployments as ghReviewPendingDeployments,
  listRunApprovals as ghListRunApprovals,
  createEnvironment as ghCreateEnvironment,
  deleteDeployment as ghDeleteDeployment,
  deleteEnvironment as ghDeleteEnvironment,
  disableWorkflow as ghDisableWorkflow,
  enableWorkflow as ghEnableWorkflow,
  deleteArtifact as ghDeleteArtifact,
  getRunAttempt as ghGetRunAttempt,
  listAttemptJobs as ghListAttemptJobs,
  downloadAttemptLogs as ghDownloadAttemptLogs,
  forceCancelRun as ghForceCancelRun,
  updateCheckRun as ghUpdateCheckRun,
  rerequestCheckRun as ghRerequestCheckRun,
  getCheckSuite as ghGetCheckSuite,
  rerequestCheckSuite as ghRerequestCheckSuite,
  listRequestedReviewers as ghListRequestedReviewers,
  getPullRequestReviewComment as ghGetPullRequestReviewComment,
  listReviewCommentsForReview as ghListPullRequestReviewComments,
  getIssueComment as ghGetIssueComment,
  listIssueLabels as ghListIssueLabels,
  getCommitComment as ghGetCommitComment,
  getActionsVariable as ghGetActionsVariable,
  createActionsVariable as ghCreateActionsVariable,
  updateActionsVariable as ghUpdateActionsVariable,
  deleteActionsVariable as ghDeleteActionsVariable,
  listRunsForWorkflow as ghListRunsForWorkflow,
  listCaches as ghListCaches,
  deleteCache as ghDeleteCache,
  deleteCachesByKey as ghDeleteCachesByKey,
  rerunJob as ghRerunJob,
  deleteRun as ghDeleteRun,
  approveRun as ghApproveRun,
  listRuleSuites as ghListRuleSuites,
  getRuleSuite as ghGetRuleSuite,
  getRepoRuleset as ghGetRepoRuleset,
  listCommitPulls as ghListCommitPulls,
  listBranchesWhereHead as ghListBranchesWhereHead,
  getGitCommit as ghGetGitCommit,
  listEnvironmentVariables as ghListEnvironmentVariables,
  getEnvironmentVariable as ghGetEnvironmentVariable,
  createEnvironmentVariable as ghCreateEnvironmentVariable,
  updateEnvironmentVariable as ghUpdateEnvironmentVariable,
  deleteEnvironmentVariable as ghDeleteEnvironmentVariable,
  listRepoOrganizationVariables as ghListRepoOrganizationVariables,
  listOrgVariables as ghListOrgVariables,
  getOrgVariable as ghGetOrgVariable,
  createOrgVariable as ghCreateOrgVariable,
  updateOrgVariable as ghUpdateOrgVariable,
  deleteOrgVariable as ghDeleteOrgVariable,
  getWorkflowPermissions as ghGetWorkflowPermissions,
  setWorkflowPermissions as ghSetWorkflowPermissions,
  getActionsPermissions as ghGetActionsPermissions,
  setActionsPermissions as ghSetActionsPermissions,
  getSelectedActions as ghGetSelectedActions,
  setSelectedActions as ghSetSelectedActions,
  listDeploymentBranchPolicies as ghListDeploymentBranchPolicies,
  getDeploymentBranchPolicy as ghGetDeploymentBranchPolicy,
  createDeploymentBranchPolicy as ghCreateDeploymentBranchPolicy,
  updateDeploymentBranchPolicy as ghUpdateDeploymentBranchPolicy,
  deleteDeploymentBranchPolicy as ghDeleteDeploymentBranchPolicy,
  mergeUpstream as ghMergeUpstream,
  renameBranch as ghRenameBranch,
  mergeBranches as ghMergeBranches,
  updatePullRequestReview as ghUpdatePullRequestReview,
  listCodeownersErrors as ghListCodeownersErrors,
  compareDependencyGraph as ghCompareDependencyGraph,
  listCodeScanningAlertInstances as ghListCodeScanningAlertInstances,
  listCodeScanningAnalyses as ghListCodeScanningAnalyses,
  getCodeScanningAnalysis as ghGetCodeScanningAnalysis,
  getDeploymentStatus as ghGetDeploymentStatus,
  listCheckRunsForSuite as ghListCheckRunsForSuite,
  getRepoAutolink as ghGetRepoAutolink,
  getRepoReadme as ghGetRepoReadme,
  getRepoReadmeForDir as ghGetRepoReadmeForDir,
  getRepoSubscription as ghGetRepoSubscription,
  getRepoCommunityProfile as ghGetRepoCommunityProfile,
  getRepoInteractionLimits as ghGetRepoInteractionLimits,
  getRepoSecurityAdvisory as ghGetRepoSecurityAdvisory,
  getRepoLicense as ghGetRepoLicense,
  listOrgAttestationRepositories as ghListOrgAttestationRepositories,
  listRepoStatsContributors as ghListRepoStatsContributors,
  getRepoTrafficViews as ghGetRepoTrafficViews,
  getRepoTrafficClones as ghGetRepoTrafficClones,
  getRepoStatsPunchCard as ghGetRepoStatsPunchCard,
  listRepoStatsCommitActivity as ghListRepoStatsCommitActivity,
  getRepoStatsCodeFrequency as ghGetRepoStatsCodeFrequency,
  getRepoStatsParticipation as ghGetRepoStatsParticipation,
  listRepoTrafficPopularPaths as ghListRepoTrafficPopularPaths,
  listRepoTrafficPopularReferrers as ghListRepoTrafficPopularReferrers,
  listRepoNetworkEvents as ghListRepoNetworkEvents,
  listPublicRepositories as ghListPublicRepositories,
  listRepoActivity as ghListRepoActivity,
  listRepoContributors as ghListRepoContributors,
  listRepoEvents as ghListRepoEvents,
  listRepoLanguages as ghListRepoLanguages,
  listRepoSecurityAdvisories as ghListRepoSecurityAdvisories,
  getRepoTopics as ghGetRepoTopics,
  checkOrgBlock as ghCheckOrgBlock,
  checkOrgPublicMember as ghCheckOrgPublicMember,
  getOrganizationRole as ghGetOrganizationRole,
  getOrgInteractionLimits as ghGetOrgInteractionLimits,
  listPublicOrgs as ghListPublicOrgs,
  listUserOrgs as ghListUserOrgs,
  listUserOrgEvents as ghListUserOrgEvents,
  listOutsideCollaborators as ghListOutsideCollaborators,
  listOrgEvents as ghListOrgEvents,
  listPublicOrgMembers as ghListPublicOrgMembers,
  listOrgBlocks as ghListOrgBlocks,
  listRepoEnvironmentSecrets as ghListRepoEnvironmentSecrets,
  listRepoOrganizationSecrets as ghListRepoOrganizationSecrets,
  listUserCodespacesSecrets as ghListUserCodespacesSecrets,
  listUserCodespacesSecretRepositories as ghListUserCodespacesSecretRepositories,
  getBranchProtectionRestrictions as ghGetBranchProtectionRestrictions,
  getBranchProtectionEnforceAdmins as ghGetBranchProtectionEnforceAdmins,
  getBranchProtectionRequiredSignatures as ghGetBranchProtectionRequiredSignatures,
  getEnvironmentDeploymentProtectionRule as ghGetEnvironmentDeploymentProtectionRule,
  getRequiredPullRequestReviews as ghGetRequiredPullRequestReviews,
  getRequiredStatusChecks as ghGetRequiredStatusChecks,
  listBranchProtectionRestrictionTeams as ghListBranchProtectionRestrictionTeams,
  listBranchProtectionRestrictionUsers as ghListBranchProtectionRestrictionUsers,
  listUserProjectFields as ghListUserProjectFields,
  listOrgRoleUsers as ghListOrgRoleUsers,
  getRepoTarball as ghGetRepoTarball,
  getRepoZipball as ghGetRepoZipball,
  checkRepoAssignee as ghCheckRepoAssignee,
  checkUserBlocked as ghCheckUserBlocked,
  getNotificationThreadSubscription as ghGetNotificationThreadSubscription,
  getUserBillingUsage as ghGetUserBillingUsage,
  getApp as ghGetApp,
  getOrgPackage as ghGetOrgPackage,
  getUserPackage as ghGetUserPackage,
  getAuthenticatedUserPackage as ghGetAuthenticatedUserPackage,
  getOrgPackageVersion as ghGetOrgPackageVersion,
  getUserPackageVersion as ghGetUserPackageVersion,
  getAuthenticatedPackageVersion as ghGetAuthenticatedPackageVersion,
  listOrgPackages as ghListOrgPackages,
  listUserPackages as ghListUserPackages,
  listUserPackageVersions as ghListUserPackageVersions,
  getRepoCodespaceDefaults as ghGetRepoCodespaceDefaults,
  getCodespaceExport as ghGetCodespaceExport,
  listRepoCodespaceMachines as ghListRepoCodespaceMachines,
  listOrgMemberCodespaces as ghListOrgMemberCodespaces,
  listUserCodespaces as ghListUserCodespaces,
  listOrgCodespaces as ghListOrgCodespaces,
  listCodespaceMachines as ghListCodespaceMachines,
  getCodeOfConduct as ghGetCodeOfConduct,
  listRepoAssignees as ghListRepoAssignees,
  listPublicEvents as ghListPublicEvents,
  listRepoForks as ghListRepoForks,
  searchTopics as ghSearchTopics,
  searchLabels as ghSearchLabels,
  listOrgHooks as ghListOrgHooks,
  listIssueReactions as ghListIssueReactions,
  listIssueCommentReactions as ghListIssueCommentReactions,
  listCommitCommentReactions as ghListCommitCommentReactions,
  listReviewCommentReactions as ghListReviewCommentReactions,
  listReleaseReactions as ghListReleaseReactions,
  getOrgActionsRunner as ghGetOrgActionsRunner,
  getRepoActionsRunner as ghGetRepoActionsRunner,
  listRepoActionsRunnerLabels as ghListRepoActionsRunnerLabels,
  listOrgRunnerDownloads as ghListOrgRunnerDownloads,
  listRepoRunnerDownloads as ghListRepoRunnerDownloads,
  listOrgActionsRunners as ghListOrgActionsRunners,
  listRepoActionsRunners as ghListRepoActionsRunners,
  checkUserFollowing as ghCheckUserFollowing,
  listUserFollowers as ghListUserFollowers,
  listAuthenticatedUserFollowers as ghListAuthenticatedUserFollowers,
  listUserSubscriptions as ghListUserSubscriptions,
  listAuthenticatedUserSubscriptions as ghListAuthenticatedUserSubscriptions,
  listRepoStargazers as ghListRepoStargazers,
  listUserFollowing as ghListUserFollowing,
  listAuthenticatedUserFollowing as ghListAuthenticatedUserFollowing,
  listRepoSubscribers as ghListRepoSubscribers,
  checkGistStar as ghCheckGistStar,
  getGistComment as ghGetGistComment,
  getGistRevision as ghGetGistRevision,
  listUserGists as ghListUserGists,
  listGistComments as ghListGistComments,
  listGistCommits as ghListGistCommits,
  listGistForks as ghListGistForks,
  listPublicGists as ghListPublicGists,
  listStarredGists as ghListStarredGists,
  checkIssueAssignee as ghCheckIssueAssignee,
  getIssueEvent as ghGetIssueEvent,
  listAssignedIssues as ghListAssignedIssues,
  listRepoIssueComments as ghListRepoIssueComments,
  listRepoIssueEvents as ghListRepoIssueEvents,
  listMilestoneLabels as ghListMilestoneLabels,
  listIssueSubIssues as ghListIssueSubIssues,
  getOrgTeamRepoPermission as ghGetOrgTeamRepoPermission,
  getOrgTeam as ghGetOrgTeam,
  listOrgChildTeams as ghListOrgChildTeams,
  listOrgTeamInvitations as ghListOrgTeamInvitations,
  listRepoTeams as ghListRepoTeams,
  listAuthenticatedUserTeams as ghListAuthenticatedUserTeams,
  listOrgRoleTeams as ghListOrgRoleTeams,
  getOrgActionsWorkflowPermissions as ghGetOrgActionsWorkflowPermissions,
  getOrgActionsCacheUsage as ghGetOrgActionsCacheUsage,
  getRepoActionsCacheUsage as ghGetRepoActionsCacheUsage,
  getOrgActionsPermissions as ghGetOrgActionsPermissions,
  getActionsRunTiming as ghGetActionsRunTiming,
  getActionsWorkflowTiming as ghGetActionsWorkflowTiming,
  getZen as ghGetZen,
  getLicense as ghGetLicense,
  getGitignoreTemplate as ghGetGitignoreTemplate,
  getRepoPagesBuild as ghGetRepoPagesBuild,
  getLatestRepoPagesBuild as ghGetLatestRepoPagesBuild,
  getRepoPagesDeployment as ghGetRepoPagesDeployment,
  listRepoPagesBuilds as ghListRepoPagesBuilds,
  getCodeScanningSarif as ghGetCodeScanningSarif,
  listCodeqlDatabases as ghListCodeqlDatabases,
  listOrgCodeScanningAlerts as ghListOrgCodeScanningAlerts,
  getGlobalAdvisory as ghGetGlobalAdvisory,
  listGlobalAdvisories as ghListGlobalAdvisories,
  getEmojis as ghGetEmojis,
  getFeeds as ghGetFeeds,
  getMeta as ghGetMeta,
  listMetaVersions as ghListMetaVersions,
  getOctocat as ghGetOctocat,
  getMetaRoot as ghGetMetaRoot,
  getRepoDependencyGraphSbom as ghGetRepoDependencyGraphSbom,
  getCodeqlDatabase as ghGetCodeqlDatabase,
  getCodeScanningDefaultSetup as ghGetCodeScanningDefaultSetup,
  getOrgPropertySchema as ghGetOrgPropertySchema,
  getOrgProjectItem as ghGetOrgProjectItem,
  getRepoPagesHealth as ghGetRepoPagesHealth,
  getRepoPages as ghGetRepoPages,
  getUserProjectItem as ghGetUserProjectItem,
  listRepoIssueTypes as ghListRepoIssueTypes,
  listOrgProjects as ghListOrgProjects,
  listUserProjectItems as ghListUserProjectItems,
  listUserProjectViewItems as ghListUserProjectViewItems,
  listUserProjects as ghListUserProjects,
  getRateLimit as ghGetRateLimit,
  listRepoComments as ghListRepoComments,
  getRepoKey as ghGetRepoKey,
  listRepoKeys as ghListRepoKeys,
  listRepoPullComments as ghListRepoPullComments,
  assignOrgRoleToUser as ghAssignOrgRoleToUser,
  blockOrgUser as ghBlockOrgUser,
  deleteOrg as ghDeleteOrg,
  removeAllOrgRolesFromUser as ghRemoveAllOrgRolesFromUser,
  removeOrgMember as ghRemoveOrgMember,
  removeOrgRoleFromUser as ghRemoveOrgRoleFromUser,
  deleteOrgPropertySchema as ghDeleteOrgPropertySchema,
  deleteOrgInteractionLimits as ghDeleteOrgInteractionLimits,
  removeOutsideCollaborator as ghRemoveOutsideCollaborator,
  setOrgInteractionLimits as ghSetOrgInteractionLimits,
  unblockOrgUser as ghUnblockOrgUser,
  unlockOrgMigrationRepo as ghUnlockOrgMigrationRepo,
  updateOrg as ghUpdateOrg,
  acceptRepositoryInvitation as ghAcceptRepositoryInvitation,
  createRepoAutolink as ghCreateRepoAutolink,
  generateRepoFromTemplate as ghGenerateRepoFromTemplate,
  createDependencySnapshot as ghCreateDependencySnapshot,
  declineRepositoryInvitation as ghDeclineRepositoryInvitation,
  deleteRepo as ghDeleteRepo,
  deleteRepoInvitation as ghDeleteRepoInvitation,
  deleteRepoSubscription as ghDeleteRepoSubscription,
  markRepoNotificationsRead as ghMarkRepoNotificationsRead,
  deleteRepoInteractionLimits as ghDeleteRepoInteractionLimits,
  transferRepo as ghTransferRepo,
  updateRepoInvitation as ghUpdateRepoInvitation,
  updateCheckSuitePreferences as ghUpdateCheckSuitePreferences,
  replaceRepoTopics as ghReplaceRepoTopics,
  setRepoSubscription as ghSetRepoSubscription,
  setRepoInteractionLimits as ghSetRepoInteractionLimits,
  addUserEmails as ghAddUserEmails,
  addUserSocialAccounts as ghAddUserSocialAccounts,
  blockUser as ghBlockUser,
  addCodespaceSecretRepository as ghAddCodespaceSecretRepository,
  upsertEnvironmentSecret as ghUpsertEnvironmentSecret,
  upsertCodespaceSecret as ghUpsertCodespaceSecret,
  deleteUserSocialAccounts as ghDeleteUserSocialAccounts,
  unblockUser as ghUnblockUser,
  unlockUserMigrationRepo as ghUnlockUserMigrationRepo,
  deleteCodespaceSecret as ghDeleteCodespaceSecret,
  deleteEnvironmentSecret as ghDeleteEnvironmentSecret,
  updateAuthenticatedUser as ghUpdateAuthenticatedUser,
  removeCodespaceSecretRepository as ghRemoveCodespaceSecretRepository,
  setCodespaceSecretRepositories as ghSetCodespaceSecretRepositories,
  addBranchProtectionRestrictionApps as ghAddBranchProtectionRestrictionApps,
  addBranchProtectionStatusCheckContexts as ghAddBranchProtectionStatusCheckContexts,
  addBranchProtectionRestrictionTeams as ghAddBranchProtectionRestrictionTeams,
  addBranchProtectionRestrictionUsers as ghAddBranchProtectionRestrictionUsers,
  createBranchProtectionRequiredSignatures as ghCreateBranchProtectionRequiredSignatures,
  deleteBranchProtectionRestrictions as ghDeleteBranchProtectionRestrictions,
  deleteBranchProtectionEnforceAdmins as ghDeleteBranchProtectionEnforceAdmins,
  deleteBranchProtection as ghDeleteBranchProtection,
  deleteBranchProtectionRequiredSignatures as ghDeleteBranchProtectionRequiredSignatures,
  deleteBranchProtectionRequiredPullRequestReviews as ghDeleteBranchProtectionRequiredPullRequestReviews,
  deleteEnvironmentDeploymentProtectionRule as ghDeleteEnvironmentDeploymentProtectionRule,
  removeBranchProtectionRestrictionApps as ghRemoveBranchProtectionRestrictionApps,
  removeBranchProtectionStatusCheckContexts as ghRemoveBranchProtectionStatusCheckContexts,
  deleteBranchProtectionRequiredStatusChecks as ghDeleteBranchProtectionRequiredStatusChecks,
  removeBranchProtectionRestrictionTeams as ghRemoveBranchProtectionRestrictionTeams,
  removeBranchProtectionRestrictionUsers as ghRemoveBranchProtectionRestrictionUsers,
  createBranchProtectionEnforceAdmins as ghCreateBranchProtectionEnforceAdmins,
  setBranchProtectionRestrictionApps as ghSetBranchProtectionRestrictionApps,
  setBranchProtectionStatusCheckContexts as ghSetBranchProtectionStatusCheckContexts,
  setBranchProtectionRestrictionTeams as ghSetBranchProtectionRestrictionTeams,
  setBranchProtectionRestrictionUsers as ghSetBranchProtectionRestrictionUsers,
  updateBranchProtection as ghUpdateBranchProtection,
  updateBranchProtectionRequiredPullRequestReviews as ghUpdateBranchProtectionRequiredPullRequestReviews,
  updateBranchProtectionRequiredStatusChecks as ghUpdateBranchProtectionRequiredStatusChecks,
  deleteUserProjectItem as ghDeleteUserProjectItem,
  createCheckSuite as ghCreateCheckSuite,
  deleteThreadSubscription as ghDeleteThreadSubscription,
  markThreadDone as ghMarkThreadDone,
  setThreadSubscription as ghSetThreadSubscription,
  deleteMilestone as ghDeleteMilestone,
  createOrgRunnerRegistrationToken as ghCreateOrgRunnerRegistrationToken,
  createRepoRunnerRegistrationToken as ghCreateRepoRunnerRegistrationToken,
  createOrgRunnerRemoveToken as ghCreateOrgRunnerRemoveToken,
  createRepoRunnerRemoveToken as ghCreateRepoRunnerRemoveToken,
  addInstallationRepository as ghAddInstallationRepository,
  removeInstallationRepository as ghRemoveInstallationRepository,
  deleteAuthenticatedPackageVersion as ghDeleteAuthenticatedPackageVersion,
  deleteOrgPackageVersion as ghDeleteOrgPackageVersion,
  deleteUserPackageVersion as ghDeleteUserPackageVersion,
  restoreOrgPackage as ghRestoreOrgPackage,
  restoreUserPackage as ghRestoreUserPackage,
  restoreAuthenticatedPackage as ghRestoreAuthenticatedPackage,
  restoreAuthenticatedPackageVersion as ghRestoreAuthenticatedPackageVersion,
  restoreOrgPackageVersion as ghRestoreOrgPackageVersion,
  restoreUserPackageVersion as ghRestoreUserPackageVersion,
  addOrgCodespacesAccessSelectedUsers as ghAddOrgCodespacesAccessSelectedUsers,
  createUserCodespace as ghCreateUserCodespace,
  createRepoCodespace as ghCreateRepoCodespace,
  createPullCodespace as ghCreatePullCodespace,
  publishCodespace as ghPublishCodespace,
  createCodespaceExport as ghCreateCodespaceExport,
  setOrgCodespacesAccess as ghSetOrgCodespacesAccess,
  startUserCodespace as ghStartUserCodespace,
  stopOrgMemberCodespace as ghStopOrgMemberCodespace,
  stopUserCodespace as ghStopUserCodespace,
  createOrgHook as ghCreateOrgHook,
  deleteRepoHook as ghDeleteRepoHook,
  deleteOrgHook as ghDeleteOrgHook,
  pingOrgHook as ghPingOrgHook,
  pingRepoHook as ghPingRepoHook,
  redeliverOrgHookDelivery as ghRedeliverOrgHookDelivery,
  redeliverRepoHookDelivery as ghRedeliverRepoHookDelivery,
  updateOrgHook as ghUpdateOrgHook,
  updateRepoHook as ghUpdateRepoHook,
  createIssueReaction as ghCreateIssueReaction,
  createIssueCommentReaction as ghCreateIssueCommentReaction,
  createCommitCommentReaction as ghCreateCommitCommentReaction,
  createPullReviewCommentReaction as ghCreatePullReviewCommentReaction,
  createReleaseReaction as ghCreateReleaseReaction,
  deleteReleaseReaction as ghDeleteReleaseReaction,
  deleteCommitCommentReaction as ghDeleteCommitCommentReaction,
  deleteIssueCommentReaction as ghDeleteIssueCommentReaction,
  deleteIssueReaction as ghDeleteIssueReaction,
  deletePullReviewCommentReaction as ghDeletePullReviewCommentReaction,
  deleteOrgActionsRunner as ghDeleteOrgActionsRunner,
  deleteRepoActionsRunner as ghDeleteRepoActionsRunner,
  followUser as ghFollowUser,
  unfollowUser as ghUnfollowUser,
  createGistComment as ghCreateGistComment,
  deleteGistComment as ghDeleteGistComment,
  updateGistComment as ghUpdateGistComment,
  createGistFork as ghCreateGistFork,
  starGist as ghStarGist,
  unstarGist as ghUnstarGist,
  addSubIssue as ghAddSubIssue,
  removeAllIssueLabels as ghRemoveAllIssueLabels,
  addTeamRepo as ghAddTeamRepo,
  assignOrgRoleToTeam as ghAssignOrgRoleToTeam,
  deleteOrgTeam as ghDeleteOrgTeam,
  removeAllOrgRolesFromTeam as ghRemoveAllOrgRolesFromTeam,
  removeOrgRoleFromTeam as ghRemoveOrgRoleFromTeam,
  removeTeamRepo as ghRemoveTeamRepo,
  updateOrgTeam as ghUpdateOrgTeam,
  addOrgVariableRepository as ghAddOrgVariableRepository,
  deleteRunLogs as ghDeleteRunLogs,
  setOrgWorkflowPermissions as ghSetOrgWorkflowPermissions,
  setOrgActionsPermissions as ghSetOrgActionsPermissions,
  renderMarkdown as ghRenderMarkdown,
  cancelPagesDeployment as ghCancelPagesDeployment,
  createPagesDeployment as ghCreatePagesDeployment,
  createPagesSite as ghCreatePagesSite,
  deletePagesSite as ghDeletePagesSite,
  requestPagesBuild as ghRequestPagesBuild,
  createSecurityAdvisoryReport as ghCreateSecurityAdvisoryReport,
  createSecurityAdvisoryFork as ghCreateSecurityAdvisoryFork,
  createRepoKey as ghCreateRepoKey,
  deleteRepoKey as ghDeleteRepoKey,
  createRepoRuleset as ghCreateRepoRuleset,
  deleteRepoRuleset as ghDeleteRepoRuleset,
  updateRepoRuleset as ghUpdateRepoRuleset,
  deleteReleaseAsset as ghDeleteReleaseAsset,
  updateReleaseAsset as ghUpdateReleaseAsset,
  createUserProjectField as ghCreateUserProjectField,
  createUserProjectItem as ghCreateUserProjectItem,
  createUserProjectDraft as ghCreateUserProjectDraft,
  createUserProjectView as ghCreateUserProjectView,
  deleteAutolink as ghDeleteAutolink,
  deleteCodeScanningAnalysis as ghDeleteCodeScanningAnalysis,
  deleteUserPackage as ghDeleteUserPackage,
  removeRunnerLabel as ghRemoveRunnerLabel,
  testRepoHook as ghTestRepoHook,
  updateCodeScanningDefaultSetup as ghUpdateCodeScanningDefaultSetup,
  updateOrgHookConfig as ghUpdateOrgHookConfig,
  updateRepoHookConfig as ghUpdateRepoHookConfig,
  updateUserProjectItem as ghUpdateUserProjectItem,
  listUsers as ghListUsers,
  getUserById as ghGetUserById,
  checkAuthenticatedUserFollowing as ghCheckAuthenticatedUserFollowing,
  listAuthenticatedUserPublicEmails as ghListAuthenticatedUserPublicEmails,
  listAuthenticatedUserRepoInvitations as ghListAuthenticatedUserRepoInvitations,
  listAuthenticatedUserPackages as ghListAuthenticatedUserPackages,
  getAuthenticatedUserInteractionLimits as ghGetAuthenticatedUserInteractionLimits,
  setAuthenticatedUserInteractionLimits as ghSetAuthenticatedUserInteractionLimits,
  listUserAttestations as ghListUserAttestations,
  getUserPremiumRequestUsage as ghGetUserPremiumRequestUsage,
  getUserBillingUsageSummary as ghGetUserBillingUsageSummary,
  listCodesOfConduct as ghListCodesOfConduct,
  listLicenses as ghListLicenses,
  listGitignoreTemplates as ghListGitignoreTemplates,
  listOrgPropertySchemas as ghListOrgPropertySchemas,
  listOrgPropertyValues as ghListOrgPropertyValues,
  listOrganizationRoles as ghListOrganizationRoles,
  listOrgActionsRunnerLabels as ghListOrgActionsRunnerLabels,
  listOrgCodespacesSecrets as ghListOrgCodespacesSecrets,
  getOrgDependabotSecretsPublicKey as ghGetOrgDependabotSecretsPublicKey,
  listRepoAutolinks as ghListRepoAutolinks,
  listBranchProtectionRestrictionApps as ghListBranchProtectionRestrictionApps,
  listRequiredStatusCheckContexts as ghListRequiredStatusCheckContexts,
  listRepoPropertyValues as ghListRepoPropertyValues,
  listIssueDependenciesBlockedBy as ghListIssueDependenciesBlockedBy,
  listIssueDependenciesBlocking as ghListIssueDependenciesBlocking,
  listRepoNotifications as ghListRepoNotifications,
  listOrgProjectViewItems as ghListOrgProjectViewItems,
  listEnvironmentDeploymentProtectionRules as ghListEnvironmentDeploymentProtectionRules,
} from "../../connectors/github/src/actions";
import { healthcheck as githubHealthcheck } from "../../connectors/github/src/healthcheck";
import { executeIssuesListSync as listGitHubIssues, executePullRequestsListSync as listGitHubPRs, executeCommitsListSync as listGitHubCommits, executeRepositoriesListSync as listGitHubRepos } from "../../connectors/github/src/sync";
import salesforceManifest from "../../connectors/salesforce/manifest.json";
import {
  createContact, createLead, createOpportunity, createCase,
  createAccount as sfCreateAccount, getAccount as sfGetAccount, updateAccount as sfUpdateAccount, deleteAccount as sfDeleteAccount,
  getContact as sfGetContact, updateContact as sfUpdateContact, deleteContact as sfDeleteContact,
  updateLead as sfUpdateLead, deleteLead as sfDeleteLead, getOpportunity as sfGetOpportunity,
  updateOpportunity as sfUpdateOpportunity, deleteOpportunity as sfDeleteOpportunity,
  getCase as sfGetCase, updateCase as sfUpdateCase, deleteCase as sfDeleteCase,
  querySobjects as sfQuery, searchSobjects as sfSearch, describeSobject as sfDescribe,
  getCurrentUser as sfGetCurrentUser,
} from "../../connectors/salesforce/src/actions";
import { healthcheck as salesforceHealthcheck } from "../../connectors/salesforce/src/healthcheck";
import { executeContactsListSync as listSFContacts, executeLeadsListSync as listSFLeads, executeAccountsListSync as listSFAccounts, executeOpportunitiesListSync as listSFOpportunities, executeCasesListSync as listSFCases } from "../../connectors/salesforce/src/sync";
import hubspotManifest from "../../connectors/hubspot/manifest.json";
import {
  createContact as createHubSpotContact, createCompany as createHubSpotCompany, createDeal as createHubSpotDeal, createTicket as createHubSpotTicket,
  getContact as hsGetContact, updateContact as hsUpdateContact, deleteContact as hsDeleteContact, searchContacts as hsSearchContacts,
  getCompany as hsGetCompany, updateCompany as hsUpdateCompany, deleteCompany as hsDeleteCompany,
  getDeal as hsGetDeal, updateDeal as hsUpdateDeal, deleteDeal as hsDeleteDeal,
  getTicket as hsGetTicket, updateTicket as hsUpdateTicket,
  searchCompanies as hsSearchCompanies, searchDeals as hsSearchDeals, searchTickets as hsSearchTickets,
  createNote as hsCreateNote, createMeeting as hsCreateMeeting, createCall as hsCreateCall, createTask as hsCreateTask,
  listOwners as hsListOwners, listDealPipelines as hsListDealPipelines, createAssociation as hsCreateAssociation,
} from "../../connectors/hubspot/src/actions";
import { healthcheck as hubspotHealthcheck } from "../../connectors/hubspot/src/healthcheck";
import { executeContactsListSync as listHubSpotContacts, executeCompaniesListSync as listHubSpotCompanies, executeDealsListSync as listHubSpotDeals, executeTicketsListSync as listHubSpotTickets } from "../../connectors/hubspot/src/sync";
import linkedinManifest from "../../connectors/linkedin/manifest.json";
import { createPost as createLinkedInPost } from "../../connectors/linkedin/src/actions";
import { healthcheck as linkedinHealthcheck } from "../../connectors/linkedin/src/healthcheck";
import { executeProfileGetSync as getLinkedInProfile, executePostsListSync as listLinkedInPosts, executeOrganizationsListSync as listLinkedInOrgs } from "../../connectors/linkedin/src/sync";
import jiraManifest from "../../connectors/jira/manifest.json";
import {
  createIssue as createJiraIssue,
  getIssue as jiraGetIssue, updateIssue as jiraUpdateIssue, deleteIssue as jiraDeleteIssue,
  jqlSearch as jiraJqlSearch, addComment as jiraAddComment, listComments as jiraListComments,
  listTransitions as jiraListTransitions, doTransition as jiraDoTransition, assignIssue as jiraAssignIssue,
  getProject as jiraGetProject, getUser as jiraGetUser,
  getIssueChangelog as jiraGetIssueChangelog, addWatcher as jiraAddWatcher, createIssueLink as jiraCreateIssueLink,
  addWorklog as jiraAddWorklog, getMyself as jiraGetMyself, listFields as jiraListFields,
} from "../../connectors/jira/src/actions";
import { healthcheck as jiraHealthcheck } from "../../connectors/jira/src/healthcheck";
import { executeIssuesSearchSync as searchJiraIssues, executeProjectsListSync as listJiraProjects, executeUsersListSync as listJiraUsers } from "../../connectors/jira/src/sync";
import mailchimpManifest from "../../connectors/mailchimp/manifest.json";
import {
  createContact as createMailchimpContact,
  getMember as mcGetMember, updateMember as mcUpdateMember, upsertMember as mcUpsertMember, deleteMember as mcDeleteMember, addMemberTags as mcAddMemberTags,
  createList as mcCreateList, getList as mcGetList, createCampaign as mcCreateCampaign, getCampaign as mcGetCampaign, sendCampaign as mcSendCampaign,
  unscheduleCampaign as mcUnscheduleCampaign, scheduleCampaign as mcScheduleCampaign, deleteCampaign as mcDeleteCampaign, replicateCampaign as mcReplicateCampaign,
  updateList as mcUpdateList, deleteList as mcDeleteList, createMemberNote as mcCreateMemberNote,
  listTemplates as mcListTemplates, getTemplate as mcGetTemplate,
  getReportSummary as mcGetReportSummary, getReportOpens as mcGetReportOpens, getReportClicks as mcGetReportClicks, getReportUnsubscribed as mcGetReportUnsubscribed,
  listAutomations as mcListAutomations, getAutomation as mcGetAutomation,
} from "../../connectors/mailchimp/src/actions";
import { healthcheck as mailchimpHealthcheck } from "../../connectors/mailchimp/src/healthcheck";
import { executeContactsListSync as listMailchimpContacts, executeAudiencesListSync as listMailchimpAudiences, executeCampaignsListSync as listMailchimpCampaigns } from "../../connectors/mailchimp/src/sync";
import brevoManifest from "../../connectors/brevo/manifest.json";
import {
  createContact as createBrevoContact,
  getContact as bvGetContact, updateContact as bvUpdateContact, deleteContact as bvDeleteContact, sendEmail as bvSendEmail,
  createList as bvCreateList, getList as bvGetList, addContactsToList as bvAddToList, removeContactsFromList as bvRemoveFromList,
  createEmailCampaign as bvCreateCampaign, sendEmailCampaign as bvSendCampaign, getEmailCampaign as bvGetCampaign,
} from "../../connectors/brevo/src/actions";
import { healthcheck as brevoHealthcheck } from "../../connectors/brevo/src/healthcheck";
import { executeContactsListSync as listBrevoContacts, executeListsListSync as listBrevoLists, executeCampaignsListSync as listBrevoCampaigns } from "../../connectors/brevo/src/sync";
import sendgridManifest from "../../connectors/sendgrid/manifest.json";
import {
  createContact as createSendGridContact,
  sendMail as sgSendMail, upsertContacts as sgUpsertContacts, searchContacts as sgSearchContacts, deleteContacts as sgDeleteContacts,
  createList as sgCreateList, getList as sgGetList, deleteList as sgDeleteList,
  createTemplate as sgCreateTemplate, getTemplate as sgGetTemplate, listBounces as sgListBounces,
  getContact as sgGetContact, listLists as sgListLists, listListContacts as sgListListContacts,
  addListContacts as sgAddListContacts, removeListContacts as sgRemoveListContacts,
  listTemplates as sgListTemplates, updateTemplate as sgUpdateTemplate, deleteTemplate as sgDeleteTemplate,
  getGlobalStats as sgGetGlobalStats, listBlocks as sgListBlocks, listSpamReports as sgListSpamReports,
  listUnsubscribes as sgListUnsubscribes, listInvalidEmails as sgListInvalidEmails,
  listApiKeys as sgListApiKeys, listAlerts as sgListAlerts,
} from "../../connectors/sendgrid/src/actions";
import { healthcheck as sendgridHealthcheck } from "../../connectors/sendgrid/src/healthcheck";
import { executeContactsListSync as listSendGridContacts, executeListsListSync as listSendGridLists, executeCampaignsListSync as listSendGridCampaigns } from "../../connectors/sendgrid/src/sync";
import klaviyoManifest from "../../connectors/klaviyo/manifest.json";
import {
  createContact as createKlaviyoContact,
  getProfile as kvGetProfile, updateProfile as kvUpdateProfile, createList as kvCreateList, getList as kvGetList,
  addProfilesToList as kvAddToList, removeProfilesFromList as kvRemoveFromList, createEvent as kvCreateEvent,
  getSegment as kvGetSegment, createCampaign as kvCreateCampaign,
  deleteProfile as kvDeleteProfile, getEvent as kvGetEvent, listEvents as kvListEvents,
  getCampaign as kvGetCampaign, updateCampaign as kvUpdateCampaign, sendCampaign as kvSendCampaign,
  listMetrics as kvListMetrics, getMetric as kvGetMetric,
  listCatalogItems as kvListCatalogItems, getCatalogItem as kvGetCatalogItem,
  listSegments as kvListSegments, listTemplates as kvListTemplates, getTemplate as kvGetTemplate,
  listFlows as kvListFlows, subscribeProfiles as kvSubscribeProfiles,
} from "../../connectors/klaviyo/src/actions";
import { healthcheck as klaviyoHealthcheck } from "../../connectors/klaviyo/src/healthcheck";
import { executeContactsListSync as listKlaviyoContacts, executeCampaignsListSync as listKlaviyoCampaigns, executeListsListSync as listKlaviyoLists } from "../../connectors/klaviyo/src/sync";
import shopifyManifest from "../../connectors/shopify/manifest.json";
import { healthcheck as shopifyHealthcheck } from "../../connectors/shopify/src/healthcheck";
import { executeProductsListSync as listShopifyProducts, executeOrdersListSync as listShopifyOrders, executeCustomersListSync as listShopifyCustomers } from "../../connectors/shopify/src/sync";
import {
  getProduct as shopifyGetProduct, createProduct as shopifyCreateProduct, updateProduct as shopifyUpdateProduct, deleteProduct as shopifyDeleteProduct,
  updateProductVariant as shopifyUpdateProductVariant,
  getOrder as shopifyGetOrder, createOrder as shopifyCreateOrder, updateOrder as shopifyUpdateOrder, closeOrder as shopifyCloseOrder, cancelOrder as shopifyCancelOrder,
  getCustomer as shopifyGetCustomer, createCustomer as shopifyCreateCustomer, updateCustomer as shopifyUpdateCustomer, searchCustomers as shopifySearchCustomers,
  setInventoryLevel as shopifySetInventoryLevel,
} from "../../connectors/shopify/src/actions";
import woocommerceManifest from "../../connectors/woocommerce/manifest.json";
import { healthcheck as woocommerceHealthcheck } from "../../connectors/woocommerce/src/healthcheck";
import { executeProductsListSync as listWooProducts, executeOrdersListSync as listWooOrders, executeCustomersListSync as listWooCustomers } from "../../connectors/woocommerce/src/sync";
import {
  createProduct as wooCreateProduct, getProduct as wooGetProduct, updateProduct as wooUpdateProduct, deleteProduct as wooDeleteProduct,
  createOrder as wooCreateOrder, getOrder as wooGetOrder, updateOrder as wooUpdateOrder, deleteOrder as wooDeleteOrder,
  createCustomer as wooCreateCustomer, getCustomer as wooGetCustomer, updateCustomer as wooUpdateCustomer, createCoupon as wooCreateCoupon,
} from "../../connectors/woocommerce/src/actions";
import quickbooksManifest from "../../connectors/quickbooks/manifest.json";
import { healthcheck as quickbooksHealthcheck } from "../../connectors/quickbooks/src/healthcheck";
import { executeInvoicesListSync as listQBInvoices, executeCustomersListSync as listQBCustomers, executePaymentsListSync as listQBPayments } from "../../connectors/quickbooks/src/sync";
import greenhouseManifest from "../../connectors/greenhouse/manifest.json";
import { healthcheck as greenhouseHealthcheck } from "../../connectors/greenhouse/src/healthcheck";
import {
  executeJobsListSync as listGreenhouseJobs,
  executeJobsGetSync as getGreenhouseJob,
  executeCandidatesListSync as listGreenhouseCandidates,
  executeCandidatesGetSync as getGreenhouseCandidate,
  executeApplicationsListSync as listGreenhouseApplications,
  executeApplicationsGetSync as getGreenhouseApplication,
  executeApplicationsMoveSync as moveGreenhouseApplication,
  executeApplicationsCreateSync as createGreenhouseApplication,
  executeUsersListSync as listGreenhouseUsers,
  executeInterviewsListSync as listGreenhouseInterviews,
  executeJobInterviewStagesListSync as listGreenhouseJobInterviewStages,
  executeCandidatesCreateSync as createGreenhouseCandidate,
  executeCandidatesUpdateSync as updateGreenhouseCandidate,
  executeOffersListSync as listGreenhouseOffers,
  executeOffersGetSync as getGreenhouseOffer,
  executeScorecardsListSync as listGreenhouseScorecards,
  executeScorecardsGetSync as getGreenhouseScorecard,
  executeDepartmentsListSync as listGreenhouseDepartments,
  executeOfficesListSync as listGreenhouseOffices,
  executeSourcesListSync as listGreenhouseSources,
  executeCloseReasonsListSync as listGreenhouseCloseReasons,
  executeUsersGetSync as getGreenhouseUser,
  executeApplicationsRejectSync as rejectGreenhouseApplication,
} from "../../connectors/greenhouse/src/sync";
import {
  executeApplicationsHire as hireGreenhouseApplication,
  executeApplicationsUpdate as updateGreenhouseApplication,
  executeApplicationStagesList as listGreenhouseApplicationStages,
  executeRejectionReasonsList as listGreenhouseRejectionReasons,
  executeRejectionDetailsList as listGreenhouseRejectionDetails,
  executeNotesCreate as createGreenhouseNote,
  executeNotesList as listGreenhouseNotes,
  executeCandidateTagsList as listGreenhouseCandidateTags,
  executeCandidatesApplyTag as applyGreenhouseCandidateTag,
  executeCandidatesRemoveTag as removeGreenhouseCandidateTag,
  executeInterviewsCreate as createGreenhouseInterview,
  executeInterviewsUpdate as updateGreenhouseInterview,
  executeInterviewsDelete as deleteGreenhouseInterview,
  executeOffersCreate as createGreenhouseOffer,
  executeJobsListInternal as listGreenhouseJobsInternal,
} from "../../connectors/greenhouse/src/g1";
import {
  executeCandidatesMerge as mergeGreenhouseCandidates,
  executeCandidatesDelete as deleteGreenhouseCandidate,
  executeApplicationsDelete as deleteGreenhouseApplication,
  executeAttachmentsList as listGreenhouseAttachments,
  executeAttachmentsCreate as createGreenhouseAttachment,
  executeAttachmentsDelete as deleteGreenhouseAttachment,
  executeCandidateEducationsList as listGreenhouseCandidateEducations,
  executeCandidateEducationsCreate as createGreenhouseCandidateEducation,
  executeCandidateEducationsDelete as deleteGreenhouseCandidateEducation,
  executeCandidateEmploymentsList as listGreenhouseCandidateEmployments,
  executeCandidateEmploymentsCreate as createGreenhouseCandidateEmployment,
  executeCandidateEmploymentsDelete as deleteGreenhouseCandidateEmployment,
  executeCandidateTagsCreate as createGreenhouseCandidateTag,
  executeCandidateTagsDelete as deleteGreenhouseCandidateTag,
  executeRejectionDetailsUpdate as updateGreenhouseRejectionDetail,
} from "../../connectors/greenhouse/src/g2";
import leverManifest from "../../connectors/lever/manifest.json";
import {
  executeJobsListSync as listLeverJobs,
  executeOpportunitiesListSync as listLeverOpportunities,
  executeOpportunitiesGetSync as getLeverOpportunity,
  executeOpportunitiesInterviewsListSync as listLeverOpportunityInterviews,
  executeOpportunitiesFeedbackListSync as listLeverOpportunityFeedback,
  executeOpportunitiesUpdateStageSync as updateLeverOpportunityStage,
  executeOpportunitiesArchiveSync as archiveLeverOpportunity,
  executeArchiveReasonsListSync as listLeverArchiveReasons,
  executeStagesListSync as listLeverStages,
  executeUsersListSync as listLeverUsers,
  executeOpportunitiesUpdateSync as updateLeverOpportunity,
  executeCandidatesGetSync as getLeverCandidate,
  executeInterviewsListSync as listLeverInterviews,
  executeInterviewsGetSync as getLeverInterview,
  executeOffersListSync as listLeverOffers,
  executeOffersGetSync as getLeverOffer,
  executePostingsListSync as listLeverPostings,
  executePostingsGetSync as getLeverPosting,
  executeNotesListSync as listLeverNotes,
  executeUsersGetSync as getLeverUser,
  executeRequisitionsListSync as listLeverRequisitions,
  executeFeedbackGetSync as getLeverFeedback,
} from "../../connectors/lever/src/sync";
import ashbyManifest from "../../connectors/ashby/manifest.json";
import {
  executeJobsListSync as listAshbyJobs,
  executeCandidatesListSync as listAshbyCandidates,
  executeApplicationsListSync as listAshbyApplications,
  executeCandidatesGetSync as getAshbyCandidate,
  executeApplicationsGetSync as getAshbyApplication,
  executeCandidatesSearchSync as searchAshbyCandidates,
  executeInterviewsListSync as listAshbyInterviews,
  executeCandidatesCreateSync as createAshbyCandidate,
  executeApplicationsCreateSync as createAshbyApplication,
  executeApplicationsMoveSync as moveAshbyApplication,
  executeApplicationsRejectSync as rejectAshbyApplication,
  executeApplicationsHireSync as hireAshbyApplication,
  executeInterviewsScheduleSync as scheduleAshbyInterview,
  executeInterviewsCancelSync as cancelAshbyInterview,
  executeJobsGetSync as getAshbyJob,
  executeCandidatesUpdateSync as updateAshbyCandidate,
  executeOffersListSync as listAshbyOffers,
  executeOffersGetSync as getAshbyOffer,
  executeDepartmentsListSync as listAshbyDepartments,
  executeUsersListSync as listAshbyUsers,
  executeSourcesListSync as listAshbySources,
  executeArchiveReasonsListSync as listAshbyArchiveReasons,
  executeInterviewSchedulesListSync as listAshbyInterviewSchedules,
  executeInterviewSchedulesGetSync as getAshbyInterviewSchedule,
  executeInterviewStagesListSync as listAshbyInterviewStages,
  executeOpeningsListSync as listAshbyOpenings,
} from "../../connectors/ashby/src/sync";
import { parseWebhook as ashbyParseWebhook } from "../../connectors/ashby/src/webhook";
import intercomManifest from "../../connectors/intercom/manifest.json";
import {
  executeAdminsListSync as listIntercomAdmins,
  executeContactsListSync as listIntercomContacts,
  executeContactsGetSync as getIntercomContact,
  executeCompaniesListSync as listIntercomCompanies,
  executeConversationsListSync as listIntercomConversations,
  executeConversationsGetSync as getIntercomConversation,
  executeConversationsSearchSync as searchIntercomConversations,
  executeConversationsReplySync as replyIntercomConversation,
  executeConversationsCloseSync as closeIntercomConversation,
  executeConversationsAssignSync as assignIntercomConversation,
  executeConversationsTagSync as tagIntercomConversation,
} from "../../connectors/intercom/src/sync";
import workableManifest from "../../connectors/workable/manifest.json";
import { healthcheck as workableHealthcheck } from "../../connectors/workable/src/healthcheck";
import {
  executeJobsListSync as listWorkableJobs,
  executeJobsGetSync as getWorkableJob,
  executeCandidatesListSync as listWorkableCandidates,
  executeCandidatesGetSync as getWorkableCandidate,
  executeStagesListSync as listWorkableStages,
  executeMembersListSync as listWorkableMembers,
  executeEventsListSync as listWorkableEvents,
} from "../../connectors/workable/src/sync";
import smartrecruitersManifest from "../../connectors/smartrecruiters/manifest.json";
import {
  executeJobsListSync as listSmartRecruitersJobs,
  executeJobsGetSync as getSmartRecruitersJob,
  executePostingsListSync as listSmartRecruitersPostings,
  executeCandidatesListSync as listSmartRecruitersCandidates,
  executeCandidatesGetSync as getSmartRecruitersCandidate,
  executeUsersListSync as listSmartRecruitersUsers,
  executeInterviewsListSync as listSmartRecruitersInterviews,
} from "../../connectors/smartrecruiters/src/sync";
import recruiteeManifest from "../../connectors/recruitee/manifest.json";
import { healthcheck as recruiteeHealthcheck } from "../../connectors/recruitee/src/healthcheck";
import {
  executeJobsListSync as listRecruiteeJobs,
  executeCandidatesListSync as listRecruiteeCandidates,
  executeCandidatesGetSync as getRecruiteeCandidate,
  executeCandidatesSearchSync as searchRecruiteeCandidates,
  executeOffersListSync as listRecruiteeOffers,
  executePipelineStagesListSync as listRecruiteePipelineStages,
  executeInterviewEventsListSync as listRecruiteeInterviewEvents,
} from "../../connectors/recruitee/src/sync";
import zohoRecruitManifest from "../../connectors/zoho-recruit/manifest.json";
import { healthcheck as zohoRecruitHealthcheck } from "../../connectors/zoho-recruit/src/healthcheck";
import {
  executeJobsListSync as listZohoRecruitJobs,
  executeCandidatesListSync as listZohoRecruitCandidates,
  executeCandidatesGetSync as getZohoRecruitCandidate,
  executeCandidatesSearchSync as searchZohoRecruitCandidates,
  executeJobOpeningsListSync as listZohoRecruitJobOpenings,
  executeApplicationsListSync as listZohoRecruitApplications,
  executeInterviewsListSync as listZohoRecruitInterviews,
} from "../../connectors/zoho-recruit/src/sync";
import typeformManifest from "../../connectors/typeform/manifest.json";
import { healthcheck as typeformHealthcheck } from "../../connectors/typeform/src/healthcheck";
import { executeFormsListSync as listTypeformForms, executeResponsesListSync as listTypeformResponses } from "../../connectors/typeform/src/sync";
import {
  listForms as tfListForms, getForm as tfGetForm, createForm as tfCreateForm, updateForm as tfUpdateForm, deleteForm as tfDeleteForm,
  listResponses as tfListResponses, deleteResponses as tfDeleteResponses, createWebhook as tfCreateWebhook, listWebhooks as tfListWebhooks,
} from "../../connectors/typeform/src/actions";
import calendlyManifest from "../../connectors/calendly/manifest.json";
import { healthcheck as calendlyHealthcheck } from "../../connectors/calendly/src/healthcheck";
import {
  getUsersMe as calGetUsersMe, listEventTypes as calListEventTypes, listScheduledEvents as calListScheduledEvents, getScheduledEvent as calGetScheduledEvent,
  listInvitees as calListInvitees, cancelScheduledEvent as calCancelEvent, createInviteeNoShow as calCreateNoShow, createSchedulingLink as calCreateLink,
  getAvailableSlots as calGetSlots, createBooking as calCreateBooking,
  getEventType as calGetEventType, getInvitee as calGetInvitee, listOrganizationMemberships as calListOrganizationMemberships,
  createWebhookSubscription as calCreateWebhookSubscription, listWebhookSubscriptions as calListWebhookSubscriptions,
  deleteWebhookSubscription as calDeleteWebhookSubscription, getUser as calGetUser, getOrganization as calGetOrganization,
  listRoutingForms as calListRoutingForms, getRoutingForm as calGetRoutingForm,
} from "../../connectors/calendly/src/actions";
import { parseWebhook as calendlyParseWebhook } from "../../connectors/calendly/src/webhook";
import googleAdsManifest from "../../connectors/google-ads/manifest.json";
import { healthcheck as googleAdsHealthcheck } from "../../connectors/google-ads/src/healthcheck";
import {
  listAccessibleCustomers as gadsListAccessibleCustomers,
  listSubAccounts as gadsListSubAccounts,
  getCampaign as gadsGetCampaign,
  getCampaignByName as gadsGetCampaignByName,
  getAdGroup as gadsGetAdGroup,
  getAd as gadsGetAd,
  getKeyword as gadsGetKeyword,
  getBudget as gadsGetBudget,
  getConversionAction as gadsGetConversionAction,
  mutateCampaigns as gadsMutateCampaigns,
  mutateAdGroups as gadsMutateAdGroups,
  mutateAds as gadsMutateAds,
  mutateKeywords as gadsMutateKeywords,
  mutateBudgets as gadsMutateBudgets,
  gaqlSearch as gadsGaqlSearch,
  gaqlSearchStream as gadsGaqlSearchStream,
  createCustomerList as gadsCreateCustomerList,
  mutateCustomerListMembers as gadsMutateCustomerListMembers,
  mutateConversionActions as gadsMutateConversionActions,
  mutateLabels as gadsMutateLabels,
  getReport as gadsGetReport,
} from "../../connectors/google-ads/src/actions";
import {
  getAsset as gadsGetAsset,
  listAssets as gadsListAssets,
  mutateAssets as gadsMutateAssets,
  createCalloutAsset as gadsCreateCalloutAsset,
  getCampaignAsset as gadsGetCampaignAsset,
  mutateCampaignAssets as gadsMutateCampaignAssets,
  getAdGroupAsset as gadsGetAdGroupAsset,
  mutateAdGroupAssets as gadsMutateAdGroupAssets,
  getCustomerAsset as gadsGetCustomerAsset,
  mutateCustomerAssets as gadsMutateCustomerAssets,
  getLabel as gadsGetLabel,
  getBiddingStrategy as gadsGetBiddingStrategy,
  mutateBiddingStrategies as gadsMutateBiddingStrategies,
  mutatePortfolioBiddingStrategies as gadsMutatePortfolioBiddingStrategies,
  getConversionActionTagSnippets as gadsGetConversionActionTagSnippets,
} from "../../connectors/google-ads/src/g1";
import {
  executeCampaignsListSync as listGoogleAdsCampaigns,
  executeAdGroupsListSync as listGoogleAdsAdGroups,
  executeAdsListSync as listGoogleAdsAds,
  executeKeywordsListSync as listGoogleAdsKeywords,
  executeBudgetsListSync as listGoogleAdsBudgets,
  executeCustomerListsListSync as listGoogleAdsCustomerLists,
  executeConversionActionsListSync as listGoogleAdsConversionActions,
} from "../../connectors/google-ads/src/sync";
import metaAdsManifest from "../../connectors/meta-ads/manifest.json";
import { healthcheck as metaAdsHealthcheck } from "../../connectors/meta-ads/src/healthcheck";
import { executeCampaignsListSync as listMetaCampaigns, executeAdSetsListSync as listMetaAdSets, executeAdsListSync as listMetaAds, executeAdAccountsListSync as listMetaAdAccounts } from "../../connectors/meta-ads/src/sync";
import linkedinAdsManifest from "../../connectors/linkedin-ads/manifest.json";
import { healthcheck as linkedinAdsHealthcheck } from "../../connectors/linkedin-ads/src/healthcheck";
import {
  getCampaign as linkedinAdsGetCampaign,
  getAdAccount as linkedinAdsGetAdAccount,
  listCampaignGroups as linkedinAdsListCampaignGroups,
  listCreatives as linkedinAdsListCreatives,
  getAnalyticsReport as linkedinAdsGetAnalyticsReport,
} from "../../connectors/linkedin-ads/src/actions";
import { executeCampaignsListSync as listLinkedInAdsCampaigns, executeAdAccountsListSync as listLinkedInAdsAccounts, executeCreativeAssetsListSync as listLinkedInAdsCreatives } from "../../connectors/linkedin-ads/src/sync";
import tiktokAdsManifest from "../../connectors/tiktok-ads/manifest.json";
import { healthcheck as tiktokAdsHealthcheck } from "../../connectors/tiktok-ads/src/healthcheck";
import {
  getAnalyticsReport as tiktokAdsGetAnalyticsReport,
  listAdvertisers as tiktokAdsListAdvertisers,
  getAdvertiser as tiktokAdsGetAdvertiser,
  getCampaign as tiktokAdsGetCampaign,
  createCampaign as tiktokAdsCreateCampaign,
  updateCampaign as tiktokAdsUpdateCampaign,
  updateCampaignStatus as tiktokAdsUpdateCampaignStatus,
  getAdGroup as tiktokAdsGetAdGroup,
  createAdGroup as tiktokAdsCreateAdGroup,
  updateAdGroup as tiktokAdsUpdateAdGroup,
  updateAdGroupStatus as tiktokAdsUpdateAdGroupStatus,
  getAd as tiktokAdsGetAd,
  createAd as tiktokAdsCreateAd,
  updateAd as tiktokAdsUpdateAd,
  updateAdStatus as tiktokAdsUpdateAdStatus,
  listPixels as tiktokAdsListPixels,
  getPixel as tiktokAdsGetPixel,
  getReport as tiktokAdsGetReport,
  listIdentities as tiktokAdsListIdentities,
  listVideos as tiktokAdsListVideos,
  listImages as tiktokAdsListImages,
  listCustomAudiences as tiktokAdsListCustomAudiences,
} from "../../connectors/tiktok-ads/src/actions";
import { executeCampaignsListSync as listTikTokCampaigns, executeAdGroupsListSync as listTikTokAdGroups, executeAdsListSync as listTikTokAds } from "../../connectors/tiktok-ads/src/sync";
import xeroManifest from "../../connectors/xero/manifest.json";
import { healthcheck as xeroHealthcheck } from "../../connectors/xero/src/healthcheck";
import { executeInvoicesListSync as listXeroInvoices, executeContactsListSync as listXeroContacts, executeBankTransactionsListSync as listXeroTransactions } from "../../connectors/xero/src/sync";
import zohoBooksManifest from "../../connectors/zoho-books/manifest.json";
import { healthcheck as zohoBooksHealthcheck } from "../../connectors/zoho-books/src/healthcheck";
import {
  getContact as zohoBooksGetContact,
  createContact as zohoBooksCreateContact,
  updateContact as zohoBooksUpdateContact,
  deleteContact as zohoBooksDeleteContact,
  getInvoice as zohoBooksGetInvoice,
  createInvoice as zohoBooksCreateInvoice,
  updateInvoice as zohoBooksUpdateInvoice,
  emailInvoice as zohoBooksEmailInvoice,
  voidInvoice as zohoBooksVoidInvoice,
  listBills as zohoBooksListBills,
  getBill as zohoBooksGetBill,
  createBill as zohoBooksCreateBill,
  listItems as zohoBooksListItems,
  getItem as zohoBooksGetItem,
  createItem as zohoBooksCreateItem,
  getOrganizations as zohoBooksGetOrganizations,
} from "../../connectors/zoho-books/src/actions";
import { executeInvoicesListSync as listZohoBooksInvoices, executeContactsListSync as listZohoBooksContacts, executePaymentsListSync as listZohoBooksPayments } from "../../connectors/zoho-books/src/sync";
import httpRequestManifest from "../../connectors/http-request/manifest.json";
import { healthcheck as httpRequestHealthcheck } from "../../connectors/http-request/src/healthcheck";
import csvManifest from "../../connectors/csv/manifest.json";
import { healthcheck as csvHealthcheck } from "../../connectors/csv/src/healthcheck";
import webhookManifest from "../../connectors/webhook/manifest.json";
import { healthcheck as webhookHealthcheck } from "../../connectors/webhook/src/healthcheck";
import smtpEmailManifest from "../../connectors/smtp-email/manifest.json";
import { healthcheck as smtpEmailHealthcheck } from "../../connectors/smtp-email/src/healthcheck";
import automationWebhookManifest from "../../connectors/automation-webhook/manifest.json";
import { healthcheck as automationWebhookHealthcheck } from "../../connectors/automation-webhook/src/healthcheck";

// ── Newly added connectors ────────────────────────────────────────────────
import calComManifest from "../../connectors/cal-com/manifest.json";
import { healthcheck as calComHealthcheck } from "../../connectors/cal-com/src/healthcheck";
import {
  getMe as calComGetMe, listEventTypes as calComListEventTypes, getEventType as calComGetEventType,
  createEventType as calComCreateEventType, updateEventType as calComUpdateEventType, deleteEventType as calComDeleteEventType,
  listBookings as calComListBookings, getBooking as calComGetBooking, createBooking as calComCreateBooking,
  cancelBooking as calComCancelBooking, rescheduleBooking as calComRescheduleBooking,
  confirmBooking as calComConfirmBooking, declineBooking as calComDeclineBooking,
  getAvailableSlots as calComGetAvailableSlots, listSchedules as calComListSchedules,
  getSchedule as calComGetSchedule, createSchedule as calComCreateSchedule,
  updateSchedule as calComUpdateSchedule, deleteSchedule as calComDeleteSchedule,
  getAvailability as calComGetAvailability,
  listWebhooks as calComListWebhooks, createWebhook as calComCreateWebhook,
  getWebhook as calComGetWebhook, deleteWebhook as calComDeleteWebhook,
} from "../../connectors/cal-com/src/actions";

import lushaManifest from "../../connectors/lusha/manifest.json";
import { healthcheck as lushaHealthcheck } from "../../connectors/lusha/src/healthcheck";
import {
  enrichPerson as lushaEnrichPerson, enrichCompany as lushaEnrichCompany,
  searchProspectingContacts as lushaSearchContacts, enrichProspectingContacts as lushaEnrichContacts,
  searchProspectingCompanies as lushaSearchCompanies, enrichProspectingCompanies as lushaEnrichCompanies,
  bulkEnrichPersons as lushaBulkEnrich, getUsage as lushaGetUsage,
} from "../../connectors/lusha/src/actions";

import apolloManifest from "../../connectors/apollo/manifest.json";
import { healthcheck as apolloHealthcheck } from "../../connectors/apollo/src/healthcheck";
import {
  searchPeople as apolloSearchPeople, matchPerson as apolloMatchPerson, bulkMatchPeople as apolloBulkMatch,
  searchOrganizations as apolloSearchOrgs, enrichOrganization as apolloEnrichOrg, bulkEnrichOrganizations as apolloBulkEnrichOrgs,
  getOrganizationJobPostings as apolloJobPostings, createContact as apolloCreateContact, updateContact as apolloUpdateContact,
  searchContacts as apolloSearchContacts, createAccount as apolloCreateAccount, updateAccount as apolloUpdateAccount,
  searchSequences as apolloSearchSequences, addContactsToSequence as apolloAddToSequence,
  listEmailAccounts as apolloListEmailAccounts, searchUsers as apolloSearchUsers,
} from "../../connectors/apollo/src/actions";
import { parseWebhook as apolloParseWebhook } from "../../connectors/apollo/src/webhook";

import apifyManifest from "../../connectors/apify/manifest.json";
import { healthcheck as apifyHealthcheck } from "../../connectors/apify/src/healthcheck";
import {
  listActors as apifyListActors, getActor as apifyGetActor, runActor as apifyRunActor,
  runActorSyncGetDatasetItems as apifyRunActorSync, getRun as apifyGetRun, listRuns as apifyListRuns,
  abortRun as apifyAbortRun, getDataset as apifyGetDataset, getDatasetItems as apifyGetDatasetItems,
  listTasks as apifyListTasks, runTask as apifyRunTask, runTaskSyncGetDatasetItems as apifyRunTaskSync,
  getKeyValueStoreRecord as apifyGetKVRecord,
  listDatasets as apifyListDatasets, createDataset as apifyCreateDataset, deleteDataset as apifyDeleteDataset,
  pushDatasetItems as apifyPushDatasetItems,
  listKeyValueStores as apifyListKVStores, getKeyValueStore as apifyGetKVStore,
  putKeyValueStoreRecord as apifyPutKVRecord, listKeyValueStoreKeys as apifyListKVKeys,
  deleteKeyValueStoreRecord as apifyDeleteKVRecord,
  getTask as apifyGetTask, getUserMe as apifyGetUserMe, listWebhooks as apifyListWebhooks,
  getRunLog as apifyGetRunLog, listRequestQueues as apifyListRequestQueues,
} from "../../connectors/apify/src/actions";
import { actorsOptions as apifyActorsOptions, actorInputSchema as apifyActorInputSchema } from "../../connectors/apify/src/options";

import zoomManifest from "../../connectors/zoom/manifest.json";
import { healthcheck as zoomHealthcheck } from "../../connectors/zoom/src/healthcheck";
import {
  getUsersMe as zoomGetUsersMe, listUsers as zoomListUsers, createMeeting as zoomCreateMeeting,
  listMeetings as zoomListMeetings, getMeeting as zoomGetMeeting, updateMeeting as zoomUpdateMeeting,
  deleteMeeting as zoomDeleteMeeting, listMeetingRegistrants as zoomListRegistrants,
  addMeetingRegistrant as zoomAddRegistrant, listPastMeetingParticipants as zoomPastParticipants,
  createWebinar as zoomCreateWebinar, listWebinars as zoomListWebinars,
  getUser as zoomGetUser, listRecordings as zoomListRecordings, getRecording as zoomGetRecording,
  deleteRecording as zoomDeleteRecording, getWebinar as zoomGetWebinar,
} from "../../connectors/zoom/src/actions";

import saleshandyManifest from "../../connectors/saleshandy/manifest.json";
import { healthcheck as saleshandyHealthcheck } from "../../connectors/saleshandy/src/healthcheck";
import {
  listSequences as shListSequences, getSequence as shGetSequence, createSequence as shCreateSequence,
  pauseSequence as shPauseSequence, resumeSequence as shResumeSequence, listSequenceSteps as shListSteps,
  addProspectsToSequence as shAddProspects, listProspects as shListProspects, getProspect as shGetProspect,
  updateProspect as shUpdateProspect, pauseProspect as shPauseProspect, resumeProspect as shResumeProspect,
  unsubscribeProspect as shUnsubscribeProspect, listEmailAccounts as shListEmailAccounts,
} from "../../connectors/saleshandy/src/actions";

import unipileManifest from "../../connectors/unipile/manifest.json";
import { healthcheck as unipileHealthcheck } from "../../connectors/unipile/src/healthcheck";
import {
  listAccounts as uniListAccounts, getAccount as uniGetAccount, listChats as uniListChats,
  getChat as uniGetChat, listMessages as uniListMessages, sendMessage as uniSendMessage,
  startChat as uniStartChat, listEmails as uniListEmails, getEmail as uniGetEmail, sendEmail as uniSendEmail,
  getLinkedInProfile as uniGetLinkedInProfile, sendLinkedInInvitation as uniSendInvitation,
  listLinkedInRelations as uniListRelations,
} from "../../connectors/unipile/src/actions";

import rb2bManifest from "../../connectors/rb2b/manifest.json";
import { healthcheck as rb2bHealthcheck } from "../../connectors/rb2b/src/healthcheck";
import { parseVisitors as rb2bParseVisitors } from "../../connectors/rb2b/src/actions";
import { parseWebhook as rb2bParseWebhook, verifyWebhook as rb2bVerifyWebhook } from "../../connectors/rb2b/src/webhook";

import caldavManifest from "../../connectors/caldav/manifest.json";
import { healthcheck as caldavHealthcheck } from "../../connectors/caldav/src/healthcheck";
import {
  discoverPrincipal as caldavDiscoverPrincipal, getCalendarHome as caldavGetCalendarHome,
  listCalendars as caldavListCalendars, listEvents as caldavListEvents, getEvent as caldavGetEvent,
  createEvent as caldavCreateEvent, updateEvent as caldavUpdateEvent, deleteEvent as caldavDeleteEvent,
  queryFreeBusy as caldavQueryFreeBusy,
} from "../../connectors/caldav/src/actions";

import resendManifest from "../../connectors/resend/manifest.json";
import { healthcheck as resendHealthcheck } from "../../connectors/resend/src/healthcheck";
import { sendEmail as resendSendEmail, getEmail as resendGetEmail, listEmails as resendListEmails } from "../../connectors/resend/src/emails";
import { listDomains as resendListDomains, getDomain as resendGetDomain } from "../../connectors/resend/src/domains";
import { listContacts as resendListContacts } from "../../connectors/resend/src/contacts";

import googlemeetManifest from "../../connectors/googlemeet/manifest.json";
import { healthcheck as googlemeetHealthcheck } from "../../connectors/googlemeet/src/healthcheck";
import { createMeeting as gmeetCreateMeeting, listMeetings as gmeetListMeetings, getMeeting as gmeetGetMeeting, updateMeeting as gmeetUpdateMeeting, deleteMeeting as gmeetDeleteMeeting } from "../../connectors/googlemeet/src/actions";

// Google Meet operations (extend the existing google-workspace connector).
import {
  createMeetEvent as gwCreateMeetEvent, addMeetToEvent as gwAddMeetToEvent,
  createMeetSpace as gwCreateMeetSpace, getMeetSpace as gwGetMeetSpace,
  listConferenceRecords as gwListConferenceRecords,
} from "../../connectors/google-workspace/src/meet";

// Microsoft Teams meeting operations (extend the existing microsoft-365 connector).
import {
  createTeamsMeeting as msCreateTeamsMeeting, getTeamsMeeting as msGetTeamsMeeting,
  updateTeamsMeeting as msUpdateTeamsMeeting, deleteTeamsMeeting as msDeleteTeamsMeeting,
  getTeamsMeetingByJoinUrl as msGetTeamsByJoinUrl, createCalendarTeamsEvent as msCreateCalendarTeamsEvent,
} from "../../connectors/microsoft-365/src/actions";

import { createConnectorHttpClient, type ConnectorHttpClient } from "./http";
import { withDeclarativeConnectors } from "./declarative/loader";

type Manifest = {
  key: string;
  name: string;
  version: string;
  runtime: string;
  auth: unknown;
  network: unknown;
  operations: unknown;
};

type ActionHandler = (input: unknown) => unknown;
type SyncHandler = (input: unknown) => unknown;
// A healthcheck handler now receives the connection's credential input (e.g.
// { apiKey } / { botToken } / SMTP fields) and either returns a static status or
// makes a real authenticated provider call. It may return a Promise and may
// throw a structured { ok:false, code, message } on an upstream failure.
type HealthcheckHandler = (input?: unknown) => unknown;
// A webhook parser turns a raw inbound payload into the platform's
// { idempotencyKey, operation?, sanitized } shape; a verifier proves the
// delivery is authentic given the payload and request headers.
type WebhookParser = (payload: unknown) => unknown;
type WebhookVerifier = (payload: unknown, headers: Record<string, string>) => boolean;
type WebhookHandlers = { parse: WebhookParser; verify?: WebhookVerifier };

export type RegistryFailure = {
  ok: false;
  code: string;
  message: string;
  retryAfterSeconds?: number;
};

export type RegistryActionResult =
  | { ok: true; output: unknown }
  | RegistryFailure;

export type RegistryValidationIssue = {
  code: "ACTION_HANDLER_MISSING" | "SYNC_HANDLER_MISSING" | "UNSUPPORTED_OPERATION_BUDGET";
  connectorKey: string;
  operation: string;
  message: string;
};

export type RegistryHealthcheckResult =
  | { ok: true; output: unknown }
  | RegistryFailure;

export type ConnectorRegistry = {
  describe(connectorKey: string): Record<string, unknown> | undefined;
  operationBudget(connectorKey: string, operation: string): OperationBudgetLike | undefined;
  healthcheck(connectorKey: string, input?: unknown): RegistryHealthcheckResult | undefined;
  executeAction(connectorKey: string, action: string, input: unknown): RegistryActionResult;
  executeSync(connectorKey: string, sync: string, input: unknown): RegistryActionResult;
  parseWebhook(connectorKey: string, payload: unknown): RegistryActionResult;
  verifyWebhook(connectorKey: string, payload: unknown, headers: Record<string, string>): RegistryActionResult;
  createHttpClient(
    connectorKey: string,
    operation: string,
    options?: { fetch?: typeof fetch },
  ): ConnectorHttpClient | undefined;
  validate(): RegistryValidationIssue[];
};

const fakeConnector = {
  key: "fake",
  name: "Fake Connector",
  version: "0.1.0",
  runtime: "bun",
  auth: { type: "none", scopes: [] },
  network: { allowedHosts: ["runner.local"] },
  operations: {
    healthcheck: {
      kind: "action",
      timeoutMs: 5000,
      maxInputBytes: 4096,
      maxResponseBytes: 65536,
    },
    "messages.send": {
      kind: "action",
      timeoutMs: 10000,
      maxInputBytes: 65536,
      maxResponseBytes: 1048576,
    },
  },
};

// The registry is composed from two sources. Statically imported connectors
// bring hand-written TypeScript handlers; declarative connectors are discovered
// from runner/connectors/*/manifest.json and their handlers are compiled from
// the manifest itself, so adding one requires no import and no edit here.
// withDeclarativeConnectors also compiles declarative operations declared on a
// statically imported manifest, which is how a hand-written connector migrates
// one operation at a time. A registered handler always wins over a compiled one.
export const defaultConnectorRegistry = createConnectorRegistry(withDeclarativeConnectors({
  manifests: [fakeConnector, slackManifest, telegramManifest, whatsappManifest, notionManifest, googleWorkspaceManifest, microsoft365Manifest, githubManifest, salesforceManifest, hubspotManifest, linkedinManifest, jiraManifest, mailchimpManifest, brevoManifest, sendgridManifest, klaviyoManifest, shopifyManifest, woocommerceManifest, quickbooksManifest, greenhouseManifest, leverManifest, ashbyManifest, intercomManifest, workableManifest, smartrecruitersManifest, recruiteeManifest, zohoRecruitManifest, typeformManifest, calendlyManifest, googleAdsManifest, metaAdsManifest, linkedinAdsManifest, tiktokAdsManifest, xeroManifest, zohoBooksManifest, httpRequestManifest, csvManifest, webhookManifest, smtpEmailManifest, automationWebhookManifest, calComManifest, lushaManifest, apolloManifest, apifyManifest, zoomManifest, saleshandyManifest, unipileManifest, rb2bManifest, caldavManifest, resendManifest, googlemeetManifest],
  healthchecks: {
    fake: () => ({ connector: "fake", status: "ok" }),
    notion: notionHealthcheck,
    slack: slackHealthcheck,
    telegram: telegramHealthcheck,
    whatsapp: whatsappHealthcheck,
    "google-workspace": googleWorkspaceHealthcheck,
    "microsoft-365": microsoft365Healthcheck,
    github: githubHealthcheck,
    salesforce: salesforceHealthcheck,
    hubspot: hubspotHealthcheck,
    linkedin: linkedinHealthcheck,
    jira: jiraHealthcheck,
    mailchimp: mailchimpHealthcheck,
    brevo: brevoHealthcheck,
    sendgrid: sendgridHealthcheck,
    klaviyo: klaviyoHealthcheck,
    shopify: shopifyHealthcheck,
    woocommerce: woocommerceHealthcheck,
    quickbooks: quickbooksHealthcheck,
    greenhouse: greenhouseHealthcheck,
    workable: workableHealthcheck,
    recruitee: recruiteeHealthcheck,
    "zoho-recruit": zohoRecruitHealthcheck,
    typeform: typeformHealthcheck,
    calendly: calendlyHealthcheck,
    "google-ads": googleAdsHealthcheck,
    "meta-ads": metaAdsHealthcheck,
    "linkedin-ads": linkedinAdsHealthcheck,
    "tiktok-ads": tiktokAdsHealthcheck,
    xero: xeroHealthcheck,
    "zoho-books": zohoBooksHealthcheck,
    "http-request": httpRequestHealthcheck,
    csv: csvHealthcheck,
    webhook: webhookHealthcheck,
    "smtp-email": smtpEmailHealthcheck,
    "automation-webhook": automationWebhookHealthcheck,
    "cal-com": calComHealthcheck,
    lusha: lushaHealthcheck,
    apollo: apolloHealthcheck,
    apify: apifyHealthcheck,
    zoom: zoomHealthcheck,
    saleshandy: saleshandyHealthcheck,
    unipile: unipileHealthcheck,
    rb2b: rb2bHealthcheck,
    caldav: caldavHealthcheck,
    resend: resendHealthcheck,
    googlemeet: googlemeetHealthcheck,
  },
  actions: {
    fake: {
      "messages.send": (input) => ({ input }),
    },
    notion: {
      "credentials.validate": validateNotionCredentials,
      "comments.create": createNotionComment,
      "comments.list": listNotionComments,
      "comments.retrieve": retrieveNotionComment,
      "documents.blocks.append": appendNotionDocumentText,
      "documents.blocks.list": listNotionDocumentBlocks,
      "documents.create": createNotionDocument,
      "documents.get": getNotionDocument,
      "documents.restore": restoreNotionDocument,
      "documents.search": searchNotionDocuments,
      "documents.trash": trashNotionDocument,
      "databases.create": createNotionDatabase,
      "databases.get": getNotionDatabase,
      "databases.items.create": createNotionDatabaseItem,
      "databases.items.get": getNotionDatabaseItem,
      "databases.items.query": listNotionDatabaseItems,
      "databases.items.restore": restoreNotionDatabaseItem,
      "databases.items.trash": trashNotionDatabaseItem,
      "databases.items.update": updateNotionDatabaseItem,
      "users.me": getNotionCurrentUser,
      "users.get": getNotionUser,
      "blocks.delete": deleteNotionBlock,
      "pages.properties.get": getNotionPageProperty,
    },
    slack: {
      "messages.send": sendSlackMessage,
      "chat.update": slackUpdateMessage,
      "chat.delete": slackDeleteMessage,
      "chat.postEphemeral": slackPostEphemeral,
      "chat.scheduleMessage": slackScheduleMessage,
      "chat.meMessage": slackMeMessage,
      "conversations.create": slackCreateConversation,
      "conversations.list": slackListConversations,
      "conversations.history": slackConversationHistory,
      "conversations.info": slackConversationInfo,
      "conversations.invite": slackInviteToConversation,
      "conversations.members": slackConversationMembers,
      "conversations.replies": slackConversationReplies,
      "conversations.join": slackJoinConversation,
      "conversations.leave": slackLeaveConversation,
      "conversations.archive": slackArchiveConversation,
      "conversations.unarchive": slackUnarchiveConversation,
      "conversations.rename": slackRenameConversation,
      "conversations.setTopic": slackSetConversationTopic,
      "conversations.kick": slackKickFromConversation,
      "users.list": slackListUsers,
      "users.info": slackGetUserInfo,
      "users.lookupByEmail": slackLookupUserByEmail,
      "team.info": slackGetTeamInfo,
      "emoji.list": slackListEmoji,
      "pins.list": slackListPins,
      "pins.add": slackAddPin,
      "pins.remove": slackRemovePin,
      "reactions.get": slackGetReactions,
      "reactions.add": slackAddReaction,
      "reactions.remove": slackRemoveReaction,
      "files.info": slackGetFileInfo,
      "auth.test": slackAuthTest,
    },
    telegram: {
      "messages.send": sendTelegramMessage,
      "credentials.validate": validateTelegramCredentials,
      "messages.sendPhoto": tgSendPhoto,
      "messages.sendDocument": tgSendDocument,
      "messages.edit": tgEditMessage,
      "messages.delete": tgDeleteMessage,
      "messages.forward": tgForwardMessage,
      "messages.pin": tgPinMessage,
      "chats.get": tgGetChatInfo,
      "chats.getMemberCount": tgGetChatMemberCount,
      "chats.sendAction": tgSendChatAction,
      "bot.getMe": tgGetMe,
    },
    whatsapp: {
      "messages.send": sendWhatsAppMessage,
      "credentials.validate": validateWhatsAppCredentials,
      "messages.sendTemplate": waSendTemplate,
      "messages.sendImage": waSendImage,
      "messages.sendDocument": waSendDocument,
      "messages.sendLocation": waSendLocation,
      "messages.sendContacts": waSendContacts,
      "messages.sendReaction": waSendReaction,
      "messages.markRead": waMarkRead,
      "messages.sendInteractive": waSendInteractive,
      "messages.get": waGetMessage,
      "templates.list": waListTemplates,
      "media.get": waGetMedia,
      "media.upload": waUploadMedia,
      "media.delete": waDeleteMedia,
      "messages.sendAudio": waSendAudio,
      "messages.sendVideo": waSendVideo,
      "businessProfile.get": waGetBusinessProfile,
      "businessProfile.update": waUpdateBusinessProfile,
      "phoneNumbers.get": waGetPhoneNumber,
    },
    "google-workspace": {
      "messages.send": sendGmailMessage,
      "sheets.values.get": getSheetValues,
      "sheets.values.append": appendSheetValues,
      "docs.get": getGoogleDocument,
      "messages.get": gwGetMessage,
      "messages.modify": gwModifyMessage,
      "messages.trash": gwTrashMessage,
      "messages.untrash": gwUntrashMessage,
      "messages.delete": gwDeleteMessage,
      "messages.attachments.get": gwGetAttachment,
      "threads.list": gwListThreads,
      "threads.get": gwGetThread,
      "drafts.create": gwCreateDraft,
      "drafts.send": gwSendDraft,
      "drafts.delete": gwDeleteDraft,
      "labels.list": gwListLabels,
      "labels.create": gwCreateLabel,
      "labels.get": gwGetLabel,
      "calendar.events.create": gwCreateEvent,
      "calendar.events.update": gwUpdateEvent,
      "calendar.events.delete": gwDeleteEvent,
      "calendar.events.get": gwGetEvent,
      "calendar.events.instances": gwListEventInstances,
      "calendar.events.move": gwMoveEvent,
      "calendar.calendars.list": gwListCalendars,
      "calendar.calendars.get": gwGetCalendar,
      "calendar.acl.list": gwListAcl,
      "drive.files.get": gwGetDriveFile,
      "drive.files.create": gwCreateDriveFile,
      "drive.files.delete": gwDeleteDriveFile,
      "drive.files.copy": gwCopyDriveFile,
      "drive.files.update": gwUpdateDriveFile,
      "drive.permissions.create": gwCreateDrivePermission,
      "drive.permissions.list": gwListDrivePermissions,
      "drive.permissions.delete": gwDeleteDrivePermission,
      "sheets.values.update": gwUpdateSheetValues,
      "sheets.values.clear": gwClearSheetValues,
      "sheets.values.batchUpdate": gwBatchUpdateSheetValues,
      "sheets.spreadsheets.create": gwCreateSpreadsheet,
      "sheets.spreadsheets.get": gwGetSpreadsheet,
      "sheets.spreadsheets.batchUpdate": gwBatchUpdateSpreadsheet,
      "docs.create": gwCreateDocument,
      "docs.update": gwUpdateDocument,
      "meet.create": gwCreateMeetEvent,
      "meet.add_to_event": gwAddMeetToEvent,
      "meet.spaces.create": gwCreateMeetSpace,
      "meet.spaces.get": gwGetMeetSpace,
      "meet.conference_records.list": gwListConferenceRecords,
    },
    "microsoft-365": {
      "messages.send": sendOutlookMessage,
      "messages.get": msGetMessage,
      "messages.reply": msReplyMessage,
      "messages.move": msMoveMessage,
      "messages.delete": msDeleteMessage,
      "messages.create": msCreateMessage,
      "mailFolders.list": msListMailFolders,
      "mailFolders.get": msGetMailFolder,
      "events.create": msCreateEvent,
      "events.update": msUpdateEvent,
      "events.delete": msDeleteEvent,
      "events.get": msGetEvent,
      "calendars.get": msGetCalendar,
      "drive.items.get": msGetDriveItem,
      "drive.items.delete": msDeleteDriveItem,
      "drive.items.copy": msCopyDriveItem,
      "drive.items.update": msUpdateDriveItem,
      "contacts.create": msCreateContact,
      "contacts.list": msListContacts,
      "contacts.get": msGetContact,
      "contacts.update": msUpdateContact,
      "users.me": msGetMe,
      "teams_meetings.create": msCreateTeamsMeeting,
      "teams_meetings.get": msGetTeamsMeeting,
      "teams_meetings.update": msUpdateTeamsMeeting,
      "teams_meetings.delete": msDeleteTeamsMeeting,
      "teams_meetings.get_by_join_url": msGetTeamsByJoinUrl,
      "calendar.event.create_teams": msCreateCalendarTeamsEvent,
    },
    github: {
      "issues.create": createIssue,
      "issues.comments.create": createIssueComment,
      "pull_requests.create": createPullRequest,
      "pull_requests.merge": mergePullRequest,
      "issues.get": ghGetIssue,
      "issues.update": ghUpdateIssue,
      "issues.labels.add": ghAddIssueLabels,
      "pull_requests.get": ghGetPullRequest,
      "pull_requests.update": ghUpdatePullRequest,
      "pull_requests.list_files": ghListPullRequestFiles,
      "pull_requests.reviews.list": ghListPrReviews,
      "pull_requests.reviews.create": ghCreatePrReview,
      "pull_requests.reviews.dismiss": ghDismissPrReview,
      "pull_requests.review_comments.list": ghListPrReviewComments,
      "pull_requests.review_comments.create": ghCreatePrReviewComment,
      "pull_requests.review_comments.reply": ghReplyPrReviewComment,
      "pull_requests.requested_reviewers.add": ghAddRequestedReviewers,
      "pull_requests.requested_reviewers.remove": ghRemoveRequestedReviewers,
      "pull_requests.commits.list": ghListPrCommits,
      "pull_requests.check_merged": ghCheckPrMerged,
      "pull_requests.convert_to_draft": ghConvertPrToDraft,
      "pull_requests.mark_ready": ghMarkPrReady,
      "repos.get": ghGetRepo,
      "repos.create": ghCreateRepo,
      "repos.list": ghListRepos,
      "repos.contents.get": ghGetRepoContents,
      "branches.get": ghGetBranch,
      "branches.create": ghCreateBranch,
      "releases.create": ghCreateRelease,
      "releases.list": ghListReleases,
      "releases.get": ghGetRelease,
      "releases.get_latest": ghGetLatestRelease,
      "releases.get_by_tag": ghGetReleaseByTag,
      "releases.update": ghUpdateRelease,
      "releases.assets.list": ghListReleaseAssets,
      "releases.assets.get": ghGetReleaseAsset,
      "releases.assets.upload": ghUploadReleaseAsset,
      "releases.generate_notes": ghGenerateReleaseNotes,
      "releases.delete": ghDeleteRelease,
      "tags.list": ghListTags,
      "gists.create": ghCreateGist,
      "gists.list": ghListGists,
      "gists.get": ghGetGist,
      "gists.update": ghUpdateGist,
      "gists.delete": ghDeleteGist,
      "issues.comments.list": ghListIssueComments,
      "issues.comments.update": ghUpdateIssueComment,
      "issues.comments.delete": ghDeleteIssueComment,
      "issues.assignees.add": ghAddIssueAssignees,
      "issues.assignees.remove": ghRemoveIssueAssignees,
      "issues.labels.remove": ghRemoveIssueLabels,
      "issues.labels.set": ghSetIssueLabels,
      "issues.lock": ghLockIssue,
      "issues.unlock": ghUnlockIssue,
      "labels.list": ghListLabels,
      "search.issues": ghSearchIssues,
      "search.pull_requests": ghSearchPullRequests,
      "actions.workflows.list": ghListWorkflows,
      "actions.workflows.get": ghGetWorkflow,
      "actions.runs.list": ghListWorkflowRuns,
      "actions.runs.get": ghGetWorkflowRun,
      "actions.runs.cancel": ghCancelWorkflowRun,
      "actions.runs.rerun": ghRerunWorkflowRun,
      "actions.workflows.dispatch": ghDispatchWorkflow,
      "actions.jobs.list": ghListWorkflowJobs,
      "actions.jobs.get": ghGetWorkflowJob,
      "actions.jobs.logs.get": ghGetWorkflowJobLogs,
      "actions.artifacts.list": ghListArtifacts,
      "actions.artifacts.get": ghGetArtifact,
      "actions.artifacts.download": ghDownloadArtifact,
      "actions.runs.logs.download": ghDownloadWorkflowRunLogs,
      "actions.runs.rerun_failed": ghRerunFailedWorkflowJobs,
      "checks.runs.list_for_ref": ghListCheckRunsForRef,
      "checks.runs.get": ghGetCheckRun,
      "checks.suites.list_for_ref": ghListCheckSuitesForRef,
      "commits.status.get": ghGetCommitStatus,
      "commits.statuses.list": ghListCommitStatuses,
      "commits.statuses.create": ghCreateCommitStatus,
      "commits.get": ghGetCommit,
      "repos.compare": ghCompareRepos,
      "pull_requests.update_branch": ghUpdatePullRequestBranch,
      "branches.list": ghListBranches,
      "repos.contents.put": ghPutContents,
      "repos.contents.delete": ghDeleteContents,
      "repos.contents.push_files": ghPushFiles,
      "git.blobs.create": ghCreateGitBlob,
      "git.blobs.get": ghGetGitBlob,
      "git.trees.create": ghCreateGitTree,
      "git.trees.get": ghGetGitTree,
      "git.refs.create": ghCreateGitRef,
      "git.refs.update": ghUpdateGitRef,
      "git.refs.get": ghGetGitRef,
      "git.refs.list": ghListGitRefs,
      "git.refs.delete": ghDeleteGitRef,
      "git.tags.get": ghGetGitTag,
      "git.tags.create": ghCreateGitTag,
      "git.commits.create": ghCreateGitCommit,
      "repos.tree.get": ghGetRepoTree,
      "search.users": ghSearchUsers,
      "search.code": ghSearchCode,
      "search.commits": ghSearchCommits,
      "search.repositories": ghSearchRepositories,
      "search.topics.list": ghSearchTopics,
      "search.labels.list": ghSearchLabels,
      "search.orgs": ghSearchOrgs,
      "users.get": ghGetAuthenticatedUser,
      "users.get_authenticated": ghGetUsersAuthenticated,
      "users.get_by_username": ghGetUserByUsername,
      "users.repos.list": ghListUserRepos,
      "users.events.public.list": ghListPublicUserEvents,
      "users.received_events.public.list": ghListPublicReceivedUserEvents,
      "users.keys.list": ghListUserKeys,
      "users.starred.list": ghListUserStarred,
      "user.starred.list": ghListAuthenticatedStarred,
      "users.social_accounts.list": ghListUserSocialAccounts,
      "user.social_accounts.list": ghListAuthenticatedSocialAccounts,
      "users.ssh_signing_keys.list": ghListUserSshSigningKeys,
      "users.hovercard.get": ghGetUserHovercard,
      "user.emails.list": ghListUserEmails,
      "users.events.list": ghListUserEvents,
      "users.received_events.list": ghListUserReceivedEvents,
      "users.gpg_keys.list": ghListUserGpgKeys,
      "user.marketplace_purchases.list": ghListMarketplacePurchases,
      "user.marketplace_purchases.stubbed.list": ghListMarketplacePurchasesStubbed,
      "user.blocks.list": ghListUserBlocks,
      "repos.environments.secrets.public_key.get": ghGetEnvironmentSecretsPublicKey,
      "repos.environments.secrets.get": ghGetEnvironmentSecret,
      "user.codespaces.secrets.get": ghGetCodespacesSecret,
      "user.codespaces.secrets.public_key.get": ghGetCodespacesSecretsPublicKey,
      "orgs.get": ghGetOrg,
      "orgs.list": ghListOrgs,
      "orgs.members.list": ghListOrgMembers,
      "orgs.repos.list": ghListOrgRepos,
      "labels.get": ghGetLabel,
      "labels.create": ghCreateLabel,
      "labels.update": ghUpdateLabel,
      "labels.delete": ghDeleteLabel,
      "milestones.list": ghListMilestones,
      "milestones.get": ghGetMilestone,
      "milestones.create": ghCreateMilestone,
      "milestones.update": ghUpdateMilestone,
      "repos.collaborators.list": ghListCollaborators,
      "repos.collaborators.add": ghAddCollaborator,
      "repos.collaborators.remove": ghRemoveCollaborator,
      "repos.collaborators.check": ghCheckCollaborator,
      "discussions.categories.list": ghListDiscussionCategories,
      "discussions.list": ghListDiscussions,
      "discussions.get": ghGetDiscussion,
      "discussions.create": ghCreateDiscussion,
      "discussions.update": ghUpdateDiscussion,
      "discussions.comments.list": ghListDiscussionComments,
      "discussions.comments.create": ghCreateDiscussionComment,
      "discussions.comments.update": ghUpdateDiscussionComment,
      "pull_requests.comments.list": ghListPullRequestComments,
      "repos.update": ghUpdateRepo,
      "branches.delete": ghDeleteBranch,
      "commits.comments.create": ghCreateCommitComment,
      "commits.comments.list": ghListCommitComments,
      "commits.comments.update": ghUpdateCommitComment,
      "commits.comments.delete": ghDeleteCommitComment,
      "pull_requests.reviews.get": ghGetPullRequestReview,
      "pull_requests.reviews.submit": ghSubmitPullRequestReview,
      "pull_requests.reviews.delete_pending": ghDeletePendingPullRequestReview,
      "pull_requests.review_comments.update": ghUpdatePullRequestReviewComment,
      "pull_requests.review_comments.delete": ghDeletePullRequestReviewComment,
      "issues.timeline.list": ghListIssueTimeline,
      "issues.events.list": ghListIssueEvents,
      "checks.annotations.list": ghListCheckAnnotations,
      "checks.runs.create": ghCreateCheckRun,
      "notifications.list": ghListNotifications,
      "notifications.get": ghGetNotification,
      "notifications.mark_read": ghMarkNotificationRead,
      "notifications.mark_all_read": ghMarkAllNotificationsRead,
      "orgs.teams.list": ghListOrgTeams,
      "teams.members.list": ghListTeamMembers,
      "teams.membership.add": ghAddTeamMembership,
      "repos.fork": ghForkRepo,
      "repos.forks.list": ghListRepoForks,
      "repos.star": ghStarRepo,
      "repos.unstar": ghUnstarRepo,
      "deployments.list": ghListDeployments,
      "deployments.get": ghGetDeployment,
      "deployments.create": ghCreateDeployment,
      "deployments.statuses.list": ghListDeploymentStatuses,
      "deployments.statuses.create": ghCreateDeploymentStatus,
      "environments.list": ghListEnvironments,
      "environments.get": ghGetEnvironment,
      "repos.collaborators.permission.get": ghGetCollaboratorPermission,
      "branches.protection.get": ghGetBranchProtection,
      "repos.rulesets.list": ghListRepoRulesets,
      "repos.rules.for_branch": ghGetRulesForBranch,
      "repos.hooks.list": ghListRepoHooks,
      "teams.membership.get": ghGetTeamMembership,
      "teams.repos.list": ghListTeamRepos,
      "repos.invitations.list": ghListRepoInvitations,
      "orgs.repos.create": ghCreateOrgRepo,
      "teams.create": ghCreateTeam,
      "repos.hooks.create": ghCreateRepoHook,
      "orgs.hooks.get": ghGetOrgHook,
      "repos.hooks.get": ghGetRepoHook,
      "orgs.hooks.config.get": ghGetOrgHookConfig,
      "repos.hooks.config.get": ghGetRepoHookConfig,
      "orgs.hooks.deliveries.get": ghGetOrgHookDelivery,
      "repos.hooks.deliveries.get": ghGetRepoHookDelivery,
      "orgs.hooks.deliveries.list": ghListOrgHookDeliveries,
      "repos.hooks.deliveries.list": ghListRepoHookDeliveries,
      "teams.membership.remove": ghRemoveTeamMembership,
      "repos.dispatch": ghDispatchRepo,
      "dependabot.alerts.list": ghListDependabotAlerts,
      "code_scanning.alerts.list": ghListCodeScanningAlerts,
      "code_scanning.alerts.get": ghGetCodeScanningAlert,
      "code_scanning.alerts.update": ghUpdateCodeScanningAlert,
      "secret_scanning.alerts.list": ghListSecretScanningAlerts,
      "actions.variables.list": ghListActionsVariables,
      "actions.secrets.list": ghListActionsSecrets,
      "actions.runs.pending_deployments.list": ghListPendingDeployments,
      "actions.runs.pending_deployments.review": ghReviewPendingDeployments,
      "actions.runs.approvals.list": ghListRunApprovals,
      "environments.create": ghCreateEnvironment,
      "deployments.delete": ghDeleteDeployment,
      "environments.delete": ghDeleteEnvironment,
      "actions.workflows.disable": ghDisableWorkflow,
      "actions.workflows.enable": ghEnableWorkflow,
      "actions.artifacts.delete": ghDeleteArtifact,
      "actions.runs.attempt.get": ghGetRunAttempt,
      "actions.runs.attempt.jobs.list": ghListAttemptJobs,
      "actions.runs.attempt.logs.download": ghDownloadAttemptLogs,
      "actions.runs.force_cancel": ghForceCancelRun,
      "checks.runs.update": ghUpdateCheckRun,
      "checks.runs.rerequest": ghRerequestCheckRun,
      "checks.suites.get": ghGetCheckSuite,
      "checks.suites.rerequest": ghRerequestCheckSuite,
      "pull_requests.requested_reviewers.list": ghListRequestedReviewers,
      "pull_requests.review_comments.get": ghGetPullRequestReviewComment,
      "pull_requests.reviews.comments.list": ghListPullRequestReviewComments,
      "issues.comments.get": ghGetIssueComment,
      "issues.labels.list": ghListIssueLabels,
      "commits.comments.get": ghGetCommitComment,
      "actions.variables.get": ghGetActionsVariable,
      "actions.variables.create": ghCreateActionsVariable,
      "actions.variables.update": ghUpdateActionsVariable,
      "actions.variables.delete": ghDeleteActionsVariable,
      "actions.workflows.runs.list": ghListRunsForWorkflow,
      "actions.caches.list": ghListCaches,
      "actions.caches.delete": ghDeleteCache,
      "actions.caches.delete_by_key": ghDeleteCachesByKey,
      "actions.jobs.rerun": ghRerunJob,
      "actions.runs.delete": ghDeleteRun,
      "actions.runs.approve": ghApproveRun,
      "repos.rule_suites.list": ghListRuleSuites,
      "repos.rule_suites.get": ghGetRuleSuite,
      "repos.rulesets.get": ghGetRepoRuleset,
      "commits.pulls.list": ghListCommitPulls,
      "commits.branches_where_head.list": ghListBranchesWhereHead,
      "git.commits.get": ghGetGitCommit,
      "actions.environment_variables.list": ghListEnvironmentVariables,
      "actions.environment_variables.get": ghGetEnvironmentVariable,
      "actions.environment_variables.create": ghCreateEnvironmentVariable,
      "actions.environment_variables.update": ghUpdateEnvironmentVariable,
      "actions.environment_variables.delete": ghDeleteEnvironmentVariable,
      "actions.org_variables.list_for_repo": ghListRepoOrganizationVariables,
      "actions.org_variables.list": ghListOrgVariables,
      "actions.org_variables.get": ghGetOrgVariable,
      "actions.org_variables.create": ghCreateOrgVariable,
      "actions.org_variables.update": ghUpdateOrgVariable,
      "actions.org_variables.delete": ghDeleteOrgVariable,
      "actions.permissions.workflow.get": ghGetWorkflowPermissions,
      "actions.permissions.workflow.set": ghSetWorkflowPermissions,
      "actions.permissions.get": ghGetActionsPermissions,
      "actions.permissions.set": ghSetActionsPermissions,
      "actions.permissions.selected_actions.get": ghGetSelectedActions,
      "actions.permissions.selected_actions.set": ghSetSelectedActions,
      "deployments.branch_policies.list": ghListDeploymentBranchPolicies,
      "deployments.branch_policies.get": ghGetDeploymentBranchPolicy,
      "deployments.branch_policies.create": ghCreateDeploymentBranchPolicy,
      "deployments.branch_policies.update": ghUpdateDeploymentBranchPolicy,
      "deployments.branch_policies.delete": ghDeleteDeploymentBranchPolicy,
      "repos.merge_upstream": ghMergeUpstream,
      "pull_requests.reviews.update": ghUpdatePullRequestReview,
      "repos.merges": ghMergeBranches,
      "branches.rename": ghRenameBranch,
      "repos.codeowners.errors.list": ghListCodeownersErrors,
      "dependency_graph.compare": ghCompareDependencyGraph,
      "code_scanning.alerts.instances.list": ghListCodeScanningAlertInstances,
      "code_scanning.analyses.list": ghListCodeScanningAnalyses,
      "code_scanning.analyses.get": ghGetCodeScanningAnalysis,
      "deployments.statuses.get": ghGetDeploymentStatus,
      "checks.runs.list_for_suite": ghListCheckRunsForSuite,
      "repos.autolinks.get": ghGetRepoAutolink,
      "repos.readme.get": ghGetRepoReadme,
      "repos.readme.get_for_dir": ghGetRepoReadmeForDir,
      "repos.subscription.get": ghGetRepoSubscription,
      "repos.community.profile.get": ghGetRepoCommunityProfile,
      "repos.interaction_limits.get": ghGetRepoInteractionLimits,
      "repos.security_advisories.get": ghGetRepoSecurityAdvisory,
      "repos.license.get": ghGetRepoLicense,
      "orgs.attestations.repositories.list": ghListOrgAttestationRepositories,
      "repos.stats.contributors.list": ghListRepoStatsContributors,
      "repos.traffic.views.get": ghGetRepoTrafficViews,
      "repos.traffic.clones.get": ghGetRepoTrafficClones,
      "repos.stats.punch_card.get": ghGetRepoStatsPunchCard,
      "repos.stats.commit_activity.list": ghListRepoStatsCommitActivity,
      "repos.stats.code_frequency.get": ghGetRepoStatsCodeFrequency,
      "repos.stats.participation.get": ghGetRepoStatsParticipation,
      "repos.traffic.popular.paths.list": ghListRepoTrafficPopularPaths,
      "repos.traffic.popular.referrers.list": ghListRepoTrafficPopularReferrers,
      "repos.network.events.list": ghListRepoNetworkEvents,
      "repos.public.list": ghListPublicRepositories,
      "repos.activity.list": ghListRepoActivity,
      "repos.contributors.list": ghListRepoContributors,
      "repos.events.list": ghListRepoEvents,
      "repos.languages.list": ghListRepoLanguages,
      "repos.security_advisories.list": ghListRepoSecurityAdvisories,
      "repos.topics.get": ghGetRepoTopics,
      "orgs.blocks.check": ghCheckOrgBlock,
      "orgs.public_members.check": ghCheckOrgPublicMember,
      "orgs.organization_roles.get": ghGetOrganizationRole,
      "orgs.interaction_limits.get": ghGetOrgInteractionLimits,
      "orgs.public.list": ghListPublicOrgs,
      "users.orgs.list": ghListUserOrgs,
      "users.events.orgs.list": ghListUserOrgEvents,
      "orgs.outside_collaborators.list": ghListOutsideCollaborators,
      "orgs.events.list": ghListOrgEvents,
      "orgs.public_members.list": ghListPublicOrgMembers,
      "orgs.blocks.list": ghListOrgBlocks,
      "repos.environments.secrets.list": ghListRepoEnvironmentSecrets,
      "actions.organization_secrets.list": ghListRepoOrganizationSecrets,
      "user.codespaces.secrets.list": ghListUserCodespacesSecrets,
      "user.codespaces.secrets.repositories.list": ghListUserCodespacesSecretRepositories,
      "branches.protection.restrictions.get": ghGetBranchProtectionRestrictions,
      "branches.protection.enforce_admins.get": ghGetBranchProtectionEnforceAdmins,
      "branches.protection.required_signatures.get": ghGetBranchProtectionRequiredSignatures,
      "environments.deployment_protection_rules.get": ghGetEnvironmentDeploymentProtectionRule,
      "branches.protection.required_pull_request_reviews.get": ghGetRequiredPullRequestReviews,
      "branches.protection.required_status_checks.get": ghGetRequiredStatusChecks,
      "branches.protection.restrictions.teams.list": ghListBranchProtectionRestrictionTeams,
      "branches.protection.restrictions.users.list": ghListBranchProtectionRestrictionUsers,
      "users.projects_v2.fields.list": ghListUserProjectFields,
      "apps.get": ghGetApp,
      "orgs.packages.get": ghGetOrgPackage,
      "users.packages.get": ghGetUserPackage,
      "user.packages.get": ghGetAuthenticatedUserPackage,
      "orgs.packages.versions.get": ghGetOrgPackageVersion,
      "orgs.organization_roles.users.list": ghListOrgRoleUsers,
      "repos.tarball.get": ghGetRepoTarball,
      "repos.zipball.get": ghGetRepoZipball,
      "repos.assignees.check": ghCheckRepoAssignee,
      "user.blocks.check": ghCheckUserBlocked,
      "notifications.threads.subscription.get": ghGetNotificationThreadSubscription,
      "users.billing.usage.get": ghGetUserBillingUsage,
      "codes_of_conduct.get": ghGetCodeOfConduct,
      "repos.assignees.list": ghListRepoAssignees,
      "events.public.list": ghListPublicEvents,
      "users.packages.versions.get": ghGetUserPackageVersion,
      "user.packages.versions.get": ghGetAuthenticatedPackageVersion,
      "orgs.packages.list": ghListOrgPackages,
      "users.packages.list": ghListUserPackages,
      "users.packages.versions.list": ghListUserPackageVersions,
      "repos.codespaces.new.get": ghGetRepoCodespaceDefaults,
      "user.codespaces.exports.get": ghGetCodespaceExport,
      "repos.codespaces.machines.list": ghListRepoCodespaceMachines,
      "orgs.members.codespaces.list": ghListOrgMemberCodespaces,
      "user.codespaces.list": ghListUserCodespaces,
      "orgs.codespaces.list": ghListOrgCodespaces,
      "user.codespaces.machines.list": ghListCodespaceMachines,
      "orgs.hooks.list": ghListOrgHooks,
      "issues.reactions.list": ghListIssueReactions,
      "issues.comments.reactions.list": ghListIssueCommentReactions,
      "commits.comments.reactions.list": ghListCommitCommentReactions,
      "pull_requests.review_comments.reactions.list": ghListReviewCommentReactions,
      "releases.reactions.list": ghListReleaseReactions,
      "orgs.actions.runners.get": ghGetOrgActionsRunner,
      "repos.actions.runners.get": ghGetRepoActionsRunner,
      "repos.actions.runners.labels.list": ghListRepoActionsRunnerLabels,
      "orgs.actions.runners.downloads.list": ghListOrgRunnerDownloads,
      "repos.actions.runners.downloads.list": ghListRepoRunnerDownloads,
      "orgs.actions.runners.list": ghListOrgActionsRunners,
      "repos.actions.runners.list": ghListRepoActionsRunners,
      "users.following.check": ghCheckUserFollowing,
      "users.followers.list": ghListUserFollowers,
      "user.followers.list": ghListAuthenticatedUserFollowers,
      "users.subscriptions.list": ghListUserSubscriptions,
      "user.subscriptions.list": ghListAuthenticatedUserSubscriptions,
      "repos.stargazers.list": ghListRepoStargazers,
      "users.following.list": ghListUserFollowing,
      "user.following.list": ghListAuthenticatedUserFollowing,
      "repos.subscribers.list": ghListRepoSubscribers,
      "gists.star.check": ghCheckGistStar,
      "gists.comments.get": ghGetGistComment,
      "gists.revision.get": ghGetGistRevision,
      "users.gists.list": ghListUserGists,
      "gists.comments.list": ghListGistComments,
      "gists.commits.list": ghListGistCommits,
      "gists.forks.list": ghListGistForks,
      "gists.public.list": ghListPublicGists,
      "gists.starred.list": ghListStarredGists,
      "issues.assignees.check": ghCheckIssueAssignee,
      "issues.events.get": ghGetIssueEvent,
      "issues.assigned.list": ghListAssignedIssues,
      "repos.issues.comments.list": ghListRepoIssueComments,
      "repos.issues.events.list": ghListRepoIssueEvents,
      "milestones.labels.list": ghListMilestoneLabels,
      "issues.sub_issues.list": ghListIssueSubIssues,
      "orgs.teams.repos.permission.get": ghGetOrgTeamRepoPermission,
      "orgs.teams.get": ghGetOrgTeam,
      "orgs.teams.child.list": ghListOrgChildTeams,
      "orgs.teams.invitations.list": ghListOrgTeamInvitations,
      "repos.teams.list": ghListRepoTeams,
      "user.teams.list": ghListAuthenticatedUserTeams,
      "orgs.organization_roles.teams.list": ghListOrgRoleTeams,
      "orgs.actions.permissions.workflow.get": ghGetOrgActionsWorkflowPermissions,
      "orgs.actions.cache.usage.get": ghGetOrgActionsCacheUsage,
      "repos.actions.cache.usage.get": ghGetRepoActionsCacheUsage,
      "orgs.actions.permissions.get": ghGetOrgActionsPermissions,
      "actions.runs.timing.get": ghGetActionsRunTiming,
      "actions.workflows.timing.get": ghGetActionsWorkflowTiming,
      "meta.zen.get": ghGetZen,
      "licenses.get": ghGetLicense,
      "gitignore.templates.get": ghGetGitignoreTemplate,
      "repos.pages.builds.get": ghGetRepoPagesBuild,
      "repos.pages.builds.latest.get": ghGetLatestRepoPagesBuild,
      "repos.pages.deployments.get": ghGetRepoPagesDeployment,
      "repos.pages.builds.list": ghListRepoPagesBuilds,
      "code_scanning.sarifs.get": ghGetCodeScanningSarif,
      "code_scanning.codeql.databases.list": ghListCodeqlDatabases,
      "orgs.code_scanning.alerts.list": ghListOrgCodeScanningAlerts,
      "advisories.get": ghGetGlobalAdvisory,
      "advisories.list": ghListGlobalAdvisories,
      "emojis.get": ghGetEmojis,
      "feeds.get": ghGetFeeds,
      "meta.get": ghGetMeta,
      "meta.versions.list": ghListMetaVersions,
      "meta.octocat.get": ghGetOctocat,
      "meta.root.get": ghGetMetaRoot,
      "repos.dependency_graph.sbom.get": ghGetRepoDependencyGraphSbom,
      "code_scanning.codeql.databases.get": ghGetCodeqlDatabase,
      "code_scanning.default_setup.get": ghGetCodeScanningDefaultSetup,
      "orgs.properties.schema.get": ghGetOrgPropertySchema,
      "orgs.projects_v2.items.get": ghGetOrgProjectItem,
      "repos.pages.health.get": ghGetRepoPagesHealth,
      "repos.pages.get": ghGetRepoPages,
      "users.projects_v2.items.get": ghGetUserProjectItem,
      "repos.issue_types.list": ghListRepoIssueTypes,
      "orgs.projects_v2.list": ghListOrgProjects,
      "users.projects_v2.items.list": ghListUserProjectItems,
      "users.projects_v2.views.items.list": ghListUserProjectViewItems,
      "users.projects_v2.list": ghListUserProjects,
      "rate_limit.get": ghGetRateLimit,
      "repos.comments.list": ghListRepoComments,
      "repos.keys.get": ghGetRepoKey,
      "repos.keys.list": ghListRepoKeys,
      "repos.pulls.comments.list": ghListRepoPullComments,
      "orgs.organization_roles.users.assign": ghAssignOrgRoleToUser,
      "orgs.blocks.block": ghBlockOrgUser,
      "orgs.delete": ghDeleteOrg,
      "orgs.organization_roles.users.remove_all": ghRemoveAllOrgRolesFromUser,
      "orgs.members.remove": ghRemoveOrgMember,
      "orgs.organization_roles.users.remove": ghRemoveOrgRoleFromUser,
      "orgs.properties.schema.delete": ghDeleteOrgPropertySchema,
      "orgs.interaction_limits.delete": ghDeleteOrgInteractionLimits,
      "orgs.outside_collaborators.remove": ghRemoveOutsideCollaborator,
      "orgs.interaction_limits.set": ghSetOrgInteractionLimits,
      "orgs.blocks.unblock": ghUnblockOrgUser,
      "orgs.migrations.repos.unlock": ghUnlockOrgMigrationRepo,
      "orgs.update": ghUpdateOrg,
      "user.repository_invitations.accept": ghAcceptRepositoryInvitation,
      "repos.autolinks.create": ghCreateRepoAutolink,
      "repos.generate": ghGenerateRepoFromTemplate,
      "repos.dependency_graph.snapshots.create": ghCreateDependencySnapshot,
      "user.repository_invitations.decline": ghDeclineRepositoryInvitation,
      "repos.delete": ghDeleteRepo,
      "repos.invitations.delete": ghDeleteRepoInvitation,
      "repos.subscription.delete": ghDeleteRepoSubscription,
      "repos.notifications.mark_read": ghMarkRepoNotificationsRead,
      "repos.interaction_limits.delete": ghDeleteRepoInteractionLimits,
      "repos.transfer": ghTransferRepo,
      "repos.invitations.update": ghUpdateRepoInvitation,
      "repos.check_suites.preferences.update": ghUpdateCheckSuitePreferences,
      "repos.topics.replace": ghReplaceRepoTopics,
      "repos.subscription.set": ghSetRepoSubscription,
      "repos.interaction_limits.set": ghSetRepoInteractionLimits,
      "user.emails.create": ghAddUserEmails,
      "user.social_accounts.add": ghAddUserSocialAccounts,
      "user.blocks.block": ghBlockUser,
      "user.codespaces.secrets.repositories.add": ghAddCodespaceSecretRepository,
      "repos.environments.secrets.create_or_update": ghUpsertEnvironmentSecret,
      "user.codespaces.secrets.create_or_update": ghUpsertCodespaceSecret,
      "user.social_accounts.delete": ghDeleteUserSocialAccounts,
      "user.blocks.unblock": ghUnblockUser,
      "user.migrations.repos.unlock": ghUnlockUserMigrationRepo,
      "user.codespaces.secrets.delete": ghDeleteCodespaceSecret,
      "repos.environments.secrets.delete": ghDeleteEnvironmentSecret,
      "user.update": ghUpdateAuthenticatedUser,
      "user.codespaces.secrets.repositories.remove": ghRemoveCodespaceSecretRepository,
      "user.codespaces.secrets.repositories.set": ghSetCodespaceSecretRepositories,
      "branches.protection.restrictions.apps.add": ghAddBranchProtectionRestrictionApps,
      "branches.protection.required_status_checks.contexts.add": ghAddBranchProtectionStatusCheckContexts,
      "branches.protection.restrictions.teams.add": ghAddBranchProtectionRestrictionTeams,
      "branches.protection.restrictions.users.add": ghAddBranchProtectionRestrictionUsers,
      "branches.protection.required_signatures.create": ghCreateBranchProtectionRequiredSignatures,
      "branches.protection.restrictions.delete": ghDeleteBranchProtectionRestrictions,
      "branches.protection.enforce_admins.delete": ghDeleteBranchProtectionEnforceAdmins,
      "branches.protection.delete": ghDeleteBranchProtection,
      "branches.protection.required_signatures.delete": ghDeleteBranchProtectionRequiredSignatures,
      "branches.protection.required_pull_request_reviews.delete": ghDeleteBranchProtectionRequiredPullRequestReviews,
      "repos.environments.deployment_protection_rules.delete": ghDeleteEnvironmentDeploymentProtectionRule,
      "branches.protection.restrictions.apps.delete": ghRemoveBranchProtectionRestrictionApps,
      "branches.protection.required_status_checks.contexts.delete": ghRemoveBranchProtectionStatusCheckContexts,
      "branches.protection.required_status_checks.delete": ghDeleteBranchProtectionRequiredStatusChecks,
      "branches.protection.restrictions.teams.delete": ghRemoveBranchProtectionRestrictionTeams,
      "branches.protection.restrictions.users.delete": ghRemoveBranchProtectionRestrictionUsers,
      "branches.protection.enforce_admins.create": ghCreateBranchProtectionEnforceAdmins,
      "branches.protection.restrictions.apps.set": ghSetBranchProtectionRestrictionApps,
      "branches.protection.required_status_checks.contexts.set": ghSetBranchProtectionStatusCheckContexts,
      "branches.protection.restrictions.teams.set": ghSetBranchProtectionRestrictionTeams,
      "branches.protection.restrictions.users.set": ghSetBranchProtectionRestrictionUsers,
      "branches.protection.update": ghUpdateBranchProtection,
      "branches.protection.required_pull_request_reviews.update": ghUpdateBranchProtectionRequiredPullRequestReviews,
      "branches.protection.required_status_checks.update": ghUpdateBranchProtectionRequiredStatusChecks,
      "users.projects_v2.items.delete": ghDeleteUserProjectItem,
      "checks.suites.create": ghCreateCheckSuite,
      "notifications.threads.subscription.delete": ghDeleteThreadSubscription,
      "notifications.threads.mark_done": ghMarkThreadDone,
      "notifications.threads.subscription.set": ghSetThreadSubscription,
      "milestones.delete": ghDeleteMilestone,
      "orgs.actions.runners.registration_token.create": ghCreateOrgRunnerRegistrationToken,
      "repos.actions.runners.registration_token.create": ghCreateRepoRunnerRegistrationToken,
      "orgs.actions.runners.remove_token.create": ghCreateOrgRunnerRemoveToken,
      "repos.actions.runners.remove_token.create": ghCreateRepoRunnerRemoveToken,
      "user.installations.repositories.add": ghAddInstallationRepository,
      "user.installations.repositories.remove": ghRemoveInstallationRepository,
      "user.packages.versions.delete": ghDeleteAuthenticatedPackageVersion,
      "orgs.packages.versions.delete": ghDeleteOrgPackageVersion,
      "users.packages.versions.delete": ghDeleteUserPackageVersion,
      "orgs.packages.restore": ghRestoreOrgPackage,
      "users.packages.restore": ghRestoreUserPackage,
      "user.packages.restore": ghRestoreAuthenticatedPackage,
      "user.packages.versions.restore": ghRestoreAuthenticatedPackageVersion,
      "orgs.packages.versions.restore": ghRestoreOrgPackageVersion,
      "users.packages.versions.restore": ghRestoreUserPackageVersion,
      "orgs.codespaces.access.selected_users.add": ghAddOrgCodespacesAccessSelectedUsers,
      "user.codespaces.create": ghCreateUserCodespace,
      "repos.codespaces.create": ghCreateRepoCodespace,
      "repos.pulls.codespaces.create": ghCreatePullCodespace,
      "user.codespaces.publish": ghPublishCodespace,
      "user.codespaces.exports.create": ghCreateCodespaceExport,
      "orgs.codespaces.access.set": ghSetOrgCodespacesAccess,
      "user.codespaces.start": ghStartUserCodespace,
      "orgs.members.codespaces.stop": ghStopOrgMemberCodespace,
      "user.codespaces.stop": ghStopUserCodespace,
      "orgs.hooks.create": ghCreateOrgHook,
      "repos.hooks.delete": ghDeleteRepoHook,
      "orgs.hooks.delete": ghDeleteOrgHook,
      "orgs.hooks.ping": ghPingOrgHook,
      "repos.hooks.ping": ghPingRepoHook,
      "orgs.hooks.deliveries.redeliver": ghRedeliverOrgHookDelivery,
      "repos.hooks.deliveries.redeliver": ghRedeliverRepoHookDelivery,
      "orgs.hooks.update": ghUpdateOrgHook,
      "repos.hooks.update": ghUpdateRepoHook,
      "issues.reactions.create": ghCreateIssueReaction,
      "issues.comments.reactions.create": ghCreateIssueCommentReaction,
      "commits.comments.reactions.create": ghCreateCommitCommentReaction,
      "pull_requests.review_comments.reactions.create": ghCreatePullReviewCommentReaction,
      "releases.reactions.create": ghCreateReleaseReaction,
      "releases.reactions.delete": ghDeleteReleaseReaction,
      "commits.comments.reactions.delete": ghDeleteCommitCommentReaction,
      "issues.comments.reactions.delete": ghDeleteIssueCommentReaction,
      "issues.reactions.delete": ghDeleteIssueReaction,
      "pull_requests.review_comments.reactions.delete": ghDeletePullReviewCommentReaction,
      "orgs.actions.runners.delete": ghDeleteOrgActionsRunner,
      "repos.actions.runners.delete": ghDeleteRepoActionsRunner,
      "user.following.follow": ghFollowUser,
      "user.following.unfollow": ghUnfollowUser,
      "gists.comments.create": ghCreateGistComment,
      "gists.comments.delete": ghDeleteGistComment,
      "gists.comments.update": ghUpdateGistComment,
      "gists.forks.create": ghCreateGistFork,
      "gists.star": ghStarGist,
      "gists.unstar": ghUnstarGist,
      "issues.sub_issues.add": ghAddSubIssue,
      "issues.labels.remove_all": ghRemoveAllIssueLabels,
      "orgs.teams.repos.add": ghAddTeamRepo,
      "orgs.organization_roles.teams.assign": ghAssignOrgRoleToTeam,
      "orgs.teams.delete": ghDeleteOrgTeam,
      "orgs.organization_roles.teams.remove_all": ghRemoveAllOrgRolesFromTeam,
      "orgs.organization_roles.teams.remove": ghRemoveOrgRoleFromTeam,
      "orgs.teams.repos.remove": ghRemoveTeamRepo,
      "orgs.teams.update": ghUpdateOrgTeam,
      "actions.org_variables.repositories.add": ghAddOrgVariableRepository,
      "actions.runs.logs.delete": ghDeleteRunLogs,
      "orgs.actions.permissions.workflow.set": ghSetOrgWorkflowPermissions,
      "orgs.actions.permissions.set": ghSetOrgActionsPermissions,
      "markdown.render": ghRenderMarkdown,
      "repos.pages.deployments.cancel": ghCancelPagesDeployment,
      "repos.pages.deployments.create": ghCreatePagesDeployment,
      "repos.pages.create": ghCreatePagesSite,
      "repos.pages.delete": ghDeletePagesSite,
      "repos.pages.builds.request": ghRequestPagesBuild,
      "repos.security_advisories.reports.create": ghCreateSecurityAdvisoryReport,
      "repos.security_advisories.forks.create": ghCreateSecurityAdvisoryFork,
      "repos.keys.create": ghCreateRepoKey,
      "repos.keys.delete": ghDeleteRepoKey,
      "repos.rulesets.create": ghCreateRepoRuleset,
      "repos.rulesets.delete": ghDeleteRepoRuleset,
      "repos.rulesets.update": ghUpdateRepoRuleset,
      "releases.assets.delete": ghDeleteReleaseAsset,
      "releases.assets.update": ghUpdateReleaseAsset,
      "users.projects_v2.fields.create": ghCreateUserProjectField,
      "users.projects_v2.items.create": ghCreateUserProjectItem,
      "users.projects_v2.drafts.create": ghCreateUserProjectDraft,
      "users.projects_v2.views.create": ghCreateUserProjectView,
      "repos.autolinks.delete": ghDeleteAutolink,
      "code_scanning.analyses.delete": ghDeleteCodeScanningAnalysis,
      "users.packages.delete": ghDeleteUserPackage,
      "repos.actions.runners.labels.remove": ghRemoveRunnerLabel,
      "repos.hooks.test": ghTestRepoHook,
      "code_scanning.default_setup.update": ghUpdateCodeScanningDefaultSetup,
      "orgs.hooks.config.update": ghUpdateOrgHookConfig,
      "repos.hooks.config.update": ghUpdateRepoHookConfig,
      "users.projects_v2.items.update": ghUpdateUserProjectItem,
      "users.list": ghListUsers,
      "users.get_by_id": ghGetUserById,
      "user.following.check": ghCheckAuthenticatedUserFollowing,
      "user.public_emails.list": ghListAuthenticatedUserPublicEmails,
      "user.repository_invitations.list": ghListAuthenticatedUserRepoInvitations,
      "user.packages.list": ghListAuthenticatedUserPackages,
      "user.interaction_limits.get": ghGetAuthenticatedUserInteractionLimits,
      "user.interaction_limits.set": ghSetAuthenticatedUserInteractionLimits,
      "users.attestations.list": ghListUserAttestations,
      "users.billing.premium_request_usage.get": ghGetUserPremiumRequestUsage,
      "users.billing.usage.summary.get": ghGetUserBillingUsageSummary,
      "codes_of_conduct.list": ghListCodesOfConduct,
      "licenses.list": ghListLicenses,
      "gitignore.templates.list": ghListGitignoreTemplates,
      "orgs.properties.schema.list": ghListOrgPropertySchemas,
      "orgs.properties.values.list": ghListOrgPropertyValues,
      "orgs.organization_roles.list": ghListOrganizationRoles,
      "orgs.actions.runners.labels.list": ghListOrgActionsRunnerLabels,
      "orgs.codespaces.secrets.list": ghListOrgCodespacesSecrets,
      "orgs.dependabot.secrets.public_key.get": ghGetOrgDependabotSecretsPublicKey,
      "repos.autolinks.list": ghListRepoAutolinks,
      "branches.protection.restrictions.apps.list": ghListBranchProtectionRestrictionApps,
      "branches.protection.required_status_checks.contexts.list": ghListRequiredStatusCheckContexts,
      "repos.properties.values.list": ghListRepoPropertyValues,
      "issues.dependencies.blocked_by.list": ghListIssueDependenciesBlockedBy,
      "issues.dependencies.blocking.list": ghListIssueDependenciesBlocking,
      "repos.notifications.list": ghListRepoNotifications,
      "orgs.projects_v2.views.items.list": ghListOrgProjectViewItems,
      "repos.environments.deployment_protection_rules.list": ghListEnvironmentDeploymentProtectionRules,
    },
    salesforce: {
      "contacts.create": createContact,
      "leads.create": createLead,
      "opportunities.create": createOpportunity,
      "cases.create": createCase,
      "accounts.create": sfCreateAccount,
      "accounts.get": sfGetAccount,
      "accounts.update": sfUpdateAccount,
      "accounts.delete": sfDeleteAccount,
      "contacts.get": sfGetContact,
      "contacts.update": sfUpdateContact,
      "contacts.delete": sfDeleteContact,
      "leads.update": sfUpdateLead,
      "leads.delete": sfDeleteLead,
      "opportunities.get": sfGetOpportunity,
      "opportunities.update": sfUpdateOpportunity,
      "opportunities.delete": sfDeleteOpportunity,
      "cases.get": sfGetCase,
      "cases.update": sfUpdateCase,
      "cases.delete": sfDeleteCase,
      "sobjects.query": sfQuery,
      "sobjects.search": sfSearch,
      "sobjects.describe": sfDescribe,
      "users.me": sfGetCurrentUser,
    },
    hubspot: {
      "contacts.create": createHubSpotContact,
      "companies.create": createHubSpotCompany,
      "deals.create": createHubSpotDeal,
      "tickets.create": createHubSpotTicket,
      "contacts.get": hsGetContact,
      "contacts.update": hsUpdateContact,
      "contacts.delete": hsDeleteContact,
      "contacts.search": hsSearchContacts,
      "companies.get": hsGetCompany,
      "companies.update": hsUpdateCompany,
      "companies.delete": hsDeleteCompany,
      "companies.search": hsSearchCompanies,
      "deals.get": hsGetDeal,
      "deals.update": hsUpdateDeal,
      "deals.delete": hsDeleteDeal,
      "deals.search": hsSearchDeals,
      "tickets.get": hsGetTicket,
      "tickets.update": hsUpdateTicket,
      "tickets.search": hsSearchTickets,
      "engagements.notes.create": hsCreateNote,
      "engagements.meetings.create": hsCreateMeeting,
      "engagements.calls.create": hsCreateCall,
      "engagements.tasks.create": hsCreateTask,
      "owners.list": hsListOwners,
      "pipelines.deals.list": hsListDealPipelines,
      "associations.create": hsCreateAssociation,
    },
    linkedin: {
      "posts.create": createLinkedInPost,
    },
    jira: {
      "issues.create": createJiraIssue,
      "issues.get": jiraGetIssue,
      "issues.update": jiraUpdateIssue,
      "issues.delete": jiraDeleteIssue,
      "issues.jql_search": jiraJqlSearch,
      "issues.comments.add": jiraAddComment,
      "issues.comments.list": jiraListComments,
      "issues.transitions.list": jiraListTransitions,
      "issues.transitions.do": jiraDoTransition,
      "issues.assign": jiraAssignIssue,
      "issues.changelog.get": jiraGetIssueChangelog,
      "issues.watchers.add": jiraAddWatcher,
      "issues.links.create": jiraCreateIssueLink,
      "projects.get": jiraGetProject,
      "users.get": jiraGetUser,
      "worklogs.add": jiraAddWorklog,
      "myself.get": jiraGetMyself,
      "fields.list": jiraListFields,
    },
    mailchimp: {
      "contacts.create": createMailchimpContact,
      "lists.members.get": mcGetMember,
      "lists.members.update": mcUpdateMember,
      "lists.members.upsert": mcUpsertMember,
      "lists.members.delete": mcDeleteMember,
      "lists.members.tags.add": mcAddMemberTags,
      "lists.create": mcCreateList,
      "lists.get": mcGetList,
      "campaigns.create": mcCreateCampaign,
      "campaigns.get": mcGetCampaign,
      "campaigns.send": mcSendCampaign,
      "campaigns.unschedule": mcUnscheduleCampaign,
      "campaigns.schedule": mcScheduleCampaign,
      "campaigns.delete": mcDeleteCampaign,
      "campaigns.replicate": mcReplicateCampaign,
      "lists.update": mcUpdateList,
      "lists.delete": mcDeleteList,
      "members.notes.create": mcCreateMemberNote,
      "templates.list": mcListTemplates,
      "templates.get": mcGetTemplate,
      "reports.summary": mcGetReportSummary,
      "reports.opens": mcGetReportOpens,
      "reports.clicks": mcGetReportClicks,
      "reports.unsubscribed": mcGetReportUnsubscribed,
      "automations.list": mcListAutomations,
      "automations.get": mcGetAutomation,
    },
    brevo: {
      "contacts.create": createBrevoContact,
      "contacts.get": bvGetContact,
      "contacts.update": bvUpdateContact,
      "contacts.delete": bvDeleteContact,
      "smtp.email.send": bvSendEmail,
      "lists.create": bvCreateList,
      "lists.get": bvGetList,
      "contacts.addToList": bvAddToList,
      "contacts.removeFromList": bvRemoveFromList,
      "emailCampaigns.create": bvCreateCampaign,
      "emailCampaigns.send": bvSendCampaign,
      "emailCampaigns.get": bvGetCampaign,
    },
    sendgrid: {
      "contacts.create": createSendGridContact,
      "mail.send": sgSendMail,
      "contacts.upsert": sgUpsertContacts,
      "contacts.search": sgSearchContacts,
      "contacts.delete": sgDeleteContacts,
      "lists.create": sgCreateList,
      "lists.get": sgGetList,
      "lists.delete": sgDeleteList,
      "templates.create": sgCreateTemplate,
      "templates.get": sgGetTemplate,
      "suppression.bounces.list": sgListBounces,
      "contacts.get": sgGetContact,
      "lists.list.action": sgListLists,
      "lists.contacts.list": sgListListContacts,
      "lists.contacts.add": sgAddListContacts,
      "lists.contacts.remove": sgRemoveListContacts,
      "templates.list": sgListTemplates,
      "templates.update": sgUpdateTemplate,
      "templates.delete": sgDeleteTemplate,
      "stats.global.get": sgGetGlobalStats,
      "suppression.blocks.list": sgListBlocks,
      "suppression.spam_reports.list": sgListSpamReports,
      "suppression.unsubscribes.list": sgListUnsubscribes,
      "suppression.invalid_emails.list": sgListInvalidEmails,
      "api_keys.list": sgListApiKeys,
      "alerts.list": sgListAlerts,
    },
    klaviyo: {
      "contacts.create": createKlaviyoContact,
      "profiles.get": kvGetProfile,
      "profiles.update": kvUpdateProfile,
      "lists.create": kvCreateList,
      "lists.get": kvGetList,
      "profiles.addToList": kvAddToList,
      "profiles.removeFromList": kvRemoveFromList,
      "events.create": kvCreateEvent,
      "segments.get": kvGetSegment,
      "campaigns.create": kvCreateCampaign,
      "profiles.delete": kvDeleteProfile,
      "events.get": kvGetEvent,
      "events.list": kvListEvents,
      "campaigns.get": kvGetCampaign,
      "campaigns.update": kvUpdateCampaign,
      "campaigns.send": kvSendCampaign,
      "metrics.list": kvListMetrics,
      "metrics.get": kvGetMetric,
      "catalog.items.list": kvListCatalogItems,
      "catalog.items.get": kvGetCatalogItem,
      "segments.list": kvListSegments,
      "templates.list": kvListTemplates,
      "templates.get": kvGetTemplate,
      "flows.list": kvListFlows,
      "profiles.subscribe": kvSubscribeProfiles,
    },
    typeform: {
      "forms.list.action": tfListForms,
      "forms.get": tfGetForm,
      "forms.create": tfCreateForm,
      "forms.update": tfUpdateForm,
      "forms.delete": tfDeleteForm,
      "responses.list.action": tfListResponses,
      "responses.delete": tfDeleteResponses,
      "webhooks.create": tfCreateWebhook,
      "webhooks.list": tfListWebhooks,
    },
    calendly: {
      "users.me.action": calGetUsersMe,
      "event_types.list": calListEventTypes,
      "event_types.get": calGetEventType,
      "scheduled_events.list": calListScheduledEvents,
      "scheduled_events.get": calGetScheduledEvent,
      "scheduled_events.invitees.list": calListInvitees,
      "scheduled_events.cancel": calCancelEvent,
      "invitees.get": calGetInvitee,
      "invitee_no_shows.create": calCreateNoShow,
      "scheduling_links.create": calCreateLink,
      "slots.available": calGetSlots,
      "bookings.create": calCreateBooking,
      "organization.memberships.list": calListOrganizationMemberships,
      "webhook_subscriptions.create": calCreateWebhookSubscription,
      "webhook_subscriptions.list": calListWebhookSubscriptions,
      "webhook_subscriptions.delete": calDeleteWebhookSubscription,
      "users.get": calGetUser,
      "organizations.get": calGetOrganization,
      "routing_forms.list": calListRoutingForms,
      "routing_forms.get": calGetRoutingForm,
    },
    "google-ads": {
      "customers.listAccessible": gadsListAccessibleCustomers,
      "customers.listSubAccounts": gadsListSubAccounts,
      "campaigns.get": gadsGetCampaign,
      "campaigns.getByName": gadsGetCampaignByName,
      "ad_groups.get": gadsGetAdGroup,
      "ads.get": gadsGetAd,
      "keywords.get": gadsGetKeyword,
      "budgets.get": gadsGetBudget,
      "campaigns.mutate": gadsMutateCampaigns,
      "ad_groups.mutate": gadsMutateAdGroups,
      "ads.mutate": gadsMutateAds,
      "keywords.mutate": gadsMutateKeywords,
      "budgets.mutate": gadsMutateBudgets,
      "gaql.search": gadsGaqlSearch,
      "gaql.searchStream": gadsGaqlSearchStream,
      "customer_lists.create": gadsCreateCustomerList,
      "customer_lists.mutateMembers": gadsMutateCustomerListMembers,
      "conversion_actions.get": gadsGetConversionAction,
      "conversion_actions.mutate": gadsMutateConversionActions,
      "labels.mutate": gadsMutateLabels,
      "reports.get": gadsGetReport,
      "assets.get": gadsGetAsset,
      "assets.list": gadsListAssets,
      "assets.mutate": gadsMutateAssets,
      "assets.callout.create": gadsCreateCalloutAsset,
      "campaign_assets.get": gadsGetCampaignAsset,
      "campaign_assets.mutate": gadsMutateCampaignAssets,
      "ad_group_assets.get": gadsGetAdGroupAsset,
      "ad_group_assets.mutate": gadsMutateAdGroupAssets,
      "customer_assets.get": gadsGetCustomerAsset,
      "customer_assets.mutate": gadsMutateCustomerAssets,
      "labels.get": gadsGetLabel,
      "bidding_strategies.get": gadsGetBiddingStrategy,
      "bidding_strategies.mutate": gadsMutateBiddingStrategies,
      "portfolio_bidding_strategies.mutate": gadsMutatePortfolioBiddingStrategies,
      "conversion_actions.tag_snippets.get": gadsGetConversionActionTagSnippets,
    },
    "linkedin-ads": {
      "campaigns.get": linkedinAdsGetCampaign,
      "ad_accounts.get": linkedinAdsGetAdAccount,
      "campaign_groups.list": linkedinAdsListCampaignGroups,
      "creatives.list": linkedinAdsListCreatives,
      "analytics.report.get": linkedinAdsGetAnalyticsReport,
    },
    "tiktok-ads": {
      "analytics.report.get": tiktokAdsGetAnalyticsReport,
      "advertisers.list": tiktokAdsListAdvertisers,
      "advertisers.get": tiktokAdsGetAdvertiser,
      "campaigns.get": tiktokAdsGetCampaign,
      "campaigns.create": tiktokAdsCreateCampaign,
      "campaigns.update": tiktokAdsUpdateCampaign,
      "campaigns.status.update": tiktokAdsUpdateCampaignStatus,
      "ad_groups.get": tiktokAdsGetAdGroup,
      "ad_groups.create": tiktokAdsCreateAdGroup,
      "ad_groups.update": tiktokAdsUpdateAdGroup,
      "ad_groups.status.update": tiktokAdsUpdateAdGroupStatus,
      "ads.get": tiktokAdsGetAd,
      "ads.create": tiktokAdsCreateAd,
      "ads.update": tiktokAdsUpdateAd,
      "ads.status.update": tiktokAdsUpdateAdStatus,
      "pixels.list": tiktokAdsListPixels,
      "pixels.get": tiktokAdsGetPixel,
      "reports.get": tiktokAdsGetReport,
      "identities.list": tiktokAdsListIdentities,
      "videos.list": tiktokAdsListVideos,
      "images.list": tiktokAdsListImages,
      "custom_audiences.list": tiktokAdsListCustomAudiences,
    },
    "zoho-books": {
      "contacts.get": zohoBooksGetContact,
      "contacts.create": zohoBooksCreateContact,
      "contacts.update": zohoBooksUpdateContact,
      "contacts.delete": zohoBooksDeleteContact,
      "invoices.get": zohoBooksGetInvoice,
      "invoices.create": zohoBooksCreateInvoice,
      "invoices.update": zohoBooksUpdateInvoice,
      "invoices.email": zohoBooksEmailInvoice,
      "invoices.void": zohoBooksVoidInvoice,
      "bills.list": zohoBooksListBills,
      "bills.get": zohoBooksGetBill,
      "bills.create": zohoBooksCreateBill,
      "items.list": zohoBooksListItems,
      "items.get": zohoBooksGetItem,
      "items.create": zohoBooksCreateItem,
      "organizations.get": zohoBooksGetOrganizations,
    },
    shopify: {
      "products.get": shopifyGetProduct,
      "products.create": shopifyCreateProduct,
      "products.update": shopifyUpdateProduct,
      "products.delete": shopifyDeleteProduct,
      "products.variants.update": shopifyUpdateProductVariant,
      "orders.get": shopifyGetOrder,
      "orders.create": shopifyCreateOrder,
      "orders.update": shopifyUpdateOrder,
      "orders.close": shopifyCloseOrder,
      "orders.cancel": shopifyCancelOrder,
      "customers.get": shopifyGetCustomer,
      "customers.create": shopifyCreateCustomer,
      "customers.update": shopifyUpdateCustomer,
      "customers.search": shopifySearchCustomers,
      "inventory.levels.set": shopifySetInventoryLevel,
    },
    woocommerce: {
      "products.create": wooCreateProduct,
      "products.get": wooGetProduct,
      "products.update": wooUpdateProduct,
      "products.delete": wooDeleteProduct,
      "orders.create": wooCreateOrder,
      "orders.get": wooGetOrder,
      "orders.update": wooUpdateOrder,
      "orders.delete": wooDeleteOrder,
      "customers.create": wooCreateCustomer,
      "customers.get": wooGetCustomer,
      "customers.update": wooUpdateCustomer,
      "coupons.create": wooCreateCoupon,
    },
    greenhouse: {
      "applications.move": moveGreenhouseApplication,
      "applications.create": createGreenhouseApplication,
      "applications.reject": rejectGreenhouseApplication,
      "candidates.create": createGreenhouseCandidate,
      "candidates.update": updateGreenhouseCandidate,
      "applications.hire": hireGreenhouseApplication,
      "applications.update": updateGreenhouseApplication,
      "application_stages.list": listGreenhouseApplicationStages,
      "rejection_reasons.list": listGreenhouseRejectionReasons,
      "rejection_details.list": listGreenhouseRejectionDetails,
      "notes.create": createGreenhouseNote,
      "notes.list": listGreenhouseNotes,
      "candidate_tags.list": listGreenhouseCandidateTags,
      "candidates.apply_tag": applyGreenhouseCandidateTag,
      "candidates.remove_tag": removeGreenhouseCandidateTag,
      "interviews.create": createGreenhouseInterview,
      "interviews.update": updateGreenhouseInterview,
      "interviews.delete": deleteGreenhouseInterview,
      "offers.create": createGreenhouseOffer,
      "jobs.list_internal": listGreenhouseJobsInternal,
      "candidates.merge": mergeGreenhouseCandidates,
      "candidates.delete": deleteGreenhouseCandidate,
      "applications.delete": deleteGreenhouseApplication,
      "attachments.list": listGreenhouseAttachments,
      "attachments.create": createGreenhouseAttachment,
      "attachments.delete": deleteGreenhouseAttachment,
      "candidate_educations.list": listGreenhouseCandidateEducations,
      "candidate_educations.create": createGreenhouseCandidateEducation,
      "candidate_educations.delete": deleteGreenhouseCandidateEducation,
      "candidate_employments.list": listGreenhouseCandidateEmployments,
      "candidate_employments.create": createGreenhouseCandidateEmployment,
      "candidate_employments.delete": deleteGreenhouseCandidateEmployment,
      "candidate_tags.create": createGreenhouseCandidateTag,
      "candidate_tags.delete": deleteGreenhouseCandidateTag,
      "rejection_details.update": updateGreenhouseRejectionDetail,
    },
    lever: {
      "opportunities.update_stage": updateLeverOpportunityStage,
      "opportunities.archive": archiveLeverOpportunity,
      "opportunities.update": updateLeverOpportunity,
    },
    ashby: {
      "candidates.create": createAshbyCandidate,
      "candidates.update": updateAshbyCandidate,
      "applications.create": createAshbyApplication,
      "applications.move": moveAshbyApplication,
      "applications.reject": rejectAshbyApplication,
      "applications.hire": hireAshbyApplication,
      "interviews.schedule": scheduleAshbyInterview,
      "interviews.cancel": cancelAshbyInterview,
    },
    intercom: {
      "conversations.reply": replyIntercomConversation,
      "conversations.close": closeIntercomConversation,
      "conversations.assign": assignIntercomConversation,
      "conversations.tag": tagIntercomConversation,
    },
    "cal-com": {
      "me.get": calComGetMe,
      "event_types.list": calComListEventTypes,
      "event_types.get": calComGetEventType,
      "event_types.create": calComCreateEventType,
      "event_types.update": calComUpdateEventType,
      "event_types.delete": calComDeleteEventType,
      "bookings.list": calComListBookings,
      "bookings.get": calComGetBooking,
      "bookings.create": calComCreateBooking,
      "bookings.cancel": calComCancelBooking,
      "bookings.reschedule": calComRescheduleBooking,
      "bookings.confirm": calComConfirmBooking,
      "bookings.decline": calComDeclineBooking,
      "slots.available": calComGetAvailableSlots,
      "schedules.list": calComListSchedules,
      "schedules.get": calComGetSchedule,
      "schedules.create": calComCreateSchedule,
      "schedules.update": calComUpdateSchedule,
      "schedules.delete": calComDeleteSchedule,
      "availability.get": calComGetAvailability,
      "webhooks.list": calComListWebhooks,
      "webhooks.create": calComCreateWebhook,
      "webhooks.get": calComGetWebhook,
      "webhooks.delete": calComDeleteWebhook,
    },
    lusha: {
      "person.enrich": lushaEnrichPerson,
      "company.enrich": lushaEnrichCompany,
      "prospecting.contact.search": lushaSearchContacts,
      "prospecting.contact.enrich": lushaEnrichContacts,
      "prospecting.company.search": lushaSearchCompanies,
      "prospecting.company.enrich": lushaEnrichCompanies,
      "bulk.person": lushaBulkEnrich,
      "usage.get": lushaGetUsage,
    },
    apollo: {
      "people.search": apolloSearchPeople,
      "people.match": apolloMatchPerson,
      "people.bulk_match": apolloBulkMatch,
      "organizations.search": apolloSearchOrgs,
      "organizations.enrich": apolloEnrichOrg,
      "organizations.bulk_enrich": apolloBulkEnrichOrgs,
      "organizations.job_postings": apolloJobPostings,
      "contacts.create": apolloCreateContact,
      "contacts.update": apolloUpdateContact,
      "contacts.search": apolloSearchContacts,
      "accounts.create": apolloCreateAccount,
      "accounts.update": apolloUpdateAccount,
      "sequences.search": apolloSearchSequences,
      "sequences.add_contacts": apolloAddToSequence,
      "email_accounts.list": apolloListEmailAccounts,
      "users.search": apolloSearchUsers,
    },
    apify: {
      "actors.list": apifyListActors,
      "actors.get": apifyGetActor,
      "actor.run": apifyRunActor,
      "actor.run_sync_get_dataset_items": apifyRunActorSync,
      "runs.get": apifyGetRun,
      "runs.list": apifyListRuns,
      "runs.abort": apifyAbortRun,
      "datasets.get": apifyGetDataset,
      "datasets.items": apifyGetDatasetItems,
      "tasks.list": apifyListTasks,
      "task.run": apifyRunTask,
      "task.run_sync_get_dataset_items": apifyRunTaskSync,
      "key_value_store.get_record": apifyGetKVRecord,
      "actors.options": apifyActorsOptions,
      "actors.input_schema": apifyActorInputSchema,
      "datasets.list": apifyListDatasets,
      "datasets.create": apifyCreateDataset,
      "datasets.delete": apifyDeleteDataset,
      "datasets.push_items": apifyPushDatasetItems,
      "key_value_stores.list": apifyListKVStores,
      "key_value_stores.get": apifyGetKVStore,
      "key_value_store.put_record": apifyPutKVRecord,
      "key_value_store.list_keys": apifyListKVKeys,
      "key_value_store.delete_record": apifyDeleteKVRecord,
      "tasks.get": apifyGetTask,
      "users.me": apifyGetUserMe,
      "webhooks.list": apifyListWebhooks,
      "runs.log": apifyGetRunLog,
      "request_queues.list": apifyListRequestQueues,
    },
    zoom: {
      "users.me": zoomGetUsersMe,
      "users.list": zoomListUsers,
      "meetings.create": zoomCreateMeeting,
      "meetings.list": zoomListMeetings,
      "meetings.get": zoomGetMeeting,
      "meetings.update": zoomUpdateMeeting,
      "meetings.delete": zoomDeleteMeeting,
      "meetings.list_registrants": zoomListRegistrants,
      "meetings.add_registrant": zoomAddRegistrant,
      "past_meetings.participants": zoomPastParticipants,
      "webinars.create": zoomCreateWebinar,
      "webinars.list": zoomListWebinars,
      "webinars.get": zoomGetWebinar,
      "users.get": zoomGetUser,
      "recordings.list": zoomListRecordings,
      "recordings.get": zoomGetRecording,
      "recordings.delete": zoomDeleteRecording,
    },
    saleshandy: {
      "sequences.list": shListSequences,
      "sequences.get": shGetSequence,
      "sequences.create": shCreateSequence,
      "sequences.pause": shPauseSequence,
      "sequences.resume": shResumeSequence,
      "sequence.steps.list": shListSteps,
      "prospects.add_to_sequence": shAddProspects,
      "prospects.list": shListProspects,
      "prospects.get": shGetProspect,
      "prospects.update": shUpdateProspect,
      "prospects.pause": shPauseProspect,
      "prospects.resume": shResumeProspect,
      "prospects.unsubscribe": shUnsubscribeProspect,
      "email_accounts.list": shListEmailAccounts,
    },
    unipile: {
      "accounts.list": uniListAccounts,
      "accounts.get": uniGetAccount,
      "chats.list": uniListChats,
      "chats.get": uniGetChat,
      "messages.list": uniListMessages,
      "messages.send": uniSendMessage,
      "chats.start": uniStartChat,
      "emails.list": uniListEmails,
      "emails.get": uniGetEmail,
      "emails.send": uniSendEmail,
      "linkedin.profile.get": uniGetLinkedInProfile,
      "linkedin.invitation.send": uniSendInvitation,
      "linkedin.relations.list": uniListRelations,
    },
    rb2b: {
      "visitors.parse": rb2bParseVisitors,
    },
    caldav: {
      "principal.discover": caldavDiscoverPrincipal,
      "calendar_home.get": caldavGetCalendarHome,
      "calendars.list": caldavListCalendars,
      "events.list": caldavListEvents,
      "events.get": caldavGetEvent,
      "events.create": caldavCreateEvent,
      "events.update": caldavUpdateEvent,
      "events.delete": caldavDeleteEvent,
      "freebusy.query": caldavQueryFreeBusy,
    },
    resend: {
      "emails.send": resendSendEmail,
      "emails.get": resendGetEmail,
      "emails.list": resendListEmails,
      "domains.list": resendListDomains,
      "domains.get": resendGetDomain,
      "contacts.list": resendListContacts,
    },
    googlemeet: {
      "meetings.create": gmeetCreateMeeting,
      "meetings.list": gmeetListMeetings,
      "meetings.get": gmeetGetMeeting,
      "meetings.update": gmeetUpdateMeeting,
      "meetings.delete": gmeetDeleteMeeting,
    },
  },
  syncs: {
    notion: {
      "users.list": listNotionUsers,
    },
    slack: {
      "messages.list": withLiveMessageSync("slack", listSlackMessages),
    },
    telegram: {
      "messages.list": withLiveMessageSync("telegram", listTelegramMessages),
    },
    "google-workspace": {
      "messages.list": withLiveMessageSync("google-workspace", listGmailMessages),
      "files.list": listDriveFiles,
      "events.list": listCalendarEvents,
      "sheets.rows.list": listSheetRows,
      "sheets.worksheets.list": listWorksheets,
    },
    "microsoft-365": {
      "messages.list": withLiveMessageSync("microsoft-365", listOutlookMessages),
      "events.list": listOutlookEvents,
      "calendars.list": listOutlookCalendars,
      "files.list": listOneDriveFiles,
    },
    github: {
      "issues.list": listGitHubIssues,
      "pull_requests.list": listGitHubPRs,
      "commits.list": listGitHubCommits,
      "repositories.list": listGitHubRepos,
    },
    salesforce: {
      "contacts.list": listSFContacts,
      "leads.list": listSFLeads,
      "accounts.list": listSFAccounts,
      "opportunities.list": listSFOpportunities,
      "cases.list": listSFCases,
    },
    hubspot: {
      "contacts.list": listHubSpotContacts,
      "companies.list": listHubSpotCompanies,
      "deals.list": listHubSpotDeals,
      "tickets.list": listHubSpotTickets,
    },
    linkedin: {
      "profile.get": getLinkedInProfile,
      "posts.list": listLinkedInPosts,
      "organizations.list": listLinkedInOrgs,
    },
    jira: {
      "issues.search": searchJiraIssues,
      "projects.list": listJiraProjects,
      "users.list": listJiraUsers,
    },
    mailchimp: {
      "contacts.list": listMailchimpContacts,
      "audiences.list": listMailchimpAudiences,
      "campaigns.list": listMailchimpCampaigns,
    },
    brevo: {
      "contacts.list": listBrevoContacts,
      "lists.list": listBrevoLists,
      "campaigns.list": listBrevoCampaigns,
    },
    sendgrid: {
      "contacts.list": listSendGridContacts,
      "lists.list": listSendGridLists,
      "campaigns.list": listSendGridCampaigns,
    },
    klaviyo: {
      "contacts.list": listKlaviyoContacts,
      "campaigns.list": listKlaviyoCampaigns,
      "lists.list": listKlaviyoLists,
    },
    shopify: {
      "products.list": listShopifyProducts,
      "orders.list": listShopifyOrders,
      "customers.list": listShopifyCustomers,
    },
    woocommerce: {
      "products.list": listWooProducts,
      "orders.list": listWooOrders,
      "customers.list": listWooCustomers,
    },
    quickbooks: {
      "invoices.list": listQBInvoices,
      "customers.list": listQBCustomers,
      "payments.list": listQBPayments,
    },
    greenhouse: {
      "jobs.list": listGreenhouseJobs,
      "jobs.get": getGreenhouseJob,
      "candidates.list": listGreenhouseCandidates,
      "candidates.get": getGreenhouseCandidate,
      "applications.list": listGreenhouseApplications,
      "applications.get": getGreenhouseApplication,
      "users.list": listGreenhouseUsers,
      "users.get": getGreenhouseUser,
      "interviews.list": listGreenhouseInterviews,
      "job_interview_stages.list": listGreenhouseJobInterviewStages,
      "offers.list": listGreenhouseOffers,
      "offers.get": getGreenhouseOffer,
      "scorecards.list": listGreenhouseScorecards,
      "scorecards.get": getGreenhouseScorecard,
      "departments.list": listGreenhouseDepartments,
      "offices.list": listGreenhouseOffices,
      "sources.list": listGreenhouseSources,
      "close_reasons.list": listGreenhouseCloseReasons,
    },
    lever: {
      "jobs.list": listLeverJobs,
      "opportunities.list": listLeverOpportunities,
      "opportunities.get": getLeverOpportunity,
      "opportunities.interviews.list": listLeverOpportunityInterviews,
      "opportunities.feedback.list": listLeverOpportunityFeedback,
      "archive_reasons.list": listLeverArchiveReasons,
      "stages.list": listLeverStages,
      "users.list": listLeverUsers,
      "users.get": getLeverUser,
      "candidates.get": getLeverCandidate,
      "interviews.list": listLeverInterviews,
      "interviews.get": getLeverInterview,
      "offers.list": listLeverOffers,
      "offers.get": getLeverOffer,
      "postings.list": listLeverPostings,
      "postings.get": getLeverPosting,
      "notes.list": listLeverNotes,
      "requisitions.list": listLeverRequisitions,
      "feedback.get": getLeverFeedback,
    },
    ashby: {
      "jobs.list": listAshbyJobs,
      "jobs.get": getAshbyJob,
      "candidates.list": listAshbyCandidates,
      "applications.list": listAshbyApplications,
      "candidates.get": getAshbyCandidate,
      "applications.get": getAshbyApplication,
      "candidates.search": searchAshbyCandidates,
      "interviews.list": listAshbyInterviews,
      "offers.list": listAshbyOffers,
      "offers.get": getAshbyOffer,
      "departments.list": listAshbyDepartments,
      "users.list": listAshbyUsers,
      "sources.list": listAshbySources,
      "archive_reasons.list": listAshbyArchiveReasons,
      "interview_schedules.list": listAshbyInterviewSchedules,
      "interview_schedules.get": getAshbyInterviewSchedule,
      "interview_stages.list": listAshbyInterviewStages,
      "openings.list": listAshbyOpenings,
    },
    intercom: {
      "admins.list": listIntercomAdmins,
      "contacts.list": listIntercomContacts,
      "contacts.get": getIntercomContact,
      "companies.list": listIntercomCompanies,
      "conversations.list": listIntercomConversations,
      "conversations.get": getIntercomConversation,
      "conversations.search": searchIntercomConversations,
    },
    workable: {
      "jobs.list": listWorkableJobs,
      "jobs.get": getWorkableJob,
      "candidates.list": listWorkableCandidates,
      "candidates.get": getWorkableCandidate,
      "stages.list": listWorkableStages,
      "members.list": listWorkableMembers,
      "events.list": listWorkableEvents,
    },
    smartrecruiters: {
      "jobs.list": listSmartRecruitersJobs,
      "jobs.get": getSmartRecruitersJob,
      "postings.list": listSmartRecruitersPostings,
      "candidates.list": listSmartRecruitersCandidates,
      "candidates.get": getSmartRecruitersCandidate,
      "users.list": listSmartRecruitersUsers,
      "interviews.list": listSmartRecruitersInterviews,
    },
    recruitee: {
      "jobs.list": listRecruiteeJobs,
      "candidates.list": listRecruiteeCandidates,
      "candidates.get": getRecruiteeCandidate,
      "candidates.search": searchRecruiteeCandidates,
      "offers.list": listRecruiteeOffers,
      "pipeline_stages.list": listRecruiteePipelineStages,
      "interview_events.list": listRecruiteeInterviewEvents,
    },
    "zoho-recruit": {
      "jobs.list": listZohoRecruitJobs,
      "candidates.list": listZohoRecruitCandidates,
      "candidates.get": getZohoRecruitCandidate,
      "candidates.search": searchZohoRecruitCandidates,
      "job_openings.list": listZohoRecruitJobOpenings,
      "applications.list": listZohoRecruitApplications,
      "interviews.list": listZohoRecruitInterviews,
    },
    typeform: {
      "forms.list": listTypeformForms,
      "responses.list": listTypeformResponses,
    },
    "google-ads": {
      "campaigns.list": listGoogleAdsCampaigns,
      "ad_groups.list": listGoogleAdsAdGroups,
      "ads.list": listGoogleAdsAds,
      "keywords.list": listGoogleAdsKeywords,
      "budgets.list": listGoogleAdsBudgets,
      "customer_lists.list": listGoogleAdsCustomerLists,
      "conversion_actions.list": listGoogleAdsConversionActions,
    },
    "meta-ads": {
      "campaigns.list": listMetaCampaigns,
      "ad_sets.list": listMetaAdSets,
      "ads.list": listMetaAds,
      "ad_accounts.list": listMetaAdAccounts,
    },
    "linkedin-ads": {
      "campaigns.list": listLinkedInAdsCampaigns,
      "ad_accounts.list": listLinkedInAdsAccounts,
      "creative_assets.list": listLinkedInAdsCreatives,
    },
    "tiktok-ads": {
      "campaigns.list": listTikTokCampaigns,
      "ad_groups.list": listTikTokAdGroups,
      "ads.list": listTikTokAds,
    },
    xero: {
      "invoices.list": listXeroInvoices,
      "contacts.list": listXeroContacts,
      "bank_transactions.list": listXeroTransactions,
    },
    "zoho-books": {
      "invoices.list": listZohoBooksInvoices,
      "contacts.list": listZohoBooksContacts,
      "payments.list": listZohoBooksPayments,
    },
  },
  webhooks: {
    rb2b: { parse: rb2bParseWebhook, verify: rb2bVerifyWebhook },
    // Apollo does not sign its phone-reveal callbacks, so it registers only a
    // parser. The registry treats a connector with no verifier as verified.
    apollo: { parse: apolloParseWebhook },
    whatsapp: { parse: whatsappParseWebhook },
    // Ashby webhook deliveries are EventOnly (application submitted, candidate
    // updated, interview scheduled, offer created). Ashby HMAC verification is
    // not required for EventOnly ingest; the parser classifies the action.
    ashby: { parse: ashbyParseWebhook },
    calendly: { parse: calendlyParseWebhook },
  },
}));

export function createConnectorRegistry(input: {
  manifests: Manifest[];
  healthchecks: Record<string, HealthcheckHandler>;
  actions: Record<string, Record<string, ActionHandler>>;
  syncs?: Record<string, Record<string, SyncHandler>>;
  webhooks?: Record<string, WebhookHandlers>;
}): ConnectorRegistry {
  const descriptions = buildConnectorDescriptions(input.manifests);
  const operationSpecs = buildConnectorOperationSpecs(input.manifests);
  const connectorNetworks = buildConnectorNetworks(input.manifests);

  return {
    describe(connectorKey: string): Record<string, unknown> | undefined {
      return descriptions[connectorKey];
    },
    operationBudget(connectorKey: string, operation: string): OperationBudgetLike | undefined {
      return operationSpecs[connectorKey]?.[operation];
    },
    healthcheck(connectorKey: string, inputValue?: unknown): RegistryHealthcheckResult | undefined {
      const handler = input.healthchecks[connectorKey];
      if (!handler) {
        return undefined;
      }
      const operationSpec = operationSpecs[connectorKey]?.healthcheck;
      const budgetFailure = unsupportedBudget(operationSpec);
      if (budgetFailure) {
        return budgetFailure;
      }
      const inputSizeFailure = validateInputSize(inputValue, operationSpec?.maxInputBytes);
      if (inputSizeFailure) {
        return inputSizeFailure;
      }
      // Mirror the action path: invoke the handler with the credential input and
      // surface the (possibly Promise) output. A synchronous structured throw is
      // captured here; an async rejection is awaited+mapped by the server layer.
      try {
        return {
          ok: true,
          output: runExecution(
            () => enforceCredentialedHealthcheckEvidence(
              connectorKey,
              input.manifests,
              inputValue,
              boundedOutput(handler(inputValue), operationSpec?.maxResponseBytes),
            ),
            operationSpec?.timeoutMs,
          ),
        };
      } catch (error) {
        if (isRecord(error) && typeof error.code === "string" && error.code.length > 0) {
          return {
            ok: false,
            code: error.code,
            ...(typeof error.retryAfterSeconds === "number" && Number.isSafeInteger(error.retryAfterSeconds) && error.retryAfterSeconds>0 ? {retryAfterSeconds:error.retryAfterSeconds}:{}),
            message: typeof error.message === "string" ? error.message : "Connector healthcheck failed.",
          };
        }
        return {
          ok: false,
          code: "CONNECTOR_UPSTREAM_ERROR",
          message: error instanceof Error ? error.message : "Connector healthcheck failed.",
        };
      }
    },
    executeAction(connectorKey: string, action: string, inputValue: unknown): RegistryActionResult {
      // Healthchecks are action-kind operations in manifests, but their
      // handlers live in the dedicated healthchecks table so the same handler
      // can serve connector.healthcheck. Treat that table as a registered
      // connector for dispatch instead of making every healthcheck UNKNOWN_ACTION.
      if (!input.actions[connectorKey] && !input.healthchecks[connectorKey]) {
        return { ok: false, code: "UNKNOWN_CONNECTOR", message: "Connector is not registered." };
      }
      const operationSpec = operationSpecs[connectorKey]?.[action];
      if (!operationSpec?.kind) {
        return {
          ok: false,
          code: "ACTION_NOT_DECLARED",
          message: "Action is not declared in the connector manifest.",
        };
      }
      if (operationSpec.kind !== "action") {
        return {
          ok: false,
          code: "ACTION_NOT_EXECUTABLE",
          message: "Operation is not executable as an action.",
        };
      }
      const budgetFailure = unsupportedBudget(operationSpec);
      if (budgetFailure) {
        return budgetFailure;
      }
      const inputSizeFailure = validateInputSize(inputValue, operationSpec.maxInputBytes);
      if (inputSizeFailure) {
        return inputSizeFailure;
      }
      const handler = action === "healthcheck"
        ? input.healthchecks[connectorKey]
        : input.actions[connectorKey]?.[action];
      if (!handler) {
        return { ok: false, code: "UNKNOWN_ACTION", message: "Action is not registered." };
      }
      if (action === "healthcheck") {
        try {
          return {
            ok: true,
            output: runExecution(
              () => enforceCredentialedHealthcheckEvidence(
                connectorKey,
                input.manifests,
                inputValue,
                boundedOutput(handler(inputValue), operationSpec.maxResponseBytes),
              ),
              operationSpec.timeoutMs,
            ),
          };
        } catch (error) {
          if (isRecord(error) && typeof error.code === "string" && error.code.length > 0) {
            return {
              ok: false,
              code: error.code,
              ...(typeof error.retryAfterSeconds === "number" && Number.isSafeInteger(error.retryAfterSeconds) && error.retryAfterSeconds > 0 ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
              message: typeof error.message === "string" ? error.message : "Connector healthcheck failed.",
            };
          }
          return {
            ok: false,
            code: "CONNECTOR_UPSTREAM_ERROR",
            message: error instanceof Error ? error.message : "Connector healthcheck failed.",
          };
        }
      }
      return {
        ok: true,
        output: runExecution(
          () => {
            const primary = boundedOutput(handler(inputValue), operationSpec.maxResponseBytes);
            return applyEffectPolicyReconcile(
              connectorKey,
              inputValue,
              primary,
              operationSpec,
              operationSpecs,
              input.actions,
              input.syncs,
            );
          },
          operationSpec.timeoutMs,
        ),
      };
    },
    executeSync(connectorKey: string, sync: string, inputValue: unknown): RegistryActionResult {
      if (!input.syncs?.[connectorKey]) {
        return { ok: false, code: "UNKNOWN_CONNECTOR", message: "Connector is not registered." };
      }
      const operationSpec = operationSpecs[connectorKey]?.[sync];
      if (!operationSpec?.kind) {
        return {
          ok: false,
          code: "SYNC_NOT_DECLARED",
          message: "Sync is not declared in the connector manifest.",
        };
      }
      if (operationSpec.kind !== "sync") {
        return {
          ok: false,
          code: "SYNC_NOT_EXECUTABLE",
          message: "Operation is not executable as a sync.",
        };
      }
      const budgetFailure = unsupportedBudget(operationSpec);
      if (budgetFailure) {
        return budgetFailure;
      }
      const inputSizeFailure = validateInputSize(inputValue, operationSpec.maxInputBytes);
      if (inputSizeFailure) {
        return inputSizeFailure;
      }
      const handler = input.syncs[connectorKey][sync];
      if (!handler) {
        return { ok: false, code: "UNKNOWN_SYNC", message: "Sync is not registered." };
      }
      return { ok: true, output: runExecution(() => boundedOutput(handler(inputValue), operationSpec.maxResponseBytes), operationSpec.timeoutMs) };
    },
    parseWebhook(connectorKey: string, payload: unknown): RegistryActionResult {
      const handlers = input.webhooks?.[connectorKey];
      if (!handlers) {
        return { ok: false, code: "UNKNOWN_CONNECTOR", message: "Connector has no webhook handler." };
      }
      try {
        return { ok: true, output: handlers.parse(payload) };
      } catch (error) {
        return {
          ok: false,
          code: "WEBHOOK_PARSE_FAILED",
          message: error instanceof Error ? error.message : "Webhook payload could not be parsed.",
        };
      }
    },
    verifyWebhook(connectorKey: string, payload: unknown, headers: Record<string, string>): RegistryActionResult {
      const handlers = input.webhooks?.[connectorKey];
      if (!handlers) {
        return { ok: false, code: "UNKNOWN_CONNECTOR", message: "Connector has no webhook handler." };
      }
      // A connector with no verifier accepts every delivery (e.g. providers
      // that do not sign their webhooks). The control plane still records and
      // sanitizes the event; it simply cannot cryptographically prove origin.
      if (!handlers.verify) {
        return { ok: true, output: { verified: true } };
      }
      try {
        return { ok: true, output: { verified: handlers.verify(payload, headers) } };
      } catch (error) {
        return {
          ok: false,
          code: "WEBHOOK_VERIFY_FAILED",
          message: error instanceof Error ? error.message : "Webhook verification failed.",
        };
      }
    },
    createHttpClient(
      connectorKey: string,
      operation: string,
      options: { fetch?: typeof fetch } = {},
    ): ConnectorHttpClient | undefined {
      const allowedHosts = connectorNetworks[connectorKey]?.allowedHosts;
      const spec = operationSpecs[connectorKey]?.[operation];
      const maxResponseBytes = spec?.maxResponseBytes;
      if (!allowedHosts || typeof maxResponseBytes !== "number") {
        return undefined;
      }
      return createConnectorHttpClient({
        allowedHosts,
        maxResponseBytes,
        // The operation's manifest timeout is the outbound deadline, so the
        // request is aborted at the same moment the caller stops waiting.
        timeoutMs: spec?.timeoutMs,
        fetch: options.fetch,
      });
    },
    validate(): RegistryValidationIssue[] {
      return input.manifests.flatMap((manifest) => {
        const connectorActions = input.actions[manifest.key] ?? {};
        const connectorSyncs = input.syncs?.[manifest.key] ?? {};
        return Object.entries(operationSpecs[manifest.key] ?? {}).flatMap(([operation, spec]) => {
          if (!supportsOperationBudget(spec)) {
            return [{
              code: "UNSUPPORTED_OPERATION_BUDGET",
              connectorKey: manifest.key,
              operation,
              message: "Declared operation budget exceeds the runner contract.",
            } satisfies RegistryValidationIssue];
          }
          const hasHandler = operation === "healthcheck"
            ? Boolean(input.healthchecks[manifest.key])
            : Boolean(connectorActions[operation]);
          if (spec.kind === "action") {
            if (hasHandler) {
              return [];
            }
            return [{
              code: "ACTION_HANDLER_MISSING",
              connectorKey: manifest.key,
              operation,
              message: "Declared action operation has no registered handler.",
            } satisfies RegistryValidationIssue];
          }
          if (spec.kind !== "sync" || connectorSyncs[operation]) {
            return [];
          }
          return [{
            code: "SYNC_HANDLER_MISSING",
            connectorKey: manifest.key,
            operation,
            message: "Declared sync operation has no registered handler.",
          } satisfies RegistryValidationIssue];
        });
      });
    },
  };
}

export function assertValidRegistry(registry: ConnectorRegistry): void {
  const issues = registry.validate();
  if (issues.length === 0) {
    return;
  }
  const details = issues
    .map((issue) => `${issue.code} ${issue.connectorKey} ${issue.operation}`)
    .join("; ");
  throw new Error(`Connector registry validation failed: ${details}`);
}

function buildConnectorDescriptions(manifests: Manifest[]): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    manifests.map((manifest) => [
      manifest.key,
      {
        key: manifest.key,
        name: manifest.name,
        version: manifest.version,
        runtime: manifest.runtime,
        auth: manifest.auth,
        network: manifest.network,
        operations: manifest.operations,
      },
    ]),
  );
}

// A hand-written healthcheck may retain the connector-owned fixture result for
// setup validation. That result is not evidence for a configured connection,
// so reject it at the shared dispatch boundary when credentials are present.
// This keeps every action-kind healthcheck honest without requiring a bespoke
// provider probe for connectors that are not ready to implement one yet.
function enforceCredentialedHealthcheckEvidence(
  connectorKey: string,
  manifests: Manifest[],
  inputValue: unknown,
  output: unknown,
): unknown {
  if (!hasCredentialedHealthcheckInput(connectorKey, manifests, inputValue)) {
    return output;
  }
  if (isPromiseLike(output)) {
    return Promise.resolve(output).then((resolved) => enforceProviderHealthcheckOutput(resolved));
  }
  return enforceProviderHealthcheckOutput(output);
}

function enforceProviderHealthcheckOutput(output: unknown): unknown {
  if (isRecord(output) && output.source === "connector") {
    throw {
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: "Credentialed healthcheck did not confirm provider health.",
    };
  }
  return output;
}

function hasCredentialedHealthcheckInput(
  connectorKey: string,
  manifests: Manifest[],
  inputValue: unknown,
): boolean {
  const manifest = manifests.find((candidate) => candidate.key === connectorKey);
  if (!manifest || !isRecord(manifest.auth) || manifest.auth.type === "none" || !isRecord(inputValue)) {
    return false;
  }
  return Object.entries(inputValue).some(([key, value]) => (
    typeof value === "string"
    && value.trim().length > 0
    && /token|secret|password|apikey|authorization|credential|basicauth/i.test(key.replace(/[^a-z]/gi, ""))
  ));
}

type OperationSpec = OperationBudgetLike & {
  kind?: string;
  effectPolicy?: string;
  reconcile?: string;
};

function buildConnectorOperationSpecs(manifests: Array<{ key: string; operations: unknown }>): Record<string, Record<string, OperationSpec>> {
  return Object.fromEntries(
    manifests.map((manifest) => {
      const operations = isRecord(manifest.operations) ? manifest.operations : {};
      const operationSpecs = Object.fromEntries(
        Object.entries(operations).flatMap(([operation, spec]) => {
          if (!isRecord(spec)) {
            return [];
          }
          return [[operation, {
            kind: typeof spec.kind === "string" ? spec.kind : undefined,
            timeoutMs: typeof spec.timeoutMs === "number" ? spec.timeoutMs : undefined,
            maxInputBytes: typeof spec.maxInputBytes === "number" ? spec.maxInputBytes : undefined,
            maxResponseBytes: typeof spec.maxResponseBytes === "number" ? spec.maxResponseBytes : undefined,
            effectPolicy: typeof spec.effectPolicy === "string" ? spec.effectPolicy : undefined,
            reconcile: typeof spec.reconcile === "string" ? spec.reconcile : undefined,
          }]];
        }),
      );
      return [manifest.key, operationSpecs];
    }),
  );
}

// withOperationTimeout bounds how long the CALLER waits. It cannot cancel the
// handler — JavaScript has no way to interrupt arbitrary running code — so it is
// a backstop, not the primary mechanism. Actual cancellation lives at the true
// boundary: createConnectorHttpClient aborts the outbound request on its own
// deadline, which is what stops a "timed out" send from still being delivered.
//
// The timer is cleared when the handler settles first; leaving it armed kept the
// event loop busy for the full timeout on every single operation.
function isPromiseLike(value: unknown): value is Promise<unknown> {
  return isRecord(value) && typeof value.then === "function";
}

function validateInputSize(inputValue: unknown, maxInputBytes: number | undefined): RegistryFailure | null {
  if (typeof maxInputBytes !== "number") {
    return null;
  }
  const encoded = JSON.stringify(inputValue);
  const byteLength = new TextEncoder().encode(encoded === undefined ? "null" : encoded).byteLength;
  if (byteLength <= maxInputBytes) {
    return null;
  }
  return {
    ok: false,
    code: "INPUT_TOO_LARGE",
    message: "Operation input exceeds the connector manifest byte limit.",
  };
}

function buildConnectorNetworks(manifests: Array<{ key: string; network: unknown }>): Record<string, {
  allowedHosts: string[];
}> {
  return Object.fromEntries(
    manifests.map((manifest) => {
      const network = isRecord(manifest.network) ? manifest.network : {};
      const allowedHosts = Array.isArray(network.allowedHosts)
        ? network.allowedHosts.filter((host): host is string => typeof host === "string")
        : [];
      return [manifest.key, { allowedHosts }];
    }),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Manifest effectPolicy Reconcile | Idempotent: after a successful mutating
// action, observe post-write state via the declared reconcile handler.
// Reconcile reuses the action input (id already known). Idempotent projects
// id from the primary JSON (id | application.id) fail-closed, merges into
// action input, then observes. Return observe output either way.
function applyEffectPolicyReconcile(
  connectorKey: string,
  inputValue: unknown,
  primary: unknown,
  operationSpec: OperationSpec,
  operationSpecs: Record<string, Record<string, OperationSpec>>,
  actions: Record<string, Record<string, ActionHandler>>,
  syncs: Record<string, Record<string, ActionHandler>> | undefined,
): unknown {
  const policy = operationSpec.effectPolicy;
  if (policy !== "Reconcile" && policy !== "Idempotent") {
    return primary;
  }
  const reconcileName = operationSpec.reconcile;
  if (typeof reconcileName !== "string" || reconcileName.length === 0) {
    throw {
      ok: false,
      code: "RECONCILE_NOT_DECLARED",
      message: `${policy} effectPolicy requires a reconcile operation.`,
    };
  }
  const reconcileHandler =
    actions[connectorKey]?.[reconcileName]
    ?? syncs?.[connectorKey]?.[reconcileName];
  if (!reconcileHandler) {
    throw {
      ok: false,
      code: "RECONCILE_HANDLER_MISSING",
      message: "Reconcile operation has no registered handler.",
    };
  }
  const reconcileSpec = operationSpecs[connectorKey]?.[reconcileName];
  const runObserve = (resolvedPrimary: unknown) => {
    let observeInput = inputValue;
    if (policy === "Idempotent") {
      const id = projectIdempotentId(resolvedPrimary);
      observeInput = isRecord(inputValue) ? { ...inputValue, id } : { id };
    }
    return boundedOutput(
      reconcileHandler(observeInput),
      reconcileSpec?.maxResponseBytes ?? operationSpec.maxResponseBytes,
    );
  };
  // Always settle primary first so Idempotent id-projection throws become
  // promise rejections (same path as async connector handlers).
  return Promise.resolve(primary).then((resolved) => runObserve(resolved));
}

/** Fail-closed id projection for Idempotent observe: primary.id else primary.application.id. */
function projectIdempotentId(primary: unknown): string {
  const asId = (value: unknown): string | null => {
    if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
    if (typeof value === "string" && value.length > 0) return value;
    return null;
  };
  if (!isRecord(primary)) {
    throw {
      ok: false,
      code: "IDEMPOTENT_ID_MISSING",
      message: "Idempotent effectPolicy could not project an id from the primary response.",
    };
  }
  const top = asId(primary.id);
  if (top != null) return top;
  if (isRecord(primary.application)) {
    const nested = asId(primary.application.id);
    if (nested != null) return nested;
  }
  throw {
    ok: false,
    code: "IDEMPOTENT_ID_MISSING",
    message: "Idempotent effectPolicy could not project an id from the primary response.",
  };
}

function unsupportedBudget(spec: OperationSpec | undefined): RegistryFailure | null {
  if (!spec || supportsOperationBudget(spec)) {
    return null;
  }
  return {
    ok: false,
    code: "UNSUPPORTED_OPERATION_BUDGET",
    message: "Operation budget exceeds the runner contract.",
  };
}

function boundedOutput(value: unknown, maxBytes: number | undefined): unknown {
 if(value && typeof (value as any).then==='function')return Promise.resolve(value).then(output=>boundedOutput(output,maxBytes));
 if(typeof maxBytes==='number' && jsonByteLength(value)>maxBytes)throw {code:'OUTPUT_TOO_LARGE',message:'Operation output exceeds the manifest byte limit.'};
 return value;
}
