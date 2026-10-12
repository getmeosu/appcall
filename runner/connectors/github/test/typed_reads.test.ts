import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { defaultConnectorRegistry } from "../../../bun/src/registry";
import { RECONCILE_KEEP } from "./effects_final";

// GH-TYPED-READS TR-1 (v0.86.6, +0 ops at 847). Every observe op a kept Reconcile targets (24)
// declares its full normalized output, and each of the 27 kept ops declares exactly its
// observe's schema (a Reconcile returns the observe's output). Fixtures are GitHub's own
// documented 200 examples (fixtures/typed_reads/<op>.json, from github/rest-api-description)
// plus a sparse variant per op (<op>.sparse.json: only the spec-required keys, nullable ones
// null). Outputs are validated against a closed copy of the schema (additionalProperties:false
// on every declared object), so an undeclared field and a declared-but-missing field both fail.
// Passthrough sub-objects (raw, protection's upstream sub-objects, ruleset rules) are typed but
// not closed. Spec-optional or nullable upstream fields come back null, never '', 0, false,
// 'open' or 'main'.

type Op = Record<string, any>;
const ops = manifest.operations as Record<string, Op>;
const ENVELOPE = new Set(["connector", "action", "source"]);
const fixture = (name: string) => require(`../fixtures/typed_reads/${name}.json`);

export const TYPED_OBSERVES = [
  "actions.oidc.customization.sub.get", "actions.permissions.access.get", "actions.permissions.get",
  "actions.permissions.selected_actions.get", "actions.permissions.workflow.get", "branches.protection.get",
  "deployments.branch_policies.get", "discussions.get", "gists.comments.get", "gists.star.check",
  "issues.comments.get", "milestones.get", "notifications.threads.subscription.get",
  "orgs.actions.oidc.customization.sub.get", "orgs.actions.permissions.get", "orgs.actions.permissions.workflow.get",
  "pull_requests.get", "pull_requests.reviews.get", "releases.assets.get", "releases.get",
  "repos.interaction_limits.get", "repos.rulesets.get", "repos.subscription.get", "user.starred.check",
] as const;

const O = { owner: "octocat", repo: "Hello-World" };
const INPUT: Record<string, Record<string, unknown>> = {
  "actions.oidc.customization.sub.get": O,
  "actions.permissions.access.get": O,
  "actions.permissions.get": O,
  "actions.permissions.selected_actions.get": O,
  "actions.permissions.workflow.get": O,
  "branches.protection.get": { ...O, branch: "main" },
  "deployments.branch_policies.get": { ...O, environment_name: "prod", branch_policy_id: 361471 },
  "discussions.get": { ...O, discussionNumber: 7 },
  "gists.comments.get": { gistId: "aa5a315d61ae9438b18d", commentId: 1 },
  "gists.star.check": { gistId: "aa5a315d61ae9438b18d" },
  "issues.comments.get": { ...O, commentId: 1 },
  "milestones.get": { ...O, milestoneNumber: 1 },
  "notifications.threads.subscription.get": { thread_id: "1" },
  "orgs.actions.oidc.customization.sub.get": { org: "octo-org" },
  "orgs.actions.permissions.get": { org: "octo-org" },
  "orgs.actions.permissions.workflow.get": { org: "octo-org" },
  "pull_requests.get": { ...O, pullNumber: 1347 },
  "pull_requests.reviews.get": { ...O, pullNumber: 12, reviewId: 80 },
  "releases.assets.get": { ...O, assetId: 1 },
  "releases.get": { ...O, releaseId: 1 },
  "repos.interaction_limits.get": O,
  "repos.rulesets.get": { ...O, rulesetId: 42 },
  "repos.subscription.get": O,
  "user.starred.check": O,
};

/** Declared-property strict check: type (incl. nullable unions), enum, every declared property present, and no undeclared property where additionalProperties is false. */
function schemaErrors(value: unknown, schema: any, path = "$"): string[] {
  if (!schema || typeof schema !== "object") return [];
  const types: string[] | null = schema.type === undefined ? null : Array.isArray(schema.type) ? schema.type : [schema.type];
  const kind = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  if (types) {
    const ok = types.some((t) => t === kind || (t === "integer" && typeof value === "number" && Number.isInteger(value)));
    if (!ok) return [`${path}: ${kind} is not ${types.join("|")}`];
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return [`${path}: not in enum`];
  const errors: string[] = [];
  if (kind === "object" && schema.properties) {
    for (const [key, sub] of Object.entries(schema.properties)) {
      const v = (value as Record<string, unknown>)[key];
      if (v === undefined) errors.push(`${path}.${key}: missing`);
      else errors.push(...schemaErrors(v, sub, `${path}.${key}`));
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value as Record<string, unknown>)) if (!(key in schema.properties)) errors.push(`${path}.${key}: not declared`);
    }
  }
  if (kind === "array" && schema.items) (value as unknown[]).forEach((v, i) => errors.push(...schemaErrors(v, schema.items, `${path}[${i}]`)));
  return errors;
}

/** Copy of an output schema with additionalProperties:false on every object that declares properties (the normalized objects). */
function closed(schema: any): any {
  const copy = structuredClone(schema);
  const walk = (s: any) => {
    if (!s || typeof s !== "object") return;
    if (s.properties) {
      s.additionalProperties = false;
      for (const sub of Object.values(s.properties)) walk(sub);
    }
    if (s.items) walk(s.items);
  };
  walk(copy);
  return copy;
}

/** Validate an action output: payload against the closed schema; top-level keys are declared or the envelope. */
function strictErrors(key: string, output: Record<string, unknown>, schemaOf = key): string[] {
  const schema = ops[schemaOf]!.outputSchema;
  const { connector: _c, action: _a, source: _s, ...payload } = output;
  const errors = schemaErrors(payload, closed(schema));
  for (const k of Object.keys(output)) if (!ENVELOPE.has(k) && !(k in schema.properties)) errors.push(`$.${k}: not declared (top level)`);
  return errors;
}

type Reply = unknown | { status: number; body?: unknown };
async function run(key: string, input: Record<string, unknown>, reply: (method: string, url: string) => Reply) {
  const calls: string[] = [];
  const fetch = (async (url: unknown, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url}`);
    const r = reply(method, String(url)) as any;
    if (r && typeof r === "object" && "status" in r && typeof r.status === "number" && Object.keys(r).every((k) => k === "status" || k === "body")) {
      return r.body === undefined ? new Response(null, { status: r.status }) : Response.json(r.body, { status: r.status });
    }
    return Response.json(r);
  }) as unknown as typeof globalThis.fetch;
  const result = defaultConnectorRegistry.executeAction("github", key, { ...input, accessToken: "t", fetch });
  if (!result.ok) throw new Error(JSON.stringify(result));
  const output = (await Promise.resolve(result.output)) as Record<string, unknown>;
  return { output, calls };
}

const observeReply = (key: string, variant: "full" | "sparse") => {
  if (key === "gists.star.check" || key === "user.starred.check") return () => ({ status: 204 });
  const body = fixture(variant === "full" ? key : `${key}.sparse`);
  return () => body;
};

describe("GH-TYPED-READS TR-1: the 24 observes declare their full normalized output", () => {
  test("the typed observe set is the targets of the 26 kept Reconciles plus repos.interaction_limits.get", () => {
    // TR-1 amend (linus): repos.interaction_limits.set omits, but its observe stays typed.
    expect(Object.keys(RECONCILE_KEEP)).toHaveLength(26);
    expect([...new Set([...Object.values(RECONCILE_KEEP), "repos.interaction_limits.get"])].sort()).toEqual([...TYPED_OBSERVES].sort());
    expect(TYPED_OBSERVES).toHaveLength(24);
    expect(manifest.version).toBe("0.89.4");
    expect(Object.keys(ops)).toHaveLength(860);
  });

  test("no typed observe declares a bare object: every object schema with a normalized payload lists its properties", () => {
    for (const key of TYPED_OBSERVES) {
      const schema = ops[key]!.outputSchema;
      for (const [prop, sub] of Object.entries<any>(schema.properties)) {
        const t = Array.isArray(sub.type) ? sub.type : [sub.type];
        if (t.includes("object")) expect(sub.properties, `${key}.${prop}`).toBeDefined();
      }
    }
  });

  for (const key of TYPED_OBSERVES) {
    for (const variant of ["full", "sparse"] as const) {
      test(`${key} (${variant} documented fixture) validates closed`, async () => {
        const { output, calls } = await run(key, INPUT[key]!, observeReply(key, variant));
        expect(calls).toHaveLength(1);
        expect(output.action).toBe(key);
        expect(strictErrors(key, output)).toEqual([]);
      });
    }
  }

  test("alternate shapes validate closed too: 404 star checks, 204/empty interaction limits, 304 thread subscription, missing discussion", async () => {
    for (const key of ["gists.star.check", "user.starred.check"]) {
      const { output } = await run(key, INPUT[key]!, () => ({ status: 404, body: { message: "Not Found" } }));
      expect(output.starred).toBe(false);
      expect(strictErrors(key, output)).toEqual([]);
    }
    for (const reply of [{ status: 204 }, {}]) {
      const { output } = await run("repos.interaction_limits.get", O, () => reply);
      expect(output).toMatchObject({ present: false, limits: null });
      expect(strictErrors("repos.interaction_limits.get", output)).toEqual([]);
    }
    {
      const { output } = await run("notifications.threads.subscription.get", INPUT["notifications.threads.subscription.get"]!, () => ({ status: 304 }));
      expect(output).toMatchObject({ notModified: true, subscription: null });
      expect(strictErrors("notifications.threads.subscription.get", output)).toEqual([]);
    }
    {
      const { output } = await run("discussions.get", INPUT["discussions.get"]!, () => ({ data: { repository: { discussion: null } } }));
      expect(output).toMatchObject({ found: false, discussion: null });
      expect(strictErrors("discussions.get", output)).toEqual([]);
    }
  });
});

// Spec-optional or nullable upstream fields that used to be fabricated ('' / false / [] /
// 'open' / 'main') and are now null when the sparse documented fixture leaves them out or null.
const NULL_WHEN_MISSING: Record<string, Record<string, string[]>> = {
  "actions.oidc.customization.sub.get": { subject: ["includeClaimKeys", "useImmutableSubject"] },
  "actions.permissions.get": { permissions: ["allowedActions"] },
  "actions.permissions.selected_actions.get": { selectedActions: ["githubOwnedAllowed", "verifiedAllowed", "patternsAllowed"] },
  "branches.protection.get": { protection: ["url"] },
  "deployments.branch_policies.get": { policy: ["id", "name", "type", "nodeId"] },
  "discussions.get": { discussion: ["author", "isAnswered"] },
  "gists.comments.get": { comment: ["user"] },
  "issues.comments.get": { comment: ["body", "author"] },
  "milestones.get": { milestone: ["description", "dueOn", "closedAt", "creator"] },
  "notifications.threads.subscription.get": { subscription: ["reason", "createdAt", "threadUrl"] },
  "orgs.actions.oidc.customization.sub.get": { subject: ["useImmutableSubject"] },
  "orgs.actions.permissions.get": { permissions: ["allowedActions", "shaPinningRequired"] },
  "pull_requests.get": { pullRequest: ["body", "isDraft", "mergedAt", "closedAt"] },
  "pull_requests.reviews.get": { review: ["author", "commitId", "submittedAt"] },
  "releases.assets.get": { asset: ["label", "uploader"] },
  "releases.get": { release: ["name", "body", "tarballUrl", "zipballUrl", "publishedAt"] },
  "repos.rulesets.get": { ruleset: ["target", "sourceType", "rules"] },
  "repos.subscription.get": { subscription: ["reason"] },
};

describe("GH-TYPED-READS TR-1: no fabricated defaults for missing upstream fields", () => {
  for (const [key, objects] of Object.entries(NULL_WHEN_MISSING)) {
    test(`${key}: sparse fields come back null`, async () => {
      const { output } = await run(key, INPUT[key]!, observeReply(key, "sparse"));
      for (const [objectKey, fields] of Object.entries(objects)) {
        const value = output[objectKey] as Record<string, unknown>;
        for (const field of fields) expect(value[field], `${key}.${objectKey}.${field}`).toBeNull();
      }
    });
  }

  test("pull_requests.get: a missing state is null (never invented as 'open') and isOpen is false", async () => {
    const { state: _state, ...pr } = fixture("pull_requests.get");
    const { output } = await run("pull_requests.get", INPUT["pull_requests.get"]!, () => pr);
    expect((output.pullRequest as any).state).toBeNull();
    expect((output.pullRequest as any).isOpen).toBe(false);
    expect(strictErrors("pull_requests.get", output)).toEqual([]);
  });

  test("linus: releases targetBranch is null, never 'main', when target_commitish is missing (releases.get and releases.update)", async () => {
    const { target_commitish: _t, ...release } = fixture("releases.get");
    const direct = await run("releases.get", INPUT["releases.get"]!, () => release);
    expect((direct.output.release as any).targetBranch).toBeNull();
    expect(strictErrors("releases.get", direct.output)).toEqual([]);
    const reconciled = await run("releases.update", { ...O, releaseId: 1, name: "v1.0.0" }, () => release);
    expect(reconciled.output.action).toBe("releases.get");
    expect((reconciled.output.release as any).targetBranch).toBeNull();
    expect(strictErrors("releases.update", reconciled.output)).toEqual([]);
    for (const op of ["releases.get", "releases.update"]) {
      expect(ops[op]!.outputSchema.properties.release.properties.targetBranch.type).toEqual(["string", "null"]);
    }
    const present = await run("releases.get", INPUT["releases.get"]!, () => fixture("releases.get"));
    expect((present.output.release as any).targetBranch).toBe("master");
  });
});

// Kept ops: the Reconcile returns the observe output, so each kept op's schema is the observe's.
const PRIMARY_204 = new Set([
  "actions.permissions.workflow.set", "actions.permissions.set", "actions.permissions.selected_actions.set",
  "actions.permissions.access.set", "orgs.actions.permissions.workflow.set", "orgs.actions.permissions.set",
  "gists.star", "repos.star", "repos.unstar",
]);
const KEPT_INPUT: Record<string, Record<string, unknown>> = {
  "actions.oidc.customization.sub.set": { ...O, useDefault: false, includeClaimKeys: ["repo"], useImmutableSubject: true },
  "actions.permissions.access.set": { ...O, accessLevel: "organization" },
  "actions.permissions.selected_actions.set": { ...O, github_owned_allowed: true, verified_allowed: false, patterns_allowed: ["monalisa/octocat@*"] },
  "actions.permissions.set": { ...O, enabled: true, allowed_actions: "selected" },
  "actions.permissions.workflow.set": { ...O, default_workflow_permissions: "read", can_approve_pull_request_reviews: true },
  "branches.protection.update": { ...O, branch: "main", requiredStatusChecks: null, enforceAdmins: true, requiredPullRequestReviews: null, restrictions: null },
  "deployments.branch_policies.update": { ...O, environment_name: "prod", branch_policy_id: 361471, name: "release/*", type: "branch" },
  "discussions.update": { ...O, discussionNumber: 7, title: "How do I ship?" },
  "gists.comments.update": { gistId: "aa5a315d61ae9438b18d", commentId: 1, body: "Just commenting for the sake of commenting" },
  "gists.star": { gistId: "aa5a315d61ae9438b18d" },
  "issues.comments.update": { ...O, commentId: 1, body: "Me too" },
  "milestones.update": { ...O, milestoneNumber: 1, title: "v1.0" },
  "notifications.threads.subscription.set": { threadId: "1", ignored: false },
  "orgs.actions.oidc.customization.sub.set": { org: "octo-org", includeClaimKeys: ["repo", "context"] },
  "orgs.actions.permissions.set": { org: "octo-org", enabledRepositories: "all", allowedActions: "selected" },
  "orgs.actions.permissions.workflow.set": { org: "octo-org", defaultWorkflowPermissions: "read", canApprovePullRequestReviews: true },
  "pull_requests.convert_to_draft": { ...O, pullNumber: 1347 },
  "pull_requests.mark_ready": { ...O, pullNumber: 1347 },
  "pull_requests.reviews.submit": { ...O, pullNumber: 12, reviewId: 80, event: "APPROVE", body: "Here is the body for the review." },
  "pull_requests.reviews.update": { ...O, pullNumber: 12, reviewId: 80, body: "Here is the body for the review." },
  "releases.assets.update": { ...O, assetId: 1, label: "Short description" },
  "releases.update": { ...O, releaseId: 1, name: "v1.0.0" },
  "repos.rulesets.update": { ...O, rulesetId: 42, name: "super cool ruleset" },
  "repos.star": O,
  "repos.subscription.set": { ...O, subscribed: true },
  "repos.unstar": O,
};

describe("GH-TYPED-READS TR-1: the 27 kept ops declare exactly their observe's output", () => {
  test("every kept op's outputSchema deep-equals its observe's", () => {
    expect(Object.keys(KEPT_INPUT).sort()).toEqual(Object.keys(RECONCILE_KEEP).sort());
    for (const [key, observe] of Object.entries(RECONCILE_KEEP)) {
      expect(ops[key]!.outputSchema, key).toEqual(ops[observe]!.outputSchema);
    }
  });

  for (const [key, observe] of Object.entries(RECONCILE_KEEP)) {
    test(`${key} -> ${observe}: reconciled output validates closed against the kept op's schema`, async () => {
      const body = observe === "gists.star.check" || observe === "user.starred.check" ? null : fixture(observe);
      const { output, calls } = await run(key, KEPT_INPUT[key]!, (method, url) => {
        if (url.endsWith("/graphql")) {
          const pr = { id: "PR_kwDOA", isDraft: key === "pull_requests.convert_to_draft", state: "OPEN", updatedAt: "2011-01-26T19:01:12Z" };
          const disc = fixture("discussions.get").data.repository.discussion;
          return { data: { repository: { discussion: disc, pullRequest: { id: "PR_kwDOA" } }, updateDiscussion: { discussion: disc }, convertPullRequestToDraft: { pullRequest: pr }, markPullRequestReadyForReview: { pullRequest: pr } } };
        }
        if (method === "GET" && body === null) return { status: 204 };
        // selected_actions.set first checks allowed_actions is "selected" (documented actions.permissions.get example).
        if (method === "GET" && /\/actions\/permissions$/.test(url) && key === "actions.permissions.selected_actions.set") return fixture("actions.permissions.get");
        if (method !== "GET" && PRIMARY_204.has(key)) return { status: 204 };
        return body;
      });
      expect(calls.length, calls.join("\n")).toBeGreaterThanOrEqual(2);
      expect(output.action).toBe(observe);
      expect(strictErrors(key, output)).toEqual([]);
    });
  }
});

// Re-judgement of the 27 kept Reconciles by the DECLARED (now typed) schemas: every writable
// input field must map to a declared field of the observe output on the same id. Ops that
// fail are FLAGGED here (kept, not dropped) for linus.
const ID_FIELDS = new Set([
  "owner", "repo", "org", "branch", "gistId", "commentId", "milestoneNumber", "threadId", "pullNumber", "reviewId",
  "assetId", "releaseId", "rulesetId", "environment_name", "branch_policy_id", "discussionNumber", "discussionId",
]);
const READ_BACK: Record<string, Record<string, string>> = {
  "actions.oidc.customization.sub.set": { useDefault: "subject.useDefault", includeClaimKeys: "subject.includeClaimKeys", useImmutableSubject: "subject.useImmutableSubject" },
  "actions.permissions.access.set": { accessLevel: "access.accessLevel" },
  "actions.permissions.selected_actions.set": { github_owned_allowed: "selectedActions.githubOwnedAllowed", verified_allowed: "selectedActions.verifiedAllowed", patterns_allowed: "selectedActions.patternsAllowed" },
  "actions.permissions.set": { enabled: "permissions.enabled", allowed_actions: "permissions.allowedActions" },
  "actions.permissions.workflow.set": { default_workflow_permissions: "permissions.defaultWorkflowPermissions", can_approve_pull_request_reviews: "permissions.canApprovePullRequestReviews" },
  "branches.protection.update": {
    requiredStatusChecks: "protection.requiredStatusChecks", enforceAdmins: "protection.enforceAdmins",
    requiredPullRequestReviews: "protection.requiredPullRequestReviews", restrictions: "protection.restrictions",
    requiredLinearHistory: "protection.requiredLinearHistory", allowForcePushes: "protection.allowForcePushes",
    allowDeletions: "protection.allowDeletions", blockCreations: "protection.blockCreations",
    requiredConversationResolution: "protection.requiredConversationResolution", lockBranch: "protection.lockBranch",
    allowForkSyncing: "protection.allowForkSyncing",
  },
  "deployments.branch_policies.update": { name: "policy.name", type: "policy.type" },
  "discussions.update": { title: "discussion.title", body: "discussion.body", categoryId: "discussion.categoryId" },
  "gists.comments.update": { body: "comment.body" },
  "gists.star": {},
  "issues.comments.update": { body: "comment.body" },
  "milestones.update": { title: "milestone.title", state: "milestone.state", description: "milestone.description", dueOn: "milestone.dueOn" },
  "notifications.threads.subscription.set": { ignored: "subscription.ignored" },
  "orgs.actions.oidc.customization.sub.set": { includeClaimKeys: "subject.includeClaimKeys", useImmutableSubject: "subject.useImmutableSubject" },
  "orgs.actions.permissions.set": { enabledRepositories: "permissions.enabledRepositories", allowedActions: "permissions.allowedActions", shaPinningRequired: "permissions.shaPinningRequired" },
  "orgs.actions.permissions.workflow.set": { defaultWorkflowPermissions: "permissions.defaultWorkflowPermissions", canApprovePullRequestReviews: "permissions.canApprovePullRequestReviews" },
  "pull_requests.convert_to_draft": {},
  "pull_requests.mark_ready": {},
  "pull_requests.reviews.submit": { event: "review.state", body: "review.body" },
  "pull_requests.reviews.update": { body: "review.body" },
  "releases.assets.update": { name: "asset.name", label: "asset.label", state: "asset.state" },
  "releases.update": { tagName: "release.tagName", name: "release.name", body: "release.body", draft: "release.draft", prerelease: "release.prerelease", targetCommitish: "release.targetBranch" },
  "repos.rulesets.update": { name: "ruleset.name", enforcement: "ruleset.enforcement", target: "ruleset.target", rules: "ruleset.rules", bypassActors: "ruleset.bypassActors", conditions: "ruleset.conditions" },
  "repos.star": {},
  "repos.subscription.set": { subscribed: "subscription.subscribed", ignored: "subscription.ignored" },
  "repos.unstar": {},
};
// Writable fields with no declared read-back. TR-1 flagged 3 ops; the TR-1 amend (linus) typed the
// protection toggles and ruleset bypassActors/conditions, and omitted repos.interaction_limits.set.
export const REJUDGE_FLAGS: Record<string, string[]> = {};

describe("GH-TYPED-READS TR-1: re-judge the 26 kept Reconciles by the declared schemas", () => {
  test("every writable field is read back by a declared observe field, except the exact flagged set", () => {
    expect(Object.keys(READ_BACK).sort()).toEqual(Object.keys(RECONCILE_KEEP).sort());
    for (const [key, observe] of Object.entries(RECONCILE_KEEP)) {
      const writable = Object.keys(ops[key]!.inputSchema.properties ?? {}).filter((f) => !ID_FIELDS.has(f)).sort();
      const covered = Object.keys(READ_BACK[key]!);
      const flagged = REJUDGE_FLAGS[key] ?? [];
      expect([...covered, ...flagged].sort(), key).toEqual(writable);
      for (const path of Object.values(READ_BACK[key]!)) {
        const [objectKey, field] = path.split(".");
        const declared = ops[observe]!.outputSchema.properties[objectKey!]?.properties ?? {};
        expect(field! in declared, `${key}: ${path} declared on ${observe}`).toBe(true);
      }
    }
    // TR-1 amend: 0 flags. Every kept op is exact by the declared schemas.
    expect(Object.keys(REJUDGE_FLAGS)).toEqual([]);
    expect(Object.keys(READ_BACK)).toHaveLength(26);
  });
});

// TR-1 amend (linus) mapping tests: each written input reads back on the same field of the
// observe output (same branch / same rulesetId), through the Reconcile, validated closed.
describe("GH-TYPED-READS TR-1 amend: branches.protection.update and repos.rulesets.update read back every written field", () => {
  const enabled = (v: unknown) => (typeof v === "boolean" ? { enabled: v } : undefined);
  test("branches.protection.update: 11 written fields read back on branches.protection.get for the same branch", async () => {
    const input = {
      ...O, branch: "main",
      requiredStatusChecks: { strict: true, contexts: ["ci/build"] },
      enforceAdmins: true,
      requiredPullRequestReviews: { dismissStaleReviews: true, requireCodeOwnerReviews: false, requiredApprovingReviewCount: 2, requireLastPushApproval: true },
      restrictions: { users: ["octocat"], teams: ["justice-league"], apps: ["octoapp"] },
      requiredLinearHistory: true, allowForcePushes: false, allowDeletions: false, blockCreations: true,
      requiredConversationResolution: true, lockBranch: false, allowForkSyncing: true,
    };
    let stored: Record<string, any> = {};
    // The mock echoes GitHub's GET shape for what the PUT sent, so the observe reads it back.
    const sent: Record<string, any>[] = [];
    const captured = await (async () => {
      const fetch = (async (url: unknown, init?: RequestInit) => {
        if ((init?.method ?? "GET") === "PUT") {
          const body = JSON.parse(String(init?.body));
          sent.push(body);
          stored = {
            url: String(url),
            enforce_admins: { url: `${url}/enforce_admins`, enabled: body.enforce_admins },
            required_status_checks: body.required_status_checks && { ...body.required_status_checks, url: `${url}/required_status_checks` },
            required_pull_request_reviews: body.required_pull_request_reviews && { ...body.required_pull_request_reviews, url: `${url}/required_pull_request_reviews` },
            restrictions: body.restrictions && {
              users: body.restrictions.users.map((login: string) => ({ login })),
              teams: body.restrictions.teams.map((slug: string) => ({ slug })),
              apps: body.restrictions.apps.map((slug: string) => ({ slug })),
            },
            required_linear_history: enabled(body.required_linear_history),
            allow_force_pushes: enabled(body.allow_force_pushes),
            allow_deletions: enabled(body.allow_deletions),
            block_creations: enabled(body.block_creations),
            required_conversation_resolution: enabled(body.required_conversation_resolution),
            lock_branch: enabled(body.lock_branch),
            allow_fork_syncing: enabled(body.allow_fork_syncing),
          };
          return Response.json(stored);
        }
        return Response.json(stored);
      }) as unknown as typeof globalThis.fetch;
      const r = defaultConnectorRegistry.executeAction("github", "branches.protection.update", { ...input, accessToken: "t", fetch });
      if (!r.ok) throw new Error(JSON.stringify(r));
      return (await Promise.resolve(r.output)) as Record<string, any>;
    })();
    expect(sent).toHaveLength(1);
    expect(strictErrors("branches.protection.update", captured)).toEqual([]);
    const p = captured.protection;
    for (const field of ["enforceAdmins", "requiredLinearHistory", "allowForcePushes", "allowDeletions", "blockCreations", "requiredConversationResolution", "lockBranch", "allowForkSyncing"] as const) {
      expect(p[field], field).toBe(input[field]);
    }
    expect(p.requiredStatusChecks).toMatchObject({ strict: true, contexts: ["ci/build"] });
    expect(p.requiredPullRequestReviews).toMatchObject({ dismiss_stale_reviews: true, require_code_owner_reviews: false, required_approving_review_count: 2, require_last_push_approval: true });
    expect(p.restrictions.users.map((u: any) => u.login)).toEqual(["octocat"]);
    expect(p.restrictions.teams.map((t: any) => t.slug)).toEqual(["justice-league"]);
    expect(p.restrictions.apps.map((a: any) => a.slug)).toEqual(["octoapp"]);
    // Absent toggles are null, never a fabricated false.
    const sparse = await run("branches.protection.get", INPUT["branches.protection.get"]!, () => ({ url: "https://api.github.com/x" }));
    for (const field of ["enforceAdmins", "requiredLinearHistory", "allowForcePushes", "allowDeletions", "blockCreations", "requiredConversationResolution", "lockBranch", "allowForkSyncing"]) {
      expect((sparse.output.protection as any)[field], field).toBeNull();
    }
  });

  test("repos.rulesets.update: bypassActors and conditions read back on repos.rulesets.get for the same rulesetId", async () => {
    const input = {
      ...O, rulesetId: 42, name: "super cool ruleset", enforcement: "active", target: "branch",
      bypassActors: [{ actorId: 234, actorType: "Team", bypassMode: "always" }, { actorId: null, actorType: "DeployKey", bypassMode: "always" }],
      conditions: { refName: { include: ["refs/heads/main", "refs/heads/master"], exclude: ["refs/heads/dev*"] } },
      rules: [{ type: "commit_author_email_pattern", parameters: { operator: "contains", pattern: "github" } }],
    };
    let stored: Record<string, any> = {};
    const sent: Record<string, any>[] = [];
    const fetch = (async (url: unknown, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.github.com/repos/octocat/Hello-World/rulesets/42");
      if ((init?.method ?? "GET") === "PUT") {
        const body = JSON.parse(String(init?.body));
        sent.push(body);
        stored = { ...fixture("repos.rulesets.get"), ...body, id: 42 };
      }
      return Response.json(stored);
    }) as unknown as typeof globalThis.fetch;
    const r = defaultConnectorRegistry.executeAction("github", "repos.rulesets.update", { ...input, accessToken: "t", fetch });
    if (!r.ok) throw new Error(JSON.stringify(r));
    const output = (await Promise.resolve(r.output)) as Record<string, any>;
    expect(sent).toHaveLength(1);
    expect(sent[0]!.bypass_actors).toEqual([{ actor_id: 234, actor_type: "Team", bypass_mode: "always" }, { actor_id: null, actor_type: "DeployKey", bypass_mode: "always" }]);
    expect(output.action).toBe("repos.rulesets.get");
    expect(strictErrors("repos.rulesets.update", output)).toEqual([]);
    expect(output.ruleset.rulesetId).toBe(42);
    expect(output.ruleset.bypassActors).toEqual(input.bypassActors);
    expect(output.ruleset.conditions).toEqual(input.conditions);
    expect(output.ruleset.name).toBe(input.name);
    expect(output.ruleset.enforcement).toBe(input.enforcement);
    expect(output.ruleset.target).toBe(input.target);
    // Absent bypass_actors / conditions are null, never [] / {}.
    const sparse = await run("repos.rulesets.get", INPUT["repos.rulesets.get"]!, () => fixture("repos.rulesets.get.sparse"));
    expect((sparse.output.ruleset as any).bypassActors).toBeNull();
    expect((sparse.output.ruleset as any).conditions).toBeNull();
  });
});
