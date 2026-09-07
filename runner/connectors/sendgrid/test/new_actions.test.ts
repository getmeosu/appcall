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
} from "../src/actions";
import contactsSearchFixture from "../fixtures/contacts_search.json";
import contactsUpsertFixture from "../fixtures/contacts_upsert.json";
import contactsDeleteFixture from "../fixtures/contacts_delete.json";
import listCreateFixture from "../fixtures/list_create.json";
import listGetFixture from "../fixtures/list_get.json";
import templateCreateFixture from "../fixtures/template_create.json";
import templateGetFixture from "../fixtures/template_get.json";
import bouncesListFixture from "../fixtures/bounces_list.json";

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
