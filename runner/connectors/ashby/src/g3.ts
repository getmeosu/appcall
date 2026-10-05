/**
 * Ashby G3 — 15 agent-tool ops (opening archive/state/job/location writes,
 * locations/departments/users lookups, offer create/start, offer process
 * start, communication templates, application hiring team roles).
 * All POST RPC against api.ashbyhq.com. Auth: tip createAuthClient.
 *
 * Effect keys (/workspace/parity-briefs/ashby-g3-selflock.md):
 * - openings.set_archived / set_state / add_job / remove_job / add_location /
 *   remove_location Reconcile → openings.get (raw opening.info exposes
 *   isArchived, openingState, latestVersion.jobIds / locationIds)
 * - offers.create, offers.start, offer_processes.start omit (creates always
 *   omit; a retry after a lost response would create a second record)
 * - reads omit
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

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value === "boolean") return value;
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

// ---------------------------------------------------------------------------
// 1. openings.set_archived — POST /opening.setArchived · Reconcile → openings.get
// ---------------------------------------------------------------------------

export interface ExecuteOpeningsSetArchivedInput extends AshbyAuthInput {
  openingId: string;
  archive: boolean;
}

export async function executeOpeningsSetArchived(input: ExecuteOpeningsSetArchivedInput) {
  const openingId = requireNonEmptyString(input.openingId, "openingId");
  const archive = requireBoolean(input.archive, "archive");
  const client = authClient(input, "openings.set_archived");
  await client.postJSON("/opening.setArchived", { openingId, archive });
  return { opening: null };
}

// ---------------------------------------------------------------------------
// 2. openings.set_state — POST /opening.setOpeningState · Reconcile → openings.get
// ---------------------------------------------------------------------------

export const OPENING_STATES = ["Draft", "Approved", "Open", "Closed"] as const;

export interface ExecuteOpeningsSetStateInput extends AshbyAuthInput {
  openingId: string;
  openingState: (typeof OPENING_STATES)[number];
  closeReasonId?: string;
}

export async function executeOpeningsSetState(input: ExecuteOpeningsSetStateInput) {
  const openingId = requireNonEmptyString(input.openingId, "openingId");
  const openingState = requireNonEmptyString(input.openingState, "openingState");
  if (!(OPENING_STATES as readonly string[]).includes(openingState)) {
    throw new Error(`openingState must be one of ${OPENING_STATES.join(", ")}`);
  }
  const client = authClient(input, "openings.set_state");
  await client.postJSON(
    "/opening.setOpeningState",
    compactBody({ openingId, openingState, closeReasonId: input.closeReasonId }),
  );
  return { opening: null };
}

// ---------------------------------------------------------------------------
// 3–4. openings.add_job / openings.remove_job — Reconcile → openings.get
// ---------------------------------------------------------------------------

export interface ExecuteOpeningsJobInput extends AshbyAuthInput {
  openingId: string;
  jobId: string;
}

async function postOpeningJob(
  input: ExecuteOpeningsJobInput,
  path: "/opening.addJob" | "/opening.removeJob",
  operation: string,
) {
  const openingId = requireNonEmptyString(input.openingId, "openingId");
  const jobId = requireNonEmptyString(input.jobId, "jobId");
  const client = authClient(input, operation);
  await client.postJSON(path, { openingId, jobId });
  return { opening: null };
}

export async function executeOpeningsAddJob(input: ExecuteOpeningsJobInput) {
  return postOpeningJob(input, "/opening.addJob", "openings.add_job");
}

export async function executeOpeningsRemoveJob(input: ExecuteOpeningsJobInput) {
  return postOpeningJob(input, "/opening.removeJob", "openings.remove_job");
}

// ---------------------------------------------------------------------------
// 5–6. openings.add_location / openings.remove_location — Reconcile → openings.get
// ---------------------------------------------------------------------------

export interface ExecuteOpeningsLocationInput extends AshbyAuthInput {
  openingId: string;
  locationId: string;
}

async function postOpeningLocation(
  input: ExecuteOpeningsLocationInput,
  path: "/opening.addLocation" | "/opening.removeLocation",
  operation: string,
) {
  const openingId = requireNonEmptyString(input.openingId, "openingId");
  const locationId = requireNonEmptyString(input.locationId, "locationId");
  const client = authClient(input, operation);
  await client.postJSON(path, { openingId, locationId });
  return { opening: null };
}

export async function executeOpeningsAddLocation(input: ExecuteOpeningsLocationInput) {
  return postOpeningLocation(input, "/opening.addLocation", "openings.add_location");
}

export async function executeOpeningsRemoveLocation(input: ExecuteOpeningsLocationInput) {
  return postOpeningLocation(input, "/opening.removeLocation", "openings.remove_location");
}

// ---------------------------------------------------------------------------
// 7. locations.list — POST /location.list
// ---------------------------------------------------------------------------

export interface ExecuteLocationsListInput extends AshbyAuthInput {
  includeArchived?: boolean;
  includeLocationHierarchy?: boolean;
  limit?: number;
  cursor?: string;
  syncToken?: string;
}

export async function executeLocationsList(input: ExecuteLocationsListInput) {
  const client = authClient(input, "locations.list");
  const raw = await client.postJSON(
    "/location.list",
    compactBody({
      includeArchived: input.includeArchived,
      includeLocationHierarchy: input.includeLocationHierarchy,
      limit: input.limit,
      cursor: input.cursor,
      syncToken: input.syncToken,
    }),
  );
  const results = asResults(raw);
  return {
    locations: Array.isArray(results) ? results : [],
    ...pageMeta(raw),
  };
}

// ---------------------------------------------------------------------------
// 8. locations.get — POST /location.info
// ---------------------------------------------------------------------------

export interface ExecuteLocationsGetInput extends AshbyAuthInput {
  locationId: string;
}

export async function executeLocationsGet(input: ExecuteLocationsGetInput) {
  const locationId = requireNonEmptyString(input.locationId, "locationId");
  const client = authClient(input, "locations.get");
  const raw = await client.postJSON("/location.info", { locationId });
  return { location: asResults(raw) };
}

// ---------------------------------------------------------------------------
// 9. departments.get — POST /department.info
// ---------------------------------------------------------------------------

export interface ExecuteDepartmentsGetInput extends AshbyAuthInput {
  departmentId: string;
}

export async function executeDepartmentsGet(input: ExecuteDepartmentsGetInput) {
  const departmentId = requireNonEmptyString(input.departmentId, "departmentId");
  const client = authClient(input, "departments.get");
  const raw = await client.postJSON("/department.info", { departmentId });
  return { department: asResults(raw) };
}

// ---------------------------------------------------------------------------
// 10. users.search — POST /user.search
// ---------------------------------------------------------------------------

export interface ExecuteUsersSearchInput extends AshbyAuthInput {
  email: string;
}

export async function executeUsersSearch(input: ExecuteUsersSearchInput) {
  const email = requireNonEmptyString(input.email, "email");
  const client = authClient(input, "users.search");
  const raw = await client.postJSON("/user.search", { email });
  const results = asResults(raw);
  return { users: Array.isArray(results) ? results : [] };
}

// ---------------------------------------------------------------------------
// 11. offers.create — POST /offer.create · no effect keys (create)
// ---------------------------------------------------------------------------

export interface OfferFieldSubmission {
  path: string;
  value: unknown;
}

export interface ExecuteOffersCreateInput extends AshbyAuthInput {
  offerProcessId: string;
  offerFormId: string;
  offerForm: { fieldSubmissions: OfferFieldSubmission[] };
  excludeFormDefinition?: boolean;
}

export async function executeOffersCreate(input: ExecuteOffersCreateInput) {
  const offerProcessId = requireNonEmptyString(input.offerProcessId, "offerProcessId");
  const offerFormId = requireNonEmptyString(input.offerFormId, "offerFormId");
  const form = input.offerForm as { fieldSubmissions?: unknown } | undefined;
  if (form == null || typeof form !== "object" || !Array.isArray(form.fieldSubmissions)) {
    throw new Error("offerForm.fieldSubmissions is required");
  }
  for (const submission of form.fieldSubmissions) {
    const path = (submission as { path?: unknown } | null)?.path;
    if (typeof path !== "string" || path.length === 0) {
      throw new Error("offerForm.fieldSubmissions[].path is required");
    }
  }
  const client = authClient(input, "offers.create");
  const raw = await client.postJSON(
    "/offer.create",
    compactBody({
      offerProcessId,
      offerFormId,
      offerForm: input.offerForm,
      excludeFormDefinition: input.excludeFormDefinition,
    }),
  );
  return resultsObject(raw, "offers.create");
}

// ---------------------------------------------------------------------------
// 12. offers.start — POST /offer.start · no effect keys (creates offer version)
// ---------------------------------------------------------------------------

export interface ExecuteOffersStartInput extends AshbyAuthInput {
  offerProcessId: string;
}

export async function executeOffersStart(input: ExecuteOffersStartInput) {
  const offerProcessId = requireNonEmptyString(input.offerProcessId, "offerProcessId");
  const client = authClient(input, "offers.start");
  const raw = await client.postJSON("/offer.start", { offerProcessId });
  return resultsObject(raw, "offers.start");
}

// ---------------------------------------------------------------------------
// 13. offer_processes.start — POST /offerProcess.start · no effect keys (create)
// ---------------------------------------------------------------------------

export interface ExecuteOfferProcessesStartInput extends AshbyAuthInput {
  applicationId: string;
}

export async function executeOfferProcessesStart(input: ExecuteOfferProcessesStartInput) {
  const applicationId = requireNonEmptyString(input.applicationId, "applicationId");
  const client = authClient(input, "offer_processes.start");
  const raw = await client.postJSON("/offerProcess.start", { applicationId });
  return resultsObject(raw, "offer_processes.start");
}

// ---------------------------------------------------------------------------
// 14. communication_templates.list — POST /communicationTemplate.list
// ---------------------------------------------------------------------------

export const OWNERSHIP_FILTERS = ["org", "personal", "personalAndOrg"] as const;

export interface ExecuteCommunicationTemplatesListInput extends AshbyAuthInput {
  ownershipFilter?: (typeof OWNERSHIP_FILTERS)[number];
}

export async function executeCommunicationTemplatesList(
  input: ExecuteCommunicationTemplatesListInput,
) {
  if (
    input.ownershipFilter !== undefined &&
    !(OWNERSHIP_FILTERS as readonly string[]).includes(input.ownershipFilter)
  ) {
    throw new Error(`ownershipFilter must be one of ${OWNERSHIP_FILTERS.join(", ")}`);
  }
  const client = authClient(input, "communication_templates.list");
  const raw = await client.postJSON(
    "/communicationTemplate.list",
    compactBody({ ownershipFilter: input.ownershipFilter }),
  );
  const results = asResults(raw);
  return { communicationTemplates: Array.isArray(results) ? results : [] };
}

// ---------------------------------------------------------------------------
// 15. application_hiring_team_roles.list — POST /applicationHiringTeamRole.list
// ---------------------------------------------------------------------------

export type ExecuteApplicationHiringTeamRolesListInput = AshbyAuthInput;

export async function executeApplicationHiringTeamRolesList(
  input: ExecuteApplicationHiringTeamRolesListInput,
) {
  const client = authClient(input, "application_hiring_team_roles.list");
  const raw = await client.postJSON("/applicationHiringTeamRole.list", {});
  const results = asResults(raw);
  return { roles: Array.isArray(results) ? results : [] };
}
