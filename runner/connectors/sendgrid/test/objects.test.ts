import { describe, expect, it } from "bun:test";
import {
  normalizeContact, parseContactsResponse,
  normalizeList, parseListsResponse,
  normalizeCampaign, parseCampaignsResponse,
} from "../src/objects";
import contactsList from "../fixtures/contacts_list.json";
import contactsListLast from "../fixtures/contacts_list_last.json";
import listsList from "../fixtures/lists_list.json";
import campaignsList from "../fixtures/campaigns_list.json";

describe("normalizeContact", () => {
  it("normalizes a contact with all fields", () => {
    const result = normalizeContact({
      id: "c001",
      email: "alice@example.com",
      first_name: "Alice",
      last_name: "Anderson",
      list_ids: ["list-1", "list-2"],
      created_at: "2025-01-15T10:30:00Z",
      updated_at: "2025-03-20T14:00:00Z",
    });
    expect(result.id).toBe("sg-contact:c001");
    expect(result.provider).toBe("sendgrid");
    expect(result.providerContactId).toBe("c001");
    expect(result.email).toBe("alice@example.com");
    expect(result.firstName).toBe("Alice");
    expect(result.lastName).toBe("Anderson");
    expect(result.listIds).toEqual(["list-1", "list-2"]);
    expect(result.createdAt).toBe("2025-01-15T10:30:00Z");
    expect(result.updatedAt).toBe("2025-03-20T14:00:00Z");
    expect(result.modelVersion).toBe("2026-05-16");
  });

  it("defaults missing string fields to empty string", () => {
    const result = normalizeContact({ id: "c999" });
    expect(result.email).toBe("");
    expect(result.firstName).toBe("");
    expect(result.lastName).toBe("");
    expect(result.createdAt).toBe("");
    expect(result.updatedAt).toBe("");
  });

  it("filters non-string list_ids", () => {
    const result = normalizeContact({ id: "c100", list_ids: ["a", 123, null, "b"] });
    expect(result.listIds).toEqual(["a", "b"]);
  });

  it("handles missing list_ids", () => {
    const result = normalizeContact({ id: "c101" });
    expect(result.listIds).toEqual([]);
  });

  it("preserves raw object", () => {
    const raw = { id: "c102", email: "x@y.com" };
    const result = normalizeContact(raw);
    expect(result.raw).toBe(raw);
  });
});

describe("parseContactsResponse", () => {
  it("parses a contacts list with next page token", () => {
    const result = parseContactsResponse(contactsList);
    expect(result.contacts).toHaveLength(2);
    expect(result.contacts[0].id).toBe("sg-contact:c001");
    expect(result.contacts[0].email).toBe("alice@example.com");
    expect(result.contacts[0].listIds).toEqual(["list-1", "list-2"]);
    expect(result.contacts[1].id).toBe("sg-contact:c002");
    expect(result.nextPageToken).toBe("abc");
  });

  it("parses last page without next_page_token", () => {
    const result = parseContactsResponse(contactsListLast);
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].id).toBe("sg-contact:c003");
    expect(result.contacts[0].listIds).toEqual([]);
    expect(result.nextPageToken).toBeNull();
  });

  it("returns empty for null input", () => {
    const result = parseContactsResponse(null);
    expect(result.contacts).toEqual([]);
    expect(result.nextPageToken).toBeNull();
  });

  it("returns empty for non-object input", () => {
    const result = parseContactsResponse("string");
    expect(result.contacts).toEqual([]);
    expect(result.nextPageToken).toBeNull();
  });

  it("returns empty when contacts is not an array", () => {
    const result = parseContactsResponse({ contacts: "not-array" });
    expect(result.contacts).toEqual([]);
  });

  it("returns empty for empty contacts array", () => {
    const result = parseContactsResponse({ contacts: [] });
    expect(result.contacts).toEqual([]);
    expect(result.nextPageToken).toBeNull();
  });

  it("filters out non-record entries in contacts", () => {
    const result = parseContactsResponse({ contacts: [null, "string", { id: "ok" }, 42] });
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].id).toBe("sg-contact:ok");
  });
});

describe("normalizeList", () => {
  it("normalizes a list with all fields", () => {
    const result = normalizeList({
      id: "list-1",
      name: "Newsletter Subscribers",
      contact_count: 15420,
      created_at: "2024-06-01T00:00:00Z",
    });
    expect(result.id).toBe("sg-list:list-1");
    expect(result.provider).toBe("sendgrid");
    expect(result.providerListId).toBe("list-1");
    expect(result.name).toBe("Newsletter Subscribers");
    expect(result.contactCount).toBe(15420);
    expect(result.createdAt).toBe("2024-06-01T00:00:00Z");
    expect(result.modelVersion).toBe("2026-05-16");
  });

  it("defaults contact_count to 0 when not a number", () => {
    const result = normalizeList({ id: "list-x", contact_count: "big" });
    expect(result.contactCount).toBe(0);
  });

  it("defaults contact_count to 0 when missing", () => {
    const result = normalizeList({ id: "list-y" });
    expect(result.contactCount).toBe(0);
  });

  it("defaults string fields to empty string", () => {
    const result = normalizeList({ id: "list-z" });
    expect(result.name).toBe("");
    expect(result.createdAt).toBe("");
  });

  it("preserves raw object", () => {
    const raw = { id: "list-r", name: "Test" };
    const result = normalizeList(raw);
    expect(result.raw).toBe(raw);
  });
});

describe("parseListsResponse", () => {
  it("parses a lists response", () => {
    const result = parseListsResponse(listsList);
    expect(result.lists).toHaveLength(3);
    expect(result.lists[0].id).toBe("sg-list:list-1");
    expect(result.lists[0].name).toBe("Newsletter Subscribers");
    expect(result.lists[0].contactCount).toBe(15420);
    expect(result.lists[1].id).toBe("sg-list:list-2");
    expect(result.lists[2].id).toBe("sg-list:list-3");
    expect(result.lists[2].contactCount).toBe(750);
  });

  it("returns empty for null input", () => {
    const result = parseListsResponse(null);
    expect(result.lists).toEqual([]);
  });

  it("returns empty when results is not an array", () => {
    const result = parseListsResponse({ results: "not-array" });
    expect(result.lists).toEqual([]);
  });

  it("returns empty for object without results key", () => {
    const result = parseListsResponse({});
    expect(result.lists).toEqual([]);
  });

  it("filters out non-record entries in results", () => {
    const result = parseListsResponse({ results: [null, { id: "a" }, "b"] });
    expect(result.lists).toHaveLength(1);
    expect(result.lists[0].id).toBe("sg-list:a");
  });
});

describe("normalizeCampaign", () => {
  it("normalizes a campaign with all fields", () => {
    const result = normalizeCampaign({
      id: "camp-1",
      title: "Spring Newsletter",
      status: "sent",
      subject: "Your March Update",
      sender_id: "sender-001",
      list_ids: ["list-1"],
      stats: { open_rate: 42.5, click_rate: 8.3 },
      create_time: "2025-03-01T10:00:00Z",
    });
    expect(result.id).toBe("sg-campaign:camp-1");
    expect(result.provider).toBe("sendgrid");
    expect(result.providerCampaignId).toBe("camp-1");
    expect(result.title).toBe("Spring Newsletter");
    expect(result.status).toBe("sent");
    expect(result.subject).toBe("Your March Update");
    expect(result.senderId).toBe("sender-001");
    expect(result.listIds).toEqual(["list-1"]);
    expect(result.openRate).toBe(42.5);
    expect(result.clickRate).toBe(8.3);
    expect(result.createdAt).toBe("2025-03-01T10:00:00Z");
    expect(result.modelVersion).toBe("2026-05-16");
  });

  it("defaults stats to 0 when missing", () => {
    const result = normalizeCampaign({ id: "camp-x" });
    expect(result.openRate).toBe(0);
    expect(result.clickRate).toBe(0);
  });

  it("defaults stats to 0 when stats is not a record", () => {
    const result = normalizeCampaign({ id: "camp-y", stats: "bad" });
    expect(result.openRate).toBe(0);
    expect(result.clickRate).toBe(0);
  });

  it("filters non-string list_ids", () => {
    const result = normalizeCampaign({ id: "camp-z", list_ids: ["a", 1, null] });
    expect(result.listIds).toEqual(["a"]);
  });

  it("defaults string fields to empty string", () => {
    const result = normalizeCampaign({ id: "camp-w" });
    expect(result.title).toBe("");
    expect(result.status).toBe("");
    expect(result.subject).toBe("");
    expect(result.senderId).toBe("");
    expect(result.createdAt).toBe("");
  });

  it("preserves raw object", () => {
    const raw = { id: "camp-r", title: "T" };
    const result = normalizeCampaign(raw);
    expect(result.raw).toBe(raw);
  });
});

describe("parseCampaignsResponse", () => {
  it("parses a campaigns response", () => {
    const result = parseCampaignsResponse(campaignsList);
    expect(result.campaigns).toHaveLength(2);
    expect(result.campaigns[0].id).toBe("sg-campaign:camp-1");
    expect(result.campaigns[0].title).toBe("Spring Newsletter");
    expect(result.campaigns[0].openRate).toBe(42.5);
    expect(result.campaigns[0].clickRate).toBe(8.3);
    expect(result.campaigns[1].id).toBe("sg-campaign:camp-2");
    expect(result.campaigns[1].status).toBe("scheduled");
    expect(result.campaigns[1].listIds).toEqual(["list-1", "list-3"]);
  });

  it("returns empty for null input", () => {
    const result = parseCampaignsResponse(null);
    expect(result.campaigns).toEqual([]);
  });

  it("returns empty when results is not an array", () => {
    const result = parseCampaignsResponse({ results: "not-array" });
    expect(result.campaigns).toEqual([]);
  });

  it("returns empty for object without results key", () => {
    const result = parseCampaignsResponse({});
    expect(result.campaigns).toEqual([]);
  });

  it("filters out non-record entries in results", () => {
    const result = parseCampaignsResponse({ results: [null, { id: "c1" }, 42] });
    expect(result.campaigns).toHaveLength(1);
    expect(result.campaigns[0].id).toBe("sg-campaign:c1");
  });
});
