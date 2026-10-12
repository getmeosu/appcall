import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { DESTRUCTIVE, mutating } from "./destructive_keys";
import { RECONCILE_KEEP } from "./effects_final";

// FIX-DESTRUCTIVE (v0.86.5, +0 ops at 847). linus's rule: only resource deletes,
// pull_requests.reviews.dismiss and graphql.mutate get sideEffect "destructive". Reversible
// toggles and detach DELETEs (unstar, unlock, remove assignee/member/label, unblock, unfollow,
// mark_done, interaction-limit and subscription deletes, reaction deletes, remove_all
// detaches) stay "write". Amend: user.repository_invitations.decline is destructive (the
// invitation is deleted and cannot be restored). parity's recipe flipped every DELETE (121 at 867); this card follows
// linus where the two differ (see the self-lock).

type Op = Record<string, any>;
const ops = manifest.operations as Record<string, Op>;

/** HTTP method of an op: the request block, else the first verb route its description names. */
function methodOf(op: Op): string | null {
  if (op.request?.method) return String(op.request.method).toUpperCase();
  const match = /\b(GET|POST|PUT|PATCH|DELETE)\s+\//.exec(String(op.description ?? ""));
  return match ? match[1]! : null;
}

const NON_DELETE_DESTRUCTIVE = [
  "graphql.discussions.comments.delete",
  "graphql.discussions.delete",
  "graphql.mutate",
  "graphql.user_lists.delete",
  "pull_requests.reviews.dismiss",
] as const;

// Every DELETE action that is NOT destructive: a reversible toggle or a detach (42).
// Amend 2 (linus): repos.collaborators.remove and orgs.outside_collaborators.remove left this list
// (removing the user deletes their forks of private repositories).
// Amend (linus): the 4 remove_all detaches and notifications.threads.mark_done stay write.
const REVERSIBLE_DELETES = [
  "actions.org_secrets.repositories.remove",
  "actions.org_variables.repositories.remove",
  "commits.comments.reactions.delete",
  "gists.unstar",
  "issues.assignees.remove",
  "issues.comments.reactions.delete",
  "issues.labels.remove",
  "issues.labels.remove_all",
  "issues.reactions.delete",
  "issues.unlock",
  "notifications.threads.mark_done",
  "notifications.threads.subscription.delete",
  "orgs.actions.permissions.repositories.remove",
  "orgs.actions.runners.labels.remove_all",
  "orgs.blocks.unblock",
  "orgs.codespaces.access.selected_users.remove",
  "orgs.codespaces.secrets.repositories.remove",
  "orgs.dependabot.secrets.repositories.remove",
  "orgs.interaction_limits.delete",
  "orgs.members.remove",
  "orgs.migrations.repos.unlock",
  "orgs.organization_roles.teams.remove",
  "orgs.organization_roles.teams.remove_all",
  "orgs.organization_roles.users.remove",
  "orgs.organization_roles.users.remove_all",
  "orgs.public_members.remove",
  "orgs.teams.repos.remove",
  "pull_requests.requested_reviewers.remove",
  "pull_requests.review_comments.reactions.delete",
  "releases.reactions.delete",
  "repos.actions.runners.labels.remove",
  "repos.interaction_limits.delete",
  "repos.private_vulnerability_reporting.disable",
  "repos.subscription.delete",
  "repos.unstar",
  "teams.membership.remove",
  "user.blocks.unblock",
  "user.codespaces.secrets.repositories.remove",
  "user.following.unfollow",
  "user.installations.repositories.remove",
  "user.interaction_limits.delete",
  "user.migrations.repos.unlock",
] as const;

// Borderline ops linus ruled stay "write": the 4 remove_all detaches, mark_done, and the
// non-DELETE borderline ops parity listed (none is a resource delete).
const BORDERLINE_WRITE = [
  "issues.labels.remove_all",
  "notifications.threads.mark_done",
  "orgs.actions.runners.labels.remove_all",
  "orgs.organization_roles.teams.remove_all",
  "orgs.organization_roles.users.remove_all",
  "actions.runs.cancel",
  "actions.runs.force_cancel",
  "actions.workflows.disable",
  "graphql.migrations.abort",
  "graphql.organizations.unfollow",
  "graphql.projects_v2.item_field.clear",
  "graphql.sponsors.tiers.retire",
  "graphql.sponsorships.cancel",
  "issues.labels.set",
  "orgs.actions.runners.remove_token.create",
  "repos.actions.runners.remove_token.create",
  "repos.pages.deployments.cancel",
  "repos.topics.replace",
] as const;

const deleteActions = Object.entries(ops)
  .filter(([, op]) => op.kind === "action" && methodOf(op) === "DELETE")
  .map(([key]) => key)
  .sort();

describe("github FIX-DESTRUCTIVE", () => {
  test("version 0.86.8 at 847 ops; 77 destructive, 283 write", () => {
    expect(manifest.version).toBe("0.86.8");
    expect(Object.keys(ops).length).toBe(847);
    const side: Record<string, number> = {};
    for (const op of Object.values(ops)) {
      if (op.kind !== "action") continue;
      const key = String(op.sideEffect ?? "absent");
      side[key] = (side[key] ?? 0) + 1;
    }
    expect(side).toEqual({ read: 422, write: 283, destructive: 77, absent: 15 });
  });

  test("the destructive set is exactly DESTRUCTIVE (77); no other op is destructive", () => {
    expect(DESTRUCTIVE.length).toBe(77);
    expect(new Set(DESTRUCTIVE).size).toBe(77);
    expect([...DESTRUCTIVE]).toEqual([...DESTRUCTIVE].sort());
    const actual = Object.entries(ops)
      .filter(([, op]) => op.sideEffect === "destructive")
      .map(([key]) => key)
      .sort();
    expect(actual).toEqual([...DESTRUCTIVE]);
    for (const [key, op] of Object.entries(ops)) {
      if (!DESTRUCTIVE.includes(key)) expect(op.sideEffect, key).not.toBe("destructive");
      else expect(op.kind, key).toBe("action");
    }
  });

  test("composition: 72 resource-delete DELETEs + 3 GraphQL deletes + reviews.dismiss + graphql.mutate", () => {
    const viaDelete = DESTRUCTIVE.filter((key) => methodOf(ops[key]!) === "DELETE");
    const other = DESTRUCTIVE.filter((key) => methodOf(ops[key]!) !== "DELETE").sort();
    expect(viaDelete.length).toBe(72);
    expect(other).toEqual([...NON_DELETE_DESTRUCTIVE]);
  });

  test("every DELETE action is destructive or one of the 42 listed reversible deletes (write)", () => {
    expect(deleteActions.length).toBe(114);
    expect(REVERSIBLE_DELETES.length).toBe(42);
    const destructiveDeletes = deleteActions.filter((key) => DESTRUCTIVE.includes(key));
    const writeDeletes = deleteActions.filter((key) => !DESTRUCTIVE.includes(key));
    expect(destructiveDeletes.length).toBe(72);
    expect(writeDeletes).toEqual([...REVERSIBLE_DELETES]);
    for (const key of REVERSIBLE_DELETES) expect(ops[key]!.sideEffect, key).toBe("write");
    for (const key of ["gists.unstar", "repos.unstar", "issues.unlock", "issues.assignees.remove", "issues.labels.remove_all"]) {
      expect(REVERSIBLE_DELETES as readonly string[]).toContain(key);
    }
  });

  test("borderline ops stay write; decline is destructive", () => {
    for (const key of BORDERLINE_WRITE) {
      expect(ops[key], key).toBeDefined();
      expect(ops[key]!.sideEffect, key).toBe("write");
      expect(mutating(key)).toBe("write");
    }
    expect(ops["user.repository_invitations.decline"]!.sideEffect).toBe("destructive");
    expect(mutating("user.repository_invitations.decline")).toBe("destructive");
  });

  test("amend 2 (linus doc spot-check): collaborator removals are destructive, with no effect keys", () => {
    for (const key of ["repos.collaborators.remove", "orgs.outside_collaborators.remove"]) {
      const op = ops[key]!;
      expect(op.sideEffect, key).toBe("destructive");
      expect(methodOf(op), key).toBe("DELETE");
      expect(String(op.description), key).toMatch(/fork/);
      for (const k of ["effectPolicy", "reconcile", "reconcileInput", "effect"]) expect(op[k], `${key} ${k}`).toBeUndefined();
      expect(Object.values(RECONCILE_KEEP).includes(key), key).toBe(false);
    }
    expect(ops["orgs.members.remove"]!.sideEffect).toBe("write");
  });

  test("descriptions never say sideEffect=write on a destructive op, nor sideEffect=destructive elsewhere", () => {
    for (const [key, op] of Object.entries(ops)) {
      const description = String(op.description ?? "");
      if (DESTRUCTIVE.includes(key)) expect(description, key).not.toContain("sideEffect=write");
      else expect(description, key).not.toContain("sideEffect=destructive");
    }
  });

  test("effect keys: no destructive op carries effect keys or is an observe target", () => {
    const observes = new Set(Object.values(RECONCILE_KEEP));
    for (const key of DESTRUCTIVE) {
      const op = ops[key]!;
      expect(op.effectPolicy, key).toBeUndefined();
      expect(op.reconcile, key).toBeUndefined();
      expect(op.reconcileInput, key).toBeUndefined();
      expect(op.effect, key).toBeUndefined();
      expect(observes.has(key), key).toBe(false);
      expect(key in RECONCILE_KEEP, key).toBe(false);
    }
    for (const op of Object.values(ops)) {
      if (op.reconcile) expect(DESTRUCTIVE.includes(String(op.reconcile))).toBe(false);
    }
  });
});
