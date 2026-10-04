import { describe, expect, test } from "bun:test";
import contactCreateFixture from "../fixtures/contact_create.json";
import contactsListFixture from "../fixtures/contacts_list.json";
import {
  validateCreateContactInput,
  validateListContactsInput,
  validateGetContactInput,
  validateUpdateContactInput,
  normalizeContact,
  parseContactsResponse,
  createContactsClient,
} from "../src/contacts";

describe("microsoft-365 contacts (create/list)", () => {
  // ─── Static validation ───────────────────────────────────────────────────────

  test("validateCreateContactInput returns required and optional fields", () => {
    const result = validateCreateContactInput({
      givenName: "John",
      surname: "Doe",
      emailAddresses: ["john.doe@example.com"],
      mobilePhone: "+1-555-0100",
      jobTitle: "Engineer",
      companyName: "Acme",
    });

    expect(result.givenName).toBe("John");
    expect(result.surname).toBe("Doe");
    expect(result.emailAddresses).toEqual(["john.doe@example.com"]);
    expect(result.mobilePhone).toBe("+1-555-0100");
    expect(result.jobTitle).toBe("Engineer");
    expect(result.companyName).toBe("Acme");
  });

  test("validateCreateContactInput accepts minimal input with only givenName", () => {
    const result = validateCreateContactInput({ givenName: "Alice" });
    expect(result.givenName).toBe("Alice");
    expect(result.surname).toBeUndefined();
    expect(result.emailAddresses).toBeUndefined();
  });

  test("validateCreateContactInput throws on missing givenName", () => {
    expect(() => validateCreateContactInput({})).toThrow("givenName is required");
    expect(() => validateCreateContactInput("not-an-object")).toThrow();
  });

  test("validateListContactsInput returns empty object for valid input", () => {
    expect(validateListContactsInput({})).toEqual({});
    expect(validateListContactsInput(undefined)).toEqual({});
  });

  // ─── Normalize ───────────────────────────────────────────────────────────────

  test("normalizeContact normalizes fixture contact", () => {
    const contact = normalizeContact(contactCreateFixture);

    expect(contact.id).toBe("outlook:AAMkAGI2contactAAA=");
    expect(contact.provider).toBe("microsoft-365");
    expect(contact.providerContactId).toBe("AAMkAGI2contactAAA=");
    expect(contact.displayName).toBe("John Doe");
    expect(contact.givenName).toBe("John");
    expect(contact.surname).toBe("Doe");
    expect(contact.email).toBe("john.doe@example.com");
    expect(contact.mobilePhone).toBe("+1-555-0100");
    expect(contact.jobTitle).toBe("Software Engineer");
    expect(contact.companyName).toBe("Acme Corp");
    expect(contact.modelVersion).toBe("2026-05-16");
  });

  test("normalizeContact handles minimal fields", () => {
    const contact = normalizeContact({ id: "min-id", displayName: undefined, givenName: "Min" });

    expect(contact.id).toBe("outlook:min-id");
    expect(contact.email).toBe("");
    expect(contact.displayName).toBe("");
  });

  test("parseContactsResponse parses contacts list", () => {
    const result = parseContactsResponse(contactsListFixture);

    expect(result.contacts).toHaveLength(2);
    expect(result.contacts[0].id).toBe("AAMkAGI2contactAAA=");
    expect(result.contacts[0].givenName).toBe("John");
    expect(result.contacts[1].id).toBe("AAMkAGI2contactBBB=");
    expect(result.nextLink).toBeNull();
  });

  test("parseContactsResponse handles non-object gracefully", () => {
    expect(parseContactsResponse(null)).toEqual({ contacts: [], nextLink: null });
    expect(parseContactsResponse("string")).toEqual({ contacts: [], nextLink: null });
    expect(parseContactsResponse({ value: [] })).toEqual({ contacts: [], nextLink: null });
  });

  // ─── Mocked HTTP: contacts.create ────────────────────────────────────────────

  test("createContact POSTs to /v1.0/me/contacts with Bearer token", async () => {
    const requests: Request[] = [];
    const client = createContactsClient({
      accessToken: "tok-contact-create",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(contactCreateFixture), { status: 201, headers: { "Content-Type": "application/json" } });
      },
    });

    const result = await client.create({
      givenName: "John",
      surname: "Doe",
      emailAddresses: ["john.doe@example.com"],
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://graph.microsoft.com/v1.0/me/contacts");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok-contact-create");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.contact.providerContactId).toBe("AAMkAGI2contactAAA=");
      expect(result.contact.displayName).toBe("John Doe");
    }
  });

  test("createContact maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createContactsClient({
      accessToken: "tok-contact-create",
      fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "15" } }),
    });

    const result = await client.create({ givenName: "Test" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
      expect(result.error.retryAfterSeconds).toBe(15);
    }
  });

  test("createContact maps non-201/429 to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createContactsClient({
      accessToken: "tok-contact-create",
      fetch: async () => new Response("{}", { status: 400 }),
    });

    const result = await client.create({ givenName: "Test" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
  });

  // ─── Mocked HTTP: contacts.list ──────────────────────────────────────────────

  test("listContacts GETs /v1.0/me/contacts with Bearer token", async () => {
    const requests: Request[] = [];
    const client = createContactsClient({
      accessToken: "tok-contact-list",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(contactsListFixture), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    });

    const result = await client.list({});

    expect(requests[0].url).toBe("https://graph.microsoft.com/v1.0/me/contacts");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok-contact-list");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.contacts).toHaveLength(2);
      expect(result.contacts[0].givenName).toBe("John");
      expect(result.contacts[1].givenName).toBe("Jane");
    }
  });

  test("listContacts maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createContactsClient({
      accessToken: "tok-contact-list",
      fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "30" } }),
    });

    const result = await client.list({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
  });

  test("listContacts maps non-200/429 to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createContactsClient({
      accessToken: "tok-contact-list",
      fetch: async () => new Response("{}", { status: 403 }),
    });

    const result = await client.list({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
  });

  test("validateGetContactInput returns contactId", () => {
    const result = validateGetContactInput({ contactId: "AAMkAGI2contactAAA=" });
    expect(result.contactId).toBe("AAMkAGI2contactAAA=");
  });

  test("validateGetContactInput throws on missing contactId", () => {
    expect(() => validateGetContactInput({})).toThrow("contactId is required");
  });

  test("validateUpdateContactInput returns contactId and optional fields", () => {
    const result = validateUpdateContactInput({ contactId: "AAMkAGI2contactAAA=", jobTitle: "Staff Engineer" });
    expect(result.contactId).toBe("AAMkAGI2contactAAA=");
    expect(result.jobTitle).toBe("Staff Engineer");
    expect(result.givenName).toBeUndefined();
  });

  test("validateUpdateContactInput throws on missing contactId", () => {
    expect(() => validateUpdateContactInput({ givenName: "Ada" })).toThrow("contactId is required");
  });

  test("getContact GETs /v1.0/me/contacts/{id} with Bearer token", async () => {
    const requests: Request[] = [];
    const client = createContactsClient({
      accessToken: "tok-contact-get",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(contactCreateFixture), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    });

    const result = await client.get({ contactId: "AAMkAGI2contactAAA=" });

    expect(requests[0].url).toBe("https://graph.microsoft.com/v1.0/me/contacts/AAMkAGI2contactAAA%3D");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok-contact-get");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.contact.providerContactId).toBe("AAMkAGI2contactAAA=");
      expect(result.contact.givenName).toBe("John");
    }
  });

  test("getContact maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createContactsClient({
      accessToken: "tok-contact-get",
      fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "6" } }),
    });

    const result = await client.get({ contactId: "c1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
  });

  test("updateContact PATCHes /v1.0/me/contacts/{id}", async () => {
    const requests: Request[] = [];
    const updated = { ...contactCreateFixture, jobTitle: "Staff Engineer" };
    const client = createContactsClient({
      accessToken: "tok-contact-update",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(updated), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    });

    const result = await client.update({ contactId: "AAMkAGI2contactAAA=", jobTitle: "Staff Engineer" });

    expect(requests[0].url).toBe("https://graph.microsoft.com/v1.0/me/contacts/AAMkAGI2contactAAA%3D");
    expect(requests[0].method).toBe("PATCH");
    expect(await requests[0].json()).toEqual({ jobTitle: "Staff Engineer" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.contact.jobTitle).toBe("Staff Engineer");
  });

  test("updateContact maps non-200/429 to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createContactsClient({
      accessToken: "tok-contact-update",
      fetch: async () => new Response("{}", { status: 404 }),
    });

    const result = await client.update({ contactId: "missing", givenName: "Ada" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
  });
});
