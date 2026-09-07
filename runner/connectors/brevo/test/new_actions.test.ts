import { describe, expect, test } from "bun:test";
import getContactFixture from "../fixtures/get_contact.json";
import sendEmailFixture from "../fixtures/send_email.json";
import createListFixture from "../fixtures/create_list.json";
import getListFixture from "../fixtures/get_list.json";
import addContactsToListFixture from "../fixtures/add_contacts_to_list.json";
import createEmailCampaignFixture from "../fixtures/create_email_campaign.json";
import getEmailCampaignFixture from "../fixtures/get_email_campaign.json";
import {
  getContact,
  updateContact,
  deleteContact,
  sendEmail,
  createList,
  getList,
  addContactsToList,
  removeContactsFromList,
  createEmailCampaign,
  sendEmailCampaign,
  getEmailCampaign,
} from "../src/actions";

// ─── contacts.get ─────────────────────────────────────────────────────────────

describe("getContact action", () => {
  test("validates input without apiKey and returns validated payload", () => {
    const result = getContact({ identifier: "contact@example.com" });
    expect(result).toEqual({
      connector: "brevo",
      action: "contacts.get",
      source: "connector",
      validated: { identifier: "contact@example.com" },
    });
  });

  test("rejects input without identifier", () => {
    expect(() => getContact({ apiKey: "key" })).toThrow("identifier is required");
  });

  test("rejects non-object input", () => {
    expect(() => getContact("bad")).toThrow("input must be an object");
  });

  test("fetches contact via Brevo API with mock fetch (200)", async () => {
    const requests: Request[] = [];
    const result = await getContact({
      apiKey: "test-key",
      identifier: "contact@example.com",
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        return Response.json(getContactFixture, { status: 200 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.brevo.com/v3/contacts/contact%40example.com");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("api-key")).toBe("test-key");

    expect(result).toEqual({
      connector: "brevo",
      action: "contacts.get",
      source: "connector",
      contact: expect.objectContaining({
        id: "brv-contact:42",
        email: "contact@example.com",
        firstName: "Jane",
        lastName: "Doe",
      }),
    });
  });

  test("throws rate limit error on 429", async () => {
    await expect(getContact({
      apiKey: "key",
      identifier: "test@example.com",
      fetch: async () => new Response("{}", {
        status: 429,
        headers: { "retry-after": "20", "Content-Type": "application/json" },
      }),
    })).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      retryAfterSeconds: 20,
    });
  });

  test("throws upstream error on 404", async () => {
    await expect(getContact({
      apiKey: "key",
      identifier: "nobody@example.com",
      fetch: async () => new Response(JSON.stringify({ message: "Contact does not exist" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    })).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });
});

// ─── contacts.update ──────────────────────────────────────────────────────────

describe("updateContact action", () => {
  test("validates input without apiKey", () => {
    const result = updateContact({ identifier: "user@example.com", firstName: "Alice" });
    expect(result).toEqual({
      connector: "brevo",
      action: "contacts.update",
      source: "connector",
      validated: { identifier: "user@example.com", firstName: "Alice" },
    });
  });

  test("rejects missing identifier", () => {
    expect(() => updateContact({ apiKey: "key", firstName: "Alice" })).toThrow("identifier is required");
  });

  test("updates contact via Brevo API with mock fetch (204)", async () => {
    const requests: Request[] = [];
    const result = await updateContact({
      apiKey: "test-key",
      identifier: "user@example.com",
      firstName: "Alice",
      lastName: "Smith",
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        return new Response(null, { status: 204 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.brevo.com/v3/contacts/user%40example.com");
    expect(requests[0].method).toBe("PUT");
    expect(requests[0].headers.get("api-key")).toBe("test-key");

    expect(result).toEqual({
      connector: "brevo",
      action: "contacts.update",
      source: "connector",
      updated: true,
    });
  });

  test("throws rate limit error on 429", async () => {
    await expect(updateContact({
      apiKey: "key",
      identifier: "test@example.com",
      fetch: async () => new Response("{}", {
        status: 429,
        headers: { "retry-after": "5", "Content-Type": "application/json" },
      }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── contacts.delete ──────────────────────────────────────────────────────────

describe("deleteContact action", () => {
  test("validates input without apiKey", () => {
    const result = deleteContact({ identifier: "del@example.com" });
    expect(result).toEqual({
      connector: "brevo",
      action: "contacts.delete",
      source: "connector",
      validated: { identifier: "del@example.com" },
    });
  });

  test("rejects missing identifier", () => {
    expect(() => deleteContact({ apiKey: "key" })).toThrow("identifier is required");
  });

  test("deletes contact via Brevo API with mock fetch (204)", async () => {
    const requests: Request[] = [];
    const result = await deleteContact({
      apiKey: "test-key",
      identifier: "del@example.com",
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        return new Response(null, { status: 204 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.brevo.com/v3/contacts/del%40example.com");
    expect(requests[0].method).toBe("DELETE");
    expect(requests[0].headers.get("api-key")).toBe("test-key");

    expect(result).toEqual({
      connector: "brevo",
      action: "contacts.delete",
      source: "connector",
      deleted: true,
    });
  });

  test("throws upstream error on 404", async () => {
    await expect(deleteContact({
      apiKey: "key",
      identifier: "nobody@example.com",
      fetch: async () => new Response("{}", { status: 404, headers: { "Content-Type": "application/json" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── smtp.email.send ──────────────────────────────────────────────────────────

describe("sendEmail action", () => {
  const validEmailInput = {
    to: [{ email: "recipient@example.com", name: "Recipient" }],
    sender: { email: "sender@example.com", name: "Sender" },
    subject: "Hello World",
    htmlContent: "<p>Hello!</p>",
  };

  test("validates input without apiKey", () => {
    const result = sendEmail(validEmailInput);
    expect(result).toEqual({
      connector: "brevo",
      action: "smtp.email.send",
      source: "connector",
      validated: expect.objectContaining({ subject: "Hello World" }),
    });
  });

  test("rejects missing to field", () => {
    expect(() => sendEmail({ apiKey: "key", sender: { email: "s@e.com" }, subject: "Hi" })).toThrow("to must be");
  });

  test("rejects empty to array", () => {
    expect(() => sendEmail({ apiKey: "key", to: [], sender: { email: "s@e.com" }, subject: "Hi" })).toThrow("to must be a non-empty array");
  });

  test("rejects missing subject", () => {
    expect(() => sendEmail({ apiKey: "key", to: [{ email: "r@e.com" }], sender: { email: "s@e.com" } })).toThrow("subject is required");
  });

  test("sends email via Brevo API with mock fetch (201)", async () => {
    const requests: Request[] = [];
    const result = await sendEmail({
      apiKey: "test-key",
      ...validEmailInput,
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        return Response.json(sendEmailFixture, { status: 201 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("api-key")).toBe("test-key");
    expect(requests[0].headers.get("Content-Type")).toBe("application/json");

    expect(result).toEqual({
      connector: "brevo",
      action: "smtp.email.send",
      source: "connector",
      email: expect.objectContaining({
        messageId: sendEmailFixture.messageId,
        provider: "brevo",
      }),
    });
  });

  test("does not leak apiKey in output", async () => {
    const result = await sendEmail({
      apiKey: "secret-key",
      ...validEmailInput,
      fetch: async () => Response.json(sendEmailFixture, { status: 201 }),
    });
    expect(JSON.stringify(result)).not.toContain("secret-key");
  });

  test("throws rate limit error on 429", async () => {
    await expect(sendEmail({
      apiKey: "key",
      ...validEmailInput,
      fetch: async () => new Response("{}", {
        status: 429,
        headers: { "retry-after": "60", "Content-Type": "application/json" },
      }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 60 });
  });

  test("throws upstream error on 400", async () => {
    await expect(sendEmail({
      apiKey: "key",
      ...validEmailInput,
      fetch: async () => new Response(JSON.stringify({ message: "Invalid email" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("defaults to the account's first verified sender when sender is omitted", async () => {
    const requests: Request[] = [];
    const result = await sendEmail({
      apiKey: "key",
      to: [{ email: "r@e.com" }],
      subject: "Hi",
      htmlContent: "<p>hi</p>",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const req = new Request(input, init);
        requests.push(req);
        if (req.url.endsWith("/v3/senders")) {
          return Response.json({ senders: [{ id: 1, name: "Acme", email: "verified@acme.com", active: true }] }, { status: 200 });
        }
        return Response.json(sendEmailFixture, { status: 201 });
      },
    });
    // Looks up verified senders first, then sends with the resolved sender.
    expect(requests.map((r) => r.url)).toEqual([
      "https://api.brevo.com/v3/senders",
      "https://api.brevo.com/v3/smtp/email",
    ]);
    const sent = JSON.parse(await requests[1].text());
    expect(sent.sender).toEqual({ email: "verified@acme.com", name: "Acme" });
    expect(result).toMatchObject({ action: "smtp.email.send" });
  });

  test("errors clearly when no verified sender exists and none is provided", async () => {
    await expect(sendEmail({
      apiKey: "key",
      to: [{ email: "r@e.com" }],
      subject: "Hi",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const req = new Request(input, init);
        if (req.url.endsWith("/v3/senders")) return Response.json({ senders: [] }, { status: 200 });
        return Response.json(sendEmailFixture, { status: 201 });
      },
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("routes through the SMTP relay when SMTP credentials are present (injected fake socket)", async () => {
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

    const result = await sendEmail({
      smtpHost: "smtp.example.com",
      smtpPort: "587",
  smtpSecure: true,
      smtpUser: "u",
      smtpPassword: "p",
      from: "sender@example.com",
      to: "recipient@example.com",
      subject: "Hello World",
      text: "Hello",
      __connect,
    }) as Record<string, unknown>;

    expect(result.connector).toBe("brevo");
    expect(result.action).toBe("smtp.email.send");
    expect(result.source).toBe("smtp");
    expect(result.accepted).toEqual(["recipient@example.com"]);
    expect(writes.join("")).toContain("MAIL FROM:<sender@example.com>\r\n");
  });
});

// ─── lists.create ─────────────────────────────────────────────────────────────

describe("createList action", () => {
  test("validates input without apiKey", () => {
    const result = createList({ name: "Newsletter", folderId: 2 });
    expect(result).toEqual({
      connector: "brevo",
      action: "lists.create",
      source: "connector",
      validated: { name: "Newsletter", folderId: 2 },
    });
  });

  test("rejects missing name", () => {
    expect(() => createList({ apiKey: "key", folderId: 2 })).toThrow("name is required");
  });

  test("rejects missing folderId", () => {
    expect(() => createList({ apiKey: "key", name: "Test" })).toThrow("folderId must be a number");
  });

  test("creates list via Brevo API with mock fetch (201)", async () => {
    const requests: Request[] = [];
    const result = await createList({
      apiKey: "test-key",
      name: "Newsletter Subscribers",
      folderId: 2,
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        return Response.json(createListFixture, { status: 201 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.brevo.com/v3/contacts/lists");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("api-key")).toBe("test-key");

    expect(result).toEqual({
      connector: "brevo",
      action: "lists.create",
      source: "connector",
      list: expect.objectContaining({
        id: "brv-list:17",
        name: "Newsletter Subscribers",
      }),
    });
  });

  test("throws rate limit error on 429", async () => {
    await expect(createList({
      apiKey: "key",
      name: "Test",
      folderId: 1,
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "10", "Content-Type": "application/json" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── lists.get ────────────────────────────────────────────────────────────────

describe("getList action", () => {
  test("validates input without apiKey", () => {
    const result = getList({ listId: 17 });
    expect(result).toEqual({
      connector: "brevo",
      action: "lists.get",
      source: "connector",
      validated: { listId: 17 },
    });
  });

  test("rejects missing listId", () => {
    expect(() => getList({ apiKey: "key" })).toThrow("listId must be a number");
  });

  test("fetches list via Brevo API with mock fetch (200)", async () => {
    const requests: Request[] = [];
    const result = await getList({
      apiKey: "test-key",
      listId: 17,
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        return Response.json(getListFixture, { status: 200 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.brevo.com/v3/contacts/lists/17");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("api-key")).toBe("test-key");

    expect(result).toEqual({
      connector: "brevo",
      action: "lists.get",
      source: "connector",
      list: expect.objectContaining({
        id: "brv-list:17",
        name: "Newsletter Subscribers",
        totalSubscribers: 450,
      }),
    });
  });

  test("throws upstream error on 404", async () => {
    await expect(getList({
      apiKey: "key",
      listId: 9999,
      fetch: async () => new Response("{}", { status: 404, headers: { "Content-Type": "application/json" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── contacts.addToList ───────────────────────────────────────────────────────

describe("addContactsToList action", () => {
  test("validates input without apiKey", () => {
    const result = addContactsToList({ listId: 3, emails: ["a@b.com"] });
    expect(result).toEqual({
      connector: "brevo",
      action: "contacts.addToList",
      source: "connector",
      validated: { listId: 3, emails: ["a@b.com"] },
    });
  });

  test("rejects empty emails array", () => {
    expect(() => addContactsToList({ apiKey: "key", listId: 3, emails: [] })).toThrow("emails must be a non-empty array");
  });

  test("rejects missing listId", () => {
    expect(() => addContactsToList({ apiKey: "key", emails: ["a@b.com"] })).toThrow("listId must be a number");
  });

  test("adds contacts via Brevo API with mock fetch (201)", async () => {
    const requests: Request[] = [];
    const result = await addContactsToList({
      apiKey: "test-key",
      listId: 3,
      emails: ["user1@example.com", "user2@example.com"],
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        return Response.json(addContactsToListFixture, { status: 201 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.brevo.com/v3/contacts/lists/3/contacts/add");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("api-key")).toBe("test-key");

    expect(result.connector).toBe("brevo");
    expect(result.action).toBe("contacts.addToList");
    expect(result.contacts).toBeDefined();
  });

  test("throws rate limit error on 429", async () => {
    await expect(addContactsToList({
      apiKey: "key",
      listId: 3,
      emails: ["a@b.com"],
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "15", "Content-Type": "application/json" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── contacts.removeFromList ──────────────────────────────────────────────────

describe("removeContactsFromList action", () => {
  test("validates input without apiKey (with emails)", () => {
    const result = removeContactsFromList({ listId: 3, emails: ["a@b.com"] });
    expect(result).toEqual({
      connector: "brevo",
      action: "contacts.removeFromList",
      source: "connector",
      validated: { listId: 3, emails: ["a@b.com"] },
    });
  });

  test("validates input without apiKey (with all:true)", () => {
    const result = removeContactsFromList({ listId: 3, all: true });
    expect(result).toEqual({
      connector: "brevo",
      action: "contacts.removeFromList",
      source: "connector",
      validated: { listId: 3, all: true },
    });
  });

  test("rejects when neither emails nor all:true provided", () => {
    expect(() => removeContactsFromList({ apiKey: "key", listId: 3 })).toThrow("either emails or all:true is required");
  });

  test("removes contacts via Brevo API with mock fetch (200)", async () => {
    const requests: Request[] = [];
    const result = await removeContactsFromList({
      apiKey: "test-key",
      listId: 3,
      emails: ["user1@example.com"],
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        return Response.json({}, { status: 200 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.brevo.com/v3/contacts/lists/3/contacts/remove");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("api-key")).toBe("test-key");

    expect(result).toEqual({
      connector: "brevo",
      action: "contacts.removeFromList",
      source: "connector",
      removed: true,
    });
  });

  test("throws upstream error on 404", async () => {
    await expect(removeContactsFromList({
      apiKey: "key",
      listId: 9999,
      all: true,
      fetch: async () => new Response("{}", { status: 404, headers: { "Content-Type": "application/json" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── emailCampaigns.create ────────────────────────────────────────────────────

describe("createEmailCampaign action", () => {
  const validCampaignInput = {
    name: "Summer Sale 2025",
    subject: "Huge savings this summer!",
    sender: { name: "Acme Marketing", email: "marketing@acme.com" },
    htmlContent: "<p>Big summer sale!</p>",
  };

  test("validates input without apiKey", () => {
    const result = createEmailCampaign(validCampaignInput);
    expect(result).toEqual({
      connector: "brevo",
      action: "emailCampaigns.create",
      source: "connector",
      validated: expect.objectContaining({ name: "Summer Sale 2025", subject: "Huge savings this summer!" }),
    });
  });

  test("rejects missing name", () => {
    expect(() => createEmailCampaign({ apiKey: "key", subject: "Hi", sender: { name: "A", email: "a@b.com" } })).toThrow("name is required");
  });

  test("rejects missing sender", () => {
    expect(() => createEmailCampaign({ apiKey: "key", name: "Test", subject: "Hi" })).toThrow("sender must be an object");
  });

  test("creates campaign via Brevo API with mock fetch (201)", async () => {
    const requests: Request[] = [];
    const result = await createEmailCampaign({
      apiKey: "test-key",
      ...validCampaignInput,
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        return Response.json(createEmailCampaignFixture, { status: 201 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.brevo.com/v3/emailCampaigns");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("api-key")).toBe("test-key");

    expect(result).toEqual({
      connector: "brevo",
      action: "emailCampaigns.create",
      source: "connector",
      campaign: expect.objectContaining({
        id: "brv-campaign:55",
        name: "Summer Sale 2025",
        status: "draft",
      }),
    });
  });

  test("throws rate limit error on 429", async () => {
    await expect(createEmailCampaign({
      apiKey: "key",
      ...validCampaignInput,
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "30", "Content-Type": "application/json" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 30 });
  });
});

// ─── emailCampaigns.send ──────────────────────────────────────────────────────

describe("sendEmailCampaign action", () => {
  test("validates input without apiKey", () => {
    const result = sendEmailCampaign({ campaignId: 55 });
    expect(result).toEqual({
      connector: "brevo",
      action: "emailCampaigns.send",
      source: "connector",
      validated: { campaignId: 55 },
    });
  });

  test("rejects missing campaignId", () => {
    expect(() => sendEmailCampaign({ apiKey: "key" })).toThrow("campaignId must be a number");
  });

  test("sends campaign via Brevo API with mock fetch (204)", async () => {
    const requests: Request[] = [];
    const result = await sendEmailCampaign({
      apiKey: "test-key",
      campaignId: 55,
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        return new Response(null, { status: 204 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.brevo.com/v3/emailCampaigns/55/sendNow");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("api-key")).toBe("test-key");

    expect(result).toEqual({
      connector: "brevo",
      action: "emailCampaigns.send",
      source: "connector",
      sent: true,
    });
  });

  test("throws upstream error on 404", async () => {
    await expect(sendEmailCampaign({
      apiKey: "key",
      campaignId: 9999,
      fetch: async () => new Response("{}", { status: 404, headers: { "Content-Type": "application/json" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── emailCampaigns.get ───────────────────────────────────────────────────────

describe("getEmailCampaign action", () => {
  test("validates input without apiKey", () => {
    const result = getEmailCampaign({ campaignId: 55 });
    expect(result).toEqual({
      connector: "brevo",
      action: "emailCampaigns.get",
      source: "connector",
      validated: { campaignId: 55 },
    });
  });

  test("rejects missing campaignId", () => {
    expect(() => getEmailCampaign({ apiKey: "key" })).toThrow("campaignId must be a number");
  });

  test("fetches campaign via Brevo API with mock fetch (200)", async () => {
    const requests: Request[] = [];
    const result = await getEmailCampaign({
      apiKey: "test-key",
      campaignId: 55,
      fetch: async (input, init) => {
        const req = new Request(input, init);
        requests.push(req);
        return Response.json(getEmailCampaignFixture, { status: 200 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.brevo.com/v3/emailCampaigns/55");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("api-key")).toBe("test-key");

    expect(result).toEqual({
      connector: "brevo",
      action: "emailCampaigns.get",
      source: "connector",
      campaign: expect.objectContaining({
        id: "brv-campaign:55",
        name: "Summer Sale 2025",
        status: "sent",
        sentCount: 1200,
        openRate: 0.32,
        clickRate: 0.08,
      }),
    });
  });

  test("throws rate limit error on 429", async () => {
    await expect(getEmailCampaign({
      apiKey: "key",
      campaignId: 55,
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "10", "Content-Type": "application/json" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });

  test("throws upstream error on 404", async () => {
    await expect(getEmailCampaign({
      apiKey: "key",
      campaignId: 9999,
      fetch: async () => new Response("{}", { status: 404, headers: { "Content-Type": "application/json" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
