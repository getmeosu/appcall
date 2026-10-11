/**
 * Greenhouse G3 — Composio Harvest v3 tools missing from origin/main (88 ops).
 * Handwritten HTTP via createAuthClient. Paths under /v3.
 * Accepts Composio snake_case and existing camelCase aliases.
 */
import { createAuthClient, type GreenhouseHttpMethod } from "./http";
import { assertSafePathSegment } from "../../_shared/jobboard";

export interface GreenhouseAuthInput {
  clientId: string;
  clientSecret: string;
  userId?: string;
  fetch?: typeof fetch;
  on_behalf_of?: string | number;
  onBehalfOf?: string | number;
}

type G3Spec = {
  method: GreenhouseHttpMethod;
  path: string;
  required: string[];
  queryKeys: string[];
  bodyKeys: string[];
  listKey: string | null;
  emptyOk: boolean;
  slug: string;
};

const AUTH_KEYS = new Set([
  "clientId",
  "clientSecret",
  "userId",
  "fetch",
  "accessToken",
  "on_behalf_of",
  "onBehalfOf",
]);

export const G3_SPECS: Record<string, G3Spec> = {
  "users.activate": {"method": "POST", "path": "/users/{id}/activate", "required": ["id"], "queryKeys": [], "bodyKeys": [], "listKey": null, "emptyOk": true, "slug": "GREENHOUSE_ACTIVATE_USER"},
  "candidates.anonymize": {"method": "PATCH", "path": "/candidates/{id}/anonymize", "required": ["id", "fields"], "queryKeys": [], "bodyKeys": ["fields"], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_ANONYMIZE_CANDIDATE"},
  "blocked_spam_sources.bulk_create": {"method": "POST", "path": "/blocked_spam_sources/bulk", "required": ["data"], "queryKeys": [], "bodyKeys": ["data", "callback_url"], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_BULK_CREATE_BLOCKED_SPAM_SOURCES"},
  "custom_field_options.bulk_create": {"method": "POST", "path": "/custom_field_options/bulk", "required": ["data"], "queryKeys": [], "bodyKeys": ["data"], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_BULK_CREATE_CUSTOM_FIELD_OPTIONS"},
  "openings.bulk_create": {"method": "POST", "path": "/openings/bulk", "required": ["data"], "queryKeys": [], "bodyKeys": ["data", "callback_url"], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_BULK_CREATE_OPENINGS"},
  "users.bulk_deactivate": {"method": "POST", "path": "/users/deactivate/bulk", "required": ["data"], "queryKeys": [], "bodyKeys": ["data", "callback_url"], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_BULK_DEACTIVATE_USERS"},
  "custom_field_options.bulk_delete": {"method": "DELETE", "path": "/custom_field_options/bulk", "required": ["data"], "queryKeys": [], "bodyKeys": ["data"], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_BULK_DELETE_CUSTOM_FIELD_OPTIONS"},
  "blocked_spam_sources.bulk_update": {"method": "PATCH", "path": "/blocked_spam_sources/bulk", "required": ["data"], "queryKeys": [], "bodyKeys": ["data", "callback_url"], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_BULK_UPDATE_BLOCKED_SPAM_SOURCES"},
  "custom_field_options.bulk_update": {"method": "PATCH", "path": "/custom_field_options/bulk", "required": ["data"], "queryKeys": [], "bodyKeys": ["data", "callback_url"], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_BULK_UPDATE_CUSTOM_FIELD_OPTIONS"},
  "departments.bulk_update": {"method": "PATCH", "path": "/departments/bulk", "required": ["data"], "queryKeys": [], "bodyKeys": ["data", "callback_url"], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_BULK_UPDATE_DEPARTMENTS"},
  "offices.bulk_update": {"method": "PATCH", "path": "/offices/bulk", "required": ["data"], "queryKeys": [], "bodyKeys": ["data", "callback_url"], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_BULK_UPDATE_OFFICES"},
  "openings.bulk_update": {"method": "PATCH", "path": "/openings/bulk", "required": ["data"], "queryKeys": [], "bodyKeys": ["data", "callback_url"], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_BULK_UPDATE_OPENINGS"},
  "users.bulk_update": {"method": "PATCH", "path": "/users/bulk", "required": ["data"], "queryKeys": [], "bodyKeys": ["data", "callback_url"], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_BULK_UPDATE_USERS"},
  "approval_flows.create": {"method": "POST", "path": "/approval_flows", "required": ["job_id", "sequential", "approver_groups", "approval_type"], "queryKeys": [], "bodyKeys": ["job_id", "offer_id", "sequential", "approval_type", "approver_groups"], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_CREATE_APPROVAL_FLOW"},
  "blocked_spam_sources.create": {"method": "POST", "path": "/blocked_spam_sources", "required": ["value", "source_type"], "queryKeys": [], "bodyKeys": ["note", "value", "source_type"], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_CREATE_BLOCKED_SPAM_SOURCE"},
  "custom_fields.create": {"method": "POST", "path": "/custom_fields", "required": ["name", "field_type", "value_type"], "queryKeys": [], "bodyKeys": ["name", "private", "api_only", "required", "field_type", "office_ids", "value_type", "description", "department_ids", "require_approval", "trigger_new_version", "custom_field_options", "generate_email_token", "expose_in_job_board_api"], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_CREATE_CUSTOM_FIELD"},
  "custom_field_departments.create": {"method": "POST", "path": "/custom_field_departments", "required": ["department_id", "custom_field_id"], "queryKeys": [], "bodyKeys": ["department_id", "custom_field_id"], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_CREATE_CUSTOM_FIELD_DEPARTMENT"},
  "custom_field_offices.create": {"method": "POST", "path": "/custom_field_offices", "required": ["office_id", "custom_field_id"], "queryKeys": [], "bodyKeys": ["office_id", "custom_field_id"], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_CREATE_CUSTOM_FIELD_OFFICE"},
  "custom_field_options.create": {"method": "POST", "path": "/custom_field_options", "required": ["name", "sort_order", "custom_field_id"], "queryKeys": [], "bodyKeys": ["name", "sort_order", "external_id", "custom_field_id"], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_CREATE_CUSTOM_FIELD_OPTION"},
  "departments.create": {"method": "POST", "path": "/departments", "required": ["name"], "queryKeys": [], "bodyKeys": ["name", "parent_id", "external_id", "external_parent_id"], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_CREATE_DEPARTMENT"},
  "jobs.create": {"method": "POST", "path": "/jobs", "required": ["template_job_id", "number_of_openings"], "queryKeys": [], "bodyKeys": ["notes", "job_name", "office_ids", "opening_ids", "custom_fields", "department_id", "job_post_name", "requisition_id", "template_job_id", "number_of_openings", "external_office_ids", "external_department_id"], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_CREATE_JOB"},
  "job_hiring_managers.create": {"method": "POST", "path": "/job_hiring_managers", "required": ["job_id", "user_id"], "queryKeys": [], "bodyKeys": ["job_id", "user_id"], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_CREATE_JOB_HIRING_MANAGER"},
  "job_notes.create": {"method": "POST", "path": "/job_notes", "required": ["body", "job_id", "user_id"], "queryKeys": [], "bodyKeys": ["body", "job_id", "user_id", "visibility"], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_CREATE_JOB_NOTE"},
  "job_owners.create": {"method": "POST", "path": "/job_owners", "required": ["job_id", "user_id", "type"], "queryKeys": [], "bodyKeys": ["type", "job_id", "user_id"], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_CREATE_JOB_OWNER"},
  "offices.create": {"method": "POST", "path": "/offices", "required": ["name"], "queryKeys": [], "bodyKeys": ["name", "location", "parent_id", "external_id", "external_parent_id"], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_CREATE_OFFICE"},
  "openings.create": {"method": "POST", "path": "/openings", "required": ["job_id"], "queryKeys": [], "bodyKeys": ["job_id", "opening_id", "custom_fields"], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_CREATE_OPENING"},
  "users.create": {"method": "POST", "path": "/users", "required": ["last_name", "first_name", "primary_email"], "queryKeys": [], "bodyKeys": ["last_name", "first_name", "office_ids", "employee_id", "custom_fields", "primary_email", "department_ids", "send_email_invite", "external_office_ids", "external_department_ids"], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_CREATE_USER"},
  "user_emails.create": {"method": "POST", "path": "/user_emails", "required": ["email", "user_id"], "queryKeys": [], "bodyKeys": ["email", "user_id", "send_verification"], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_CREATE_USER_EMAIL"},
  "user_job_permissions.create": {"method": "POST", "path": "/user_job_permissions", "required": ["job_id", "role_id", "user_id"], "queryKeys": [], "bodyKeys": ["job_id", "role_id", "user_id"], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_CREATE_USER_JOB_PERMISSION"},
  "users.deactivate": {"method": "POST", "path": "/users/{id}/deactivate", "required": ["id"], "queryKeys": [], "bodyKeys": [], "listKey": null, "emptyOk": true, "slug": "GREENHOUSE_DEACTIVATE_USER"},
  "blocked_spam_sources.delete": {"method": "DELETE", "path": "/blocked_spam_sources/{id}", "required": ["id"], "queryKeys": [], "bodyKeys": [], "listKey": null, "emptyOk": true, "slug": "GREENHOUSE_DELETE_BLOCKED_SPAM_SOURCE"},
  "custom_field_offices.delete": {"method": "DELETE", "path": "/custom_field_offices/{id}", "required": ["id"], "queryKeys": [], "bodyKeys": [], "listKey": null, "emptyOk": true, "slug": "GREENHOUSE_DELETE_CUSTOM_FIELD_OFFICE"},
  "custom_field_options.delete": {"method": "DELETE", "path": "/custom_field_options/{id}", "required": ["id"], "queryKeys": [], "bodyKeys": [], "listKey": null, "emptyOk": true, "slug": "GREENHOUSE_DELETE_CUSTOM_FIELD_OPTION"},
  "job_hiring_managers.delete": {"method": "DELETE", "path": "/job_hiring_managers/{id}", "required": ["id"], "queryKeys": [], "bodyKeys": [], "listKey": null, "emptyOk": true, "slug": "GREENHOUSE_DELETE_JOB_HIRING_MANAGER"},
  "job_notes.delete": {"method": "DELETE", "path": "/job_notes/{id}", "required": ["id"], "queryKeys": [], "bodyKeys": [], "listKey": null, "emptyOk": true, "slug": "GREENHOUSE_DELETE_JOB_NOTE"},
  "job_owners.delete": {"method": "DELETE", "path": "/job_owners/{id}", "required": ["id"], "queryKeys": [], "bodyKeys": [], "listKey": null, "emptyOk": true, "slug": "GREENHOUSE_DELETE_JOB_OWNER"},
  "user_job_permissions.delete": {"method": "DELETE", "path": "/user_job_permissions/{id}", "required": ["id"], "queryKeys": [], "bodyKeys": [], "listKey": null, "emptyOk": true, "slug": "GREENHOUSE_DELETE_USER_JOB_PERMISSION"},
  "users.me": {"method": "GET", "path": "/users", "required": [], "queryKeys": [], "bodyKeys": [], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_GET_CURRENT_USER"},
  "approval_flows.list": {"method": "GET", "path": "/approval_flows", "required": [], "queryKeys": ["ids", "cursor", "fields", "job_ids", "per_page", "offer_ids", "created_at", "updated_at", "approval_type"], "bodyKeys": [], "listKey": "approvalFlows", "emptyOk": false, "slug": "GREENHOUSE_LIST_APPROVAL_FLOWS"},
  "approver_groups.list": {"method": "GET", "path": "/approver_groups", "required": [], "queryKeys": ["ids", "cursor", "fields", "per_page", "created_at", "updated_at", "approval_flow_ids"], "bodyKeys": [], "listKey": "approverGroups", "emptyOk": false, "slug": "GREENHOUSE_LIST_APPROVER_GROUPS"},
  "approvers.list": {"method": "GET", "path": "/approvers", "required": [], "queryKeys": ["ids", "cursor", "fields", "status", "per_page", "user_ids", "created_at", "updated_at", "approver_group_ids"], "bodyKeys": [], "listKey": "approvers", "emptyOk": false, "slug": "GREENHOUSE_LIST_APPROVERS"},
  "bulk_requests.list": {"method": "GET", "path": "/bulk_requests", "required": [], "queryKeys": ["cursor", "per_page"], "bodyKeys": [], "listKey": "bulkRequests", "emptyOk": false, "slug": "GREENHOUSE_LIST_BULK_REQUESTS"},
  "custom_field_departments.list": {"method": "GET", "path": "/custom_field_departments", "required": [], "queryKeys": ["ids", "cursor", "fields", "per_page", "created_at", "updated_at", "department_ids", "custom_field_ids"], "bodyKeys": [], "listKey": "customFieldDepartments", "emptyOk": false, "slug": "GREENHOUSE_LIST_CUSTOM_FIELD_DEPARTMENTS"},
  "custom_field_offices.list": {"method": "GET", "path": "/custom_field_offices", "required": [], "queryKeys": ["ids", "cursor", "fields", "per_page", "created_at", "office_ids", "updated_at", "custom_field_ids"], "bodyKeys": [], "listKey": "customFieldOffices", "emptyOk": false, "slug": "GREENHOUSE_LIST_CUSTOM_FIELD_OFFICES"},
  "custom_field_options.list": {"method": "GET", "path": "/custom_field_options", "required": [], "queryKeys": ["ids", "active", "cursor", "fields", "per_page", "created_at", "updated_at", "custom_field_ids", "custom_field_key"], "bodyKeys": [], "listKey": "customFieldOptions", "emptyOk": false, "slug": "GREENHOUSE_LIST_CUSTOM_FIELD_OPTIONS"},
  "custom_fields.list": {"method": "GET", "path": "/custom_fields", "required": [], "queryKeys": ["ids", "name", "active", "cursor", "fields", "name_key", "per_page", "created_at", "field_type", "updated_at"], "bodyKeys": [], "listKey": "customFields", "emptyOk": false, "slug": "GREENHOUSE_LIST_CUSTOM_FIELDS"},
  "default_interviewers.list": {"method": "GET", "path": "/default_interviewers", "required": [], "queryKeys": ["ids", "cursor", "fields", "per_page", "user_ids", "created_at", "updated_at", "interview_kit_ids"], "bodyKeys": [], "listKey": "defaultInterviewers", "emptyOk": false, "slug": "GREENHOUSE_LIST_DEFAULT_INTERVIEWERS"},
  "demographic_answer_options.list": {"method": "GET", "path": "/demographic_answer_options", "required": [], "queryKeys": ["cursor", "per_page"], "bodyKeys": [], "listKey": "demographicAnswerOptions", "emptyOk": false, "slug": "GREENHOUSE_LIST_DEMOGRAPHIC_ANSWER_OPTIONS"},
  "demographic_answers.list": {"method": "GET", "path": "/demographic_answers", "required": [], "queryKeys": ["cursor", "per_page", "created_after", "updated_after", "created_before", "updated_before"], "bodyKeys": [], "listKey": "demographicAnswers", "emptyOk": false, "slug": "GREENHOUSE_LIST_DEMOGRAPHIC_ANSWERS"},
  "demographic_questions.list": {"method": "GET", "path": "/demographic_questions", "required": [], "queryKeys": ["cursor", "per_page"], "bodyKeys": [], "listKey": "demographicQuestions", "emptyOk": false, "slug": "GREENHOUSE_LIST_DEMOGRAPHIC_QUESTIONS"},
  "demographic_question_sets.list": {"method": "GET", "path": "/demographic_question_sets", "required": [], "queryKeys": ["cursor", "per_page"], "bodyKeys": [], "listKey": "demographicQuestionSets", "emptyOk": false, "slug": "GREENHOUSE_LIST_DEMOGRAPHIC_QUESTION_SETS"},
  "eeoc.list": {"method": "GET", "path": "/eeoc", "required": [], "queryKeys": ["cursor", "per_page", "submitted_at"], "bodyKeys": [], "listKey": "eeoc", "emptyOk": false, "slug": "GREENHOUSE_LIST_EEOC"},
  "email_templates.list": {"method": "GET", "path": "/email_templates", "required": [], "queryKeys": ["cursor", "fields", "per_page", "created_at", "updated_at"], "bodyKeys": [], "listKey": "emailTemplates", "emptyOk": false, "slug": "GREENHOUSE_LIST_EMAIL_TEMPLATES"},
  "focus_candidate_attributes.list": {"method": "GET", "path": "/focus_candidate_attributes", "required": [], "queryKeys": ["ids", "cursor", "fields", "per_page", "created_after", "updated_after", "created_before", "updated_before", "interview_kit_ids", "job_candidate_attribute_ids"], "bodyKeys": [], "listKey": "focusCandidateAttributes", "emptyOk": false, "slug": "GREENHOUSE_LIST_FOCUS_CANDIDATE_ATTRIBUTES"},
  "interviewer_tags.list": {"method": "GET", "path": "/interviewer_tags", "required": [], "queryKeys": ["ids", "cursor", "fields", "per_page", "created_at_gt", "created_at_lt", "updated_at_gt", "updated_at_lt", "created_at_gte", "created_at_lte", "updated_at_gte", "updated_at_lte"], "bodyKeys": [], "listKey": "interviewerTags", "emptyOk": false, "slug": "GREENHOUSE_LIST_INTERVIEWER_TAGS"},
  "interview_kits.list": {"method": "GET", "path": "/interview_kits", "required": [], "queryKeys": ["ids", "cursor", "fields", "job_ids", "per_page", "created_at", "updated_at", "job_interview_ids"], "bodyKeys": [], "listKey": "interviewKits", "emptyOk": false, "slug": "GREENHOUSE_LIST_INTERVIEW_KITS"},
  "job_board_custom_locations.list": {"method": "GET", "path": "/job_board_custom_locations", "required": [], "queryKeys": ["ids", "active", "cursor", "fields", "per_page", "created_at", "updated_at", "greenhouse_job_board_ids"], "bodyKeys": [], "listKey": "jobBoardCustomLocations", "emptyOk": false, "slug": "GREENHOUSE_LIST_JOB_BOARD_CUSTOM_LOCATIONS"},
  "job_boards.list": {"method": "GET", "path": "/job_boards", "required": [], "queryKeys": ["ids", "live", "cursor", "fields", "internal", "per_page", "created_at", "updated_at"], "bodyKeys": [], "listKey": "jobBoards", "emptyOk": false, "slug": "GREENHOUSE_LIST_JOB_BOARDS"},
  "job_candidate_attributes.list": {"method": "GET", "path": "/job_candidate_attributes", "required": [], "queryKeys": ["ids", "active", "cursor", "fields", "job_ids", "per_page", "created_at", "updated_at", "candidate_attribute_type_ids"], "bodyKeys": [], "listKey": "jobCandidateAttributes", "emptyOk": false, "slug": "GREENHOUSE_LIST_JOB_CANDIDATE_ATTRIBUTES"},
  "job_hiring_managers.list": {"method": "GET", "path": "/job_hiring_managers", "required": [], "queryKeys": ["ids", "cursor", "fields", "job_ids", "per_page", "user_ids", "created_at", "updated_at"], "bodyKeys": [], "listKey": "jobHiringManagers", "emptyOk": false, "slug": "GREENHOUSE_LIST_JOB_HIRING_MANAGERS"},
  "job_interviews.list": {"method": "GET", "path": "/job_interviews", "required": [], "queryKeys": ["ids", "active", "cursor", "job_ids", "per_page", "created_at", "updated_at", "scheduling_type", "job_interview_stage_ids"], "bodyKeys": [], "listKey": "jobInterviews", "emptyOk": false, "slug": "GREENHOUSE_LIST_JOB_INTERVIEWS"},
  "job_notes.list": {"method": "GET", "path": "/job_notes", "required": [], "queryKeys": ["ids", "cursor", "job_ids", "per_page", "user_ids", "created_after", "updated_after", "created_before", "updated_before"], "bodyKeys": [], "listKey": "jobNotes", "emptyOk": false, "slug": "GREENHOUSE_LIST_JOB_NOTES"},
  "job_owners.list": {"method": "GET", "path": "/job_owners", "required": [], "queryKeys": ["ids", "type", "cursor", "job_ids", "per_page", "user_ids", "created_after", "updated_after", "created_before", "updated_before"], "bodyKeys": [], "listKey": "jobOwners", "emptyOk": false, "slug": "GREENHOUSE_LIST_JOB_OWNERS"},
  "job_posts.list": {"method": "GET", "path": "/job_posts", "required": [], "queryKeys": ["ids", "live", "active", "cursor", "fields", "job_ids", "featured", "internal", "per_page", "created_after", "job_board_ids", "updated_after", "created_before", "updated_before"], "bodyKeys": [], "listKey": "jobPosts", "emptyOk": false, "slug": "GREENHOUSE_LIST_JOB_POSTS"},
  "job_post_searchable_locations.list": {"method": "GET", "path": "/job_post_searchable_locations", "required": [], "queryKeys": ["ids", "cursor", "fields", "per_page", "job_post_ids", "created_after", "updated_after", "created_before", "updated_before"], "bodyKeys": [], "listKey": "jobPostSearchableLocations", "emptyOk": false, "slug": "GREENHOUSE_LIST_JOB_POST_SEARCHABLE_LOCATIONS"},
  "openings.list": {"method": "GET", "path": "/openings", "required": [], "queryKeys": ["ids", "open", "cursor", "job_ids", "per_page", "opening_id", "closed_after", "opened_after", "closed_before", "created_after", "opened_before", "updated_after", "created_before", "updated_before", "application_ids", "close_reason_ids", "custom_field_option_id"], "bodyKeys": [], "listKey": "openings", "emptyOk": false, "slug": "GREENHOUSE_LIST_OPENINGS"},
  "pay_input_ranges.list": {"method": "GET", "path": "/pay_input_ranges", "required": [], "queryKeys": ["ids", "cursor", "fields", "per_page", "created_at", "updated_at", "job_post_ids", "pay_input_ids"], "bodyKeys": [], "listKey": "payInputRanges", "emptyOk": false, "slug": "GREENHOUSE_LIST_PAY_INPUT_RANGES"},
  "pay_inputs.list": {"method": "GET", "path": "/pay_inputs", "required": [], "queryKeys": ["ids", "cursor", "fields", "per_page", "created_at", "updated_at", "linked_custom_field_ids"], "bodyKeys": [], "listKey": "payInputs", "emptyOk": false, "slug": "GREENHOUSE_LIST_PAY_INPUTS"},
  "prospect_pools.list": {"method": "GET", "path": "/prospect_pools", "required": [], "queryKeys": ["ids", "active", "cursor", "fields", "job_ids", "per_page", "created_at", "office_ids", "updated_at", "department_ids"], "bodyKeys": [], "listKey": "prospectPools", "emptyOk": false, "slug": "GREENHOUSE_LIST_PROSPECT_POOLS"},
  "prospect_pool_stages.list": {"method": "GET", "path": "/prospect_pool_stages", "required": [], "queryKeys": ["ids", "cursor", "fields", "per_page", "created_at", "updated_at", "prospect_pool_ids"], "bodyKeys": [], "listKey": "prospectPoolStages", "emptyOk": false, "slug": "GREENHOUSE_LIST_PROSPECT_POOL_STAGES"},
  "referrers.list": {"method": "GET", "path": "/referrers", "required": [], "queryKeys": ["ids", "cursor", "fields", "per_page", "user_ids", "created_after", "updated_after", "created_before", "updated_before"], "bodyKeys": [], "listKey": "referrers", "emptyOk": false, "slug": "GREENHOUSE_LIST_REFERRERS"},
  "scorecard_question_options.list": {"method": "GET", "path": "/scorecard_question_options", "required": [], "queryKeys": ["ids", "active", "cursor", "fields", "per_page", "created_at", "updated_at", "scorecard_question_ids"], "bodyKeys": [], "listKey": "scorecardQuestionOptions", "emptyOk": false, "slug": "GREENHOUSE_LIST_SCORECARD_QUESTION_OPTIONS"},
  "tracking_links.list": {"method": "GET", "path": "/tracking_links", "required": [], "queryKeys": ["ids", "token", "cursor", "fields", "job_ids", "per_page", "created_at", "source_ids", "updated_at", "job_post_ids", "referrer_ids", "job_board_ids", "related_post_ids", "related_post_type"], "bodyKeys": [], "listKey": "trackingLinks", "emptyOk": false, "slug": "GREENHOUSE_LIST_TRACKING_LINKS"},
  "user_job_permissions.list": {"method": "GET", "path": "/user_job_permissions", "required": [], "queryKeys": ["cursor", "per_page"], "bodyKeys": [], "listKey": "userJobPermissions", "emptyOk": false, "slug": "GREENHOUSE_LIST_USER_JOB_PERMISSIONS"},
  "approver_groups.replace_approver": {"method": "PUT", "path": "/approver_groups/{id}/replace_approver", "required": ["id", "add_user_id", "remove_user_id"], "queryKeys": [], "bodyKeys": ["add_user_id", "remove_user_id"], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_REPLACE_APPROVER"},
  "approval_flows.request_approvals": {"method": "POST", "path": "/approval_flows/{id}/request_approvals", "required": ["id"], "queryKeys": [], "bodyKeys": [], "listKey": null, "emptyOk": true, "slug": "GREENHOUSE_REQUEST_APPROVALS"},
  "users.revoke_permissions": {"method": "POST", "path": "/users/{id}/revoke_permissions", "required": ["id"], "queryKeys": [], "bodyKeys": [], "listKey": null, "emptyOk": true, "slug": "GREENHOUSE_REVOKE_USER_PERMISSIONS"},
  "applications.search": {"method": "GET", "path": "/applications", "required": [], "queryKeys": ["cursor", "fields", "search", "job_ids", "per_page", "prospect", "office_id", "stage_ids", "job_status", "source_ids", "stage_name", "job_post_ids", "recruiter_id", "referrer_ids", "stage_status", "candidate_ids", "department_id", "coordinator_id", "candidate_tag_id", "prospect_pool_id", "hiring_manager_id"], "bodyKeys": [], "listKey": "applications", "emptyOk": false, "slug": "GREENHOUSE_SEARCH_APPLICATIONS"},
  "approval_flows.update": {"method": "PATCH", "path": "/approval_flows/{id}", "required": ["id", "sequential"], "queryKeys": [], "bodyKeys": ["sequential"], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_UPDATE_APPROVAL_FLOW"},
  "blocked_spam_sources.update": {"method": "PATCH", "path": "/blocked_spam_sources/{id}", "required": ["id", "note"], "queryKeys": [], "bodyKeys": ["note"], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_UPDATE_BLOCKED_SPAM_SOURCE"},
  "custom_fields.update": {"method": "PATCH", "path": "/custom_fields/{id}", "required": ["id"], "queryKeys": [], "bodyKeys": ["name", "private", "api_only", "required", "description", "require_approval", "template_token_string", "expose_in_job_board_api"], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_UPDATE_CUSTOM_FIELD"},
  "custom_field_options.update": {"method": "PATCH", "path": "/custom_field_options/{id}", "required": ["id"], "queryKeys": [], "bodyKeys": ["name", "sort_order", "external_id"], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_UPDATE_CUSTOM_FIELD_OPTION"},
  "departments.update": {"method": "PATCH", "path": "/departments/{id}", "required": ["id", "name"], "queryKeys": [], "bodyKeys": ["name", "parent_id", "external_id"], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_UPDATE_DEPARTMENT"},
  "jobs.update": {"method": "PATCH", "path": "/jobs/{id}", "required": ["id"], "queryKeys": [], "bodyKeys": ["name", "notes", "anywhere", "office_ids", "custom_fields", "department_id", "requisition_id", "external_office_ids", "how_to_sell_this_job", "external_department_id", "team_and_responsibilities"], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_UPDATE_JOB"},
  "job_notes.update": {"method": "PATCH", "path": "/job_notes/{id}", "required": ["id"], "queryKeys": [], "bodyKeys": ["body", "visibility"], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_UPDATE_JOB_NOTE"},
  "offices.update": {"method": "PATCH", "path": "/offices/{id}", "required": ["id", "name"], "queryKeys": [], "bodyKeys": ["name", "location", "parent_id", "external_id", "external_parent_id", "primary_in_house_contact_user_id"], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_UPDATE_OFFICE"},
  "openings.update": {"method": "PATCH", "path": "/openings/{id}", "required": ["id"], "queryKeys": [], "bodyKeys": ["status", "opening_id", "custom_fields", "close_reason_id", "target_start_on"], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_UPDATE_OPENING"},
  "users.update": {"method": "PATCH", "path": "/users/{id}", "required": ["id"], "queryKeys": [], "bodyKeys": ["last_name", "first_name", "office_ids", "employee_id", "custom_fields", "department_ids", "external_office_ids", "external_department_ids"], "listKey": null, "emptyOk": false, "slug": "GREENHOUSE_UPDATE_USER"},
};

export const G3_OPERATION_KEYS = Object.keys(G3_SPECS) as string[];

function authClientOpts(input: GreenhouseAuthInput, operation: string) {
  return {
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    userId: input.userId,
    fetch: input.fetch,
    operation,
  };
}

function toSnake(key: string): string {
  if (key.includes("_")) return key;
  return key.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`);
}

function toCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, ch: string) => ch.toUpperCase());
}

function pick(input: Record<string, unknown>, name: string): unknown {
  if (input[name] !== undefined) return input[name];
  const camel = toCamel(name);
  if (input[camel] !== undefined) return input[camel];
  const snake = toSnake(name);
  if (input[snake] !== undefined) return input[snake];
  return undefined;
}

function present(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function formatQueryValue(value: unknown): string | undefined {
  if (!present(value)) return undefined;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const parts = value.map((item) => String(item)).filter((s) => s.length > 0);
    return parts.length > 0 ? parts.join(",") : undefined;
  }
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    for (const op of ["gte", "lte", "gt", "lt"]) {
      if (present(rec[op])) return `${op}|${String(rec[op])}`;
    }
  }
  return undefined;
}

function buildQuery(params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") qs.set(key, value);
  }
  const encoded = qs.toString();
  return encoded.length > 0 ? `?${encoded}` : "";
}

function asPathId(value: unknown, field: string): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  if (typeof value === "string" && value.length > 0) return assertSafePathSegment(value, field);
  throw new Error(`${field} is required`);
}

function interpolatePath(template: string, input: Record<string, unknown>): string {
  return template.replace(/\{([a-z0-9_]+)\}/g, (_, name: string) => {
    const raw = pick(input, name);
    return asPathId(raw, name);
  });
}

function extraHeaders(input: Record<string, unknown>): Record<string, string> | undefined {
  const raw = pick(input, "on_behalf_of");
  if (!present(raw)) return undefined;
  return { "On-Behalf-Of": String(raw) };
}

function requireFields(input: Record<string, unknown>, names: string[]): void {
  for (const name of names) {
    if (!present(pick(input, name))) throw new Error(`${toCamel(name)} is required`);
  }
}

function buildBody(input: Record<string, unknown>, bodyKeys: string[], path: string): Record<string, unknown> | undefined {
  const pathKeys = new Set(
    Array.from(path.matchAll(/\{([a-z0-9_]+)\}/g), (m) => m[1]),
  );
  const body: Record<string, unknown> = {};
  const keys = bodyKeys.length > 0 ? bodyKeys : Object.keys(input);
  for (const key of keys) {
    if (AUTH_KEYS.has(key) || pathKeys.has(key) || pathKeys.has(toSnake(key))) continue;
    const value = pick(input, key);
    if (!present(value) && value !== false && value !== 0) continue;
    body[toSnake(key)] = value;
  }
  // Pass through leftover snake_case fields not listed (nested objects from Composio).
  for (const [key, value] of Object.entries(input)) {
    if (AUTH_KEYS.has(key)) continue;
    if (pathKeys.has(key) || pathKeys.has(toSnake(key))) continue;
    if (key in body || toSnake(key) in body) continue;
    if (!present(value) && value !== false && value !== 0) continue;
    if (key === "perPage" || key === "per_page" || key === "cursor") continue;
    body[toSnake(key)] = value;
  }
  return Object.keys(body).length > 0 ? body : undefined;
}

function listMeta(body: unknown, nextCursor: string | null, listKey: string) {
  return { [listKey]: Array.isArray(body) ? body : body == null ? [] : [body], nextCursor };
}

async function executeUsersMe(input: GreenhouseAuthInput): Promise<Record<string, unknown>> {
  const client = createAuthClient(authClientOpts(input, "users.me"));
  const introspect = await client.introspectToken();
  const sub = introspect.sub;
  const userId =
    typeof sub === "number" && Number.isFinite(sub)
      ? String(Math.trunc(sub))
      : typeof sub === "string" && sub.length > 0
        ? sub
        : typeof input.userId === "string" && input.userId.length > 0
          ? input.userId
          : undefined;
  if (!userId) {
    return { user: null, introspect };
  }
  const safeId = assertSafePathSegment(userId, "sub");
  const listed = await client.getJSON(`/users?ids=${encodeURIComponent(safeId)}`);
  const users = Array.isArray(listed) ? listed : listed == null ? [] : [listed];
  return { user: users[0] ?? null, users, introspect };
}

export async function executeGreenhouseG3Action(
  operation: string,
  input: GreenhouseAuthInput & Record<string, unknown>,
): Promise<unknown> {
  if (operation === "users.me") return executeUsersMe(input);
  const spec = G3_SPECS[operation];
  if (!spec) throw new Error(`Unknown greenhouse G3 operation: ${operation}`);
  requireFields(input, spec.required);
  const path = interpolatePath(spec.path, input);
  const headers = extraHeaders(input);
  const client = createAuthClient(authClientOpts(input, operation));

  if (spec.method === "GET") {
    const query: Record<string, string | undefined> = {};
    const keys = spec.queryKeys.length > 0 ? spec.queryKeys : [];
    for (const key of keys) {
      query[key] = formatQueryValue(pick(input, key));
    }
    // camelCase pagination aliases
    if (query.per_page == null) query.per_page = formatQueryValue(pick(input, "per_page"));
    if (query.cursor == null) query.cursor = formatQueryValue(pick(input, "cursor"));
    const { body, nextCursor } = await client.getJSONWithMeta(path + buildQuery(query));
    if (spec.listKey) return listMeta(body, nextCursor, spec.listKey);
    return body ?? { ok: true as const };
  }

  const body = buildBody(input, spec.bodyKeys, spec.path);
  const raw = await client.requestJSON(spec.method, path, { body, extraHeaders: headers });
  if (raw === undefined) return spec.emptyOk ? { ok: true as const } : { ok: true as const };
  return raw;
}

export function createGreenhouseG3ActionHandlers(): Record<
  string,
  (input: GreenhouseAuthInput & Record<string, unknown>) => Promise<unknown>
> {
  const handlers: Record<string, (input: GreenhouseAuthInput & Record<string, unknown>) => Promise<unknown>> =
    {};
  for (const key of G3_OPERATION_KEYS) {
    handlers[key] = (input) => executeGreenhouseG3Action(key, input);
  }
  return handlers;
}
