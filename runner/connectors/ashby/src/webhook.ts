export type ParsedWebhook = {
  idempotencyKey: string;
  operation: string;
  sanitized: Record<string, unknown>;
};

const DEFAULT_OPERATION = "webhook.application_submitted";

const ACTION_OPERATIONS: Record<string, string> = {
  applicationsubmit: "webhook.application_submitted",
  applicationcreate: "webhook.application_submitted",
  candidateapplicationsubmit: "webhook.application_submitted",
  candidateupdate: "webhook.candidate_updated",
  interviewschedulescreate: "webhook.interview_scheduled",
  interviewschedulecreate: "webhook.interview_scheduled",
  offercreate: "webhook.offer_created",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function prop(obj: Record<string, unknown>, key: string): string {
  const value = obj[key];
  return typeof value === "string" && value.length > 0 ? value : "";
}

function nestedId(value: unknown): string {
  if (!isRecord(value)) return "";
  return prop(value, "id");
}

function classifyAction(action: string): string | null {
  const compact = action.replace(/[._-]/g, "").toLowerCase();
  return ACTION_OPERATIONS[compact] ?? null;
}

function deriveIdempotencyKey(payload: Record<string, unknown>, fallbackId: string): string {
  const explicit = prop(payload, "webhookActionId") || prop(payload, "webhook_action_id");
  const suffix = explicit || fallbackId || prop(payload, "id") || "unknown";
  return `ashby-wh:${suffix}`;
}

export function parseWebhook(payload: unknown): ParsedWebhook {
  if (!isRecord(payload)) {
    return {
      idempotencyKey: "ashby-wh:unknown",
      operation: DEFAULT_OPERATION,
      sanitized: {},
    };
  }
  const data = isRecord(payload.data) ? payload.data : {};
  const action = prop(payload, "action") || prop(payload, "type");
  const matched = classifyAction(action);
  const operation = matched ?? DEFAULT_OPERATION;
  const sanitized: Record<string, unknown> = {};
  if (action) sanitized.action = action;

  const applicationId =
    prop(data, "applicationId") ||
    prop(data, "application_id") ||
    (matched === "webhook.application_submitted" ? prop(data, "id") : "") ||
    nestedId(data.application);
  const candidateId =
    prop(data, "candidateId") ||
    prop(data, "candidate_id") ||
    (matched === "webhook.candidate_updated" ? prop(data, "id") : "") ||
    nestedId(data.candidate);
  const interviewScheduleId =
    prop(data, "interviewScheduleId") ||
    prop(data, "interview_schedule_id") ||
    (matched === "webhook.interview_scheduled" ? prop(data, "id") : "");
  const offerId =
    prop(data, "offerId") ||
    prop(data, "offer_id") ||
    (matched === "webhook.offer_created" ? prop(data, "id") : "");

  if (applicationId) sanitized.applicationId = applicationId;
  if (candidateId) sanitized.candidateId = candidateId;
  if (interviewScheduleId) sanitized.interviewScheduleId = interviewScheduleId;
  if (offerId) sanitized.offerId = offerId;

  const fallbackId =
    (operation === "webhook.interview_scheduled" ? interviewScheduleId : "") ||
    (operation === "webhook.offer_created" ? offerId : "") ||
    (operation === "webhook.candidate_updated" ? candidateId : "") ||
    applicationId ||
    candidateId ||
    interviewScheduleId ||
    offerId;
  return {
    idempotencyKey: deriveIdempotencyKey(payload, fallbackId),
    operation,
    sanitized,
  };
}
