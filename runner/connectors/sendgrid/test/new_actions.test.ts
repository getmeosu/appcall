import { describe, expect, it } from "bun:test";
import {
  sendMail,
  upsertContacts,
  searchContacts,
  deleteContacts,
  createList,
  getList,
  deleteList,
  createTemplate,
  getTemplate,
  listBounces,
  getContact,
  listLists,
  listListContacts,
  addListContacts,
  removeListContacts,
  listTemplates,
  updateTemplate,
  deleteTemplate,
  getGlobalStats,
  listBlocks,
  listSpamReports,
  listUnsubscribes,
  listInvalidEmails,
  listApiKeys,
  listAlerts,
} from "../src/actions";
import contactsSearchFixture from "../fixtures/contacts_search.json";
import contactsUpsertFixture from "../fixtures/contacts_upsert.json";
import contactsDeleteFixture from "../fixtures/contacts_delete.json";
import listCreateFixture from "../fixtures/list_create.json";
import listGetFixture from "../fixtures/list_get.json";
import templateCreateFixture from "../fixtures/template_create.json";
import templateGetFixture from "../fixtures/template_get.json";
import bouncesListFixture from "../fixtures/bounces_list.json";
import contactsGetFixture from "../fixtures/contacts_get.json";
import listsListActionFixture from "../fixtures/lists_list_action.json";
import listsContactsListFixture from "../fixtures/lists_contacts_list.json";
import listsContactsAddFixture from "../fixtures/lists_contacts_add.json";
import listsContactsRemoveFixture from "../fixtures/lists_contacts_remove.json";
import templatesListFixture from "../fixtures/templates_list.json";
import templateUpdateFixture from "../fixtures/template_update.json";
import statsGlobalFixture from "../fixtures/stats_global.json";
import blocksListFixture from "../fixtures/blocks_list.json";
import spamReportsListFixture from "../fixtures/spam_reports_list.json";
import unsubscribesListFixture from "../fixtures/unsubscribes_list.json";
import invalidEmailsListFixture from "../fixtures/invalid_emails_list.json";
import apiKeysListFixture from "../fixtures/api_keys_list.json";
import alertsListFixture from "../fixtures/alerts_list.json";

// ─── mail.send ────────────────────────────────────────────────────────────────

describe("sendMail", () => {
  it("validates input without apiKey", () => {
    const result = sendMail({ to: [{ email: "a@b.com" }], from: { email: "from@b.com" }, subject: "Hello" }) as Record<string, unknown>;
    expect(result.connector).toBe("sendgrid");
    expect(result.action).toBe("mail.send");
    expect(result.source).toBe("connector");
    expect(result.validated).toBeDefined();
    const v = result.validated as Record<string, unknown>;
    expect((v.from as Record<string, unknown>).email).toBe("from@b.com");
    expect(v.subject).toBe("Hello");
  });

  it("throws when to is missing", () => {
    expect(() => sendMail({ from: { email: "x@x.com" }, subject: "Hi" })).toThrow("to must be a non-empty array");
  });

  it("throws when to is empty", () => {
    expect(() => sendMail({ to: [], from: { email: "x@x.com" }, subject: "Hi" })).toThrow("to must be a non-empty array");
  });

  it("throws when from is missing email", () => {
    expect(() => sendMail({ to: [{ email: "a@b.com" }], from: {}, subject: "Hi" })).toThrow("from.email is required");
  });

  it("throws when subject is missing", () => {
    expect(() => sendMail({ to: [{ email: "a@b.com" }], from: { email: "x@x.com" }, subject: "" })).toThrow("subject is required");
  });

  it("validates with optional fields", () => {
    const result = sendMail({
      to: [{ email: "a@b.com", name: "Alice" }],
      from: { email: "from@b.com", name: "Sender" },
      subject: "Hello",
      text: "Plain text",
      html: "<p>HTML</p>",
      replyTo: { email: "reply@b.com" },
      templateId: "d-abc123",
      dynamicTemplateData: { name: "Alice" },
    }) as Record<string, unknown>;
    const v = result.validated as Record<string, unknown>;
    expect(v.templateId).toBe("d-abc123");
    expect(v.text).toBe("Plain text");
  });

  it("sends email via mock fetch (202)", async () => {
    const requests: Request[] = [];
    const result = await sendMail({
      apiKey: "SG.test-key",
      to: [{ email: "dest@example.com" }],
      from: { email: "sender@example.com" },
      subject: "Test Email",
      text: "Hello",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("{}", { status: 202, headers: { "X-Message-Id": "msg-001", "Content-Type": "application/json" } });
      },
    }) as Record<string, unknown>;

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.sendgrid.com/v3/mail/send");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer SG.test-key");
    expect(result.connector).toBe("sendgrid");
    expect(result.action).toBe("mail.send");
    expect(result.source).toBe("connector");
    expect(result.messageId).toBe("msg-001");
  });

  it("throws rate limit error on 429", async () => {
    try {
      await sendMail({
        apiKey: "SG.test-key",
        to: [{ email: "a@b.com" }],
        from: { email: "f@b.com" },
        subject: "Hi",
        fetch: async () => new Response("", { status: 429, headers: { "retry-after": "20" } }),
      });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.code).toBe("CONNECTOR_RATE_LIMITED");
      expect(e.retryAfterSeconds).toBe(20);
    }
  });

  it("throws upstream error on 400", async () => {
    try {
      await sendMail({
        apiKey: "SG.test-key",
        to: [{ email: "a@b.com" }],
        from: { email: "f@b.com" },
        subject: "Hi",
        fetch: async () => new Response(JSON.stringify({ errors: [{ message: "bad" }] }), { status: 400 }),
      });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.code).toBe("CONNECTOR_UPSTREAM_ERROR");
    }
  });

  it("routes through the SMTP relay when SMTP credentials are present (injected fake socket)", async () => {
    const writes: string[] = [];
    const replies = [
      "220 ready",
      "250 AUTH LOGIN",
      "334 user",
      "334 pass",
      "235 ok",
      "250 mail ok",
      "250 rcpt ok",
      "354 data",
      "250 queued",
      "221 bye",
    ];
    let i = 0;
    const __connect = async () => ({
      write: (d: string) => void writes.push(d),
      read: async () => replies[i++],
      upgradeTls: async () => {},
      close: () => {},
    });

    const result = await sendMail({
      smtpHost: "smtp.example.com",
      smtpPort: "587",
  smtpSecure: true,
      smtpUser: "u",
      smtpPassword: "p",
      from: "f@b.com",
      to: "a@b.com",
      subject: "Hi",
      text: "Hello",
      __connect,
    }) as Record<string, unknown>;

    expect(result.connector).toBe("sendgrid");
    expect(result.action).toBe("mail.send");
    expect(result.source).toBe("smtp");
    expect(result.accepted).toEqual(["a@b.com"]);
    expect(writes.join("")).toContain("RCPT TO:<a@b.com>\r\n");
  });
});

// ─── contacts.upsert ─────────────────────────────────────────────────────────

describe("upsertContacts", () => {
  it("validates input without apiKey", () => {
    const result = upsertContacts({ contacts: [{ email: "a@b.com" }] }) as Record<string, unknown>;
    expect(result.connector).toBe("sendgrid");
    expect(result.action).toBe("contacts.upsert");
    expect(result.validated).toBeDefined();
  });

  it("throws when contacts is missing", () => {
    expect(() => upsertContacts({})).toThrow("contacts must be a non-empty array");
  });

  it("throws when contacts is empty array", () => {
    expect(() => upsertContacts({ contacts: [] })).toThrow("contacts must be a non-empty array");
  });

  it("throws when contact item is missing email", () => {
    expect(() => upsertContacts({ contacts: [{ firstName: "Bob" }] })).toThrow("contacts[0].email is required");
  });

  it("upserts contacts via mock fetch (202)", async () => {
    const requests: Request[] = [];
    const result = await upsertContacts({
      apiKey: "SG.test-key",
      contacts: [{ email: "new@example.com", firstName: "New" }],
      listIds: ["list-abc"],
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(contactsUpsertFixture), { status: 202, headers: { "Content-Type": "application/json" } });
      },
    }) as Record<string, unknown>;

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.sendgrid.com/v3/marketing/contacts");
    expect(requests[0].method).toBe("PUT");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer SG.test-key");
    expect(result.jobId).toBe("job-abc-001");
  });

  it("throws rate limit on 429", async () => {
    try {
      await upsertContacts({
        apiKey: "SG.test-key",
        contacts: [{ email: "a@b.com" }],
        fetch: async () => new Response("", { status: 429, headers: { "retry-after": "5" } }),
      });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.code).toBe("CONNECTOR_RATE_LIMITED");
    }
  });

  it("throws upstream error on 500", async () => {
    try {
      await upsertContacts({
        apiKey: "SG.test-key",
        contacts: [{ email: "a@b.com" }],
        fetch: async () => new Response("error", { status: 500 }),
      });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.code).toBe("CONNECTOR_UPSTREAM_ERROR");
    }
  });
});

// ─── contacts.search ─────────────────────────────────────────────────────────

describe("searchContacts", () => {
  it("validates input without apiKey", () => {
    const result = searchContacts({ query: "email LIKE '%@example.com'" }) as Record<string, unknown>;
    expect(result.connector).toBe("sendgrid");
    expect(result.action).toBe("contacts.search");
    const v = result.validated as Record<string, unknown>;
    expect(v.query).toBe("email LIKE '%@example.com'");
  });

  it("throws when query is missing", () => {
    expect(() => searchContacts({})).toThrow("query is required");
  });

  it("searches contacts via mock fetch (200)", async () => {
    const requests: Request[] = [];
    const result = await searchContacts({
      apiKey: "SG.test-key",
      query: "email LIKE '%@example.com'",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(contactsSearchFixture), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    }) as Record<string, unknown>;

    expect(requests[0].url).toBe("https://api.sendgrid.com/v3/marketing/contacts/search");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer SG.test-key");
    expect(Array.isArray(result.contacts)).toBe(true);
    const contacts = result.contacts as Record<string, unknown>[];
    expect(contacts[0].email).toBe("found@example.com");
    expect(contacts[0].id).toBe("sg-contact:c-search-001");
  });

  it("throws rate limit on 429", async () => {
    try {
      await searchContacts({
        apiKey: "SG.test-key",
        query: "test",
        fetch: async () => new Response("", { status: 429, headers: { "retry-after": "10" } }),
      });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.code).toBe("CONNECTOR_RATE_LIMITED");
    }
  });
});

// ─── contacts.delete ─────────────────────────────────────────────────────────

describe("deleteContacts", () => {
  it("validates input without apiKey", () => {
    const result = deleteContacts({ ids: ["c-001", "c-002"] }) as Record<string, unknown>;
    expect(result.connector).toBe("sendgrid");
    expect(result.action).toBe("contacts.delete");
    const v = result.validated as Record<string, unknown>;
    expect(v.ids).toEqual(["c-001", "c-002"]);
  });

  it("throws when ids is missing", () => {
    expect(() => deleteContacts({})).toThrow("ids must be a non-empty array");
  });

  it("throws when ids is empty", () => {
    expect(() => deleteContacts({ ids: [] })).toThrow("ids must be a non-empty array");
  });

  it("deletes contacts via mock fetch (202)", async () => {
    const requests: Request[] = [];
    const result = await deleteContacts({
      apiKey: "SG.test-key",
      ids: ["c-001"],
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(contactsDeleteFixture), { status: 202, headers: { "Content-Type": "application/json" } });
      },
    }) as Record<string, unknown>;

    expect(requests[0].url).toContain("/v3/marketing/contacts?ids=");
    expect(requests[0].url).toContain("c-001");
    expect(requests[0].method).toBe("DELETE");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer SG.test-key");
    expect(result.jobId).toBe("job-del-002");
  });

  it("throws upstream error on 500", async () => {
    try {
      await deleteContacts({
        apiKey: "SG.test-key",
        ids: ["c-001"],
        fetch: async () => new Response("err", { status: 500 }),
      });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.code).toBe("CONNECTOR_UPSTREAM_ERROR");
    }
  });
});

// ─── lists.create ─────────────────────────────────────────────────────────────

describe("createList", () => {
  it("validates input without apiKey", () => {
    const result = createList({ name: "VIP Customers" }) as Record<string, unknown>;
    expect(result.connector).toBe("sendgrid");
    expect(result.action).toBe("lists.create");
    const v = result.validated as Record<string, unknown>;
    expect(v.name).toBe("VIP Customers");
  });

  it("throws when name is missing", () => {
    expect(() => createList({})).toThrow("name is required");
  });

  it("creates list via mock fetch (200)", async () => {
    const requests: Request[] = [];
    const result = await createList({
      apiKey: "SG.test-key",
      name: "My New List",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(listCreateFixture), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    }) as Record<string, unknown>;

    expect(requests[0].url).toBe("https://api.sendgrid.com/v3/marketing/lists");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer SG.test-key");
    const list = result.list as Record<string, unknown>;
    expect(list.id).toBe("sg-list:list-001");
    expect(list.name).toBe("My New List");
    expect(list.contactCount).toBe(0);
  });

  it("throws rate limit on 429", async () => {
    try {
      await createList({
        apiKey: "SG.test-key",
        name: "Test",
        fetch: async () => new Response("", { status: 429, headers: { "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 30) } }),
      });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.code).toBe("CONNECTOR_RATE_LIMITED");
    }
  });

  it("throws upstream error on 500", async () => {
    try {
      await createList({
        apiKey: "SG.test-key",
        name: "Test",
        fetch: async () => new Response("error", { status: 500 }),
      });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.code).toBe("CONNECTOR_UPSTREAM_ERROR");
    }
  });
});

// ─── lists.get ────────────────────────────────────────────────────────────────

describe("getList", () => {
  it("validates input without apiKey", () => {
    const result = getList({ listId: "list-001" }) as Record<string, unknown>;
    expect(result.connector).toBe("sendgrid");
    expect(result.action).toBe("lists.get");
    const v = result.validated as Record<string, unknown>;
    expect(v.listId).toBe("list-001");
  });

  it("throws when listId is missing", () => {
    expect(() => getList({})).toThrow("listId is required");
  });

  it("gets list via mock fetch (200)", async () => {
    const requests: Request[] = [];
    const result = await getList({
      apiKey: "SG.test-key",
      listId: "list-001",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(listGetFixture), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    }) as Record<string, unknown>;

    expect(requests[0].url).toBe("https://api.sendgrid.com/v3/marketing/lists/list-001");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer SG.test-key");
    const list = result.list as Record<string, unknown>;
    expect(list.id).toBe("sg-list:list-001");
    expect(list.contactCount).toBe(42);
  });

  it("throws upstream error on 404", async () => {
    try {
      await getList({
        apiKey: "SG.test-key",
        listId: "missing",
        fetch: async () => new Response(JSON.stringify({ errors: [{ message: "Not found" }] }), { status: 404 }),
      });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.code).toBe("CONNECTOR_UPSTREAM_ERROR");
    }
  });
});

// ─── lists.delete ─────────────────────────────────────────────────────────────

describe("deleteList", () => {
  it("validates input without apiKey", () => {
    const result = deleteList({ listId: "list-001" }) as Record<string, unknown>;
    expect(result.connector).toBe("sendgrid");
    expect(result.action).toBe("lists.delete");
  });

  it("throws when listId is missing", () => {
    expect(() => deleteList({})).toThrow("listId is required");
  });

  it("deletes list via mock fetch (202)", async () => {
    const requests: Request[] = [];
    const result = await deleteList({
      apiKey: "SG.test-key",
      listId: "list-001",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify({ job_id: "del-job-001" }), { status: 202, headers: { "Content-Type": "application/json" } });
      },
    }) as Record<string, unknown>;

    expect(requests[0].url).toBe("https://api.sendgrid.com/v3/marketing/lists/list-001");
    expect(requests[0].method).toBe("DELETE");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer SG.test-key");
    expect(result.deleted).toBe(true);
  });

  it("appends delete_contacts=true when requested", async () => {
    const requests: Request[] = [];
    await deleteList({
      apiKey: "SG.test-key",
      listId: "list-001",
      deleteContacts: true,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
      },
    });
    expect(requests[0].url).toContain("delete_contacts=true");
  });

  it("throws upstream error on 404", async () => {
    try {
      await deleteList({
        apiKey: "SG.test-key",
        listId: "missing",
        fetch: async () => new Response("{}", { status: 404 }),
      });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.code).toBe("CONNECTOR_UPSTREAM_ERROR");
    }
  });
});

// ─── templates.create ─────────────────────────────────────────────────────────

describe("createTemplate", () => {
  it("validates input without apiKey", () => {
    const result = createTemplate({ name: "Welcome" }) as Record<string, unknown>;
    expect(result.connector).toBe("sendgrid");
    expect(result.action).toBe("templates.create");
    const v = result.validated as Record<string, unknown>;
    expect(v.name).toBe("Welcome");
    expect(v.generation).toBe("dynamic");
  });

  it("throws when name is missing", () => {
    expect(() => createTemplate({})).toThrow("name is required");
  });

  it("creates template via mock fetch (201)", async () => {
    const requests: Request[] = [];
    const result = await createTemplate({
      apiKey: "SG.test-key",
      name: "Welcome Email",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(templateCreateFixture), { status: 201, headers: { "Content-Type": "application/json" } });
      },
    }) as Record<string, unknown>;

    expect(requests[0].url).toBe("https://api.sendgrid.com/v3/templates");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer SG.test-key");
    const tmpl = result.template as Record<string, unknown>;
    expect(tmpl.id).toBe("sg-template:d-template-001");
    expect(tmpl.name).toBe("Welcome Email");
    expect(tmpl.generation).toBe("dynamic");
  });

  it("defaults generation to dynamic", async () => {
    const bodies: string[] = [];
    await createTemplate({
      apiKey: "SG.test-key",
      name: "Test",
      fetch: async (input, init) => {
        bodies.push(await new Request(input, init).text());
        return new Response(JSON.stringify(templateCreateFixture), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    });
    expect(JSON.parse(bodies[0]).generation).toBe("dynamic");
  });

  it("throws rate limit on 429", async () => {
    try {
      await createTemplate({
        apiKey: "SG.test-key",
        name: "Test",
        fetch: async () => new Response("", { status: 429, headers: { "retry-after": "15" } }),
      });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.code).toBe("CONNECTOR_RATE_LIMITED");
    }
  });
});

// ─── templates.get ────────────────────────────────────────────────────────────

describe("getTemplate", () => {
  it("validates input without apiKey", () => {
    const result = getTemplate({ templateId: "d-template-001" }) as Record<string, unknown>;
    expect(result.connector).toBe("sendgrid");
    expect(result.action).toBe("templates.get");
    const v = result.validated as Record<string, unknown>;
    expect(v.templateId).toBe("d-template-001");
  });

  it("throws when templateId is missing", () => {
    expect(() => getTemplate({})).toThrow("templateId is required");
  });

  it("gets template via mock fetch (200)", async () => {
    const requests: Request[] = [];
    const result = await getTemplate({
      apiKey: "SG.test-key",
      templateId: "d-template-001",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(templateGetFixture), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    }) as Record<string, unknown>;

    expect(requests[0].url).toBe("https://api.sendgrid.com/v3/templates/d-template-001");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer SG.test-key");
    const tmpl = result.template as Record<string, unknown>;
    expect(tmpl.id).toBe("sg-template:d-template-001");
    expect(Array.isArray(tmpl.versions)).toBe(true);
  });

  it("throws upstream error on 404", async () => {
    try {
      await getTemplate({
        apiKey: "SG.test-key",
        templateId: "missing",
        fetch: async () => new Response("{}", { status: 404 }),
      });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.code).toBe("CONNECTOR_UPSTREAM_ERROR");
    }
  });
});

// ─── suppression.bounces.list ─────────────────────────────────────────────────

describe("listBounces", () => {
  it("validates input without apiKey (all optional fields)", () => {
    const result = listBounces({}) as Record<string, unknown>;
    expect(result.connector).toBe("sendgrid");
    expect(result.action).toBe("suppression.bounces.list");
    expect(result.validated).toBeDefined();
  });

  it("validates with time range", () => {
    const result = listBounces({ startTime: 1700000000, endTime: 1700086400, limit: 50 }) as Record<string, unknown>;
    const v = result.validated as Record<string, unknown>;
    expect(v.startTime).toBe(1700000000);
    expect(v.limit).toBe(50);
  });

  it("lists bounces via mock fetch (200)", async () => {
    const requests: Request[] = [];
    const result = await listBounces({
      apiKey: "SG.test-key",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(bouncesListFixture), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    }) as Record<string, unknown>;

    expect(requests[0].url).toBe("https://api.sendgrid.com/v3/suppression/bounces");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer SG.test-key");
    const bounces = result.bounces as Record<string, unknown>[];
    expect(bounces).toHaveLength(2);
    expect(bounces[0].email).toBe("bounced@example.com");
    expect(bounces[0].status).toBe("5.1.1");
  });

  it("appends query params for time range", async () => {
    const requests: Request[] = [];
    await listBounces({
      apiKey: "SG.test-key",
      startTime: 1700000000,
      endTime: 1700086400,
      limit: 10,
      offset: 20,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
      },
    });
    const url = requests[0].url;
    expect(url).toContain("start_time=1700000000");
    expect(url).toContain("end_time=1700086400");
    expect(url).toContain("limit=10");
    expect(url).toContain("offset=20");
  });

  it("throws rate limit on 429", async () => {
    try {
      await listBounces({
        apiKey: "SG.test-key",
        fetch: async () => new Response("", { status: 429, headers: { "retry-after": "60" } }),
      });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.code).toBe("CONNECTOR_RATE_LIMITED");
      expect(e.retryAfterSeconds).toBe(60);
    }
  });

  it("throws upstream error on 500", async () => {
    try {
      await listBounces({
        apiKey: "SG.test-key",
        fetch: async () => new Response("err", { status: 500 }),
      });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.code).toBe("CONNECTOR_UPSTREAM_ERROR");
    }
  });
});

// ─── contacts.get ─────────────────────────────────────────────────────────────

describe("getContact", () => {
  it("validates input without apiKey", () => {
    const result = getContact({ contactId: "c-get-001" }) as Record<string, unknown>;
    expect(result.action).toBe("contacts.get");
    expect((result.validated as Record<string, unknown>).contactId).toBe("c-get-001");
  });

  it("throws when contactId is missing", () => {
    expect(() => getContact({})).toThrow("contactId is required");
  });

  it("gets a contact via mock fetch (200)", async () => {
    const requests: Request[] = [];
    const result = await getContact({
      apiKey: "SG.test-key",
      contactId: "c-get-001",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(contactsGetFixture), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    }) as Record<string, unknown>;

    expect(requests[0].url).toBe("https://api.sendgrid.com/v3/marketing/contacts/c-get-001");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer SG.test-key");
    const contact = result.contact as Record<string, unknown>;
    expect(contact.id).toBe("sg-contact:c-get-001");
    expect(contact.email).toBe("ada@example.com");
  });

  it("throws upstream error on 404", async () => {
    try {
      await getContact({
        apiKey: "SG.test-key",
        contactId: "missing",
        fetch: async () => new Response("{}", { status: 404 }),
      });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.code).toBe("CONNECTOR_UPSTREAM_ERROR");
    }
  });
});

// ─── lists.list.action ────────────────────────────────────────────────────────

describe("listLists", () => {
  it("validates input without apiKey", () => {
    const result = listLists({ pageSize: 50 }) as Record<string, unknown>;
    expect(result.action).toBe("lists.list.action");
    expect((result.validated as Record<string, unknown>).pageSize).toBe(50);
  });

  it("lists marketing lists via mock fetch (200)", async () => {
    const requests: Request[] = [];
    const result = await listLists({
      apiKey: "SG.test-key",
      pageSize: 25,
      pageToken: "tok-1",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(listsListActionFixture), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    }) as Record<string, unknown>;

    expect(requests[0].url).toContain("https://api.sendgrid.com/v3/marketing/lists?");
    expect(requests[0].url).toContain("page_size=25");
    expect(requests[0].url).toContain("page_token=tok-1");
    expect(requests[0].method).toBe("GET");
    const lists = result.lists as Record<string, unknown>[];
    expect(lists).toHaveLength(2);
    expect(lists[0].id).toBe("sg-list:list-1");
    expect(lists[0].name).toBe("Newsletter Subscribers");
  });

  it("throws rate limit on 429", async () => {
    try {
      await listLists({
        apiKey: "SG.test-key",
        fetch: async () => new Response("", { status: 429, headers: { "retry-after": "8" } }),
      });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.code).toBe("CONNECTOR_RATE_LIMITED");
      expect(e.retryAfterSeconds).toBe(8);
    }
  });
});

// ─── lists.contacts.list ──────────────────────────────────────────────────────

describe("listListContacts", () => {
  it("validates input without apiKey", () => {
    const result = listListContacts({ listId: "list-001" }) as Record<string, unknown>;
    expect(result.action).toBe("lists.contacts.list");
    expect((result.validated as Record<string, unknown>).listId).toBe("list-001");
  });

  it("throws when listId is missing", () => {
    expect(() => listListContacts({})).toThrow("listId is required");
  });

  it("searches contacts on a list via mock fetch (200)", async () => {
    const requests: Request[] = [];
    const result = await listListContacts({
      apiKey: "SG.test-key",
      listId: "list-001",
      pageSize: 10,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(listsContactsListFixture), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    }) as Record<string, unknown>;

    expect(requests[0].url).toBe("https://api.sendgrid.com/v3/marketing/contacts/search");
    expect(requests[0].method).toBe("POST");
    const body = JSON.parse(await requests[0].text());
    expect(body.query).toBe("CONTAINS(list_ids, 'list-001')");
    expect(body.page_size).toBe(10);
    const contacts = result.contacts as Record<string, unknown>[];
    expect(contacts[0].email).toBe("member@example.com");
    expect(contacts[0].id).toBe("sg-contact:c-list-001");
  });
});

// ─── lists.contacts.add ───────────────────────────────────────────────────────

describe("addListContacts", () => {
  it("validates input without apiKey", () => {
    const result = addListContacts({ listId: "list-001", emails: ["a@b.com"] }) as Record<string, unknown>;
    expect(result.action).toBe("lists.contacts.add");
    const v = result.validated as Record<string, unknown>;
    expect(v.listId).toBe("list-001");
    expect(v.emails).toEqual(["a@b.com"]);
  });

  it("throws when listId is missing", () => {
    expect(() => addListContacts({ emails: ["a@b.com"] })).toThrow("listId is required");
  });

  it("throws when emails and contactIds are both missing", () => {
    expect(() => addListContacts({ listId: "list-001" })).toThrow("emails or contactIds is required");
  });

  it("adds contacts by email via mock fetch (202)", async () => {
    const requests: Request[] = [];
    const result = await addListContacts({
      apiKey: "SG.test-key",
      listId: "list-001",
      emails: ["new@example.com"],
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(listsContactsAddFixture), { status: 202, headers: { "Content-Type": "application/json" } });
      },
    }) as Record<string, unknown>;

    expect(requests[0].url).toBe("https://api.sendgrid.com/v3/marketing/contacts");
    expect(requests[0].method).toBe("PUT");
    const body = JSON.parse(await requests[0].text());
    expect(body.list_ids).toEqual(["list-001"]);
    expect(body.contacts).toEqual([{ email: "new@example.com" }]);
    expect(result.jobId).toBe("job-list-add-001");
  });

  it("adds contacts by id via mock fetch (202)", async () => {
    const requests: Request[] = [];
    await addListContacts({
      apiKey: "SG.test-key",
      listId: "list-001",
      contactIds: ["c-001"],
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(listsContactsAddFixture), { status: 202, headers: { "Content-Type": "application/json" } });
      },
    });
    expect(requests[0].url).toBe("https://api.sendgrid.com/v3/marketing/lists/list-001/contacts");
    expect(requests[0].method).toBe("PUT");
    expect(JSON.parse(await requests[0].text())).toEqual({ contact_ids: ["c-001"] });
  });
});

// ─── lists.contacts.remove ────────────────────────────────────────────────────

describe("removeListContacts", () => {
  it("validates input without apiKey", () => {
    const result = removeListContacts({ listId: "list-001", contactIds: ["c-001"] }) as Record<string, unknown>;
    expect(result.action).toBe("lists.contacts.remove");
  });

  it("throws when contactIds is missing", () => {
    expect(() => removeListContacts({ listId: "list-001" })).toThrow("contactIds must be a non-empty array");
  });

  it("removes contacts via mock fetch (202)", async () => {
    const requests: Request[] = [];
    const result = await removeListContacts({
      apiKey: "SG.test-key",
      listId: "list-001",
      contactIds: ["c-001", "c-002"],
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(listsContactsRemoveFixture), { status: 202, headers: { "Content-Type": "application/json" } });
      },
    }) as Record<string, unknown>;

    expect(requests[0].method).toBe("DELETE");
    expect(requests[0].url).toContain("/v3/marketing/lists/list-001/contacts?");
    expect(requests[0].url).toContain("contact_ids=");
    expect(decodeURIComponent(requests[0].url)).toContain("c-001,c-002");
    expect(result.jobId).toBe("job-list-remove-001");
  });
});

// ─── templates.list ───────────────────────────────────────────────────────────

describe("listTemplates", () => {
  it("validates input without apiKey and defaults generation", () => {
    const result = listTemplates({}) as Record<string, unknown>;
    expect(result.action).toBe("templates.list");
    const v = result.validated as Record<string, unknown>;
    expect(v.generations).toBe("legacy,dynamic");
    expect(v.pageSize).toBe(100);
  });

  it("lists templates via mock fetch (200)", async () => {
    const requests: Request[] = [];
    const result = await listTemplates({
      apiKey: "SG.test-key",
      generations: "dynamic",
      pageSize: 20,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(templatesListFixture), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    }) as Record<string, unknown>;

    expect(requests[0].url).toContain("/v3/templates?");
    expect(requests[0].url).toContain("generations=dynamic");
    expect(requests[0].url).toContain("page_size=20");
    expect(requests[0].method).toBe("GET");
    const templates = result.templates as Record<string, unknown>[];
    expect(templates).toHaveLength(2);
    expect(templates[0].id).toBe("sg-template:d-template-001");
  });
});

// ─── templates.update ─────────────────────────────────────────────────────────

describe("updateTemplate", () => {
  it("validates input without apiKey", () => {
    const result = updateTemplate({ templateId: "d-template-001", name: "Welcome Email Updated" }) as Record<string, unknown>;
    expect(result.action).toBe("templates.update");
  });

  it("throws when name is missing", () => {
    expect(() => updateTemplate({ templateId: "d-template-001" })).toThrow("name is required");
  });

  it("updates template via mock fetch (200)", async () => {
    const requests: Request[] = [];
    const result = await updateTemplate({
      apiKey: "SG.test-key",
      templateId: "d-template-001",
      name: "Welcome Email Updated",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(templateUpdateFixture), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    }) as Record<string, unknown>;

    expect(requests[0].url).toBe("https://api.sendgrid.com/v3/templates/d-template-001");
    expect(requests[0].method).toBe("PATCH");
    expect(JSON.parse(await requests[0].text())).toEqual({ name: "Welcome Email Updated" });
    const tmpl = result.template as Record<string, unknown>;
    expect(tmpl.name).toBe("Welcome Email Updated");
  });
});

// ─── templates.delete ─────────────────────────────────────────────────────────

describe("deleteTemplate", () => {
  it("validates input without apiKey", () => {
    const result = deleteTemplate({ templateId: "d-template-001" }) as Record<string, unknown>;
    expect(result.action).toBe("templates.delete");
  });

  it("throws when templateId is missing", () => {
    expect(() => deleteTemplate({})).toThrow("templateId is required");
  });

  it("deletes template via mock fetch (204)", async () => {
    const requests: Request[] = [];
    const result = await deleteTemplate({
      apiKey: "SG.test-key",
      templateId: "d-template-001",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("", { status: 204 });
      },
    }) as Record<string, unknown>;

    expect(requests[0].url).toBe("https://api.sendgrid.com/v3/templates/d-template-001");
    expect(requests[0].method).toBe("DELETE");
    expect(result.deleted).toBe(true);
  });

  it("throws upstream error on 404", async () => {
    try {
      await deleteTemplate({
        apiKey: "SG.test-key",
        templateId: "missing",
        fetch: async () => new Response("{}", { status: 404 }),
      });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.code).toBe("CONNECTOR_UPSTREAM_ERROR");
    }
  });
});

// ─── stats.global.get ─────────────────────────────────────────────────────────

describe("getGlobalStats", () => {
  it("validates input without apiKey", () => {
    const result = getGlobalStats({ startDate: "2025-01-01" }) as Record<string, unknown>;
    expect(result.action).toBe("stats.global.get");
    expect((result.validated as Record<string, unknown>).startDate).toBe("2025-01-01");
  });

  it("throws when startDate is missing", () => {
    expect(() => getGlobalStats({})).toThrow("startDate is required");
  });

  it("gets global stats via mock fetch (200)", async () => {
    const requests: Request[] = [];
    const result = await getGlobalStats({
      apiKey: "SG.test-key",
      startDate: "2025-01-01",
      endDate: "2025-01-31",
      aggregatedBy: "day",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(statsGlobalFixture), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    }) as Record<string, unknown>;

    expect(requests[0].url).toContain("/v3/stats?");
    expect(requests[0].url).toContain("start_date=2025-01-01");
    expect(requests[0].url).toContain("end_date=2025-01-31");
    expect(requests[0].url).toContain("aggregated_by=day");
    expect(requests[0].method).toBe("GET");
    const stats = result.stats as Record<string, unknown>[];
    expect(stats[0].date).toBe("2025-01-01");
    expect((stats[0].metrics as Record<string, unknown>).delivered).toBe(90);
  });
});

// ─── suppression.blocks.list ──────────────────────────────────────────────────

describe("listBlocks", () => {
  it("validates input without apiKey", () => {
    const result = listBlocks({}) as Record<string, unknown>;
    expect(result.action).toBe("suppression.blocks.list");
  });

  it("lists blocks via mock fetch (200)", async () => {
    const requests: Request[] = [];
    const result = await listBlocks({
      apiKey: "SG.test-key",
      limit: 10,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(blocksListFixture), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    }) as Record<string, unknown>;

    expect(requests[0].url).toContain("/v3/suppression/blocks");
    expect(requests[0].url).toContain("limit=10");
    const blocks = result.blocks as Record<string, unknown>[];
    expect(blocks[0].email).toBe("blocked@example.com");
    expect(blocks[0].status).toBe("5.7.1");
  });
});

// ─── suppression.spam_reports.list ────────────────────────────────────────────

describe("listSpamReports", () => {
  it("validates input without apiKey", () => {
    const result = listSpamReports({}) as Record<string, unknown>;
    expect(result.action).toBe("suppression.spam_reports.list");
  });

  it("lists spam reports via mock fetch (200)", async () => {
    const requests: Request[] = [];
    const result = await listSpamReports({
      apiKey: "SG.test-key",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(spamReportsListFixture), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    }) as Record<string, unknown>;

    expect(requests[0].url).toBe("https://api.sendgrid.com/v3/suppression/spam_reports");
    const reports = result.spamReports as Record<string, unknown>[];
    expect(reports[0].email).toBe("spam@example.com");
    expect(reports[0].ip).toBe("10.0.0.1");
  });
});

// ─── suppression.unsubscribes.list ────────────────────────────────────────────

describe("listUnsubscribes", () => {
  it("validates input without apiKey", () => {
    const result = listUnsubscribes({ email: "unsub" }) as Record<string, unknown>;
    expect(result.action).toBe("suppression.unsubscribes.list");
    expect((result.validated as Record<string, unknown>).email).toBe("unsub");
  });

  it("lists unsubscribes via mock fetch (200)", async () => {
    const requests: Request[] = [];
    const result = await listUnsubscribes({
      apiKey: "SG.test-key",
      email: "unsub",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(unsubscribesListFixture), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    }) as Record<string, unknown>;

    expect(requests[0].url).toContain("/v3/suppression/unsubscribes");
    expect(requests[0].url).toContain("email=unsub");
    const unsubscribes = result.unsubscribes as Record<string, unknown>[];
    expect(unsubscribes[0].email).toBe("unsub@example.com");
  });
});

// ─── suppression.invalid_emails.list ──────────────────────────────────────────

describe("listInvalidEmails", () => {
  it("lists invalid emails via mock fetch (200)", async () => {
    const requests: Request[] = [];
    const result = await listInvalidEmails({
      apiKey: "SG.test-key",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(invalidEmailsListFixture), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    }) as Record<string, unknown>;

    expect(requests[0].url).toBe("https://api.sendgrid.com/v3/suppression/invalid_emails");
    const invalid = result.invalidEmails as Record<string, unknown>[];
    expect(invalid[0].email).toBe("bad@example.com");
    expect(invalid[0].reason).toContain("unknown");
  });
});

// ─── api_keys.list ────────────────────────────────────────────────────────────

describe("listApiKeys", () => {
  it("validates input without apiKey", () => {
    const result = listApiKeys({ limit: 10 }) as Record<string, unknown>;
    expect(result.action).toBe("api_keys.list");
    expect((result.validated as Record<string, unknown>).limit).toBe(10);
  });

  it("lists api keys via mock fetch (200) without returning secret values", async () => {
    const requests: Request[] = [];
    const result = await listApiKeys({
      apiKey: "SG.test-key",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(apiKeysListFixture), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    }) as Record<string, unknown>;

    expect(requests[0].url).toBe("https://api.sendgrid.com/v3/api_keys");
    expect(requests[0].method).toBe("GET");
    const keys = result.apiKeys as Record<string, unknown>[];
    expect(keys).toHaveLength(2);
    expect(keys[0].apiKeyId).toBe("key-001");
    expect(keys[0].name).toBe("Mail Send");
    expect(JSON.stringify(result)).not.toContain("SG.");
  });
});

// ─── alerts.list ──────────────────────────────────────────────────────────────

describe("listAlerts", () => {
  it("validates input without apiKey", () => {
    const result = listAlerts({}) as Record<string, unknown>;
    expect(result.action).toBe("alerts.list");
  });

  it("lists alerts via mock fetch (200)", async () => {
    const requests: Request[] = [];
    const result = await listAlerts({
      apiKey: "SG.test-key",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(alertsListFixture), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    }) as Record<string, unknown>;

    expect(requests[0].url).toBe("https://api.sendgrid.com/v3/alerts");
    expect(requests[0].method).toBe("GET");
    const alerts = result.alerts as Record<string, unknown>[];
    expect(alerts).toHaveLength(2);
    expect(alerts[0].id).toBe(46);
    expect(alerts[0].type).toBe("usage_limit");
    expect(alerts[1].frequency).toBe("daily");
  });

  it("throws rate limit on 429", async () => {
    try {
      await listAlerts({
        apiKey: "SG.test-key",
        fetch: async () => new Response("", { status: 429, headers: { "retry-after": "12" } }),
      });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.code).toBe("CONNECTOR_RATE_LIMITED");
      expect(e.retryAfterSeconds).toBe(12);
    }
  });
});
