import { describe, expect, test } from "bun:test";
import createContactFixture from "../fixtures/create_contact.json";
import { createContact } from "../src/actions";

describe("createContact action", () => {
  test("validates input without apiKey and returns validated payload", () => {
    const result = createContact({ email: "test@example.com" });

    expect(result).toEqual({
      connector: "brevo",
      action: "contacts.create",
      source: "connector",
      validated: {
        email: "test@example.com",
      },
    });
  });

  test("validates input with optional fields without apiKey", () => {
    const result = createContact({
      email: "test@example.com",
      firstName: "Test",
      lastName: "User",
      listIds: [2, 5],
      attributes: { source: "api" },
    });

    expect(result.connector).toBe("brevo");
    expect(result.action).toBe("contacts.create");
    expect(result.source).toBe("connector");
    expect(result.validated).toEqual({
      email: "test@example.com",
      firstName: "Test",
      lastName: "User",
      listIds: [2, 5],
      attributes: { source: "api" },
    });
  });

  test("rejects input without email", () => {
    expect(() => createContact({ apiKey: "key" })).toThrow("email is required");
  });

  test("rejects input with empty email", () => {
    expect(() => createContact({ apiKey: "key", email: "" })).toThrow("email is required");
  });

  test("rejects non-object input", () => {
    expect(() => createContact("bad")).toThrow("input must be an object");
  });

  test("creates contact via Brevo API with apiKey and mock fetch (201)", async () => {
    const requests: Request[] = [];
    const result = await createContact({
      apiKey: "test-key",
      email: "newuser@example.com",
      firstName: "New",
      lastName: "User",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json(createContactFixture, { status: 201 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.brevo.com/v3/contacts");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("api-key")).toBe("test-key");
    expect(requests[0].headers.get("Content-Type")).toBe("application/json");
    expect(JSON.stringify(result)).not.toContain("test-key");

    expect(result).toEqual({
      connector: "brevo",
      action: "contacts.create",
      source: "connector",
      contact: expect.objectContaining({
        id: "brv-contact:201",
        email: "newuser@example.com",
        firstName: "New",
        lastName: "User",
      }),
    });
  });

  test("handles 200 status as success", async () => {
    const result = await createContact({
      apiKey: "key",
      email: "newuser@example.com",
      fetch: async () => Response.json(createContactFixture, { status: 200 }),
    });

    expect(result.connector).toBe("brevo");
    expect(result.action).toBe("contacts.create");
    expect(result.contact).toBeDefined();
    expect(result.contact?.email).toBe("newuser@example.com");
  });

  test("throws rate limit error on 429", async () => {
    await expect(createContact({
      apiKey: "key",
      email: "test@example.com",
      fetch: async () => new Response(JSON.stringify({}), {
        status: 429,
        headers: { "Retry-After": "30", "Content-Type": "application/json" },
      }),
    })).rejects.toEqual({
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "Brevo rate limit exceeded.",
      retryAfterSeconds: 30,
    });
  });

  test("surfaces the provider's real error message on non-201/non-200 status", async () => {
    await expect(createContact({
      apiKey: "key",
      email: "test@example.com",
      fetch: async () => new Response(JSON.stringify({ code: "invalid_parameter", message: "Bad request" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    })).rejects.toEqual({
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: "Bad request (invalid_parameter)",
    });
  });

  test("falls back to a generic message when the provider returns no error body", async () => {
    await expect(createContact({
      apiKey: "key",
      email: "test@example.com",
      fetch: async () => new Response("", { status: 500 }),
    })).rejects.toEqual({
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: "Brevo rejected the request.",
    });
  });

  test("filters non-number listIds in validated payload", () => {
    const result = createContact({
      email: "test@example.com",
      listIds: [2, "bad", null, 3] as unknown[],
    });

    expect(result.validated?.listIds).toEqual([2, 3]);
  });
});
