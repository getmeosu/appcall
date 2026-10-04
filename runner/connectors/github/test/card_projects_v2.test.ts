import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import listFixture from "../fixtures/projects_v2_list.json";
import projectFixture from "../fixtures/projects_v2_get.json";
import fieldsFixture from "../fixtures/projects_v2_fields.json";
import fieldFixture from "../fixtures/projects_v2_field.json";
import itemsFixture from "../fixtures/projects_v2_items.json";
import itemFixture from "../fixtures/projects_v2_item.json";
import draftFixture from "../fixtures/projects_v2_draft.json";
import viewFixture from "../fixtures/projects_v2_view.json";
import {
  listOrgProjectsV2,
  getOrgProjectV2,
  listOrgProjectFields,
  getOrgProjectField,
  listOrgProjectItems,
  getOrgProjectItem,
  createOrgProjectDraft,
  createOrgProjectField,
  addOrgProjectItem,
  updateOrgProjectItem,
  deleteOrgProjectItem,
  createOrgProjectView,
} from "../src/actions";
import {
  validateListOrgProjectsV2Input,
  validateGetOrgProjectV2Input,
  validateListOrgProjectFieldsInput,
  validateGetOrgProjectFieldInput,
  validateListOrgProjectItemsInput,
  validateGetOrgProjectItemInput,
  validateCreateOrgProjectDraftInput,
  validateCreateOrgProjectFieldInput,
  validateAddOrgProjectItemInput,
  validateUpdateOrgProjectItemInput,
  validateDeleteOrgProjectItemInput,
  validateCreateOrgProjectViewInput,
} from "../src/card_projects_v2";

const READS = [
  "orgs.projects_v2.list",
  "orgs.projects_v2.get",
  "orgs.projects_v2.fields.list",
  "orgs.projects_v2.fields.get",
  "orgs.projects_v2.items.list",
  "orgs.projects_v2.items.get",
] as const;

const WRITES = [
  "orgs.projects_v2.drafts.create",
  "orgs.projects_v2.fields.create",
  "orgs.projects_v2.items.add",
  "orgs.projects_v2.items.update",
  "orgs.projects_v2.items.delete",
  "orgs.projects_v2.views.create",
] as const;

const OPS = [...READS, ...WRITES] as const;

const PATHS: Record<(typeof OPS)[number], string> = {
  "orgs.projects_v2.list": "GET /orgs/{org}/projectsV2",
  "orgs.projects_v2.get": "GET /orgs/{org}/projectsV2/{project_number}",
  "orgs.projects_v2.fields.list": "GET /orgs/{org}/projectsV2/{project_number}/fields",
  "orgs.projects_v2.fields.get": "GET /orgs/{org}/projectsV2/{project_number}/fields/{field_id}",
  "orgs.projects_v2.items.list": "GET /orgs/{org}/projectsV2/{project_number}/items",
  "orgs.projects_v2.items.get": "GET /orgs/{org}/projectsV2/{project_number}/items/{item_id}",
  "orgs.projects_v2.drafts.create": "POST /orgs/{org}/projectsV2/{project_number}/drafts",
  "orgs.projects_v2.fields.create": "POST /orgs/{org}/projectsV2/{project_number}/fields",
  "orgs.projects_v2.items.add": "POST /orgs/{org}/projectsV2/{project_number}/items",
  "orgs.projects_v2.items.update": "PATCH /orgs/{org}/projectsV2/{project_number}/items/{item_id}",
  "orgs.projects_v2.items.delete": "DELETE /orgs/{org}/projectsV2/{project_number}/items/{item_id}",
  "orgs.projects_v2.views.create": "POST /orgs/{org}/projectsV2/{project_number}/views",
};

describe("github projects v2 org reads and item writes", () => {
  test("version is 0.44.0 at 436 ops and the twelve org project keys are new", () => {
    expect(manifest.version).toBe("0.44.0");
    expect(OPS).toHaveLength(12);
    expect(Object.keys(manifest.operations)).toHaveLength(436);
    for (const key of READS) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.observe).toBeUndefined();
      expect(String(op.description)).toContain(PATHS[key]);
    }
    const draft = manifest.operations["orgs.projects_v2.drafts.create"] as Record<string, unknown>;
    expect(draft.sideEffect).toBe("write");
    expect(draft.effectPolicy).toBe("Reconcile");
    expect(draft.reconcile).toBe("orgs.projects_v2.items.get");
    const fieldCreate = manifest.operations["orgs.projects_v2.fields.create"] as Record<string, unknown>;
    expect(fieldCreate.effectPolicy).toBe("Reconcile");
    expect(fieldCreate.reconcile).toBe("orgs.projects_v2.fields.get");
    const add = manifest.operations["orgs.projects_v2.items.add"] as Record<string, unknown>;
    expect(add.effectPolicy).toBe("Reconcile");
    expect(add.reconcile).toBe("orgs.projects_v2.items.get");
    const update = manifest.operations["orgs.projects_v2.items.update"] as Record<string, unknown>;
    expect(update.effectPolicy).toBe("Reconcile");
    expect(update.reconcile).toBe("orgs.projects_v2.items.get");
    const del = manifest.operations["orgs.projects_v2.items.delete"] as Record<string, unknown>;
    expect(del.sideEffect).toBe("write");
    expect(del.effectPolicy).toBe("Idempotent");
    expect(String(del.description)).toContain("destructive");
    const view = manifest.operations["orgs.projects_v2.views.create"] as Record<string, unknown>;
    expect(view.effectPolicy).toBe("Idempotent");
    expect(view.reconcile).toBeUndefined();
    for (const key of WRITES) {
      expect(String(manifest.operations[key].description)).toContain(PATHS[key]);
    }
    expect(manifest.operations["users.projects_v2.fields.list"]).toBeDefined();
    expect(manifest.operations["orgs.projects_v2.fields.list"]).toBeDefined();
    expect(manifest.operations["users.projects_v2.fields.list"]).not.toBe(manifest.operations["orgs.projects_v2.fields.list"]);
  });

  test("validates required path fields and documented cursor pagination only", () => {
    expect(validateListOrgProjectsV2Input({
      org: "octo-org",
      q: "roadmap",
      perPage: 30,
      after: "abc",
      before: "def",
    })).toEqual({ org: "octo-org", q: "roadmap", perPage: 30, after: "abc", before: "def" });
    expect(() => validateListOrgProjectsV2Input({ org: "octo/org" })).toThrow(/org/);
    expect(() => validateListOrgProjectsV2Input({ org: "octo-org", perPage: 101 })).toThrow(/perPage/);
    expect(validateGetOrgProjectV2Input({ org: "octo-org", projectNumber: 4 })).toEqual({ org: "octo-org", projectNumber: 4 });
    expect(() => validateGetOrgProjectV2Input({ org: "octo-org", projectNumber: 0 })).toThrow(/projectNumber/);
    expect(validateGetOrgProjectFieldInput({ org: "octo-org", projectNumber: 4, fieldId: 11 }).fieldId).toBe(11);
    expect(() => validateGetOrgProjectFieldInput({ org: "octo-org", projectNumber: 4 })).toThrow(/fieldId/);
    expect(validateListOrgProjectItemsInput({
      org: "octo-org",
      projectNumber: 4,
      q: "bug",
      fields: ["Title", "Status"],
    }).fields).toEqual(["Title", "Status"]);
    expect(validateGetOrgProjectItemInput({ org: "octo-org", projectNumber: 4, itemId: 55, fields: "Title" }).fields).toBe("Title");
    expect(validateCreateOrgProjectDraftInput({ org: "octo-org", projectNumber: 4, title: "Draft idea", body: "Write it up" }).title).toBe("Draft idea");
    expect(() => validateCreateOrgProjectDraftInput({ org: "octo-org", projectNumber: 4 })).toThrow(/title/);
    expect(validateCreateOrgProjectFieldInput({ org: "octo-org", projectNumber: 4, name: "Priority", dataType: "text" }).dataType).toBe("text");
    expect(validateCreateOrgProjectFieldInput({ org: "octo-org", projectNumber: 4, issueFieldId: 700 }).issueFieldId).toBe(700);
    expect(() => validateCreateOrgProjectFieldInput({ org: "octo-org", projectNumber: 4, name: "X" })).toThrow(/dataType/);
    expect(validateAddOrgProjectItemInput({ org: "octo-org", projectNumber: 4, type: "Issue", id: 1347 }).id).toBe(1347);
    expect(validateAddOrgProjectItemInput({
      org: "octo-org",
      projectNumber: 4,
      type: "PullRequest",
      owner: "octo-org",
      repo: "Hello-World",
      number: 9,
    }).number).toBe(9);
    expect(() => validateAddOrgProjectItemInput({ org: "octo-org", projectNumber: 4, type: "Issue" })).toThrow(/id/);
    expect(validateUpdateOrgProjectItemInput({
      org: "octo-org",
      projectNumber: 4,
      itemId: 55,
      fields: [{ id: 11, value: "Done" }],
    }).fields[0].value).toBe("Done");
    expect(validateDeleteOrgProjectItemInput({ org: "octo-org", projectNumber: 4, itemId: 55 }).itemId).toBe(55);
    expect(validateCreateOrgProjectViewInput({ org: "octo-org", projectNumber: 4, name: "Sprint Board", layout: "board" }).layout).toBe("board");
    expect(() => validateCreateOrgProjectViewInput({ org: "octo-org", projectNumber: 4, name: "Sprint Board" })).toThrow(/layout/);
    const dry = listOrgProjectsV2({ org: "octo-org", q: "roadmap" });
    expect((dry as { validated: { org: string } }).validated.org).toBe("octo-org");
  });

  test("reads the documented org project paths with bearer token and camelCase output", async () => {
    const seen: string[] = [];
    const fetch = async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      seen.push(`${init?.method ?? "GET"} ${url}`);
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer t");
      expect(headers.Accept).toBe("application/vnd.github+json");
      if (url.includes("/projectsV2/4/fields/11")) return json(fieldFixture);
      if (url.includes("/projectsV2/4/fields")) return json(fieldsFixture);
      if (url.includes("/projectsV2/4/items/55")) return json(itemFixture);
      if (url.includes("/projectsV2/4/items")) return json(itemsFixture);
      if (url.includes("/projectsV2/4")) return json(projectFixture);
      if (url.includes("/projectsV2")) return json(listFixture);
      return new Response("{}", { status: 500 });
    };
    const listed = await listOrgProjectsV2({
      accessToken: "t",
      org: "octo org",
      q: "roadmap",
      perPage: 30,
      after: "abc",
      fetch,
    });
    expect(listed.action).toBe("orgs.projects_v2.list");
    const project = (listed.projects as Record<string, unknown>[])[0];
    expect(project.title).toBe("Roadmap");
    expect(project.nodeId).toBe("PVT_kwDOAproject1");
    expect(project.shortDescription).toBe("Ship it");
    expect((project.owner as { login: string; nodeId: string }).login).toBe("octo-org");
    expect((project.owner as { nodeId: string }).nodeId).toBe("MDEyOk9yZ2FuaXphdGlvbjE=");
    expect(JSON.stringify(listed.projects)).not.toContain("drop-me");
    expect(JSON.stringify(listed.projects)).not.toContain("node_id");
    const got = await getOrgProjectV2({ accessToken: "t", org: "octo-org", projectNumber: 4, fetch });
    expect((got.project as { isTemplate: boolean; latestStatusUpdate: { status: string; projectNodeId: string } }).isTemplate).toBe(false);
    expect((got.project as { latestStatusUpdate: { status: string; projectNodeId: string } }).latestStatusUpdate.status).toBe("ON_TRACK");
    expect((got.project as { latestStatusUpdate: { projectNodeId: string } }).latestStatusUpdate.projectNodeId).toBe("PVT_kwDOAproject1");
    const fields = await listOrgProjectFields({
      accessToken: "t",
      org: "octo-org",
      projectNumber: 4,
      perPage: 10,
      before: "zzz",
      fetch,
    });
    expect((fields.fields as { dataType: string; issueFieldId: number; projectUrl: string }[])[0]).toMatchObject({
      dataType: "single_select",
      issueFieldId: 700,
      projectUrl: "https://api.github.com/orgs/octo-org/projectsV2/4",
    });
    expect((fields.fields as { options: { name: string }[] }[])[0].options[0].name).toBe("Todo");
    const field = await getOrgProjectField({ accessToken: "t", org: "octo-org", projectNumber: 4, fieldId: 11, fetch });
    expect((field.field as { name: string; dataType: string }).name).toBe("Priority");
    const items = await listOrgProjectItems({
      accessToken: "t",
      org: "octo-org",
      projectNumber: 4,
      q: "bug",
      fields: ["Title", "Status"],
      fetch,
    });
    const item = (items.items as Record<string, unknown>[])[0];
    expect(item.contentType).toBe("Issue");
    expect((item.content as { htmlUrl: string; nodeId: string }).htmlUrl).toContain("/issues/42");
    expect((item.fields as { id: number }[])[0].id).toBe(11);
    const one = await getOrgProjectItem({
      accessToken: "t",
      org: "octo-org",
      projectNumber: 4,
      itemId: 55,
      fields: "Title",
      fetch,
    });
    expect((one.item as { itemUrl: string }).itemUrl).toContain("/items/55");
    expect(seen).toEqual([
      "GET https://api.github.com/orgs/octo%20org/projectsV2?q=roadmap&per_page=30&after=abc",
      "GET https://api.github.com/orgs/octo-org/projectsV2/4",
      "GET https://api.github.com/orgs/octo-org/projectsV2/4/fields?per_page=10&before=zzz",
      "GET https://api.github.com/orgs/octo-org/projectsV2/4/fields/11",
      "GET https://api.github.com/orgs/octo-org/projectsV2/4/items?q=bug&fields=Title&fields=Status",
      "GET https://api.github.com/orgs/octo-org/projectsV2/4/items/55?fields=Title",
    ]);
  });

  test("writes drafts fields items and views on the documented mutator paths", async () => {
    const requests: Request[] = [];
    const fetch = async (input: string | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      const url = String(input);
      if (url.endsWith("/drafts")) return json(draftFixture, 201);
      if (url.endsWith("/fields")) return json(fieldFixture, 201);
      if (url.endsWith("/items")) return json(itemFixture, 201);
      if (url.endsWith("/items/55") && (init?.method ?? "GET") === "PATCH") return json(itemFixture, 200);
      if (url.endsWith("/items/55") && init?.method === "DELETE") return new Response(null, { status: 204 });
      if (url.endsWith("/views")) return json(viewFixture, 201);
      return new Response("{}", { status: 500 });
    };
    const draft = await createOrgProjectDraft({
      accessToken: "t",
      org: "octo-org",
      projectNumber: 4,
      title: "Draft idea",
      body: "Write it up",
      fetch,
    });
    expect(draft.action).toBe("orgs.projects_v2.drafts.create");
    expect((draft.item as { contentType: string; content: { title: string } }).contentType).toBe("DraftIssue");
    expect((draft.item as { content: { title: string } }).content.title).toBe("Draft idea");
    const createdField = await createOrgProjectField({
      accessToken: "t",
      org: "octo-org",
      projectNumber: 4,
      name: "Priority",
      dataType: "text",
      fetch,
    });
    expect((createdField.field as { name: string }).name).toBe("Priority");
    const added = await addOrgProjectItem({
      accessToken: "t",
      org: "octo-org",
      projectNumber: 4,
      type: "Issue",
      id: 1347,
      fetch,
    });
    expect((added.item as { id: number }).id).toBe(55);
    const updated = await updateOrgProjectItem({
      accessToken: "t",
      org: "octo-org",
      projectNumber: 4,
      itemId: 55,
      fields: [{ id: 11, value: null }],
      fetch,
    });
    expect((updated.item as { id: number }).id).toBe(55);
    const deleted = await deleteOrgProjectItem({
      accessToken: "t",
      org: "octo-org",
      projectNumber: 4,
      itemId: 55,
      fetch,
    });
    expect(deleted.deleted).toBe(true);
    expect(deleted.itemId).toBe(55);
    const view = await createOrgProjectView({
      accessToken: "t",
      org: "octo-org",
      projectNumber: 4,
      name: "Sprint Board",
      layout: "board",
      filter: "is:issue is:open",
      visibleFields: [123, 456],
      sortBy: [[123, "asc"]],
      groupBy: [11],
      verticalGroupBy: [11],
      fetch,
    });
    expect((view.view as { htmlUrl: string; visibleFields: number[]; sortBy: unknown[] }).htmlUrl).toContain("/views/1");
    expect((view.view as { visibleFields: number[] }).visibleFields).toEqual([123, 456]);
    expect(JSON.stringify(view.view)).not.toContain("drop-me");
    expect(JSON.stringify(view.view)).not.toContain("html_url");
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "POST https://api.github.com/orgs/octo-org/projectsV2/4/drafts",
      "POST https://api.github.com/orgs/octo-org/projectsV2/4/fields",
      "POST https://api.github.com/orgs/octo-org/projectsV2/4/items",
      "PATCH https://api.github.com/orgs/octo-org/projectsV2/4/items/55",
      "DELETE https://api.github.com/orgs/octo-org/projectsV2/4/items/55",
      "POST https://api.github.com/orgs/octo-org/projectsV2/4/views",
    ]);
    expect(await requests[0].json()).toEqual({ title: "Draft idea", body: "Write it up" });
    expect(await requests[1].json()).toEqual({ name: "Priority", data_type: "text" });
    expect(await requests[2].json()).toEqual({ type: "Issue", id: 1347 });
    expect(await requests[3].json()).toEqual({ fields: [{ id: 11, value: null }] });
    expect(await requests[5].json()).toEqual({
      name: "Sprint Board",
      layout: "board",
      filter: "is:issue is:open",
      visible_fields: [123, 456],
      sort_by: [[123, "asc"]],
      group_by: [11],
      vertical_group_by: [11],
    });
    expect(requests[0].headers.get("content-type")).toBe("application/json");
    expect(requests[0].headers.get("accept")).toBe("application/vnd.github+json");
  });

  test("a missing resource and 401 are CONNECTOR_UPSTREAM_ERROR", async () => {
    const missing = async () => new Response("", { status: 404 });
    const denied = async () => new Response("", { status: 401 });
    await expect(listOrgProjectsV2({ accessToken: "t", org: "octo-org", fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getOrgProjectV2({ accessToken: "t", org: "octo-org", projectNumber: 4, fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getOrgProjectField({ accessToken: "t", org: "octo-org", projectNumber: 4, fieldId: 11, fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getOrgProjectItem({ accessToken: "t", org: "octo-org", projectNumber: 4, itemId: 55, fetch: denied })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(deleteOrgProjectItem({ accessToken: "t", org: "octo-org", projectNumber: 4, itemId: 55, fetch: missing })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(createOrgProjectDraft({ accessToken: "t", org: "octo-org", projectNumber: 4, title: "x", fetch: denied })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
