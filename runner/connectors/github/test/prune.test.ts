import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import manifest from "../manifest.json";
import coverage from "../fixtures/composio-coverage.json";
import * as actions from "../src/actions";

// PRUNE chain (audit a1549a6d §5A). Each pruned op is gone from the manifest and, when it
// was hand-written, from the action exports. The G12 module (src/gap_g12.ts) is deleted in
// PRUNE-3 because all 40 of its ops are pruned.

const PROJECTS_CLASSIC = "https://github.blog/changelog/2024-05-23-sunset-notice-projects-classic/";
const CLASSROOM = "https://github.blog/changelog/2026-08-27-github-classroom-deprecated/";
const SOURCE_IMPORTS = "https://github.blog/changelog/2023-10-11-deprecation-source-imports-rest-api/";

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
  test("version 0.84.0 at 867 ops", () => {
    expect(manifest.version).toBe("0.84.0");
    expect(Object.keys(manifest.operations)).toHaveLength(867);
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
  });

  test("linus: GITHUB_GET_TEAM_MEMBERS maps to the documented replacement teams.members.list", () => {
    const mapped = coverage.mapped as Record<string, string>;
    expect(mapped.GITHUB_GET_TEAM_MEMBERS).toBe("teams.members.list");
    expect((manifest.operations as Record<string, unknown>)["teams.members.list"]).toBeDefined();
    expect((coverage.missing_still as Array<{ slug: string }>).map((m) => m.slug)).not.toContain("GITHUB_GET_TEAM_MEMBERS");
  });
});
