import { withLiveMessageSync } from "./message_sync";
import { runExecution } from "./execution";
import slackManifest from "../../connectors/slack/manifest.json";
import {
  sendMessage as sendSlackMessage,
  updateMessage as slackUpdateMessage, deleteMessage as slackDeleteMessage, postEphemeral as slackPostEphemeral,
  createConversation as slackCreateConversation, listConversations as slackListConversations, getConversationHistory as slackConversationHistory,
  getConversationInfo as slackConversationInfo, inviteToConversation as slackInviteToConversation, getConversationMembers as slackConversationMembers,
  listUsers as slackListUsers,
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
  createDatabaseItem as createNotionDatabaseItem,
  createDocument as createNotionDocument,
  getDatabase as getNotionDatabase,
  getDatabaseItem as getNotionDatabaseItem,
  getDocument as getNotionDocument,
  listComments as listNotionComments,
  listDatabaseItems as listNotionDatabaseItems,
  listDocumentBlocks as listNotionDocumentBlocks,
  restoreDatabaseItem as restoreNotionDatabaseItem,
  restoreDocument as restoreNotionDocument,
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
} from "../../connectors/whatsapp/src/actions";
import { healthcheck as whatsappHealthcheck } from "../../connectors/whatsapp/src/healthcheck";
import googleWorkspaceManifest from "../../connectors/google-workspace/manifest.json";
import {
  sendMessage as sendGmailMessage, getSheetValues, appendSheetValues, getDocument as getGoogleDocument,
  getMessage as gwGetMessage, modifyMessage as gwModifyMessage, trashMessage as gwTrashMessage, createDraft as gwCreateDraft, listLabels as gwListLabels,
  createCalendarEvent as gwCreateEvent, updateCalendarEvent as gwUpdateEvent, deleteCalendarEvent as gwDeleteEvent, getCalendarEvent as gwGetEvent, listCalendars as gwListCalendars,
  getDriveFile as gwGetDriveFile, createDriveFile as gwCreateDriveFile, deleteDriveFile as gwDeleteDriveFile, createDrivePermission as gwCreateDrivePermission,
  updateSheetValues as gwUpdateSheetValues, clearSheetValues as gwClearSheetValues, createSpreadsheet as gwCreateSpreadsheet, batchUpdateSpreadsheet as gwBatchUpdateSpreadsheet, createDocument as gwCreateDocument,
} from "../../connectors/google-workspace/src/actions";
import { healthcheck as googleWorkspaceHealthcheck } from "../../connectors/google-workspace/src/healthcheck";
import { executeMessagesListSync as listGmailMessages, executeFilesListSync as listDriveFiles, executeEventsListSync as listCalendarEvents, executeSheetsRowsSync as listSheetRows, executeSheetsWorksheetsSync as listWorksheets } from "../../connectors/google-workspace/src/sync";
import microsoft365Manifest from "../../connectors/microsoft-365/manifest.json";
import {
  sendMessage as sendOutlookMessage,
  getMessage as msGetMessage, replyMessage as msReplyMessage, moveMessage as msMoveMessage, deleteMessage as msDeleteMessage, listMailFolders as msListMailFolders,
  createEvent as msCreateEvent, updateEvent as msUpdateEvent, deleteEvent as msDeleteEvent, getEvent as msGetEvent,
  getDriveItem as msGetDriveItem, deleteDriveItem as msDeleteDriveItem, copyDriveItem as msCopyDriveItem,
  createContact as msCreateContact, listContacts as msListContacts,
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
} from "../../connectors/github/src/actions";
import { healthcheck as githubHealthcheck } from "../../connectors/github/src/healthcheck";
import { executeIssuesListSync as listGitHubIssues, executePullRequestsListSync as listGitHubPRs, executeCommitsListSync as listGitHubCommits, executeRepositoriesListSync as listGitHubRepos } from "../../connectors/github/src/sync";
import salesforceManifest from "../../connectors/salesforce/manifest.json";
import {
  createContact, createLead, createOpportunity, createCase,
  createAccount as sfCreateAccount, getAccount as sfGetAccount, updateAccount as sfUpdateAccount,
  getContact as sfGetContact, updateContact as sfUpdateContact, deleteContact as sfDeleteContact,
  updateLead as sfUpdateLead, getOpportunity as sfGetOpportunity,
  querySobjects as sfQuery, searchSobjects as sfSearch,
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
} from "../../connectors/jira/src/actions";
import { healthcheck as jiraHealthcheck } from "../../connectors/jira/src/healthcheck";
import { executeIssuesSearchSync as searchJiraIssues, executeProjectsListSync as listJiraProjects, executeUsersListSync as listJiraUsers } from "../../connectors/jira/src/sync";
import mailchimpManifest from "../../connectors/mailchimp/manifest.json";
import {
  createContact as createMailchimpContact,
  getMember as mcGetMember, updateMember as mcUpdateMember, upsertMember as mcUpsertMember, deleteMember as mcDeleteMember, addMemberTags as mcAddMemberTags,
  createList as mcCreateList, getList as mcGetList, createCampaign as mcCreateCampaign, getCampaign as mcGetCampaign, sendCampaign as mcSendCampaign,
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
} from "../../connectors/sendgrid/src/actions";
import { healthcheck as sendgridHealthcheck } from "../../connectors/sendgrid/src/healthcheck";
import { executeContactsListSync as listSendGridContacts, executeListsListSync as listSendGridLists, executeCampaignsListSync as listSendGridCampaigns } from "../../connectors/sendgrid/src/sync";
import klaviyoManifest from "../../connectors/klaviyo/manifest.json";
import {
  createContact as createKlaviyoContact,
  getProfile as kvGetProfile, updateProfile as kvUpdateProfile, createList as kvCreateList, getList as kvGetList,
  addProfilesToList as kvAddToList, removeProfilesFromList as kvRemoveFromList, createEvent as kvCreateEvent,
  getSegment as kvGetSegment, createCampaign as kvCreateCampaign,
} from "../../connectors/klaviyo/src/actions";
import { healthcheck as klaviyoHealthcheck } from "../../connectors/klaviyo/src/healthcheck";
import { executeContactsListSync as listKlaviyoContacts, executeCampaignsListSync as listKlaviyoCampaigns, executeListsListSync as listKlaviyoLists } from "../../connectors/klaviyo/src/sync";
import shopifyManifest from "../../connectors/shopify/manifest.json";
import { healthcheck as shopifyHealthcheck } from "../../connectors/shopify/src/healthcheck";
import { executeProductsListSync as listShopifyProducts, executeOrdersListSync as listShopifyOrders, executeCustomersListSync as listShopifyCustomers } from "../../connectors/shopify/src/sync";
import {
  getProduct as shopifyGetProduct, createProduct as shopifyCreateProduct, updateProduct as shopifyUpdateProduct, deleteProduct as shopifyDeleteProduct,
  getOrder as shopifyGetOrder, updateOrder as shopifyUpdateOrder, closeOrder as shopifyCloseOrder, cancelOrder as shopifyCancelOrder,
  getCustomer as shopifyGetCustomer, createCustomer as shopifyCreateCustomer, updateCustomer as shopifyUpdateCustomer,
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
import { executeJobsListSync as listGreenhouseJobs } from "../../connectors/greenhouse/src/sync";
import leverManifest from "../../connectors/lever/manifest.json";
import { healthcheck as leverHealthcheck } from "../../connectors/lever/src/healthcheck";
import { executeJobsListSync as listLeverJobs } from "../../connectors/lever/src/sync";
import ashbyManifest from "../../connectors/ashby/manifest.json";
import { healthcheck as ashbyHealthcheck } from "../../connectors/ashby/src/healthcheck";
import { executeJobsListSync as listAshbyJobs } from "../../connectors/ashby/src/sync";
import workableManifest from "../../connectors/workable/manifest.json";
import { healthcheck as workableHealthcheck } from "../../connectors/workable/src/healthcheck";
import { executeJobsListSync as listWorkableJobs } from "../../connectors/workable/src/sync";
import smartrecruitersManifest from "../../connectors/smartrecruiters/manifest.json";
import { healthcheck as smartrecruitersHealthcheck } from "../../connectors/smartrecruiters/src/healthcheck";
import { executeJobsListSync as listSmartRecruitersJobs } from "../../connectors/smartrecruiters/src/sync";
import recruiteeManifest from "../../connectors/recruitee/manifest.json";
import { healthcheck as recruiteeHealthcheck } from "../../connectors/recruitee/src/healthcheck";
import { executeJobsListSync as listRecruiteeJobs } from "../../connectors/recruitee/src/sync";
import zohoRecruitManifest from "../../connectors/zoho-recruit/manifest.json";
import { healthcheck as zohoRecruitHealthcheck } from "../../connectors/zoho-recruit/src/healthcheck";
import { executeJobsListSync as listZohoRecruitJobs } from "../../connectors/zoho-recruit/src/sync";
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
} from "../../connectors/calendly/src/actions";
import googleAdsManifest from "../../connectors/google-ads/manifest.json";
import { healthcheck as googleAdsHealthcheck } from "../../connectors/google-ads/src/healthcheck";
import { executeCampaignsListSync as listGoogleAdsCampaigns, executeAdGroupsListSync as listGoogleAdsAdGroups, executeAdsListSync as listGoogleAdsAds } from "../../connectors/google-ads/src/sync";
import metaAdsManifest from "../../connectors/meta-ads/manifest.json";
import { healthcheck as metaAdsHealthcheck } from "../../connectors/meta-ads/src/healthcheck";
import { executeCampaignsListSync as listMetaCampaigns, executeAdSetsListSync as listMetaAdSets, executeAdsListSync as listMetaAds, executeAdAccountsListSync as listMetaAdAccounts } from "../../connectors/meta-ads/src/sync";
import linkedinAdsManifest from "../../connectors/linkedin-ads/manifest.json";
import { healthcheck as linkedinAdsHealthcheck } from "../../connectors/linkedin-ads/src/healthcheck";
import { executeCampaignsListSync as listLinkedInAdsCampaigns, executeAdAccountsListSync as listLinkedInAdsAccounts, executeCreativeAssetsListSync as listLinkedInAdsCreatives } from "../../connectors/linkedin-ads/src/sync";
import tiktokAdsManifest from "../../connectors/tiktok-ads/manifest.json";
import { healthcheck as tiktokAdsHealthcheck } from "../../connectors/tiktok-ads/src/healthcheck";
import { executeCampaignsListSync as listTikTokCampaigns, executeAdGroupsListSync as listTikTokAdGroups, executeAdsListSync as listTikTokAds } from "../../connectors/tiktok-ads/src/sync";
import xeroManifest from "../../connectors/xero/manifest.json";
import { healthcheck as xeroHealthcheck } from "../../connectors/xero/src/healthcheck";
import { executeInvoicesListSync as listXeroInvoices, executeContactsListSync as listXeroContacts, executeBankTransactionsListSync as listXeroTransactions } from "../../connectors/xero/src/sync";
import zohoBooksManifest from "../../connectors/zoho-books/manifest.json";
import { healthcheck as zohoBooksHealthcheck } from "../../connectors/zoho-books/src/healthcheck";
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
  listBookings as calComListBookings, getBooking as calComGetBooking, createBooking as calComCreateBooking,
  cancelBooking as calComCancelBooking, rescheduleBooking as calComRescheduleBooking,
  confirmBooking as calComConfirmBooking, declineBooking as calComDeclineBooking,
  getAvailableSlots as calComGetAvailableSlots, listSchedules as calComListSchedules,
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
import { sendEmail as resendSendEmail } from "../../connectors/resend/src/emails";

import googlemeetManifest from "../../connectors/googlemeet/manifest.json";
import { healthcheck as googlemeetHealthcheck } from "../../connectors/googlemeet/src/healthcheck";
import { createMeeting as gmeetCreateMeeting, listMeetings as gmeetListMeetings } from "../../connectors/googlemeet/src/actions";

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
  code: "ACTION_HANDLER_MISSING" | "SYNC_HANDLER_MISSING";
  connectorKey: string;
  operation: string;
  message: string;
};

export type RegistryHealthcheckResult =
  | { ok: true; output: unknown }
  | RegistryFailure;

export type ConnectorRegistry = {
  describe(connectorKey: string): Record<string, unknown> | undefined;
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
  manifests: [fakeConnector, slackManifest, telegramManifest, whatsappManifest, notionManifest, googleWorkspaceManifest, microsoft365Manifest, githubManifest, salesforceManifest, hubspotManifest, linkedinManifest, jiraManifest, mailchimpManifest, brevoManifest, sendgridManifest, klaviyoManifest, shopifyManifest, woocommerceManifest, quickbooksManifest, greenhouseManifest, leverManifest, ashbyManifest, workableManifest, smartrecruitersManifest, recruiteeManifest, zohoRecruitManifest, typeformManifest, calendlyManifest, googleAdsManifest, metaAdsManifest, linkedinAdsManifest, tiktokAdsManifest, xeroManifest, zohoBooksManifest, httpRequestManifest, csvManifest, webhookManifest, smtpEmailManifest, automationWebhookManifest, calComManifest, lushaManifest, apolloManifest, apifyManifest, zoomManifest, saleshandyManifest, unipileManifest, rb2bManifest, caldavManifest, resendManifest, googlemeetManifest],
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
    lever: leverHealthcheck,
    ashby: ashbyHealthcheck,
    workable: workableHealthcheck,
    smartrecruiters: smartrecruitersHealthcheck,
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
      "documents.blocks.append": appendNotionDocumentText,
      "documents.blocks.list": listNotionDocumentBlocks,
      "documents.create": createNotionDocument,
      "documents.get": getNotionDocument,
      "documents.restore": restoreNotionDocument,
      "documents.search": searchNotionDocuments,
      "documents.trash": trashNotionDocument,
      "databases.get": getNotionDatabase,
      "databases.items.create": createNotionDatabaseItem,
      "databases.items.get": getNotionDatabaseItem,
      "databases.items.query": listNotionDatabaseItems,
      "databases.items.restore": restoreNotionDatabaseItem,
      "databases.items.trash": trashNotionDatabaseItem,
      "databases.items.update": updateNotionDatabaseItem,
    },
    slack: {
      "messages.send": sendSlackMessage,
      "chat.update": slackUpdateMessage,
      "chat.delete": slackDeleteMessage,
      "chat.postEphemeral": slackPostEphemeral,
      "conversations.create": slackCreateConversation,
      "conversations.list": slackListConversations,
      "conversations.history": slackConversationHistory,
      "conversations.info": slackConversationInfo,
      "conversations.invite": slackInviteToConversation,
      "conversations.members": slackConversationMembers,
      "users.list": slackListUsers,
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
    },
    "google-workspace": {
      "messages.send": sendGmailMessage,
      "sheets.values.get": getSheetValues,
      "sheets.values.append": appendSheetValues,
      "docs.get": getGoogleDocument,
      "messages.get": gwGetMessage,
      "messages.modify": gwModifyMessage,
      "messages.trash": gwTrashMessage,
      "drafts.create": gwCreateDraft,
      "labels.list": gwListLabels,
      "calendar.events.create": gwCreateEvent,
      "calendar.events.update": gwUpdateEvent,
      "calendar.events.delete": gwDeleteEvent,
      "calendar.events.get": gwGetEvent,
      "calendar.calendars.list": gwListCalendars,
      "drive.files.get": gwGetDriveFile,
      "drive.files.create": gwCreateDriveFile,
      "drive.files.delete": gwDeleteDriveFile,
      "drive.permissions.create": gwCreateDrivePermission,
      "sheets.values.update": gwUpdateSheetValues,
      "sheets.values.clear": gwClearSheetValues,
      "sheets.spreadsheets.create": gwCreateSpreadsheet,
      "sheets.spreadsheets.batchUpdate": gwBatchUpdateSpreadsheet,
      "docs.create": gwCreateDocument,
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
      "mailFolders.list": msListMailFolders,
      "events.create": msCreateEvent,
      "events.update": msUpdateEvent,
      "events.delete": msDeleteEvent,
      "events.get": msGetEvent,
      "drive.items.get": msGetDriveItem,
      "drive.items.delete": msDeleteDriveItem,
      "drive.items.copy": msCopyDriveItem,
      "contacts.create": msCreateContact,
      "contacts.list": msListContacts,
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
      "repos.get": ghGetRepo,
      "repos.create": ghCreateRepo,
      "repos.list": ghListRepos,
      "repos.contents.get": ghGetRepoContents,
      "branches.get": ghGetBranch,
      "branches.create": ghCreateBranch,
      "releases.create": ghCreateRelease,
      "gists.create": ghCreateGist,
    },
    salesforce: {
      "contacts.create": createContact,
      "leads.create": createLead,
      "opportunities.create": createOpportunity,
      "cases.create": createCase,
      "accounts.create": sfCreateAccount,
      "accounts.get": sfGetAccount,
      "accounts.update": sfUpdateAccount,
      "contacts.get": sfGetContact,
      "contacts.update": sfUpdateContact,
      "contacts.delete": sfDeleteContact,
      "leads.update": sfUpdateLead,
      "opportunities.get": sfGetOpportunity,
      "sobjects.query": sfQuery,
      "sobjects.search": sfSearch,
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
      "deals.get": hsGetDeal,
      "deals.update": hsUpdateDeal,
      "deals.delete": hsDeleteDeal,
      "tickets.get": hsGetTicket,
      "tickets.update": hsUpdateTicket,
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
      "projects.get": jiraGetProject,
      "users.get": jiraGetUser,
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
      "scheduled_events.list": calListScheduledEvents,
      "scheduled_events.get": calGetScheduledEvent,
      "scheduled_events.invitees.list": calListInvitees,
      "scheduled_events.cancel": calCancelEvent,
      "invitee_no_shows.create": calCreateNoShow,
      "scheduling_links.create": calCreateLink,
      "slots.available": calGetSlots,
      "bookings.create": calCreateBooking,
    },
    shopify: {
      "products.get": shopifyGetProduct,
      "products.create": shopifyCreateProduct,
      "products.update": shopifyUpdateProduct,
      "products.delete": shopifyDeleteProduct,
      "orders.get": shopifyGetOrder,
      "orders.update": shopifyUpdateOrder,
      "orders.close": shopifyCloseOrder,
      "orders.cancel": shopifyCancelOrder,
      "customers.get": shopifyGetCustomer,
      "customers.create": shopifyCreateCustomer,
      "customers.update": shopifyUpdateCustomer,
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
    "cal-com": {
      "me.get": calComGetMe,
      "event_types.list": calComListEventTypes,
      "event_types.get": calComGetEventType,
      "bookings.list": calComListBookings,
      "bookings.get": calComGetBooking,
      "bookings.create": calComCreateBooking,
      "bookings.cancel": calComCancelBooking,
      "bookings.reschedule": calComRescheduleBooking,
      "bookings.confirm": calComConfirmBooking,
      "bookings.decline": calComDeclineBooking,
      "slots.available": calComGetAvailableSlots,
      "schedules.list": calComListSchedules,
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
    },
    googlemeet: {
      "meetings.create": gmeetCreateMeeting,
      "meetings.list": gmeetListMeetings,
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
    },
    lever: {
      "jobs.list": listLeverJobs,
    },
    ashby: {
      "jobs.list": listAshbyJobs,
    },
    workable: {
      "jobs.list": listWorkableJobs,
    },
    smartrecruiters: {
      "jobs.list": listSmartRecruitersJobs,
    },
    recruitee: {
      "jobs.list": listRecruiteeJobs,
    },
    "zoho-recruit": {
      "jobs.list": listZohoRecruitJobs,
    },
    typeform: {
      "forms.list": listTypeformForms,
      "responses.list": listTypeformResponses,
    },
    "google-ads": {
      "campaigns.list": listGoogleAdsCampaigns,
      "ad_groups.list": listGoogleAdsAdGroups,
      "ads.list": listGoogleAdsAds,
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
    healthcheck(connectorKey: string, inputValue?: unknown): RegistryHealthcheckResult | undefined {
      const handler = input.healthchecks[connectorKey];
      if (!handler) {
        return undefined;
      }
      // Mirror the action path: invoke the handler with the credential input and
      // surface the (possibly Promise) output. A synchronous structured throw is
      // captured here; an async rejection is awaited+mapped by the server layer.
      try {
        return { ok: true, output: runExecution(() => handler(inputValue), operationSpecs[connectorKey]?.healthcheck?.timeoutMs) };
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
      if (!input.actions[connectorKey]) {
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
      const inputSizeFailure = validateInputSize(inputValue, operationSpec.maxInputBytes);
      if (inputSizeFailure) {
        return inputSizeFailure;
      }
      const handler = input.actions[connectorKey][action];
      if (!handler) {
        return { ok: false, code: "UNKNOWN_ACTION", message: "Action is not registered." };
      }
      return { ok: true, output: runExecution(() => boundedOutput(handler(inputValue), operationSpec.maxResponseBytes), operationSpec.timeoutMs) };
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

function buildConnectorOperationSpecs(manifests: Array<{ key: string; operations: unknown }>): Record<string, Record<string, {
  kind?: string;
  timeoutMs?: number;
  maxInputBytes?: number;
  maxResponseBytes?: number;
}>> {
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

function boundedOutput(value:unknown,maxBytes:number|undefined):unknown {
 if(value && typeof (value as any).then==='function')return Promise.resolve(value).then(output=>boundedOutput(output,maxBytes));
 if(typeof maxBytes==='number' && Buffer.byteLength(JSON.stringify(value)??'null')>maxBytes)throw {code:'OUTPUT_TOO_LARGE',message:'Operation output exceeds the manifest byte limit.'};
 return value;
}
