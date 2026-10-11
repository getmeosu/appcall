export type ParsedWebhook = {
  idempotencyKey: string;
  operation: string;
  sanitized: Record<string, unknown>;
};

const EVENT_TO_OP: Record<string, string> = {
  "jira:issue_created": "webhook.jira.issue_created",
  "jira:issue_updated": "webhook.jira.issue_updated",
  "jira:issue_deleted": "webhook.jira.issue_deleted",
  "comment_created": "webhook.comment_created",
  "comment_updated": "webhook.comment_updated",
  "comment_deleted": "webhook.comment_deleted",
  "sprint_created": "webhook.sprint_created",
  "sprint_updated": "webhook.sprint_updated",
  "sprint_started": "webhook.sprint_started",
  "sprint_closed": "webhook.sprint_closed",
  "jira:version_created": "webhook.version_created",
  "jira:version_updated": "webhook.version_updated",
  "jira:version_deleted": "webhook.version_deleted",
  "jira:version_released": "webhook.version_released",
  "jira:version_unreleased": "webhook.version_unreleased",
  "jira:version_moved": "webhook.version_moved",
  "jira:version_merged": "webhook.version_merged"
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nestedKey(value: unknown, path: string[]): string {
  let current: unknown = value;
  for (const key of path) {
    if (!isRecord(current)) return "";
    current = current[key];
  }
  return typeof current === "string" || typeof current === "number" ? String(current) : "";
}

export function parseWebhook(payload: unknown): ParsedWebhook {
  if (!isRecord(payload)) throw new Error("webhook payload must be an object");
  const webhookEvent = typeof payload.webhookEvent === "string" ? payload.webhookEvent : "";
  const operation = EVENT_TO_OP[webhookEvent] ?? "webhook.jira.issue_updated";
  const issueKey = nestedKey(payload, ["issue", "key"]);
  const issueId = nestedKey(payload, ["issue", "id"]);
  const commentId = nestedKey(payload, ["comment", "id"]);
  const sprintId = nestedKey(payload, ["sprint", "id"]);
  const versionId = nestedKey(payload, ["version", "id"]);
  const timestamp = payload.timestamp !== undefined ? String(payload.timestamp) : "";
  const idempotencyKey = [webhookEvent, issueKey || issueId, commentId, sprintId, versionId, timestamp].filter(Boolean).join(":");
  return {
    idempotencyKey: idempotencyKey || webhookEvent || "jira-webhook",
    operation,
    sanitized: {
      webhookEvent,
      issueKey,
      issueId,
      commentId,
      sprintId,
      versionId,
      timestamp,
      raw: payload,
    },
  };
}
