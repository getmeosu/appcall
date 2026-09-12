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

  it("queues contact creation with apiKey using mock fetch (202)", async () => {
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
    expect(result.jobId).toBe("job-create-001");
    expect(result.contact).toBeUndefined();
  });

  it("returns the queued job identity for a 200 response", async () => {
    const mockFetch = async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
      return new Response(JSON.stringify(createContactFixture), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await createContact({ apiKey: "SG.test-key", email: "newuser@example.com", fetch: mockFetch }) as Record<string, unknown>;
    expect(result.jobId).toBe("job-create-001");
  });

  it("returns the queued job identity for a 201 response", async () => {
    const mockFetch = async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
      return new Response(JSON.stringify(createContactFixture), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await createContact({ apiKey: "SG.test-key", email: "newuser@example.com", fetch: mockFetch }) as Record<string, unknown>;
    expect(result.jobId).toBe("job-create-001");
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

  it("fails when SendGrid omits the queued job identity", async () => {
    const mockFetch = async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
      return new Response(JSON.stringify({ new_contacts: [] }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      });
    };

    await expect(createContact({ apiKey: "SG.test-key", email: "fallback@example.com", fetch: mockFetch }))
      .rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  it("places list IDs at the request top level", async () => {
    let sentBody: Record<string, unknown> = {};
    const mockFetch = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ job_id: "job-list-001" }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await createContact({
      apiKey: "SG.test-key",
      email: "listed@example.com",
      firstName: "Listed",
      listIds: ["list-1", "list-2"],
      fetch: mockFetch,
    }) as Record<string, unknown>;
    expect(result.jobId).toBe("job-list-001");
    expect(sentBody.list_ids).toEqual(["list-1", "list-2"]);
    expect((sentBody.contacts as Array<Record<string, unknown>>)[0]?.list_ids).toBeUndefined();
  });
});
