/**
 * Greenhouse G4 — lookups tail (+6): job_notes.delete and five read-only
 * agent-tool lists. Auth/client: GH-0 Bearer via createAuthClient. Paths under /v3 only.
 *
 * All 6 omit effect keys. job_notes.delete returns `{ ok: true }`; any non-2xx
 * (incl. 404) surfaces as CONNECTOR_UPSTREAM_ERROR via the shared http client.
 */
import { createAuthClient } from "./http";
import { assertSafePathSegment } from "../../_shared/jobboard";

export interface GreenhouseAuthInput {
  clientId: string;
  clientSecret: string;
  userId?: string;
  fetch?: typeof fetch;
}

type IdList = string | number | Array<string | number>;

interface PageInput {
  ids?: IdList;
  perPage?: number;
  cursor?: string;
}

function authClientOpts(input: GreenhouseAuthInput, operation: string) {
  return {
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    userId: input.userId,
    fetch: input.fetch,
    operation,
  };
}

function buildQuery(params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") qs.set(key, value);
  }
  const encoded = qs.toString();
  return encoded.length > 0 ? `?${encoded}` : "";
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function joinIds(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  if (Array.isArray(value)) {
    const parts = value.map((v) => String(v)).filter((s) => s.length > 0);
    return parts.length > 0 ? parts.join(",") : undefined;
  }
  return String(value);
}

function boolParam(value: unknown): string | undefined {
  return typeof value === "boolean" ? String(value) : undefined;
}

function perPageParam(value: unknown): string | undefined {
  return typeof value === "number" && Number.isFinite(value) ? String(Math.trunc(value)) : undefined;
}

function oneOf(value: unknown, allowed: readonly string[], field: string): string | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new Error(`${field} must be one of ${allowed.join("|")}`);
  }
  return value;
}

function pageParams(input: PageInput) {
  return {
    ids: joinIds(input.ids),
    per_page: perPageParam(input.perPage),
    cursor: optionalString(input.cursor),
  };
}

async function list(
  input: GreenhouseAuthInput,
  operation: string,
  resource: string,
  params: Record<string, string | undefined>,
) {
  const client = createAuthClient(authClientOpts(input, operation));
  const { body, nextCursor } = await client.getJSONWithMeta(`/${resource}` + buildQuery(params));
  return { items: Array.isArray(body) ? body : [], nextCursor };
}

export const SCHEDULING_TYPES = ["none", "needs_scheduling", "take_home_test", "offer"] as const;
export const EMAIL_FROM_TYPES = [
  "user_email",
  "organization_email",
  "my_email_address",
  "inviter",
  "organizer",
  "not_applicable",
] as const;

// ---------------------------------------------------------------------------
// job_notes.delete
// ---------------------------------------------------------------------------

export async function executeJobNotesDelete(input: GreenhouseAuthInput & { id: string }) {
  const id = assertSafePathSegment(input.id, "id");
  const client = createAuthClient(authClientOpts(input, "job_notes.delete"));
  await client.deleteJSON(`/job_notes/${id}`);
  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// lookups
// ---------------------------------------------------------------------------

export async function executeJobInterviewsList(
  input: GreenhouseAuthInput &
    PageInput & {
      jobIds?: IdList;
      jobInterviewStageIds?: IdList;
      active?: boolean;
      schedulingType?: string;
    },
) {
  const schedulingType = oneOf(input.schedulingType, SCHEDULING_TYPES, "schedulingType");
  const { items, nextCursor } = await list(input, "job_interviews.list", "job_interviews", {
    job_ids: joinIds(input.jobIds),
    job_interview_stage_ids: joinIds(input.jobInterviewStageIds),
    active: boolParam(input.active),
    scheduling_type: schedulingType,
    ...pageParams(input),
  });
  return { jobInterviews: items, nextCursor };
}

export async function executeDefaultInterviewersList(
  input: GreenhouseAuthInput & PageInput & { userIds?: IdList; interviewKitIds?: IdList },
) {
  const { items, nextCursor } = await list(input, "default_interviewers.list", "default_interviewers", {
    user_ids: joinIds(input.userIds),
    interview_kit_ids: joinIds(input.interviewKitIds),
    ...pageParams(input),
  });
  return { defaultInterviewers: items, nextCursor };
}

export async function executeInterviewerTagsList(input: GreenhouseAuthInput & PageInput) {
  const { items, nextCursor } = await list(input, "interviewer_tags.list", "interviewer_tags", {
    ...pageParams(input),
  });
  return { interviewerTags: items, nextCursor };
}

export async function executeReferrersList(input: GreenhouseAuthInput & PageInput & { userIds?: IdList }) {
  const { items, nextCursor } = await list(input, "referrers.list", "referrers", {
    user_ids: joinIds(input.userIds),
    ...pageParams(input),
  });
  return { referrers: items, nextCursor };
}

export async function executeEmailTemplatesList(
  input: GreenhouseAuthInput & PageInput & { emailType?: string; fromType?: string },
) {
  const fromType = oneOf(input.fromType, EMAIL_FROM_TYPES, "fromType");
  const emailType = optionalString(input.emailType);
  if (input.emailType != null && input.emailType !== "" && emailType == null) {
    throw new Error("emailType must be a string");
  }
  const { items, nextCursor } = await list(input, "email_templates.list", "email_templates", {
    email_type: emailType,
    from_type: fromType,
    ...pageParams(input),
  });
  return { emailTemplates: items, nextCursor };
}
