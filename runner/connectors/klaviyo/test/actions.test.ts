import { describe, expect, it } from "bun:test";
import { createContact } from "../src/actions";
import createContactFixture from "../fixtures/create_contact.json";

function createMockFetch(status: number, body: unknown) {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      })
    );
}

describe("createContact action", () => {
  it("validates input without apiKey", () => {
    const result = createContact({ email: "test@example.com" });
    expect(result.connector).toBe("klaviyo");
    expect(result.action).toBe("contacts.create");
    expect((result as any).validated.email).toBe("test@example.com");
  });

  it("includes optional fields in validated output", () => {
    const result = createContact({
      email: "test@example.com",
      firstName: "Test",
      lastName: "User",
      phone: "+1-555-0000",
    });
    const validated = (result as any).validated;
    expect(validated.firstName).toBe("Test");
    expect(validated.lastName).toBe("User");
    expect(validated.phone).toBe("+1-555-0000");
  });

  it("throws when email is missing", () => {
    expect(() => createContact({})).toThrow("email is required");
  });

  it("throws when email is empty string", () => {
    expect(() => createContact({ email: "" })).toThrow("email is required");
  });

  it("throws for non-object input", () => {
    expect(() => createContact("not an object")).toThrow("input must be an object");
  });

  it("creates contact with apiKey via mock fetch (201)", async () => {
    const fetch = createMockFetch(201, createContactFixture);
    const result = await createContact({
      apiKey: "test-api-key",
      email: "new@test.com",
      fetch,
    });
    expect(result.connector).toBe("klaviyo");
    expect(result.action).toBe("contacts.create");
    expect((result as any).contact.id).toBe("kl-contact:new1");
    expect((result as any).contact.email).toBe("new@test.com");
    expect((result as any).contact.firstName).toBe("New");
    expect((result as any).contact.lastName).toBe("User");
  });

  it("creates contact with apiKey via mock fetch (200)", async () => {
    const fetch = createMockFetch(200, createContactFixture);
    const result = await createContact({
      apiKey: "test-api-key",
      email: "new@test.com",
      fetch,
    });
    expect((result as any).contact.id).toBe("kl-contact:new1");
  });

  it("throws rate limit error on 429", async () => {
    const fetch = createMockFetch(429, { errors: [{ status: 429, title: "Rate Limited" }] });
    try {
      await createContact({ apiKey: "test-key", email: "test@example.com", fetch });
      expect(true).toBe(false); // should not reach
    } catch (err: any) {
      expect(err.code).toBe("CONNECTOR_RATE_LIMITED");
      expect(err.message).toContain("rate limit");
      expect(err.retryAfterSeconds).toBe(30);
    }
  });

  it("throws upstream error on unexpected status", async () => {
    const fetch = createMockFetch(500, { errors: [{ status: 500, title: "Server Error" }] });
    try {
      await createContact({ apiKey: "test-key", email: "test@example.com", fetch });
      expect(true).toBe(false); // should not reach
    } catch (err: any) {
      expect(err.code).toBe("CONNECTOR_UPSTREAM_ERROR");
      expect(err.message).toContain("rejected");
    }
  });
});
