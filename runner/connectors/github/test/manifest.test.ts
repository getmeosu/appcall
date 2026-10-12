import { effectOf } from "./effects_final";
import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { mutating } from "./destructive_keys";

describe("github connector manifest", () => {
  test("manifest declares key, runtime, and auth", () => {
    expect(manifest.key).toBe("github");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.auth.type).toBe("oauth2");
    expect(manifest.auth.scopes).toContain("repo");
    expect(manifest.auth.scopes).toContain("read:org");
    expect(manifest.auth.scopes).toContain("admin:repo_hook");
    expect(manifest.auth.scopes).toContain("admin:org_hook");
    expect(manifest.auth.scopes).toContain("notifications");
    expect(manifest.auth.scopes).toContain("admin:org");
  });

  test("manifest declares network controls", () => {
    expect(manifest.network.allowedHosts).toContain("api.github.com");
    expect(manifest.network.allowedHosts).toContain("github.com");
  });

  test("manifest declares sync and action operations", () => {
    expect(manifest.operations["issues.list"].kind).toBe("sync");
    expect(manifest.operations["issues.create"].kind).toBe("action");
    expect(manifest.operations["issues.get"].kind).toBe("action");
    expect(manifest.operations["issues.update"].kind).toBe("action");
    expect(manifest.operations["issues.labels.add"].kind).toBe("action");
    expect(manifest.operations["issues.comments.create"].kind).toBe("action");
    expect(manifest.operations["pull_requests.list"].kind).toBe("sync");
    expect(manifest.operations["pull_requests.create"].kind).toBe("action");
    expect(manifest.operations["pull_requests.get"].kind).toBe("action");
    expect(manifest.operations["pull_requests.update"].kind).toBe("action");
    expect(manifest.operations["pull_requests.list_files"].kind).toBe("action");
    expect(manifest.operations["pull_requests.merge"].kind).toBe("action");
    expect(manifest.operations["repos.get"].kind).toBe("action");
    expect(manifest.operations["repos.create"].kind).toBe("action");
    expect(manifest.operations["repos.list"].kind).toBe("action");
    expect(manifest.operations["repos.contents.get"].kind).toBe("action");
    expect(manifest.operations["branches.get"].kind).toBe("action");
    expect(manifest.operations["branches.create"].kind).toBe("action");
    expect(manifest.operations["releases.create"].kind).toBe("action");
    expect(manifest.operations["gists.create"].kind).toBe("action");
    expect(manifest.operations["commits.list"].kind).toBe("sync");
    expect(manifest.operations["repositories.list"].kind).toBe("sync");
    expect(manifest.operations["healthcheck"].kind).toBe("action");
  });

  test("manifest declares models", () => {
    expect(manifest.models).toContain("issue");
    expect(manifest.models).toContain("pull_request");
    expect(manifest.models).toContain("commit");
    expect(manifest.models).toContain("repository");
    expect(manifest.models).toContain("issue_comment");
    expect(manifest.models).toContain("release");
    expect(manifest.models).toContain("gist");
    expect(manifest.models).toContain("branch");
    expect(manifest.models).toContain("label");
    expect(manifest.models).toContain("pull_request_review");
    expect(manifest.models).toContain("pull_request_review_comment");
    expect(manifest.models).toContain("check_run");
    expect(manifest.models).toContain("check_suite");
    expect(manifest.models).toContain("commit_status");
    expect(manifest.models).toContain("workflow");
    expect(manifest.models).toContain("workflow_run");
    expect(manifest.models).toContain("workflow_job");
    expect(manifest.models).toContain("artifact");
    expect(manifest.models).toContain("user");
    expect(manifest.models).toContain("organization");
    expect(manifest.models).toContain("tag");
    expect(manifest.models).toContain("release_asset");
    expect(manifest.models).toContain("notification");
    expect(manifest.models).toContain("team");
  });

  test("manifest has timeout and size limits on all operations", () => {
    for (const [op, spec] of Object.entries(manifest.operations)) {
      const s = spec as Record<string, unknown>;
      expect(typeof s.timeoutMs).toBe("number");
      expect((s.timeoutMs as number) > 0).toBe(true);
      expect(typeof s.maxInputBytes).toBe("number");
      expect(typeof s.maxResponseBytes).toBe("number");
    }
  });

  test("all action operations have title, description, and object inputSchema", () => {
    for (const [op, spec] of Object.entries(manifest.operations)) {
      const s = spec as Record<string, unknown>;
      if (s.kind !== "action") continue;
      expect(typeof s.title).toBe("string");
      expect((s.title as string).length > 0).toBe(true);
      expect(typeof s.description).toBe("string");
      expect((s.description as string).length > 0).toBe(true);
      const schema = s.inputSchema as Record<string, unknown>;
      expect(schema).toBeDefined();
      expect(schema.type).toBe("object");
    }
  });

  test("manifest has at least 26 action operations", () => {
    const actionOps = Object.entries(manifest.operations).filter(
      ([, spec]) => (spec as Record<string, unknown>).kind === "action"
    );
    expect(actionOps.length).toBeGreaterThanOrEqual(88);
    expect(actionOps.length).toBeGreaterThanOrEqual(88);
  });


  test("manifest declares S1 pr-reviews-comments ops", () => {
    for (const key of [
      "pull_requests.reviews.list",
      "pull_requests.reviews.create",
      "pull_requests.reviews.dismiss",
      "pull_requests.review_comments.list",
      "pull_requests.review_comments.create",
      "pull_requests.review_comments.reply",
      "pull_requests.requested_reviewers.add",
      "pull_requests.requested_reviewers.remove",
      "pull_requests.commits.list",
      "pull_requests.check_merged",
      "pull_requests.convert_to_draft",
      "pull_requests.mark_ready",
    ] as const) {
      expect(manifest.operations[key].kind).toBe("action");
    }
  });

  test("manifest declares S2 issue deepen and search ops", () => {
    for (const key of [
      "issues.comments.list",
      "issues.comments.update",
      "issues.assignees.add",
      "issues.assignees.remove",
      "issues.labels.remove",
      "issues.labels.set",
      "issues.lock",
      "issues.unlock",
      "labels.list",
      "search.issues",
      "search.pull_requests",
    ] as const) {
      expect(manifest.operations[key].kind).toBe("action");
    }
  });

  test("S2 write ops wire EffectPolicy Reconcile to issues.get", () => {
    const writes = [
      "issues.comments.update",
      "issues.assignees.add",
      "issues.assignees.remove",
      "issues.labels.set",
      "issues.lock",
      "issues.unlock",
    ];
    for (const key of writes) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.sideEffect).toBe("write");
      expect(op.effectPolicy).toBe(effectOf(key).policy);
      expect(op.reconcile).toBe(effectOf(key).reconcile);
    }
    // FIX-EFFECTS: issues.comments.delete is a resource delete; no effect keys.
    expect(manifest.operations["issues.comments.delete"].effectPolicy).toBe(effectOf("issues.comments.delete").policy);
    expect(manifest.operations["issues.comments.delete"].reconcile).toBe(effectOf("issues.comments.delete").reconcile);
    // FIX-G14C: issues.labels.remove is a DELETE per label; deletes omit effect keys.
    const remove = manifest.operations["issues.labels.remove"] as Record<string, unknown>;
    expect(remove.sideEffect).toBe("write");
    expect(remove.effectPolicy).toBe(effectOf("issues.labels.remove").policy);
    expect(remove.reconcile).toBe(effectOf("issues.labels.remove").reconcile);
  });


  test("S1 write ops wire EffectPolicy Reconcile to pull_requests.get", () => {
    const writes = [
      "pull_requests.reviews.create",
      "pull_requests.reviews.dismiss",
      "pull_requests.review_comments.create",
      "pull_requests.review_comments.reply",
      "pull_requests.requested_reviewers.add",
      "pull_requests.requested_reviewers.remove",
      "pull_requests.convert_to_draft",
      "pull_requests.mark_ready",
    ];
    for (const key of writes) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.sideEffect, key).toBe(mutating(key));
      expect(op.effectPolicy).toBe(effectOf(key).policy);
      expect(op.reconcile).toBe(effectOf(key).reconcile);
    }
  });

  test("manifest declares S3 actions workflows ops", () => {
    for (const key of [
      "actions.workflows.list",
      "actions.workflows.get",
      "actions.runs.list",
      "actions.runs.get",
      "actions.runs.cancel",
      "actions.runs.rerun",
      "actions.workflows.dispatch",
      "actions.jobs.list",
      "actions.jobs.get",
      "actions.jobs.logs.get",
      "actions.artifacts.list",
      "actions.artifacts.get",
    ] as const) {
      expect(manifest.operations[key].kind).toBe("action");
    }
  });

  test("S3 write ops wire EffectPolicy Reconcile", () => {
    const cancel = manifest.operations["actions.runs.cancel"] as Record<string, unknown>;
    expect(cancel.sideEffect).toBe("write");
    expect(cancel.effectPolicy).toBe(effectOf("actions.runs.cancel").policy);
    expect(cancel.reconcile).toBe(effectOf("actions.runs.cancel").reconcile);
    const rerun = manifest.operations["actions.runs.rerun"] as Record<string, unknown>;
    expect(rerun.sideEffect).toBe("write");
    expect(rerun.effectPolicy).toBe(effectOf("actions.runs.rerun").policy);
    expect(rerun.reconcile).toBe(effectOf("actions.runs.rerun").reconcile);
    const dispatch = manifest.operations["actions.workflows.dispatch"] as Record<string, unknown>;
    expect(dispatch.sideEffect).toBe("write");
    expect(dispatch.effectPolicy).toBe(effectOf("actions.workflows.dispatch").policy);
    expect(dispatch.reconcile).toBe(effectOf("actions.workflows.dispatch").reconcile);
  });

  test("manifest declares S6 search-users-orgs ops", () => {
    for (const key of [
      "search.users",
      "users.get",
      "users.get_by_username",
      "users.repos.list",
      "orgs.get",
      "orgs.list",
      "orgs.members.list",
      "orgs.repos.list",
    ] as const) {
      expect(manifest.operations[key].kind).toBe("action");
      expect((manifest.operations[key] as Record<string, unknown>).sideEffect).toBe("read");
    }
  });


  test("S4 write ops declare Reconcile effect policy", () => {
    expect(manifest.operations["commits.statuses.create"].sideEffect).toBe("write");
    expect(manifest.operations["commits.statuses.create"].effectPolicy).toBe(effectOf("commits.statuses.create").policy);
    expect(manifest.operations["commits.statuses.create"].reconcile).toBe(effectOf("commits.statuses.create").reconcile);
    expect(manifest.operations["pull_requests.update_branch"].sideEffect).toBe("write");
    expect(manifest.operations["pull_requests.update_branch"].effectPolicy).toBe(effectOf("pull_requests.update_branch").policy);
    expect(manifest.operations["pull_requests.update_branch"].reconcile).toBe(effectOf("pull_requests.update_branch").reconcile);
  });

  test("manifest declares S4 checks-ci-commits ops", () => {
    for (const key of [
      "checks.runs.list_for_ref",
      "checks.runs.get",
      "checks.suites.list_for_ref",
      "commits.status.get",
      "commits.statuses.list",
      "commits.statuses.create",
      "commits.get",
      "repos.compare",
      "pull_requests.update_branch",
      "branches.list",
    ] as const) {
      expect(manifest.operations[key].kind).toBe("action");
    }
  });

  test("manifest declares S5 contents-write ops", () => {
    for (const key of [
      "repos.contents.put",
      "repos.contents.delete",
      "repos.contents.push_files",
      "git.blobs.create",
      "git.blobs.get",
      "git.trees.create",
      "git.trees.get",
      "git.refs.create",
      "git.refs.update",
      "git.commits.create",
      "repos.tree.get",
    ] as const) {
      expect(manifest.operations[key].kind).toBe("action");
    }
  });

  test("S5 write ops wire EffectPolicy", () => {
    expect(manifest.operations["repos.contents.put"].sideEffect).toBe("write");
    expect(manifest.operations["repos.contents.put"].effectPolicy).toBe(effectOf("repos.contents.put").policy);
    expect(manifest.operations["repos.contents.put"].reconcile).toBe(effectOf("repos.contents.put").reconcile);
    expect(manifest.operations["repos.contents.delete"].sideEffect).toBe("destructive");
    expect(manifest.operations["repos.contents.delete"].effectPolicy).toBe(effectOf("repos.contents.delete").policy);
    expect(manifest.operations["repos.contents.push_files"].sideEffect).toBe("write");
    expect(manifest.operations["repos.contents.push_files"].effectPolicy).toBe(effectOf("repos.contents.push_files").policy);
    expect(manifest.operations["repos.contents.push_files"].reconcile).toBe(effectOf("repos.contents.push_files").reconcile);
    for (const key of [
      "git.blobs.create",
      "git.trees.create",
      "git.refs.create",
      "git.refs.update",
      "git.commits.create",
    ] as const) {
      expect(manifest.operations[key].sideEffect).toBe("write");
      expect(manifest.operations[key].effectPolicy).toBeUndefined();
    }
  });

  test("manifest version is 0.79.0", () => {
    expect(manifest.version).toBe("0.89.3");
    expect(manifest.version).not.toBe("0.19.0");
  });

  test("manifest declares S8 labels milestones collab ops", () => {
    for (const key of [
      "labels.get",
      "labels.create",
      "labels.update",
      "labels.delete",
      "milestones.list",
      "milestones.get",
      "milestones.create",
      "milestones.update",
      "repos.collaborators.list",
      "repos.collaborators.add",
      "repos.collaborators.remove",
      "repos.collaborators.check",
    ] as const) {
      expect(manifest.operations[key].kind).toBe("action");
    }
  });

  test("S8 write ops wire EffectPolicy Reconcile/Idempotent", () => {
    for (const [key, policy, reconcile] of [
      ["labels.create", "Reconcile", "labels.get"],
      ["labels.update", "Reconcile", "labels.get"],
      ["labels.delete", undefined, undefined],
      ["milestones.create", undefined, undefined],
      ["milestones.update", "Reconcile", "milestones.get"],
      ["repos.collaborators.add", "Reconcile", "repos.collaborators.check"],
      // FIX-EFFECTS (parity): check is 204 for base-permission access too, so no exact observe.
      ["repos.collaborators.remove", undefined, undefined],
    ] as const) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.sideEffect, key).toBe(mutating(key));
      expect(op.effectPolicy).toBe(effectOf(key).policy);
      expect(op.reconcile).toBe(effectOf(key).reconcile);
    }
  });


  test("manifest declares S7 releases-tags-gists ops", () => {
    for (const key of [
      "releases.list",
      "releases.get",
      "releases.get_latest",
      "releases.get_by_tag",
      "releases.update",
      "releases.assets.list",
      "tags.list",
      "gists.list",
      "gists.get",
      "gists.update",
    ] as const) {
      expect(manifest.operations[key].kind).toBe("action");
    }
  });

  test("S7 write ops wire EffectPolicy Reconcile", () => {
    const releaseUpdate = manifest.operations["releases.update"] as Record<string, unknown>;
    expect(releaseUpdate.sideEffect).toBe("write");
    expect(releaseUpdate.effectPolicy).toBe(effectOf("releases.update").policy);
    expect(releaseUpdate.reconcile).toBe(effectOf("releases.update").reconcile);
    const gistUpdate = manifest.operations["gists.update"] as Record<string, unknown>;
    expect(gistUpdate.sideEffect).toBe("write");
    expect(gistUpdate.effectPolicy).toBe(effectOf("gists.update").policy);
    expect(gistUpdate.reconcile).toBe(effectOf("gists.update").reconcile);
  });


  test("manifest declares S9 discussion ops", () => {
    for (const key of [
      "discussions.categories.list",
      "discussions.list",
      "discussions.get",
      "discussions.create",
      "discussions.update",
      "discussions.comments.list",
      "discussions.comments.create",
      "discussions.comments.update",
    ] as const) {
      expect(manifest.operations[key].kind).toBe("action");
    }
    expect(Object.keys(manifest.operations).length).toBeGreaterThanOrEqual(118);
  });

  test("S9 write ops wire EffectPolicy Reconcile", () => {
    for (const [key, reconcile] of [
      ["discussions.create", "discussions.get"],
      ["discussions.update", "discussions.get"],
      ["discussions.comments.create", "discussions.comments.list"],
      ["discussions.comments.update", "discussions.comments.list"],
    ] as const) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.sideEffect).toBe("write");
      expect(op.effectPolicy).toBe(effectOf(key).policy);
      expect(op.reconcile).toBe(effectOf(key).reconcile);
    }
    for (const key of ["discussions.categories.list", "discussions.list", "discussions.get", "discussions.comments.list"] as const) {
      expect(manifest.operations[key].sideEffect).toBe("read");
    }
    expect(manifest.network.allowedHosts).toContain("api.github.com");
  });

  test("manifest declares S11 agent-polish ops", () => {
    expect(manifest.operations["pull_requests.comments.list"].kind).toBe("action");
    expect(manifest.operations["pull_requests.comments.list"].sideEffect).toBe("read");
    expect(manifest.operations["pull_requests.comments.list"].effectPolicy).toBe(effectOf("pull_requests.comments.list").policy);
    const update = manifest.operations["repos.update"] as Record<string, unknown>;
    expect(update.sideEffect).toBe("write");
    expect(update.effectPolicy).toBe(effectOf("repos.update").policy);
    expect(update.reconcile).toBe(effectOf("repos.update").reconcile);
    const del = manifest.operations["branches.delete"] as Record<string, unknown>;
    expect(del.sideEffect).toBe("destructive");
    // FIX-EFFECTS: resource delete, no effect keys.
    expect(del.effectPolicy).toBe(effectOf("branches.delete").policy);
    expect(del.reconcile).toBe(effectOf("branches.delete").reconcile);
    expect(manifest.operations["branches.get"].sideEffect).toBe("read");
    const comment = manifest.operations["commits.comments.create"] as Record<string, unknown>;
    expect(comment.sideEffect).toBe("write");
    expect(comment.effectPolicy).toBe(effectOf("commits.comments.create").policy);
    expect(comment.reconcile).toBe(effectOf("commits.comments.create").reconcile);
    expect(Object.keys(manifest.operations).length).toBe(860);
  });

  test("manifest declares S12 refs search user reads", () => {
    for (const key of [
      "git.refs.get",
      "search.code",
      "search.commits",
      "search.repositories",
      "search.orgs",
      "users.get_authenticated",
    ] as const) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBe(effectOf(key).policy);
    }
  });

  test("manifest declares S10 notifications-orgs-social ops", () => {
    for (const key of [
      "notifications.list",
      "notifications.get",
      "notifications.mark_read",
      "notifications.mark_all_read",
      "orgs.teams.list",
      "teams.members.list",
      "teams.membership.add",
      "repos.fork",
      "repos.star",
      "repos.unstar",
    ] as const) {
      expect(manifest.operations[key].kind).toBe("action");
    }
    expect(manifest.operations["orgs.members.list"].kind).toBe("action");
    expect(Object.keys(manifest.operations).length).toBeGreaterThanOrEqual(132);
  });

  test("S10 write ops wire EffectPolicy Reconcile", () => {
    for (const [key, reconcile] of [
      ["notifications.mark_read", "notifications.get"],
      ["notifications.mark_all_read", "notifications.list"],
      ["teams.membership.add", "teams.members.list"],
      ["repos.fork", "repos.get"],
      ["repos.star", "repos.get"],
      // FIX-EFFECTS: exact observe (viewer starred), not repos.get.
      ["repos.unstar", "user.starred.check"],
    ] as const) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.sideEffect).toBe("write");
      expect(op.effectPolicy).toBe(effectOf(key).policy);
      expect(op.reconcile).toBe(effectOf(key).reconcile);
    }
  });

  test("manifest declares N1 deployment environment release ops", () => {
    const reads = [
      "deployments.list",
      "deployments.get",
      "deployments.statuses.list",
      "environments.list",
      "environments.get",
      "actions.runs.logs.download",
      "actions.artifacts.download",
      "releases.assets.get",
    ] as const;
    for (const key of reads) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBe(effectOf(key).policy);
    }
    const notes = manifest.operations["releases.generate_notes"] as Record<string, unknown>;
    expect(notes.sideEffect).toBe("read");
    expect(notes.effectPolicy).toBe(effectOf("releases.generate_notes").policy);
    expect(notes.reconcile).toBe(effectOf("releases.generate_notes").reconcile);
    expect(Object.keys(manifest.operations).length).toBe(860);
    expect(manifest.network.allowedHosts).toContain("uploads.github.com");
  });

  test("N1 write ops wire EffectPolicy", () => {
    for (const [key, policy, reconcile] of [
      ["deployments.create", "Reconcile", "deployments.get"],
      ["deployments.statuses.create", "Reconcile", "deployments.statuses.list"],
      ["actions.runs.rerun_failed", "Reconcile", "actions.runs.get"],
      ["releases.assets.upload", "Reconcile", "releases.assets.get"],
    ] as const) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.sideEffect).toBe("write");
      expect(op.effectPolicy).toBe(effectOf(key).policy);
      expect(op.reconcile).toBe(effectOf(key).reconcile);
    }
    const del = manifest.operations["releases.delete"] as Record<string, unknown>;
    expect(del.sideEffect).toBe("destructive");
    expect(del.effectPolicy).toBe(effectOf("releases.delete").policy);
    expect(del.reconcile).toBe(effectOf("releases.delete").reconcile);
  });

});
