import { describe, expect, it } from "bun:test";
import {
  normalizeAdministrator,
  parseAdminsResponse,
  normalizeContact,
  parseContactsResponse,
  normalizeCompany,
  parseCompaniesResponse,
  normalizeConversation,
  parseConversationsResponse,
  parseConversationGetResponse,
  parseConversationReplyResponse,
} from "../src/objects";
import adminsFixture from "../fixtures/admins_list.json";
import contactsFixture from "../fixtures/contacts_list.json";
import companiesFixture from "../fixtures/companies_list.json";
import conversationsFixture from "../fixtures/conversations_list.json";
import conversationGetFixture from "../fixtures/conversation_get.json";
import conversationReplyFixture from "../fixtures/conversation_reply.json";

describe("Intercom normalizeAdministrator", () => {
  it("prefixes id and sets provider", () => {
    const admin = normalizeAdministrator({
      id: "991",
      name: "Support Lead",
      email: "lead@example.com",
      job_title: "Support Manager",
      away_mode_enabled: false,
      has_inbox_seat: true,
      team_ids: ["5017691"],
    });
    expect(admin.id).toBe("intercom-admin:991");
    expect(admin.provider).toBe("intercom");
    expect(admin.name).toBe("Support Lead");
    expect(admin.email).toBe("lead@example.com");
    expect(admin.jobTitle).toBe("Support Manager");
    expect(admin.awayModeEnabled).toBe(false);
    expect(admin.hasInboxSeat).toBe(true);
    expect(admin.teamIds).toEqual(["5017691"]);
  });

  it("defaults name to empty string", () => {
    expect(normalizeAdministrator({ id: "1" }).name).toBe("");
  });
});

describe("Intercom parseAdminsResponse", () => {
  it("parses fixture admins", () => {
    const parsed = parseAdminsResponse(adminsFixture);
    expect(parsed.admins).toHaveLength(2);
    expect(parsed.admins[0].id).toBe("intercom-admin:991");
    expect(parsed.admins[1].awayModeEnabled).toBe(true);
  });

  it("handles missing admins array", () => {
    expect(parseAdminsResponse({}).admins).toEqual([]);
  });
});

describe("Intercom normalizeContact", () => {
  it("normalizes contact fields and unix timestamps", () => {
    const contact = normalizeContact({
      id: "contact-1",
      role: "user",
      email: "ada@example.com",
      name: "Ada Lovelace",
      phone: "+44-20-555-0100",
      external_id: "ext-ada",
      created_at: 1663597000,
      updated_at: 1663597100,
    });
    expect(contact.id).toBe("intercom-contact:contact-1");
    expect(contact.provider).toBe("intercom");
    expect(contact.email).toBe("ada@example.com");
    expect(contact.createdAt).toBe(new Date(1663597000 * 1000).toISOString());
    expect(contact.updatedAt).toBe(new Date(1663597100 * 1000).toISOString());
  });
});

describe("Intercom parseContactsResponse", () => {
  it("parses fixture contacts with pagination cursor", () => {
    const parsed = parseContactsResponse(contactsFixture);
    expect(parsed.contacts).toHaveLength(2);
    expect(parsed.contacts[0].id).toBe("intercom-contact:contact-1");
    expect(parsed.total).toBe(2);
    expect(parsed.nextStartingAfter).toBe("contact-cursor-2");
  });
});

describe("Intercom normalizeCompany", () => {
  it("extracts plan name from plan object", () => {
    const company = normalizeCompany({
      id: "co-1",
      name: "Analytical Engines Ltd",
      company_id: "ae-001",
      plan: { type: "plan", id: "pro", name: "Pro" },
      monthly_spend: 1200,
      size: 42,
      website: "https://analytical.example",
      industry: "Software",
      created_at: 1600000000,
      updated_at: 1660000000,
    });
    expect(company.id).toBe("intercom-company:co-1");
    expect(company.provider).toBe("intercom");
    expect(company.plan).toBe("Pro");
    expect(company.monthlySpend).toBe(1200);
    expect(company.companyId).toBe("ae-001");
  });
});

describe("Intercom parseCompaniesResponse", () => {
  it("parses fixture companies", () => {
    const parsed = parseCompaniesResponse(companiesFixture);
    expect(parsed.companies).toHaveLength(1);
    expect(parsed.companies[0].id).toBe("intercom-company:co-1");
    expect(parsed.total).toBe(1);
    expect(parsed.nextStartingAfter).toBeNull();
  });
});

describe("Intercom normalizeConversation", () => {
  it("normalizes list item fields", () => {
    const conversation = normalizeConversation({
      id: "147",
      title: "Billing question",
      created_at: 1663597223,
      updated_at: 1663597260,
      waiting_since: 1663597260,
      open: true,
      state: "open",
      read: true,
      priority: "not_priority",
      admin_assignee_id: 991,
      team_assignee_id: 5017691,
      source: { type: "conversation", body: "<p>Hi</p>", subject: "" },
      contacts: { type: "contact.list", contacts: [{ type: "contact", id: "contact-1" }] },
    });
    expect(conversation.id).toBe("intercom-conversation:147");
    expect(conversation.provider).toBe("intercom");
    expect(conversation.title).toBe("Billing question");
    expect(conversation.state).toBe("open");
    expect(conversation.open).toBe(true);
    expect(conversation.adminAssigneeId).toBe("991");
    expect(conversation.teamAssigneeId).toBe("5017691");
    expect(conversation.contactIds).toEqual(["contact-1"]);
    expect(conversation.sourceType).toBe("conversation");
    expect(conversation.createdAt).toBe(new Date(1663597223 * 1000).toISOString());
  });

  it("captures conversation_parts total_count on get", () => {
    const conversation = normalizeConversation({
      id: "147",
      conversation_parts: {
        type: "conversation_part.list",
        total_count: 2,
        conversation_parts: [{}, {}],
      },
    });
    expect(conversation.partCount).toBe(2);
  });
});

describe("Intercom parseConversationsResponse", () => {
  it("parses fixture list with cursor", () => {
    const parsed = parseConversationsResponse(conversationsFixture);
    expect(parsed.conversations).toHaveLength(2);
    expect(parsed.conversations[0].id).toBe("intercom-conversation:147");
    expect(parsed.conversations[1].state).toBe("closed");
    expect(parsed.total).toBe(2);
    expect(parsed.nextStartingAfter).toBe("conv-cursor-next");
  });

  it("handles missing conversations array", () => {
    expect(parseConversationsResponse({}).conversations).toEqual([]);
  });
});

describe("Intercom parseConversationGetResponse", () => {
  it("parses get fixture", () => {
    const parsed = parseConversationGetResponse(conversationGetFixture);
    expect(parsed.conversation?.id).toBe("intercom-conversation:147");
    expect(parsed.conversation?.partCount).toBe(2);
    expect(parsed.conversation?.contactIds).toEqual(["contact-1"]);
  });

  it("returns null for invalid payloads", () => {
    expect(parseConversationGetResponse(null).conversation).toBeNull();
    expect(parseConversationGetResponse([]).conversation).toBeNull();
    expect(parseConversationGetResponse({}).conversation).toBeNull();
  });
});

describe("Intercom parseConversationReplyResponse", () => {
  it("parses reply fixture as conversation", () => {
    const parsed = parseConversationReplyResponse(conversationReplyFixture);
    expect(parsed.conversation?.id).toBe("intercom-conversation:147");
    expect(parsed.conversation?.partCount).toBe(2);
    expect(parsed.conversation?.waitingSince).toBeNull();
  });
});
