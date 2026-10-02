import { describe, expect, test } from "bun:test";
import labelGetFixture from "../fixtures/label_get.json";
import labelCreateFixture from "../fixtures/label_create.json";
import milestonesListFixture from "../fixtures/milestones_list.json";
import milestoneGetFixture from "../fixtures/milestone_get.json";
import collaboratorsListFixture from "../fixtures/collaborators_list.json";
import {
  getLabel,
  createLabel,
  updateLabel,
  deleteLabel,
  listMilestones,
  getMilestone,
  createMilestone,
  updateMilestone,
  listCollaborators,
  addCollaborator,
  removeCollaborator,
  checkCollaborator,
} from "../src/actions";
import {
  normalizeLabel,
  normalizeMilestone,
  normalizeCollaborator,
  validateGetLabelInput,
  validateCreateLabelInput,
  validateUpdateLabelInput,
  validateDeleteLabelInput,
  validateListMilestonesInput,
  validateGetMilestoneInput,
  validateCreateMilestoneInput,
  validateUpdateMilestoneInput,
  validateListCollaboratorsInput,
  validateAddCollaboratorInput,
  validateRemoveCollaboratorInput,
  validateCheckCollaboratorInput,
} from "../src/labels_milestones";

describe("github S8 labels-milestones-collab", () => {
  test("normalizes label/milestone/collaborator fixtures", () => {
    const label = normalizeLabel(labelGetFixture as Record<string, unknown>);
    expect(label.id).toBe("gh-label:208045274");
    expect(label.name).toBe("bug");
    expect(label.default).toBe(true);
    const milestone = normalizeMilestone(milestoneGetFixture as Record<string, unknown>);
    expect(milestone.id).toBe("gh-milestone:1002604");
    expect(milestone.number).toBe(1);
    expect(milestone.title).toBe("v1.0");
    const collab = normalizeCollaborator((collaboratorsListFixture as Record<string, unknown>[])[0]);
    expect(collab.id).toBe("gh-user:1");
    expect(collab.login).toBe("octocat");
    expect(collab.permissions.push).toBe(true);
  });

    test("validates S8 inputs", () => {
    expect(validateGetLabelInput({ owner: "acme", repo: "app", name: "bug" }).name).toBe("bug");
    expect(validateCreateLabelInput({ owner: "acme", repo: "app", name: "priority", color: "ff0000" }).color).toBe("ff0000");
    expect(() => validateCreateLabelInput({ owner: "acme", repo: "app", name: "x" })).toThrow();
    expect(validateUpdateLabelInput({ owner: "acme", repo: "app", name: "bug", color: "aaaaaa" }).color).toBe("aaaaaa");
    expect(() => validateUpdateLabelInput({ owner: "acme", repo: "app", name: "bug" })).toThrow();
    expect(validateDeleteLabelInput({ owner: "acme", repo: "app", name: "bug" }).name).toBe("bug");
    expect(validateListMilestonesInput({ owner: "acme", repo: "app", state: "open" }).state).toBe("open");
    expect(() => validateListMilestonesInput({ owner: "acme", repo: "app", state: "nope" })).toThrow();
    expect(validateGetMilestoneInput({ owner: "acme", repo: "app", milestoneNumber: 1 }).milestoneNumber).toBe(1);
    expect(validateCreateMilestoneInput({ owner: "acme", repo: "app", title: "v1" }).title).toBe("v1");
    expect(validateUpdateMilestoneInput({ owner: "acme", repo: "app", milestoneNumber: 1, state: "closed" }).state).toBe("closed");
    expect(validateUpdateMilestoneInput({ owner: "acme", repo: "app", milestoneNumber: 1, dueOn: null }).dueOn).toBe(null);
    expect(() => validateUpdateMilestoneInput({ owner: "acme", repo: "app", milestoneNumber: 1 })).toThrow();
    expect(validateListCollaboratorsInput({ owner: "acme", repo: "app", affiliation: "direct" }).affiliation).toBe("direct");
    expect(() => validateListCollaboratorsInput({ owner: "acme", repo: "app", permission: "owner" })).toThrow();
    expect(validateAddCollaboratorInput({ owner: "acme", repo: "app", username: "hubot", permission: "push" }).permission).toBe("push");
    expect(validateRemoveCollaboratorInput({ owner: "acme", repo: "app", username: "hubot" }).username).toBe("hubot");
    expect(validateCheckCollaboratorInput({ owner: "acme", repo: "app", username: "hubot" }).username).toBe("hubot");
  });

  test("getLabel and createLabel", async () => {
    const validated = getLabel({ owner: "acme", repo: "app", name: "bug" });
    expect(validated.action).toBe("labels.get");

    const getReqs: Request[] = [];
    const got = await getLabel({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      name: "bug",
      fetch: async (input, init) => {
        getReqs.push(new Request(input, init));
        return new Response(JSON.stringify(labelGetFixture), { status: 200 });
      },
    });
    expect(getReqs[0].url).toBe("https://api.github.com/repos/acme/app/labels/bug");
    expect((got.label as Record<string, unknown>).name).toBe("bug");

    const createReqs: Request[] = [];
    const created = await createLabel({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      name: "priority",
      color: "ff0000",
      description: "High priority",
      fetch: async (input, init) => {
        createReqs.push(new Request(input, init));
        return new Response(JSON.stringify(labelCreateFixture), { status: 201 });
      },
    });
    expect(createReqs[0].method).toBe("POST");
    expect(createReqs[0].url).toBe("https://api.github.com/repos/acme/app/labels");
    expect((created.label as Record<string, unknown>).name).toBe("priority");
  });

  test("updateLabel and deleteLabel", async () => {
    const updateReqs: Request[] = [];
    const updated = await updateLabel({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      name: "bug",
      newName: "defect",
      color: "bbbbbb",
      fetch: async (input, init) => {
        updateReqs.push(new Request(input, init));
        return new Response(JSON.stringify({ ...labelGetFixture, name: "defect", color: "bbbbbb" }), { status: 200 });
      },
    });
    expect(updateReqs[0].method).toBe("PATCH");
    expect(updateReqs[0].url).toContain("/labels/bug");
    const body = JSON.parse(await updateReqs[0].clone().text());
    expect(body.new_name).toBe("defect");
    expect((updated.label as Record<string, unknown>).name).toBe("defect");

    const deleteReqs: Request[] = [];
    const deleted = await deleteLabel({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      name: "bug",
      fetch: async (input, init) => {
        deleteReqs.push(new Request(input, init));
        return new Response(null, { status: 204 });
      },
    });
    expect(deleteReqs[0].method).toBe("DELETE");
    expect(deleted.deleted).toBe(true);
    expect(deleted.name).toBe("bug");
  });

  test("listMilestones get create update", async () => {
    const listReqs: Request[] = [];
    const list = await listMilestones({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      state: "open",
      fetch: async (input, init) => {
        listReqs.push(new Request(input, init));
        return new Response(JSON.stringify(milestonesListFixture), { status: 200 });
      },
    });
    expect(listReqs[0].url).toContain("/milestones?");
    expect(listReqs[0].url).toContain("state=open");
    expect((list.milestones as unknown[]).length).toBe(1);

    const getReqs: Request[] = [];
    const got = await getMilestone({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      milestoneNumber: 1,
      fetch: async (input, init) => {
        getReqs.push(new Request(input, init));
        return new Response(JSON.stringify(milestoneGetFixture), { status: 200 });
      },
    });
    expect(getReqs[0].url).toBe("https://api.github.com/repos/acme/app/milestones/1");
    expect((got.milestone as Record<string, unknown>).title).toBe("v1.0");

    const createReqs: Request[] = [];
    const created = await createMilestone({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      title: "v2.0",
      dueOn: "2026-12-01T00:00:00Z",
      fetch: async (input, init) => {
        createReqs.push(new Request(input, init));
        return new Response(JSON.stringify({ ...milestoneGetFixture, number: 2, title: "v2.0" }), { status: 201 });
      },
    });
    expect(createReqs[0].method).toBe("POST");
    const cbody = JSON.parse(await createReqs[0].clone().text());
    expect(cbody.due_on).toBe("2026-12-01T00:00:00Z");
    expect((created.milestone as Record<string, unknown>).title).toBe("v2.0");

    const updateReqs: Request[] = [];
    const updated = await updateMilestone({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      milestoneNumber: 1,
      state: "closed",
      dueOn: null,
      fetch: async (input, init) => {
        updateReqs.push(new Request(input, init));
        return new Response(JSON.stringify({ ...milestoneGetFixture, state: "closed", due_on: null }), { status: 200 });
      },
    });
    expect(updateReqs[0].method).toBe("PATCH");
    const ubody = JSON.parse(await updateReqs[0].clone().text());
    expect(ubody.state).toBe("closed");
    expect(ubody.due_on).toBe(null);
    expect((updated.milestone as Record<string, unknown>).state).toBe("closed");
  });

  test("collaborators list add remove check", async () => {
    const listReqs: Request[] = [];
    const list = await listCollaborators({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      affiliation: "direct",
      fetch: async (input, init) => {
        listReqs.push(new Request(input, init));
        return new Response(JSON.stringify(collaboratorsListFixture), { status: 200 });
      },
    });
    expect(listReqs[0].url).toContain("/collaborators?");
    expect(listReqs[0].url).toContain("affiliation=direct");
    expect((list.collaborators as unknown[]).length).toBe(2);

    const addReqs: Request[] = [];
    const added = await addCollaborator({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      username: "hubot",
      permission: "push",
      fetch: async (input, init) => {
        addReqs.push(new Request(input, init));
        return new Response(null, { status: 201 });
      },
    });
    expect(addReqs[0].method).toBe("PUT");
    expect(addReqs[0].url).toBe("https://api.github.com/repos/acme/app/collaborators/hubot");
    expect(added.invited).toBe(true);

    const already = await addCollaborator({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      username: "hubot",
      fetch: async () => new Response(null, { status: 204 }),
    });
    expect(already.alreadyCollaborator).toBe(true);

    const removeReqs: Request[] = [];
    const removed = await removeCollaborator({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      username: "hubot",
      fetch: async (input, init) => {
        removeReqs.push(new Request(input, init));
        return new Response(null, { status: 204 });
      },
    });
    expect(removeReqs[0].method).toBe("DELETE");
    expect(removed.removed).toBe(true);

    const yes = await checkCollaborator({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      username: "octocat",
      fetch: async () => new Response(null, { status: 204 }),
    });
    expect(yes.isCollaborator).toBe(true);

    const no = await checkCollaborator({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      username: "stranger",
      fetch: async () => new Response(null, { status: 404 }),
    });
    expect(no.isCollaborator).toBe(false);
  });

  test("encodes label names with spaces", async () => {
    const reqs: Request[] = [];
    await getLabel({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      name: "good first issue",
      fetch: async (input, init) => {
        reqs.push(new Request(input, init));
        return new Response(JSON.stringify(labelGetFixture), { status: 200 });
      },
    });
    expect(reqs[0].url).toContain("/labels/good%20first%20issue");
  });

  test("getLabel soft-404 and prefers newName", async () => {
    const missing = await getLabel({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      name: "gone",
      fetch: async () => new Response(null, { status: 404 }),
    });
    expect(missing.found).toBe(false);
    expect(missing.label).toBe(null);

    const reqs: Request[] = [];
    await getLabel({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      name: "bug",
      newName: "defect",
      fetch: async (input, init) => {
        reqs.push(new Request(input, init));
        return new Response(JSON.stringify({ ...labelGetFixture, name: "defect" }), { status: 200 });
      },
    });
    expect(reqs[0].url).toContain("/labels/defect");
  });

  test("getMilestone accepts Idempotent id projection", () => {
    expect(validateGetMilestoneInput({ owner: "acme", repo: "app", id: 7 }).milestoneNumber).toBe(7);
    expect(validateGetMilestoneInput({ owner: "acme", repo: "app", id: "9" }).milestoneNumber).toBe(9);
    expect(validateGetMilestoneInput({ owner: "acme", repo: "app", milestoneNumber: 1, id: 99 }).milestoneNumber).toBe(1);
  });

  test("createMilestone returns id for Idempotent observe", async () => {
    const created = await createMilestone({
      accessToken: "ghp_test-token",
      owner: "acme",
      repo: "app",
      title: "v2.0",
      fetch: async () =>
        new Response(JSON.stringify({ ...milestoneGetFixture, number: 2, title: "v2.0" }), { status: 201 }),
    });
    expect(created.id).toBe(2);
  });

});
