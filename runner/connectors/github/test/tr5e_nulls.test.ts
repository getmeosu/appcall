import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { normalizeReaction } from "../src/card10_reads";
import { normalizeRunner as normalizeCard11Runner } from "../src/card11_reads";
import { normalizeGist, normalizeGistCommit, normalizeIssueComment, normalizeIssueEvent } from "../src/card12_reads";
import { normalizeRoleTeam, normalizeRunTiming, normalizeTeamRepoPermission } from "../src/card13_reads";
import { normalizeRepoComment } from "../src/card17_reads";
import { normalizeCodeOfConduct } from "../src/card6_reads";
import { normalizeCodespaceDefaults } from "../src/card9_reads";
import { normalizeCommitComment } from "../src/commits";
import { normalizeAttestation } from "../src/gap_g1";
import { normalizeGitHubHook } from "../src/governance";
import { normalizeOrgSecret } from "../src/gap_g10";
import { normalizeCodespace } from "../src/gap_g5";
import { normalizeGitHubLabel } from "../src/issues";
import { normalizeConversationComment, normalizeGitHubReviewComment } from "../src/pull_requests";
import { normalizeCodeownersError, normalizeDependencyChange } from "../src/repos";
import { normalizeContributor } from "../src/traffic";
import { normalizeCache, normalizeRunApproval } from "../src/workflows";

// TR-5e (v0.89.6, +0 ops): last exact-schema nullability batch against pinned spec
// rest-api-description 58b1e0c0 (gap_g1 attestations, card11 runner labels, gap_g10 org secret, and the
// TR-5 audit's review / unmapped rows). Optional or nullable fields come back null; spec-required
// non-nullable fields keep their fallback. Every assertion below fails on v0.89.5 (TR-5d 4637a209).

const ops = manifest.operations as Record<string, { outputSchema?: Record<string, unknown> }>;

function typeAt(op: string, path: string): unknown {
  let s = ops[op]?.outputSchema as Record<string, any>;
  for (const raw of path.split(".")) {
    const arr = raw.endsWith("[]");
    s = s.properties[arr ? raw.slice(0, -2) : raw];
    if (arr) s = s.items;
  }
  return s.type;
}

describe("TR-5e: sparse upstream objects normalize to null, not fabricated values", () => {
  test("gap_g1 attestation, card11 runner labels, gap_g10 org secret", () => {
    const a = normalizeAttestation({ bundle: {} });
    expect([a.repositoryId, a.bundleUrl]).toEqual([null, null]);
    const r = normalizeCard11Runner({ id: 1, name: "r", os: "linux", status: "online", busy: true, labels: [{ name: "self-hosted" }] });
    expect(r.labels).toEqual([{ id: null, name: "self-hosted", type: null }]);
    expect(r.busy).toBe(true);
    const s = normalizeOrgSecret({ name: "S", created_at: "t", updated_at: "t", visibility: "all" });
    expect([s.selectedRepositoriesUrl, s.visibility]).toEqual([null, "all"]);
  });

  test("workflows: actions-cache items (all optional), environment-approvals environments id / name (optional)", () => {
    const c = normalizeCache({});
    expect([c.id, c.ref, c.key, c.version, c.lastAccessedAt, c.createdAt, c.sizeInBytes]).toEqual([null, null, null, null, null, null, null]);
    const ap = normalizeRunApproval({ state: "approved", comment: "", user: { login: "u" }, environments: [{}] });
    expect(ap.environments).toEqual([{ id: null, name: null }]);
  });

  test("repos: codeowners error source / suggestion (optional), dependency change package_url / license (nullable)", () => {
    const e = normalizeCodeownersError({ line: 1, column: 1, kind: "k", message: "m", path: "p", suggestion: null });
    expect([e.source, e.suggestion, e.line]).toEqual([null, null, 1]);
    const d = normalizeDependencyChange({ change_type: "added", name: "x", version: "1", package_url: null, license: null });
    expect([d.packageUrl, d.license, d.name]).toEqual([null, null, "x"]);
  });

  test("card13: team-repository permissions maintain / triage (optional), run timing run_duration_ms (optional)", () => {
    const p = normalizeTeamRepoPermission({ id: 1, name: "r", full_name: "o/r", permissions: { admin: false, push: true, pull: true } });
    expect([p.permissions.maintain, p.permissions.triage, p.permissions.push]).toEqual([null, null, true]);
    expect(normalizeRunTiming({ billable: {} }).runDurationMs).toBeNull();
  });

  test("users on comments / events / reactions are nullable (ghost users)", () => {
    expect(normalizeCommitComment({ id: 1, body: "b", user: null, path: null, commit_id: "c" })).toMatchObject({ author: null, path: null, body: "b" });
    expect(normalizeConversationComment({ id: 1, body: "b", user: null }).author).toBeNull();
    expect(normalizeRepoComment({ id: 1, body: "b", user: null }).userLogin).toBeNull();
    expect(normalizeIssueComment({ id: 1, body: "b", user: null }).user).toBeNull();
    expect(normalizeIssueEvent({ id: 1, event: "closed", actor: null }).actor).toBeNull();
    expect(normalizeReaction({ id: 1, content: "+1", created_at: "t", user: null }).userLogin).toBeNull();
    expect(normalizeGistCommit({ version: "v", user: null, committed_at: "t" }).user).toBeNull();
    expect(normalizeContributor({ total: 3, weeks: [], author: null })).toMatchObject({ login: null, id: null, total: 3 });
  });

  test("gist owner (optional), code of conduct html_url (nullable) / body (optional), codespace machine (nullable), issue label description", () => {
    expect(normalizeGist({ id: "g", public: true }).owner).toBeNull();
    const c = normalizeCodeOfConduct({ key: "k", name: "n", url: "u", html_url: null });
    expect([c.htmlUrl, c.body]).toEqual([null, null]);
    expect(normalizeCodespace({ id: 1, name: "cs", machine: null }).machineName).toBeNull();
    expect(normalizeGitHubLabel({ id: 1, name: "bug", color: "f00", description: null } as never).description).toBeNull();
  });

  test("hook config url / content_type (optional), role-team assignment (optional), review comment user, codespace defaults", () => {
    const h = normalizeGitHubHook({ id: 1, name: "web", active: true, events: ["push"], config: {} } as never);
    expect([h.configUrl, h.contentType]).toEqual([null, null]);
    expect(normalizeRoleTeam({ id: 1, name: "t", slug: "t" }).assignment).toBeNull();
    expect(normalizeGitHubReviewComment({ id: 1, body: "b", path: "p", user: null }).author).toBeNull();
    const d = normalizeCodespaceDefaults({ defaults: { location: "WestUs2", devcontainer_path: null } });
    expect([d.location, d.devcontainerPath, d.billableOwner]).toEqual(["WestUs2", null, null]);
  });
});

describe("TR-5e: widened output schemas admit the nulls", () => {
  const cache = ["id", "ref", "key", "version", "lastAccessedAt", "createdAt", "sizeInBytes"].map((f) => `caches[].${f}`);
  const widened: Record<string, string[]> = {
    "actions.caches.list": cache,
    "actions.caches.delete_by_key": cache,
    "actions.runs.timing.get": ["timing.runDurationMs"],
    "commits.comments.list": ["comments[].author", "comments[].path"],
    "commits.comments.update": ["comment.author", "comment.path"],
    "commits.comments.reactions.list": ["reactions[].userLogin"],
    "issues.comments.reactions.list": ["reactions[].userLogin"],
    "issues.reactions.list": ["reactions[].userLogin"],
    "pull_requests.review_comments.reactions.list": ["reactions[].userLogin"],
    "releases.reactions.list": ["reactions[].userLogin"],
    "dependency_graph.compare": ["changes[].packageUrl", "changes[].license"],
    "orgs.teams.repos.permission.get": ["permission.permissions.maintain", "permission.permissions.triage"],
    "orgs.actions.runners.list": ["runners[].labels[].id", "runners[].labels[].type"],
    "repos.actions.runners.list": ["runners[].labels[].id", "runners[].labels[].type"],
    "repos.codeowners.errors.list": ["errors[].source", "errors[].suggestion"],
    "repos.stats.contributors.list": ["contributors[].login", "contributors[].id"],
    "users.attestations.list": ["attestations[].repositoryId", "attestations[].bundleUrl"],
    "orgs.hooks.get": ["hook.configUrl", "hook.contentType"],
    "repos.hooks.get": ["hook.configUrl", "hook.contentType"],
    "orgs.hooks.list": ["hooks[].configUrl", "hooks[].contentType"],
    "orgs.organization_roles.teams.list": ["teams[].assignment"],
    "pull_requests.review_comments.list": ["comments[].author"],
    "pull_requests.review_comments.create": ["comment.author"],
    "pull_requests.review_comments.reply": ["comment.author"],
    "pull_requests.review_comments.update": ["comment.author"],
  };
  for (const [op, paths] of Object.entries(widened)) {
    test(op, () => {
      for (const p of paths) expect(typeAt(op, p)).toContain("null");
    });
  }
});
