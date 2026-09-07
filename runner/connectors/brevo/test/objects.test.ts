import { describe, expect, test } from "bun:test";
import contactsFixture from "../fixtures/contacts_list.json";
import listsFixture from "../fixtures/lists_list.json";
import campaignsFixture from "../fixtures/campaigns_list.json";
import {
  normalizeContact, parseContactsResponse,
  normalizeList, parseListsResponse,
  normalizeCampaign, parseCampaignsResponse,
} from "../src/objects";

describe("normalizeContact", () => {
  test("normalizes a full contact from fixture", () => {
    const raw = contactsFixture.contacts[0];
    const result = normalizeContact(raw);

    expect(result).toEqual({
      id: "brv-contact:101",
      provider: "brevo",
      providerContactId: "101",
      email: "alice@example.com",
      firstName: "Alice",
      lastName: "Anderson",
      listIds: [2, 5],
      attributes: { company: "Acme", plan: "pro" },
      createdAt: "2025-01-15T10:30:00Z",
      updatedAt: "2025-06-01T14:00:00Z",
      modelVersion: "2026-05-16",
      raw,
    });
  });

  test("normalizes a contact with minimal fields", () => {
    const result = normalizeContact({ id: "50" });

    expect(result.id).toBe("brv-contact:50");
    expect(result.providerContactId).toBe("50");
    expect(result.email).toBe("");
    expect(result.firstName).toBe("");
    expect(result.lastName).toBe("");
    expect(result.listIds).toEqual([]);
    expect(result.attributes).toEqual({});
    expect(result.createdAt).toBe("");
    expect(result.updatedAt).toBe("");
  });

  test("filters non-number listIds", () => {
    const result = normalizeContact({ id: "1", listIds: [2, "bad", null, 3] as unknown[] });
    expect(result.listIds).toEqual([2, 3]);
  });

  test("defaults attributes to empty object when not a record", () => {
    const result = normalizeContact({ id: "1", attributes: "string" });
    expect(result.attributes).toEqual({});
  });
});

describe("parseContactsResponse", () => {
  test("parses the contacts_list fixture", () => {
    const result = parseContactsResponse(contactsFixture);

    expect(result.contacts).toHaveLength(2);
    expect(result.count).toBe(2);
    expect(result.contacts[0].id).toBe("brv-contact:101");
    expect(result.contacts[0].email).toBe("alice@example.com");
    expect(result.contacts[1].id).toBe("brv-contact:102");
    expect(result.contacts[1].email).toBe("bob@example.com");
  });

  test("returns empty contacts for null input", () => {
    const result = parseContactsResponse(null);
    expect(result.contacts).toEqual([]);
    expect(result.count).toBe(0);
  });

  test("returns empty contacts for non-record input", () => {
    const result = parseContactsResponse("string");
    expect(result.contacts).toEqual([]);
    expect(result.count).toBe(0);
  });

  test("returns empty contacts when contacts field is not an array", () => {
    const result = parseContactsResponse({ contacts: "bad", count: 5 });
    expect(result.contacts).toEqual([]);
    expect(result.count).toBe(5);
  });

  test("filters out non-record entries in contacts array", () => {
    const result = parseContactsResponse({ contacts: [null, { id: "1" }, "bad", { id: "2" }], count: 4 });
    expect(result.contacts).toHaveLength(2);
    expect(result.contacts[0].id).toBe("brv-contact:1");
    expect(result.contacts[1].id).toBe("brv-contact:2");
  });
});

describe("normalizeList", () => {
  test("normalizes a list from fixture", () => {
    const raw = listsFixture.lists[0];
    const result = normalizeList(raw);

    expect(result).toEqual({
      id: "brv-list:2",
      provider: "brevo",
      providerListId: "2",
      name: "Newsletter",
      totalSubscribers: 500,
      createdAt: "2024-06-01T00:00:00Z",
      modelVersion: "2026-05-16",
      raw,
    });
  });

  test("normalizes a list with missing fields", () => {
    const result = normalizeList({});
    expect(result.id).toBe("brv-list:");
    expect(result.providerListId).toBe("");
    expect(result.name).toBe("");
    expect(result.totalSubscribers).toBe(0);
    expect(result.createdAt).toBe("");
  });
});

describe("parseListsResponse", () => {
  test("parses the lists_list fixture", () => {
    const result = parseListsResponse(listsFixture);
    expect(result.lists).toHaveLength(1);
    expect(result.lists[0].name).toBe("Newsletter");
    expect(result.lists[0].totalSubscribers).toBe(500);
  });

  test("returns empty lists for null input", () => {
    const result = parseListsResponse(null);
    expect(result.lists).toEqual([]);
  });

  test("returns empty lists when lists field is not an array", () => {
    const result = parseListsResponse({ lists: "not-array" });
    expect(result.lists).toEqual([]);
  });
});

describe("normalizeCampaign", () => {
  test("normalizes a campaign from fixture", () => {
    const raw = campaignsFixture.campaigns[0];
    const result = normalizeCampaign(raw);

    expect(result).toEqual({
      id: "brv-campaign:1",
      provider: "brevo",
      providerCampaignId: "1",
      name: "Welcome",
      status: "sent",
      type: "classic",
      subject: "Welcome!",
      sentCount: 450,
      openRate: 0.62,
      clickRate: 0.18,
      createdAt: "2025-07-01T12:00:00Z",
      modelVersion: "2026-05-16",
      raw,
    });
  });

  test("defaults stats to zero when stats is missing", () => {
    const result = normalizeCampaign({ id: "5" });
    expect(result.id).toBe("brv-campaign:5");
    expect(result.sentCount).toBe(0);
    expect(result.openRate).toBe(0);
    expect(result.clickRate).toBe(0);
  });

  test("defaults stats to zero when stats is not a record", () => {
    const result = normalizeCampaign({ id: "5", stats: "bad" });
    expect(result.sentCount).toBe(0);
    expect(result.openRate).toBe(0);
    expect(result.clickRate).toBe(0);
  });

  test("handles missing fields gracefully", () => {
    const result = normalizeCampaign({});
    expect(result.id).toBe("brv-campaign:");
    expect(result.name).toBe("");
    expect(result.status).toBe("");
    expect(result.type).toBe("");
    expect(result.subject).toBe("");
    expect(result.createdAt).toBe("");
  });
});

describe("parseCampaignsResponse", () => {
  test("parses the campaigns_list fixture", () => {
    const result = parseCampaignsResponse(campaignsFixture);
    expect(result.campaigns).toHaveLength(1);
    expect(result.campaigns[0].name).toBe("Welcome");
    expect(result.campaigns[0].status).toBe("sent");
    expect(result.campaigns[0].sentCount).toBe(450);
  });

  test("returns empty campaigns for null input", () => {
    const result = parseCampaignsResponse(null);
    expect(result.campaigns).toEqual([]);
  });

  test("returns empty campaigns when campaigns field is not an array", () => {
    const result = parseCampaignsResponse({ campaigns: "not-array" });
    expect(result.campaigns).toEqual([]);
  });

  test("filters out non-record entries in campaigns array", () => {
    const result = parseCampaignsResponse({ campaigns: [null, { id: "1" }, 42] });
    expect(result.campaigns).toHaveLength(1);
    expect(result.campaigns[0].id).toBe("brv-campaign:1");
  });
});
