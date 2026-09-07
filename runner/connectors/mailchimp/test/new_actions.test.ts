import { describe, expect, it, mock, afterEach, beforeEach } from "bun:test";
import getMemberFixture from "../fixtures/get_member.json";
import createListFixture from "../fixtures/create_list.json";
import getListFixture from "../fixtures/get_list.json";
import createCampaignFixture from "../fixtures/create_campaign.json";
import getCampaignFixture from "../fixtures/get_campaign.json";
import * as httpModule from "../src/http";

// ─── Shared mock infrastructure ──────────────────────────────────────────────
// We mock createMailchimpClient so the URL host-allow-list check is bypassed,
// exactly like the existing actions.test.ts does for createContact.

type FetchCall = { path: string; method: string; body?: unknown; authHeader?: string };
let fetchCalls: FetchCall[] = [];
let mockStatus = 200;
let mockResponseBody: unknown = {};

const mockFetchJSONImpl = mock(async (path: string, init: RequestInit = {}) => {
  const authHeader = (init.headers as Record<string, string> | undefined)?.["Authorization"] ?? "";
  let body: unknown;
  try { body = JSON.parse((init.body as string) ?? "{}"); } catch { body = init.body; }
  fetchCalls.push({ path, method: init.method ?? "GET", body, authHeader });
  return { status: mockStatus, headers: {} as Record<string, string>, body: mockResponseBody };
});

mock.module("../src/http", () => ({
  ...httpModule,
  createMailchimpClient: (_opts: unknown) => ({ fetchJSON: mockFetchJSONImpl }),
}));

// Import AFTER mocking
import {
  getMember,
  updateMember,
  upsertMember,
  deleteMember,
  addMemberTags,
  createList,
  getList,
  createCampaign,
  getCampaign,
  sendCampaign,
} from "../src/actions";

function resetMocks(status: number, body: unknown) {
  fetchCalls = [];
  mockStatus = status;
  mockResponseBody = body;
  mockFetchJSONImpl.mockClear();
}

// ─── lists.members.get ────────────────────────────────────────────────────────

describe("getMember action", () => {
  it("validates input without apiKey", () => {
    const result = getMember({ listId: "list001", email: "member@example.com" });
    expect((result as any).connector).toBe("mailchimp");
    expect((result as any).action).toBe("lists.members.get");
    expect((result as any).validated.listId).toBe("list001");
    expect((result as any).validated.email).toBe("member@example.com");
  });

  it("throws when listId is missing", () => {
    expect(() => getMember({ email: "a@b.com" })).toThrow("listId is required");
  });

  it("throws when email is missing", () => {
    expect(() => getMember({ listId: "list001" })).toThrow("email is required");
  });

  it("fetches member and returns normalized result", async () => {
    resetMocks(200, getMemberFixture);
    const result = await getMember({ apiKey: "us21abcdef1234", listId: "list001", email: "member@example.com" });
    expect(result.connector).toBe("mailchimp");
    expect(result.action).toBe("lists.members.get");
    expect(result.source).toBe("connector");
    expect((result as any).member.email).toBe("member@example.com");
    expect((result as any).member.firstName).toBe("Jane");
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].path).toContain("/lists/list001/members/");
    expect(fetchCalls[0].method).toBe("GET");
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    resetMocks(429, { detail: "rate limited" });
    await expect(getMember({ apiKey: "us21abcdef1234", listId: "list001", email: "member@example.com" }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });

  it("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    resetMocks(404, { detail: "not found" });
    await expect(getMember({ apiKey: "us21abcdef1234", listId: "list001", email: "notfound@example.com" }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── lists.members.update ─────────────────────────────────────────────────────

describe("updateMember action", () => {
  it("validates input without apiKey", () => {
    const result = updateMember({ listId: "list001", email: "member@example.com", status: "unsubscribed" });
    expect((result as any).validated.email).toBe("member@example.com");
    expect((result as any).action).toBe("lists.members.update");
  });

  it("throws when email is missing", () => {
    expect(() => updateMember({ listId: "list001" })).toThrow("email is required");
  });

  it("patches member and returns normalized result", async () => {
    resetMocks(200, { ...getMemberFixture, merge_fields: { FNAME: "Janet", LNAME: "Doe" } });
    const result = await updateMember({
      apiKey: "us21abcdef1234",
      listId: "list001",
      email: "member@example.com",
      firstName: "Janet",
    });
    expect(result.action).toBe("lists.members.update");
    expect((result as any).member).toBeDefined();
    expect(fetchCalls[0].method).toBe("PATCH");
    expect(fetchCalls[0].path).toContain("/lists/list001/members/");
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    resetMocks(429, {});
    await expect(updateMember({ apiKey: "us21abcdef1234", listId: "list001", email: "member@example.com" }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });

  it("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    resetMocks(404, {});
    await expect(updateMember({ apiKey: "us21abcdef1234", listId: "list001", email: "gone@example.com" }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── lists.members.upsert ─────────────────────────────────────────────────────

describe("upsertMember action", () => {
  it("validates input without apiKey", () => {
    const result = upsertMember({ listId: "list001", email: "new@example.com" });
    expect((result as any).validated.email).toBe("new@example.com");
    expect((result as any).action).toBe("lists.members.upsert");
  });

  it("throws when listId is missing", () => {
    expect(() => upsertMember({ email: "a@b.com" })).toThrow("listId is required");
  });

  it("PUTs member and returns normalized result", async () => {
    resetMocks(200, getMemberFixture);
    const result = await upsertMember({
      apiKey: "us21abcdef1234",
      listId: "list001",
      email: "member@example.com",
      status: "subscribed",
    });
    expect(result.action).toBe("lists.members.upsert");
    expect((result as any).member.email).toBe("member@example.com");
    expect(fetchCalls[0].method).toBe("PUT");
    expect(fetchCalls[0].path).toContain("/lists/list001/members/");
    expect((fetchCalls[0].body as any)?.email_address).toBe("member@example.com");
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    resetMocks(429, {});
    await expect(upsertMember({ apiKey: "us21abcdef1234", listId: "list001", email: "member@example.com" }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── lists.members.delete ─────────────────────────────────────────────────────

describe("deleteMember action", () => {
  it("validates input without apiKey", () => {
    const result = deleteMember({ listId: "list001", email: "member@example.com" });
    expect((result as any).validated.email).toBe("member@example.com");
    expect((result as any).action).toBe("lists.members.delete");
  });

  it("throws when email is missing", () => {
    expect(() => deleteMember({ listId: "list001" })).toThrow("email is required");
  });

  it("deletes member and returns deleted=true", async () => {
    resetMocks(204, null);
    const result = await deleteMember({
      apiKey: "us21abcdef1234",
      listId: "list001",
      email: "member@example.com",
    });
    expect(result.action).toBe("lists.members.delete");
    expect((result as any).deleted).toBe(true);
    expect(fetchCalls[0].method).toBe("DELETE");
    expect(fetchCalls[0].path).toContain("/lists/list001/members/");
  });

  it("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    resetMocks(404, {});
    await expect(deleteMember({ apiKey: "us21abcdef1234", listId: "list001", email: "notfound@example.com" }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    resetMocks(429, {});
    await expect(deleteMember({ apiKey: "us21abcdef1234", listId: "list001", email: "member@example.com" }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── lists.members.tags.add ───────────────────────────────────────────────────

describe("addMemberTags action", () => {
  it("validates input without apiKey", () => {
    const result = addMemberTags({ listId: "list001", email: "member@example.com", tags: ["VIP"] });
    expect((result as any).validated.tags).toEqual(["VIP"]);
    expect((result as any).action).toBe("lists.members.tags.add");
  });

  it("throws when tags is empty", () => {
    expect(() => addMemberTags({ listId: "list001", email: "a@b.com", tags: [] })).toThrow("tags must be a non-empty array");
  });

  it("throws when email is missing", () => {
    expect(() => addMemberTags({ listId: "list001", tags: ["VIP"] })).toThrow("email is required");
  });

  it("POSTs tags and returns updated=true", async () => {
    resetMocks(204, null);
    const result = await addMemberTags({
      apiKey: "us21abcdef1234",
      listId: "list001",
      email: "member@example.com",
      tags: ["VIP", "Newsletter"],
    });
    expect(result.action).toBe("lists.members.tags.add");
    expect((result as any).updated).toBe(true);
    expect(fetchCalls[0].method).toBe("POST");
    expect(fetchCalls[0].path).toContain("/tags");
    expect((fetchCalls[0].body as any)?.tags).toEqual([
      { name: "VIP", status: "active" },
      { name: "Newsletter", status: "active" },
    ]);
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    resetMocks(429, {});
    await expect(addMemberTags({ apiKey: "us21abcdef1234", listId: "list001", email: "member@example.com", tags: ["VIP"] }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── lists.create ─────────────────────────────────────────────────────────────

const validCreateListInput = {
  name: "New Audience",
  permissionReminder: "You signed up on our website.",
  contactCompany: "Acme Inc",
  contactAddress1: "123 Main St",
  contactCity: "Springfield",
  contactCountry: "US",
  fromName: "Acme Team",
  fromEmail: "hello@acme.com",
  subject: "News from Acme",
};

describe("createList action", () => {
  it("validates input without apiKey", () => {
    const result = createList(validCreateListInput);
    expect((result as any).validated.name).toBe("New Audience");
    expect((result as any).action).toBe("lists.create");
  });

  it("throws when required field is missing", () => {
    const { name: _omit, ...rest } = validCreateListInput;
    expect(() => createList(rest)).toThrow("name is required");
  });

  it("creates list and returns normalized audience", async () => {
    resetMocks(200, createListFixture);
    const result = await createList({ apiKey: "us21abcdef1234", ...validCreateListInput });
    expect(result.action).toBe("lists.create");
    expect((result as any).audience.name).toBe("New Audience");
    expect(fetchCalls[0].method).toBe("POST");
    expect(fetchCalls[0].path).toBe("/lists");
    expect((fetchCalls[0].body as any)?.name).toBe("New Audience");
    expect((fetchCalls[0].body as any)?.contact.company).toBe("Acme Inc");
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    resetMocks(429, {});
    await expect(createList({ apiKey: "us21abcdef1234", ...validCreateListInput }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── lists.get ────────────────────────────────────────────────────────────────

describe("getList action", () => {
  it("validates input without apiKey", () => {
    const result = getList({ listId: "list001" });
    expect((result as any).validated.listId).toBe("list001");
    expect((result as any).action).toBe("lists.get");
  });

  it("throws when listId is missing", () => {
    expect(() => getList({})).toThrow("listId is required");
  });

  it("fetches list and returns normalized audience", async () => {
    resetMocks(200, getListFixture);
    const result = await getList({ apiKey: "us21abcdef1234", listId: "list001" });
    expect(result.action).toBe("lists.get");
    expect((result as any).audience.name).toBe("Main Newsletter");
    expect((result as any).audience.memberCount).toBe(15420);
    expect(fetchCalls[0].path).toBe("/lists/list001");
    expect(fetchCalls[0].method).toBe("GET");
  });

  it("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    resetMocks(404, {});
    await expect(getList({ apiKey: "us21abcdef1234", listId: "bad_id" }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    resetMocks(429, {});
    await expect(getList({ apiKey: "us21abcdef1234", listId: "list001" }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── campaigns.create ─────────────────────────────────────────────────────────

const validCampaignInput = {
  type: "regular",
  listId: "list001",
  subjectLine: "May Newsletter",
  title: "May Campaign",
  fromName: "Acme Team",
  replyTo: "hello@acme.com",
};

describe("createCampaign action", () => {
  it("validates input without apiKey", () => {
    const result = createCampaign(validCampaignInput);
    expect((result as any).validated.type).toBe("regular");
    expect((result as any).action).toBe("campaigns.create");
  });

  it("throws when listId is missing", () => {
    const { listId: _omit, ...rest } = validCampaignInput;
    expect(() => createCampaign(rest)).toThrow("listId is required");
  });

  it("creates campaign and returns normalized result", async () => {
    resetMocks(200, createCampaignFixture);
    const result = await createCampaign({ apiKey: "us21abcdef1234", ...validCampaignInput });
    expect(result.action).toBe("campaigns.create");
    expect((result as any).campaign.providerCampaignId).toBe("camp001");
    expect(fetchCalls[0].method).toBe("POST");
    expect(fetchCalls[0].path).toBe("/campaigns");
    expect((fetchCalls[0].body as any)?.type).toBe("regular");
    expect((fetchCalls[0].body as any)?.recipients.list_id).toBe("list001");
    expect((fetchCalls[0].body as any)?.settings.subject_line).toBe("May Newsletter");
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    resetMocks(429, {});
    await expect(createCampaign({ apiKey: "us21abcdef1234", ...validCampaignInput }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── campaigns.get ────────────────────────────────────────────────────────────

describe("getCampaign action", () => {
  it("validates input without apiKey", () => {
    const result = getCampaign({ campaignId: "camp001" });
    expect((result as any).validated.campaignId).toBe("camp001");
    expect((result as any).action).toBe("campaigns.get");
  });

  it("throws when campaignId is missing", () => {
    expect(() => getCampaign({})).toThrow("campaignId is required");
  });

  it("fetches campaign and returns normalized result", async () => {
    resetMocks(200, getCampaignFixture);
    const result = await getCampaign({ apiKey: "us21abcdef1234", campaignId: "camp001" });
    expect(result.action).toBe("campaigns.get");
    expect((result as any).campaign.status).toBe("sent");
    expect((result as any).campaign.providerCampaignId).toBe("camp001");
    expect(fetchCalls[0].path).toBe("/campaigns/camp001");
    expect(fetchCalls[0].method).toBe("GET");
  });

  it("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    resetMocks(404, {});
    await expect(getCampaign({ apiKey: "us21abcdef1234", campaignId: "bad" }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    resetMocks(429, {});
    await expect(getCampaign({ apiKey: "us21abcdef1234", campaignId: "camp001" }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── campaigns.send ───────────────────────────────────────────────────────────

describe("sendCampaign action", () => {
  it("validates input without apiKey", () => {
    const result = sendCampaign({ campaignId: "camp001" });
    expect((result as any).validated.campaignId).toBe("camp001");
    expect((result as any).action).toBe("campaigns.send");
  });

  it("throws when campaignId is missing", () => {
    expect(() => sendCampaign({})).toThrow("campaignId is required");
  });

  it("sends campaign and returns sent=true", async () => {
    resetMocks(204, null);
    const result = await sendCampaign({ apiKey: "us21abcdef1234", campaignId: "camp001" });
    expect(result.action).toBe("campaigns.send");
    expect((result as any).sent).toBe(true);
    expect(fetchCalls[0].method).toBe("POST");
    expect(fetchCalls[0].path).toBe("/campaigns/camp001/actions/send");
  });

  it("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    resetMocks(404, {});
    await expect(sendCampaign({ apiKey: "us21abcdef1234", campaignId: "bad" }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    resetMocks(429, {});
    await expect(sendCampaign({ apiKey: "us21abcdef1234", campaignId: "camp001" }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});
