import { describe, expect, test } from "bun:test";
import contactsFixture from "../fixtures/contacts_list.json";
import listsFixture from "../fixtures/lists_list.json";
import campaignsFixture from "../fixtures/campaigns_list.json";
import {
  executeContactsListSync,
  executeListsListSync,
  executeCampaignsListSync,
} from "../src/sync";

describe("executeContactsListSync", () => {
  test("parses contacts_list fixture into sync result", () => {
    const result = executeContactsListSync({ response: contactsFixture });

    expect(result).toEqual({
      provider: "brevo",
      operation: "contacts.list",
      items: expect.arrayContaining([
        expect.objectContaining({
          id: "brv-contact:101",
          email: "alice@example.com",
        }),
        expect.objectContaining({
          id: "brv-contact:102",
          email: "bob@example.com",
        }),
      ]),
      count: 2,
    });
    expect(result.items).toHaveLength(2);
  });

  test("handles empty response gracefully", () => {
    const result = executeContactsListSync({ response: null });
    expect(result).toEqual({
      provider: "brevo",
      operation: "contacts.list",
      items: [],
      count: 0,
    });
  });
});

describe("executeListsListSync", () => {
  test("parses lists_list fixture into sync result", () => {
    const result = executeListsListSync({ response: listsFixture });

    expect(result).toEqual({
      provider: "brevo",
      operation: "lists.list",
      items: [
        expect.objectContaining({
          id: "brv-list:2",
          name: "Newsletter",
          totalSubscribers: 500,
        }),
      ],
    });
    expect(result.items).toHaveLength(1);
  });

  test("handles empty response gracefully", () => {
    const result = executeListsListSync({ response: { lists: [] } });
    expect(result).toEqual({
      provider: "brevo",
      operation: "lists.list",
      items: [],
    });
  });
});

describe("executeCampaignsListSync", () => {
  test("parses campaigns_list fixture into sync result", () => {
    const result = executeCampaignsListSync({ response: campaignsFixture });

    expect(result).toEqual({
      provider: "brevo",
      operation: "campaigns.list",
      items: [
        expect.objectContaining({
          id: "brv-campaign:1",
          name: "Welcome",
          status: "sent",
          sentCount: 450,
          openRate: 0.62,
          clickRate: 0.18,
        }),
      ],
    });
    expect(result.items).toHaveLength(1);
  });

  test("handles empty response gracefully", () => {
    const result = executeCampaignsListSync({ response: null });
    expect(result).toEqual({
      provider: "brevo",
      operation: "campaigns.list",
      items: [],
    });
  });
});
