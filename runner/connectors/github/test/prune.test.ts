import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import manifest from "../manifest.json";
import coverage from "../fixtures/composio-coverage.json";
import * as actions from "../src/actions";

// PRUNE chain (audit a1549a6d §5A). Each pruned op is gone from the manifest and, when it
// was hand-written, from the action exports. The G12 module (src/gap_g12.ts) is deleted in
// PRUNE-3 because all 40 of its ops are pruned. PRUNE-4 (0.85.0) removes 14 declarative ops; PRUNE-5 (0.86.0) 6 more.

const PROJECTS_CLASSIC = "https://github.blog/changelog/2024-05-23-sunset-notice-projects-classic/";
const CLASSROOM = "https://github.blog/changelog/2026-08-27-github-classroom-deprecated/";
const SOURCE_IMPORTS = "https://github.blog/changelog/2023-10-11-deprecation-source-imports-rest-api/";
const PAT_ADMIN = "https://docs.github.com/rest/orgs/personal-access-tokens";
const SPEC_PIN = "58b1e0c00b39b9e46c24dc4a0ba6a2669c90e9c1";
const GITHUB_MODELS = "https://github.blog/changelog/2026-07-30-github-models-is-now-retired/";

// op -> exported action function (null = declarative manifest op, no export)
const PRUNE_1: Record<string, string | null> = {
  "projects.get": "getProject",
  "projects.update": "updateProject",
  "projects.delete": "deleteProject",
  "orgs.projects.list": "listOrgClassicProjects",
  "orgs.projects.create": "createOrgProject",
  "repos.projects.list": "listRepoProjects",
  "repos.projects.create": "createRepoProject",
  "users.projects.list": "listUserClassicProjects",
  "user.projects.create": "createUserProject",
  "projects.columns.list": "listProjectColumns",
  "projects.columns.create": "createProjectColumn",
  "projects.columns.get": "getProjectColumn",
  "projects.columns.update": "updateProjectColumn",
  "projects.columns.delete": "deleteProjectColumn",
  "projects.columns.move": "moveProjectColumn",
};

const PRUNE_2: Record<string, string | null> = {
  "projects.cards.list": "listProjectCards",
  "projects.cards.create": "createProjectCard",
  "projects.cards.get": "getProjectCard",
  "projects.cards.update": "updateProjectCard",
  "projects.cards.delete": "deleteProjectCard",
  "projects.cards.move": "moveProjectCard",
  "projects.collaborators.list": "listProjectCollaborators",
  "projects.collaborators.add": "addProjectCollaborator",
  "projects.collaborators.remove": "removeProjectCollaborator",
  "projects.collaborators.permission.get": "getProjectCollaboratorPermission",
  "orgs.teams.projects.list": "listTeamProjects",
  "orgs.teams.projects.add": "addTeamProject",
  "orgs.teams.projects.remove": "removeTeamProject",
  "orgs.teams.projects.permission.get": "getTeamProjectPermission",
  "rest.teams.list_members_legacy": null,
};

const PRUNE_3: Record<string, string | null> = {
  "classrooms.list": "listClassrooms",
  "classrooms.get": "getClassroom",
  "classrooms.assignments.list": "listClassroomAssignments",
  "assignments.get": "getAssignment",
  "assignments.grades.list": "listAssignmentGrades",
  "assignments.accepted.list": "listAcceptedAssignments",
  "teams.discussions.list": "listTeamDiscussions",
  "teams.discussions.get": "getTeamDiscussion",
  "teams.discussions.create": "createTeamDiscussion",
  "teams.discussions.update": "updateTeamDiscussion",
  "teams.discussions.delete": "deleteTeamDiscussion",
  "rest.migrations.get_commit_authors": null,
  "rest.migrations.get_large_files": null,
  "rest.migrations.map_commit_author": null,
  "rest.migrations.set_lfs_preference": null,
};

// PRUNE-4: second-auth GitHub App / OAuth App endpoints (live, NOT deprecated: they need Basic client_id:secret,
// an app JWT, the manifest-flow code, an installation token or a GitHub App user token, never the connector's
// OAuth App user token) plus the retired GitHub Models inference API. All declarative.
const PRUNE_4: Record<string, string | null> = {
  "rest.apps.check_token": null,
  "rest.apps.reset_token": null,
  "rest.apps.delete_token": null,
  "rest.apps.delete_authorization": null,
  "rest.apps.scope_token": null,
  "rest.apps.create_from_manifest": null,
  "rest.apps.list_installation_requests_for_authenticated_app": null,
  "rest.apps.list_repos_accessible_to_installation": null,
  "rest.apps.revoke_installation_access_token": null,
  "rest.apps.list_installations_for_authenticated_user": null,
  "rest.apps.list_installation_repos_for_authenticated_user": null,
  "rest.x.CHAT": null,
  "rest.x.EMBED": null,
  "rest.x.MODELS": null,
};

// PRUNE-5: fine-grained-PAT admin routes. Live, NOT deprecated; spec + docs: "Only GitHub Apps can use this endpoint."
const PRUNE_5: Record<string, string | null> = {
  "rest.orgs.list_pat_grants": null,
  "rest.orgs.list_pat_grant_requests": null,
  "rest.orgs.review_pat_grant_request": null,
  "rest.orgs.review_pat_grant_requests_in_bulk": null,
  "rest.orgs.update_pat_accesses": null,
  "rest.orgs.update_pat_access": null,
};

function expectGone(table: Record<string, string | null>) {
  const ops = manifest.operations as Record<string, unknown>;
  const exported = actions as Record<string, unknown>;
  const mapped = new Set(Object.values(coverage.mapped as Record<string, string>));
  for (const [op, fn] of Object.entries(table)) {
    expect(ops[op], op).toBeUndefined();
    expect(mapped.has(op), op).toBe(false);
    expect(coverage.added as string[]).not.toContain(op);
    if (fn) expect(exported[fn], fn).toBeUndefined();
  }
}

describe("github PRUNE chain", () => {
  test("version 0.86.3 at 847 ops", () => {
    expect(manifest.version).toBe("0.86.3");
    expect(Object.keys(manifest.operations)).toHaveLength(847);
  });

  test("PRUNE-1: 15 Projects (classic) project/column ops are gone", () => {
    expect(Object.keys(PRUNE_1)).toHaveLength(15);
    expectGone(PRUNE_1);
  });

  test("PRUNE-2: 14 classic card/collaborator/team-project ops + the legacy team-members route are gone", () => {
    expect(Object.keys(PRUNE_2)).toHaveLength(15);
    expectGone(PRUNE_2);
    for (const key of Object.keys(manifest.operations)) expect(key.startsWith("projects."), key).toBe(false);
  });

  test("PRUNE-3: Classroom, team discussions and Source Imports ops are gone and src/gap_g12.ts is deleted", () => {
    expect(Object.keys(PRUNE_3)).toHaveLength(15);
    expectGone(PRUNE_3);
    expect(existsSync(join(import.meta.dir, "..", "src", "gap_g12.ts"))).toBe(false);
    for (const key of Object.keys(manifest.operations)) {
      expect(key.startsWith("classrooms.") || key.startsWith("assignments.") || key.startsWith("teams.discussions."), key).toBe(false);
    }
  });

  test("PRUNE-4: second-auth app ops and GitHub Models ops are gone; models.github.ai left allowedHosts", () => {
    expect(Object.keys(PRUNE_4)).toHaveLength(14);
    expectGone(PRUNE_4);
    for (const op of Object.keys(PRUNE_4)) {
      expect(existsSync(join(import.meta.dir, "..", "fixtures", "cases", `${op.replaceAll(".", "_")}.json`)), op).toBe(false);
    }
    expect(manifest.network.allowedHosts).not.toContain("models.github.ai");
    for (const spec of Object.values(manifest.operations)) {
      const base = (spec as { request?: { baseUrl?: string } }).request?.baseUrl;
      if (base !== undefined) expect(base.includes("models.github.ai"), base).toBe(false);
    }
  });

  test("PRUNE-5: GitHub-Apps-only fine-grained-PAT admin ops are gone", () => {
    expect(Object.keys(PRUNE_5)).toHaveLength(6);
    expectGone(PRUNE_5);
    for (const op of Object.keys(PRUNE_5)) {
      expect(existsSync(join(import.meta.dir, "..", "fixtures", "cases", `${op.replaceAll(".", "_")}.json`)), op).toBe(false);
    }
    for (const spec of Object.values(manifest.operations)) {
      const path = (spec as { request?: { path?: string } }).request?.path;
      if (path !== undefined) expect(path.includes("/personal-access-token"), path).toBe(false);
    }
  });

  test("pruned Composio slugs are recorded in missing_still with their cite", () => {
    const missing = new Map((coverage.missing_still as Array<{ slug: string; reason: string }>).map((m) => [m.slug, m.reason]));
    for (const slug of ["GITHUB_GET_A_PROJECT", "GITHUB_LIST_PROJECT_CARDS", "GITHUB_LIST_TEAM_PROJECTS"]) {
      expect(missing.get(slug), slug).toContain(PROJECTS_CLASSIC);
    }
    for (const slug of [
      "GITHUB_LIST_CLASSROOMS",
      "GITHUB_GET_CLASSROOM",
      "GITHUB_LIST_ASSIGNMENTS_FOR_A_CLASSROOM",
      "GITHUB_GET_AN_ASSIGNMENT",
      "GITHUB_GET_ASSIGNMENT_GRADES",
      "GITHUB_LIST_ACCEPTED_ASSIGNMENTS_FOR_AN_ASSIGNMENT",
    ]) {
      expect(missing.get(slug), slug).toContain(CLASSROOM);
    }
    for (const slug of ["GITHUB_GET_COMMIT_AUTHORS", "GITHUB_GET_LARGE_FILES", "GITHUB_MAP_A_COMMIT_AUTHOR", "GITHUB_UPDATE_GIT_LFS_PREFERENCE"]) {
      expect(missing.get(slug), slug).toContain(SOURCE_IMPORTS);
    }
    for (const slug of [
      "GITHUB_LIST_ORG_RESOURCE_ACCESS_TOKENS",
      "GITHUB_LIST_ORG_RESOURCES_WITH_PERSONAL_TOKENS",
      "GITHUB_REVIEW_ACCESS_WITH_PERSONAL_TOKEN",
      "GITHUB_REVIEW_RESOURCE_REQUESTS_WITH_FINE_GRAINED_TOKENS",
      "GITHUB_UPDATE_RESOURCE_ACCESS_WITH_TOKENS",
      "GITHUB_UPDATE_TOKEN_ORG_ACCESS",
    ]) {
      const reason = missing.get(slug) ?? "";
      expect(reason, slug).toContain(PAT_ADMIN);
      expect(reason, slug).toContain(SPEC_PIN);
      expect(reason, slug).toContain("Only GitHub Apps can use this endpoint.");
      expect(reason, slug).toContain("not a deprecation");
    }
    for (const slug of ["GITHUB_CREATE_INFERENCE_CHAT_COMPLETIONS", "GITHUB_CREATE_INFERENCE_EMBEDDINGS", "GITHUB_GET_CATALOG_MODELS"]) {
      expect(missing.get(slug), slug).toContain(GITHUB_MODELS);
    }
    for (const slug of [
      "GITHUB_CHECK_TOKEN",
      "GITHUB_RESET_A_TOKEN",
      "GITHUB_DELETE_APP_TOKEN",
      "GITHUB_DELETE_APP_AUTHORIZATION",
      "GITHUB_CREATE_A_SCOPED_ACCESS_TOKEN",
      "GITHUB_CREATE_A_GITHUB_APP_FROM_A_MANIFEST",
      "GITHUB_LIST_INSTALLATION_REQUESTS_FOR_THE_AUTHENTICATED_APP",
      "GITHUB_LIST_REPOSITORIES_ACCESSIBLE_TO_THE_APP_INSTALLATION",
      "GITHUB_REVOKE_AN_INSTALLATION_ACCESS_TOKEN",
      "GITHUB_LIST_ACCESSIBLE_REPOSITORIES",
      "GITHUB_LIST_APP_INSTALLATIONS",
      "GITHUB_LIST_REPO_ACCESS_BY_TOKEN",
      "GITHUB_LIST_TOKEN_ACCESS_REPOSITORIES",
    ]) {
      const reason = missing.get(slug) ?? "";
      expect(reason, slug).toContain("https://docs.github.com/rest/");
      expect(reason, slug).toContain("not a deprecation");
    }
  });

  test("linus: GITHUB_GET_TEAM_MEMBERS maps to the documented replacement teams.members.list", () => {
    const mapped = coverage.mapped as Record<string, string>;
    expect(mapped.GITHUB_GET_TEAM_MEMBERS).toBe("teams.members.list");
    expect((manifest.operations as Record<string, unknown>)["teams.members.list"]).toBeDefined();
    expect((coverage.missing_still as Array<{ slug: string }>).map((m) => m.slug)).not.toContain("GITHUB_GET_TEAM_MEMBERS");
  });
});
