import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  addProjectCollaborator,
  addTeamProject,
  createOrgProject,
  createProjectCard,
  createProjectColumn,
  createRepoProject,
  createTeamDiscussion,
  createUserProject,
  deleteProject,
  deleteProjectCard,
  deleteProjectColumn,
  deleteTeamDiscussion,
  getAssignment,
  getClassroom,
  getProject,
  getProjectCard,
  getProjectCollaboratorPermission,
  getProjectColumn,
  getTeamDiscussion,
  getTeamProjectPermission,
  listAcceptedAssignments,
  listAssignmentGrades,
  listClassroomAssignments,
  listClassrooms,
  listOrgClassicProjects,
  listProjectCards,
  listProjectCollaborators,
  listProjectColumns,
  listRepoProjects,
  listTeamDiscussions,
  listTeamProjects,
  listUserClassicProjects,
  moveProjectCard,
  moveProjectColumn,
  removeProjectCollaborator,
  removeTeamProject,
  updateProject,
  updateProjectCard,
  updateProjectColumn,
  updateTeamDiscussion,
} from "../src/actions";
import {
  validateCreateProjectCardInput,
  validateCreateTeamDiscussionInput,
  validateGetProjectInput,
  validateListClassroomsInput,
  validateMoveProjectCardInput,
  validateUpdateProjectInput,
} from "../src/gap_g12";

const PATHS: Record<string, { methodPath: string; sideEffect: "read" | "write" }> = {
  "projects.get": { methodPath: "GET /projects/{project_id}", sideEffect: "read" },
  "projects.update": { methodPath: "PATCH /projects/{project_id}", sideEffect: "write" },
  "projects.delete": { methodPath: "DELETE /projects/{project_id}", sideEffect: "write" },
  "orgs.projects.list": { methodPath: "GET /orgs/{org}/projects", sideEffect: "read" },
  "orgs.projects.create": { methodPath: "POST /orgs/{org}/projects", sideEffect: "write" },
  "repos.projects.list": { methodPath: "GET /repos/{owner}/{repo}/projects", sideEffect: "read" },
  "repos.projects.create": { methodPath: "POST /repos/{owner}/{repo}/projects", sideEffect: "write" },
  "users.projects.list": { methodPath: "GET /users/{username}/projects", sideEffect: "read" },
  "user.projects.create": { methodPath: "POST /user/projects", sideEffect: "write" },
  "projects.columns.list": { methodPath: "GET /projects/{project_id}/columns", sideEffect: "read" },
  "projects.columns.create": { methodPath: "POST /projects/{project_id}/columns", sideEffect: "write" },
  "projects.columns.get": { methodPath: "GET /projects/columns/{column_id}", sideEffect: "read" },
  "projects.columns.update": { methodPath: "PATCH /projects/columns/{column_id}", sideEffect: "write" },
  "projects.columns.delete": { methodPath: "DELETE /projects/columns/{column_id}", sideEffect: "write" },
  "projects.columns.move": { methodPath: "POST /projects/columns/{column_id}/moves", sideEffect: "write" },
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
const column = { id: 2, name: "Todo", project_url: "https://api.github.com/projects/1" };
const card = { id: 3, note: "n", column_url: "https://api.github.com/projects/columns/2", archived: false };

describe("github gap G12 classic projects, classroom, and team discussions", () => {
  test("version is 0.79.0 at 852 ops with the read/write breakdown", () => {
    expect(manifest.version).toBe("0.80.2");
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(ops)).toHaveLength(910);
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
    expect(kinds).toEqual({ action: 860, sync: 4, webhook: 46 });
    expect(side).toEqual({ read: 450, write: 395, absent: 15 });
  });

  test("the forty G12 ops omit effect keys and document their paths", () => {
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(PATHS)).toHaveLength(40);
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
    expect(reads).toBe(20);
    expect(writes).toBe(20);
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
    expect(validateGetProjectInput({ projectId: 9 })).toEqual({ projectId: 9 });
    expect(validateGetProjectInput({ project_id: 9 })).toEqual({ projectId: 9 });
    expect(() => validateGetProjectInput({ projectId: 0 })).toThrow(/projectId/);
    expect(validateUpdateProjectInput({ projectId: 1, state: "closed" })).toMatchObject({ state: "closed" });
    expect(() => validateUpdateProjectInput({ projectId: 1, state: "all" })).toThrow(/state/);
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
    expect(getProject({ projectId: 1 })).toMatchObject({ action: "projects.get", validated: { projectId: 1 } });
    expect(listClassrooms({})).toMatchObject({ action: "classrooms.list" });
    expect(createTeamDiscussion({ org: "o", teamSlug: "core", title: "t", body: "b" }))
      .toMatchObject({ action: "teams.discussions.create" });
    expect(deleteProject({ projectId: 1 })).toMatchObject({ action: "projects.delete" });
  });

  test("classic project reads and writes hit inertia paths; GET/DELETE stay body-less", async () => {
    const get = recorder([json(project)]);
    expect(await getProject({ accessToken: "t", fetch: get.fetch, projectId: 11 })).toMatchObject({
      project: { id: 1, name: "Board" },
    });
    expect(get.seen[0].method).toBe("GET");
    expect(get.seen[0].url).toBe("https://api.github.com/projects/11");
    expect(get.seen[0].body).toBeUndefined();
    expect(get.seen[0].contentType).toBeNull();
    expect(get.seen[0].accept).toBe("application/vnd.github.inertia+json");

    const patch = recorder([json(project)]);
    expect(await updateProject({ accessToken: "t", fetch: patch.fetch, projectId: 11, name: "N" })).toMatchObject({
      project: { name: "Board" },
    });
    expect(patch.seen[0].method).toBe("PATCH");
    expect(patch.seen[0].contentType).toBe("application/json");
    expect(JSON.parse(patch.seen[0].body!)).toEqual({ name: "N" });

    const del = recorder([empty(204)]);
    expect(await deleteProject({ accessToken: "t", fetch: del.fetch, projectId: 11 })).toMatchObject({ deleted: true });
    expect(del.seen[0].method).toBe("DELETE");
    expect(del.seen[0].body).toBeUndefined();
    expect(del.seen[0].contentType).toBeNull();

    const list = recorder([json([project])]);
    expect(await listOrgClassicProjects({ accessToken: "t", fetch: list.fetch, org: "octo", state: "open", perPage: 10 }))
      .toMatchObject({ projects: [{ id: 1 }] });
    expect(list.seen[0].url).toContain("/orgs/octo/projects?");
    expect(list.seen[0].url).toContain("state=open");
    expect(list.seen[0].url).toContain("per_page=10");

    const create = recorder([json(project, 201)]);
    expect(await createOrgProject({ accessToken: "t", fetch: create.fetch, org: "octo", name: "Board" })).toMatchObject({
      status: 201,
    });
    expect(create.seen[0].method).toBe("POST");
    expect(JSON.parse(create.seen[0].body!)).toEqual({ name: "Board" });

    const repoList = recorder([json([project])]);
    expect(await listRepoProjects({ accessToken: "t", fetch: repoList.fetch, owner: "o", repo: "r" })).toMatchObject({
      projects: [{ id: 1 }],
    });
    expect(repoList.seen[0].url).toBe("https://api.github.com/repos/o/r/projects");

    const repoCreate = recorder([json(project, 201)]);
    expect(await createRepoProject({ accessToken: "t", fetch: repoCreate.fetch, owner: "o", repo: "r", name: "P" }))
      .toMatchObject({ status: 201 });

    const userList = recorder([json([project])]);
    expect(await listUserClassicProjects({ accessToken: "t", fetch: userList.fetch, username: "octocat" })).toMatchObject({
      projects: [{ id: 1 }],
    });

    const userCreate = recorder([json(project, 201)]);
    expect(await createUserProject({ accessToken: "t", fetch: userCreate.fetch, name: "Mine" })).toMatchObject({
      project: { id: 1 },
    });
    expect(userCreate.seen[0].url).toBe("https://api.github.com/user/projects");
  });

  test("columns and cards encode moves and XOR create bodies", async () => {
    const cols = recorder([json([column])]);
    expect(await listProjectColumns({ accessToken: "t", fetch: cols.fetch, projectId: 1 })).toMatchObject({
      columns: [{ id: 2, name: "Todo" }],
    });

    const createCol = recorder([json(column, 201)]);
    expect(await createProjectColumn({ accessToken: "t", fetch: createCol.fetch, projectId: 1, name: "Todo" }))
      .toMatchObject({ column: { id: 2 } });

    const getCol = recorder([json(column)]);
    expect(await getProjectColumn({ accessToken: "t", fetch: getCol.fetch, columnId: 2 })).toMatchObject({
      column: { id: 2 },
    });
    expect(getCol.seen[0].url).toBe("https://api.github.com/projects/columns/2");

    const updCol = recorder([json(column)]);
    expect(await updateProjectColumn({ accessToken: "t", fetch: updCol.fetch, columnId: 2, name: "Doing" }))
      .toMatchObject({ column: { id: 2 } });

    const delCol = recorder([empty(204)]);
    expect(await deleteProjectColumn({ accessToken: "t", fetch: delCol.fetch, columnId: 2 })).toMatchObject({
      deleted: true,
    });
    expect(delCol.seen[0].contentType).toBeNull();

    const moveCol = recorder([empty(201)]);
    expect(await moveProjectColumn({ accessToken: "t", fetch: moveCol.fetch, columnId: 2, position: "first" }))
      .toMatchObject({ moved: true });
    expect(JSON.parse(moveCol.seen[0].body!)).toEqual({ position: "first" });
    expect(moveCol.seen[0].contentType).toBe("application/json");

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

  test("missing classic project is CONNECTOR_UPSTREAM_ERROR", async () => {
    const missing = recorder([empty(404)]);
    await expect(getProject({ accessToken: "t", fetch: missing.fetch, projectId: 404 })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });
});
