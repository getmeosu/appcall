import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import ticketsSearchFixture from "../fixtures/tickets_search.json";
import solutionArticleFixture from "../fixtures/solution_article.json";
import timeEntryFixture from "../fixtures/time_entry.json";
import discussionTopicFixture from "../fixtures/discussion_topic.json";
import ticketWatchersFixture from "../fixtures/ticket_watchers.json";
import ticketAccessFixture from "../fixtures/ticket_access.json";
import jobFixture from "../fixtures/job.json";
import solutionCategoryFixture from "../fixtures/solution_category.json";
import cannedResponseFixture from "../fixtures/canned_response.json";
import adminGroupFixture from "../fixtures/admin_group.json";
import emailMailboxFixture from "../fixtures/email_mailbox.json";
import slaPolicyFixture from "../fixtures/sla_policy.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const credential = { domainAlias: "acme", apiKey: "key/+secret", basicAuth: "a2V5LytzZWNyZXQ6WA==" };
const response = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });
const empty = (status: number, headers: Record<string, string> = {}) => new Response(null, { status, headers });

describe("freshdesk declarative actions", () => {
  it("registers the added Freshdesk API operations as executable requests", () => {
    const expected = [
      "tickets.search", "tickets.delete", "tickets.satisfactionRatings.list", "tickets.timeEntries.list", "tickets.timeEntries.create",
      "tickets.forms.list", "tickets.fields.list", "contacts.search", "contacts.delete", "contacts.fields.list",
      "companies.search", "companies.update", "companies.delete", "companies.fields.list", "agents.search", "agents.create",
      "agents.update", "agents.delete", "agents.availability.get", "agents.availability.update", "groups.get", "groups.create",
      "groups.update", "groups.delete", "groups.agents.list", "solutions.categories.list", "solutions.categories.create",
      "solutions.categories.update", "solutions.categories.delete", "solutions.folders.list", "solutions.folders.get",
      "solutions.folders.create", "solutions.folders.update", "solutions.folders.delete", "solutions.articles.list",
      "solutions.articles.get", "solutions.articles.create", "solutions.articles.update", "solutions.articles.delete",
      "solutions.articles.search", "timeEntries.list", "timeEntries.update", "timeEntries.delete",
      "timeEntries.timer.toggle", "satisfactionRatings.list",
      "discussions.categories.list", "discussions.categories.get", "discussions.categories.create",
      "discussions.categories.update", "discussions.categories.delete", "discussions.forums.list",
      "discussions.forums.get", "discussions.forums.create", "discussions.forums.update",
      "discussions.forums.delete", "discussions.forums.follow", "discussions.forums.unfollow",
      "discussions.topics.list", "discussions.topics.get", "discussions.topics.create",
      "discussions.topics.update", "discussions.topics.delete", "discussions.topics.follow",
      "discussions.topics.unfollow", "discussions.topics.monitored.list",
      "discussions.topics.participated.list", "discussions.comments.list", "discussions.comments.create",
      "discussions.comments.update", "discussions.comments.delete", "tickets.outboundEmail.create",
      "tickets.restore", "tickets.forward", "tickets.replyToForward", "tickets.merge",
      "tickets.associated.list", "tickets.bulkUpdate", "tickets.bulkDelete", "tickets.watchers.list",
      "tickets.watchers.add", "tickets.watchers.remove", "tickets.watchers.bulkAdd",
      "tickets.watchers.bulkRemove", "tickets.access.get", "tickets.access.add",
      "tickets.access.update", "tickets.access.remove", "tickets.summary.get",
      "tickets.summary.update", "tickets.summary.delete", "tickets.forms.get", "tickets.forms.create",
      "tickets.forms.update", "tickets.forms.delete", "tickets.forms.fields.get", "tickets.fields.get",
      "tickets.fields.create", "tickets.fields.update", "tickets.fields.delete",
      "tickets.fields.sections.list", "tickets.fields.sections.create", "tickets.fields.sections.get",
      "tickets.fields.sections.update", "tickets.fields.sections.delete", "conversations.update",
      "conversations.delete", "contacts.autocomplete", "contacts.hardDelete", "contacts.makeAgent",
      "contacts.restore", "contacts.sendInvite", "contacts.merge", "contacts.export.create",
      "contacts.export.get", "contacts.imports.list", "contacts.imports.get", "contacts.imports.cancel",
      "contacts.fields.get", "contacts.fields.create", "contacts.fields.update", "contacts.fields.delete",
      "companies.autocomplete", "companies.export.create", "companies.export.get", "companies.fields.get",
      "companies.fields.create", "companies.fields.update", "companies.fields.delete",
      "solutions.categories.get", "solutions.categories.translated.list",
      "solutions.categories.translated.get", "solutions.categories.translated.create",
      "solutions.folders.translated.list", "solutions.folders.translated.get",
      "solutions.folders.subfolders.list", "solutions.folders.subfolders.translated.list",
      "solutions.articles.translated.list", "solutions.articles.translated.get", "jobs.get",
      "admin.groups.create", "admin.groups.createSupport", "admin.groups.list", "admin.groups.update",
      "admin.groups.delete", "admin.groups.agents.patch", "agents.bulkCreate",
      "cannedResponses.create", "cannedResponses.bulkCreate", "cannedResponses.get", "cannedResponses.update",
      "cannedResponseFolders.create", "cannedResponseFolders.update", "cannedResponseFolders.list",
      "cannedResponseFolders.responses.list", "email.mailboxes.create", "email.mailboxes.get",
      "email.mailboxes.list", "email.mailboxes.delete", "email.settings.update", "email.settings.get",
      "email.configs.list", "email.configs.get", "notifications.bcc.update", "notifications.bcc.get",
      "slaPolicies.create", "slaPolicies.list", "slaPolicies.update",
      "automations.rules.list", "automations.rules.get", "automations.rules.update", "automations.rules.delete",
      "scenarioAutomations.list", "skills.list", "skills.get", "skills.delete", "roles.list", "roles.get",
      "products.list", "products.get", "businessHours.list", "businessHours.get", "surveys.list",
      "settings.helpdesk.get", "contacts.imports.create",
    ];
    for (const operation of expected) {
      expect(actions[operation], `${operation} should compile into an HTTP handler`).toBeTypeOf("function");
    }
    expect(Object.keys(actions).length).toBeGreaterThanOrEqual(204);
  });

  it("searches tickets and deletes records using Freshdesk v2 routes", async () => {
    await actions["tickets.search"]!({
      ...credential,
      query: '"status:2 AND priority:1"',
      page: 2,
      fetch: async (url: string) => {
        const parsed = new URL(url);
        expect(parsed.pathname).toBe("/api/v2/search/tickets");
        expect(parsed.searchParams.get("query")).toBe('"status:2 AND priority:1"');
        expect(parsed.searchParams.get("page")).toBe("2");
        return response(ticketsSearchFixture);
      },
    });
    await actions["contacts.delete"]!({
      ...credential,
      contactId: 7,
      fetch: async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/contacts/7");
        expect(init?.method).toBe("DELETE");
        return empty(204);
      },
    });
  });

  it("creates knowledge base articles with the documented folder route", async () => {
    await actions["solutions.articles.create"]!({
      ...credential,
      title: "Reset the router",
      description: "Steps to restore the office router.",
      folderId: 15,
      status: 2,
      fetch: async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/solutions/folders/15/articles");
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({ title: "Reset the router", description: "Steps to restore the office router.", status: 2 });
        return response(solutionArticleFixture, 201);
      },
    });
  });

  it("toggles a time entry timer using the documented route", async () => {
    await actions["timeEntries.timer.toggle"]!({
      ...credential,
      timeEntryId: 18,
      fetch: async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/time_entries/18/toggle_timer");
        expect(init?.method).toBe("PUT");
        return response(timeEntryFixture);
      },
    });
  });

  it("executes every read operation with the documented Basic header", async () => {
    const cases = [
      ["healthcheck", {}, "/account"],
      ["account.get", {}, "/account"],
      ["tickets.list", { page: 2, perPage: 10 }, "/tickets?page=2&per_page=10"],
      ["tickets.get", { ticketId: 42 }, "/tickets/42"],
      ["tickets.conversations.list", { ticketId: 42 }, "/tickets/42/conversations"],
      ["contacts.list", { page: 1, perPage: 20, email: "ada@example.com" }, "/contacts?page=1&per_page=20&email=ada%40example.com"],
      ["contacts.get", { contactId: 7 }, "/contacts/7"],
      ["companies.list", { page: 2 }, "/companies?page=2"],
      ["companies.get", { companyId: 9 }, "/companies/9"],
      ["agents.me", {}, "/agents/me"],
      ["agents.list", { email: "agent@example.com" }, "/agents?email=agent%40example.com"],
      ["agents.get", { agentId: 3 }, "/agents/3"],
      ["groups.list", { page: 1 }, "/groups?page=1"],
      ["solutions.articles.search", { term: "router" }, "/search/solutions?term=router"],
    ] as const;
    for (const [op, input, suffix] of cases) {
      const result = await actions[op]!({
        ...credential,
        ...input,
        fetch: async (url: string, init?: RequestInit) => {
          expect(url).toContain(suffix);
          expect(new Headers(init?.headers).get("authorization")).toBe("Basic a2V5LytzZWNyZXQ6WA==");
          expect(init?.method ?? "GET").toBe("GET");
          return response(op.includes("list") || op.includes("search") ? [] : { id: 1 });
        },
      });
      expect(result).toBeDefined();
    }
  });

  it("creates and updates tickets with snake_case JSON bodies", async () => {
    let createInit: RequestInit | undefined;
    const created = await actions["tickets.create"]!({
      ...credential,
      subject: "Printer jam",
      description: "Third floor copier is stuck.",
      email: "ada@example.com",
      status: 2,
      priority: 1,
      groupId: 4,
      tags: ["hardware"],
      fetch: async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/tickets");
        createInit = init;
        return response({ id: 42, subject: "Printer jam" }, 201);
      },
    });
    expect(createInit?.method).toBe("POST");
    expect(new Headers(createInit?.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(createInit?.body))).toEqual({
      subject: "Printer jam",
      description: "Third floor copier is stuck.",
      email: "ada@example.com",
      status: 2,
      priority: 1,
      group_id: 4,
      tags: ["hardware"],
    });
    expect(created).toMatchObject({ ticket: { id: 42 } });

    let updateInit: RequestInit | undefined;
    const updated = await actions["tickets.update"]!({
      ...credential,
      ticketId: 42,
      status: 4,
      priority: 3,
      fetch: async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/tickets/42");
        updateInit = init;
        return response({ id: 42, status: 4 });
      },
    });
    expect(updateInit?.method).toBe("PUT");
    expect(JSON.parse(String(updateInit?.body))).toEqual({ status: 4, priority: 3 });
    expect(updated).toMatchObject({ ticket: { id: 42, status: 4 } });
  });

  it("creates contacts, companies, replies, and notes", async () => {
    const createdContact = await actions["contacts.create"]!({
      ...credential,
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "555-0100",
      companyId: 9,
      fetch: async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/contacts");
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({
          name: "Ada Lovelace",
          email: "ada@example.com",
          phone: "555-0100",
          company_id: 9,
        });
        return response({ id: 7, name: "Ada Lovelace" }, 201);
      },
    });
    expect(createdContact).toMatchObject({ contact: { id: 7 } });

    const updatedContact = await actions["contacts.update"]!({
      ...credential,
      contactId: 7,
      jobTitle: "Mathematician",
      fetch: async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/contacts/7");
        expect(init?.method).toBe("PUT");
        expect(JSON.parse(String(init?.body))).toEqual({ job_title: "Mathematician" });
        return response({ id: 7, job_title: "Mathematician" });
      },
    });
    expect(updatedContact).toMatchObject({ contact: { id: 7 } });

    const createdCompany = await actions["companies.create"]!({
      ...credential,
      name: "Analytical Engines",
      domains: ["example.com"],
      fetch: async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/companies");
        expect(JSON.parse(String(init?.body))).toEqual({ name: "Analytical Engines", domains: ["example.com"] });
        return response({ id: 9, name: "Analytical Engines" }, 201);
      },
    });
    expect(createdCompany).toMatchObject({ company: { id: 9 } });

    const reply = await actions["conversations.create"]!({
      ...credential,
      ticketId: 42,
      body: "<p>Replaced the roller.</p>",
      userId: 3,
      fetch: async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/tickets/42/reply");
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({ body: "<p>Replaced the roller.</p>", user_id: 3 });
        return response({ id: 88, body_text: "Replaced the roller." }, 201);
      },
    });
    expect(reply).toMatchObject({ conversation: { id: 88 } });

    const note = await actions["conversations.notes.create"]!({
      ...credential,
      ticketId: 42,
      body: "<p>Internal follow-up</p>",
      private: true,
      fetch: async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/tickets/42/notes");
        expect(JSON.parse(String(init?.body))).toEqual({ body: "<p>Internal follow-up</p>", private: true });
        return response({ id: 89, private: true }, 201);
      },
    });
    expect(note).toMatchObject({ conversation: { id: 89 } });
  });

  it("rejects missing IDs and hostile tenant aliases before fetch", async () => {
    let called = false;
    await expect(actions["tickets.get"]!({ ...credential, fetch: async () => { called = true; return response({}); } })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["tickets.update"]!({ ...credential, status: 2, fetch: async () => { called = true; return response({}); } })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["contacts.get"]!({ ...credential, fetch: async () => { called = true; return response({}); } })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["tickets.create"]!({ ...credential, description: "no subject", email: "ada@example.com", fetch: async () => { called = true; return response({}); } })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["conversations.create"]!({ ...credential, ticketId: 42, fetch: async () => { called = true; return empty(201); } })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(called).toBe(false);
  });

  it("redacts raw and encoded secrets and exposes retry metadata", async () => {
    await expect(actions.healthcheck!({ ...credential, fetch: async () => response({ description: `bad ${credential.apiKey} ${encodeURIComponent(credential.apiKey)}` }, 401) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: expect.not.stringContaining(credential.apiKey) });
    await expect(actions.healthcheck!({ ...credential, fetch: async () => response({ message: "slow" }, 429, { "retry-after": "17" }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 17 });
  });

  it("creates discussion topics and follows forums on the documented routes", async () => {
    const created = await actions["discussions.topics.create"]!({
      ...credential,
      forumId: 12,
      title: "Printer drivers",
      message: "Which driver should we ship?",
      sticky: true,
      fetch: async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/discussions/forums/12/topics");
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({
          title: "Printer drivers",
          message: "Which driver should we ship?",
          sticky: true,
        });
        return response(discussionTopicFixture, 201);
      },
    });
    expect(created).toMatchObject({ topic: { id: 81, forum_id: 12 } });

    await actions["discussions.forums.follow"]!({
      ...credential,
      forumId: 12,
      userId: 3,
      fetch: async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/discussions/forums/12/follow");
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({ user_id: 3 });
        return empty(204);
      },
    });

    await actions["discussions.topics.unfollow"]!({
      ...credential,
      topicId: 81,
      userId: 3,
      fetch: async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/discussions/topics/81/follow?user_id=3");
        expect(init?.method).toBe("DELETE");
        return empty(204);
      },
    });
  });

  it("watches tickets, bulk-updates them, and patches user access", async () => {
    await actions["tickets.watchers.list"]!({
      ...credential,
      ticketId: 42,
      fetch: async (url: string) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/tickets/42/watchers");
        return response(ticketWatchersFixture);
      },
    });
    await actions["tickets.watchers.add"]!({
      ...credential,
      ticketId: 42,
      userId: 3,
      fetch: async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/tickets/42/watch");
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({ user_id: 3 });
        return empty(204);
      },
    });
    const job = await actions["tickets.bulkUpdate"]!({
      ...credential,
      ids: [42, 43],
      properties: { status: 4, priority: 3 },
      fetch: async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/tickets/bulk_update");
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({
          bulk_action: { ids: [42, 43], properties: { status: 4, priority: 3 } },
        });
        return response(jobFixture);
      },
    });
    expect(job).toMatchObject({ job: { job_id: jobFixture.job_id } });
    await actions["tickets.access.update"]!({
      ...credential,
      ticketId: 42,
      userIds: [{ id: 2, deleted: true }, { id: 3 }],
      fetch: async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/tickets/42/accesses");
        expect(init?.method).toBe("PATCH");
        expect(JSON.parse(String(init?.body))).toEqual({ user_ids: [{ id: 2, deleted: true }, { id: 3 }] });
        return response(ticketAccessFixture);
      },
    });
    await actions["tickets.outboundEmail.create"]!({
      ...credential,
      subject: "Follow-up",
      description: "Checking in.",
      email: "ada@example.com",
      emailConfigId: 9,
      fetch: async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/tickets/outbound_email");
        expect(JSON.parse(String(init?.body))).toEqual({
          subject: "Follow-up",
          description: "Checking in.",
          email: "ada@example.com",
          email_config_id: 9,
        });
        return response({ id: 99, subject: "Follow-up" }, 201);
      },
    });
  });

  it("hard-deletes contacts, autocompletes companies, and reads translated solutions", async () => {
    await actions["contacts.hardDelete"]!({
      ...credential,
      contactId: 7,
      force: true,
      fetch: async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/contacts/7/hard_delete?force=true");
        expect(init?.method).toBe("DELETE");
        return empty(204);
      },
    });
    await actions["contacts.makeAgent"]!({
      ...credential,
      contactId: 7,
      ticketScope: 1,
      fetch: async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/contacts/7/make_agent");
        expect(init?.method).toBe("PUT");
        expect(JSON.parse(String(init?.body))).toEqual({ ticket_scope: 1 });
        return response({ id: 3, contact: { id: 7 } });
      },
    });
    await actions["companies.autocomplete"]!({
      ...credential,
      name: "Acme",
      fetch: async (url: string) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/companies/autocomplete?name=Acme");
        return response([{ id: 9, name: "Acme" }]);
      },
    });
    await actions["solutions.categories.translated.create"]!({
      ...credential,
      categoryId: 5,
      languageCode: "es",
      name: "Hardware",
      fetch: async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/solutions/categories/5/es");
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({ name: "Hardware" });
        return response(solutionCategoryFixture, 201);
      },
    });
    await actions["solutions.folders.subfolders.list"]!({
      ...credential,
      folderId: 15,
      page: 1,
      fetch: async (url: string) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/solutions/folders/15/subfolders?page=1");
        return response([]);
      },
    });
    await actions["jobs.get"]!({
      ...credential,
      jobId: jobFixture.job_id,
      fetch: async (url: string) => {
        expect(url).toBe(`https://acme.freshdesk.com/api/v2/jobs/${jobFixture.job_id}`);
        return response({ id: jobFixture.job_id, status: "IN PROGRESS" });
      },
    });
  });

  it("covers remaining admin, canned response, email, SLA, and automation routes", async () => {
    const createdGroup = await actions["admin.groups.create"]!({
      ...credential,
      name: "Entertainment",
      description: "Singers and dancers",
      type: "support_agent_group",
      agentIds: [14],
      unassignedFor: "30m",
      businessHourId: 1,
      fetch: async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/admin/groups");
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({
          name: "Entertainment",
          description: "Singers and dancers",
          type: "support_agent_group",
          agent_ids: [14],
          unassigned_for: "30m",
          business_calendar_id: 1,
        });
        return response(adminGroupFixture, 201);
      },
    });
    expect(createdGroup).toMatchObject({ group: { id: 7651, type: "support_agent_group" } });

    await actions["admin.groups.agents.patch"]!({
      ...credential,
      groupId: 7651,
      agents: [{ id: 14 }, { id: 9, deleted: true }],
      fetch: async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/admin/groups/7651/agents");
        expect(init?.method).toBe("PUT");
        expect(JSON.parse(String(init?.body))).toEqual({ agents: [{ id: 14 }, { id: 9, deleted: true }] });
        return empty(204);
      },
    });

    const canned = await actions["cannedResponses.create"]!({
      ...credential,
      title: "We’ve received your request",
      contentHtml: "<div>Thank you for reaching out.</div>",
      folderId: 4,
      visibility: 1,
      fetch: async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/canned_responses");
        expect(JSON.parse(String(init?.body))).toEqual({
          title: "We’ve received your request",
          content_html: "<div>Thank you for reaching out.</div>",
          folder_id: 4,
          visibility: 1,
        });
        return response(cannedResponseFixture, 201);
      },
    });
    expect(canned).toMatchObject({ cannedResponse: { id: 35000093982 } });

    await actions["cannedResponseFolders.responses.list"]!({
      ...credential,
      folderId: 4,
      fetch: async (url: string) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/canned_response_folders/4/responses");
        return response([cannedResponseFixture]);
      },
    });

    const mailbox = await actions["email.mailboxes.create"]!({
      ...credential,
      name: "Support inbox",
      supportEmail: "support@acme.freshdesk.com",
      mailboxType: "freshdesk_mailbox",
      groupId: 4,
      productId: 1,
      defaultReplyEmail: true,
      fetch: async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/email/mailboxes");
        expect(JSON.parse(String(init?.body))).toEqual({
          name: "Support inbox",
          support_email: "support@acme.freshdesk.com",
          mailbox_type: "freshdesk_mailbox",
          group_id: 4,
          product_id: 1,
          default_reply_email: true,
        });
        return response(emailMailboxFixture, 201);
      },
    });
    expect(mailbox).toMatchObject({ mailbox: { id: 25 } });

    await actions["notifications.bcc.update"]!({
      ...credential,
      emails: ["ops@example.com"],
      fetch: async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/notifications/email/bcc");
        expect(init?.method).toBe("PUT");
        expect(JSON.parse(String(init?.body))).toEqual({ emails: ["ops@example.com"] });
        return response({ emails: ["ops@example.com"] });
      },
    });

    const sla = await actions["slaPolicies.create"]!({
      ...credential,
      name: "Service Agent SLA Policy",
      slaTarget: slaPolicyFixture.sla_target,
      applicableTo: { group_ids: [4] },
      fetch: async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/sla_policies");
        expect(JSON.parse(String(init?.body))).toEqual({
          name: "Service Agent SLA Policy",
          sla_target: slaPolicyFixture.sla_target,
          applicable_to: { group_ids: [4] },
        });
        return response(slaPolicyFixture, 201);
      },
    });
    expect(sla).toMatchObject({ policy: { id: 12 } });

    await actions["automations.rules.list"]!({
      ...credential,
      automationTypeId: 1,
      fetch: async (url: string) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/automations/1/rules");
        return response([]);
      },
    });
    await actions["skills.get"]!({
      ...credential,
      skillId: 8,
      fetch: async (url: string) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/admin/skills/8");
        return response({ id: 8, name: "Billing" });
      },
    });
    await actions["roles.list"]!({
      ...credential,
      page: 1,
      fetch: async (url: string) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/roles?page=1");
        return response([{ id: 1, name: "Agent" }]);
      },
    });
    await actions["products.get"]!({
      ...credential,
      productId: 2,
      fetch: async (url: string) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/products/2");
        return response({ id: 2, name: "Inbox" });
      },
    });
    await actions["businessHours.list"]!({
      ...credential,
      fetch: async (url: string) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/business_hours");
        return response([{ id: 1, name: "Default" }]);
      },
    });
    await actions["surveys.list"]!({
      ...credential,
      state: "active",
      fetch: async (url: string) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/surveys?state=active");
        return response([]);
      },
    });
    await actions["settings.helpdesk.get"]!({
      ...credential,
      fetch: async (url: string) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/settings/helpdesk");
        return response({ primary_language: "en" });
      },
    });
    await actions["scenarioAutomations.list"]!({
      ...credential,
      fetch: async (url: string) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/scenario_automations");
        return response([]);
      },
    });
    const imported = await actions["contacts.imports.create"]!({
      ...credential,
      rawContent: "name,email,company\nAda,ada@example.com,Analytical Engines",
      nameColumnIndex: 0,
      emailColumnIndex: 1,
      companyNameColumnIndex: 2,
      fetch: async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://acme.freshdesk.com/api/v2/contacts/imports");
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({
          fields: { name: 0, email: 1, company_name: 2 },
          file: "name,email,company\nAda,ada@example.com,Analytical Engines",
        });
        return response({ id: 423678, status: "in_progress" }, 201);
      },
    });
    expect(imported).toMatchObject({ import: { id: 423678 } });
  });
});
