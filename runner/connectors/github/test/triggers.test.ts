import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

const WEBHOOK_KEYS = [
  "webhook.push",
  "webhook.pull_request",
  "webhook.pull_request_review",
  "webhook.pull_request_review_comment",
  "webhook.pull_request_review_thread",
  "webhook.issues",
  "webhook.issue_comment",
  "webhook.commit_comment",
  "webhook.create",
  "webhook.delete",
  "webhook.fork",
  "webhook.star",
  "webhook.watch",
  "webhook.release",
  "webhook.member",
  "webhook.membership",
  "webhook.organization",
  "webhook.public",
  "webhook.repository",
  "webhook.status",
  "webhook.check_run",
  "webhook.check_suite",
  "webhook.workflow_run",
  "webhook.workflow_job",
  "webhook.workflow_dispatch",
  "webhook.deployment",
  "webhook.deployment_status",
  "webhook.page_build",
  "webhook.gollum",
  "webhook.label",
  "webhook.milestone",
  "webhook.project",
  "webhook.project_card",
  "webhook.project_column",
  "webhook.projects_v2",
  "webhook.projects_v2_item",
  "webhook.discussion",
  "webhook.discussion_comment",
  "webhook.branch_protection_rule",
  "webhook.secret_scanning_alert",
  "webhook.code_scanning_alert",
  "webhook.dependabot_alert",
  "webhook.package",
  "webhook.sponsorship",
  "webhook.repository_advisory",
  "webhook.meta",
] as const;

describe("github composio-class webhook triggers", () => {
  test("manifest has exactly the 46 webhook keys", () => {
    const webhookKeys = Object.entries(manifest.operations)
      .filter(([, spec]) => (spec as Record<string, unknown>).kind === "webhook")
      .map(([key]) => key)
      .sort();
    expect(WEBHOOK_KEYS).toHaveLength(46);
    expect(webhookKeys).toEqual([...WEBHOOK_KEYS].sort());
  });

  test("each webhook op is kind webhook without effectPolicy", () => {
    for (const key of WEBHOOK_KEYS) {
      const op = manifest.operations[key] as Record<string, unknown> | undefined;
      expect(op).toBeDefined();
      expect(op?.kind).toBe("webhook");
      expect(op?.timeoutMs).toBe(30000);
      expect(op?.maxInputBytes).toBe(1048576);
      expect(op?.maxResponseBytes).toBe(1048576);
      expect(op?.effectPolicy).toBeUndefined();
      expect(op?.reconcile).toBeUndefined();
      expect(op?.sideEffect).toBeUndefined();
      expect(typeof op?.title).toBe("string");
      expect((op?.title as string).length > 0).toBe(true);
      expect(typeof op?.description).toBe("string");
      expect((op?.description as string).length > 0).toBe(true);
      expect((op?.description as string)).toContain(`X-GitHub-Event: ${key.slice("webhook.".length)}`);
    }
  });

  test("action ops still have tool schemas and existing action keys remain", () => {
    expect(manifest.operations["issues.create"].kind).toBe("action");
    expect(manifest.operations["meta.zen.get"].kind).toBe("action");
    for (const spec of Object.values(manifest.operations)) {
      const op = spec as Record<string, unknown>;
      if (op.kind !== "action") continue;
      expect(typeof op.title).toBe("string");
      expect((op.title as string).length > 0).toBe(true);
      expect(typeof op.description).toBe("string");
      expect((op.description as string).length > 0).toBe(true);
      const schema = op.inputSchema as Record<string, unknown> | undefined;
      expect(schema).toBeDefined();
      expect(schema?.type).toBe("object");
    }
  });

  test("version and operation count match 0.64.0 / 619", () => {
    expect(manifest.version).toBe("0.64.0");
    expect(Object.keys(manifest.operations)).toHaveLength(656);
  });
});
