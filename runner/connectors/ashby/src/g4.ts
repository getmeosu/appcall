/**
 * Ashby G4 — 15 agent-tool ops (interview/stage/event/plan lookups,
 * feedback form definitions, custom fields list/get/set, referrals,
 * referral form, file URL, application criteria evaluations).
 * All POST RPC against api.ashbyhq.com. Auth: tip createAuthClient.
 *
 * Effect keys (/workspace/parity-briefs/ashby-g4-selflock.md):
 * - referrals.create omit (creates always omit)
 * - custom_fields.set_value / set_values omit (no dedicated observe)
 * - reads omit
 * - no Idempotent; no Reconcile in this card
 */
import { createAuthClient } from "./http";

export interface AshbyAuthInput {
  apiKey: string;
  fetch?: typeof fetch;
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value === "string" && value.length > 0) return value;
  throw new Error(`${field} is required`);
}

function compactBody(params: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    body[key] = value;
  }
  return body;
}

function asResults(raw: unknown): unknown {
  if (raw != null && typeof raw === "object" && !Array.isArray(raw)) {
    return (raw as { results?: unknown }).results ?? null;
  }
  return null;
}

function resultsObject(raw: unknown, operation: string): Record<string, unknown> {
  const results = asResults(raw);
  if (results != null && typeof results === "object" && !Array.isArray(results)) {
    return results as Record<string, unknown>;
  }
  throw new Error(`Ashby ${operation} response missing results object`);
}

function pageMeta(raw: unknown) {
  const data = (raw ?? {}) as {
    moreDataAvailable?: boolean;
    nextCursor?: string | null;
    syncToken?: string | null;
  };
  return {
    moreDataAvailable: data.moreDataAvailable === true,
    nextCursor: typeof data.nextCursor === "string" ? data.nextCursor : null,
    syncToken: typeof data.syncToken === "string" ? data.syncToken : null,
  };
}

function authClient(input: AshbyAuthInput, operation: string) {
  return createAuthClient({
    apiKey: input.apiKey,
    fetch: input.fetch,
    operation,
  });
}

function optionalNonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

// ---------------------------------------------------------------------------
// 1. interviews.get — POST /interview.info
// ---------------------------------------------------------------------------

export interface ExecuteInterviewsGetInput extends AshbyAuthInput {
  id: string;
}

export async function executeInterviewsGet(input: ExecuteInterviewsGetInput) {
  const id = requireNonEmptyString(input.id, "id");
  const client = authClient(input, "interviews.get");
  const raw = await client.postJSON("/interview.info", { id });
  return { interview: asResults(raw) };
}

// ---------------------------------------------------------------------------
// 2. interview_stages.get — POST /interviewStage.info
// ---------------------------------------------------------------------------

export interface ExecuteInterviewStagesGetInput extends AshbyAuthInput {
  interviewStageId: string;
}

export async function executeInterviewStagesGet(input: ExecuteInterviewStagesGetInput) {
  const interviewStageId = requireNonEmptyString(input.interviewStageId, "interviewStageId");
  const client = authClient(input, "interview_stages.get");
  const raw = await client.postJSON("/interviewStage.info", { interviewStageId });
  return { interviewStage: asResults(raw) };
}

// ---------------------------------------------------------------------------
// 3. interview_events.list — POST /interviewEvent.list
// ---------------------------------------------------------------------------

export interface ExecuteInterviewEventsListInput extends AshbyAuthInput {
  interviewScheduleId: string;
  expand?: string[];
  createdAfter?: string;
  limit?: number;
  cursor?: string;
  syncToken?: string;
}

export async function executeInterviewEventsList(input: ExecuteInterviewEventsListInput) {
  const interviewScheduleId = requireNonEmptyString(
    input.interviewScheduleId,
    "interviewScheduleId",
  );
  const client = authClient(input, "interview_events.list");
  const raw = await client.postJSON(
    "/interviewEvent.list",
    compactBody({
      interviewScheduleId,
      expand: input.expand,
      createdAfter: input.createdAfter,
      limit: input.limit,
      cursor: input.cursor,
      syncToken: input.syncToken,
    }),
  );
  const results = asResults(raw);
  return {
    interviewEvents: Array.isArray(results) ? results : [],
    ...pageMeta(raw),
  };
}

// ---------------------------------------------------------------------------
// 4. interview_plans.list — POST /interviewPlan.list
// ---------------------------------------------------------------------------

export interface ExecuteInterviewPlansListInput extends AshbyAuthInput {
  includeArchived?: boolean;
  limit?: number;
  cursor?: string;
  syncToken?: string;
}

export async function executeInterviewPlansList(input: ExecuteInterviewPlansListInput) {
  const client = authClient(input, "interview_plans.list");
  const raw = await client.postJSON(
    "/interviewPlan.list",
    compactBody({
      includeArchived: input.includeArchived,
      limit: input.limit,
      cursor: input.cursor,
      syncToken: input.syncToken,
    }),
  );
  const results = asResults(raw);
  return {
    interviewPlans: Array.isArray(results) ? results : [],
    ...pageMeta(raw),
  };
}

// ---------------------------------------------------------------------------
// 5. interview_stage_groups.list — POST /interviewStageGroup.list
// ---------------------------------------------------------------------------

export type ExecuteInterviewStageGroupsListInput = AshbyAuthInput;

export async function executeInterviewStageGroupsList(
  input: ExecuteInterviewStageGroupsListInput,
) {
  const client = authClient(input, "interview_stage_groups.list");
  const raw = await client.postJSON("/interviewStageGroup.list", {});
  const results = asResults(raw);
  return { interviewStageGroups: Array.isArray(results) ? results : [] };
}

// ---------------------------------------------------------------------------
// 6. feedback_form_definitions.list — POST /feedbackFormDefinition.list
// ---------------------------------------------------------------------------

export interface ExecuteFeedbackFormDefinitionsListInput extends AshbyAuthInput {
  includeArchived?: boolean;
  limit?: number;
  cursor?: string;
  syncToken?: string;
}

export async function executeFeedbackFormDefinitionsList(
  input: ExecuteFeedbackFormDefinitionsListInput,
) {
  const client = authClient(input, "feedback_form_definitions.list");
  const raw = await client.postJSON(
    "/feedbackFormDefinition.list",
    compactBody({
      includeArchived: input.includeArchived,
      limit: input.limit,
      cursor: input.cursor,
      syncToken: input.syncToken,
    }),
  );
  const results = asResults(raw);
  return {
    feedbackFormDefinitions: Array.isArray(results) ? results : [],
    ...pageMeta(raw),
  };
}

// ---------------------------------------------------------------------------
// 7. feedback_form_definitions.get — POST /feedbackFormDefinition.info
// ---------------------------------------------------------------------------

export interface ExecuteFeedbackFormDefinitionsGetInput extends AshbyAuthInput {
  feedbackFormDefinitionId: string;
}

export async function executeFeedbackFormDefinitionsGet(
  input: ExecuteFeedbackFormDefinitionsGetInput,
) {
  const feedbackFormDefinitionId = requireNonEmptyString(
    input.feedbackFormDefinitionId,
    "feedbackFormDefinitionId",
  );
  const client = authClient(input, "feedback_form_definitions.get");
  const raw = await client.postJSON("/feedbackFormDefinition.info", {
    feedbackFormDefinitionId,
  });
  return { feedbackFormDefinition: asResults(raw) };
}

// ---------------------------------------------------------------------------
// 8. custom_fields.list — POST /customField.list
// ---------------------------------------------------------------------------

export interface ExecuteCustomFieldsListInput extends AshbyAuthInput {
  includeArchived?: boolean;
  limit?: number;
  cursor?: string;
  syncToken?: string;
}

export async function executeCustomFieldsList(input: ExecuteCustomFieldsListInput) {
  const client = authClient(input, "custom_fields.list");
  const raw = await client.postJSON(
    "/customField.list",
    compactBody({
      includeArchived: input.includeArchived,
      limit: input.limit,
      cursor: input.cursor,
      syncToken: input.syncToken,
    }),
  );
  const results = asResults(raw);
  return {
    customFields: Array.isArray(results) ? results : [],
    ...pageMeta(raw),
  };
}

// ---------------------------------------------------------------------------
// 9. custom_fields.get — POST /customField.info
// ---------------------------------------------------------------------------

export interface ExecuteCustomFieldsGetInput extends AshbyAuthInput {
  customFieldId?: string;
  referenceIdentifier?: string;
}

export async function executeCustomFieldsGet(input: ExecuteCustomFieldsGetInput) {
  const customFieldId = optionalNonEmpty(input.customFieldId);
  const referenceIdentifier = optionalNonEmpty(input.referenceIdentifier);
  if (!customFieldId && !referenceIdentifier) {
    throw new Error("customFieldId or referenceIdentifier is required");
  }
  const client = authClient(input, "custom_fields.get");
  const raw = await client.postJSON(
    "/customField.info",
    compactBody({ customFieldId, referenceIdentifier }),
  );
  return { customField: asResults(raw) };
}

// ---------------------------------------------------------------------------
// 10. custom_fields.set_value — POST /customField.setValue · omit
// ---------------------------------------------------------------------------

export const CUSTOM_FIELD_OBJECT_TYPES = [
  "Application",
  "Candidate",
  "Job",
  "Opening",
] as const;

export interface ExecuteCustomFieldsSetValueInput extends AshbyAuthInput {
  objectId: string;
  objectType: (typeof CUSTOM_FIELD_OBJECT_TYPES)[number];
  /** Pass null to clear the custom field. */
  fieldValue: unknown;
  fieldId?: string;
  referenceIdentifier?: string;
}

export async function executeCustomFieldsSetValue(input: ExecuteCustomFieldsSetValueInput) {
  const objectId = requireNonEmptyString(input.objectId, "objectId");
  const objectType = requireNonEmptyString(input.objectType, "objectType");
  if (!(CUSTOM_FIELD_OBJECT_TYPES as readonly string[]).includes(objectType)) {
    throw new Error(`objectType must be one of ${CUSTOM_FIELD_OBJECT_TYPES.join(", ")}`);
  }
  const fieldId = optionalNonEmpty(input.fieldId);
  const referenceIdentifier = optionalNonEmpty(input.referenceIdentifier);
  if (!fieldId && !referenceIdentifier) {
    throw new Error("fieldId or referenceIdentifier is required");
  }
  if (!("fieldValue" in input)) {
    throw new Error("fieldValue is required");
  }
  // fieldValue may be null (clear); do not drop it via compactBody.
  const body: Record<string, unknown> = {
    objectId,
    objectType,
    fieldValue: input.fieldValue,
  };
  if (fieldId) body.fieldId = fieldId;
  if (referenceIdentifier) body.referenceIdentifier = referenceIdentifier;
  const client = authClient(input, "custom_fields.set_value");
  const raw = await client.postJSON("/customField.setValue", body);
  return resultsObject(raw, "custom_fields.set_value");
}

// ---------------------------------------------------------------------------
// 11. custom_fields.set_values — POST /customField.setValues · omit
// ---------------------------------------------------------------------------

export interface ExecuteCustomFieldsSetValuesInput extends AshbyAuthInput {
  objectId: string;
  objectType: (typeof CUSTOM_FIELD_OBJECT_TYPES)[number];
  values: unknown[];
}

export async function executeCustomFieldsSetValues(input: ExecuteCustomFieldsSetValuesInput) {
  const objectId = requireNonEmptyString(input.objectId, "objectId");
  const objectType = requireNonEmptyString(input.objectType, "objectType");
  if (!(CUSTOM_FIELD_OBJECT_TYPES as readonly string[]).includes(objectType)) {
    throw new Error(`objectType must be one of ${CUSTOM_FIELD_OBJECT_TYPES.join(", ")}`);
  }
  if (!Array.isArray(input.values) || input.values.length === 0) {
    throw new Error("values is required");
  }
  const client = authClient(input, "custom_fields.set_values");
  const raw = await client.postJSON("/customField.setValues", {
    objectId,
    objectType,
    values: input.values,
  });
  const results = asResults(raw);
  return { values: Array.isArray(results) ? results : [] };
}

// ---------------------------------------------------------------------------
// 12. referrals.create — POST /referral.create · omit (create)
// ---------------------------------------------------------------------------

export interface ReferralFieldSubmission {
  path: string;
  value: unknown;
}

export interface ExecuteReferralsCreateInput extends AshbyAuthInput {
  /** Referral form definition id. */
  id: string;
  creditedToUserId: string;
  fieldSubmissions: ReferralFieldSubmission[];
  createdAt?: string;
}

export async function executeReferralsCreate(input: ExecuteReferralsCreateInput) {
  const id = requireNonEmptyString(input.id, "id");
  const creditedToUserId = requireNonEmptyString(input.creditedToUserId, "creditedToUserId");
  if (!Array.isArray(input.fieldSubmissions) || input.fieldSubmissions.length === 0) {
    throw new Error("fieldSubmissions is required");
  }
  for (const submission of input.fieldSubmissions) {
    const path = (submission as { path?: unknown } | null)?.path;
    if (typeof path !== "string" || path.length === 0) {
      throw new Error("fieldSubmissions[].path is required");
    }
  }
  const client = authClient(input, "referrals.create");
  const raw = await client.postJSON(
    "/referral.create",
    compactBody({
      id,
      creditedToUserId,
      fieldSubmissions: input.fieldSubmissions,
      createdAt: input.createdAt,
    }),
  );
  return resultsObject(raw, "referrals.create");
}

// ---------------------------------------------------------------------------
// 13. referral_forms.get — POST /referralForm.info
// Docs: may create the default form on first call; sideEffect write (can create).
// ---------------------------------------------------------------------------

export type ExecuteReferralFormsGetInput = AshbyAuthInput;

export async function executeReferralFormsGet(input: ExecuteReferralFormsGetInput) {
  const client = authClient(input, "referral_forms.get");
  const raw = await client.postJSON("/referralForm.info", {});
  return { referralForm: asResults(raw) };
}

// ---------------------------------------------------------------------------
// 14. files.get — POST /file.info (signed URL; no binary transport)
// ---------------------------------------------------------------------------

export interface ExecuteFilesGetInput extends AshbyAuthInput {
  fileHandle: string;
}

export async function executeFilesGet(input: ExecuteFilesGetInput) {
  const fileHandle = requireNonEmptyString(input.fileHandle, "fileHandle");
  const client = authClient(input, "files.get");
  const raw = await client.postJSON("/file.info", { fileHandle });
  return { file: asResults(raw) };
}

// ---------------------------------------------------------------------------
// 15. applications.list_criteria_evaluations — POST /application.listCriteriaEvaluations
// ---------------------------------------------------------------------------

export interface ExecuteApplicationsListCriteriaEvaluationsInput extends AshbyAuthInput {
  applicationId: string;
  limit?: number;
  cursor?: string;
}

export async function executeApplicationsListCriteriaEvaluations(
  input: ExecuteApplicationsListCriteriaEvaluationsInput,
) {
  const applicationId = requireNonEmptyString(input.applicationId, "applicationId");
  const client = authClient(input, "applications.list_criteria_evaluations");
  const raw = await client.postJSON(
    "/application.listCriteriaEvaluations",
    compactBody({
      applicationId,
      limit: input.limit,
      cursor: input.cursor,
    }),
  );
  const results = asResults(raw);
  return {
    criteriaEvaluations: Array.isArray(results) ? results : [],
    ...pageMeta(raw),
  };
}
