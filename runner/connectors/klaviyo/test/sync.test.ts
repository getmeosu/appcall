import { describe, expect, it } from "bun:test";
import {
  executeContactsListSync,
  executeCampaignsListSync,
  executeListsListSync,
} from "../src/sync";
import contactsListFixture from "../fixtures/contacts_list.json";
import campaignsListFixture from "../fixtures/campaigns_list.json";
import listsListFixture from "../fixtures/lists_list.json";

describe("contacts.list sync", () => {
  it("returns normalized contacts with cursor", () => {
    const result = executeContactsListSync({ response: contactsListFixture });
    expect(result.provider).toBe("klaviyo");
    expect(result.operation).toBe("contacts.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("kl-contact:abc123");
    expect(result.items[0].email).toBe("alice@example.com");
    expect(result.items[1].id).toBe("kl-contact:def456");
    expect(result.nextPageToken).toBe("xyz_cursor_abc");
  });

  it("returns empty for null response", () => {
    const result = executeContactsListSync({ response: null });
    expect(result.items).toHaveLength(0);
    expect(result.nextPageToken).toBeNull();
  });
});

describe("campaigns.list sync", () => {
  it("returns normalized campaigns without cursor", () => {
    const result = executeCampaignsListSync({ response: campaignsListFixture });
    expect(result.provider).toBe("klaviyo");
    expect(result.operation).toBe("campaigns.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("kl-campaign:c1");
    expect(result.items[0].name).toBe("Summer Sale 2024");
    expect(result.items[0].sentCount).toBe(12500);
    expect(result.items[1].id).toBe("kl-campaign:c2");
    expect(result.nextPageToken).toBeNull();
  });

  it("returns empty for null response", () => {
    const result = executeCampaignsListSync({ response: null });
    expect(result.items).toHaveLength(0);
    expect(result.nextPageToken).toBeNull();
  });
});

describe("lists.list sync", () => {
  it("returns normalized lists without cursor", () => {
    const result = executeListsListSync({ response: listsListFixture });
    expect(result.provider).toBe("klaviyo");
    expect(result.operation).toBe("lists.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("kl-list:l1");
    expect(result.items[0].name).toBe("Newsletter Subscribers");
    expect(result.items[0].totalMembers).toBe(5420);
    expect(result.items[1].id).toBe("kl-list:l2");
    expect(result.items[1].totalMembers).toBe(320);
    expect(result.nextPageToken).toBeNull();
  });

  it("returns empty for null response", () => {
    const result = executeListsListSync({ response: null });
    expect(result.items).toHaveLength(0);
    expect(result.nextPageToken).toBeNull();
  });
});
