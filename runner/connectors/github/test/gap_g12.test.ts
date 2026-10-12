import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import * as actions from "../src/actions";
import {
  addProjectCollaborator,
  addTeamProject,
  createProjectCard,
  createTeamDiscussion,
  deleteProjectCard,
  deleteTeamDiscussion,
  getAssignment,
  getClassroom,
  getProjectCard,
  getProjectCollaboratorPermission,
  getTeamDiscussion,
  getTeamProjectPermission,
  listAcceptedAssignments,
  listAssignmentGrades,
  listClassroomAssignments,
  listClassrooms,
  listProjectCards,
  listProjectCollaborators,
  listTeamDiscussions,
  listTeamProjects,
  moveProjectCard,
  removeProjectCollaborator,
  removeTeamProject,
  updateProjectCard,
  updateTeamDiscussion,
} from "../src/actions";
import {
  validateCreateProjectCardInput,
  validateCreateTeamDiscussionInput,
  validateListClassroomsInput,
  validateMoveProjectCardInput,
} from "../src/gap_g12";
import { createGapG12Client } from "../src/gap_g12";

const PATHS: Record<string, { methodPath: string; sideEffect: "read" | "write" }> = {
  "projects.cards.list": { methodPath: "GET /projects/columns/{column_id}/cards", sideEffect: "read" },
  "projects.cards.create": { methodPath: "POST /projects/columns/{column_id}/cards", sideEffect: "write" },
  "projects.cards.get": { methodPath: "GET /projects/columns/cards/{card_id}", sideEffect: "read" },
  "projects.cards.update": { methodPath: "PATCH /projects/columns/cards/{card_id}", sideEffect: "write" },
  "projects.cards.delete": { methodPath: "DELETE /projects/columns/cards/{card_id}", sideEffect: "write" },
  "projects.cards.move": { methodPath: "POST /projects/columns/cards/{card_id}/moves", sideEffect: "write" },
  "projects.collaborators.list": { methodPath: "GET /projects/{project_id}/collaborators", sideEffect: "read" },
  "projects.collaborators.add": { methodPath: "PUT /projects/{project_id}/collaborators/{username}", sideEffect: "write" },
  "projects.collaborators.remove": { methodPath: "DELETE /projects/{project_id}/collaborators/{username}", sideEffect: "write" },
  "projects.collaborators.permission.get": {
    methodPath: "GET /projects/{project_id}/collaborators/{username}/permission",
    sideEffect: "read",
  },
  "orgs.teams.projects.list": { methodPath: "GET /orgs/{org}/teams/{team_slug}/projects", sideEffect: "read" },
  "orgs.teams.projects.add": { methodPath: "PUT /orgs/{org}/teams/{team_slug}/projects/{project_id}", sideEffect: "write" },
  "orgs.teams.projects.remove": { methodPath: "DELETE /orgs/{org}/teams/{team_slug}/projects/{project_id}", sideEffect: "write" },
  "orgs.teams.projects.permission.get": { methodPath: "GET /orgs/{org}/teams/{team_slug}/projects/{project_id}", sideEffect: "read" },
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

const project = { id: 1, name: "Board", body: "b", state: "open", number: 1, html_url: "https://github.com/orgs/o/projects/1" };
const card = { id: 3, note: "n", column_url: "https://api.github.com/projects/columns/2", archived: false };

describe("github gap G12 classic projects, classroom, and team discussions", () => {
  test("version is 0.82.0 at 897 ops with the read/write breakdown (PRUNE-1)", () => {
    expect(manifest.version).toBe("0.82.0");
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(ops)).toHaveLength(897);
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
    expect(kinds).toEqual({ action: 847, sync: 4, webhook: 46 });
    expect(side).toEqual({ read: 446, write: 386, absent: 15 });
  });

  test("the twenty-five remaining G12 ops omit effect keys and document their paths", () => {
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(PATHS)).toHaveLength(25);
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
    expect(reads).toBe(14);
    expect(writes).toBe(11);
  });

  test("webhooks keep sideEffect read or absent, never write", () => {
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    for (const [key, spec] of Object.entries(ops)) {
      if (spec.kind === "webhook") {
        expect(["read", undefined], key).toContain(spec.sideEffect);
      }
    }
  });

  test("validators enforce ids, card XOR, and discussion fields", () => {
    expect(validateCreateProjectCardInput({ columnId: 2, note: "hi" })).toEqual({ columnId: 2, note: "hi" });
    expect(validateCreateProjectCardInput({ columnId: 2, contentId: 8, contentType: "Issue" })).toEqual({
      columnId: 2,
      contentId: 8,
      contentType: "Issue",
    });
    expect(() => validateCreateProjectCardInput({ columnId: 2 })).toThrow(/note or contentId/);
    expect(() => validateCreateProjectCardInput({ columnId: 2, note: "n", contentId: 1, contentType: "Issue" })).toThrow(
      /note or contentId/,
    );
    expect(validateMoveProjectCardInput({ cardId: 3, position: "top", columnId: 4 })).toEqual({
      cardId: 3,
      position: "top",
      columnId: 4,
    });
    expect(validateListClassroomsInput({})).toEqual({});
    expect(validateCreateTeamDiscussionInput({ org: "o", teamSlug: "core", title: "t", body: "b", private: true }))
      .toMatchObject({ private: true });
    expect(() => validateCreateTeamDiscussionInput({ org: "o", teamSlug: "core", title: "t" })).toThrow(/body/);
  });

  test("dry-run wrappers return validated payloads", () => {
    expect(listProjectCards({ columnId: 2 })).toMatchObject({ action: "projects.cards.list", validated: { columnId: 2 } });
    expect(listClassrooms({})).toMatchObject({ action: "classrooms.list" });
    expect(createTeamDiscussion({ org: "o", teamSlug: "core", title: "t", body: "b" }))
      .toMatchObject({ action: "teams.discussions.create" });
    expect(deleteProjectCard({ cardId: 3 })).toMatchObject({ action: "projects.cards.delete" });
  });

  test("cards encode moves and XOR create bodies", async () => {
    const cards = recorder([json([card])]);
    expect(await listProjectCards({ accessToken: "t", fetch: cards.fetch, columnId: 2, archivedState: "all" }))
      .toMatchObject({ cards: [{ id: 3 }] });
    expect(cards.seen[0].url).toContain("archived_state=all");

    const note = recorder([json(card, 201)]);
    expect(await createProjectCard({ accessToken: "t", fetch: note.fetch, columnId: 2, note: "hi" })).toMatchObject({
      card: { id: 3 },
    });
    expect(JSON.parse(note.seen[0].body!)).toEqual({ note: "hi" });

    const content = recorder([json(card, 201)]);
    expect(await createProjectCard({
      accessToken: "t",
      fetch: content.fetch,
      columnId: 2,
      contentId: 99,
      contentType: "Issue",
    })).toMatchObject({ status: 201 });
    expect(JSON.parse(content.seen[0].body!)).toEqual({ content_id: 99, content_type: "Issue" });

    const getCard = recorder([json(card)]);
    expect(await getProjectCard({ accessToken: "t", fetch: getCard.fetch, cardId: 3 })).toMatchObject({ card: { id: 3 } });
    expect(getCard.seen[0].url).toBe("https://api.github.com/projects/columns/cards/3");

    const updCard = recorder([json(card)]);
    expect(await updateProjectCard({ accessToken: "t", fetch: updCard.fetch, cardId: 3, archived: true }))
      .toMatchObject({ card: { archived: false } });
    expect(JSON.parse(updCard.seen[0].body!)).toEqual({ archived: true });

    const delCard = recorder([empty(204)]);
    expect(await deleteProjectCard({ accessToken: "t", fetch: delCard.fetch, cardId: 3 })).toMatchObject({ deleted: true });

    const moveCard = recorder([empty(201)]);
    expect(await moveProjectCard({ accessToken: "t", fetch: moveCard.fetch, cardId: 3, position: "top", columnId: 8 }))
      .toMatchObject({ moved: true, columnId: 8 });
    expect(JSON.parse(moveCard.seen[0].body!)).toEqual({ position: "top", column_id: 8 });
  });

  test("collaborators and team project permission use PUT/DELETE without a body unless permission is set", async () => {
    const list = recorder([json([{ login: "octocat", id: 1 }])]);
    expect(await listProjectCollaborators({ accessToken: "t", fetch: list.fetch, projectId: 1 })).toMatchObject({
      collaborators: [{ login: "octocat" }],
    });

    const add = recorder([empty(204)]);
    expect(await addProjectCollaborator({ accessToken: "t", fetch: add.fetch, projectId: 1, username: "octocat" }))
      .toMatchObject({ added: true });
    expect(add.seen[0].method).toBe("PUT");
    expect(add.seen[0].body).toBeUndefined();
    expect(add.seen[0].contentType).toBeNull();

    const addPerm = recorder([empty(204)]);
    expect(await addProjectCollaborator({
      accessToken: "t",
      fetch: addPerm.fetch,
      projectId: 1,
      username: "octocat",
      permission: "admin",
    })).toMatchObject({ added: true });
    expect(addPerm.seen[0].contentType).toBe("application/json");
    expect(JSON.parse(addPerm.seen[0].body!)).toEqual({ permission: "admin" });

    const remove = recorder([empty(204)]);
    expect(await removeProjectCollaborator({ accessToken: "t", fetch: remove.fetch, projectId: 1, username: "octocat" }))
      .toMatchObject({ removed: true });
    expect(remove.seen[0].method).toBe("DELETE");
    expect(remove.seen[0].contentType).toBeNull();

    const perm = recorder([json({ permission: "write" })]);
    expect(await getProjectCollaboratorPermission({
      accessToken: "t",
      fetch: perm.fetch,
      projectId: 1,
      username: "octocat",
    })).toMatchObject({ permission: "write" });
    expect(perm.seen[0].url).toContain("/collaborators/octocat/permission");

    const teamList = recorder([json([project])]);
    expect(await listTeamProjects({ accessToken: "t", fetch: teamList.fetch, org: "octo", teamSlug: "core" }))
      .toMatchObject({ projects: [{ id: 1 }] });

    const teamAdd = recorder([empty(204)]);
    expect(await addTeamProject({ accessToken: "t", fetch: teamAdd.fetch, org: "octo", teamSlug: "core", projectId: 1 }))
      .toMatchObject({ added: true });
    expect(teamAdd.seen[0].contentType).toBeNull();

    const teamRemove = recorder([empty(204)]);
    expect(await removeTeamProject({ accessToken: "t", fetch: teamRemove.fetch, org: "octo", teamSlug: "core", projectId: 1 }))
      .toMatchObject({ removed: true });

    const teamPerm = recorder([json({ permission: true, state: "write" })]);
    expect(await getTeamProjectPermission({
      accessToken: "t",
      fetch: teamPerm.fetch,
      org: "octo",
      teamSlug: "core",
      projectId: 1,
    })).toMatchObject({ permission: "read", state: "write" });
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

  test("missing classic project card is CONNECTOR_UPSTREAM_ERROR", async () => {
    const missing = recorder([empty(404)]);
    await expect(getProjectCard({ accessToken: "t", fetch: missing.fetch, cardId: 404 })).rejects.toMatchObject({
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
});
