import { describe, expect, test } from "bun:test";
import foldersListFixture from "../fixtures/folders_list.json";
import createFolderFixture from "../fixtures/create_folder.json";
import listContactsFixture from "../fixtures/list_contacts.json";
import templatesListFixture from "../fixtures/templates_list.json";
import getTemplateFixture from "../fixtures/get_template.json";
import sendersListFixture from "../fixtures/senders_list.json";
import {
  updateList,
  deleteList,
  getListContacts,
  listFolders,
  createFolder,
  updateEmailCampaign,
  deleteEmailCampaign,
  sendTestEmailCampaign,
  listTemplates,
  getTemplate,
  listSenders,
} from "../src/actions";

const API_KEY = "fixture-api-token";

function mockFetch(status: number, body: unknown, capture?: Request[]) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    capture?.push(request);
    if (body === null) return new Response(null, { status });
    return Response.json(body, { status });
  };
}

describe("lists.update / delete / getContacts", () => {
  test("updateList validates without apiKey", () => {
    expect(updateList({ listId: 17, name: "Renamed" })).toMatchObject({
      action: "lists.update",
      validated: { listId: 17, name: "Renamed" },
    });
  });

  test("updateList PUTs a new name", async () => {
    const requests: Request[] = [];
    const result = await updateList({
      apiKey: API_KEY,
      listId: 17,
      name: "Renamed",
      fetch: mockFetch(204, null, requests),
    });
    expect(requests[0].method).toBe("PUT");
    expect(requests[0].url).toBe("https://api.brevo.com/v3/contacts/lists/17");
    expect(requests[0].headers.get("api-key")).toBe(API_KEY);
    expect(result).toEqual({
      connector: "brevo",
      action: "lists.update",
      source: "connector",
      updated: true,
      listId: 17,
      name: "Renamed",
    });
    expect(JSON.stringify(result)).not.toContain(API_KEY);
  });

  test("deleteList DELETEs the list", async () => {
    const requests: Request[] = [];
    const result = await deleteList({
      apiKey: API_KEY,
      listId: 17,
      fetch: mockFetch(204, null, requests),
    });
    expect(requests[0].method).toBe("DELETE");
    expect(result).toMatchObject({ action: "lists.delete", deleted: true });
  });

  test("getListContacts returns contacts from a list", async () => {
    const requests: Request[] = [];
    const result = await getListContacts({
      apiKey: API_KEY,
      listId: 17,
      limit: 50,
      fetch: mockFetch(200, listContactsFixture, requests),
    });
    expect(requests[0].url).toBe("https://api.brevo.com/v3/contacts/lists/17/contacts?limit=50");
    expect(result).toMatchObject({
      action: "lists.getContacts",
      count: 1,
      contacts: [{ email: "contact@example.com" }],
    });
  });

  test("maps 429 on list delete", async () => {
    await expect(deleteList({
      apiKey: API_KEY,
      listId: 17,
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "9" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 9 });
  });
});

describe("folders.list / create", () => {
  test("listFolders fetches folders", async () => {
    const result = await listFolders({
      apiKey: API_KEY,
      fetch: mockFetch(200, foldersListFixture),
    });
    expect(result).toMatchObject({
      action: "folders.list",
      folders: [{ id: "brv-folder:1", name: "Default" }],
    });
  });

  test("createFolder POSTs a name", async () => {
    const requests: Request[] = [];
    const result = await createFolder({
      apiKey: API_KEY,
      name: "Prospects",
      fetch: mockFetch(201, createFolderFixture, requests),
    });
    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toBe("https://api.brevo.com/v3/contacts/folders");
    expect(result).toMatchObject({ action: "folders.create", folder: { id: "brv-folder:8", name: "Prospects" } });
  });

  test("createFolder requires name", () => {
    expect(() => createFolder({ apiKey: API_KEY })).toThrow("name is required");
  });
});

describe("emailCampaigns.update / delete / sendTest", () => {
  test("updateEmailCampaign PUTs campaign fields", async () => {
    const requests: Request[] = [];
    const result = await updateEmailCampaign({
      apiKey: API_KEY,
      campaignId: 55,
      subject: "Updated subject",
      fetch: mockFetch(204, null, requests),
    });
    expect(requests[0].method).toBe("PUT");
    expect(requests[0].url).toBe("https://api.brevo.com/v3/emailCampaigns/55");
    expect(await requests[0].json()).toEqual({ subject: "Updated subject" });
    expect(result).toMatchObject({ action: "emailCampaigns.update", updated: true });
  });

  test("deleteEmailCampaign DELETEs the campaign", async () => {
    const result = await deleteEmailCampaign({
      apiKey: API_KEY,
      campaignId: 55,
      fetch: mockFetch(204, null),
    });
    expect(result).toMatchObject({ action: "emailCampaigns.delete", deleted: true });
  });

  test("sendTestEmailCampaign requires emailTo", () => {
    expect(() => sendTestEmailCampaign({ campaignId: 55 })).toThrow("emailTo must be a non-empty array of strings");
  });

  test("sendTestEmailCampaign POSTs emailTo", async () => {
    const requests: Request[] = [];
    const result = await sendTestEmailCampaign({
      apiKey: API_KEY,
      campaignId: 55,
      emailTo: ["qa@example.com"],
      fetch: mockFetch(204, null, requests),
    });
    expect(requests[0].url).toBe("https://api.brevo.com/v3/emailCampaigns/55/sendTest");
    expect(await requests[0].json()).toEqual({ emailTo: ["qa@example.com"] });
    expect(result).toMatchObject({ action: "emailCampaigns.sendTest", sent: true });
  });
});

describe("smtp templates and senders", () => {
  test("listTemplates returns templates", async () => {
    const result = await listTemplates({
      apiKey: API_KEY,
      fetch: mockFetch(200, templatesListFixture),
    });
    expect(result).toMatchObject({
      action: "smtp.templates.list",
      count: 1,
      templates: [{ id: "brv-template:3", name: "Welcome" }],
    });
  });

  test("getTemplate fetches by id", async () => {
    const requests: Request[] = [];
    const result = await getTemplate({
      apiKey: API_KEY,
      templateId: 3,
      fetch: mockFetch(200, getTemplateFixture, requests),
    });
    expect(requests[0].url).toBe("https://api.brevo.com/v3/smtp/templates/3");
    expect(result).toMatchObject({ action: "smtp.templates.get", template: { subject: "Welcome to Acme" } });
  });

  test("listSenders returns verified senders", async () => {
    const result = await listSenders({
      apiKey: API_KEY,
      fetch: mockFetch(200, sendersListFixture),
    });
    expect(result).toMatchObject({
      action: "senders.list",
      senders: [{ email: "hello@example.com", active: true }],
    });
  });

  test("getTemplate maps 404", async () => {
    await expect(getTemplate({
      apiKey: API_KEY,
      templateId: 99,
      fetch: mockFetch(404, { message: "Template not found" }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
