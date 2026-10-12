// FIX-EFFECTS (v0.81.2) final effect table. The only GitHub ops that carry effect keys:
// effectPolicy Reconcile with an exact observe whose output schema covers the op's own
// output schema (checked in effects.test.ts). Every other op carries no effect keys.
export const RECONCILE_KEEP: Readonly<Record<string, string>> = {
  "actions.oidc.customization.sub.set": "actions.oidc.customization.sub.get",
  "actions.permissions.access.set": "actions.permissions.access.get",
  "actions.permissions.selected_actions.set": "actions.permissions.selected_actions.get",
  "actions.permissions.set": "actions.permissions.get",
  "actions.permissions.workflow.set": "actions.permissions.workflow.get",
  "branches.protection.update": "branches.protection.get",
  "code_scanning.alerts.update": "code_scanning.alerts.get",
  "deployments.branch_policies.update": "deployments.branch_policies.get",
  "discussions.update": "discussions.get",
  "gists.comments.update": "gists.comments.get",
  "gists.star": "gists.star.check",
  "gists.update": "gists.get",
  "issues.assignees.add": "issues.get",
  "issues.assignees.remove": "issues.get",
  "issues.comments.update": "issues.comments.get",
  "milestones.update": "milestones.get",
  "notifications.threads.subscription.set": "notifications.threads.subscription.get",
  "orgs.actions.oidc.customization.sub.set": "orgs.actions.oidc.customization.sub.get",
  "orgs.actions.permissions.set": "orgs.actions.permissions.get",
  "orgs.actions.permissions.workflow.set": "orgs.actions.permissions.workflow.get",
  "orgs.hooks.config.update": "orgs.hooks.config.get",
  "orgs.hooks.update": "orgs.hooks.get",
  "orgs.teams.update": "orgs.teams.get",
  "orgs.update": "orgs.get",
  "pull_requests.convert_to_draft": "pull_requests.get",
  "pull_requests.mark_ready": "pull_requests.get",
  "pull_requests.requested_reviewers.add": "pull_requests.get",
  "pull_requests.requested_reviewers.remove": "pull_requests.get",
  "pull_requests.reviews.submit": "pull_requests.reviews.get",
  "pull_requests.reviews.update": "pull_requests.reviews.get",
  "releases.assets.update": "releases.assets.get",
  "releases.update": "releases.get",
  "repos.hooks.config.update": "repos.hooks.config.get",
  "repos.hooks.update": "repos.hooks.get",
  "repos.interaction_limits.set": "repos.interaction_limits.get",
  "repos.rulesets.update": "repos.rulesets.get",
  "repos.star": "user.starred.check",
  "repos.subscription.set": "repos.subscription.get",
  "repos.unstar": "user.starred.check",
  "repos.update": "repos.get",
  "user.update": "users.get_authenticated",
};

export function effectOf(key: string): { policy: string | undefined; reconcile: string | undefined; reconcileInput: undefined } {
  const observe = RECONCILE_KEEP[key];
  return { policy: observe ? "Reconcile" : undefined, reconcile: observe, reconcileInput: undefined };
}
