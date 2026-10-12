// FIX-EFFECTS (v0.81.2) final effect table. The only GitHub ops that carry effect keys:
// effectPolicy Reconcile with an exact observe whose output schema covers the op's own
// output schema (checked in effects.test.ts). Every other op carries no effect keys.
// FIX-EFFECTS-b (v0.86.2): orgs.teams.update dropped (41 -> 40). orgs.teams.get does not return
// notificationSetting or parentTeamId, so it cannot observe every field the op writes.
// FIX-EFFECTS-c (v0.86.3): 13 more dropped (40 -> 27) under linus's rule: keep only if the observe
// reads back every writable field on the same id (renamed fields need a mapping test) and the
// output validates against the op's own schema. Write-only secrets and partial observes omit.
export const RECONCILE_KEEP: Readonly<Record<string, string>> = {
  "actions.oidc.customization.sub.set": "actions.oidc.customization.sub.get",
  "actions.permissions.access.set": "actions.permissions.access.get",
  "actions.permissions.selected_actions.set": "actions.permissions.selected_actions.get",
  "actions.permissions.set": "actions.permissions.get",
  "actions.permissions.workflow.set": "actions.permissions.workflow.get",
  "branches.protection.update": "branches.protection.get",
  "deployments.branch_policies.update": "deployments.branch_policies.get",
  "discussions.update": "discussions.get",
  "gists.comments.update": "gists.comments.get",
  "gists.star": "gists.star.check",
  "issues.comments.update": "issues.comments.get",
  "milestones.update": "milestones.get",
  "notifications.threads.subscription.set": "notifications.threads.subscription.get",
  "orgs.actions.oidc.customization.sub.set": "orgs.actions.oidc.customization.sub.get",
  "orgs.actions.permissions.set": "orgs.actions.permissions.get",
  "orgs.actions.permissions.workflow.set": "orgs.actions.permissions.workflow.get",
  "pull_requests.convert_to_draft": "pull_requests.get",
  "pull_requests.mark_ready": "pull_requests.get",
  "pull_requests.reviews.submit": "pull_requests.reviews.get",
  "pull_requests.reviews.update": "pull_requests.reviews.get",
  "releases.assets.update": "releases.assets.get",
  "releases.update": "releases.get",
  "repos.interaction_limits.set": "repos.interaction_limits.get",
  "repos.rulesets.update": "repos.rulesets.get",
  "repos.star": "user.starred.check",
  "repos.subscription.set": "repos.subscription.get",
  "repos.unstar": "user.starred.check",
};

export function effectOf(key: string): { policy: string | undefined; reconcile: string | undefined; reconcileInput: undefined } {
  const observe = RECONCILE_KEEP[key];
  return { policy: observe ? "Reconcile" : undefined, reconcile: observe, reconcileInput: undefined };
}
