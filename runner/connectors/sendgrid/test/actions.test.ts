import { describe, expect, it } from "bun:test";
import { createContact } from "../src/actions";
import createContactFixture from "../fixtures/create_contact.json";

describe("createContact", () => {
  it("validates input without apiKey and returns validated payload", () => {
    const result = createContact({ email: "test@example.com" }) as Record<string, unknown>;
    expect(result.connector).toBe("sendgrid");
    expect(result.action).toBe("contacts.create");
    expect(result.source).toBe("connector");
    expect(result.validated).toBeDefined();
    expect((result.validated as Record<string, unknown>).email).toBe("test@example.com");
  });

  it("validates input with optional fields", () => {
    const result = createContact({ email: "test@example.com", firstName: "Test", lastName: "User", listIds: ["list-1"] }) as Record<string, unknown>;
    const validated = result.validated as Record<string, unknown>;
    expect(validated.email).toBe("test@example.com");
    expect(validated.firstName).toBe("Test");
    expect(validated.lastName).toBe("User");
    expect(validated.listIds).toEqual(["list-1"]);
  });

  it("throws when email is missing", () => {
    expect(() => createContact({})).toThrow("email is required");
  });

  it("throws when email is empty string", () => {
    expect(() => createContact({ email: "" })).toThrow("email is required");
  });

  it("throws when email is not a string", () => {
    expect(() => createContact({ email: 123 })).toThrow("email is required");
  });

  it("filters non-string listIds", () => {
    const result = createContact({ email: "t@t.com", listIds: ["a", 1, null] }) as Record<string, unknown>;
    const validated = result.validated as Record<string, unknown>;
    expect(validated.listIds).toEqual(["a"]);
  });

  it("throws when input is not an object", () => {
    expect(() => createContact("not an object")).toThrow("input must be an object");
  });

  it("throws when input is null", () => {
    expect(() => createContact(null)).toThrow("input must be an object");
  });

  it("creates contact with apiKey using mock fetch (202)", async () => {
    const mockFetch = async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
      return new Response(JSON.stringify(createContactFixture), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await createContact({ apiKey: "SG.test-key", email: "newuser@example.com", firstName: "New", lastName: "User", fetch: mockFetch }) as Record<string, unknown>;
    expect(result.connector).toBe("sendgrid");
    expect(result.action).toBe("contacts.create");
    expect(result.source).toBe("connector");
    expect(result.contact).toBeDefined();
    const contact = result.contact as Record<string, unknown>;
    expect(contact.id).toBe("sg-contact:c-new-001");
    expect(contact.email).toBe("newuser@example.com");
    expect(contact.firstName).toBe("New");
    expect(contact.lastName).toBe("User");
  });

  it("creates contact with apiKey using mock fetch (200)", async () => {
    const mockFetch = async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
      return new Response(JSON.stringify(createContactFixture), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await createContact({ apiKey: "SG.test-key", email: "newuser@example.com", fetch: mockFetch }) as Record<string, unknown>;
    const contact = result.contact as Record<string, unknown>;
    expect(contact.id).toBe("sg-contact:c-new-001");
  });

  it("creates contact with apiKey using mock fetch (201)", async () => {
    const mockFetch = async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
      return new Response(JSON.stringify(createContactFixture), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await createContact({ apiKey: "SG.test-key", email: "newuser@example.com", fetch: mockFetch }) as Record<string, unknown>;
    const contact = result.contact as Record<string, unknown>;
    expect(contact.id).toBe("sg-contact:c-new-001");
  });

  it("throws rate limit error on 429", async () => {
    const mockFetch = async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
      return new Response("Rate limit exceeded", {
        status: 429,
        headers: { "retry-after": "30" },
      });
    };

    try {
      await createContact({ apiKey: "SG.test-key", email: "t@t.com", fetch: mockFetch });
      expect(true).toBe(false); // should not reach
    } catch (e: any) {
      expect(e.code).toBe("CONNECTOR_RATE_LIMITED");
      expect(e.retryAfterSeconds).toBe(30);
    }
  });

  it("throws upstream error on 500", async () => {
    const mockFetch = async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
      return new Response("Internal Server Error", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      });
    };

    try {
      await createContact({ apiKey: "SG.test-key", email: "t@t.com", fetch: mockFetch });
      expect(true).toBe(false); // should not reach
    } catch (e: any) {
      expect(e.code).toBe("CONNECTOR_UPSTREAM_ERROR");
    }
  });

  it("handles empty new_contacts array by using email as fallback id", async () => {
    const mockFetch = async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
      return new Response(JSON.stringify({ new_contacts: [] }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await createContact({ apiKey: "SG.test-key", email: "fallback@example.com", fetch: mockFetch }) as Record<string, unknown>;
    const contact = result.contact as Record<string, unknown>;
    expect(contact.id).toBe("sg-contact:fallback@example.com");
    expect(contact.email).toBe("fallback@example.com");
  });
});
