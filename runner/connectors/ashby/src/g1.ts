/**
 * Ashby G1 — 15 agent-tool ops (notes, tags, source/transfer/update, history,
 * feedback, hiring team, users.get). All POST RPC against api.ashbyhq.com.
 * Auth/client: tip createAuthClient (HTTP Basic apiKey:).
 *
 * Effect keys (self-lock /workspace/parity-briefs/ashby-g1-selflock.md):
 * - applications.transfer → Reconcile → applications.get (job/stage exposed)
 * - all other creates/deletes/one-shots omit effectPolicy/reconcile/observe
 * - candidates.add_tag / applications.change_source / applications.update omit
 *   because tip observes do not expose tags / source / creditedToUser
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

function listPaging(input: { limit?: number; cursor?: string; syncToken?: string }) {
  return compactBody({
    limit: input.limit,
    cursor: input.cursor,
    syncToken: input.syncToken,
  });
}

function asResults(raw: unknown): unknown {
  if (raw != null && typeof raw === "object" && !Array.isArray(raw)) {
    return (raw as { results?: unknown }).results ?? null;
  }
  return null;
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

// ---------------------------------------------------------------------------
// 1. candidates.create_note — POST /candidate.createNote
// ---------------------------------------------------------------------------

export interface ExecuteCandidatesCreateNoteInput extends AshbyAuthInput {
  candidateId: string;
  /** Plain string or Ashby { type, value } note object. */
  note: string | { type?: string; value?: string };
  sendNotifications?: boolean;
  isPrivate?: boolean;
  createdAt?: string;
}

export async function executeCandidatesCreateNote(input: ExecuteCandidatesCreateNoteInput) {
  const candidateId = requireNonEmptyString(input.candidateId, "candidateId");
  if (input.note == null || (typeof input.note === "string" && input.note.length === 0)) {
    throw new Error("note is required");
  }
  const client = authClient(input, "candidates.create_note");
  const raw = await client.postJSON(
    "/candidate.createNote",
    compactBody({
      candidateId,
      note: input.note,
      sendNotifications: input.sendNotifications,
      isPrivate: input.isPrivate,
      createdAt: input.createdAt,
    }),
  );
  return { note: asResults(raw) };
}

// ---------------------------------------------------------------------------
// 2. candidates.list_notes — POST /candidate.listNotes
// ---------------------------------------------------------------------------

export interface ExecuteCandidatesListNotesInput extends AshbyAuthInput {
  candidateId: string;
  limit?: number;
  cursor?: string;
  syncToken?: string;
}

export async function executeCandidatesListNotes(input: ExecuteCandidatesListNotesInput) {
  const candidateId = requireNonEmptyString(input.candidateId, "candidateId");
  const client = authClient(input, "candidates.list_notes");
  const raw = await client.postJSON(
    "/candidate.listNotes",
    compactBody({ candidateId, ...listPaging(input) }),
  );
  const results = asResults(raw);
  return {
    notes: Array.isArray(results) ? results : [],
    ...pageMeta(raw),
  };
}

// ---------------------------------------------------------------------------
// 3. candidates.add_tag — POST /candidate.addTag (omit effects; tip get has no tags)
// ---------------------------------------------------------------------------

export interface ExecuteCandidatesAddTagInput extends AshbyAuthInput {
  candidateId: string;
  tagId: string;
}

export async function executeCandidatesAddTag(input: ExecuteCandidatesAddTagInput) {
  const candidateId = requireNonEmptyString(input.candidateId, "candidateId");
  const tagId = requireNonEmptyString(input.tagId, "tagId");
  const client = authClient(input, "candidates.add_tag");
  const raw = await client.postJSON("/candidate.addTag", { candidateId, tagId });
  return { candidate: asResults(raw) };
}

// ---------------------------------------------------------------------------
// 4. candidate_tags.list — POST /candidateTag.list
// ---------------------------------------------------------------------------

export interface ExecuteCandidateTagsListInput extends AshbyAuthInput {
  includeArchived?: boolean;
  limit?: number;
  cursor?: string;
  syncToken?: string;
}

export async function executeCandidateTagsList(input: ExecuteCandidateTagsListInput) {
  const client = authClient(input, "candidate_tags.list");
  const raw = await client.postJSON(
    "/candidateTag.list",
    compactBody({
      includeArchived: input.includeArchived,
      ...listPaging(input),
    }),
  );
  const results = asResults(raw);
  return {
    tags: Array.isArray(results) ? results : [],
    ...pageMeta(raw),
  };
}

// ---------------------------------------------------------------------------
// 5. candidate_tags.create — POST /candidateTag.create
// ---------------------------------------------------------------------------

export interface ExecuteCandidateTagsCreateInput extends AshbyAuthInput {
  title: string;
}

export async function executeCandidateTagsCreate(input: ExecuteCandidateTagsCreateInput) {
  const title = requireNonEmptyString(input.title, "title");
  const client = authClient(input, "candidate_tags.create");
  const raw = await client.postJSON("/candidateTag.create", { title });
  return { tag: asResults(raw) };
}

// ---------------------------------------------------------------------------
// 6. applications.change_source — POST /application.changeSource (omit; no source on tip get)
// ---------------------------------------------------------------------------

export interface ExecuteApplicationsChangeSourceInput extends AshbyAuthInput {
  applicationId: string;
  sourceId: string;
}

export async function executeApplicationsChangeSource(input: ExecuteApplicationsChangeSourceInput) {
  const applicationId = requireNonEmptyString(input.applicationId, "applicationId");
  const sourceId = requireNonEmptyString(input.sourceId, "sourceId");
  const client = authClient(input, "applications.change_source");
  const raw = await client.postJSON("/application.changeSource", { applicationId, sourceId });
  return { application: asResults(raw) };
}

// ---------------------------------------------------------------------------
// 7. applications.transfer — POST /application.transfer
//    EffectPolicy Reconcile → applications.get (jobId/stageId exposed on tip observe)
// ---------------------------------------------------------------------------

export interface ExecuteApplicationsTransferInput extends AshbyAuthInput {
  applicationId: string;
  jobId: string;
  interviewPlanId: string;
  interviewStageId: string;
  startAutomaticActivities?: boolean;
}

export async function executeApplicationsTransfer(input: ExecuteApplicationsTransferInput) {
  const applicationId = requireNonEmptyString(input.applicationId, "applicationId");
  const jobId = requireNonEmptyString(input.jobId, "jobId");
  const interviewPlanId = requireNonEmptyString(input.interviewPlanId, "interviewPlanId");
  const interviewStageId = requireNonEmptyString(input.interviewStageId, "interviewStageId");
  const client = authClient(input, "applications.transfer");
  await client.postJSON(
    "/application.transfer",
    compactBody({
      applicationId,
      jobId,
      interviewPlanId,
      interviewStageId,
      startAutomaticActivities: input.startAutomaticActivities,
    }),
  );
  // Runner owns EffectPolicy Reconcile → applications.get.
  return { application: null };
}

// ---------------------------------------------------------------------------
// 8. applications.update — POST /application.update (omit; tip get lacks source/creditedTo)
// ---------------------------------------------------------------------------

export interface ExecuteApplicationsUpdateInput extends AshbyAuthInput {
  applicationId: string;
  sourceId?: string;
  creditedToUserId?: string;
  createdAt?: string;
  sendNotifications?: boolean;
}

export async function executeApplicationsUpdate(input: ExecuteApplicationsUpdateInput) {
  const applicationId = requireNonEmptyString(input.applicationId, "applicationId");
  const client = authClient(input, "applications.update");
  const raw = await client.postJSON(
    "/application.update",
    compactBody({
      applicationId,
      sourceId: input.sourceId,
      creditedToUserId: input.creditedToUserId,
      createdAt: input.createdAt,
      sendNotifications: input.sendNotifications,
    }),
  );
  return { application: asResults(raw) };
}

// ---------------------------------------------------------------------------
// 9. applications.list_history — POST /application.listHistory
// ---------------------------------------------------------------------------

export interface ExecuteApplicationsListHistoryInput extends AshbyAuthInput {
  applicationId: string;
  limit?: number;
  cursor?: string;
}

export async function executeApplicationsListHistory(input: ExecuteApplicationsListHistoryInput) {
  const applicationId = requireNonEmptyString(input.applicationId, "applicationId");
  const client = authClient(input, "applications.list_history");
  const raw = await client.postJSON(
    "/application.listHistory",
    compactBody({
      applicationId,
      limit: input.limit,
      cursor: input.cursor,
    }),
  );
  const results = asResults(raw);
  return {
    history: Array.isArray(results) ? results : [],
    ...pageMeta(raw),
  };
}

// ---------------------------------------------------------------------------
// 10. application_feedback.list — POST /applicationFeedback.list
// ---------------------------------------------------------------------------

export interface ExecuteApplicationFeedbackListInput extends AshbyAuthInput {
  applicationId?: string;
  createdAfter?: string;
  limit?: number;
  cursor?: string;
  syncToken?: string;
}

export async function executeApplicationFeedbackList(input: ExecuteApplicationFeedbackListInput) {
  const client = authClient(input, "application_feedback.list");
  const raw = await client.postJSON(
    "/applicationFeedback.list",
    compactBody({
      applicationId: input.applicationId,
      createdAfter: input.createdAfter,
      ...listPaging(input),
    }),
  );
  const results = asResults(raw);
  return {
    feedback: Array.isArray(results) ? results : [],
    ...pageMeta(raw),
  };
}

// ---------------------------------------------------------------------------
// 11. application_feedback.submit — POST /applicationFeedback.submit
// ---------------------------------------------------------------------------

export interface ExecuteApplicationFeedbackSubmitInput extends AshbyAuthInput {
  applicationId: string;
  formDefinitionId: string;
  /** Map of form field path → submitted value. */
  feedbackForm: Record<string, unknown>;
  userId?: string;
  interviewEventId?: string;
}

export async function executeApplicationFeedbackSubmit(
  input: ExecuteApplicationFeedbackSubmitInput,
) {
  const applicationId = requireNonEmptyString(input.applicationId, "applicationId");
  const formDefinitionId = requireNonEmptyString(input.formDefinitionId, "formDefinitionId");
  if (input.feedbackForm == null || typeof input.feedbackForm !== "object" || Array.isArray(input.feedbackForm)) {
    throw new Error("feedbackForm is required");
  }
  const client = authClient(input, "application_feedback.submit");
  const raw = await client.postJSON(
    "/applicationFeedback.submit",
    compactBody({
      applicationId,
      formDefinitionId,
      feedbackForm: input.feedbackForm,
      userId: input.userId,
      interviewEventId: input.interviewEventId,
    }),
  );
  return { feedback: asResults(raw) };
}

// ---------------------------------------------------------------------------
// 12–13. hiring_team.add_member / remove_member
// ---------------------------------------------------------------------------

export interface ExecuteHiringTeamMemberInput extends AshbyAuthInput {
  teamMemberId: string;
  roleId: string;
  applicationId?: string;
  jobId?: string;
  openingId?: string;
}

function requireHiringTeamTarget(input: ExecuteHiringTeamMemberInput): Record<string, string> {
  const teamMemberId = requireNonEmptyString(input.teamMemberId, "teamMemberId");
  const roleId = requireNonEmptyString(input.roleId, "roleId");
  const targets = compactBody({
    applicationId: input.applicationId,
    jobId: input.jobId,
    openingId: input.openingId,
  });
  if (Object.keys(targets).length !== 1) {
    throw new Error("exactly one of applicationId, jobId, or openingId is required");
  }
  return { teamMemberId, roleId, ...(targets as Record<string, string>) };
}

export async function executeHiringTeamAddMember(input: ExecuteHiringTeamMemberInput) {
  const body = requireHiringTeamTarget(input);
  const client = authClient(input, "hiring_team.add_member");
  const raw = await client.postJSON("/hiringTeam.addMember", body);
  return { members: asResults(raw) };
}

export async function executeHiringTeamRemoveMember(input: ExecuteHiringTeamMemberInput) {
  const body = requireHiringTeamTarget(input);
  const client = authClient(input, "hiring_team.remove_member");
  const raw = await client.postJSON("/hiringTeam.removeMember", body);
  return { members: asResults(raw) };
}

// ---------------------------------------------------------------------------
// 14. hiring_team_roles.list — POST /hiringTeamRole.list
// ---------------------------------------------------------------------------

export interface ExecuteHiringTeamRolesListInput extends AshbyAuthInput {
  /** Required by Ashby schema. When true, results are role name strings. */
  namesOnly: boolean;
}

export async function executeHiringTeamRolesList(input: ExecuteHiringTeamRolesListInput) {
  if (typeof input.namesOnly !== "boolean") {
    throw new Error("namesOnly is required");
  }
  const client = authClient(input, "hiring_team_roles.list");
  const raw = await client.postJSON("/hiringTeamRole.list", { namesOnly: input.namesOnly });
  const results = asResults(raw);
  return { roles: Array.isArray(results) ? results : [] };
}

// ---------------------------------------------------------------------------
// 15. users.get — POST /user.info
// ---------------------------------------------------------------------------

export interface ExecuteUsersGetInput extends AshbyAuthInput {
  userId: string;
}

export async function executeUsersGet(input: ExecuteUsersGetInput) {
  const userId = requireNonEmptyString(input.userId, "userId");
  const client = authClient(input, "users.get");
  const raw = await client.postJSON("/user.info", { userId });
  return { user: asResults(raw) };
}
