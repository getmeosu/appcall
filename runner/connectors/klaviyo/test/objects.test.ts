import { describe, expect, it } from "bun:test";
import {
  normalizeContact,
  normalizeCampaign,
  normalizeList,
  parseContactsResponse,
  parseCampaignsResponse,
  parseListsResponse,
} from "../src/objects";
import { extractCursorFromUrl, parseNextCursor } from "../src/http";
import contactsListFixture from "../fixtures/contacts_list.json";
import campaignsListFixture from "../fixtures/campaigns_list.json";
import listsListFixture from "../fixtures/lists_list.json";

// ---------------------------------------------------------------------------
// Contact normalization
// ---------------------------------------------------------------------------
describe("normalizeContact", () => {
  it("normalizes a contact with all fields", () => {
    const raw = contactsListFixture.data[0] as Record<string, unknown>;
    const contact = normalizeContact(raw);
    expect(contact.id).toBe("kl-contact:abc123");
    expect(contact.provider).toBe("klaviyo");
    expect(contact.providerContactId).toBe("abc123");
    expect(contact.email).toBe("alice@example.com");
    expect(contact.firstName).toBe("Alice");
    expect(contact.lastName).toBe("Smith");
    expect(contact.phone).toBe("+1-555-0101");
    expect(contact.createdAt).toBe("2024-01-15T10:30:00Z");
    expect(contact.updatedAt).toBe("2024-06-01T08:00:00Z");
    expect(contact.modelVersion).toBe("2026-05-16");
    expect(contact.raw).toBe(raw);
  });

  it("falls back to empty string for missing attributes", () => {
    const contact = normalizeContact({ id: "missing" });
    expect(contact.email).toBe("");
    expect(contact.firstName).toBe("");
    expect(contact.lastName).toBe("");
    expect(contact.phone).toBe("");
    expect(contact.createdAt).toBe("");
    expect(contact.updatedAt).toBe("");
  });

  it("falls back to empty string for missing id", () => {
    const contact = normalizeContact({});
    expect(contact.id).toBe("kl-contact:");
    expect(contact.providerContactId).toBe("");
  });

  it("handles non-record attributes gracefully", () => {
    const contact = normalizeContact({ id: "x", attributes: "not an object" });
    expect(contact.firstName).toBe("");
    expect(contact.email).toBe("");
  });
});

// ---------------------------------------------------------------------------
// parseContactsResponse
// ---------------------------------------------------------------------------
describe("parseContactsResponse", () => {
  it("parses contacts list with cursor", () => {
    const result = parseContactsResponse(contactsListFixture);
    expect(result.contacts).toHaveLength(2);
    expect(result.contacts[0].email).toBe("alice@example.com");
    expect(result.contacts[1].email).toBe("bob@example.com");
    expect(result.nextPageToken).toBe("xyz_cursor_abc");
  });

  it("returns empty for null response", () => {
    const result = parseContactsResponse(null);
    expect(result.contacts).toEqual([]);
    expect(result.nextPageToken).toBeNull();
  });

  it("returns empty for non-object response", () => {
    const result = parseContactsResponse("not an object");
    expect(result.contacts).toEqual([]);
    expect(result.nextPageToken).toBeNull();
  });

  it("returns empty when data is not an array", () => {
    const result = parseContactsResponse({ data: "not an array" });
    expect(result.contacts).toEqual([]);
  });

  it("filters out non-record entries in data", () => {
    const result = parseContactsResponse({ data: ["string", null, { id: "ok", attributes: { email: "a@b.com" } }] });
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].providerContactId).toBe("ok");
  });

  it("returns null cursor when links.next is empty", () => {
    const result = parseContactsResponse({ data: [], links: { next: "" } });
    expect(result.nextPageToken).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Campaign normalization
// ---------------------------------------------------------------------------
describe("normalizeCampaign", () => {
  it("normalizes a campaign with all fields", () => {
    const raw = campaignsListFixture.data[0] as Record<string, unknown>;
    const campaign = normalizeCampaign(raw);
    expect(campaign.id).toBe("kl-campaign:c1");
    expect(campaign.provider).toBe("klaviyo");
    expect(campaign.providerCampaignId).toBe("c1");
    expect(campaign.name).toBe("Summer Sale 2024");
    expect(campaign.status).toBe("sent");
    expect(campaign.channelId).toBe("email");
    expect(campaign.sentCount).toBe(12500);
    expect(campaign.openCount).toBe(4200);
    expect(campaign.clickCount).toBe(890);
    expect(campaign.createdAt).toBe("2024-06-01T09:00:00Z");
    expect(campaign.modelVersion).toBe("2026-05-16");
    expect(campaign.raw).toBe(raw);
  });

  it("defaults numeric fields to 0 when missing", () => {
    const campaign = normalizeCampaign({ id: "cx" });
    expect(campaign.sentCount).toBe(0);
    expect(campaign.openCount).toBe(0);
    expect(campaign.clickCount).toBe(0);
    expect(campaign.name).toBe("");
    expect(campaign.status).toBe("");
  });
});

// ---------------------------------------------------------------------------
// parseCampaignsResponse
// ---------------------------------------------------------------------------
describe("parseCampaignsResponse", () => {
  it("parses campaigns list with no cursor", () => {
    const result = parseCampaignsResponse(campaignsListFixture);
    expect(result.campaigns).toHaveLength(2);
    expect(result.campaigns[0].name).toBe("Summer Sale 2024");
    expect(result.campaigns[1].name).toBe("Welcome Series - Email 1");
    expect(result.nextPageToken).toBeNull();
  });

  it("returns empty for null response", () => {
    const result = parseCampaignsResponse(null);
    expect(result.campaigns).toEqual([]);
    expect(result.nextPageToken).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// List normalization
// ---------------------------------------------------------------------------
describe("normalizeList", () => {
  it("normalizes a list with all fields", () => {
    const raw = listsListFixture.data[0] as Record<string, unknown>;
    const list = normalizeList(raw);
    expect(list.id).toBe("kl-list:l1");
    expect(list.provider).toBe("klaviyo");
    expect(list.providerListId).toBe("l1");
    expect(list.name).toBe("Newsletter Subscribers");
    expect(list.totalMembers).toBe(5420);
    expect(list.createdAt).toBe("2023-11-01T08:00:00Z");
    expect(list.modelVersion).toBe("2026-05-16");
    expect(list.raw).toBe(raw);
  });

  it("defaults totalMembers to 0 when missing", () => {
    const list = normalizeList({ id: "lx" });
    expect(list.totalMembers).toBe(0);
    expect(list.name).toBe("");
  });
});

// ---------------------------------------------------------------------------
// parseListsResponse
// ---------------------------------------------------------------------------
describe("parseListsResponse", () => {
  it("parses lists with no cursor", () => {
    const result = parseListsResponse(listsListFixture);
    expect(result.lists).toHaveLength(2);
    expect(result.lists[0].name).toBe("Newsletter Subscribers");
    expect(result.lists[1].name).toBe("VIP Customers");
    expect(result.nextPageToken).toBeNull();
  });

  it("returns empty for null response", () => {
    const result = parseListsResponse(null);
    expect(result.lists).toEqual([]);
    expect(result.nextPageToken).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Cursor extraction helpers
// ---------------------------------------------------------------------------
describe("extractCursorFromUrl", () => {
  it("extracts cursor from URL-encoded parameter", () => {
    const result = extractCursorFromUrl(
      "https://a.klaviyo.com/api/profiles/?page%5Bcursor%5D=xyz_cursor_abc"
    );
    expect(result).toBe("xyz_cursor_abc");
  });

  it("returns null when cursor parameter is absent", () => {
    const result = extractCursorFromUrl("https://a.klaviyo.com/api/profiles/");
    expect(result).toBeNull();
  });

  it("returns null for empty string", () => {
    const result = extractCursorFromUrl("");
    expect(result).toBeNull();
  });
});

describe("parseNextCursor", () => {
  it("returns the next URL from links", () => {
    const result = parseNextCursor({
      links: { next: "https://a.klaviyo.com/api/profiles/?page%5Bcursor%5D=abc" },
    });
    expect(result).toBe("https://a.klaviyo.com/api/profiles/?page%5Bcursor%5D=abc");
  });

  it("returns null when links is missing", () => {
    expect(parseNextCursor({})).toBeNull();
  });

  it("returns null when next is empty string", () => {
    expect(parseNextCursor({ links: { next: "" } })).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(parseNextCursor(null)).toBeNull();
    expect(parseNextCursor("string")).toBeNull();
  });
});
