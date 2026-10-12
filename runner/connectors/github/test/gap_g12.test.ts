import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import * as actions from "../src/actions";
import {
  createTeamDiscussion,
  deleteTeamDiscussion,
  getAssignment,
  getClassroom,
  getTeamDiscussion,
  listAcceptedAssignments,
  listAssignmentGrades,
  listClassroomAssignments,
  listClassrooms,
  listTeamDiscussions,
  updateTeamDiscussion,
} from "../src/actions";
import {
  validateCreateTeamDiscussionInput,
  validateListClassroomsInput,
} from "../src/gap_g12";
import { createGapG12Client } from "../src/gap_g12";

const PATHS: Record<string, { methodPath: string; sideEffect: "read" | "write" }> = {
  "classrooms.list": { methodPath: "GET /classrooms", sideEffect: "read" },
  "classrooms.get": { methodPath: "GET /classrooms/{classroom_id}", sideEffect: "read" },
  "classrooms.assignments.list": { methodPath: "GET /classrooms/{classroom_id}/assignments", sideEffect: "read" },
  "assignments.get": { methodPath: "GET /assignments/{assignment_id}", sideEffect: "read" },
  "assignments.grades.list": { methodPath: "GET /assignments/{assignment_id}/grades", sideEffect: "read" },
  "assignments.accepted.list": { methodPath: "GET /assignments/{assignment_id}/accepted_assignments", sideEffect: "read" },
  "teams.discussions.list": { methodPath: "GET /orgs/{org}/teams/{team_slug}/discussions", sideEffect: "read" },
  "teams.discussions.get": { methodPath: "GET /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}", sideEffect: "read" },
  "teams.discussions.create": { methodPath: "POST /orgs/{org}/teams/{team_slug}/discussions", sideEffect: "write" },
  "teams.discussions.update": { methodPath: "PATCH /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}", sideEffect: "write" },
  "teams.discussions.delete": { methodPath: "DELETE /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}", sideEffect: "write" },
};

type Seen = { url: string; method: string; body?: string; contentType?: string | null; accept?: string | null };

function recorder(responses: Response[] | (() => Response)) {
  const seen: Seen[] = [];
  let i = 0;
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    seen.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: init?.body as string | undefined,
      contentType: headers.get("Content-Type"),
      accept: headers.get("Accept"),
    });
    if (typeof responses === "function") return responses();
    return responses[i++];
  };
  return { seen, fetch };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function empty(status: number) {
  return new Response(null, { status });
}

describe("github gap G12 classroom and team discussions", () => {
  test("version is 0.83.0 at 882 ops with the read/write breakdown (PRUNE-2)", () => {
    expect(manifest.version).toBe("0.83.0");
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(ops)).toHaveLength(882);
    const kinds = { action: 0, sync: 0, webhook: 0 };
    const side = { read: 0, write: 0, absent: 0 };
    for (const spec of Object.values(ops)) {
      kinds[spec.kind as keyof typeof kinds] += 1;
      if (spec.kind === "action") {
        if (spec.sideEffect === "read") side.read += 1;
        else if (spec.sideEffect === "write") side.write += 1;
        else side.absent += 1;
      }
    }
    expect(kinds).toEqual({ action: 832, sync: 4, webhook: 46 });
    expect(side).toEqual({ read: 439, write: 378, absent: 15 });
  });

  test("the eleven remaining G12 ops omit effect keys and document their paths", () => {
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(PATHS)).toHaveLength(11);
    let reads = 0;
    let writes = 0;
    for (const [key, meta] of Object.entries(PATHS)) {
      const spec = ops[key];
      expect(spec, key).toBeDefined();
      expect(spec.kind).toBe("action");
      expect(spec.sideEffect).toBe(meta.sideEffect);
      expect(String(spec.description)).toContain(meta.methodPath.split(" ")[1]);
      expect(spec.effectPolicy).toBeUndefined();
      expect(spec.reconcile).toBeUndefined();
      expect(spec.effect).toBeUndefined();
      if (meta.sideEffect === "read") reads += 1;
      else writes += 1;
    }
    expect(reads).toBe(8);
    expect(writes).toBe(3);
  });

  test("webhooks keep sideEffect read or absent, never write", () => {
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    for (const [key, spec] of Object.entries(ops)) {
      if (spec.kind === "webhook") {
        expect(["read", undefined], key).toContain(spec.sideEffect);
      }
    }
  });

  test("validators enforce ids and discussion fields", () => {
    expect(validateListClassroomsInput({})).toEqual({});
    expect(validateCreateTeamDiscussionInput({ org: "o", teamSlug: "core", title: "t", body: "b", private: true }))
      .toMatchObject({ private: true });
    expect(() => validateCreateTeamDiscussionInput({ org: "o", teamSlug: "core", title: "t" })).toThrow(/body/);
  });

  test("dry-run wrappers return validated payloads", () => {
    expect(getClassroom({ classroomId: 4 })).toMatchObject({ action: "classrooms.get", validated: { classroomId: 4 } });
    expect(listClassrooms({})).toMatchObject({ action: "classrooms.list" });
    expect(createTeamDiscussion({ org: "o", teamSlug: "core", title: "t", body: "b" }))
      .toMatchObject({ action: "teams.discussions.create" });
    expect(deleteTeamDiscussion({ org: "o", teamSlug: "core", discussionNumber: 1 })).toMatchObject({ action: "teams.discussions.delete" });
  });

  test("classroom reads hit /classrooms and /assignments; team discussions write JSON", async () => {
    const rooms = recorder([json([{ id: 4, name: "CS101", archived: false }])]);
    expect(await listClassrooms({ accessToken: "t", fetch: rooms.fetch })).toMatchObject({
      classrooms: [{ id: 4, name: "CS101" }],
    });
    expect(rooms.seen[0].url).toBe("https://api.github.com/classrooms");
    expect(rooms.seen[0].method).toBe("GET");
    expect(rooms.seen[0].contentType).toBeNull();

    const room = recorder([json({ id: 4, name: "CS101", archived: false })]);
    expect(await getClassroom({ accessToken: "t", fetch: room.fetch, classroomId: 4 })).toMatchObject({
      classroom: { id: 4 },
    });
    expect(room.seen[0].url).toBe("https://api.github.com/classrooms/4");

    const assigns = recorder([json([{ id: 5, title: "Lab 1", slug: "lab-1" }])]);
    expect(await listClassroomAssignments({ accessToken: "t", fetch: assigns.fetch, classroomId: 4 }))
      .toMatchObject({ assignments: [{ id: 5, slug: "lab-1" }] });
    expect(assigns.seen[0].url).toBe("https://api.github.com/classrooms/4/assignments");

    const assignment = recorder([json({ id: 5, title: "Lab 1", slug: "lab-1" })]);
    expect(await getAssignment({ accessToken: "t", fetch: assignment.fetch, assignmentId: 5 })).toMatchObject({
      assignment: { id: 5 },
    });

    const grades = recorder([json([{ assignment_name: "Lab 1", github_username: "octocat", points_awarded: 10, points_available: 10 }])]);
    expect(await listAssignmentGrades({ accessToken: "t", fetch: grades.fetch, assignmentId: 5 })).toMatchObject({
      grades: [{ githubUsername: "octocat", pointsAwarded: 10 }],
    });
    expect(grades.seen[0].url).toBe("https://api.github.com/assignments/5/grades");

    const accepted = recorder([json([{ id: 9, submitted: true }])]);
    expect(await listAcceptedAssignments({ accessToken: "t", fetch: accepted.fetch, assignmentId: 5 }))
      .toMatchObject({ accepted: [{ id: 9, submitted: true }] });
    expect(accepted.seen[0].url).toBe("https://api.github.com/assignments/5/accepted_assignments");

    const discussions = recorder([json([{ id: 7, number: 1, title: "Hello", body: "world" }])]);
    expect(await listTeamDiscussions({ accessToken: "t", fetch: discussions.fetch, org: "octo", teamSlug: "core" }))
      .toMatchObject({ discussions: [{ number: 1, title: "Hello" }] });

    const getDisc = recorder([json({ id: 7, number: 1, title: "Hello", body: "world" })]);
    expect(await getTeamDiscussion({
      accessToken: "t",
      fetch: getDisc.fetch,
      org: "octo",
      teamSlug: "core",
      discussionNumber: 1,
    })).toMatchObject({ discussion: { id: 7 } });

    const createDisc = recorder([json({ id: 7, number: 1, title: "Hello", body: "world" }, 201)]);
    expect(await createTeamDiscussion({
      accessToken: "t",
      fetch: createDisc.fetch,
      org: "octo",
      teamSlug: "core",
      title: "Hello",
      body: "world",
    })).toMatchObject({ status: 201 });
    expect(createDisc.seen[0].contentType).toBe("application/json");
    expect(JSON.parse(createDisc.seen[0].body!)).toEqual({ title: "Hello", body: "world" });

    const updDisc = recorder([json({ id: 7, number: 1, title: "Hi", body: "world" })]);
    expect(await updateTeamDiscussion({
      accessToken: "t",
      fetch: updDisc.fetch,
      org: "octo",
      teamSlug: "core",
      discussionNumber: 1,
      title: "Hi",
    })).toMatchObject({ discussion: { title: "Hi" } });
    expect(JSON.parse(updDisc.seen[0].body!)).toEqual({ title: "Hi" });

    const delDisc = recorder([empty(204)]);
    expect(await deleteTeamDiscussion({
      accessToken: "t",
      fetch: delDisc.fetch,
      org: "octo",
      teamSlug: "core",
      discussionNumber: 1,
    })).toMatchObject({ deleted: true });
    expect(delDisc.seen[0].method).toBe("DELETE");
    expect(delDisc.seen[0].contentType).toBeNull();
  });

  test("missing classroom is CONNECTOR_UPSTREAM_ERROR", async () => {
    const missing = recorder([empty(404)]);
    await expect(getClassroom({ accessToken: "t", fetch: missing.fetch, classroomId: 404 })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });
});

// PRUNE-1 (0.82.0): the Projects (classic) REST API was sunset on 2025-04-01
// (https://github.blog/changelog/2024-05-23-sunset-notice-projects-classic/), so the 15
// classic project/column ops from audit a1549a6d §5A are gone from the manifest, the
// action exports, and the G12 client.
const PRUNED_CLASSIC: Record<string, string> = {
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

// PRUNE-2 (0.83.0): the remaining 14 Projects (classic) card, collaborator and team-project
// ops (same sunset cite). The 15th PRUNE-2 op, rest.teams.list_members_legacy, is declarative
// (manifest only) and is guarded in depth_rest.test.ts.
const PRUNED_CLASSIC_2: Record<string, string> = {
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
};

describe("github PRUNE-1 Projects (classic) sunset removal", () => {
  test("the 15 sunset classic project/column ops are absent everywhere", () => {
    expect(Object.keys(PRUNED_CLASSIC)).toHaveLength(15);
    const ops = manifest.operations as Record<string, unknown>;
    const exported = actions as Record<string, unknown>;
    const client = createGapG12Client({ accessToken: "t", fetch: async () => new Response("{}") }) as unknown as Record<string, unknown>;
    for (const [op, fn] of Object.entries(PRUNED_CLASSIC)) {
      expect(ops[op], op).toBeUndefined();
      expect(exported[fn], fn).toBeUndefined();
      expect(client[fn], fn).toBeUndefined();
    }
  });

  test("PRUNE-2: the 14 remaining classic card/collaborator/team-project ops are absent everywhere", () => {
    expect(Object.keys(PRUNED_CLASSIC_2)).toHaveLength(14);
    const ops = manifest.operations as Record<string, unknown>;
    const exported = actions as Record<string, unknown>;
    const client = createGapG12Client({ accessToken: "t", fetch: async () => new Response("{}") }) as unknown as Record<string, unknown>;
    for (const [op, fn] of Object.entries(PRUNED_CLASSIC_2)) {
      expect(ops[op], op).toBeUndefined();
      expect(exported[fn], fn).toBeUndefined();
      expect(client[fn], fn).toBeUndefined();
    }
    for (const key of Object.keys(ops)) {
      expect(key.startsWith("projects."), key).toBe(false);
    }
  });
});
