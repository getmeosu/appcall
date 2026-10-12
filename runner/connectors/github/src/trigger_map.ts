// GitHub TRIG-2 (v0.86.10, +0 ops): the Composio GitHub trigger map, typed. 46 slugs
// (/workspace/composio-github-triggers.txt) mapped per the locked parity briefs
// github-trigger-gap.md / github-trigger-actions.md: the GitHub webhook event(s), the actions
// Composio narrows to, and any field filter. Every action is checked against the pinned spec's
// webhook-<event>-<action> schemas (fixtures/trigger_actions_spec.json).
//
// runtimeServed is true only for the 9 poll-tagged slugs proven by
// crates/appcall-api/tests/github_poll_e2e.rs (fixtures/runtime-served.json). Webhook slugs stay
// false until WH-1 has its own e2e (see parity-briefs/github-trig-0-trace.md). The 9 "not-named"
// slugs have no webhook event and are served by TRIG-3a/3b polling.
//
// Duplicates: GITHUB_ISSUE_ADDED_EVENT = GITHUB_ISSUE_CREATED_TRIGGER (issues.opened) and
// GITHUB_STAR_ADDED_EVENT = GITHUB_NEW_STARGAZER_ADDED_TRIGGER (star.created). Composio names
// both, so both count toward the 46; each duplicate records duplicateOf and matches identically.

export type TriggerClass = "named" | "one-event" | "ambiguous" | "not-named";
export type FieldFilter =
  | { kind: "refType"; value: "branch" | "tag" }
  | { kind: "refPrefix" }
  | { kind: "assigneeIsViewer" }
  | { kind: "tagPushCreated" };
export type EventMatch = { event: string; actions?: readonly string[]; where?: FieldFilter };
export type TriggerEntry = {
  class: TriggerClass;
  match: readonly EventMatch[];
  status: "covered" | "partial" | "missing";
  runtimeServed: boolean;
  duplicateOf?: string;
  polling?: { readOp: string; proposedSync: string };
  /** Delivery caveat; informational only, never changes matching. */
  note?: string;
};

// GitHub docs (webhook-events-and-payloads, check_run / check_suite): "Repository and organization
// webhooks only receive payloads for the created and completed event types" (check_run) and "only ...
// the completed event types" (check_suite). The other actions go only to a GitHub App with write
// access to Checks.
const CHECK_RUN_APP_ONLY =
  "check_run rerequested (and requested_action) is delivered only to GitHub Apps with Checks write access; repository and organization webhooks send only created and completed.";
const CHECK_SUITE_APP_ONLY =
  "check_suite requested and rerequested are delivered only to GitHub Apps with Checks write access; repository and organization webhooks send only completed.";

export const GITHUB_TRIGGERS: Record<string, TriggerEntry> = {
  GITHUB_ARTIFACT_CREATED_TRIGGER: { class: "not-named", match: [], status: "covered", runtimeServed: true, polling: { readOp: "actions.artifacts.list", proposedSync: "actions.artifacts.sync" } },
  GITHUB_BRANCH_CHANGED_TRIGGER: { class: "ambiguous", match: [{ event: "push" }, { event: "branch_protection_configuration", actions: ["disabled", "enabled"] }, { event: "branch_protection_rule", actions: ["created", "deleted", "edited"] }], status: "covered", runtimeServed: false },
  GITHUB_BRANCH_CREATED_TRIGGER: { class: "one-event", match: [{ event: "create", where: { kind: "refType", value: "branch" } }], status: "covered", runtimeServed: false },
  GITHUB_CHECK_RUN_STATUS_CHANGED_TRIGGER: { class: "named", match: [{ event: "check_run", actions: ["completed", "created", "rerequested"] }], status: "covered", runtimeServed: false, note: CHECK_RUN_APP_ONLY },
  GITHUB_CHECK_SUITE_STATUS_CHANGED_TRIGGER: { class: "named", match: [{ event: "check_suite", actions: ["completed", "requested", "rerequested"] }], status: "covered", runtimeServed: false, note: CHECK_SUITE_APP_ONLY },
  GITHUB_CODE_SCANNING_ALERT_CREATED_TRIGGER: { class: "named", match: [{ event: "code_scanning_alert", actions: ["created"] }], status: "covered", runtimeServed: false },
  GITHUB_COLLABORATOR_ADDED_TRIGGER: { class: "one-event", match: [{ event: "member", actions: ["added"] }], status: "covered", runtimeServed: false },
  GITHUB_COMMIT_EVENT: { class: "one-event", match: [{ event: "push" }], status: "covered", runtimeServed: false },
  GITHUB_DEPLOYMENT_CREATED_TRIGGER: { class: "named", match: [{ event: "deployment", actions: ["created"] }], status: "covered", runtimeServed: false },
  GITHUB_DEPLOYMENT_STATE_CHANGED_TRIGGER: { class: "not-named", match: [], status: "covered", runtimeServed: true, polling: { readOp: "deployments.list", proposedSync: "deployments.sync" } },
  GITHUB_DEPLOYMENT_STATUS_CREATED: { class: "named", match: [{ event: "deployment_status", actions: ["created"] }], status: "covered", runtimeServed: false },
  GITHUB_FOLLOWER_EVENT: { class: "not-named", match: [], status: "covered", runtimeServed: true, polling: { readOp: "user.followers.list", proposedSync: "user.followers.sync" } },
  GITHUB_GIT_REFERENCE_CREATED_TRIGGER: { class: "one-event", match: [{ event: "create", where: { kind: "refPrefix" } }], status: "covered", runtimeServed: false },
  GITHUB_ISSUE_ADDED_EVENT: { class: "one-event", match: [{ event: "issues", actions: ["opened"] }], status: "covered", runtimeServed: false, duplicateOf: "GITHUB_ISSUE_CREATED_TRIGGER" },
  GITHUB_ISSUE_ASSIGNED_TO_ME_TRIGGER: { class: "one-event", match: [{ event: "issues", actions: ["assigned"], where: { kind: "assigneeIsViewer" } }], status: "covered", runtimeServed: false },
  GITHUB_ISSUE_COMMENT_CHANGED_TRIGGER: { class: "named", match: [{ event: "issue_comment", actions: ["edited"] }], status: "covered", runtimeServed: false },
  GITHUB_ISSUE_COMMENT_CREATED_TRIGGER: { class: "named", match: [{ event: "issue_comment", actions: ["created"] }], status: "covered", runtimeServed: false },
  GITHUB_ISSUE_CREATED_TRIGGER: { class: "one-event", match: [{ event: "issues", actions: ["opened"] }], status: "covered", runtimeServed: false },
  GITHUB_ISSUE_EVENT_OCCURRED_TRIGGER: { class: "one-event", match: [{ event: "issues" }], status: "covered", runtimeServed: false },
  GITHUB_ISSUE_LABEL_CHANGED_TRIGGER: { class: "one-event", match: [{ event: "issues", actions: ["labeled", "unlabeled"] }], status: "covered", runtimeServed: false },
  GITHUB_ISSUE_STATE_CHANGED_TRIGGER: { class: "ambiguous", match: [{ event: "issues", actions: ["assigned", "closed", "demilestoned", "edited", "labeled", "locked", "milestoned", "reopened", "unassigned", "unlabeled", "unlocked"] }, { event: "issue_comment", actions: ["created", "deleted"] }], status: "covered", runtimeServed: false },
  GITHUB_ISSUE_UPDATED_TRIGGER: { class: "ambiguous", match: [{ event: "issues", actions: ["assigned", "closed", "demilestoned", "edited", "labeled", "milestoned", "reopened", "unassigned", "unlabeled"] }, { event: "issue_comment", actions: ["created"] }], status: "covered", runtimeServed: false },
  GITHUB_LABEL_ADDED_EVENT: { class: "one-event", match: [{ event: "pull_request", actions: ["labeled"] }], status: "covered", runtimeServed: false },
  GITHUB_NEW_STARGAZER_ADDED_TRIGGER: { class: "one-event", match: [{ event: "star", actions: ["created"] }], status: "covered", runtimeServed: false },
  GITHUB_PR_REVIEW_COMMENT_CREATED_TRIGGER: { class: "one-event", match: [{ event: "pull_request_review_comment", actions: ["created"] }], status: "covered", runtimeServed: false },
  GITHUB_PULL_REQUEST_COMMIT_ADDED_TRIGGER: { class: "one-event", match: [{ event: "pull_request", actions: ["synchronize"] }], status: "covered", runtimeServed: false },
  GITHUB_PULL_REQUEST_CREATED: { class: "named", match: [{ event: "pull_request", actions: ["opened"] }], status: "covered", runtimeServed: false },
  GITHUB_PULL_REQUEST_EVENT: { class: "named", match: [{ event: "pull_request", actions: ["closed", "opened", "synchronize"] }], status: "covered", runtimeServed: false },
  GITHUB_PULL_REQUEST_REVIEWERS_CHANGED_TRIGGER: { class: "named", match: [{ event: "pull_request", actions: ["review_request_removed", "review_requested"] }], status: "covered", runtimeServed: false },
  GITHUB_PULL_REQUEST_REVIEW_SUBMITTED_TRIGGER: { class: "named", match: [{ event: "pull_request_review", actions: ["submitted"] }], status: "covered", runtimeServed: false },
  GITHUB_PULL_REQUEST_STATE_CHANGED_TRIGGER: { class: "named", match: [{ event: "pull_request", actions: ["assigned", "closed", "converted_to_draft", "demilestoned", "edited", "labeled", "locked", "milestoned", "ready_for_review", "reopened", "review_request_removed", "review_requested", "unassigned", "unlabeled", "unlocked"] }], status: "covered", runtimeServed: false },
  GITHUB_PULL_REQUEST_UPDATED: { class: "named", match: [{ event: "pull_request", actions: ["assigned", "closed", "converted_to_draft", "demilestoned", "edited", "labeled", "milestoned", "ready_for_review", "reopened", "review_request_removed", "review_requested", "unassigned", "unlabeled"] }], status: "covered", runtimeServed: false },
  GITHUB_README_CHANGED_TRIGGER: { class: "not-named", match: [], status: "covered", runtimeServed: true, polling: { readOp: "repos.readme.get", proposedSync: "repos.readme.sync" } },
  GITHUB_RELEASE_ASSET_ADDED_TRIGGER: { class: "not-named", match: [], status: "covered", runtimeServed: true, polling: { readOp: "releases.list", proposedSync: "releases.assets.sync" } },
  GITHUB_RELEASE_STATE_CHANGED_TRIGGER: { class: "named", match: [{ event: "release", actions: ["edited", "prereleased", "published", "released", "unpublished"] }], status: "covered", runtimeServed: false },
  GITHUB_REPOSITORY_CONTENT_CHANGED_TRIGGER: { class: "not-named", match: [], status: "covered", runtimeServed: true, polling: { readOp: "repos.contents.get", proposedSync: "repos.contents.sync" } },
  GITHUB_REPOSITORY_NOTIFICATION_RECEIVED_TRIGGER: { class: "not-named", match: [], status: "covered", runtimeServed: true, polling: { readOp: "repos.notifications.list", proposedSync: "repos.notifications.sync" } },
  GITHUB_REPOSITORY_TAG_CREATED_TRIGGER: { class: "ambiguous", match: [{ event: "create", where: { kind: "refType", value: "tag" } }, { event: "push", where: { kind: "tagPushCreated" } }], status: "covered", runtimeServed: false },
  GITHUB_SECRET_SCANNING_ALERT_DETECTED_TRIGGER: { class: "named", match: [{ event: "secret_scanning_alert", actions: ["created"] }], status: "covered", runtimeServed: false },
  GITHUB_STAR_ADDED_EVENT: { class: "named", match: [{ event: "star", actions: ["created"] }], status: "covered", runtimeServed: false, duplicateOf: "GITHUB_NEW_STARGAZER_ADDED_TRIGGER" },
  GITHUB_WORKFLOW_ADDED_TRIGGER: { class: "not-named", match: [], status: "covered", runtimeServed: true, polling: { readOp: "actions.workflows.list", proposedSync: "actions.workflows.sync" } },
  GITHUB_WORKFLOW_JOB_ADDED_TRIGGER: { class: "named", match: [{ event: "workflow_job", actions: ["queued"] }], status: "covered", runtimeServed: false },
  GITHUB_WORKFLOW_JOB_STATE_CHANGED: { class: "named", match: [{ event: "workflow_job" }], status: "covered", runtimeServed: false },
  GITHUB_WORKFLOW_RUN_ARTIFACT_ADDED: { class: "not-named", match: [], status: "covered", runtimeServed: true, polling: { readOp: "actions.artifacts.list", proposedSync: "actions.artifacts.sync" } },
  GITHUB_WORKFLOW_RUN_CREATED: { class: "named", match: [{ event: "workflow_run", actions: ["requested"] }], status: "covered", runtimeServed: false },
  GITHUB_WORKFLOW_RUN_STATE_CHANGED_TRIGGER: { class: "named", match: [{ event: "workflow_run", actions: ["completed", "in_progress"] }], status: "covered", runtimeServed: false },
};

export type TriggerContext = { viewerLogin?: string; refPrefix?: string };

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function whereMatches(where: FieldFilter | undefined, payload: Record<string, unknown>, ctx: TriggerContext): boolean {
  if (!where) return true;
  switch (where.kind) {
    case "refType":
      return payload.ref_type === where.value;
    case "refPrefix":
      return typeof payload.ref === "string" && (ctx.refPrefix === undefined || payload.ref.startsWith(ctx.refPrefix));
    case "assigneeIsViewer":
      return typeof ctx.viewerLogin === "string" && record(payload.assignee).login === ctx.viewerLogin;
    case "tagPushCreated":
      return payload.created === true && typeof payload.ref === "string" && payload.ref.startsWith("refs/tags/");
  }
}

/** Webhook operation keys that serve a slug (manifest `webhook.<event>`). */
export function triggerOperations(slug: string): string[] {
  const entry = GITHUB_TRIGGERS[slug];
  return entry ? entry.match.map((m) => `webhook.${m.event}`) : [];
}

/** True when a GitHub delivery (X-GitHub-Event `event`, parsed `payload`) fires the Composio trigger `slug`. */
export function matchesTrigger(slug: string, event: string, payload: unknown, ctx: TriggerContext = {}): boolean {
  const entry = GITHUB_TRIGGERS[slug];
  if (!entry) return false;
  const body = record(payload);
  return entry.match.some((m) =>
    m.event === event &&
    (m.actions === undefined || (typeof body.action === "string" && m.actions.includes(body.action))) &&
    whereMatches(m.where, body, ctx));
}
