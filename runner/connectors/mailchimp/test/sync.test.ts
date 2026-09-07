import { describe, expect, it } from "bun:test";
import { executeContactsListSync, executeAudiencesListSync, executeCampaignsListSync } from "../src/sync";
import contactsList from "../fixtures/contacts_list.json";
import audiencesList from "../fixtures/audiences_list.json";
import campaignsList from "../fixtures/campaigns_list.json";

describe("contacts.list sync", () => {
  it("returns normalized contacts with total", () => {
    const result = executeContactsListSync({ response: contactsList });
    expect(result.provider).toBe("mailchimp");
    expect(result.operation).toBe("contacts.list");
    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.items[0].id).toBe("mc-contact:a1b2c3d4e5");
    expect(result.items[0].email).toBe("jane@example.com");
    expect(result.items[1].id).toBe("mc-contact:f6g7h8i9j0");
  });
});

describe("audiences.list sync", () => {
  it("returns normalized audiences", () => {
    const result = executeAudiencesListSync({ response: audiencesList });
    expect(result.provider).toBe("mailchimp");
    expect(result.operation).toBe("audiences.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("mc-audience:list001");
    expect(result.items[0].name).toBe("Main Newsletter");
    expect(result.items[0].memberCount).toBe(15420);
    expect(result.items[1].id).toBe("mc-audience:list002");
    expect(result.items[1].memberCount).toBe(830);
  });
});

describe("campaigns.list sync", () => {
  it("returns normalized campaigns", () => {
    const result = executeCampaignsListSync({ response: campaignsList });
    expect(result.provider).toBe("mailchimp");
    expect(result.operation).toBe("campaigns.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("mc-campaign:camp001");
    expect(result.items[0].title).toBe("Summer Sale Announcement");
    expect(result.items[0].sentCount).toBe(15420);
    expect(result.items[0].openRate).toBe(0.342);
    expect(result.items[1].id).toBe("mc-campaign:camp002");
    expect(result.items[1].status).toBe("save");
  });
});
