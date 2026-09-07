import { describe, expect, it } from "bun:test";
import {
  executeContactsListSync,
  executeListsListSync,
  executeCampaignsListSync,
} from "../src/sync";
import contactsList from "../fixtures/contacts_list.json";
import contactsListLast from "../fixtures/contacts_list_last.json";
import listsList from "../fixtures/lists_list.json";
import campaignsList from "../fixtures/campaigns_list.json";

describe("contacts.list sync", () => {
  it("returns normalized contacts with cursor", () => {
    const result = executeContactsListSync({ response: contactsList });
    expect(result.provider).toBe("sendgrid");
    expect(result.operation).toBe("contacts.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("sg-contact:c001");
    expect(result.items[0].email).toBe("alice@example.com");
    expect(result.items[0].listIds).toEqual(["list-1", "list-2"]);
    expect(result.items[1].id).toBe("sg-contact:c002");
    expect(result.nextPageToken).toBe("abc");
  });

  it("returns no cursor on last page", () => {
    const result = executeContactsListSync({ response: contactsListLast });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe("sg-contact:c003");
    expect(result.nextPageToken).toBeNull();
  });

  it("returns empty for null response", () => {
    const result = executeContactsListSync({ response: null });
    expect(result.items).toHaveLength(0);
    expect(result.nextPageToken).toBeNull();
  });
});

describe("lists.list sync", () => {
  it("returns normalized lists", () => {
    const result = executeListsListSync({ response: listsList });
    expect(result.provider).toBe("sendgrid");
    expect(result.operation).toBe("lists.list");
    expect(result.items).toHaveLength(3);
    expect(result.items[0].id).toBe("sg-list:list-1");
    expect(result.items[0].name).toBe("Newsletter Subscribers");
    expect(result.items[0].contactCount).toBe(15420);
    expect(result.items[1].id).toBe("sg-list:list-2");
    expect(result.items[2].id).toBe("sg-list:list-3");
    expect(result.items[2].contactCount).toBe(750);
  });

  it("returns empty for null response", () => {
    const result = executeListsListSync({ response: null });
    expect(result.items).toHaveLength(0);
  });
});

describe("campaigns.list sync", () => {
  it("returns normalized campaigns", () => {
    const result = executeCampaignsListSync({ response: campaignsList });
    expect(result.provider).toBe("sendgrid");
    expect(result.operation).toBe("campaigns.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("sg-campaign:camp-1");
    expect(result.items[0].title).toBe("Spring Newsletter");
    expect(result.items[0].openRate).toBe(42.5);
    expect(result.items[0].clickRate).toBe(8.3);
    expect(result.items[1].id).toBe("sg-campaign:camp-2");
    expect(result.items[1].status).toBe("scheduled");
    expect(result.items[1].listIds).toEqual(["list-1", "list-3"]);
  });

  it("returns empty for null response", () => {
    const result = executeCampaignsListSync({ response: null });
    expect(result.items).toHaveLength(0);
  });
});
